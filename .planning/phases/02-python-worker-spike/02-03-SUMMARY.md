---
phase: 02-python-worker-spike
plan: 03
subsystem: worker
tags: [python, dinov2, transformers, pgvector, psycopg2, boto3, embeddings, pipeline]
dependency_graph:
  requires: [02-01-docker-infrastructure, 02-02-renderer]
  provides: [worker/embedder.py, worker/process_step.py]
  affects: [03-ingestion-api]
tech_stack:
  added: [transformers>=4.41, pgvector>=0.3, psycopg2-binary>=2.9, boto3>=1.34]
  patterns: [DINOv2-CLS-Token-Embedding, Mean-Pool-8-Views, pgvector-register_vector, S3-Upload-boto3, Status-Transition-Pattern]
key_files:
  created:
    - worker/embedder.py
    - worker/process_step.py
  modified: []
decisions:
  - "CLS-Token (Index 0) statt Mean-Pool der Patch-Tokens für Embedding — RESEARCH.md A1 empfohlen"
  - "DINOv2-Modell beim Modulimport geladen (nicht pro Aufruf) — RESEARCH.md Anti-Pattern vermieden"
  - "S3-URL-Format s3://{bucket}/{key} — Phase 5 wandelt in presigned URLs um"
  - "VTK_DEFAULT_OPENGL_WINDOW in Zeile 8 von process_step.py — vor allen OCC-Imports"
metrics:
  duration: "80 Sekunden (reine Datei-Erstellungszeit; End-to-End-Test erfordert Credentials)"
  completed: "2026-05-08"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 03: DINOv2-Embedding + Pipeline-Integration Summary

**One-liner:** embedder.py kapselt DINOv2 ViT-B/14 CLS-Token-Inferenz (768-dim, mean_pool über 8 Views); process_step.py verbindet S3-Download, STEP-Validierung, 8-View-Rendering, S3-Upload und pgvector-DB-Schreiben zur vollständigen Pipeline.

## Was wurde gebaut

### worker/embedder.py

DINOv2-Inferenz-Modul mit zwei exportierten Funktionen:

1. **`get_embedding(image_path: str) -> np.ndarray`**
   - Lädt PNG, resize auf 224x224px vor AutoImageProcessor (D-06)
   - DINOv2 ViT-B/14 Forward-Pass mit `torch.no_grad()`
   - CLS-Token: `outputs.last_hidden_state[:, 0].squeeze()` → Shape (768,)
   - Assert auf (768,) Shape als Sicherheitsnetz

2. **`mean_pool(embeddings: list) -> np.ndarray`**
   - `np.stack(embeddings)` → Shape (N, 768)
   - `np.mean(axis=0)` → Shape (768,)
   - Arithmetisches Mittel über alle 8 View-Embeddings (D-07)

**Modell-Loading:** Einmalig beim Modulimport via `AutoImageProcessor.from_pretrained("facebook/dinov2-base")` und `AutoModel.from_pretrained("facebook/dinov2-base")`. TRANSFORMERS_CACHE=/app/model_cache im Dockerfile — kein Download zur Laufzeit.

### worker/process_step.py

Vollständiges Pipeline-Skript mit `process(part_id: str)` Funktion:

**Pipeline-Ablauf (7 Schritte):**
1. DB: `status = 'processing'` + Commit (sofort, vor S3-Operationen)
2. S3: `{part_id}/original.step` aus BUCKET_STEPS herunterladen
3. STEP laden + Geometrievalidierung (face_count >= 4, BBox-Volumen > 1e-6)
4. 8 Views rendern via `renderer.render_views()` → view_0.png..view_7.png
5. S3: PNGs nach `{part_id}/view_{i}.png` in BUCKET_THUMBNAILS hochladen
6. DINOv2: 8 × `get_embedding()` + `mean_pool()` → 768-dim Vektor
7. DB: `UPDATE parts SET embedding=%s, embedding_model='dinov2-base', embedding_version='facebook/dinov2-base', thumbnail_urls=%s, status='ready'`

**Fehlerbehandlung:**
- `ValueError` (INVALID_GEOMETRY:*): `status='failed'` in DB + Fehlercode in Log
- Alle anderen Exceptions: `status='failed'` in DB + vollständiger Traceback + `raise`
- Beide except-Blöcke haben eigenen try/except für den DB-Update (kein Absturz bei DB-Fehler im Fehlerfall)

**Kritische Patterns:**
- `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"` in Zeile 8 (vor OCC-Imports, RESEARCH.md Pitfall 1)
- `register_vector(conn)` unmittelbar nach Verbindungsaufbau (pgvector-Pflicht)
- Alle Env-Vars via `os.environ["KEY"]` (kein `.get()`, Fail-Fast)

## End-to-End-Test (ausstehend — erfordert Credentials)

Docker war wie in Plan 01 und 02 nicht verfügbar. Die vollständige Verifikation der ROADMAP-Erfolgskriterien SC#2 und SC#3 erfordert echte Credentials in `worker/.env`:

```bash
# Voraussetzungen:
# 1. Docker-Build (falls noch nicht geschehen): docker build -t bauteil-worker worker/
# 2. DB-Eintrag anlegen:
psql $DATABASE_URL -c "INSERT INTO parts (id, name, part_number, project, status, sha256, original_filename, step_file_path) VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'Test Würfel', 'TEST-001', 'Phase-2-Spike', 'pending', 'test-sha256', 'sample.step', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/original.step');"
# 3. STEP-Datei in S3 hochladen:
aws s3 cp worker/testdata/sample.step s3://parts-steps/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/original.step

# Pipeline ausführen:
docker run --rm --env-file worker/.env bauteil-worker python process_step.py aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

# DB-Verifikation (Erwartung: ready | t | 8):
psql $DATABASE_URL -c "SELECT status, embedding IS NOT NULL AS has_embedding, array_length(thumbnail_urls, 1) AS thumb_count FROM parts WHERE id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';"

# pgvector cosine-similarity (Erwartung: similarity ≈ 1.0):
psql $DATABASE_URL -c "SELECT id, 1-(embedding <=> (SELECT embedding FROM parts WHERE id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')) AS sim FROM parts WHERE id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';"
```

## Automatisierte Strukturprüfung (ohne Credentials)

```
=== embedder.py ===
def get_embedding(image_path: str) -> np.ndarray:  ✓ Zeile 24
def mean_pool(embeddings: list) -> np.ndarray:       ✓ Zeile 54
_MODEL_NAME = "facebook/dinov2-base"                 ✓ Zeile 16
outputs.last_hidden_state[:, 0]                      ✓ Zeile 48
.resize((224, 224))                                  ✓ Zeile 39

=== process_step.py ===
import os / VTK_DEFAULT_OPENGL_WINDOW               ✓ Zeilen 7-8
register_vector(conn)                                ✓ Zeile 83
set_status(..., "processing")                        ✓ Zeile 87
status = 'ready'                                     ✓ Zeile 141
set_status(..., "failed") in ValueError-Block        ✓ Zeile 160
set_status(..., "failed") in Exception-Block         ✓ Zeile 171
"facebook/dinov2-base"                               ✓ Zeile 146 (embedding_version)
"dinov2-base"                                        ✓ Zeile 145 (embedding_model)
f"{part_id}/view_{i}.png"                            ✓ Zeile 114
from renderer import load_step, validate_geometry, render_views  ✓ Zeile 20
from embedder import get_embedding, mean_pool        ✓ Zeile 21
```

## ROADMAP Erfolgskriterien — Implementierungsstatus

| SC | Kriterium | Status |
|----|-----------|--------|
| SC#1 | STEP-Datei → 8 PNG-Thumbnails (renderer.py) | Implementiert in Plan 02-02 |
| SC#2 | DINOv2 ViT-B/14 → 768-dim Embedding (mean_pool 8 Views) | Implementiert in embedder.py |
| SC#3 | Embedding in Neon + pgvector cosine-similarity ≈ 1.0 | Implementiert in process_step.py — Verifikation ausstehend (erfordert Credentials) |
| SC#4 | face_count < 4 → status='failed' + INVALID_GEOMETRY:face_count=N | Implementiert in renderer.py (Plan 02-02) + process_step.py |
| SC#5 | FastAPI health endpoint + Celery | Per D-10 deferred auf Phase 3 |

## Deviations from Plan

### Keine Abweichungen

Beide Dateien entsprechen exakt dem Plan-Code (task action-Code). Keine Bugs, keine fehlenden Patterns, keine Architekturänderungen notwendig.

## Known Stubs

Keine. Beide Module implementieren ihre Funktionen vollständig. Der End-to-End-Test (SC#3) erfordert echte Credentials — das ist kein Stub sondern eine externe Abhängigkeit (Neon DATABASE_URL + AWS-Credentials).

## Threat Flags

Kein neues Bedrohungspotenzial über das plan-definierte Threat-Model (T-02-10 bis T-02-14) hinaus.

## Self-Check: PASSED

- [x] worker/embedder.py existiert: `/Users/mbieling/claude/Objekterkennung/worker/embedder.py`
- [x] worker/process_step.py existiert: `/Users/mbieling/claude/Objekterkennung/worker/process_step.py`
- [x] Task 1 Commit: 8d1af41 (feat(02-03): embedder.py)
- [x] Task 2 Commit: 4fa266e (feat(02-03): process_step.py)
- [x] embedder.py: get_embedding, mean_pool, _MODEL_NAME, last_hidden_state[:, 0], resize((224,224))
- [x] process_step.py: VTK_DEFAULT_OPENGL_WINDOW Zeile 8, register_vector, processing/ready/failed, facebook/dinov2-base, view_{i}.png
- [ ] Docker-Verifikation: ausstehend (Docker nicht installiert — identisch mit Plan 01 + 02)
- [ ] End-to-End-Test: ausstehend (Credentials in worker/.env erforderlich)
