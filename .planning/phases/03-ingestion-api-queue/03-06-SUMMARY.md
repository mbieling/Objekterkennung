---
phase: 03-ingestion-api-queue
plan: "06"
subsystem: infrastructure
tags: [docker-compose, redis, worker, celery, fastapi, dockerignore]
dependency_graph:
  requires: ["03-05"]
  provides: ["docker-compose.yml", "worker/.dockerignore"]
  affects: ["Phase 4 Ingestion UI — WORKER_URL via docker compose verfügbar"]
tech_stack:
  added: ["redis:7-alpine via Docker Compose", "worker/.dockerignore (IN-02-Fix)"]
  patterns: ["Single-container FastAPI + Celery (combined process)", "health-check-dependent service startup"]
key_files:
  created:
    - docker-compose.yml
    - worker/.dockerignore
  modified: []
decisions:
  - "HTTP Health-Check (/health) statt celery inspect ping — robuster bei fehlenden OCC-Imports"
  - "FastAPI + Celery in einem Container (development convenience; für Produktion getrennte Services empfohlen)"
  - "env_file: worker/.env — Secrets kommen nur zur Laufzeit, nie im Image"
metrics:
  duration: "< 5 Minuten"
  completed: "2026-05-08"
  tasks_completed: 1
  files_created: 2
---

# Phase 3 Plan 06: Docker Compose + E2E-Checkpoint Summary

**One-liner:** Redis (redis:7-alpine) + FastAPI/Celery-Worker via Docker Compose mit Health-Checks und .dockerignore für model_cache/- und Secrets-Ausschluss.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | docker-compose.yml + worker/.dockerignore erstellen | 33d5259 | docker-compose.yml, worker/.dockerignore |

## What Was Built

### docker-compose.yml

Verbindet Redis und den Python-Worker zu einem lokalen E2E-Test-Setup:

- `redis`: redis:7-alpine, Port 6379:6379, Health-Check via `redis-cli ping`
- `worker`: Build aus `./worker/Dockerfile`, Port 8000:8000, startet FastAPI + Celery in einem Container
- Worker wartet via `depends_on: condition: service_healthy` bis Redis bereit ist
- `CELERY_BROKER_URL=redis://redis:6379/0` über internes Docker-Netz
- `env_file: worker/.env` für DATABASE_URL + AWS_*-Secrets (nie im Image)

### worker/.dockerignore

Schließt aus (IN-02-Fix):
- `model_cache/` — 330 MB DINOv2-Cache, wird beim Build heruntergeladen
- `.env` — Secrets dürfen nie ins Image (T-03-16)
- `__pycache__/`, `*.pyc`, `*.pyo` — Python-Bytecode
- `tests/`, `.pytest_cache/` — Test-Artefakte

## Checkpoint Status

Plan ist bei `checkpoint:human-verify` pausiert. Task 1 (docker-compose.yml + .dockerignore) ist abgeschlossen und committed. Der Checkpoint wartet auf manuelle Bestätigung durch den Nutzer.

### Checkpoint-Verifikation (Anleitung für Nutzer)

**Schritt 1: Automatisierte Tests**
```bash
npm test -- --run
python -m pytest worker/tests/ -v
```

**Schritt 2: TypeScript-Build**
```bash
npx tsc --noEmit
npm run lint
```

**Schritt 3: Python-Syntax-Check**
```bash
python -m py_compile worker/celery_app.py && echo "OK"
python -m py_compile worker/tasks.py && echo "OK"
python -m py_compile worker/main.py && echo "OK"
```

**Schritt 4 (optional, nur wenn Docker verfügbar):**
```bash
docker compose up -d
sleep 15
curl http://localhost:8000/health  # Erwartet: {"status":"ok"}
docker compose down
```

Resume-Signal: "approved" wenn alle Tests grün und Syntax-Checks erfolgreich.

## Deviations from Plan

None - Plan wurde exakt wie spezifiziert ausgeführt.

## Threat Surface Scan

Alle Bedrohungen aus dem STRIDE Register abgedeckt:

| Flag | File | Description |
|------|------|-------------|
| T-03-16 mitigated | worker/.dockerignore | .env aus Docker-Image ausgeschlossen |
| T-03-17 mitigated | worker/.dockerignore | model_cache/ aus Docker-Image ausgeschlossen |
| T-03-18 accepted | docker-compose.yml | Redis ohne Auth (lokale Entwicklung) — Upstash in Produktion |

## Self-Check: PASSED

- docker-compose.yml existiert: FOUND
- worker/.dockerignore existiert: FOUND
- Commit 33d5259: FOUND (`git log --oneline | grep 33d5259`)
- redis:7-alpine in docker-compose.yml: 1 Treffer
- service_healthy in docker-compose.yml: 1 Treffer
- model_cache/ in worker/.dockerignore: 2 Treffer (Kommentarzeile + Eintrag — korrekt)
