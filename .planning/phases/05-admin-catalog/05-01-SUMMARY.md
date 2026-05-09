---
phase: 05-admin-catalog
plan: 01
subsystem: testing
tags: [sonner, toaster, vitest, playwright, test-stubs, wave-0]

# Dependency graph
requires:
  - phase: 04-ingestion-ui
    provides: "src/app/layout.tsx Basis-Layout; src/components/ui/sonner.tsx Toaster-Komponente"
provides:
  - "Toaster in Root-Layout gemountet — Toast-Aufrufe aller Wave-2/3-Komponenten werden sichtbar"
  - "4 Vitest-Stub-Dateien (todo-Tests) für GET /api/parts, PATCH+DELETE /api/parts/[id], POST /archive, POST /retry"
  - "1 Playwright E2E Smoke-Test-Stub (tests/admin-catalog.spec.ts, 4 skip-Tests)"
affects: [05-02, 05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vitest-Stubs mit it.todo() als Wave-0-Pattern (aktiviert in Wave 1–3)"
    - "Playwright-Stubs mit test.skip() statt test.todo() (Playwright 1.58.2 kennt kein test.todo)"

key-files:
  created:
    - src/app/api/parts/route.test.ts
    - src/app/api/parts/[id]/route.test.ts
    - src/app/api/parts/[id]/archive/route.test.ts
    - src/app/api/parts/[id]/retry/route.test.ts
    - tests/admin-catalog.spec.ts
  modified:
    - src/app/layout.tsx

key-decisions:
  - "Playwright test.skip() statt test.todo() verwenden — Playwright 1.58.2 hat keine test.todo() API; test.skip() mit leerer async-Funktion ist das etablierte Muster im Projekt"

patterns-established:
  - "Wave-0-Stubs: Vitest-Stubs mit it.todo(), Playwright-Stubs mit test.skip() + leerer async-Funktion"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04]

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 5 Plan 01: Wave-0-Blocker-Fixes und Test-Stubs Summary

**Toaster in Root-Layout gemountet und 5 Test-Stub-Dateien (4 Vitest + 1 Playwright) als Wave-0-Gate für Admin-Catalog-Pläne 02–05 angelegt**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-09T07:27:00Z
- **Completed:** 2026-05-09T07:35:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Toaster-Komponente in `src/app/layout.tsx` gemountet — alle `toast.success()` / `toast.error()`-Aufrufe der Wave-2/3-Komponenten werden im Browser sichtbar
- 4 Vitest-Stub-Dateien mit `it.todo()` angelegt: GET /api/parts, PATCH+DELETE /api/parts/[id], POST /archive, POST /retry
- 1 Playwright E2E Smoke-Test-Stub mit 4 `test.skip()`-Einträgen angelegt; `npm run test:e2e -- --list` listet alle 4 Tests ohne Fehler

## Task Commits

Jeder Task wurde atomar committed:

1. **Task 1: Toaster in Root-Layout mounten** - `605b9f8` (feat)
2. **Task 2: Vitest-Test-Stubs für alle 4 API-Routes anlegen** - `317742b` (test)
3. **Task 3: Playwright E2E Smoke-Test-Stub anlegen** - `d8579cc` (test)

## Files Created/Modified
- `src/app/layout.tsx` - Toaster-Import und `<Toaster />`-Mount nach `{children}` in `<body>` hinzugefügt
- `src/app/api/parts/route.test.ts` - Vitest-Stubs für GET /api/parts (ADMIN-01)
- `src/app/api/parts/[id]/route.test.ts` - Vitest-Stubs für PATCH + DELETE (ADMIN-02, ADMIN-03)
- `src/app/api/parts/[id]/archive/route.test.ts` - Vitest-Stubs für POST /archive (ADMIN-03 Soft-Delete)
- `src/app/api/parts/[id]/retry/route.test.ts` - Vitest-Stubs für POST /retry (ADMIN-04)
- `tests/admin-catalog.spec.ts` - Playwright E2E Smoke-Test-Stub (4 Skip-Tests, ADMIN-01 bis ADMIN-04)

## Decisions Made
- `test.todo()` → `test.skip()` in Playwright: Playwright 1.58.2 hat keine `test.todo()` API. Das etablierte Projekt-Pattern (phase-04-upload.spec.ts) verwendet `test.skip()` mit leerer async-Funktion als Stub.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Playwright test.todo() → test.skip() konvertiert**
- **Found during:** Task 3 (Playwright E2E Smoke-Test-Stub anlegen)
- **Issue:** `test.todo()` ist keine Funktion in Playwright 1.58.2 — `npm run test:e2e -- --list` gab `TypeError: _test.test.todo is not a function`
- **Fix:** Alle 4 `test.todo()` durch `test.skip(name, async ({ page }) => { /* STUB */ })` ersetzt, analog zum Muster in `tests/phase-04-upload.spec.ts`
- **Files modified:** `tests/admin-catalog.spec.ts`
- **Verification:** `npm run test:e2e -- --list` zeigt 4 Tests ohne Fehler; alle sind skipped
- **Committed in:** `d8579cc` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Notwendige Korrektur für Playwright-Kompatibilität; semantisch äquivalent (test.skip = kein Lauf, kein Fehler). Kein Scope Creep.

## Issues Encountered
- `archive/` und `retry/` Verzeichnisse mussten erst mit `mkdir -p` angelegt werden (sie existierten noch nicht, da die Routes noch in Wave 1–3 implementiert werden).

## User Setup Required
None — kein externer Service konfiguriert.

## Next Phase Readiness
- Wave-0-Gate ist freigegeben: alle 5 Stub-Dateien existieren, `npm test -- --run` beendet sich mit Exit-Code 0
- Plan 05-02 (GET /api/parts Route, Wave 1) kann sofort beginnen
- `<Toaster />` ist im DOM — Wave-2/3-Komponenten können toast-Aufrufe nutzen

---
*Phase: 05-admin-catalog*
*Completed: 2026-05-09*
