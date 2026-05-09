---
phase: 07-camera-ui
plan: "01"
subsystem: test-infrastructure
tags: [vitest, playwright, camera-ui, wave-0, stubs]
dependency_graph:
  requires: []
  provides:
    - src/app/search/CameraCapture.test.tsx
    - tests/phase-07-camera-ui.spec.ts
  affects:
    - Phase 7 Wave 1 (Plan 07-02) — CameraCapture.tsx implementiert gegen diese Stubs
tech_stack:
  added: []
  patterns:
    - getUserMedia via Object.defineProperty(global.navigator, 'mediaDevices', ...) — jsdom-kompatibel
    - it.todo() für Vitest-Stubs (kein Skip, kein Fehler, nur todo-Status)
    - test.skip() mit leerem async-Body für Playwright (kein test.todo in Playwright 1.59.x)
    - canvas.toBlob via HTMLCanvasElement.prototype.toBlob = vi.fn(callback => callback(blob))
key_files:
  created:
    - src/app/search/CameraCapture.test.tsx
    - tests/phase-07-camera-ui.spec.ts
  modified: []
decisions:
  - "it.todo() statt test.skip für Vitest — korrekte todo-Semantik, kein falsches Überspringen"
  - "Object.defineProperty(global.navigator, 'mediaDevices', ...) — jsdom hat kein mediaDevices; direkte Zuweisung würde TypeError werfen"
  - "HTMLCanvasElement.prototype.toBlob als synchroner Mock — jsdom implementiert toBlob nicht, Mock triggert callback sofort"
metrics:
  duration: "~5 Minuten"
  completed: "2026-05-09"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 7 Plan 01: Test-Infrastruktur Wave 0 Summary

**One-liner:** Vitest-Stubs mit getUserMedia-Mock + Playwright-E2E-Stubs als Testgerüst vor jeder Produktionszeile.

---

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Vitest Unit Test Stubs — CameraCapture.test.tsx | fb2ce61 | src/app/search/CameraCapture.test.tsx (80 Zeilen) |
| 2 | Playwright E2E Stubs — phase-07-camera-ui.spec.ts | 4b14926 | tests/phase-07-camera-ui.spec.ts (35 Zeilen) |

---

## What Was Built

### Task 1: CameraCapture.test.tsx

Vitest-Testdatei mit vollständiger Mock-Infrastruktur für Phase 7:

- **getUserMedia-Mock-Helper** `mockGetUserMedia(success: boolean)` — via `Object.defineProperty(global.navigator, 'mediaDevices', ...)` da jsdom kein echtes `navigator.mediaDevices` bereitstellt. Mock-Stream mit `getTracks()` → `[{ stop: vi.fn() }]`.
- **canvas.toBlob Mock** — `HTMLCanvasElement.prototype.toBlob` gibt synchron einen JPEG-Blob zurück.
- **global.fetch Mock** — `vi.fn()` für POST /api/search.
- **9 it.todo-Stubs** für SEARCH-01, SEARCH-02, D-05 bis D-11.

### Task 2: phase-07-camera-ui.spec.ts

Playwright-E2E-Datei mit 7 `test.skip`-Guards:
- Abdeckung: /search Navigation, File-Input Sichtbarkeit, File-Upload, Homepage D-02 Buttons, Spinner D-09, JSON-Ergebnis D-10.
- Pattern identisch zu `tests/phase-04-upload.spec.ts` (etabliertes Projektmuster).

---

## Deviations from Plan

Keine — Plan wurde exakt wie geschrieben ausgeführt.

---

## Verification Results

| Command | Result |
|---------|--------|
| `npm test -- src/app/search/CameraCapture.test.tsx` | Exit 0 — 9 todos, 1 file skipped (kein Fehler) |
| `npx playwright test tests/phase-07-camera-ui.spec.ts --project=chromium` | Exit 0 — 7 skipped |

---

## Known Stubs

Diese Datei ist intentionell ein Stub-Plan. Alle `it.todo` und `test.skip` sind Platzhalter für Wave 1/3:

| File | Type | Resolved In |
|------|------|-------------|
| src/app/search/CameraCapture.test.tsx | 9 × it.todo | Plan 07-02 (Wave 1) |
| tests/phase-07-camera-ui.spec.ts | 7 × test.skip | Plan 07-04 (Wave 3) |

---

## Threat Surface Scan

Keine neuen Security-relevanten Surfaces — reine Test-Infrastruktur, kein Produktionscode.

---

## Self-Check: PASSED

- [x] `src/app/search/CameraCapture.test.tsx` existiert
- [x] `tests/phase-07-camera-ui.spec.ts` existiert
- [x] Commit fb2ce61 existiert (Task 1)
- [x] Commit 4b14926 existiert (Task 2)
- [x] 9 it.todo in CameraCapture.test.tsx
- [x] 7 test.skip in phase-07-camera-ui.spec.ts
- [x] Beide Test-Kommandos Exit-Code 0
