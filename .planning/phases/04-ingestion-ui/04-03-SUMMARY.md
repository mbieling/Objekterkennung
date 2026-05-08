---
phase: 04-ingestion-ui
plan: "03"
subsystem: api
tags: [thumbnail, presigned-url, s3, tdd, wave-1]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [GET /api/parts/[id]/thumbnail]
  affects: [04-05-UploadForm]
tech_stack:
  added: []
  patterns: [GetObjectCommand, HeadObjectCommand, getSignedUrl 60s, Zod UUID validation]
key_files:
  created:
    - src/app/api/parts/[id]/thumbnail/route.ts
  modified:
    - src/app/api/parts/[id]/thumbnail/route.test.ts
decisions:
  - "HeadObjectCommand vor getSignedUrl — race-condition-safe (T-04-11)"
  - "expiresIn: 60 per D-08 — kein localStorage-Persist möglich"
  - "UUID-Validierung via Zod als erste Operation — Path-Traversal-Schutz (T-04-08)"
metrics:
  duration: "92s"
  completed: "2026-05-08"
  tasks_completed: 1
  files_created: 1
  files_modified: 1
---

# Phase 4 Plan 3: GET /api/parts/[id]/thumbnail Summary

**One-liner:** 60-Sekunden-Presigned-S3-GET-URL für `view_0.png` via HeadObject-race-condition-safe-Check und Zod-UUID-Validierung.

## What Was Built

`GET /api/parts/[id]/thumbnail` — der Endpunkt, der dem Browser einen kurzlebigen (60 s) Presigned-URL für die Frontansicht (`view_0.png`) aus dem privaten S3-Bucket liefert.

### Response-Matrix

| Bedingung | HTTP | Body |
|-----------|------|------|
| status=ready + S3-Objekt vorhanden | 200 | `{ url: "https://..." }` |
| Part nicht in DB | 404 | `{ error: "Part not found" }` |
| status !== ready | 409 | `{ error: "Thumbnail not ready" }` |
| Ungültige UUID | 400 | `{ error: "Invalid id", details: ... }` |
| S3-Objekt fehlt (race condition) | 404 | `{ error: "Thumbnail object missing" }` |

### Threat Mitigations Implemented

- **T-04-08** (Path-Traversal): `z.string().uuid()` lehnt nicht-UUID-Strings vor S3-Key-Konstruktion ab
- **T-04-09** (URL-Leak): 60s Lifetime — kein sinnvolles Fenster für Weitergabe
- **T-04-11** (Race Condition): `HeadObjectCommand` validiert S3-Objekt-Existenz vor `getSignedUrl` — liefert HTTP 404 statt 200 mit broken link

## TDD Gate Compliance

- RED: `test(04-03)` commit `69c1568` — 5 Tests aktiviert, alle failing (route.ts fehlte)
- GREEN: `feat(04-03)` commit `9ce88bc` — Implementation erstellt, alle 5 Tests grün
- REFACTOR: Nicht notwendig — Implementierung war clean

## Task Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| RED  | 69c1568 | test(04-03): add failing tests for GET /api/parts/[id]/thumbnail |
| GREEN | 9ce88bc | feat(04-03): implement GET /api/parts/[id]/thumbnail |

## Deviations from Plan

None — Plan wurde exakt wie geschrieben ausgeführt.

## Known Stubs

None — Endpunkt ist vollständig implementiert. Plan 05 (UploadForm) kann nach `status==='ready'` diesen Endpunkt aufrufen und `<img src={url}>` rendern.

## Threat Flags

Keine neuen Threat Surfaces — alle Mitigationen aus dem Plan-Threat-Register umgesetzt.

## Self-Check: PASSED

- [x] `src/app/api/parts/[id]/thumbnail/route.ts` existiert
- [x] `src/app/api/parts/[id]/thumbnail/route.test.ts` enthält kein `it.skip`
- [x] Commit `69c1568` (RED) existiert
- [x] Commit `9ce88bc` (GREEN) existiert
- [x] 5 Tests grün (20 total passed, 0 failed)
