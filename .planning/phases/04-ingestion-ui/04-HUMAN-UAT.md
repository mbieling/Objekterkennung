---
status: partial
phase: 04-ingestion-ui
source: [04-VERIFICATION.md]
started: 2026-05-08T20:40:00Z
updated: 2026-05-08T20:40:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. SC2 — Echtzeit-Status-Update (pending → processing → ready)
expected: Badge wechselt sichtbar von "Ausstehend" → "Wird verarbeitet…" → "Bereit" während der Worker die STEP-Datei verarbeitet. Polling stoppt automatisch bei "Bereit". Erfordert Docker-Worker (`docker-compose up -d`).
result: [pending]

### 2. SC3 — Thumbnail erscheint ohne Page-Reload
expected: Nach Status "Bereit" erscheint das Bauteil-Thumbnail (192×192 px) ohne Seitenneuladen. Danach erscheint der "Neuer Upload"-Button (D-10). Skeleton bleibt sichtbar bis Thumbnail geladen ist.
result: [pending]

### 3. SC4 — Duplikat-Alert E2E
expected: Dieselbe STEP-Datei ein zweites Mal hochladen → roter Inline-Alert "Diese Datei existiert bereits — Teil-ID: `<uuid>`" erscheint. Kein Status-Tracker, Form bleibt editierbar.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
