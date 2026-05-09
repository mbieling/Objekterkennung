---
phase: 10-hardening
plan: "02"
subsystem: frontend
tags: [mobile-polish, touch-targets, error-messages, validation, ux]
dependency_graph:
  requires: [10-01]
  provides: [SC-2, SC-3]
  affects: [CameraCapture, UploadForm]
tech_stack:
  added: []
  patterns:
    - onChange-Dateivalidierung fuer sofortiges Nutzerfeedback (SC-3)
    - min-h-[44px] Touch-Target-Standard auf allen primären Buttons (SC-2)
    - HTTP-Fehler-Differenzierung per err.message.startsWith('HTTP ') im catch-Block
key_files:
  created: []
  modified:
    - src/app/search/CameraCapture.tsx
    - src/app/upload/UploadForm.tsx
decisions:
  - >
    "Suche fehlgeschlagen (Server-Fehler). Bitte erneut versuchen." als HTTP-Fehlertext
    ohne Statuscode — T-10-02-02 mitigiert: kein HTTP 500 im UI sichtbar
  - >
    onChange-Validierung als eigener handleFileChange-Handler, nicht inline in onSubmit —
    sauberere Trennung von sofortiger UX-Rueckmeldung und Submit-Guard
  - >
    onSubmit behaelt !file-Guard + if(fileError) return als Absicherung,
    entfernt aber die doppelten Groessen-/Format-Pruefungen
metrics:
  duration_minutes: 15
  completed: "2026-05-09"
  tasks_completed: 2
  files_changed: 2
---

# Phase 10 Plan 02: Mobile Polish + onChange-Validierung Summary

SC-2 Touch-Targets (min-h-[44px] auf 6 Buttons in CameraCapture, Submit in UploadForm) und SC-3 sofortige Dateigroessen-Validierung bei onChange statt erst beim Submit.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | CameraCapture.tsx — Touch-Targets + Fehlertexte (SC-2) | 7d44c01 | Done |
| 2 | UploadForm.tsx — onChange-Validierung + Submit Touch-Target (SC-2 + SC-3) | 76eb9c8 | Done |

## Changes Made

### Task 1: CameraCapture.tsx (SC-2)

**Gruppe A — Dateiformat-Fehlertext:**
- `'Nur Bilddateien erlaubt.'` → `'Nur Bilddateien (JPEG, PNG) erlaubt.'`

**Gruppe B — HTTP-Fehler-Differenzierung:**
- In `handleSearch` und `handleSearchWithLimit` je einen dritten Zweig ergaenzt:
  `err instanceof Error && err.message.startsWith('HTTP ')` → `'Suche fehlgeschlagen (Server-Fehler). Bitte erneut versuchen.'`
- Vorher wurden HTTP-Fehler als generische Netzwerkfehler dargestellt (irreführend)

**Gruppe C + D — Touch-Targets (min-h-[44px]):**
- FileInputTrigger ("Foto aus Galerie waehlen")
- Button "Kamera starten" (idle-State)
- Button "Suchen" (captured-State)
- Button "Wiederholen" (captured-State)
- Button "Neu aufnehmen" (result-State)
- Button "Neu aufnehmen" (error-State)
- Aufnahme-Button (`h-12` = 48px) bleibt unveraendert — bereits konform

### Task 2: UploadForm.tsx (SC-2 + SC-3)

**onChange-Validierung (SC-3):**
- Neuer `handleFileChange`-Handler direkt nach `handleReset`
- Groessenpruefung: `Diese Datei ist zu groß (X MB). Maximal erlaubt: 100 MB.` mit `Math.round`
- Formatpruefung: `Nur STEP-Dateien (.step, .stp) werden akzeptiert.`
- file-Input um `onChange={handleFileChange}` ergaenzt
- onSubmit: doppelte Groessen-/Format-Pruefungen entfernt, nur noch `!file`-Guard + `if (fileError) return`

**Touch-Target (SC-2):**
- Submit-Button: `className="w-full"` → `className="w-full min-h-[44px]"`
- file-Input hatte bereits `min-h-[44px]` (aus Plan 10-01)

## Deviations from Plan

None — Plan exakt wie beschrieben ausgefuehrt.

**Hinweis Build-Fehler:** `npm run build` schlaegt mit einem pre-existierenden Fehler in
`DESIGN-SYSTEM-files/components/EmptyState.tsx` (fehlendes `react-router-dom`) fehl.
Dieser Fehler ist nicht durch diesen Plan verursacht und war bereits im Base-Commit vorhanden.
Alle TypeScript-Fehler in `CameraCapture.tsx` und `UploadForm.tsx` sind sauber — verifiziert
via `tsc --noEmit --skipLibCheck` ohne Fehler in den geaenderten Dateien.

## Known Stubs

None.

## Threat Flags

None — alle Aenderungen sind rein UI-seitig; keine neuen Trust-Boundaries eröffnet.
T-10-02-02 (HTTP-Statuscode im Fehlertext) ist korrekt mitigiert: nur generischer Text,
kein Statuscode wird an den Nutzer weitergegeben.

## Self-Check: PASSED

- [x] `src/app/search/CameraCapture.tsx` vorhanden und geaendert (commit 7d44c01)
- [x] `src/app/upload/UploadForm.tsx` vorhanden und geaendert (commit 76eb9c8)
- [x] 6x `min-h-[44px]` in CameraCapture.tsx
- [x] `handleFileChange` + `Diese Datei ist zu groß` in UploadForm.tsx
- [x] `Submit-Button` mit `min-h-[44px]`
- [x] Beide Commits im git log verifiziert
