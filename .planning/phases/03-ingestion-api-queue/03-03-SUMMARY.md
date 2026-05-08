---
phase: 03-ingestion-api-queue
plan: "03"
subsystem: api
tags: [nextjs, typescript, zod, aws-s3, presigned-url, postgresql, neon, sha256, deduplication]

requires:
  - phase: 03-02
    provides: Vitest-Test-Stubs für POST /api/upload/init (5 Tests)
  - phase: 01-database-foundation
    provides: Neon DB mit parts-Tabelle (sha256-Index, status-Feld)

provides:
  - POST /api/upload/init — vollständig implementiert, alle 5 Tests grün
  - SHA-256-Deduplizierung (INGEST-04) mit HTTP 409 + existing_part_id
  - Presigned S3 PUT-URL (15 Minuten Ablauf, BUCKET_STEPS)
  - Zod-Validierung: name (Pflicht), sha256 (64 Hex-Zeichen), file_size_bytes (max 100 MB)

affects:
  - 03-04 (POST /api/upload/confirm — gleiche DB-Patterns, gleiche Imports)
  - 03-06 (E2E-Checkpoint — erste testbare API-Route)
  - 04-ingestion-ui (Upload-Form ruft diese Route auf)

tech-stack:
  added: []
  patterns:
    - "Neon tagged-template-literal SQL: db`SELECT id FROM parts WHERE sha256 = ${sha256} LIMIT 1`"
    - "AWS SDK v3 presigned URL: getSignedUrl(s3, new PutObjectCommand({...}), { expiresIn: 900 })"
    - "Zod safeParse + flatten() für strukturierte Validierungsfehler"
    - "SHA-256-Duplikat-Check VOR DB-Insert — verhindert unnötige Writes"

key-files:
  created:
    - src/app/api/upload/init/route.ts
  modified: []

key-decisions:
  - "ContentType nicht in signableHeaders — verhindert Content-Type-Mismatch beim Browser-Upload (Pitfall 1 aus RESEARCH.md)"
  - "step_file_path mit leerem String initialisiert — NOT NULL-Constraint erfordert Wert, sinnvoller Pfad erst nach S3-Upload"
  - "part_number und project optional via ?? null — saubere NULL-Speicherung statt leerer Strings"

patterns-established:
  - "Pattern: SHA-256-Check vor INSERT — kein unnötiger DB-Write bei Duplikat"
  - "Pattern: Zod-Validierung als erste Aktion in POST-Handler, vor jedem DB/S3-Call"
  - "Pattern: NextResponse.json() mit explizitem status-Code für alle Fehlertypen"

requirements-completed:
  - INGEST-04

duration: 5min
completed: 2026-05-08
---

# Phase 3 Plan 03: POST /api/upload/init Summary

**SHA-256-Deduplizierung mit HTTP 409 + Presigned S3 PUT-URL (900s) über Zod-validierte Next.js API-Route**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-08T09:17:00Z
- **Completed:** 2026-05-08T09:22:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- POST /api/upload/init implementiert — server-only, kein "use client"
- Alle 5 Vitest-Tests aus Plan 02 grün (5/5 passed, 691ms)
- SHA-256-Duplikat-Prüfung (INGEST-04): HTTP 409 mit existing_part_id bei bekanntem Hash
- Zod-Validierung: name (min 1), sha256 (64 Hex), file_size_bytes (max 100 MB), optional fields
- Presigned S3 PUT-URL mit 900s Ablauf, ContentType nicht in signableHeaders (Pitfall 1 vermieden)

## Task Commits

1. **Task 1: POST /api/upload/init — SHA-256-Dedup + DB-Insert + Presigned URL** - `52662b4` (feat)

**Plan metadata:** (folgt diesem Commit)

## Files Created/Modified

- `src/app/api/upload/init/route.ts` - POST-Handler: Zod-Validierung + SHA-256-Dedup + parts-Insert + Presigned S3 URL

## Decisions Made

- ContentType nicht in signableHeaders belassen: verhindert Content-Type-Mismatch beim Browser-direkt-Upload zu S3 (aus RESEARCH.md Pitfall 1)
- step_file_path mit leerem String initialisiert: NOT NULL-Constraint im Schema erzwingt Wert, echter Pfad wird erst nach Confirm-Route gesetzt
- part_number und project mit `?? null` auf NULL gemappt: vermeidet leere Strings in optionalen Feldern (D-08)

## Deviations from Plan

Keine — Plan exakt wie spezifiziert ausgeführt.

## Issues Encountered

Keine.

## Threat Surface Scan

Keine neuen Bedrohungsflächen jenseits des Threat Models in Plan 03-03 eingeführt:
- T-03-07 (Zod-Validierung): umgesetzt — sha256 Regex + file_size_bytes max(100MB)
- T-03-08 (Presigned URL Missbrauch): umgesetzt — expiresIn: 900, URL spezifisch für {part_id}/original.step
- T-03-09 (AWS-Credentials): umgesetzt — server-only, NEXT_PUBLIC_-frei

## Known Stubs

Keine — route.ts ist vollständig implementiert, kein Placeholder-Code.

## Next Phase Readiness

- POST /api/upload/init ist produktionsreif (alle Tests grün, TypeScript-clean)
- 03-04 (POST /api/upload/confirm) kann parallel gestartet werden — gleiche Import-Patterns
- 03-06 E2E-Checkpoint: erste API-Route für manuellen Test bereit

## Self-Check

- [x] `src/app/api/upload/init/route.ts` existiert
- [x] Commit `52662b4` existiert (feat(03-03))
- [x] 5/5 Tests grün
- [x] TypeScript-clean (keine Fehler in upload/init)
- [x] grep -c "use client" = 1 (nur im Kommentar, kein Directive)
- [x] grep -c "NEXT_PUBLIC_" = 0

## Self-Check: PASSED

---
*Phase: 03-ingestion-api-queue*
*Completed: 2026-05-08*
