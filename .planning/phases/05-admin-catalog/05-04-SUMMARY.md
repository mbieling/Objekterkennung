---
phase: 05-admin-catalog
plan: 04
subsystem: ui
tags: [nextjs, react, typescript, shadcn, react-hook-form, zod, sonner, tailwind]

# Dependency graph
requires:
  - phase: 05-admin-catalog
    plan: 02
    provides: "GET /api/parts — liefert alle parts-Zeilen ohne embedding-Feld"
  - phase: 05-admin-catalog
    plan: 03
    provides: "PATCH/DELETE/archive/retry API-Routes"
  - phase: 04-ingestion-ui
    plan: 05
    provides: "UploadForm.tsx als Analog für react-hook-form + Zod + StatusBadge-Pattern"
provides:
  - "GET /admin Route: Server Component Shell (page.tsx)"
  - "CatalogTable Client-Komponente: Tabelle mit Tabs/Suche/Pagination/Edit-Sheet/Archive/Delete/Retry"
  - "StatusBadge-Hilfsfunktion mit exaktem Farbmapping (ready/pending/processing/failed/archived)"
  - "Optimistic Updates mit Rollback für alle Mutations (archive, delete, retry, save)"
affects: [05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optimistic-Update-Pattern mit Rollback: Original sichern → State sofort aktualisieren → API-Call → bei Fehler Rollback + Toast"
    - "Debounce ohne externe Lib: useRef<ReturnType<typeof setTimeout>> + clearTimeout (300ms)"
    - "Thumbnail-URL-Cache: thumbnailUrls Record<string, string> im State, nur einmal pro Part-ID fetchen"
    - "Sheet bleibt nach Speichern offen (D-09): kein setSheetOpen(false) nach erfolgreichem PATCH"
    - "Edit-Sheet mit form.reset() beim Öffnen — synchronisiert Form-State mit gewähltem Part"

key-files:
  created:
    - src/app/admin/page.tsx
    - src/app/admin/CatalogTable.tsx
  modified: []

key-decisions:
  - "Header-Row (h1 + Upload-Link) gehört in CatalogTable, nicht in page.tsx — CatalogTable kennt den State (Sheet etc.) und ist die einzige Client-Komponente auf der Seite"
  - "archived-Status im Edit-Sheet-Formular nicht auswählbar (nur pending/processing/ready/failed) — Archivierung bleibt dedizierter Archivieren-Aktion vorbehalten (D-10, RESEARCH.md Pitfall 4)"
  - "status === 'failed' ergibt 3 Treffer im grep (StatusBadge, Dropdown-Sichtbarkeit, Form-Reset-Guard) — alle korrekt und notwendig"

patterns-established:
  - "Composable-Filter-Pattern: Tab-Filter und Suche sind unabhängige .filter()-Aufrufe in Kette — bei Tab-Wechsel oder Suche wird currentPage auf 1 zurückgesetzt"
  - "Thumbnail-Fetch mit eslint-disable-next-line für thumbnailUrls in Deps-Array — verhindert Endlosschleife bei URL-Update"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04]

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 5 Plan 04: CatalogTable Admin-UI Summary

**Admin-Katalog mit Tabelle (Tabs/Suche/Pagination), Edit-Sheet (react-hook-form + Zod), Archive/Delete/Retry-Aktionen und Optimistic Updates — alle 4 ADMIN-Anforderungen in einer Client-Komponente**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-09T05:36:00Z
- **Completed:** 2026-05-09T05:44:47Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `src/app/admin/page.tsx` als Server Component Shell ohne `'use client'` — max-w-7xl für Tabellen-Breite
- `src/app/admin/CatalogTable.tsx` mit vollständiger Interaktionslogik: 5 Status-Tabs, Freitext-Suche mit Debounce, 20-Zeilen-Pagination, Dropdown-Menü mit 4 Aktionen
- Edit-Sheet mit react-hook-form + Zod, bleibt nach Speichern offen (D-09), Root-Fehler inline
- AlertDialog für Löschen mit korrektem Deutsch-Copy aus UI-SPEC Copywriting Contract
- Optimistic Updates mit Rollback für archive, delete, retry und save
- Thumbnail-URL-Cache verhindert Burst-Requests; lazy loading via `loading="lazy"`

## Task Commits

1. **Task 1: Admin-Page Server Component** - `dd302b3` (feat)
2. **Task 2: CatalogTable Client-Komponente** - `867bcba` (feat)

## Files Created/Modified
- `src/app/admin/page.tsx` — Server Component Shell; kein 'use client'; importiert CatalogTable; max-w-7xl; Metadata 'Teile-Katalog — Bauteil-Finder'
- `src/app/admin/CatalogTable.tsx` — Client-Komponente (761 Zeilen); alle ADMIN-01 bis ADMIN-04 Anforderungen; vollständige JSX-Struktur mit Sheet, AlertDialog, Tabs, Table, Pagination

## Decisions Made
- Header (h1 + Upload-Link) in CatalogTable statt page.tsx: CatalogTable ist die einzige Client-Komponente, kennt den Sheet-State und ist der natürliche Ort für interaktive Header-Elemente
- `archived` nicht im Edit-Schema-Enum: RESEARCH.md Pitfall 4 — Archivierung nur via dedizierter /archive-Route (D-10)
- `eslint-disable-next-line` für Thumbnail-useEffect-Deps: `thumbnailUrls` aus dem Deps-Array wegzulassen ist bewusste Entscheidung um Endlosschleifen zu verhindern (gecachte URLs triggern sonst erneute Fetches)

## Deviations from Plan

Keine — Plan wurde exakt wie spezifiziert ausgeführt.

## Known Stubs

Keine — alle Interaktionspfade sind mit echten API-Calls verbunden.

## Threat Flags

Keine neue Threat Surface über den Plan hinaus.

## Issues Encountered
- Keine.

## User Setup Required
None — keine externen Services konfiguriert.

## Next Phase Readiness
- `/admin`-Route ist vollständig implementiert und baut fehlerfrei
- CatalogTable konsumiert GET /api/parts, PATCH, DELETE, /archive und /retry
- Plan 05-05 (E2E-Checkpoint) kann direkt fortgesetzt werden

---
*Phase: 05-admin-catalog*
*Completed: 2026-05-09*
