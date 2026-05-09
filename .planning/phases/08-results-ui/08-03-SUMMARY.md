---
phase: 08-results-ui
plan: "03"
subsystem: results-ui
tags: [wave-2, integration, camera-capture, search-results, d-11-overlay, threshold, limit]
dependency_graph:
  requires:
    - "08-02" (SearchResultCard.tsx, SearchResults.tsx)
  provides:
    - src/app/search/CameraCapture.tsx (integriert SearchResults, D-11-Overlay, threshold=0-URL)
  affects:
    - src/app/search/CameraCapture.test.tsx (fetch-URL-Assertion aktualisiert)
tech_stack:
  added: []
  patterns:
    - "D-07: POST /api/search?threshold=0&limit=Math.max(50, displayLimit) — alle Kandidaten holen, lokal filtern"
    - "D-08: handleSearchWithLimit — Limit-Wechsel triggert neue API-Anfrage"
    - "D-11: Spinner-Overlay über bestehendem SearchResults-Grid bei Re-Suche"
    - "searchResult-Guard in result-State: phase === 'result' && searchResult && ..."
key_files:
  created: []
  modified:
    - src/app/search/CameraCapture.tsx (5 Änderungen: Import, State, handleSearch, searching-Block, result-Block)
    - src/app/search/CameraCapture.test.tsx (fetch-URL-Assertion auf Regex; Test-Name aktualisiert)
decisions:
  - "Pre-existierende TypeScript-Fehler in Phase-5-Test-Dateien (archive/retry/route.test.ts) bleiben unberührt — außerhalb Scope von Plan 08-03"
  - "handleRetry-Funktion unverändert (setzt setSearchResult(null) korrekt — User kehrt zu idle zurück)"
metrics:
  duration: "~2 Minuten"
  completed: "2026-05-09"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 2
---

# Phase 8 Plan 03: CameraCapture-Integration (Wave 2) Summary

CameraCapture.tsx vollständig auf SearchResults umgestellt: threshold=0-API-URL, displayThreshold/displayLimit-State, D-11-Spinner-Overlay bei Re-Suche, result-State zeigt SearchResults statt pre-JSON-Placeholder. 9 Vitest-Tests grün.

## Tasks Completed

| Task | Name | Commits | Key Files |
|------|------|---------|-----------|
| 1 | CameraCapture.tsx — State + handleSearch + searching-Block + result-Block erweitern | b97b4dd | CameraCapture.tsx, CameraCapture.test.tsx |

## Verification Results

- `grep -v '^//' src/app/search/CameraCapture.tsx | grep -c '<pre'` → 0 (kein pre-Element mehr)
- `grep "threshold=0" src/app/search/CameraCapture.tsx` → 2 Treffer (handleSearch + handleSearchWithLimit)
- `grep "displayThreshold" src/app/search/CameraCapture.tsx` → State-Variable gefunden
- `grep "displayLimit" src/app/search/CameraCapture.tsx` → State-Variable gefunden
- `grep "SearchResults" src/app/search/CameraCapture.tsx` → 5 Treffer (Import + 4 Verwendungen)
- `grep "handleSearchWithLimit" src/app/search/CameraCapture.tsx` → Funktion + Aufruf gefunden
- `grep "searchResult ?" src/app/search/CameraCapture.tsx` → D-11-Kondition im searching-Block
- `npm test -- src/app/search/CameraCapture.test.tsx` → 9/9 Tests grün

## Deviations from Plan

### Auto-fixed Issues

Keine automatischen Fixes nötig.

### Planabweichungen (nicht kritisch)

**1. CameraCapture.test.tsx: fetch-URL-Assertion und Test-Name angepasst**

- **Grund:** Der bestehende Test `SEARCH-01: Suchen-Button click → fetch POST /api/search` erwartete die exakte URL `'/api/search'`. Nach der Plan-Änderung ist die URL `'/api/search?threshold=0&limit=50'`. Deviation Rule 1 (Auto-fix Bug): Test auf Regex-Match aktualisiert (`/\/api\/search\?threshold=0&limit=\d+/`).
- **Zweiter Test:** `SEARCH-01+02: POST /api/search 200 → JSON in pre-Block sichtbar` — Test-Name auf Phase-8-Semantik aktualisiert (kein pre-Block mehr, Bauteilname via SearchResultCard sichtbar). Assertion bleibt funktional gültig.
- **Auswirkung:** Keine — alle 9 Tests grün.

**2. Pre-existierende TypeScript-Fehler dokumentiert**

- **Gefunden:** `npx tsc --noEmit` zeigt 4 Fehler in Phase-5-Test-Dateien (archive/route.test.ts, retry/route.test.ts, route.test.ts). Verifiziert via `git stash` dass diese Fehler auf `main` vor diesem Plan vorhanden waren.
- **Aktion:** In `deferred-items.md` dokumentiert — außerhalb des Scopes von Plan 08-03.
- **Commit:** Kein Fix-Commit — pre-existierend, nicht durch diesen Plan verursacht.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| 6× test.skip | tests/phase-08-results-ui.spec.ts | Wave-0-Stubs, werden in Wave 3 (08-04) aktiviert |
| 2× test.skip | tests/phase-07-camera-ui.spec.ts | Warten auf 08-04-Aktivierung (Phase-7-E2E-Tests) |

## Threat Flags

Keine neuen sicherheitsrelevanten Oberflächen eingeführt. Threat-Register aus Plan vollständig adressiert:

- T-08-03-01: `Math.max(50, displayLimit)` — displayLimit ist kontrollierter State-Wert (10/20/50); kein User-Input direkt in URL
- T-08-03-02: searchResult State im Browser — nicht sensibel (Teil-Namen + Ähnlichkeitswerte); kein PII

## Self-Check: PASSED

- [x] src/app/search/CameraCapture.tsx existiert und enthält kein `<pre>`
- [x] `grep "SearchResults" src/app/search/CameraCapture.tsx` → 5 Treffer
- [x] `grep "threshold=0" src/app/search/CameraCapture.tsx` → 2 Treffer
- [x] `grep "displayThreshold" src/app/search/CameraCapture.tsx` → gefunden
- [x] `grep "handleSearchWithLimit" src/app/search/CameraCapture.tsx` → gefunden
- [x] Commit b97b4dd existiert
- [x] 9 Vitest-Tests grün
