---
phase: 08-results-ui
plan: "02"
subsystem: results-ui
tags: [wave-1, tdd, searchresultcard, searchresults, vitest, radix-ui, slider, select]
dependency_graph:
  requires:
    - "08-01" (slider.tsx, SearchResultCard.test.tsx, SearchResults.test.tsx)
  provides:
    - src/app/search/SearchResultCard.tsx (Einzelkarte mit Thumbnail, Badge, Link)
    - src/app/search/SearchResults.tsx (Controller mit Filterlogik + Controls-Zeile)
    - src/test/setup.ts (ResizeObserver-Mock für Radix UI)
  affects:
    - src/app/search/CameraCapture.tsx (Wave 2 — 08-03 integriert SearchResults)
tech_stack:
  added: []
  patterns:
    - "TDD RED/GREEN — test(08-02) Commit vor feat(08-02) Commit"
    - "Lazy Thumbnail via useEffect([id]) — kein Endlosloop"
    - "Lokale Filterung (similarity >= displayThreshold) ohne API-Roundtrip"
    - "Radix UI ResizeObserver-Mock in src/test/setup.ts"
key_files:
  created:
    - src/app/search/SearchResultCard.tsx
    - src/app/search/SearchResults.tsx
  modified:
    - src/app/search/SearchResultCard.test.tsx (8 it.todo → 9 vollständige Tests)
    - src/app/search/SearchResults.test.tsx (7 it.todo → 7 vollständige Tests)
    - src/test/setup.ts (ResizeObserver-Mock hinzugefügt)
decisions:
  - "ResizeObserver-Mock in globalem setup.ts statt einzelnen Testdateien — betrifft alle Radix UI Komponenten (Slider, Select) im Projekt"
  - "Einen zusätzlichen Test für similarity=0.95 (grün) ergänzt — Plan nannte 8 Stubs, implementiert wurden 9 Tests (95%-Fall explizit)"
metrics:
  duration: "~15 Minuten"
  completed: "2026-05-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
---

# Phase 8 Plan 02: SearchResultCard + SearchResults (Wave 1) Summary

SearchResultCard mit Thumbnail-Skeleton, farbkodiertem Badge und Link, plus SearchResults mit lokalem Threshold-Filter, Controls-Zeile (Slider + Select) und Leer-Zustand. TDD-Zyklus vollständig (RED → GREEN). 16 Vitest-Tests grün.

## Tasks Completed

| Task | Name | Commits | Key Files |
|------|------|---------|-----------|
| 1 | SearchResultCard.tsx — Einzelkarte mit Thumbnail + Badge | c68c7c1 (test), 7c43c0c (feat) | SearchResultCard.tsx, SearchResultCard.test.tsx |
| 2 | SearchResults.tsx — Controller mit Filterlogik + Controls-Zeile | 5f41ac7 (test), 2053577 (feat) | SearchResults.tsx, SearchResults.test.tsx, setup.ts |

## Verification Results

- `npm test -- src/app/search/SearchResultCard.test.tsx` — 9 Tests grün (SEARCH-03)
- `npm test -- src/app/search/SearchResults.test.tsx` — 7 Tests grün (SEARCH-03/04/05)
- `grep "bg-green-500\|bg-amber-500\|bg-red-500" src/app/search/SearchResultCard.tsx` — alle 3 Farben vorhanden
- `grep "\[id\]" src/app/search/SearchResultCard.tsx` — deps-Array nur mit id (kein Endlosloop)
- `grep "aria-live" src/app/search/SearchResults.tsx` — aria-live="polite" vorhanden
- `grep -c 'it.todo' src/app/search/SearchResultCard.test.tsx` → 0
- `grep -c 'it.todo' src/app/search/SearchResults.test.tsx` → 0

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (SearchResultCard) | c68c7c1 `test(08-02)` | Grün — Test schlägt fehl, da Datei nicht existiert |
| GREEN (SearchResultCard) | 7c43c0c `feat(08-02)` | 9/9 Tests grün |
| RED (SearchResults) | 5f41ac7 `test(08-02)` | Grün — Test schlägt fehl, da Datei nicht existiert |
| GREEN (SearchResults) | 2053577 `feat(08-02)` | 7/7 Tests grün |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ResizeObserver nicht definiert in jsdom**

- **Found during:** Task 2 (GREEN Phase — erste Testausführung mit SearchResults.tsx)
- **Issue:** Radix UI Slider und Select verwenden intern `@radix-ui/react-use-size`, das `ResizeObserver` nutzt. jsdom (Vitest-Testumgebung) implementiert `ResizeObserver` nicht. Alle 7 SearchResults-Tests schlugen mit `ReferenceError: ResizeObserver is not defined` fehl.
- **Fix:** `global.ResizeObserver = class ResizeObserver { observe() {} unobserve() {} disconnect() {} }` in `src/test/setup.ts` ergänzt. Dieser Mock ist global für alle Vitest-Tests wirksam und kompatibel mit bestehenden CameraCapture-Tests.
- **Files modified:** src/test/setup.ts
- **Commit:** 2053577 (zusammen mit SearchResults.tsx)

### Planabweichungen (nicht kritisch)

**2. 9 statt 8 Tests für SearchResultCard**

- **Grund:** Plan listete 8 Verhaltens-Tests. Ein zusätzlicher Test für `similarity=0.95` (Badge grün) wurde ergänzt, weil der Plan `bg-green-500 bei similarity >= 0.80` und `bg-green-500 bei similarity=0.95` als separate Einträge in `<behavior>` aufführte. Beide implementiert.
- **Auswirkung:** Keine — nur mehr Coverage.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| 6× test.skip | tests/phase-08-results-ui.spec.ts | Wave-0-Stubs, werden in Wave 3 (08-04) aktiviert |
| 2× test.skip | tests/phase-07-camera-ui.spec.ts | Warten auf CameraCapture-Integration in Wave 2 (08-03) |

## Threat Flags

Keine neuen sicherheitsrelevanten Oberflächen eingeführt. Threat-Register aus Plan vollständig adressiert:

- T-08-02-01: id-Wert in Link href — Next.js Link verhindert Javascript-Protokoll-Injection; id kommt aus DB-validierten UUIDs
- T-08-02-02: Thumbnail img src — onError-Handler verhindert Broken-Image; kein dangerouslySetInnerHTML
- T-08-02-03: part.name in JSX — React escapet automatisch; kein XSS möglich

## Self-Check: PASSED

- [x] src/app/search/SearchResultCard.tsx existiert
- [x] src/app/search/SearchResults.tsx existiert
- [x] `grep -c 'it.todo' src/app/search/SearchResultCard.test.tsx` → 0
- [x] `grep -c 'it.todo' src/app/search/SearchResults.test.tsx` → 0
- [x] Commits c68c7c1, 7c43c0c, 5f41ac7, 2053577 existieren
- [x] 9 + 7 = 16 Vitest-Tests grün
