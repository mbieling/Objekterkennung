---
phase: 09-part-detail
plan: "02"
subsystem: api-endpoints
tags: [wave-1, api, s3, presigned-urls, uuid-validation]
dependency_graph:
  requires:
    - "09-01: Wave-0 Test-Stubs (API-Verzeichnisse angelegt)"
  provides:
    - src/app/api/parts/[id]/route.ts (GET-Handler D-12)
    - src/app/api/parts/[id]/thumbnails/route.ts (D-13)
    - src/app/api/parts/[id]/download/route.ts (D-14)
  affects:
    - "Plan 09-03: Wave 2 nutzt alle 3 Endpoints via usePartDetail-Hook"
    - "Plan 09-04: Wave 3 E2E-Tests validieren alle 3 Endpoints"
tech_stack:
  added: []
  patterns:
    - "GET-Handler in bestehender route.ts ergänzt (ParamsSchema wiederverwendet)"
    - "Promise.all für parallele S3-Presigned-URL-Generierung (nicht sequenziell)"
    - "HeadObject-Guard vor getSignedUrl (Race-Condition-Schutz)"
    - "sanitizeFilename: replace(/\\s+/g, '_').replace(/[^a-zA-Z0-9_\\-\\.]/g, '') || 'bauteil'"
    - "UUID-Validierung als erste Operation in allen 3 Handlern (T-09-01 bis T-09-03)"
key_files:
  created:
    - src/app/api/parts/[id]/thumbnails/route.ts
    - src/app/api/parts/[id]/download/route.ts
  modified:
    - src/app/api/parts/[id]/route.ts
decisions:
  - "thumbnails-Endpoint gibt { urls: [] } bei status!=ready (kein 409) — Client rendert Skeleton-Strip (D-11)"
  - "Download-Endpoint: 409 bei status!=ready, 404 bei STEP-Datei fehlt (unterschiedliche Fehlerpfade)"
  - "Einzelne fehlende Views in thumbnails werden übersprungen — Rest trotzdem zurückgegeben"
  - "Download TTL 300s (5min) statt 60s — STEP-Dateien bis 100MB benötigen ausreichend Zeit"
metrics:
  duration: "~15 Minuten"
  completed_date: "2026-05-09"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 9 Plan 02: API-Endpoints Wave 1 Summary

**One-liner:** Drei REST-Endpoints für Part-Detail — GET Metadaten (D-12), GET Thumbnails-Array als Presigned URLs mit Promise.all (D-13), GET STEP-Download-URL mit sanitizeFilename und Content-Disposition (D-14).

## Was wurde gebaut

Wave-1-API-Grundlage für Phase 9 (Part Detail): Drei funktionsfähige API-Endpoints implementiert, die alle Daten für die `/parts/[id]`-Detailseite bereitstellen. UUID-Validierung ist in allen Handlern die erste Operation (Threat T-09-01 bis T-09-03). Die Endpoints folgen exakt den etablierten Patterns aus `thumbnail/route.ts` (Phase 4).

## Erledigte Tasks

| Task | Name | Commit | Dateien |
|------|------|--------|---------|
| 1 | GET /api/parts/[id] (D-12) + GET /api/parts/[id]/thumbnails (D-13) | 9ffe0c7 | src/app/api/parts/[id]/route.ts, src/app/api/parts/[id]/thumbnails/route.ts |
| 2 | GET /api/parts/[id]/download (D-14) | 5ce5526 | src/app/api/parts/[id]/download/route.ts |

## Implementierte Endpoints und Response-Contracts

### GET /api/parts/[id] (D-12)

```
400 { error: "Invalid id", details: ... }   — ungültige UUID
404 { error: "Part not found" }              — UUID nicht in DB
200 { part: { id, name, part_number, project, status, thumbnail_count, created_at } }
```

### GET /api/parts/[id]/thumbnails (D-13)

```
400 { error: "Invalid id", details: ... }   — ungültige UUID
404 { error: "Part not found" }              — UUID nicht in DB
200 { urls: [] }                             — status != ready oder thumbnail_count = 0
200 { urls: ["https://s3...", ...] }         — bis zu thumbnail_count Presigned URLs (60s TTL)
```

Fehlende einzelne Views (S3-Fehler) werden übersprungen, Rest wird zurückgegeben.

### GET /api/parts/[id]/download (D-14)

```
400 { error: "Invalid id", details: ... }   — ungültige UUID
404 { error: "Part not found" }              — UUID nicht in DB
409 { error: "Not ready" }                   — status != ready
404 { error: "STEP file missing" }           — S3-Datei nicht vorhanden
500 { error: "Failed to generate download URL" } — S3-Fehler
200 { url: "https://s3...", filename: "Flansch_M12.step" } — 300s TTL
```

## Bestätigter Build-Status

TypeScript-Fehler in neuen Dateien: **keine** (`tsc --noEmit` zeigt keine Fehler in den neuen Dateien)

Pre-existierende Fehler in anderen Dateien (archive/route.test.ts, retry/route.test.ts, SearchResultCard.test.tsx, phase-08 Playwright): **unverändert** — nicht durch diese Wave verursacht.

Build (`npm run build`): Kompiliert erfolgreich (`✓ Compiled successfully`). Laufzeitfehler wegen fehlender `DATABASE_URL` ist pre-existierendes Verhalten in der Build-Umgebung — alle DB-Routen betroffen, nicht nur neue.

## Sicherheitsmaßnahmen (UUID-Validierung bestätigt)

| Endpoint | UUID-Validierung | Reihenfolge |
|----------|-----------------|-------------|
| GET /api/parts/[id] | ParamsSchema.safeParse → zuerst | Zeile 16 (vor db-Query Zeile 25) |
| GET /api/parts/[id]/thumbnails | ParamsSchema.safeParse → zuerst | Zeile 23 (vor db-Query Zeile 32) |
| GET /api/parts/[id]/download | ParamsSchema.safeParse → zuerst | Zeile 33 (vor db-Query Zeile 43) |

Threat T-09-01 bis T-09-03 (Path-Traversal + Header-Injection via `id`) vollständig mitigiert.

## Deviations from Plan

Keine wesentlichen Abweichungen.

**Abweichung (Rule 3 — Blocking):** Worktree-Basisstand war auf dem Template-Commit `ef85ee7` (vor allen Projekt-Commits), nicht auf dem erwarteten Merge-Commit `0a75bb2`. `git reset --hard 0a75bb244135b09fb3c70019c860e9a153dbb37d` im Worktree ausgeführt um den korrekten Stand herzustellen. Alle Änderungen danach im Worktree durchgeführt.

**Hauptrepo-Nebeneffekt:** Die zwei neuen Dateien wurden zunächst versehentlich im Hauptrepo working tree erstellt (nicht committed). Da der Worktree nach dem Reset auf denselben Stand wie das Hauptrepo zeigt, sind die Änderungen im Hauptrepo working tree und im Worktree-Commit konsistent. Der Orchestrator muss das Hauptrepo-Working-Tree nach dem Worktree-Merge bereinigen.

## Threat Surface Scan

Keine neuen Surfaces ausserhalb des Threat-Modells. Die drei neuen Endpoints sind vollständig im STRIDE-Register (T-09-01 bis T-09-06) erfasst. Alle `mitigate`-Dispositionen umgesetzt.

## Self-Check: PASSED

| Check | Ergebnis |
|-------|---------|
| src/app/api/parts/[id]/route.ts (GET-Handler) | FOUND |
| src/app/api/parts/[id]/thumbnails/route.ts | FOUND |
| src/app/api/parts/[id]/download/route.ts | FOUND |
| Commit 9ffe0c7 | FOUND |
| Commit 5ce5526 | FOUND |
