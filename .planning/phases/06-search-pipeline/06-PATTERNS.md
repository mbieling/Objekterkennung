# Phase 6: Search Pipeline - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 3 (2 neu, 1 modifiziert)
**Analogs found:** 3 / 3

---

## File Classification

| Neue/geänderte Datei | Rolle | Data Flow | Nächstes Analog | Match-Qualität |
|---|---|---|---|---|
| `src/app/api/search/route.ts` | controller | request-response | `src/app/api/upload/confirm/route.ts` | role-match (Worker-HTTP-Call) + `src/app/api/upload/init/route.ts` (S3-Upload) |
| `src/app/api/search/route.test.ts` | test | — | `src/app/api/upload/confirm/route.test.ts` | exact |
| `worker/main.py` (Erweiterung) | service | request-response | `worker/main.py` selbst (`/enqueue`-Endpunkt) | exact |

---

## Pattern Assignments

### `src/app/api/search/route.ts` (controller, request-response)

**Primäres Analog:** `src/app/api/upload/confirm/route.ts` (Worker-HTTP-Call-Pattern)
**Sekundäres Analog:** `src/app/api/upload/init/route.ts` (S3-Upload-Pattern)

---

**Imports-Pattern** — von `src/app/api/upload/init/route.ts` Zeilen 7–13 + `src/app/api/upload/confirm/route.ts` Zeilen 7–9:

```typescript
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'
```

Hinweis: `NextRequest` statt `Request` verwenden — für `request.nextUrl.searchParams` und `request.formData()` wird der Next.js-Typ benötigt.

---

**Vercel Timeout-Export** — nicht in bestehenden Analoga vorhanden (neu für Phase 6, D-02):

```typescript
// D-02: 30s Timeout — muss als Module-Level-Export stehen (Next.js liest beim Build)
export const maxDuration = 30
```

---

**Zod-Validierungs-Pattern (Query-Parameter)** — neu für Phase 6, kein direktes Analog; nutze `z.coerce.number()`:

```typescript
const SearchQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).optional().default(0.7),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})
```

Query-Params auslesen (Next.js App Router):

```typescript
const rawThreshold = request.nextUrl.searchParams.get('threshold')
const rawLimit = request.nextUrl.searchParams.get('limit')

const parsedQuery = SearchQuerySchema.safeParse({
  threshold: rawThreshold ?? undefined,
  limit: rawLimit ?? undefined,
})
if (!parsedQuery.success) {
  return NextResponse.json(
    { error: 'Ungültige Query-Parameter', details: parsedQuery.error.flatten() },
    { status: 400 }
  )
}
const { threshold, limit } = parsedQuery.data
```

---

**FormData/Datei-Validierungs-Pattern** — neu für Phase 6, kein direktes Analog:

```typescript
const formData = await request.formData()
const file = formData.get('image')

if (!(file instanceof File)) {
  return NextResponse.json({ error: 'image-Feld fehlt oder ist kein File' }, { status: 400 })
}
if (!file.type.startsWith('image/')) {
  return NextResponse.json({ error: 'Nur Bilddateien erlaubt' }, { status: 400 })
}

const bytes = await file.arrayBuffer()
const buffer = Buffer.from(bytes)
```

---

**S3-Upload-Pattern** — von `src/app/api/upload/init/route.ts` Zeilen 76–86, adaptiert für direkten Buffer-Upload:

```typescript
// Analog zu init/route.ts PutObjectCommand-Verwendung
const tempKey = `search-temp/${crypto.randomUUID()}.jpg`

await s3.send(new PutObjectCommand({
  Bucket: BUCKET_THUMBNAILS,
  Key: tempKey,
  Body: buffer,
  ContentType: file.type,
}))
```

S3-Client und Bucket-Konstanten kommen aus `src/lib/s3.ts` (Zeilen 4–19) — `s3` und `BUCKET_THUMBNAILS` direkt importieren.

---

**Worker-HTTP-Call-Pattern** — von `src/app/api/upload/confirm/route.ts` Zeilen 46–64, erweitert um Timeout:

```typescript
// Direkt aus confirm/route.ts adaptiert (Zeilen 46–64)
const workerUrl = process.env.WORKER_URL
if (!workerUrl) {
  // Dev-Bypass: ohne Worker → 503 (kein silent failure, analog zu confirm/route.ts)
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: tempKey })).catch(() => {})
  return NextResponse.json({ error: 'Worker nicht konfiguriert' }, { status: 503 })
}

let embedResponse: Response
try {
  embedResponse = await fetch(`${workerUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3_key: tempKey }),
    signal: AbortSignal.timeout(28_000),  // 2s Puffer vor maxDuration=30 (D-02)
  })
} catch {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: tempKey })).catch(() => {})
  return NextResponse.json({ error: 'Worker nicht erreichbar' }, { status: 502 })
}

if (!embedResponse.ok) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: tempKey })).catch(() => {})
  return NextResponse.json({ error: 'Worker Embed-Fehler' }, { status: 502 })
}

const { embedding } = await embedResponse.json() as { embedding: number[] }
```

Unterschied zu confirm/route.ts: `AbortSignal.timeout(28_000)` ist neu, S3-Cleanup bei jedem Fehler-Exit.

---

**S3-Cleanup-Pattern** — nach Embedding-Erhalt, vor pgvector-Query:

```typescript
// DeleteObjectCommand — analog zur Verwendung in Phase 5 (tasks.py delete pattern)
await s3.send(new DeleteObjectCommand({
  Bucket: BUCKET_THUMBNAILS,
  Key: tempKey,
})).catch(err => console.warn(`S3 Cleanup fehlgeschlagen: ${err}`))
// fire-and-forget mit .catch(warn) — Temp-Datei ist nach Embedding wertlos
```

---

**pgvector-Query-Pattern** — von `src/app/api/parts/route.ts` Zeilen 9–17 (db-Tagged-Template-Stil), erweitert um Cosine-Similarity:

```typescript
// db-Tagged-Template — identischer Import-Stil wie parts/route.ts und confirm/route.ts
// KRITISCH: embeddingLiteral als String (Neon serialisiert number[] als PG-Array, nicht als vector)
const embeddingLiteral = `[${embedding.join(',')}]`

const rows = await db`
  SELECT
    id,
    name,
    part_number,
    project,
    status,
    created_at,
    1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
  FROM parts
  WHERE status = 'ready'
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> ${embeddingLiteral}::vector) >= ${threshold}
  ORDER BY embedding <=> ${embeddingLiteral}::vector
  LIMIT ${limit}
`
```

---

**Response-Serialisierungs-Pattern** — von `src/app/api/parts/route.ts` Zeile 16 (NextResponse.json-Stil), erweitert um D-11-Shape:

```typescript
// Analog zu parts/route.ts: return NextResponse.json({ parts: rows })
return NextResponse.json({
  results: rows.map(row => ({
    id: row.id,
    name: row.name,
    part_number: row.part_number,
    project: row.project,
    status: row.status,
    similarity: parseFloat(row.similarity),  // Neon kann Decimal-Strings zurückgeben
    created_at: row.created_at,
  })),
  query: {
    threshold,
    limit,
    results_count: rows.length,
  },
})
```

---

### `src/app/api/search/route.test.ts` (test)

**Analog:** `src/app/api/upload/confirm/route.test.ts` (exakte Übereinstimmung — gleicher Stack: Vitest, vi.mock, global.fetch mock)

---

**Test-Datei-Kopfzeile und Mock-Setup** — von `src/app/api/upload/confirm/route.test.ts` Zeilen 1–18:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  BUCKET_THUMBNAILS: 'mock-bucket-thumbnails',
}))

// fetch global mocken (Worker-HTTP-Aufruf) — identisch zu confirm/route.test.ts Zeile 13
const mockFetch = vi.fn()
global.fetch = mockFetch

import { db } from '@/lib/db'
import { s3 } from '@/lib/s3'
const mockDb = vi.mocked(db)
const mockS3Send = vi.mocked(s3.send)
```

---

**beforeEach-Reset-Pattern** — von `src/app/api/upload/confirm/route.test.ts` Zeilen 20–23:

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  process.env.WORKER_URL = 'http://localhost:8000'
})
```

---

**Test-Case-Struktur (Happy Path)** — von `src/app/api/upload/confirm/route.test.ts` Zeilen 27–52, adaptiert:

```typescript
it('gibt HTTP 200 mit geranketen Treffern zurück (SEARCH-03)', async () => {
  // S3 Upload + Cleanup mocken
  mockS3Send.mockResolvedValue({})

  // Worker gibt Embedding zurück
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ embedding: new Array(768).fill(0.1) }),
  })

  // DB gibt Treffer zurück
  mockDb.mockResolvedValueOnce([
    { id: 'uuid-1', name: 'Flansch A', part_number: 'FL-001', project: null,
      status: 'ready', similarity: '0.85', created_at: '2026-01-01T00:00:00Z' },
  ])

  const { POST } = await import('./route')
  const formData = new FormData()
  formData.append('image', new File(['...'], 'foto.jpg', { type: 'image/jpeg' }))

  const request = new Request('http://localhost/api/search', {
    method: 'POST',
    body: formData,
  })

  const response = await POST(request as NextRequest)
  const data = await response.json()

  expect(response.status).toBe(200)
  expect(data.results).toHaveLength(1)
  expect(data.results[0].similarity).toBe(0.85)
  expect(data.query.threshold).toBe(0.7)
  expect(data.query.limit).toBe(10)
})
```

---

**Fehlerfall-Test-Pattern** — von `src/app/api/upload/confirm/route.test.ts` Zeilen 69–82:

```typescript
it('gibt HTTP 502 zurück wenn Worker nicht erreichbar ist', async () => {
  mockS3Send.mockResolvedValue({})
  mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))  // Network error

  const { POST } = await import('./route')
  // ... request setup ...
  const response = await POST(request as NextRequest)
  expect(response.status).toBe(502)
})
```

Vollständige Test-Cases die implementiert werden müssen (alle Wave 0, `route.test.ts`):
- HTTP 200 mit Treffern — SEARCH-03
- Threshold-Filter: Treffer unter Schwellwert werden ausgeschlossen — SEARCH-04
- Limit-Parameter: Anzahl Ergebnisse begrenzt — SEARCH-05
- Ungültige Query-Parameter (threshold > 1, limit = 0) → HTTP 400
- Kein `image`-Feld in FormData → HTTP 400
- Nicht-Bild MIME-Type → HTTP 400
- Worker nicht erreichbar → HTTP 502
- Worker gibt `ok: false` zurück → HTTP 502
- Keine Treffer in DB → HTTP 200 mit `results: []`

---

### `worker/main.py` (Erweiterung: neuer `/embed`-Endpunkt)

**Analog:** `worker/main.py` `/enqueue`-Endpunkt (Zeilen 23–52) — exakte Übereinstimmung (FastAPI, Pydantic BaseModel)

---

**Pydantic-Model-Pattern** — von `worker/main.py` Zeilen 23–29:

```python
# Analog zu EnqueueRequest (Zeilen 23–29) — gleiche Struktur, anderes Schema
class EmbedRequest(BaseModel):
    s3_key: str  # z.B. "search-temp/uuid.jpg" — kein UUID4, da String-Key

class EmbedResponse(BaseModel):
    embedding: list[float]  # 768 Floats — direkt serialisierbar als JSON
```

---

**FastAPI-Endpunkt-Pattern** — von `worker/main.py` Zeilen 42–52, adaptiert für Sync (kein Celery):

```python
# Analog zu @app.post("/enqueue") (Zeile 42) — aber sync, kein status_code=202
@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """Synchroner Embed-Endpunkt — kein Celery, kein Background-Task.

    Nimmt S3-Key entgegen, lädt Bild aus BUCKET_THUMBNAILS,
    berechnet DINOv2 Patch-Mean-Pool Embedding, gibt [768 floats] zurück.
    """
    logger.info(f"[{req.s3_key}] Embed-Request empfangen")
    # ... S3-Download, get_embedding(), Cleanup ...
```

Unterschied zu `/enqueue`: kein `status_code=202` (synchron, HTTP 200 Standard), kein `process_step_task.delay()`.

---

**Imports für `/embed`** — ergänzend zu bestehenden `worker/main.py` Zeilen 1–12:

```python
# Neu hinzufügen (nach bestehenden Imports)
import boto3
import tempfile
import os

from worker.embedder import get_embedding  # get_embedding() — direkt wiederverwendbar
```

---

**S3-Download + Embedding + Cleanup im Worker** — von `worker/embedder.py` Zeilen 24–53 (get_embedding-Aufruf-Pattern) + boto3-Standard:

```python
s3_client = boto3.client(
    "s3",
    region_name=os.environ["AWS_REGION"],
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    endpoint_url=os.environ.get("DECOMPOSEDS3_ENDPOINT"),  # für lokales MinIO
)

with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
    tmp_path = tmp.name

try:
    s3_client.download_file(
        os.environ["AWS_S3_BUCKET_THUMBNAILS"],
        req.s3_key,
        tmp_path,
    )
    embedding = get_embedding(tmp_path)  # numpy ndarray (768,)
    logger.info(f"[{req.s3_key}] Embedding berechnet, shape={embedding.shape}")
    return EmbedResponse(embedding=embedding.tolist())
finally:
    os.unlink(tmp_path)  # Lokale Temp-Datei immer löschen (auch bei Fehler)
```

Hinweis: `get_embedding()` nutzt `_model`/`_processor` als Modul-Globals — das Modell ist beim Worker-Start bereits geladen (kein `AutoModel.from_pretrained()` in der Funktion aufrufen).

---

## Shared Patterns

### db-Tagged-Template (Neon PostgreSQL)

**Quelle:** `src/lib/db.ts` Zeilen 1–13
**Anwenden auf:** `src/app/api/search/route.ts`

```typescript
// Import-Muster aus allen bestehenden Route-Handlern
import { db } from '@/lib/db'

// Verwendung — Tagged Template Literal
const rows = await db`SELECT ... FROM parts WHERE ...`
```

---

### S3-Client Import

**Quelle:** `src/lib/s3.ts` Zeilen 4–19
**Anwenden auf:** `src/app/api/search/route.ts`

```typescript
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'
// s3 = S3Client-Instanz (forcePathStyle für lokales MinIO via DECOMPOSEDS3_ENDPOINT)
// BUCKET_THUMBNAILS = process.env.AWS_S3_BUCKET_THUMBNAILS!
```

---

### Zod-Validierungs-Muster (safeParse + flatten)

**Quelle:** `src/app/api/upload/confirm/route.ts` Zeilen 25–30 + `src/app/api/upload/init/route.ts` Zeilen 40–44
**Anwenden auf:** `src/app/api/search/route.ts`

```typescript
const parsed = Schema.safeParse(input)
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```

---

### Worker-URL-Env-Var-Check

**Quelle:** `src/app/api/upload/confirm/route.ts` Zeilen 46–47
**Anwenden auf:** `src/app/api/search/route.ts`

```typescript
const workerUrl = process.env.WORKER_URL
if (workerUrl) { /* Worker-Call */ }
// Für /api/search: kein silent skip — 503 zurückgeben (Embedding ist Pflicht)
```

Abweichung von confirm/route.ts: dort ist Worker-Skip im Dev-Modus erlaubt (async), bei `/api/search` ist der Worker-Aufruf obligatorisch → 503 statt silent skip.

---

### FastAPI Logger-Pattern

**Quelle:** `worker/main.py` Zeilen 8–18
**Anwenden auf:** Neuer `/embed`-Endpunkt in `worker/main.py`

```python
# logger ist bereits als Modul-Global in worker/main.py definiert (Zeile 18)
logger = logging.getLogger(__name__)
# Innerhalb des /embed-Endpunkts direkt verwenden:
logger.info(f"[{req.s3_key}] Embed-Request empfangen")
```

---

### Vitest-Mock-Modul-Pattern

**Quelle:** `src/app/api/upload/confirm/route.test.ts` Zeilen 8–17
**Anwenden auf:** `src/app/api/search/route.test.ts`

```typescript
// vi.mock muss vor dem dynamischen Import stehen (Vitest hoisting)
vi.mock('@/lib/db', () => ({ db: vi.fn() }))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn() }, BUCKET_THUMBNAILS: 'mock-bucket' }))
global.fetch = vi.fn()

// Nach Mocks: dynamischer Import (isoliert pro describe-Block)
const { POST } = await import('./route')
```

---

## No Analog Found

Kein File ohne Analog in dieser Phase — alle drei Dateien haben starke Analoga in der bestehenden Codebase.

| Muster | Quelle | Hinweis |
|---|---|---|
| `export const maxDuration = 30` | Next.js-Docs (nicht im Projekt) | Neu für Phase 6; kein bestehendes Analog mit Timeout |
| `z.coerce.number()` für Query-Params | Zod-Docs (nicht im Projekt) | Kein bestehender Route-Handler mit URL-Query-Params |
| `request.formData()` | Next.js-Docs (nicht im Projekt) | Kein bestehender Handler mit multipart/form-data |
| `AbortSignal.timeout()` | Node.js-Built-in (nicht im Projekt) | Neu für Phase 6 (synchroner Worker-Call mit Timeout) |

Für diese vier Muster sind die Code-Beispiele in `06-RESEARCH.md` (Pattern 2, 3, 6) die maßgebliche Referenz.

---

## Metadata

**Analog-Suchbereich:** `src/app/api/`, `src/lib/`, `worker/`
**Dateien gescannt:** 11 (7 route.ts + route.test.ts Paare, 2 lib-Dateien, 2 worker-Python-Dateien)
**Pattern-Extraktion:** 2026-05-09
