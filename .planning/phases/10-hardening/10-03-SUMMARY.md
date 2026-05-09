---
phase: 10-hardening
plan: "03"
subsystem: admin-catalog
tags: [pagination, performance, api, refactoring]
dependency_graph:
  requires: []
  provides: [server-side-pagination, paginated-api-response]
  affects: [src/app/api/parts/route.ts, src/app/admin/CatalogTable.tsx]
tech_stack:
  added: []
  patterns: [zod-query-validation, useCallback-fetch, windowed-pagination]
key_files:
  created: []
  modified:
    - src/app/api/parts/route.ts
    - src/app/admin/CatalogTable.tsx
    - src/app/api/parts/route.test.ts
decisions:
  - "Tab-Counts (Badges) entfernt: exakte Counts pro Tab würden 5 separate COUNT-Queries benötigen — akzeptabler Kompromiss für SC-4 Performance"
  - "route.test.ts aktualisiert: GET()-Signatur ohne Argument → GET(req: NextRequest) mit Request-Helper-Funktion"
metrics:
  duration: "PT18M"
  completed: "2026-05-09T15:04:00Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 10 Plan 03: Serverseitige Pagination Summary

**One-liner:** SQL LIMIT/OFFSET in GET /api/parts mit Zod-Validierung + CatalogTable von clientseitiger Filter-Logik auf Server-Fetch mit fensterbasierter Pagination umgestellt.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | GET /api/parts — Pagination-Support (SC-4) | 1a234aa | src/app/api/parts/route.ts |
| 2 | CatalogTable serverseitige Pagination refactoring | 9ca7f3c | src/app/admin/CatalogTable.tsx, src/app/api/parts/route.test.ts |

## What Was Built

### Task 1: GET /api/parts (route.ts)

Die API-Route wurde vollständig ersetzt. Neue Implementierung:

- **Zod-Schema** validiert `page` (min 1), `limit` (max 100), `status` (Enum), `search` (max 200)
- **4 SQL-Zweige** für alle Filter-Kombinationen: status+search, nur status, nur search, keine Filter
- Jeder Zweig führt **zwei Queries** aus: Daten-Query (LIMIT/OFFSET) + COUNT-Query für `total_count`
- **Response-Format:** `{ parts, total_count, page, limit, total_pages }`
- Bei ungültigen Parametern: HTTP 400 mit Fehlermeldung
- Parametrisierte Neon-Queries — SQL-Injection ausgeschlossen

### Task 2: CatalogTable.tsx

CatalogTable von "lade alles, filtere clientseitig" auf "lade nur aktuelle Seite vom Server" umgestellt:

- **`fetchParts` als `useCallback`** — nimmt `page`, `tab`, `search` als Parameter, baut URLSearchParams, fetcht `/api/parts`
- **`useEffect([currentPage, activeTab, searchQuery, fetchParts])`** — triggert Re-Fetch bei jedem Parameterwechsel (initial + bei Tab-Wechsel + bei Suche)
- **`totalCount` + `totalPages`** State aus API-Response
- **`filteredParts` + `paginatedParts`** Computed-Werte entfernt — Tabelle rendert direkt `parts.map`
- **Fensterbasierte Pagination:** immer max 5 Seitennummern um aktuelle Seite + Seite 1 / letzte Seite mit "…"-Separator
- **Tab-Counts (Badges)** entfernt — mit 20 geladenen Einträgen nicht korrekt berechenbar

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] route.test.ts: Test-Signatur veraltet nach API-Änderung**
- **Found during:** Task 2 TypeScript-Check
- **Issue:** `route.test.ts` rief `GET()` ohne Argument auf — nach Umstellung auf `GET(req: NextRequest)` TypeScript-Fehler TS2554 (Expected 1 argument, got 0)
- **Fix:** `makeRequest()`-Hilfsfunktion erstellt, Tests auf NextRequest-Signatur umgestellt, mockDb für 2 Aufrufe (rows + count) angepasst, 2 neue Tests hinzugefügt (HTTP 400 + Status-Filter)
- **Files modified:** src/app/api/parts/route.test.ts
- **Commit:** 9ca7f3c (zusammen mit Task 2)

## Known Stubs

Keine — alle Pagination-Daten kommen aus echten DB-Queries.

## Threat Surface Scan

Keine neuen Bedrohungsflächen außer den im Plan dokumentierten STRIDE-Threats T-10-03-01 bis T-10-03-04. Alle mitigiert durch:
- Zod-Validierung mit `.safeParse()` → HTTP 400
- Parametrisierte Neon-Queries → kein SQL-Injection
- `limit` max 100 → kein DoS durch LIMIT 1000000

## Self-Check: PASSED

- FOUND: src/app/api/parts/route.ts
- FOUND: src/app/admin/CatalogTable.tsx
- FOUND: commit 1a234aa (feat(10-03): GET /api/parts — serverseitige Pagination)
- FOUND: commit 9ca7f3c (feat(10-03): CatalogTable serverseitige Pagination refactoring)
