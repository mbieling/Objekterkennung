---
phase: 03-ingestion-api-queue
plan: "05"
subsystem: worker
tags: [celery, fastapi, redis, queue, microservice]
dependency_graph:
  requires:
    - "03-03"  # POST /api/upload/init
    - "03-04"  # POST /api/upload/confirm (ruft /enqueue auf)
  provides:
    - "worker/celery_app.py — Celery-Instanz mit Redis-Broker"
    - "worker/tasks.py — process_step_task Celery-Task-Wrapper"
    - "worker/main.py — FastAPI /health + /enqueue Endpunkte"
  affects:
    - "03-06"  # Docker Compose integriert diese Worker-Dateien
tech_stack:
  added:
    - fastapi>=0.136.0
    - uvicorn>=0.30.0
    - celery>=5.6.0
    - redis>=7.0.0
  patterns:
    - "Celery mit Redis-Broker und task_acks_late=True"
    - "FastAPI HTTP 202 Accepted Pattern für async Jobs"
    - "Pydantic UUID4 als dritte Validierungsschicht"
    - "VTK-Guard als erste Zeile in tasks.py (vor OCC-Imports)"
key_files:
  created:
    - worker/celery_app.py
    - worker/tasks.py
    - worker/main.py
  modified:
    - worker/requirements.txt
decisions:
  - "max_retries=0 in Celery-Task: Fehler werden als 'failed' in DB geschrieben — kein Auto-Retry; manueller Retry über Admin-Katalog (Phase 5)"
  - "CELERY_RESULT_BACKEND default = CELERY_BROKER_URL: vereinfacht Konfiguration, Redis als Result-Store"
  - "FastAPI-App mit Titel/Version-Metadaten statt app = FastAPI(): vollständige OpenAPI-Doku out-of-the-box"
metrics:
  duration: "~10 Minuten"
  completed: "2026-05-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 3 Plan 05: Python Worker Microservice (FastAPI + Celery) Summary

FastAPI-Worker mit /health und /enqueue-Endpunkten, Celery-Task-Wrapper mit VTK-Guard und Redis-Queue-Integration — Wave-2-Arbeit vor Docker-Compose-Integration.

## What Was Built

Drei neue Python-Dateien im `worker/`-Verzeichnis bilden den vollständigen Microservice-Layer:

**worker/celery_app.py** — Celery-Instanz mit Redis-Broker-Konfiguration:
- `task_acks_late=True`: Task erst nach Abschluss aus Queue entfernen (kein Datenverlust bei Worker-Crash)
- `worker_prefetch_multiplier=1`: Nur 1 Task gleichzeitig — CPU-intensives STEP-Processing schützt vor Resource-Exhaustion (T-03-14)
- `CELERY_BROKER_URL` via `os.environ[...]` — KeyError bei fehlender Var (kein Hardcoding, T-03-15)

**worker/tasks.py** — Celery-Task-Wrapper:
- VTK_DEFAULT_OPENGL_WINDOW als **allererste** ausführbare Zeile (nach Kommentarblock + `import os`)
- `process_step_task` ruft `process_step.process(part_id)` auf
- `max_retries=0`: Fehler werden in DB als 'failed' gesetzt — kein Celery-Auto-Retry
- Exceptions werden geloggt aber nicht re-raised (Celery markiert Task als SUCCESS; DB-Status trägt den Fehler)

**worker/main.py** — FastAPI-App:
- `GET /health` → HTTP 200 `{"status": "ok"}`
- `POST /enqueue` → HTTP 202 `{"task_id": "...", "part_id": "..."}`
- `EnqueueRequest.part_id: UUID4` — dritte Validierungsschicht nach Zod (Confirm-Route) und UUID_RE (process_step.py), T-03-13

**worker/requirements.txt** — vier neue Pakete hinzugefügt (bestehende Deps unverändert).

## Task Commits

| Task | Name | Commit | Dateien |
|------|------|--------|---------|
| 1 | Celery-App + Task-Wrapper | fa5db13 | worker/celery_app.py, worker/tasks.py |
| 2 | FastAPI-App + Requirements | b29241b | worker/main.py, worker/requirements.txt |

## Deviations from Plan

### Auto-fixed Issues

None — Plan exakt ausgeführt.

### Minor Adjustment

**FastAPI-App-Instanz mit Metadaten**: Plan zeigt `app = FastAPI()`, Implementierung verwendet `app = FastAPI(title="Bauteil-Finder Worker", version="1.0.0")`. Kein funktionaler Unterschied — liefert vollständige OpenAPI-Dokumentation out-of-the-box. Der Acceptance-Criteria-Check `grep -c "app = FastAPI()" main.py` gibt 0 zurück, da die erweiterte Form verwendet wird; alle anderen Kriterien erfüllt.

## Known Stubs

None — Alle Endpunkte sind vollständig implementiert und funktional verdrahtet.

## Threat Flags

Keine neuen nicht-geplanten Trust-Boundaries eingeführt. Alle drei geplanten Mitigierungen (T-03-13, T-03-14, T-03-15) implementiert:

| Flag | Datei | Status |
|------|-------|--------|
| T-03-13 Pydantic UUID4 | worker/main.py | mitigiert — EnqueueRequest.part_id: UUID4 |
| T-03-14 worker_prefetch_multiplier=1 | worker/celery_app.py | mitigiert — CPU-DoS-Schutz |
| T-03-15 CELERY_BROKER_URL via os.environ | worker/celery_app.py | mitigiert — KeyError bei fehlendem Wert |

## Self-Check: PASSED

Dateien vorhanden:
- worker/celery_app.py: FOUND
- worker/tasks.py: FOUND
- worker/main.py: FOUND

Commits vorhanden:
- fa5db13: FOUND
- b29241b: FOUND

Syntax-Checks:
- python3 -m py_compile worker/celery_app.py: OK
- python3 -m py_compile worker/tasks.py: OK
- python3 -m py_compile worker/main.py: OK
