---
phase: 07-camera-ui
plan: "03"
subsystem: camera-ui
tags: [homepage, navigation, unit-tests, wave-2, d-02, search-01, search-02]
dependency_graph:
  requires:
    - src/app/search/CameraCapture.tsx (Plan 07-02)
    - src/app/search/CameraCapture.test.tsx (Plan 07-01, 07-02)
  provides:
    - src/app/page.tsx (Homepage mit zwei Buttons)
  affects:
    - Nutzer-Navigation: Homepage → /search direkt erreichbar
    - Phase 8 (Results UI) — /search-Route vollständig navigierbar
tech_stack:
  added: []
  patterns:
    - "flex gap-4 flex-wrap justify-center für side-by-side Button-Layout"
    - "Button variant=outline für sekundäre Navigation"
key_files:
  created: []
  modified:
    - src/app/page.tsx
decisions:
  - "Task 2 war bereits in Plan 07-02 implementiert — alle 9 Tests wurden dort von it.todo zu vollständigen Tests konvertiert; Plan 07-03 Task 2 hatte keinen Delta"
metrics:
  duration: "~5 Minuten"
  completed: "2026-05-09"
  tasks_completed: 2
  files_created: 0
  files_modified: 1
---

# Phase 7 Plan 03: Homepage Navigation + CameraCapture Tests Summary

**One-liner:** Homepage mit zwei side-by-side Buttons (Teil hochladen primary, Teil suchen outline) zur direkten Navigation zu /upload und /search; alle 9 CameraCapture Unit-Tests grün bestätigt.

---

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Homepage — zweiter Button "Teil suchen" (D-02) | dd63f7e | src/app/page.tsx |
| 2 | CameraCapture.test.tsx — 9 Tests grün bestätigt | (kein neuer Commit nötig — bereits in 07-02 erledigt) | src/app/search/CameraCapture.test.tsx |

---

## What Was Built

### Task 1: src/app/page.tsx

Homepage-Erweiterung gemäß D-02 (UI-SPEC):

- **Zwei Buttons nebeneinander:** `flex gap-4 flex-wrap justify-center` Layout auf div-Wrapper
- **Button 1:** `Teil hochladen` (primary, kein variant) → `/upload` (unverändert)
- **Button 2:** `Teil suchen` (variant="outline") → `/search` (neu hinzugefügt)
- **Build:** Grün, `/search` als Static Route in Next.js-Build

### Task 2: CameraCapture.test.tsx (Verifikation)

Alle 9 Unit-Tests waren bereits in Plan 07-02 von `it.todo` zu vollständigen Tests konvertiert worden. Keine Änderung erforderlich:

- 0 `it.todo` Einträge
- 9 aktive `it(...)` Blöcke
- `mockGetUserMedia` Helper vorhanden (9 Aufrufe)
- `npm test -- src/app/search/CameraCapture.test.tsx` → 9 passed, 0 failed
- Gesamte Test-Suite: 70 Tests in 13 Dateien, alle grün

---

## Deviations from Plan

### Bereits implementierte Arbeit aus vorheriger Wave

**1. [Deviation — Kein Delta] Task 2: CameraCapture.test.tsx bereits in Plan 07-02 vollständig implementiert**
- **Found during:** Initiale Dateiprüfung
- **Issue:** Plan 07-03 Task 2 beschreibt die Konvertierung von 9 `it.todo` zu vollständigen Tests, aber dies wurde bereits in Plan 07-02 (Wave 1) durchgeführt
- **Impact:** Kein Delta-Commit nötig; Tests laufen bereits grün
- **Erklärung:** Der Wave-Split zwischen Plan 07-02 und 07-03 wurde so aufgeteilt, dass Task 2 technisch in Wave 1 vorweggenommen wurde
- **Status:** Acceptance Criteria 100% erfüllt (0 it.todo, 9 it() grün)

---

## Verification Results

| Command | Result |
|---------|--------|
| `grep -c "Teil suchen" src/app/page.tsx` | 2 (1× Kommentar, 1× JSX-Text — JSX-Anforderung erfüllt) |
| `grep -c 'href="/search"' src/app/page.tsx` | 1 |
| `grep -c 'variant="outline"' src/app/page.tsx` | 1 |
| `grep -c "flex gap-4 flex-wrap justify-center" src/app/page.tsx` | 1 |
| `grep -c "Teil hochladen" src/app/page.tsx` | 1 |
| `grep -c 'href="/upload"' src/app/page.tsx` | 1 |
| `npm run build` | Exit-Code 0, /search als Static Route |
| `npm test -- CameraCapture.test.tsx` | 9 passed, 0 failed |
| `npm test` (gesamte Suite) | 70 passed, 0 failed (13 Dateien) |

---

## Threat Surface Scan

Keine neuen Security-Surfaces. Navigation zu /search und /upload sind beide nicht authentifiziert — akzeptiert gemäß T-7-03-01 (beide Routen sind in Phase 7 öffentlich).

T-7-03-02 (Content-Type-Header-Regression) durch Test 5 geprüft: `fetchCall.headers` ist undefined.

---

## Self-Check: PASSED

- [x] `src/app/page.tsx` modifiziert mit zwei Buttons side-by-side
- [x] Commit dd63f7e existiert (Task 1)
- [x] 9/9 CameraCapture Unit-Tests grün
- [x] `npm run build` grün
- [x] Alle Acceptance Criteria erfüllt
- [x] Gesamte Test-Suite (70 Tests) grün — keine Regressionen
