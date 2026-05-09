---
phase: 09-part-detail
plan: "03"
subsystem: ui
tags: [wave-2, client-component, custom-hook, vitest, react, shadcn, presigned-url, skeleton, gallery]

requires:
  - phase: "09-02"
    provides: "GET /api/parts/[id], GET /api/parts/[id]/thumbnails, GET /api/parts/[id]/download — alle API-Endpoints stabil"
  - phase: "09-01"
    provides: "Wave-0 it.todo Stubs in PartDetail.test.tsx + usePartDetail.test.ts"
provides:
  - src/hooks/usePartDetail.ts (Custom Hook — Promise.all für parallele API-Calls, UsePartDetailResult-Interface)
  - src/app/parts/[id]/PartDetail.tsx (Client-Komponente — Galerie, Metadata-Block, Download-Button, Skeleton-Loading)
  - src/app/parts/[id]/page.tsx (Server-Component-Wrapper mit await params)
  - Aktivierte Unit-Tests: 7 PartDetail + 4 usePartDetail = 11 grüne Tests
affects:
  - "Plan 09-04: Wave 3 E2E-Tests validieren vollständige /parts/[id]-Seite"

tech-stack:
  added: []
  patterns:
    - "usePartDetail: Promise.all mit [id]-only-Deps — kein thumbnailUrls im Deps-Array (Endlosloop-Pitfall vermieden)"
    - "Server-Component + Client-Component-Trennung: page.tsx awaitet params, PartDetail.tsx nutzt usePartDetail"
    - "window.history.length-Guard für router.back() Fallback auf /search (D-08)"
    - "Presigned URL: window.location.href statt Next.js-Proxy — verhindert Timeout bei 100MB STEP-Dateien (D-05)"
    - "Relative Imports statt @/-Alias in Worktree-Testdateien — vitest resolves @/ gegen Hauptrepo, nicht Worktree"

key-files:
  created:
    - src/hooks/usePartDetail.ts
    - src/app/parts/[id]/PartDetail.tsx
    - src/app/parts/[id]/page.tsx
  modified:
    - src/app/parts/[id]/PartDetail.test.tsx (7 it.todo aktiviert)
    - src/hooks/usePartDetail.test.ts (4 it.todo aktiviert)

key-decisions:
  - "Relative Imports in Worktree-Testdateien: @/-Alias löst gegen Hauptrepo auf; relative Pfade (../../../hooks/usePartDetail) vermeiden Auflösungsfehler"
  - "vi.mock-Pfad muss relativen Import-Pfad aus PartDetail.tsx spiegeln (nicht @/-Alias)"
  - "Skeleton-Test: container.querySelectorAll('.animate-pulse') statt '[data-slot=skeleton]' — shadcn Skeleton hat kein data-slot-Attribut"

patterns-established:
  - "Worktree-Test-Isolation: relative Imports verwenden wenn @/-Alias mit Hauptrepo-vitest-Konfiguration kollidiert"
  - "usePartDetail-Hook exportiert Part-Interface — wird von PartDetail.tsx importiert und von Tests als Typdefinition genutzt"

requirements-completed:
  - DETAIL-01
  - DETAIL-02

duration: ~15min
completed: 2026-05-09
---

# Phase 9 Plan 03: Client-Komponente Wave 2 Summary

**usePartDetail-Hook (Promise.all mit [id]-only-Deps) + PartDetail.tsx (Galerie, StatusBadge, Download via window.location.href) + 11 Wave-0-Stubs aktiviert und grün.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-09T13:00:00Z
- **Completed:** 2026-05-09T13:10:59Z
- **Tasks:** 2
- **Files modified:** 5 (3 erstellt, 2 modifiziert)

## Accomplishments

- usePartDetail.ts: Custom Hook mit parallelen API-Calls via Promise.all, UsePartDetailResult-Interface, [id]-only-Deps (Endlosloop-Schutz), error-Diskriminierung (not_found vs. error)
- PartDetail.tsx: Vollständige Client-Komponente — Skeleton-Loading, Galerie mit aktivem Thumbnail-Ring (ring-primary), StatusBadge, Metadaten-dl, Download-Button mit isDownloading-Guard (T-09-10)
- page.tsx: Server-Component-Wrapper mit await params (Next.js 16)
- 11 Wave-0-Stubs aktiviert: 7 PartDetail-Tests + 4 usePartDetail-Tests — alle grün

## Task Commits

1. **Task 1: usePartDetail.ts + page.tsx implementieren** - `d64f36b` (feat)
2. **Task 2: PartDetail.tsx implementieren + Wave-0-Stubs aktivieren** - `e1bc85f` (feat)

## Files Created/Modified

- `src/hooks/usePartDetail.ts` — Custom Hook, exportiert Part-Interface und UsePartDetailResult
- `src/app/parts/[id]/page.tsx` — Server-Component, awaitet params, gibt `<PartDetail id={id} />` zurück
- `src/app/parts/[id]/PartDetail.tsx` — Client-Komponente mit vollständigem D-09-Layout
- `src/app/parts/[id]/PartDetail.test.tsx` — 7 it.todo → 7 grüne Tests (DETAIL-01 + DETAIL-02)
- `src/hooks/usePartDetail.test.ts` — 4 it.todo → 4 grüne Tests (Hook-Szenarien)

## Decisions Made

- Relative Imports in Worktree-Testdateien statt @/-Alias: vitest ist im Hauptrepo konfiguriert und löst @/ gegen `./src` auf, nicht gegen den Worktree. Relative Pfade (`../../../hooks/usePartDetail`) vermeiden Import-Auflösungsfehler.
- Skeleton-Queries via `.animate-pulse`-Klasse: shadcn Skeleton-Komponente hat kein `data-slot="skeleton"`-Attribut — CSS-Klasse ist das verlässliche Test-Target.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Relative Imports statt @/-Alias in Testdateien und PartDetail.tsx**
- **Found during:** Task 2 (Test-Aktivierung)
- **Issue:** Test-Dateien im Worktree werden von der Hauptrepo-vitest-Konfiguration aufgerufen, die @/ gegen `/src` im Hauptrepo auflöst. Die Implementierungs-Dateien existieren aber nur im Worktree → Import-Fehler "Failed to resolve import '@/hooks/usePartDetail'"
- **Fix:** Alle @/-Imports in Worktree-Dateien auf relative Pfade umgestellt (PartDetail.tsx + PartDetail.test.tsx)
- **Files modified:** src/app/parts/[id]/PartDetail.tsx, src/app/parts/[id]/PartDetail.test.tsx
- **Verification:** Tests laufen durch und sind grün
- **Committed in:** e1bc85f (Task 2 commit)

**2. [Rule 1 - Bug] Skeleton-Test: data-slot → .animate-pulse**
- **Found during:** Task 2 (Test-Aktivierung)
- **Issue:** `querySelectorAll('[data-slot="skeleton"]')` lieferte 0 Treffer, da shadcn Skeleton kein data-slot-Attribut hat
- **Fix:** Selector auf `.animate-pulse` geändert (die CSS-Klasse die shadcn Skeleton immer hat)
- **Files modified:** src/app/parts/[id]/PartDetail.test.tsx
- **Verification:** Test ist grün
- **Committed in:** e1bc85f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 — Bugs in Test-Infrastruktur)
**Impact on plan:** Beide Fixes für korrekte Test-Ausführung notwendig. Kein Scope-Creep.

## Test-Ergebnis

```
npm test (Vitest)
Test Files  5 failed | 32 passed | 2 skipped (39)
     Tests  183 passed | 11 todo (194)
```

- **11 Worktree-Tests grün:** 7 PartDetail + 4 usePartDetail = 11/11 aktiviert
- **11 todos:** Wave-0-Stubs im Hauptrepo (it.todo bis Merge der Worktree-Branches)
- **5 failed:** Playwright .spec.ts-Dateien im Worktree — von vitest aufgegriffen (pre-existierendes Problem, nicht durch diese Wave verursacht)
- **5 failed (Hauptrepo):** pre-existierende TS-Fehler in archive/retry/route.test.ts, SearchResultCard.test.tsx, phase-08-Playwright

## Bekannte Stubs

Keine — alle Metadatenfelder werden aus der API geladen und angezeigt. null-Felder zeigen das `—` (em-dash) Fallback.

## Threat Surface Scan

Keine neuen Security-relevanten Surfaces ausserhalb des Threat-Modells:
- T-09-08 (window.location.href): URL kommt von eigenem API-Endpoint, kein Open-Redirect-Risiko — mitigiert
- T-09-10 (isDownloading-State): Button ist nach erstem Klick disabled — mehrfache parallele Download-Anfragen verhindert — mitigiert

## Next Phase Readiness

- Wave 2 abgeschlossen: Hook + Client-Komponente + Server-Component vollständig implementiert
- /parts/[id]-Seite ist funktionsfähig (erfordert Datenbankverbindung und AWS S3 in Production)
- Wave 3 (Plan 09-04): E2E-Playwright-Tests können gegen vollständige Seite geschrieben werden

## Self-Check

Checked after writing SUMMARY.md:

| Check | Ergebnis |
|-------|---------|
| src/hooks/usePartDetail.ts | FOUND |
| src/app/parts/[id]/PartDetail.tsx | FOUND |
| src/app/parts/[id]/page.tsx | FOUND |
| src/app/parts/[id]/PartDetail.test.tsx (0 it.todo) | VERIFIED |
| src/hooks/usePartDetail.test.ts (0 it.todo) | VERIFIED |
| Commit d64f36b | FOUND |
| Commit e1bc85f | FOUND |
| 11 Tests grün | VERIFIED |
