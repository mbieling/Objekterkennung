---
phase: 07-camera-ui
plan: "02"
subsystem: camera-ui
tags: [camera, getUserMedia, state-machine, search, wave-1, client-component]
dependency_graph:
  requires:
    - src/app/search/CameraCapture.test.tsx (Plan 07-01)
    - src/app/api/search/route.ts (Plan 06-01)
  provides:
    - src/app/search/CameraCapture.tsx
    - src/app/search/page.tsx
  affects:
    - Phase 8 (Results UI) — erhält SearchResponse-JSON aus pre-Block
    - Plan 07-04 (E2E Wave 3) — aktiviert Playwright-Stubs für /search
tech_stack:
  added: []
  patterns:
    - "State Machine via useState<SearchPhase> — 7 States ohne external lib"
    - "getUserMedia mit facingMode ideal environment (kein Hard-Fail bei Frontkamera)"
    - "canvas.toBlob JPEG 0.85 + max 1024px Resize"
    - "AbortController 30s Timeout für fetch"
    - "FormData ohne Content-Type-Header (Browser setzt Boundary automatisch)"
    - "MIME-Typ-Check in handleFileSelect (T-7-01 Threat Mitigation)"
    - "HTMLCanvasElement.prototype.getContext Mock für jsdom (canvas.getContext gibt null zurück)"
key_files:
  created:
    - src/app/search/CameraCapture.tsx
    - src/app/search/page.tsx
  modified:
    - src/app/search/CameraCapture.test.tsx
decisions:
  - "HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) — jsdom gibt null zurück; Mock erforderlich damit captureFrame nicht crasht"
  - "canvas.toBlob bereits in Wave-0-Stubs gemockt — synchroner Callback-Aufruf funktioniert weiterhin"
  - "Named export { CameraCapture } konsistent mit UploadForm-Pattern und Test-Import"
metrics:
  duration: "~15 Minuten"
  completed: "2026-05-09"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 7 Plan 02: CameraCapture State Machine Summary

**One-liner:** Vollständige 7-State-Camera-Komponente mit getUserMedia, Canvas-Capture, FormData-Fetch, 30s AbortController und MIME-Validierung.

---

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CameraCapture.tsx — vollständige State Machine | 868adaa | src/app/search/CameraCapture.tsx (343 Zeilen), src/app/search/CameraCapture.test.tsx (221 Zeilen) |
| 2 | /search Server Component — page.tsx | 8142324 | src/app/search/page.tsx (21 Zeilen) |

---

## What Was Built

### Task 1: CameraCapture.tsx

Client Component mit vollständiger State Machine:

- **7 States:** idle → requesting → previewing → captured → searching → result | error
- **getUserMedia (D-03, D-04):** `{ video: { facingMode: { ideal: 'environment' } }, audio: false }` — kein Hard-Fail bei Frontkamera
- **Video-Element (D-07):** `playsInline muted autoPlay` + Framing-Overlay `inset-[10%] border-white/70`
- **captureFrame (D-08):** max 1024px Resize, `canvas.toBlob('image/jpeg', 0.85)`, `URL.createObjectURL` für Preview
- **handleSearch (D-09):** `fetch('/api/search', { method: 'POST', body: FormData })` ohne Content-Type-Header, `AbortController` mit 30_000ms Timeout
- **result-State (D-10):** JSON in `<pre>` als Placeholder für Phase 8 Results UI
- **error-State (D-11):** `Alert variant="destructive"` + "Neu aufnehmen"-Button
- **getUserMedia-Fehler (D-05):** Alert mit spezifischer Fehlermeldung; File-Input-Trigger weiterhin sichtbar
- **File-Input (D-06):** `accept="image/*"` dauerhaft im DOM; Trigger-Button in allen States außer searching
- **MIME-Typ-Check (T-7-01):** `file.type.startsWith('image/')` in handleFileSelect vor Blob-Zuweisung

Unit-Tests: 9/9 grün (von it.todo zu vollständigen Tests konvertiert)

### Task 2: page.tsx

Server Component `/search`:
- Kein `'use client'` — bleibt server-side
- Metadata: `title: 'Bauteil suchen — Bauteil-Finder'`
- Layout: `max-w-md mx-auto py-8 px-4` (UI-SPEC-konform)
- `h1 "Bauteil fotografieren"` (D-01 Copywriting-Kontrakt)
- `<CameraCapture />` eingebunden

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] canvas.getContext('2d') gibt in jsdom null zurück**
- **Found during:** Task 1 — erste Test-Ausführung
- **Issue:** `captureFrame()` ruft `canvas.getContext('2d')!.drawImage(...)` auf; jsdom gibt `null` zurück → TypeError
- **Fix:** `HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))` in CameraCapture.test.tsx ergänzt
- **Files modified:** src/app/search/CameraCapture.test.tsx
- **Commit:** 868adaa (zusammen mit der Implementierung)

---

## TDD Gate Compliance

| Gate | Status |
|------|--------|
| RED | Plan 07-01 Wave-0-Stubs (9× it.todo) — separater Commit fb2ce61 |
| GREEN | Implementierung + Test-Konvertierung — Commit 868adaa |
| REFACTOR | Nicht erforderlich — Code ist bereits sauber |

---

## Verification Results

| Command | Result |
|---------|--------|
| `npm test -- src/app/search/CameraCapture.test.tsx` | 9/9 passed |
| `npm run build` | Grün — /search als Static Route |
| Acceptance Criteria | 12/12 OK (CameraCapture.tsx) + 6/6 OK (page.tsx) |

---

## Known Stubs

| File | Stub | Reason | Resolved In |
|------|------|--------|-------------|
| src/app/search/CameraCapture.tsx | result-State zeigt JSON in `<pre>` | D-10 explizit als Placeholder definiert | Plan 08 (Results UI) |

---

## Threat Surface Scan

Keine neuen unerwarteten Security-Surfaces. Implementierte Threat-Mitigationen:

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-7-01 | `file.type.startsWith('image/')` in handleFileSelect | Implementiert |
| T-7-04 | AbortController 30_000ms | Implementiert |
| T-7-02 | Canvas max 1024px | Implementiert |
| T-7-03 | Browser erzwingt HTTPS/localhost | Accept (kein Code) |

---

## Self-Check: PASSED

- [x] `src/app/search/CameraCapture.tsx` existiert (343 Zeilen > min_lines 200)
- [x] `src/app/search/page.tsx` existiert (21 Zeilen > min_lines 20)
- [x] Commit 868adaa existiert (Task 1)
- [x] Commit 8142324 existiert (Task 2)
- [x] 9/9 Unit-Tests grün
- [x] `npm run build` grün
- [x] Alle Acceptance Criteria erfüllt
