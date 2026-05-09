---
phase: 05-admin-catalog
plan: 02
subsystem: api
tags: [nextjs, api-route, neon, postgresql, vitest, tdd]

# Dependency graph
requires:
  - phase: 05-admin-catalog
    plan: 01
    provides: "Vitest-Stub-Datei src/app/api/parts/route.test.ts mit it.todo()-Einträgen"
  - phase: 01-database-foundation
    provides: "parts-Tabelle mit id, name, part_number, project, status, thumbnail_count, created_at, embedding"
provides:
  - "GET /api/parts — liefert alle parts-Zeilen ohne embedding-Feld als { parts: [...] }"
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mocked(db) statt direktem mockDb-Pattern — vermeidet Vitest-Hoisting-Fehler bei vi.mock + vi.fn()"
    - "TDD RED/GREEN: test-Commit vor feat-Commit, beide atomar"

key-files:
  created:
    - src/app/api/parts/route.ts
  modified:
    - src/app/api/parts/route.test.ts

key-decisions:
  - "vi.mocked(db) statt top-level mockDb = vi.fn() — Vitest hostet vi.mock() an den Anfang; eine top-level Variable ist beim Hoisting noch nicht initialisiert (ReferenceError). Fix: vi.mock-Factory zuerst, dann import, dann vi.mocked() für den getypten Zugriff."

patterns-established:
  - "TDD-Stub-Aktivierung: Wave-0 it.todo()-Stubs werden in Wave-1 durch echte Tests ersetzt (nicht erweitert)"
  - "Mock-Hoisting-Safe-Pattern: vi.mock factory oben, import danach, vi.mocked() für Variablen-Zugriff"

requirements-completed: [ADMIN-01]

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 5 Plan 02: GET /api/parts Summary

**GET /api/parts Endpunkt implementiert — liefert alle parts-Zeilen ohne embedding-Feld, sortiert nach created_at DESC, mit 3 Vitest-Tests grün**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-09T07:30:00Z
- **Completed:** 2026-05-09T07:38:00Z
- **Tasks:** 1 (TDD: 2 Commits — test + feat)
- **Files modified:** 2

## Accomplishments
- `src/app/api/parts/route.ts` mit `GET`-Handler angelegt — liefert `{ parts: [...] }` ohne embedding-Feld
- Wave-0-Stubs (`it.todo()`) durch 3 echte Vitest-Tests ersetzt — alle grün
- TDD-Zyklus vollständig: RED (schlägt fehl wegen fehlendem route.ts) → GREEN (3 passed)

## Task Commits

Jeder Task wurde atomar committed:

1. **RED — Test-Implementierung** - `6376359` (test)
2. **GREEN — Route-Implementierung** - `dc8c377` (feat)

_TDD-Plan: test-Commit (RED) vor feat-Commit (GREEN)_

## Files Created/Modified
- `src/app/api/parts/route.ts` — GET /api/parts Handler; SELECT ohne embedding und is_archived; ORDER BY created_at DESC
- `src/app/api/parts/route.test.ts` — 3 Vitest-Tests (Array mit Daten, leeres Array, kein embedding); Wave-0-Stubs ersetzt

## Decisions Made
- `vi.mocked(db)` statt top-level `const mockDb = vi.fn()`: Vitest hostet `vi.mock()` an den Dateianfang; eine Variable die erst danach mit `vi.fn()` initialisiert wird, ist zum Hoisting-Zeitpunkt noch nicht vorhanden → `ReferenceError: Cannot access 'mockDb' before initialization`. Fix: Factory im `vi.mock()` selbst (`() => ({ db: vi.fn() })`), dann `import { db }` nach dem Mock, dann `vi.mocked(db)` für den getypten Mock-Zugriff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest-Mock-Hoisting-Fehler behoben**
- **Found during:** Task 1, GREEN-Phase (Tests liefen erstmals gegen route.ts)
- **Issue:** Plan-Vorlage verwendete `const mockDb = vi.fn()` vor `vi.mock(...)`. Vitest hostet `vi.mock()`-Aufrufe automatisch an den Dateianfang — die `mockDb`-Variable war zu diesem Zeitpunkt noch nicht initialisiert → `ReferenceError: Cannot access 'mockDb' before initialization`
- **Fix:** `vi.mock()` mit inline-Factory `() => ({ db: vi.fn() })` definiert; `import { db } from '@/lib/db'` danach; `vi.mocked(db)` für den typisierten Mock-Zugriff in Tests
- **Files modified:** `src/app/api/parts/route.test.ts`
- **Verification:** `npm test -- --run src/app/api/parts/route.test.ts` → 3 passed
- **Committed in:** `dc8c377` (feat-Commit, Test-Fix zusammen mit Implementierung)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact auf Plan:** Notwendige Korrektur für Vitest-Kompatibilität; Semantik der Tests ist identisch zur Plan-Vorlage. Kein Scope Creep.

## Issues Encountered
- Vitest mock hoisting führte zu `ReferenceError` mit der Plan-Vorlage. Behoben via `vi.mocked()`-Pattern (Standard-Vitest-Idiom).

## User Setup Required
None — kein externer Service konfiguriert.

## Next Phase Readiness
- `GET /api/parts` ist einsatzbereit — Plan 05-04 (CatalogTable-Komponente) kann diesen Endpunkt nutzen
- Plan 05-03 (PATCH/DELETE/archive/retry Routes) kann parallel oder sequenziell folgen

---
*Phase: 05-admin-catalog*
*Completed: 2026-05-09*
