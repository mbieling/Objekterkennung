---
phase: 04-ingestion-ui
plan: 01
subsystem: testing
tags: [vitest, playwright, test-stubs, postgresql, neon, schema-migration]

requires:
  - phase: 03-ingestion-api
    provides: "parts-Tabelle mit status-Spalte, db-Mock-Pattern aus init/route.test.ts"

provides:
  - "Migration 002_add_thumbnail_count.sql (auf Neon-DB angewendet)"
  - "4 Vitest-Test-Stubs (22 it.skip-Blöcke)"
  - "1 Playwright-E2E-Stub (2 test.skip)"

affects:
  - 04-02 status-route
  - 04-03 thumbnail-route
  - 04-04 use-part-status-hook
  - 04-05 upload-form
  - 04-06 upload-page

tech-stack:
  added: []
  patterns:
    - "Test-Stub-Pattern: it.skip mit Plan-Kommentar (// STUB — Plan 0X)"
    - "Vitest exclude: tests/**-Verzeichnis von Vitest-Scan ausgeschlossen (Playwright-Konflikt)"

key-files:
  created:
    - supabase/migrations/002_add_thumbnail_count.sql
    - src/app/api/parts/[id]/status/route.test.ts
    - src/app/api/parts/[id]/thumbnail/route.test.ts
    - src/hooks/use-part-status.test.ts
    - src/app/upload/UploadForm.test.tsx
    - tests/phase-04-upload.spec.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "tests/-Verzeichnis aus Vitest-Scan ausgeschlossen (exclude: ['node_modules', 'tests/**']) — verhindert Playwright/Vitest-Konflikt"
  - "thumbnail_count-Spalte als INTEGER NOT NULL DEFAULT 0 — idempotente Migration mit IF NOT EXISTS"

patterns-established:
  - "Stub-Datei-Kommentar-Header: Dateiname + Requirements-IDs + Verweis auf implementierenden Plan"
  - "Mock-Setup für @/lib/db als db: vi.fn() (nicht sql: vi.fn())"

requirements-completed:
  - INGEST-01
  - INGEST-02

duration: 15min
completed: 2026-05-08
---

# Phase 4 Plan 01: DB-Migration + Test-Stubs Summary

**thumbnail_count-Spalte via idempotenter Postgres-Migration auf Neon-DB angewendet; 22 Vitest-Stubs (it.skip) und 2 Playwright-Stubs als TDD-Gerüst für Wave 1–3 erstellt**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-08T19:30:00Z
- **Completed:** 2026-05-08T19:45:00Z
- **Tasks:** 3 (Task 1 + Task 2 bereits vor diesem Agent abgeschlossen; Task 3 dieser Agent)
- **Files modified:** 7

## Accomplishments

- Migration `002_add_thumbnail_count.sql` auf Neon-DB angewendet (durch Nutzer bestätigt)
- 4 Vitest-Test-Stubs mit 22 `it.skip`-Blöcken erstellt (Status-Route, Thumbnail-Route, Polling-Hook, UploadForm)
- 1 Playwright-E2E-Stub `tests/phase-04-upload.spec.ts` erstellt
- `npm test` läuft grün (Exit-Code 0, 22 skipped, 0 failed)

## Task Commits

1. **Task 1: Migration 002_add_thumbnail_count.sql** — aus vorherigem Agent (vor Checkpoint)
2. **Task 2: supabase db push (Checkpoint)** — Nutzer-Aktion, bestätigt
3. **Task 3: Vier Vitest-Stubs + 1 Playwright-Stub** — `a9dd6fe` (test)

## Files Created/Modified

- `supabase/migrations/002_add_thumbnail_count.sql` — DDL: ALTER TABLE parts ADD COLUMN thumbnail_count (Task 1)
- `src/app/api/parts/[id]/status/route.test.ts` — 3 it.skip-Stubs für GET /api/parts/[id]/status (INGEST-02)
- `src/app/api/parts/[id]/thumbnail/route.test.ts` — 5 it.skip-Stubs für GET /api/parts/[id]/thumbnail (INGEST-02)
- `src/hooks/use-part-status.test.ts` — 8 it.skip-Stubs für Polling-Hook (D-04, D-06)
- `src/app/upload/UploadForm.test.tsx` — 6 it.skip-Stubs für UploadForm-Komponente (INGEST-01)
- `tests/phase-04-upload.spec.ts` — 2 test.skip Playwright-E2E-Stubs
- `vitest.config.ts` — tests/-Verzeichnis aus Vitest-Scan ausgeschlossen

## Decisions Made

- `tests/`-Verzeichnis aus Vitest via `exclude: ['node_modules', 'tests/**']` ausgeschlossen, weil Vitest Playwright-Tests aufgegriffen und mit `test.describe() called here`-Fehler abgebrochen hat.
- Bestehende `it.skip`-Pattern aus Phase 3 (`init/route.test.ts`) beibehalten: `db: vi.fn()` als Mock-Export.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright-Datei aus Vitest-Scan ausgeschlossen**
- **Found during:** Task 3 (Stub-Erstellung)
- **Issue:** `tests/phase-04-upload.spec.ts` importiert `@playwright/test`; Vitest versuchte, die Datei auszuführen und warf `Playwright Test did not expect test.describe() to be called here`. Exit-Code 1.
- **Fix:** `exclude: ['node_modules', 'tests/**']` in `vitest.config.ts` ergänzt.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm test` Exit-Code 0, 22 skipped, 0 failed.
- **Committed in:** `a9dd6fe` (Task-3-Commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — Blocking)
**Impact on plan:** Notwendige Konfigurationskorrektur, kein Scope-Creep. Playwright-Tests bleiben separat via `npm run test:e2e`.

## Issues Encountered

`tests/`-Verzeichnis war nicht in der bestehenden Vitest-Konfiguration ausgeschlossen. Standard-Konfiguration in AI Coding Starter Kit fehlt diese Separation. Behoben via Rule 3.

## User Setup Required

None - keine neuen externen Services. Migration wurde durch Nutzer manuell angewendet (Checkpoint Task 2).

## Next Phase Readiness

- Alle Wave-1-Vorbedingungen erfüllt: `thumbnail_count`-Spalte auf DB, Test-Stubs für alle Wave-1/2/3-Tasks vorhanden.
- Wave 1 kann starten: Plan 04-02 (GET /api/parts/[id]/status) und Plan 04-03 (GET /api/parts/[id]/thumbnail).

---
*Phase: 04-ingestion-ui*
*Completed: 2026-05-08*
