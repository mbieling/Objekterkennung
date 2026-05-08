---
phase: 02-python-worker-spike
verified: 2026-05-08T05:52:34Z
status: human_needed
score: 3/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Docker-Build und Container-Laufzeit verifiziert (alle SC#1–SC#4 End-to-End)"
    status: failed
    reason: "Docker ist auf dem Entwickler-Host nicht installiert. Kein einziger Container-Lauf hat stattgefunden. Alle SUMMARY.md-Dokumente bestätigen explizit 'Docker-Verifikation ausstehend'."
    artifacts:
      - path: "worker/Dockerfile"
        issue: "Korrekt erstellt, aber nie gebaut — docker build wurde nie ausgeführt"
      - path: "worker/renderer.py"
        issue: "Nicht im Container getestet — RENDERER_OK wurde nie empirisch bestätigt"
      - path: "worker/embedder.py"
        issue: "DINOv2-Inferenz im Container nie ausgeführt"
      - path: "worker/process_step.py"
        issue: "End-to-End-Pipeline nie ausgeführt (kein Docker, keine Credentials)"
    missing:
      - "docker build -t bauteil-worker worker/ mit Exit 0"
      - "docker run --rm bauteil-worker python test_renderer.py gibt RENDERER_OK: 8 PNGs generated aus"
      - "End-to-End-Test mit echten Credentials: process_step.py setzt status='ready' + embedding in DB"
      - "pgvector cosine-similarity Query gibt similarity ≈ 1.0 zurück"
  - truth: "Embedding-Strategie entspricht CLAUDE.md-Architekturentscheidung (mean-pool)"
    status: failed
    reason: "CLAUDE.md definiert 'mean-pool aus 6–8 Views' als Architekturentscheidung. embedder.py.get_embedding() verwendet CLS-Token (last_hidden_state[:, 0]) statt Mean-Pool der Patch-Tokens ([:, 1:]). Code-Review CR-03 identifiziert dies als kritischen Defekt. Hinweis: 'mean-pool aus 6–8 Views' in CLAUDE.md bezieht sich auf die Aggregation über mehrere Views — nicht auf die Patch-Token-Ebene. Die Ambiguität muss geklärt werden, aber der Code weicht von der im Code-Review dokumentierten Architekturabsicht ab."
    artifacts:
      - path: "worker/embedder.py"
        issue: "Zeile 48: outputs.last_hidden_state[:, 0] (CLS-Token) statt [:, 1:].mean(dim=1) (Patch-Mean-Pool)"
    missing:
      - "Architekturentscheidung klären: CLS-Token oder Patch-Mean-Pool?"
      - "Falls Patch-Mean-Pool: get_embedding() korrigieren auf outputs.last_hidden_state[:, 1:].mean(dim=1)"
human_verification:
  - test: "Docker-Build durchführen: docker build -t bauteil-worker worker/"
    expected: "Build endet mit Exit 0. Kein Fehler bei apt-get install (libgl1-mesa-glx auf Debian Bookworm prüfen — ggf. auf libgl1 umstellen). DINOv2-Modell wird beim Build gecacht."
    why_human: "Docker nicht auf Entwickler-Host installiert — kann nicht automatisch verifiziert werden"
  - test: "Renderer-Smoketest: docker run --rm bauteil-worker python test_renderer.py"
    expected: "Ausgabe enthält 'RENDERER_OK: 8 PNGs generated'. Tests A, B, C zeigen alle OK. Exit-Code 0."
    why_human: "Erfordert laufenden Docker-Container mit OSMesa-Umgebung"
  - test: "End-to-End-Pipeline: DB-Eintrag anlegen, STEP nach S3 hochladen, docker run --rm --env-file worker/.env bauteil-worker python process_step.py <test-uuid>"
    expected: "Log zeigt pending → processing → ready. DB-Query SELECT status, embedding IS NOT NULL, array_length(thumbnail_urls,1) FROM parts WHERE id='<uuid>' gibt 'ready | true | 8' zurück."
    why_human: "Erfordert Docker + echte AWS- und Neon-Credentials in worker/.env"
  - test: "pgvector cosine-similarity: SELECT 1-(embedding <=> (SELECT embedding FROM parts WHERE id='<uuid>')) AS sim FROM parts WHERE id='<uuid>'"
    expected: "similarity ≈ 1.0 (Eigenähnlichkeit)"
    why_human: "Erfordert End-to-End-Test (obiger Schritt) als Voraussetzung"
  - test: "Embedding-Strategie klären und ggf. korrigieren (CR-03)"
    expected: "Entscheidung dokumentiert: CLS-Token (akzeptiert) oder Patch-Mean-Pool (korrigiert). Bei Korrektur: neuer Container-Lauf bestätigt shape (768,)."
    why_human: "Architekturentscheidung erfordert menschliche Klärung (CLAUDE.md-Ambiguität)"
---

# Phase 2: Python Worker Spike — Verifikationsbericht

**Phase-Ziel:** Die Python-STEP-Rendering- und DINOv2-Embedding-Pipeline ist als eigenständiger Docker-Container end-to-end validiert, bevor UI- oder Ingestion-Code davon abhängt.
**Verifiziert:** 2026-05-08T05:52:34Z
**Status:** human_needed
**Re-Verifikation:** Nein — initiale Verifikation

---

## Phasen-Ziel-Bewertung

Das Schlüsselwort im Phasen-Ziel ist **"validated"** — die Pipeline muss nicht nur implementiert, sondern als Docker-Container end-to-end verifiziert sein. Alle drei SUMMARY.md-Dokumente bestätigen unisono: "Docker-Verifikation ausstehend". Der Docker-Build wurde nie ausgeführt, kein Container-Lauf hat stattgefunden. Die Code-Artefakte sind substantiell implementiert (kein Stub-Problem), aber das Validierungsziel der Phase ist definitiv nicht erreicht.

---

## Beobachtbare Wahrheiten (ROADMAP Erfolgskriterien)

| # | Wahrheit (ROADMAP SC) | Status | Befund |
|---|----------------------|--------|--------|
| SC#1 | STEP-Datei → 6–8 orthografische PNG-Thumbnails im Docker-Container | ? UNGEWISS | Code korrekt implementiert (renderer.py, test_renderer.py), aber kein Container-Lauf durchgeführt — empirisch nicht bestätigt |
| SC#2 | DINOv2 ViT-B/14 → 768-dim Embedding, mean-pooled über alle Views | TEILWEISE | mean_pool() über 8 Views korrekt (768-dim). get_embedding() verwendet CLS-Token statt Patch-Mean-Pool — weicht von Code-Review-Interpretation der Architekturentscheidung ab (CR-03). Nie im Container ausgeführt. |
| SC#3 | Embedding in Neon geschrieben + pgvector cosine-similarity Query korrekt | NICHT VERIFIZIERT | Nie ausgeführt (kein Docker, keine DB-Credentials) |
| SC#4 | Leere/fehlerhafte STEP-Dateien abgelehnt mit face_count und BBox-Validierung | TEILWEISE | Code vorhanden und korrekt (validate_geometry mit 2 Checks). Test-C in test_renderer.py prüft face_count < 4. Nie im Container ausgeführt. |
| SC#5 | FastAPI health endpoint + Celery — per D-10 auf Phase 3 verschoben | BESTÄTIGT DEFERRED | Korrekt: Alle PLANs dokumentieren D-10 explizit. |

**Automatisiert verifizierte Wahrheiten: 1/5** (SC#5 als gültig deferred)
**Durch Code-Analyse gestützt, aber unbewiesen: 3/5** (SC#1, SC#2 teilw., SC#4 teilw.)
**Blockiert durch fehlendes Docker: 3/5** (SC#1, SC#2, SC#3, SC#4 alle unfertig)

---

## Artefakt-Verifikation (3 Ebenen)

### Level 1: Existenz

| Artefakt | Existiert | Größe/Inhalt |
|----------|-----------|--------------|
| `worker/Dockerfile` | JA | 33 Zeilen, vollständig |
| `worker/environment.yml` | JA | pythonocc-core=7.9.3 |
| `worker/requirements.txt` | JA | vtk>=9.4, kein pythonocc |
| `worker/.env.example` | JA | Alle 6 Env-Vars |
| `worker/testdata/sample.step` | JA | 4698 Bytes, ISO-10303-21 Header, 6 ADVANCED_FACEs |
| `worker/renderer.py` | JA | 101 Zeilen |
| `worker/test_renderer.py` | JA | ~100 Zeilen |
| `worker/embedder.py` | JA | 67 Zeilen |
| `worker/process_step.py` | JA | 189 Zeilen |

### Level 2: Substanz (nicht Stub)

| Artefakt | Substanz | Befund |
|----------|----------|--------|
| `worker/Dockerfile` | SUBSTANTIELL | Multi-Layer-Build mit conda+pip+DINOv2-Cache. Potentielles Problem: `libgl1-mesa-glx` auf Debian Bookworm ggf. veraltet (IN-01 aus Code-Review) |
| `worker/renderer.py` | SUBSTANTIELL | load_step(), validate_geometry(), render_views() vollständig implementiert. VTK-Env-Var in Zeile 4. VIEWS-Liste mit 8 Einträgen. Kein Viewer.Close() (CR-02). |
| `worker/test_renderer.py` | SUBSTANTIELL | 3 Subtests (A: OSMesa-Basis, B: STEP-8-View, C: Geometrievalidierung). RENDERER_OK-String vorhanden. |
| `worker/embedder.py` | SUBSTANTIELL (mit Abweichung) | get_embedding() und mean_pool() vorhanden. CLS-Token statt Patch-Mean-Pool (CR-03). |
| `worker/process_step.py` | SUBSTANTIELL | Vollständige 7-Schritt-Pipeline. register_vector(), status-Transitionen (processing/ready/failed), keine UUID-Validierung (CR-01). |
| `worker/testdata/sample.step` | SUBSTANTIELL | 6 ADVANCED_FACEs in CLOSED_SHELL. Valide ISO-10303-21-Struktur. Ob pythonOCC es korrekt lädt: unbestätigt (kein Docker). |

### Level 3: Verdrahtung

| Von | Nach | Via | Status | Befund |
|-----|------|-----|--------|--------|
| `Dockerfile` | `environment.yml` | conda env update | VERDRAHTET | Zeile 19: `conda env update -n base -f environment.yml` |
| `Dockerfile` | `requirements.txt` | pip install -r | VERDRAHTET | Zeile 23: `pip install --no-cache-dir -r requirements.txt` |
| `Dockerfile` | `facebook/dinov2-base` | TRANSFORMERS_CACHE + RUN | VERDRAHTET | Zeilen 27-30 korrekt |
| `test_renderer.py` | `renderer.py` | from renderer import | VERDRAHTET | Zeile 18: `from renderer import load_step, validate_geometry, render_views, VIEWS` |
| `process_step.py` | `renderer.py` | from renderer import | VERDRAHTET | Zeile 20: korrekt |
| `process_step.py` | `embedder.py` | from embedder import | VERDRAHTET | Zeile 21: korrekt |
| `process_step.py` | Neon parts-Tabelle | psycopg2 + register_vector + UPDATE | VERDRAHTET | Zeile 83: register_vector(conn), Zeile 135-149: vollständiges UPDATE |
| `process_step.py` | S3 BUCKET_THUMBNAILS | boto3 upload_fileobj | VERDRAHTET | Zeile 116-121: korrekt mit f"{part_id}/view_{i}.png" |

---

## Schlüssel-Link-Verifikation

Alle 4 PLAN-03-Key-Links vorhanden und korrekt verdrahtet (Level-3-Tabelle oben).

---

## Anforderungsabdeckung

| Anforderung | Quelle-Plan | Beschreibung | Status | Befund |
|-------------|-------------|--------------|--------|--------|
| INGEST-03 | 02-01, 02-02, 02-03 | System erzeugt automatisch 6–8 orthografische 3D-Thumbnails beim Ingest | UNBESTÄTIGT | Implementierung vorhanden (render_views, 8 PNGs). Nie im Container ausgeführt. End-to-End-Beweis fehlt. |

---

## Gefundene Anti-Patterns

| Datei | Zeile | Pattern | Schwere | Auswirkung |
|-------|-------|---------|---------|------------|
| `worker/process_step.py` | 93, 114 | Path Traversal: part_id ohne UUID-Validierung als S3-Key | BLOCKER (CR-01) | Angreifer mit Container-Zugang kann beliebige S3-Keys adressieren |
| `worker/renderer.py` | 84-100 | Viewer-Ressourcenleak: Viewer3d nie geschlossen | WARNUNG (CR-02) | Prozessabsturz bei Batch-Verarbeitung von N > 30 Bauteilen |
| `worker/embedder.py` | 48 | CLS-Token statt Patch-Mean-Pool | WARNUNG/BLOCKER (CR-03) | Suboptimale Retrieval-Qualität für geometrische Ähnlichkeit; weicht von Architekturabsicht ab |
| `worker/Dockerfile` | 5 | libgl1-mesa-glx veraltet auf Debian Bookworm | WARNUNG (IN-01) | Docker-Build schlägt möglicherweise fehl oder OSMesa fehlt |
| `worker/Dockerfile` | 27 | TRANSFORMERS_CACHE deprecated ab transformers>=4.36 | WARNUNG (WR-02) | Laufzeit-Download ~330 MB möglich bei zukünftigen transformers-Versionen |
| `worker/process_step.py` | 34-35 | Env-Vars auf Modulebene ausgelesen (nicht in process()) | INFO | Import schlägt fehl wenn Env-Vars nicht gesetzt — PLAN-03 Acceptance-Criteria erfordert Import ohne Env-Vars |
| `worker/Dockerfile` | 33 | Kein .dockerignore — model_cache/ wird ggf. doppelt ins Image kopiert | INFO (IN-02) | Potenziell +330 MB unnötiger Image-Layer |

**Hinweis zu CR-01 (Path Traversal):** Das Code-Review bewertet dies als kritisch. Im Spike-Kontext (manuell ausgeführt mit bekannter UUID) ist das Risiko gering — aber die Phase dokumentiert die Pipeline als Grundlage für Phase 3 (Celery-Queue, automatisch enqueued). Die Schwachstelle muss vor Phase 3 behoben sein.

**Hinweis zu BUCKET_STEPS/BUCKET_THUMBNAILS auf Modulebene (Zeilen 34-35):** Diese werden beim Modul-Import ausgelesen. Das PLAN-03 Acceptance-Criterion verlangt `import process_step` ohne Env-Vars ohne Fehler — dieses Kriterium wird NICHT erfüllt, weil `os.environ["AWS_S3_BUCKET_STEPS"]` beim Import einen KeyError wirft wenn die Env-Var nicht gesetzt ist.

---

## Behavioral Spot-Checks (Step 7b)

Docker nicht verfügbar — alle Container-basierten Checks übersprungen.

Grep-basierte Strukturprüfungen (ohne Docker):

| Verhalten | Check | Ergebnis | Status |
|-----------|-------|----------|--------|
| VTK-Env-Var vor OCC-Imports in renderer.py | grep -n zeigt Zeile 4 | Zeile 4: `os.environ["VTK_DEFAULT_OPENGL_WINDOW"]` | PASS |
| VTK-Env-Var vor OCC-Imports in process_step.py | grep -n zeigt Zeile 8 | Zeile 8: korrekt vor allen Imports | PASS |
| register_vector() in process_step.py | grep -n | Zeile 83: `register_vector(conn)` — unmittelbar nach connect() | PASS |
| status='processing' als erster DB-Schritt | grep -n | Zeile 87: set_status(cur, part_id, "processing") | PASS |
| sample.step hat 6 ADVANCED_FACEs | grep ADVANCED_FACE | 6 Einträge in CLOSED_SHELL | PASS |
| worker/.env in .gitignore | grep | Zeile 32: worker/.env eingetragen | PASS |
| UUID-Validierung vor S3-Key-Konstruktion | grep uuid/UUID/re.match | NICHT VORHANDEN | FAIL (CR-01) |
| Viewer.Close()/Remove() nach render_views() | grep Close/Remove/del | NICHT VORHANDEN | FAIL (CR-02) |
| Patch-Mean-Pool statt CLS-Token | grep last_hidden_state | `[:, 0]` (CLS) statt `[:, 1:]` (Patch) | FAIL (CR-03) |
| BUCKET_STEPS nicht auf Modulebene | grep Zeile 34-35 | Auf Modulebene — Import schlägt fehl ohne Env-Vars | FAIL |

---

## Human-Verifikation erforderlich

### 1. Docker-Build

**Test:** `docker build -t bauteil-worker worker/`
**Erwartet:** Exit 0. Prüfen ob `libgl1-mesa-glx` auf Debian Bookworm funktioniert (ggf. auf `libgl1` umstellen). DINOv2-Modell ~330 MB wird gecacht.
**Warum Human:** Docker nicht auf Entwickler-Host installiert.

### 2. OSMesa-Renderer-Smoketest

**Test:** `docker run --rm bauteil-worker python test_renderer.py`
**Erwartet:** Alle drei Subtests OK. Ausgabe: `RENDERER_OK: 8 PNGs generated`. Exit-Code 0.
**Warum Human:** Erfordert laufenden Container mit OSMesa.

### 3. End-to-End-Pipeline

**Test:** DB-Eintrag anlegen, STEP nach S3 (`parts-steps/<uuid>/original.step`), dann `docker run --rm --env-file worker/.env bauteil-worker python process_step.py <uuid>`
**Erwartet:** Log: processing → ready. DB-Check: `status=ready, embedding IS NOT NULL, array_length(thumbnail_urls,1)=8`.
**Warum Human:** Erfordert Docker + Neon-Credentials + AWS-Credentials.

### 4. pgvector-Eigenähnlichkeit

**Test:** `SELECT 1-(embedding <=> (SELECT embedding FROM parts WHERE id='<uuid>')) AS sim FROM parts WHERE id='<uuid>'`
**Erwartet:** sim ≈ 1.0
**Warum Human:** Setzt erfolgreichen End-to-End-Test voraus.

### 5. Architekturentscheidung CR-03 klären

**Test:** Entwickler entscheidet: CLS-Token (akzeptabel für diesen Spike) oder Patch-Mean-Pool (CLAUDE.md-Absicht)?
**Erwartet:** Entscheidung dokumentiert. Falls Patch-Mean-Pool: `get_embedding()` korrigieren auf `outputs.last_hidden_state[:, 1:].mean(dim=1)`.
**Warum Human:** Architekturambiguität — CLAUDE.md sagt "mean-pool aus 6–8 Views" (Views-Aggregation), Code-Review interpretiert dies als Patch-Token-Mean-Pool. Beide Varianten liefern shape (768,).

---

## Lücken-Zusammenfassung

**Wurzel-Ursache aller Lücken:** Docker war nie auf dem Entwickler-Host installiert. Das Phase-Ziel ("validated end-to-end as a standalone Docker container") setzt einen laufenden Container voraus — dieser Beweis fehlt vollständig.

**Lücke 1 — Docker-Verifikation (BLOCKER für Phasen-Ziel):**
Alle Code-Artefakte sind substantiell implementiert. Aber "validated" bedeutet empirisch bestätigt, nicht "Code existiert". Kein Docker-Build, kein Container-Lauf, kein RENDERER_OK, kein DB-Write.

**Lücke 2 — Embedding-Strategie (WARNUNG, aber architekturrelevant):**
CLAUDE.md schreibt "mean-pool aus 6–8 Views" vor — das ist die Views-Aggregation und wird von `mean_pool()` korrekt umgesetzt. Strittig ist die Patch-Token-Ebene: `get_embedding()` verwendet CLS-Token. Code-Review CR-03 bewertet dies als kritischen Defekt. Klärung ist vor Phase 6 (Search Pipeline) nötig, da die Embedding-Qualität die Retrieval-Qualität direkt beeinflusst.

**Lücke 3 — Path Traversal (SICHERHEITSBLOCKER für Phase 3):**
`part_id` wird ohne UUID-Validierung als S3-Key verwendet. Im isolierten Spike (manuell, bekannte UUID) unkritisch. Muss vor Phase 3 (Celery-Queue, automatisch dispatched) behoben sein.

**Lücke 4 — process_step.py Import schlägt fehl ohne Env-Vars:**
`BUCKET_STEPS = os.environ["AWS_S3_BUCKET_STEPS"]` auf Modulebene (Zeile 34) bewirkt KeyError beim `import process_step` ohne gesetzte Env-Vars. PLAN-03 Acceptance-Criteria formuliert explizit: "import process_step; print('IMPORT_OK')" soll ohne Env-Vars funktionieren. Dieses Kriterium ist nicht erfüllt.

---

## Deferred Items

| # | Item | Verschoben auf | Befund |
|---|------|---------------|--------|
| 1 | FastAPI health endpoint + Celery Queue | Phase 3 | Per D-10 explizit verschoben. In allen 3 PLANs und SUMMARYs dokumentiert. |

---

_Verifiziert: 2026-05-08T05:52:34Z_
_Verifier: Claude (gsd-verifier)_
