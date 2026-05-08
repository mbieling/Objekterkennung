---
phase: 04-ingestion-ui
plan: 05
subsystem: ui
tags: [react, react-hook-form, zod, shadcn, xhr, crypto-subtle, web-crypto, state-machine, polling]

# Dependency graph
requires:
  - phase: 04-01
    provides: Wave-0-Test-Stubs für UploadForm.test.tsx
  - phase: 04-02
    provides: GET /api/parts/[id]/status-Route
  - phase: 04-03
    provides: GET /api/parts/[id]/thumbnail-Route
  - phase: 04-04
    provides: usePartStatus-Hook (Polling 2s/5s, 5-Min-Timeout)
  - phase: 03
    provides: POST /api/upload/init und POST /api/upload/confirm Endpunkte
provides:
  - UploadForm.tsx — Client-Komponente mit vollständigem 5-Phasen-Zustandsautomaten
  - SHA-256-Berechnung im Browser via crypto.subtle.digest (vor Init-Request)
  - XHR-PUT zu S3 mit Progress-Events (kein Content-Type-Header per Pitfall 4)
  - Duplikat-Alert (HTTP 409) mit existing_part_id Inline-Anzeige
  - Thumbnail-Darstellung nach status='ready' mit 'Neuer Upload'-Reset-Flow
  - 6 aktivierte und grüne Vitest-Tests für UploadForm
affects: [04-06, phase-05-admin-catalog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UploadPhase-State-Machine: 10 Phasen (idle|hashing|initializing|uploading|confirming|polling|ready|failed|duplicate|error)"
    - "XHR-PUT ohne Content-Type-Header für Presigned-S3-URLs"
    - "Browser-SHA-256 via crypto.subtle.digest + ArrayBuffer"
    - "File-Input uncontrolled (useRef) neben react-hook-form für Textfelder"
    - "makeFile-Test-Hilfsfunktion mit Object.defineProperty auf File (nicht Blob)"

key-files:
  created:
    - src/app/upload/UploadForm.tsx
  modified:
    - src/app/upload/UploadForm.test.tsx

key-decisions:
  - "OQ2 RESOLVED: Status-Select-Feld aus Phase-4-Formular entfernt — Init-Endpoint hardcoded 'pending'"
  - "makeFile-Fix auf File-Objekt: Object.defineProperty muss auf File (nicht Blob) gesetzt werden für korrekte size-Simulation"
  - "fireEvent.change statt fireEvent.input für react-hook-form-Kompatibilität in Tests"

patterns-established:
  - "Pattern: File-Input immer uncontrolled (useRef) + manuelle Validierung im onSubmit"
  - "Pattern: XHR ohne setRequestHeader('Content-Type') bei S3-Presigned-PUT"
  - "Pattern: UploadPhase-Union-Type als Single-Source-of-Truth für UI-Phasen"

requirements-completed:
  - INGEST-01
  - INGEST-02

# Metrics
duration: 25min
completed: 2026-05-08
---

# Phase 4 Plan 05: UploadForm.tsx Summary

**UploadForm.tsx als vollständiger 10-Phasen-Zustandsautomat mit Browser-SHA-256, XHR-S3-PUT mit Progress, usePartStatus-Polling-Integration und Duplikat-Alert (6/6 Tests grün)**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-08T19:43:00Z
- **Completed:** 2026-05-08T19:50:00Z
- **Tasks:** 1 (TDD)
- **Files modified:** 2

## Accomplishments

- `UploadForm.tsx` (455 Zeilen) implementiert vollständigen 5-stufigen Upload-Flow als Phasen-Automat
- SHA-256 via `crypto.subtle.digest` vor Init-Request — verhindert 100 MB Übertragung vor Dedup-Check
- XHR PUT zu S3 mit `xhr.upload.addEventListener('progress')` — kein `Content-Type`-Header (Pitfall 4 umgangen)
- usePartStatus-Hook integriert — zeigt pending→processing→ready-Flow mit Status-Badge und deutschen Beschreibungen
- HTTP 409 Duplikat-Alert mit `existing_part_id` inline, Form bleibt editierbar (D-11)
- Thumbnail via `GET /api/parts/[id]/thumbnail` nach status='ready', 'Neuer Upload'-Button erst nach Thumbnail-Load (D-10)
- 6 Vitest-Tests von `it.skip`-Stubs zu grünen Tests aktiviert

## Task Commits

1. **Task 1: UploadForm.tsx implementieren + Tests aktivieren** — `6221fa4` (feat)

## Files Created/Modified

- `src/app/upload/UploadForm.tsx` — Client-Komponente mit Phasen-State-Machine, react-hook-form, XHR-Upload, usePartStatus-Integration (455 Zeilen)
- `src/app/upload/UploadForm.test.tsx` — 6 Wave-0-Tests aktiviert und grün

## Decisions Made

- **OQ2 RESOLVED (aus 04-RESEARCH.md):** Status-Select-Feld aus dem Formular entfernt. Init-Endpoint akzeptiert keinen `status`-Parameter und hardcoded 'pending'. Feld kommt in Phase 5 (Admin-Katalog).
- **Phasen-State-Machine**: `duplicate`-Phase lässt Form editierbar; `error`-Phase zeigt Alert im Form-Bereich; `showStatusTracker` nur bei aktiven Upload-/Polling-Phasen sichtbar.
- **File-Input uncontrolled**: File außerhalb react-hook-form mit `useRef`, manuelle Größen-/Extension-Validierung im `onSubmit`-Handler vor SHA-256.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] makeFile-Test-Hilfsfunktion: size auf File-Objekt setzen, nicht auf Blob**
- **Found during:** Task 1 (Test-Ausführung, Test 2 "validates file size" schlug fehl)
- **Issue:** Der Plan-Template setzt `Object.defineProperty(blob, 'size', ...)` auf dem Blob-Objekt. Beim Erstellen von `new File([blob], name)` nimmt das File-Objekt die tatsächliche Byte-Größe des Blob-Inhalts (max 100 Bytes), nicht den gefälschten Wert. Die Dateigrößen-Validierung im `onSubmit` lief daher nie an — die Datei erschien kleiner als 100 MB.
- **Fix:** `Object.defineProperty` auf dem `file`-Objekt (nach `new File(...)`) gesetzt statt auf dem Blob.
- **Files modified:** `src/app/upload/UploadForm.test.tsx`
- **Verification:** Test 2 "validates file size" zeigt jetzt korrekt "Datei überschreitet die maximale Größe von 100 MB."
- **Committed in:** 6221fa4 (Task 1 Commit)

**2. [Rule 1 - Bug] fireEvent.input → fireEvent.change für react-hook-form-Kompatibilität**
- **Found during:** Task 1 (Test-Analyse nach erstem Testlauf-Fehlschlag)
- **Issue:** Plan-Template verwendet `fireEvent.input(input, { target: { value: 'A' } })` für das Bezeichnung-Feld. React-hook-form registriert Wert-Änderungen aber über `onChange`-Events (nicht `input`). Mit `fireEvent.input` wird der DOM-Wert gesetzt, aber react-hook-form erhält nicht den Wert → `values.name` bleibt leer → Zod-Validierung schlägt fehl statt File-Validierung → falscher Fehler erscheint.
- **Fix:** `fireEvent.input` → `fireEvent.change` in Tests 2–5.
- **Files modified:** `src/app/upload/UploadForm.test.tsx`
- **Verification:** Tests 2–5 laufen korrekt durch.
- **Committed in:** 6221fa4 (Task 1 Commit)

---

**Total deviations:** 2 auto-fixed (beide Rule 1 — Bugs in Test-Hilfsfunktionen)
**Impact on plan:** Beide Fixes notwendig für korrekte Test-Ausführung. Keine Scope-Erweiterung. Produktions-Code (UploadForm.tsx) war nicht betroffen.

## Issues Encountered

Keine Probleme in der Produktionskomponente. Beide Bugs lagen in den Test-Hilfsfunktionen des Plan-Templates.

## User Setup Required

Keine externe Service-Konfiguration notwendig für diesen Plan.

## Next Phase Readiness

- `UploadForm.tsx` bereit für Plan 04-06 (page.tsx-Wrapper + Homepage-Link)
- Plan 04-06 kann `UploadForm` direkt importieren und in `src/app/upload/page.tsx` verwenden
- Human-Verify-Checkpoint nach Plan 04-06 kann vollständigen Upload-Flow manuell testen

---

*Phase: 04-ingestion-ui*
*Completed: 2026-05-08*
