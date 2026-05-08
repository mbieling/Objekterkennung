---
phase: 04-ingestion-ui
plan: "02"
subsystem: api
tags: [status-polling, api-route, tdd, uuid-validation, neon]
dependency_graph:
  requires: [04-01]
  provides: [GET /api/parts/[id]/status]
  affects: [04-04-usePartStatus-hook, 04-05-upload-form]
tech_stack:
  added: []
  patterns: [tagged-template-sql, zod-uuid-validation, next16-async-params]
key_files:
  created:
    - src/app/api/parts/[id]/status/route.ts
  modified:
    - src/app/api/parts/[id]/status/route.test.ts
decisions:
  - "Next.js 16 async params-Pattern (Promise<{ id: string }>) aus RESEARCH.md Pitfall 1 übernommen"
  - "UUID-Validierung via z.string().uuid() als erste Operation (Threat T-04-04 mitigiert)"
  - "null-safe thumbnail_count ?? 0 für Rückwärtskompatibilität mit alten Rows"
metrics:
  duration: "10 min"
  completed: "2026-05-08"
  tasks_completed: 1
  files_changed: 2
---

# Phase 4 Plan 02: GET /api/parts/[id]/status Summary

**One-liner:** Status-Polling-Endpunkt mit UUID-Validierung via Zod, tagged-template SQL-Select und 3 aktivierten Vitest-Tests (TDD RED→GREEN).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | GET /api/parts/[id]/status implementiert + Tests aktiviert | e9b36b1 | route.ts (neu), route.test.ts (aktiviert) |

## What Was Built

`GET /api/parts/[id]/status` — der Polling-Endpunkt, den `usePartStatus` (Plan 04) aufruft:

- **HTTP 200:** Gibt `{status, thumbnail_count}` zurück wenn Part gefunden
- **HTTP 404:** `{error: 'Part not found'}` für unbekannte UUIDs
- **HTTP 400:** `{error: 'Invalid id', details: ...}` für ungültige UUID-Formen — DB wird nie berührt

Alle 3 Wave-0-Test-Stubs aus Plan 01 aktiviert (0 `it.skip` verbleibend).

## TDD Gate Compliance

- RED: Tests aktiviert (it.skip → it) — schlugen fehl weil route.ts fehlte
- GREEN: route.ts erstellt — alle 3 Tests grün (3 passed, 0 failed, 0 skipped)
- REFACTOR: nicht notwendig — Code direkt aus Planvorlage sauber

## Deviations from Plan

Keine — Plan exakt wie geplant ausgeführt.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: path-traversal mitigated | route.ts | params.id via z.string().uuid() validiert vor DB-Zugriff (T-04-04) |

Keine neuen, unmitigierten Threat-Surfaces eingeführt. Alle Threats aus Plan-Threat-Register sind durch Implementierung abgedeckt.

## Self-Check: PASSED

- [x] src/app/api/parts/[id]/status/route.ts existiert
- [x] Commit e9b36b1 existiert
- [x] 3 Tests grün (0 failed, 0 skipped)
- [x] 0 NEXT_PUBLIC_ in route.ts
- [x] 0 it.skip in route.test.ts
