---
phase: 03-ingestion-api-queue
plan: "02"
subsystem: ingestion-api
tags: [vitest, test-stubs, wave-0, env-config]
dependency_graph:
  requires: [03-01]
  provides: [test-infrastructure-for-03-03, test-infrastructure-for-03-04]
  affects: [03-03, 03-04]
tech_stack:
  added: []
  patterns: [vitest-module-mocking, co-located-tests]
key_files:
  created:
    - src/app/api/upload/init/route.test.ts
    - src/app/api/upload/confirm/route.test.ts
  modified:
    - .env.local.example
    - worker/.env.example
decisions:
  - "Tests vor Implementierung erstellt (Wave-0-Nyquist-Regel) — Wave-1-Plans implementieren gegen diese Stubs"
  - "global.fetch-Mock in confirm/route.test.ts für Worker-HTTP-Aufruf (nicht vi.mock, da global)"
metrics:
  duration: "10 Minuten"
  completed: "2026-05-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 3 Plan 02: Test-Stubs + Env-Konfiguration Summary

Vitest-Test-Stubs co-located neben den Upload-API-Routes erstellt (init + confirm) und Env-Beispieldateien um WORKER_URL, UPSTASH_REDIS_URL, CELERY_BROKER_URL und CELERY_RESULT_BACKEND erweitert.

## Tasks

| Task | Name | Commit | Dateien |
|------|------|--------|---------|
| 1 | Vitest-Test-Stubs für init- und confirm-Route | c812775 | src/app/api/upload/init/route.test.ts, src/app/api/upload/confirm/route.test.ts |
| 2 | Env-Beispieldateien um Phase-3-Variablen erweitern | b485d13 | .env.local.example, worker/.env.example |

## Was wurde gebaut

### Task 1: Vitest-Test-Stubs

**src/app/api/upload/init/route.test.ts** — 5 Testfälle:
- HTTP 409 bei SHA-256-Duplikat (INGEST-04-Deduplizierung)
- HTTP 200 mit part_id und presigned_url bei gültigem Request
- HTTP 400 bei leerem `name`-Feld (Zod-Validierung)
- HTTP 400 bei SHA-256 kürzer als 64 Hex-Zeichen
- HTTP 400 bei file_size_bytes > 100 MB

Mock-Infrastruktur: `vi.mock('@/lib/db')`, `vi.mock('@/lib/s3')`, `vi.mock('@aws-sdk/s3-request-presigner')`

**src/app/api/upload/confirm/route.test.ts** — 4 Testfälle:
- HTTP 202 + Worker /enqueue aufgerufen bei gültigem Request
- HTTP 404 wenn part_id nicht in DB existiert
- HTTP 502 wenn Worker nicht erreichbar (ok: false)
- HTTP 400 bei ungültiger UUID

Mock-Infrastruktur: `vi.mock('@/lib/db')`, `global.fetch = vi.fn()` (für Worker-HTTP-Aufruf)

### Task 2: Env-Dateien

**.env.local.example** — hinzugefügt:
- `WORKER_URL=http://localhost:8000` mit lokalen und Produktions-Hinweisen
- `UPSTASH_REDIS_URL=rediss://:your_upstash_password@...` mit Placeholder (kein echtes Secret)

**worker/.env.example** — hinzugefügt:
- `CELERY_BROKER_URL=redis://localhost:6379/0` mit Docker-Compose und Upstash-Varianten
- `CELERY_RESULT_BACKEND=redis://localhost:6379/0`

## Deviations from Plan

None — Plan executed exactly as written.

Die Tests schlagen erwartungsgemäß fehl (Fehlermeldung "Cannot find module './route'"), weil die Route-Implementierungen noch nicht existieren. Dies ist das korrekte Wave-0-Verhalten — Wave-1-Plans (03-03, 03-04) implementieren die Routes gegen diese Stubs.

## Threat Model Compliance

| Threat | Mitigiert | Nachweis |
|--------|-----------|---------|
| T-03-04: Info Disclosure via .env.local.example | Ja | Nur Dummy-Wert `your_upstash_password` — kein echtes Secret |
| T-03-05: Info Disclosure via worker/.env.example | Ja | Nur lokale Defaults `redis://localhost:6379/0` — kein Upstash-Password |

## Known Stubs

Die Testdateien referenzieren `./route` (die Route-Implementierungen), die noch nicht existieren. Dies ist intentional — Wave-1-Plans erstellen die Implementierungen.

| Stub | Datei | Grund |
|------|-------|-------|
| `import('./route')` | route.test.ts (beide) | Route-Implementierung folgt in Wave-1-Plans 03-03 und 03-04 |

## Self-Check: PASSED

- src/app/api/upload/init/route.test.ts: VORHANDEN
- src/app/api/upload/confirm/route.test.ts: VORHANDEN
- .env.local.example enthält WORKER_URL: JA (1 Treffer)
- .env.local.example enthält UPSTASH_REDIS_URL: JA (1 Treffer)
- worker/.env.example enthält CELERY_BROKER_URL: JA (1 Treffer)
- worker/.env.example enthält CELERY_RESULT_BACKEND: JA (1 Treffer)
- Commit c812775: VORHANDEN
- Commit b485d13: VORHANDEN
