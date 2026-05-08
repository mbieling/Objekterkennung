---
phase: 3
slug: ingestion-api-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Next.js) + pytest (Python Worker) |
| **Config file** | `vitest.config.ts` / `worker/pytest.ini` oder `pyproject.toml` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && cd worker && python -m pytest tests/ -v` |
| **Estimated runtime** | ~30–60 Sekunden |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run && cd worker && python -m pytest tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-W0-01 | W0 | 0 | INGEST-04 | CR-01 | UUID-Validierung blockiert Path Traversal | unit | `cd worker && python -m pytest tests/test_process_step.py -v` | ❌ W0 | ⬜ pending |
| 3-W0-02 | W0 | 0 | — | CR-02 | Viewer3d wird in context manager freigegeben | unit | `cd worker && python -m pytest tests/test_renderer.py::test_viewer_cleanup -v` | ❌ W0 | ⬜ pending |
| 3-01-01 | 01 | 1 | INGEST-04 | — | SHA-256 Duplikat wird mit HTTP 409 abgewiesen | unit | `npm test -- --run src/app/api/upload/init/route.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | INGEST-04 | — | Gültiger Init-Request erstellt parts-Eintrag (status=pending) + Presigned URL | integration | `npm test -- --run src/app/api/upload/init/route.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | INGEST-04 | — | Confirm-Request löst Celery-Job aus (Worker-URL erreichbar) | integration | `npm test -- --run src/app/api/upload/confirm/route.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 2 | INGEST-04 | — | HTTP 202 innerhalb 2 Sekunden auch bei 100 MB | manual | Manueller curl-Test (Dateigrößen-Benchmark) | — | ⬜ pending |
| 3-03-01 | 03 | 3 | INGEST-04 | — | Worker setzt status: pending → processing → ready | integration | `cd worker && python -m pytest tests/test_pipeline_e2e.py -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `worker/tests/test_process_step.py` — Stub für CR-01 UUID-Validierung
- [ ] `worker/tests/test_renderer.py` — Stub für CR-02 Viewer-Cleanup
- [ ] `worker/tests/conftest.py` — Shared Fixtures (Mock-S3, Mock-DB)
- [ ] `worker/tests/test_pipeline_e2e.py` — Stub für E2E Status-Zyklus
- [ ] `src/app/api/upload/init/route.test.ts` — Stub für SHA-256 Dedup (co-located neben route.ts)
- [ ] `src/app/api/upload/confirm/route.test.ts` — Stub für Celery-Job-Dispatch (co-located neben route.ts)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HTTP 202 < 2s bei 100 MB STEP-Datei | SC#3 | Presigned URL — Next.js leitet keine Binärdaten durch; Latenz hängt von S3-Netzwerk ab | `time curl -X POST /api/upload/init` mit 100 MB STEP → `time curl -T file.step <presigned_url>` → Zeit prüfen |
| Worker verarbeitet Job nach confirm | SC#4 | E2E mit laufendem Redis + Worker nötig; Celery-Queuing nicht unit-testbar | `docker compose up` → curl init+confirm → `watch "psql -c 'SELECT status FROM parts ORDER BY created_at DESC LIMIT 1'"` |
| Duplikat-Upload zeigt existing_part_id | SC#1 | Same SHA-256 zweimal hochladen; API-Response prüfen | Zwei curl-Aufrufe mit identischer STEP-Datei → zweiter muss HTTP 409 mit `{existing_part_id}` zurückgeben |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
