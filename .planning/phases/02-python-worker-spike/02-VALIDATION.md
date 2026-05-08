---
phase: 2
slug: python-worker-spike
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

<!-- Wave 0 wird durch Plan 02-01 geliefert (Spike-Hybrid-Muster):
     Plan 02-01 übernimmt die Wave-0-Rolle und liefert Dockerfile, environment.yml,
     requirements.txt, .env.example und testdata/sample.step als Fundament für
     alle nachfolgenden Plans. nyquist_compliant=true ist korrekt für dieses Muster. -->

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Kein formales Framework (Spike) — direktes Skript-Ausführen via Docker |
| **Config file** | kein pytest.ini — manuelle Verifikation via Ausgabe und Dateiinspektion |
| **Quick run command** | `docker build -t bauteil-worker worker/ && docker run --rm bauteil-worker python test_renderer.py` |
| **Full suite command** | `docker run --rm --env-file worker/.env bauteil-worker python process_step.py <test-part-id>` |
| **Estimated runtime** | ~60–120 Sekunden (inkl. Docker-Build + DINOv2-Inferenz) |

---

## Sampling Rate

- **Nach jedem Task-Commit:** Schneller Renderer-Test: `docker run --rm bauteil-worker python test_renderer.py`
- **Nach jeder Wave:** Vollständiger End-to-End-Test mit echter STEP-Datei + DB-Verifikation
- **Vor `/gsd-verify-work`:** Alle 5 Success Criteria aus ROADMAP.md erfüllt
- **Max feedback latency:** 120 Sekunden

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | INGEST-03 | — | Secrets nicht in Dockerfile; nur .env.example committed | Smoke | `docker build -t bauteil-worker worker/ && echo BUILD_OK` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | INGEST-03 | — | OSMesa ohne DISPLAY-Variable | Smoke | `docker run --rm bauteil-worker python test_renderer.py` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 2 | INGEST-03 | D-08 | Face-Count < 4 = INVALID_GEOMETRY, kein Embedding | Unit | `docker run --rm bauteil-worker python -c "from renderer import validate_step; validate_step('/testdata/empty.step')"` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 2 | INGEST-03 | — | 8 PNGs in /tmp erzeugt; format 512×512 und 224×224 | Smoke | `docker run --rm bauteil-worker python test_renderer.py && ls /tmp/views/*.png \| wc -l` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | INGEST-03 | — | DINOv2 erzeugt 768-dim Vektor | Smoke | `docker run --rm bauteil-worker python -c "from embedder import get_embedding; e=get_embedding('/tmp/view_0.png'); assert e.shape==(768,), f'{e.shape}'"` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 3 | INGEST-03 | — | Embedding + Thumbnails in DB/S3 geschrieben | Integration | `docker run --rm --env-file worker/.env bauteil-worker python process_step.py <test-uuid>` → psql `SELECT status,embedding IS NOT NULL FROM parts WHERE id='<uuid>'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `worker/test_renderer.py` — isolierter OSMesa-Smoketest (VTK-Rendering ohne DISPLAY)
- [ ] `worker/testdata/sample.step` — einfache Testdatei (Würfel oder Schraube, < 1 MB)
- [ ] `worker/Dockerfile` — continuumio/miniconda3 Basis mit OSMesa-Paketen
- [ ] `worker/.env.example` — alle benötigten Env-Vars dokumentiert (DATABASE_URL, AWS_*)
- [ ] `worker/requirements.txt` (oder conda environment.yml) — gepinnte Versionen

*Wave 0 ist die Voraussetzung für alle weiteren Tasks: kein Rendering-Smoketest = kein Weiterarbeiten.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visuelle Überprüfung der 8 generierten PNGs | INGEST-03 | Bildqualität (Hintergrundfarbe, Bauteil sichtbar, korrekter Winkel) kann nicht automatisch bewertet werden | `docker cp <container_id>:/tmp/views/ ./local_views/ && open ./local_views/` |
| DINOv2-CPU-Inferenzzeit | INGEST-03 | Benchmarking braucht manuelle Auswertung der Laufzeit auf dem Zielsystem | Zeitstempel vor/nach DINOv2-Batch in process_step.py loggen; `docker logs` auswerten |
| Cosine-Similarity-Abfrage via psql | INGEST-03 | SQL-Query gegen Neon erfordert manuellen psql-Zugriff (echte Credentials in worker/.env) | `psql $DATABASE_URL -c "SELECT id, 1-(embedding <=> (SELECT embedding FROM parts WHERE id='<uuid>')) AS sim FROM parts ORDER BY sim DESC LIMIT 5;"` |

---

## Validation Sign-Off

- [ ] Alle Tasks haben automatisierten Verify-Befehl oder Wave-0-Abhängigkeit
- [ ] Sampling-Kontinuität: maximal 2 aufeinanderfolgende Tasks ohne automatisierten Verify
- [ ] Wave 0 deckt alle MISSING-Referenzen ab
- [ ] Keine Watch-Mode-Flags in Verify-Befehlen
- [ ] Feedback-Latenz < 120s
- [ ] `nyquist_compliant: true` im Frontmatter setzen wenn alle Punkte erfüllt

**Approval:** pending
