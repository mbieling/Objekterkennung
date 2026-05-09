---
phase: 05-admin-catalog
plan: 03
subsystem: api
tags: [nextjs, typescript, zod, aws-s3, vitest, tdd, route-handlers]

# Dependency graph
requires:
  - phase: 05-admin-catalog
    plan: 01
    provides: "Vitest-Stubs für archive/route.test.ts und retry/route.test.ts (Wave-0-Gate)"
  - phase: 05-admin-catalog
    plan: 02
    provides: "vi.mocked()-Pattern für Vitest mit gehoisteten vi.mock()-Factories (Entscheidung 05-02)"
provides:
  - "PATCH /api/parts/[id] — Metadaten-Update (name, part_number, project, status), 'archived' verboten im Body"
  - "DELETE /api/parts/[id] — Hard-Delete: S3 batch-delete (2x DeleteObjectsCommand) vor DB-Löschung"
  - "POST /api/parts/[id]/archive — Soft-Delete: setzt status='archived', kein is_archived-Boolean"
  - "POST /api/parts/[id]/retry — Reset failed → pending in DB BEVOR Worker-Enqueue, 409 bei nicht-failed Parts"
affects: [05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD Red-Green-Refactor: Stub-Tests → failing RED → Implementation → GREEN"
    - "vi.mocked() statt top-level vi.fn()-Variable (Entscheidung 05-02 weitergeführt)"
    - "Constructor-kompatibles Vitest-Mock für AWS-SDK-Commands: function(this, args) statt arrow function"
    - "UUID-Validierung als erste Operation in allen Route-Handlern (T-05-03-01 bis T-05-03-03)"
    - "S3 löschen VOR DB bei Hard-Delete (S3-Waisen harmloser als DB-Einträge ohne S3)"
    - "DB-Update VOR Worker-Enqueue bei Retry (Assumption A4 RESEARCH.md)"

key-files:
  created:
    - src/app/api/parts/[id]/route.ts
    - src/app/api/parts/[id]/archive/route.ts
    - src/app/api/parts/[id]/retry/route.ts
  modified:
    - src/app/api/parts/[id]/route.test.ts
    - src/app/api/parts/[id]/archive/route.test.ts
    - src/app/api/parts/[id]/retry/route.test.ts

key-decisions:
  - "Constructor-kompatibles Mock für DeleteObjectsCommand: vi.fn().mockImplementation(function(this, args) {...}) statt arrow-function — arrow functions können nicht mit `new` aufgerufen werden"
  - "S3 vor DB bei Hard-Delete: S3-Waisen (Objekte ohne DB-Eintrag) harmloser als DB-Einträge ohne S3-Inhalt"
  - "DB-Update 'pending' vor Worker-Enqueue in retry: bei Worker-Fehler kann Admin erneut Retry auslösen (RESEARCH.md Assumption A4)"

patterns-established:
  - "Route-Handler-Muster: UUID-Validierung → Existenz-Check → Business-Logik (alle 4 Routes)"
  - "Soft-Delete-Muster: status='archived' — kein is_archived-Boolean, kein is_deleted-Flag"
  - "Retry-Muster: DB-State-Reset vor externer Queue-Call"

requirements-completed: [ADMIN-02, ADMIN-03, ADMIN-04]

# Metrics
duration: 5min
completed: 2026-05-09
---

# Phase 5 Plan 03: PATCH/DELETE/archive/retry API Routes Summary

**PATCH + DELETE /api/parts/[id] mit S3-Batch-Delete (DeleteObjectsCommand), POST /archive (Soft-Delete) und POST /retry (DB-Reset-vor-Worker) — 15 Tests grün via TDD**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-09T05:34:38Z
- **Completed:** 2026-05-09T05:39:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- PATCH-Route: Metadaten-Update (name, part_number, project, status) mit Zod-Validierung; `status='archived'` explizit abgelehnt (HTTP 400) — Archivierung nur via /archive-Route
- DELETE-Route: Hard-Delete mit 2x `DeleteObjectsCommand` (Batch/plural) — STEP-Datei + 8 Thumbnails aus 2 S3-Buckets, S3 vor DB-Löschung
- archive/route.ts: Soft-Delete schreibt nur `status='archived'`, kein `is_archived`-Boolean
- retry/route.ts: DB auf `'pending'` vor Worker-Enqueue-Call; 409 wenn Status nicht `'failed'`; WORKER_URL server-only ohne NEXT_PUBLIC
- 15 Tests grün: 4 PATCH + 3 DELETE + 3 archive + 5 retry

## Task Commits

TDD-Tasks haben je 2 Commits (test → feat):

1. **Task 1 RED: Tests für PATCH und DELETE** - `98e5bfa` (test)
2. **Task 1 GREEN: PATCH und DELETE implementiert** - `907b906` (feat)
3. **Task 2 RED: Tests für archive und retry** - `d744366` (test)
4. **Task 2 GREEN: archive und retry implementiert** - `49e2dd9` (feat)

## Files Created/Modified
- `src/app/api/parts/[id]/route.ts` - PATCH (Metadaten-Update) + DELETE (Hard-Delete mit S3-Batch)
- `src/app/api/parts/[id]/route.test.ts` - 7 Tests (Wave-0-Stubs ersetzt)
- `src/app/api/parts/[id]/archive/route.ts` - POST Soft-Delete (status='archived')
- `src/app/api/parts/[id]/archive/route.test.ts` - 3 Tests (Wave-0-Stubs ersetzt)
- `src/app/api/parts/[id]/retry/route.ts` - POST Reset + Worker-Enqueue
- `src/app/api/parts/[id]/retry/route.test.ts` - 5 Tests (Wave-0-Stubs ersetzt)

## Decisions Made
- **Constructor-kompatibles Mock**: `vi.fn().mockImplementation(function(this, args) {...})` statt arrow function für `DeleteObjectsCommand` — arrow functions haben kein `prototype` und können nicht mit `new` aufgerufen werden. Standard Vitest-Muster für AWS SDK Konstruktoren.
- **S3 vor DB löschen**: Reihenfolge in DELETE-Handler — S3-Waisen (Objekte in S3 ohne DB-Eintrag) sind harmloser als DB-Einträge ohne zugehörige S3-Inhalte (leerer Datensatz ohne abrufbare Daten).
- **DB-Update vor Worker-Enqueue**: Wenn Worker unerreichbar ist, bleibt Part im Status `pending` — Admin kann erneut Retry auslösen, statt in `failed`-Schleife zu bleiben.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Constructor-kompatibles Mock für DeleteObjectsCommand**
- **Found during:** Task 1 GREEN Phase (Tests für DELETE-Handler)
- **Issue:** `vi.fn().mockImplementation((args) => ({ ...args }))` erzeugt arrow function — arrow functions können nicht mit `new` aufgerufen werden → `TypeError: is not a constructor`
- **Fix:** `vi.fn().mockImplementation(function(this, args) { return Object.assign(this, { ...args }) })` — reguläre Funktion mit `this`-Kontext ist konstruierbar
- **Files modified:** `src/app/api/parts/[id]/route.test.ts`
- **Verification:** 7 Tests grün nach Fix
- **Committed in:** `907b906` (Task 1 GREEN Commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Notwendige Korrektur für Vitest/AWS-SDK-Kompatibilität. Kein Scope Creep.

## TDD Gate Compliance

- RED gate: `98e5bfa` (test(05-03): add failing tests for PATCH and DELETE) — Import-Fehler bestätigt
- GREEN gate: `907b906` (feat(05-03): implement PATCH and DELETE) — 7 Tests grün
- RED gate: `d744366` (test(05-03): add failing tests for POST /archive and POST /retry) — Import-Fehler bestätigt
- GREEN gate: `49e2dd9` (feat(05-03): implement POST /archive and POST /retry) — 8 neue Tests grün

## Issues Encountered
- Arrow-function-Mock für AWS SDK Konstruktoren funktioniert nicht mit `new`-Operator — bekanntes Vitest-Pitfall mit class-basierten Bibliotheken. Fix: reguläre Funktion mit `this`-Kontext.

## User Setup Required
None — keine externen Services konfiguriert.

## Next Phase Readiness
- Alle 4 Action-API-Routes implementiert und getestet: PATCH, DELETE, archive, retry
- CatalogTable (Plan 05-04) kann alle vier Routes konsumieren
- S3-Key-Schema verifiziert: `{part_id}/original.step` + `{part_id}/view_0..7.png`
- Worker-Enqueue-Pattern identisch zu confirm/route.ts — konsistentes Backend-Muster

---
*Phase: 05-admin-catalog*
*Completed: 2026-05-09*
