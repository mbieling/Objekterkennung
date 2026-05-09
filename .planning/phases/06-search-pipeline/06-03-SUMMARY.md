---
plan: 06-03
phase: 06-search-pipeline
status: complete
subsystem: search-api
tags: [pgvector, s3, worker, next.js, search]
requires:
  - 06-01
  - 06-02
provides:
  - POST /api/search endpoint
affects:
  - parts table (read)
  - BUCKET_THUMBNAILS (search-temp/ prefix)
tech-stack:
  added: []
  patterns:
    - pgvector cosine similarity with ::vector cast
    - S3 temp-key pattern with cleanup on all paths
    - AbortSignal.timeout for worker calls
key-files:
  created:
    - src/app/api/search/route.ts
  modified: []
decisions:
  - D-01 honored: synchronous POST /api/search (no Celery/queue)
  - D-02 honored: export const maxDuration = 30 module-level
  - D-03 honored: search-temp/{uuid}.jpg in BUCKET_THUMBNAILS
  - D-04 honored: synchronous fetch to /embed (not Celery)
  - D-06/07 honored: threshold=0.7, limit=10 defaults via Zod
  - D-12 honored: WHERE status='ready', no is_archived
  - Pitfall 1 mitigated: embeddingLiteral as string with ::vector cast
  - Pitfall 3 mitigated: threshold expression repeated in WHERE (not alias)
metrics:
  duration: ~15min
  completed: "2026-05-09"
  tasks: 1
  files: 1
---

# Phase 06 Plan 03: POST /api/search Route Summary

**One-liner:** Synchroner Search-Route-Handler mit S3-Temp-Upload, Worker-Embedding und pgvector Cosine-Similarity-Query (embeddingLiteral-String + ::vector Cast, Pitfall 1+3 adressiert).

## Was gebaut wurde

`POST /api/search` Next.js App Router Route Handler:

1. **Zod-Validierung** der Query-Parameter `threshold` (0–1, default 0.7) und `limit` (1–50, default 10) via `z.coerce.number()` für URL-String-Konvertierung.

2. **FormData-Parsing** mit Validierung des `image`-Feldes (File-Instanz-Check + MIME-Type-Prefix `image/`).

3. **S3 Temp-Upload** nach `search-temp/{crypto.randomUUID()}.jpg` in `BUCKET_THUMBNAILS` — serverseitig generierter Key (kein User-Input, kein Path-Traversal).

4. **Worker `/embed` Aufruf** via synchronem `fetch` mit `AbortSignal.timeout(28_000)` — 2s Puffer vor `maxDuration=30`.

5. **S3 Cleanup** (`cleanupTempS3`) auf ALLEN Fehler-Pfaden nach dem Upload (WORKER_URL fehlt, fetch-Fehler, Worker-HTTP-Fehler) und nach erfolgreichem Embedding.

6. **pgvector Cosine Query** mit korrektem `embeddingLiteral`-String (`[float,float,...]`) + `::vector`-Cast. Threshold-Filter wiederholt den vollständigen Ausdruck im WHERE (kein `similarity`-Alias). Filter: `WHERE status = 'ready'`, kein `is_archived`.

7. **D-11 Response Shape** mit `results[]` (similarity als `parseFloat(String(row.similarity))` wegen Neon Decimal-String) und `query{}` mit threshold/limit/results_count.

## Key Files

- `src/app/api/search/route.ts` — vollständig implementierter POST /api/search Handler (167 Zeilen)

## Deviations from Plan

**1. [Rule 1 - Bug] TypeScript-Typ-Inkompatibilität bei rows.map()**
- **Found during:** TypeScript-Kompilierung
- **Issue:** Neon `db` tagged template gibt `Record<string, any>[]` zurück; expliziter Row-Typ-Parameter war inkompatibel.
- **Fix:** Typisierung auf `(row) => ({...})` mit expliziten `as`-Casts umgestellt — semantisch identisch, TypeScript-konform.
- **Files modified:** `src/app/api/search/route.ts`
- **Commit:** 2e19481 (inline fix, kein separater Commit nötig)

## Self-Check: PASSED

- `ls src/app/api/search/route.ts` — Datei vorhanden
- `grep "export const maxDuration = 30"` — vorhanden
- `grep "AbortSignal.timeout(28_000)"` — vorhanden
- `grep -c "::vector"` — 4 (korrekt: SELECT + WHERE x2 + ORDER BY)
- `grep "search-temp/"` — vorhanden
- `grep "status = 'ready'"` — vorhanden
- `grep "is_archived"` — LEER (korrekt)
- `grep "parseFloat"` — vorhanden
- `grep -c "cleanupTempS3"` — 5 (Definition + alle Fehler-Pfade + nach Embedding)
- TypeScript: `npx tsc --noEmit` — keine Fehler in search/route.ts
- Commit 2e19481 existiert
