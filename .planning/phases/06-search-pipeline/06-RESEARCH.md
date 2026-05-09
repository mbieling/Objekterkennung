# Phase 6: Search Pipeline - Research

**Recherchiert:** 2026-05-09
**Domäne:** pgvector Cosine Search, FastAPI Sync Endpoint, Next.js Multipart/FormData, S3 Temp Upload
**Konfidenz:** HIGH

---

<user_constraints>
## User Constraints (aus CONTEXT.md)

### Locked Decisions

- **D-01:** Synchron — POST /api/search wartet auf das vollständige Ergebnis. Kein Polling.
- **D-02:** Timeout: 30 Sekunden — `export const maxDuration = 30` in der route.ts.
- **D-03:** Foto-Transfer über S3 (bewährtes Muster) — S3-Key wird an Worker-`/embed`-Endpunkt übergeben.
- **D-04:** Neuer synchroner FastAPI-Endpunkt `/embed` in `worker/main.py` — KEIN Celery.
- **D-05:** `threshold` und `limit` als optionale Query-Parameter: `POST /api/search?threshold=0.7&limit=10`.
- **D-06:** Default threshold: `0.7`
- **D-07:** Default limit: `10` (max `50`)
- **D-09:** Score als 0–1 Float (cosine similarity direkt aus pgvector)
- **D-10:** Keine Thumbnail-URL in Search-Response — lazy load via `GET /api/parts/[id]/thumbnail`
- **D-11:** Response-Shape fixiert (siehe CONTEXT.md)
- **D-12:** Filter `WHERE status = 'ready'` — KEIN `is_archived`-Boolean

### Claude's Discretion

- Bucket-Entscheidung für temporäre Suchbilder: `parts-thumbnails` (Wiederverwendung) vs. dedizierter `search-temp`-Bucket
- Temp-File-Naming-Schema in S3 (z.B. `search-temp/{uuid}.jpg`)
- Zod-Validierung für Query-Parameter (threshold: 0.0–1.0, limit: 1–50)
- Dateinamen-Konvention für multipart/form-data Body

### Deferred Ideas (OUT OF SCOPE)

- Asynchrone Suche mit Job-ID-Polling
- Thumbnail-URL inline in Search-Response
- Suchhistorie (SEARCH-V2-01)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Beschreibung | Research Support |
|----|-------------|------------------|
| SEARCH-03 | System liefert gerankete Treffer mit Match-Prozentwert und Thumbnails | pgvector `<=>` Operator + `1 - distance` für Similarity-Score; Response-Shape D-11 |
| SEARCH-04 | Nutzer kann den Ähnlichkeitsschwellwert konfigurieren | `threshold` Query-Parameter mit Zod-Validierung (0.0–1.0), `HAVING`-Filter auf berechneter similarity |
| SEARCH-05 | Nutzer kann die Anzahl der angezeigten Treffer konfigurieren | `limit` Query-Parameter mit Zod-Validierung (1–50), `LIMIT $2` in pgvector-Query |
</phase_requirements>

---

## Summary

Phase 6 baut eine synchrone End-to-end Search-Pipeline: Next.js empfängt ein Foto als `multipart/form-data`, lädt es temporär in S3, ruft einen neuen synchronen `/embed`-Endpunkt im Python Worker auf (FastAPI, kein Celery), empfängt das 768-dim DINOv2-Embedding zurück, führt eine pgvector-Cosine-Similarity-Query gegen die `parts`-Tabelle aus und gibt die geranketen Treffer als JSON zurück.

Alle drei Hauptkomponenten (S3-Transfer, Worker-HTTP-Call, pgvector-Query) folgen bereits etablierten Mustern aus Phase 3/5. Das größte Integrationsrisiko liegt beim Datentyp-Casting des 768-dim Float-Arrays beim Neon-Tagged-Template-Client — hier wird SQL-Level-Casting benötigt (`$1::vector`). Für die Temp-Image-Ablage empfiehlt die Recherche die Wiederverwendung von `BUCKET_THUMBNAILS` mit dem Prefix `search-temp/` anstatt eines dedizierten Buckets, um Betriebskomplexität gering zu halten.

**Primärempfehlung:** `BUCKET_THUMBNAILS` mit `search-temp/{uuid}.{ext}`-Naming wiederverwenden; Cleanup (DeleteObjectCommand) direkt nach dem `/embed`-HTTP-Call im Next.js-Handler, bevor die pgvector-Query startet.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Foto entgegennehmen (multipart/form-data) | API / Backend (Next.js Route Handler) | — | Server-seitiger Handler; kein Client-Bundle-Zugriff auf Secrets |
| S3 Temp Upload (Suchbild) | API / Backend (Next.js Route Handler) | — | S3-Credentials sind server-only |
| DINOv2 Embedding berechnen | Python Worker (FastAPI `/embed`) | — | CPU/GPU-intensiv, Modell ist nur dort geladen |
| Embedding von Worker empfangen | API / Backend (Next.js Route Handler) | — | HTTP-Fetch an Worker, analog zu `/enqueue` in Phase 3 |
| pgvector Cosine Query | Database / Storage (Neon via `db` Tagged Template) | — | SQL-Ebene; HNSW-Index bereits aktiv |
| Threshold + Limit-Filterung | API / Backend (Next.js Route Handler) | Database | Threshold per `HAVING`/`WHERE` in SQL; Limit per `LIMIT $n` |
| S3 Temp Cleanup | API / Backend (Next.js Route Handler) | — | DeleteObjectCommand nach Embedding, vor Response |
| Response serialisieren | API / Backend (Next.js Route Handler) | — | JSON-Formatierung per D-11 |

---

## Standard Stack

### Core

| Library | Version | Zweck | Warum Standard |
|---------|---------|-------|----------------|
| `@aws-sdk/client-s3` | ^3.1045.0 | Temp-Bild-Upload (PutObjectCommand) + Cleanup (DeleteObjectCommand) | Bereits im Projekt, `BUCKET_THUMBNAILS` bereits konfiguriert |
| `@neondatabase/serverless` | ^1.1.0 | pgvector Cosine Query via `db` Tagged Template | Bereits im Projekt (`src/lib/db.ts`) |
| `zod` | ^4.3.5 | Query-Parameter-Validierung (threshold, limit) | Bereits im Projekt; `z.coerce.number()` für URL-String-zu-Float-Konvertierung |
| `next` (App Router) | ^16.1.1 | Route Handler (`POST /api/search`), `NextRequest.nextUrl.searchParams` | Bereits im Projekt |
| FastAPI | >=0.136.0 | Sync `/embed`-Endpunkt im Python Worker | Bereits im Worker (`worker/main.py`) |
| Pydantic | (via FastAPI) | Request-Validierung für `/embed` | Bereits verwendet im Worker (`EnqueueRequest`) |
| `worker/embedder.py::get_embedding()` | — | DINOv2-Embedding für Suchbild | Direkt wiederverwendbar; identischer Aufruf |

### Supporting

| Library | Version | Zweck | Wann verwenden |
|---------|---------|-------|----------------|
| `uuid` (Node.js crypto) | built-in | Temp-File-Key generieren (`crypto.randomUUID()`) | Im Next.js-Route-Handler für `search-temp/{uuid}` |
| `boto3` | >=1.34 | S3-Download im Python Worker für Temp-Image | Bereits im Worker (`process_step.py`), Muster übertragbar |

### Nicht benötigt / Alternativen abgelehnt

| Statt | Könnte man | Tradeoff |
|-------|-----------|----------|
| S3 Temp Upload | Direktes multipart-Streaming zum Worker | Widerspricht D-03; würde neues HTTP-Multipart-Handling im Worker erfordern |
| `BUCKET_THUMBNAILS` für Temp | Dedizierter `search-temp`-Bucket | Neuer Bucket braucht neue Env-Var, neue IAM-Policy, neue S3-Konfiguration — unverhältnismäßiger Aufwand für temporäre Dateien |

---

## Architecture Patterns

### System Architecture Diagram

```
Browser/Mobile
     │
     │  POST /api/search?threshold=0.7&limit=10
     │  multipart/form-data  { image: File }
     ▼
┌─────────────────────────────────────────────────┐
│  Next.js Route Handler                          │
│  src/app/api/search/route.ts                    │
│                                                 │
│  1. Query-Params validieren (Zod coerce)        │
│  2. FormData.get('image') → File/Blob           │
│  3. Dateiformat prüfen (MIME: image/*)          │
│  4. Temp-S3-Key = search-temp/{uuid}.jpg        │
│  5. PutObjectCommand → BUCKET_THUMBNAILS        │
│  6. POST /embed {s3_key} → Worker               │
│  7. DeleteObjectCommand (Cleanup)               │
│  8. pgvector Cosine Query (db tagged template)  │
│  9. Response serialisieren (D-11 Shape)         │
└──────────┬──────────────────────┬───────────────┘
           │                      │
     ┌─────▼──────┐        ┌──────▼───────┐
     │  S3 Bucket │        │  Python      │
     │  parts-    │        │  Worker      │
     │  thumbnails│        │  /embed      │
     │  (temp key)│        │              │
     └─────┬──────┘        │  1. S3 Download │
           │               │  2. get_embedding() │
           └───────────────►  3. return {embedding} │
                           └──────────────┘
                                  │
                           ┌──────▼───────────────────┐
                           │  Neon PostgreSQL          │
                           │  pgvector HNSW Index      │
                           │                           │
                           │  SELECT ... FROM parts    │
                           │  WHERE status='ready'     │
                           │  ORDER BY embedding <=>   │
                           │  LIMIT $2                 │
                           └──────────────────────────┘
```

### Empfohlene Projektstruktur (neue Dateien)

```
src/app/api/search/
├── route.ts                  # POST /api/search — Haupt-Handler
└── route.test.ts             # Vitest Unit-Tests (mocked db + s3 + fetch)

worker/main.py                # /embed-Endpunkt HIER HINZUFÜGEN (nicht neue Datei)
```

---

### Pattern 1: pgvector Cosine Similarity Query mit Neon Tagged Template

**Was:** Cosine-Similarity-Query mit Threshold-Filter und Limit über den `db`-Tagged-Template-Client.
**Wann verwenden:** Im Next.js Route Handler nach Erhalt des Embeddings vom Worker.

**Kritische Erkenntnis:** Neon Tagged Templates serialisieren JavaScript-Arrays als PostgreSQL-Arrays (`{0.1, 0.2, ...}`), NICHT als pgvector-Vektoren. Ohne explizites `::vector`-Casting würde die Query fehlschlagen. [VERIFIED: pgvector/pgvector docs]

```typescript
// Source: pgvector README + Neon serverless docs
// embedding ist ein number[] (768 Floats) vom Worker
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

**Warum `embeddingLiteral` als String statt direkt als Array:** pgvector erwartet das Literal-Format `'[0.1,0.2,...]'::vector`. Das Tagged Template schickt Parameter als `$1`, `$2` etc. — pgvector akzeptiert den `::vector`-Cast auf einen Literal-String. [VERIFIED: pgvector README]

**HNSW-Index-Verhalten mit WHERE-Filter:** Das `WHERE status = 'ready'` läuft NACH dem HNSW-Index-Scan (Post-Filtering). Bei einem Corpus mit vorwiegend `ready`-Parts (Normalfall) ist das performant. Bei niedrigem `ready`-Anteil könnte `SET hnsw.iterative_scan = strict_order` helfen — für Phase 6 nicht notwendig. [VERIFIED: pgvector README — Filtering-Abschnitt]

---

### Pattern 2: multipart/form-data im Next.js App Router Route Handler

**Was:** Bild aus POST-Request-Body als `File`/`Blob` extrahieren.
**Wann verwenden:** Im `/api/search`-Handler als ersten Schritt nach Query-Param-Validierung.

```typescript
// Source: Next.js docs — https://nextjs.org/docs/app/api-reference/file-conventions/route
export const maxDuration = 30  // D-02: 30s Timeout

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData()
  const file = formData.get('image')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image-Feld fehlt oder ist kein File' }, { status: 400 })
  }

  // MIME-Type-Validierung (Threat: nicht-Bild-Upload)
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Nur Bilddateien erlaubt' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  // ... S3 Upload mit buffer
}
```

**`maxDuration = 30` muss als Export auf der Route-Datei stehen** — Next.js liest das beim Build. [VERIFIED: Next.js docs — maxDuration]

---

### Pattern 3: Query-Parameter-Validierung mit Zod v4 coerce

**Was:** Optional Query-Parameter aus URL-String in Float/Int konvertieren und validieren.
**Wann verwenden:** Vor jedem weiteren Schritt im Handler.

```typescript
// Source: Zod docs — coerce + number validation
// Next.js docs — NextRequest.nextUrl.searchParams
import { type NextRequest } from 'next/server'

const QuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).optional().default(0.7),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

// In der POST-Handler-Funktion:
const rawThreshold = request.nextUrl.searchParams.get('threshold')
const rawLimit = request.nextUrl.searchParams.get('limit')

const parsedQuery = QuerySchema.safeParse({
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

**`z.coerce.number()`** ist notwendig, weil `searchParams.get()` immer einen String zurückgibt — Zod v4 coerce ruft `Number(input)` auf. [VERIFIED: Zod docs]

---

### Pattern 4: S3 Temp Upload + Cleanup im Next.js Handler

**Was:** Suchbild temporär in S3 laden, S3-Key an Worker übergeben, danach löschen.
**Wann verwenden:** Nach Datei-Validierung, vor Worker-HTTP-Call.

```typescript
// Source: Etabliertes Muster aus Phase 3/5 (src/app/api/upload/init/route.ts)
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'

const tempKey = `search-temp/${crypto.randomUUID()}.jpg`

// Upload
await s3.send(new PutObjectCommand({
  Bucket: BUCKET_THUMBNAILS,
  Key: tempKey,
  Body: buffer,
  ContentType: file.type,
}))

// ... Worker-Call mit tempKey ...

// Cleanup (fire-and-forget ist OK — Datei ist nach Embedding wertlos)
// Best practice: IMMER cleanup, auch bei Worker-Fehler
await s3.send(new DeleteObjectCommand({
  Bucket: BUCKET_THUMBNAILS,
  Key: tempKey,
})).catch(err => logger.warn(`S3 Cleanup fehlgeschlagen: ${err}`))
```

**Cleanup-Zeitpunkt:** Direkt nach Erhalt des Embeddings vom Worker, VOR der pgvector-Query. Das Temp-Objekt wird nicht mehr benötigt sobald das Embedding vorliegt. [ASSUMED — Best Practice, keine offizielle Quelle]

---

### Pattern 5: Neuer synchroner FastAPI `/embed`-Endpunkt im Worker

**Was:** Sync FastAPI POST-Endpunkt der S3-Key entgegennimmt, Bild lädt, Embedding berechnet.
**Wann verwenden:** Wird in `worker/main.py` hinzugefügt (neben `/health` und `/enqueue`).

```python
# Source: FastAPI docs + bestehende worker/main.py-Struktur
# Source: worker/embedder.py::get_embedding() — direkt wiederverwendbar

from pydantic import BaseModel
import boto3
import tempfile
import os

class EmbedRequest(BaseModel):
    s3_key: str  # z.B. "search-temp/uuid.jpg"

class EmbedResponse(BaseModel):
    embedding: list[float]  # 768 Floats

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """Synchroner Embed-Endpunkt — kein Celery, kein Background-Task.
    
    Nimmt S3-Key entgegen, lädt Bild aus BUCKET_THUMBNAILS,
    berechnet DINOv2 Patch-Mean-Pool Embedding, gibt [768 floats] zurück.
    """
    s3_client = get_s3_client()  # bestehende Hilfsfunktion aus process_step.py — ggf. in utils.py extrahieren
    
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
    
    try:
        s3_client.download_file(
            os.environ["AWS_S3_BUCKET_THUMBNAILS"],
            req.s3_key,
            tmp_path
        )
        embedding = get_embedding(tmp_path)  # aus worker.embedder importiert
        return EmbedResponse(embedding=embedding.tolist())
    finally:
        os.unlink(tmp_path)  # Lokale Temp-Datei immer löschen
```

**DINOv2-Modell ist bereits als Modul-Global geladen** (`_model`, `_processor` in `embedder.py`). Der `/embed`-Endpunkt braucht das Modell NICHT neu laden — der FastAPI-Worker-Prozess hat es bereits beim Start geladen. [VERIFIED: worker/embedder.py — Modul-Level Initialisierung]

**`get_s3_client()`-Funktion:** Derzeit in `process_step.py` definiert. Für `/embed` sollte sie entweder als gemeinsame Utility in `worker/utils.py` extrahiert oder die boto3-Client-Erstellung inline in `main.py` dupliziert werden.

---

### Pattern 6: Worker HTTP-Call im Next.js Handler (analog zu `/enqueue`)

**Was:** Synchroner HTTP-Call an Worker `/embed`, mit 28-Sekunden-Timeout (2s Puffer vor Vercel-30s-Limit).
**Wann verwenden:** Nach S3 Temp Upload, vor pgvector-Query.

```typescript
// Source: Bestehende confirm/route.ts — Worker-HTTP-Call-Muster
const workerUrl = process.env.WORKER_URL
if (!workerUrl) {
  // Dev-Bypass: ohne Worker → 503 (kein silent failure wie bei /enqueue)
  return NextResponse.json({ error: 'Worker nicht konfiguriert' }, { status: 503 })
}

let embedResponse: Response
try {
  embedResponse = await fetch(`${workerUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3_key: tempKey }),
    signal: AbortSignal.timeout(28_000),  // 2s Puffer vor maxDuration=30
  })
} catch (err) {
  // AbortError = Timeout; TypeError = Network unreachable
  await cleanupTempS3(tempKey)  // S3 Cleanup auch bei Worker-Fehler
  return NextResponse.json({ error: 'Worker nicht erreichbar' }, { status: 502 })
}

if (!embedResponse.ok) {
  await cleanupTempS3(tempKey)
  return NextResponse.json({ error: 'Worker Embed-Fehler' }, { status: 502 })
}

const { embedding } = await embedResponse.json() as { embedding: number[] }
```

**`AbortSignal.timeout(28_000)`** ist in Node.js 18+ und allen modernen Environments verfügbar. Verhindert, dass der Worker-Call länger als 28s wartet und Next.js dann mit einem nicht-sauberen Timeout abbricht. [ASSUMED — Node.js-Standard-API, keine Vercel-spezifische Verifikation]

---

### Anti-Patterns zu vermeiden

- **`is_archived = false` im WHERE-Filter:** Phase-5-Downstream-Constraint (D-12) — NUR `WHERE status = 'ready'`. [VERIFIED: 05-CONTEXT.md D-10, 06-CONTEXT.md D-12]
- **Embedding als JSON-Array direkt an Neon Template:** Neon-Parameter werden als PostgreSQL-Array serialisiert, NICHT als pgvector-Vektor. Immer `::vector` cast verwenden. [VERIFIED: pgvector README]
- **Modell im `/embed`-Endpunkt neu laden:** `get_embedding()` nutzt die Modul-Globals `_model`/`_processor`. Kein `AutoModel.from_pretrained()` in der Funktion. [VERIFIED: worker/embedder.py]
- **Content-Type-Header beim S3-PUT aus Browser setzen:** Nicht relevant hier (Server-seitiger Upload), aber generelles Projekt-Pitfall aus Phase 3/4. [VERIFIED: Phase 4 Cross-cutting constraints]
- **Embedding in der pgvector-Query SELECT zurückgeben:** 768 Floats × N Zeilen = hoher Transfer-Overhead. Nur Metadaten + similarity zurückgeben. [ASSUMED]
- **`similarity` im HAVING statt WHERE:** Da `similarity` ein berechneter Alias ist, muss der Threshold entweder als `WHERE 1 - (embedding <=> ...) >= $threshold` formuliert oder per subquery gelöst werden. [VERIFIED: SQL-Standard — Aliase nicht in WHERE verfügbar]

---

## Don't Hand-Roll

| Problem | Nicht selbst bauen | Stattdessen | Warum |
|---------|-------------------|-------------|-------|
| Vektor-Ähnlichkeitssuche | Custom Cosine-Distanz in JS | pgvector `<=>` Operator + HNSW-Index | Skaliert auf 1000+ Parts, Index bereits aktiv |
| Embedding-Berechnung | Eigene DINOv2-Inferenz in Next.js | `worker/embedder.py::get_embedding()` | Modell ist 340 MB, läuft nur im Python Worker |
| Bild-Upload S3 | Stream direkt an Worker | AWS SDK `PutObjectCommand` | Konsistenz mit Phase 3/5; S3-Client bereits konfiguriert |
| Query-Parameter coercion | `parseFloat(rawValue)` inline | `z.coerce.number()` | Fehlerbehandlung, Validierung, Type-Safety in einem Schritt |
| Timeout-Handling | `setTimeout` + Promise.race | `AbortSignal.timeout()` | Native API, kein Cleanup-Boilerplate |

---

## Common Pitfalls

### Pitfall 1: Neon Tagged Template + pgvector Typ-Mismatch

**Was schiefläuft:** `db\`... WHERE embedding <=> ${embeddingArray}...\`` mit `embeddingArray: number[]` — Neon serialisiert das als PostgreSQL-Array `{0.1,0.2,...}`, pgvector erwartet aber `[0.1,0.2,...]::vector`.
**Warum es passiert:** Neon Tagged Template und pgvector haben unterschiedliche Literal-Formate.
**Vermeidung:** `const lit = \`[${embedding.join(',')}]\`` als String-Interpolation, dann `${lit}::vector` im SQL.
**Erkennungszeichen:** PostgreSQL-Fehler `operator does not exist: vector <=> text[]` oder ähnlich.

### Pitfall 2: Kein Cleanup bei Worker-Fehler

**Was schiefläuft:** Temp-S3-Objekte akkumulieren sich wenn der Worker einen Fehler zurückgibt oder das Timeout auslöst.
**Warum es passiert:** Cleanup nur im Happy Path implementiert.
**Vermeidung:** Cleanup in `try/finally` oder nach jedem Fehler-Return explizit ausführen. DeleteObjectCommand als fire-and-forget mit `.catch(warn)`.

### Pitfall 3: `similarity`-Alias im WHERE-Filter

**Was schiefläuft:** `WHERE similarity >= ${threshold}` — PostgreSQL kennt berechnete Spalten-Aliase im WHERE nicht.
**Warum es passiert:** SQL-Standard: Aliase sind erst NACH SELECT verfügbar (nicht im WHERE).
**Vermeidung:** `WHERE 1 - (embedding <=> ${lit}::vector) >= ${threshold}` — Ausdruck vollständig wiederholen, oder Subquery.

### Pitfall 4: Worker-Timeout vs. Vercel-Timeout

**Was schiefläuft:** Vercel bricht den Handler nach 30s ab, der Worker-Call hat aber keinen eigenen Timeout — im schlechtesten Fall wartet Node.js ewig.
**Warum es passiert:** `fetch()` ohne Signal hat keinen Default-Timeout in Node.js.
**Vermeidung:** `signal: AbortSignal.timeout(28_000)` im fetch-Call. `export const maxDuration = 30` in route.ts.

### Pitfall 5: Bild-MIME-Validierung fehlt

**Was schiefläuft:** Nicht-Bild-Datei landet im Worker, `get_embedding()` wirft `PIL.UnidentifiedImageError` → 500-Fehler ohne hilfreiche Fehlermeldung.
**Warum es passiert:** FormData akzeptiert beliebige Files.
**Vermeidung:** `if (!file.type.startsWith('image/'))` nach `formData.get('image')`.

### Pitfall 6: `embedding IS NULL`-Rows in der Cosine-Query

**Was schiefläuft:** Parts mit `status = 'ready'` aber noch `embedding = NULL` (Race Condition oder Worker-Bug) — pgvector-Operator auf NULL gibt NULL zurück, `ORDER BY NULL` ist undefiniert.
**Warum es passiert:** Das Schema erlaubt `embedding vector(768)` ohne NOT NULL (Phase 1 Design).
**Vermeidung:** `AND embedding IS NOT NULL` im WHERE der pgvector-Query.

---

## Code Examples

### Vollständige pgvector Similarity Query

```typescript
// Source: pgvector README (cosine similarity), Neon serverless docs (tagged template)
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

### Response nach D-11 formatieren

```typescript
// Source: 06-CONTEXT.md D-11
return NextResponse.json({
  results: rows.map(row => ({
    id: row.id,
    name: row.name,
    part_number: row.part_number,
    project: row.project,
    status: row.status,
    similarity: parseFloat(row.similarity),  // Neon gibt Decimal-Strings zurück
    created_at: row.created_at,
  })),
  query: {
    threshold,
    limit,
    results_count: rows.length,
  },
})
```

### Zod Query-Parameter Schema

```typescript
// Source: Zod docs — coerce.number() + min/max, Next.js docs — nextUrl.searchParams
import { z } from 'zod'

const SearchQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).optional().default(0.7),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})
```

---

## State of the Art

| Alter Ansatz | Aktueller Ansatz | Geändert | Auswirkung |
|--------------|------------------|----------|------------|
| pgvector IVFFlat-Index | pgvector HNSW-Index | pgvector 0.5.0+ | HNSW braucht kein Rebuild bei Corpus-Wachstum — Phase 1 hat bereits HNSW |
| pgvector iterative scan nur für IVFFlat | HNSW iterative scan (`SET hnsw.iterative_scan`) | pgvector 0.8.0+ | Relevant für stark gefilterte Queries; für Phase 6 nicht notwendig |
| `params` in Next.js Route Handler synchron | `params` als Promise (Next.js 15+/16) | Next.js 15 | `const { id } = await params` — bereits in allen Phase-5-Handlern korrekt umgesetzt |

---

## Assumptions Log

| # | Behauptung | Abschnitt | Risiko wenn falsch |
|---|-----------|-----------|-------------------|
| A1 | Cleanup nach Embedding als fire-and-forget per `.catch(warn)` ist akzeptabel | Pattern 4 | Temp-Objekte akkumulieren sich — kein funktionales Problem, aber Speicherkosten |
| A2 | `AbortSignal.timeout(28_000)` ist in Vercel Edge/Node.js-Runtime verfügbar | Pattern 6 | Fetch-Call hat keinen Timeout; ggf. durch `Promise.race` mit `setTimeout` ersetzen |
| A3 | DINOv2-Embedding für ein einzelnes Kamerafoto (1 View statt 8) liefert ausreichende Ähnlichkeitswerte gegen den 8-View-Mean-Pool der Datenbank-Embeddings | Summary | Niedrigere Recall-Rate; ggf. threshold-Default auf 0.5–0.6 senken |
| A4 | `BUCKET_THUMBNAILS` Wiederverwendung für Temp-Images verursacht keine IAM-Policy-Konflikte | Pattern 4 | Separater Bucket notwendig — neue Env-Var und IAM-Policy erforderlich |

---

## Open Questions

1. **Ähnlichkeitsschwellwert-Kalibrierung**
   - Was wir wissen: DINOv2 Ähnlichkeit Kamerafoto ↔ STEP-Rendering liegt lt. CONTEXT.md typisch bei 0.55–0.80
   - Was unklar ist: Ob Default 0.7 bei realen Kamerafotos (Reflexionen, Beleuchtung, Winkel) zu konservativ ist
   - Empfehlung: Default 0.7 beibehalten (D-06 ist gesperrt), aber in Phase 10 Hardening auf Basis echter Testbilder evaluieren

2. **`similarity`-Feld als Neon Decimal-String**
   - Was wir wissen: Neon gibt berechnete Float-Ausdrücke als Strings zurück in manchen Fällen
   - Was unklar ist: Ob `1 - (embedding <=> ...)` als JavaScript `number` oder als String zurückkommt
   - Empfehlung: `parseFloat(row.similarity)` defensiv immer verwenden; schadet nicht falls es bereits number ist

---

## Environment Availability

| Dependency | Benötigt für | Verfügbar | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next.js Route Handler | ✓ | v25.6.0 | — |
| Python Worker (FastAPI) | `/embed`-Endpunkt | Lokal via Docker Compose | Phase 2/3 etabliert | Dev-Bypass: WORKER_URL nicht gesetzt → 503 |
| AWS S3 / BUCKET_THUMBNAILS | Temp-Image-Upload | ✓ (via Env-Vars) | — | — |
| Neon pgvector | Cosine Query | ✓ (Phase 1 Migration applied) | HNSW-Index aktiv | — |
| `crypto.randomUUID()` | Temp-Key-Generierung | ✓ | Node.js built-in | `uuid` npm package |

**Fehlende Dependencies ohne Fallback:** Keine.

**Fehlende Dependencies mit Fallback:**
- Python Worker nicht gestartet: Handler gibt 503 zurück (analog zu Phase 3 Dev-Bypass — kein silent failure)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- src/app/api/search/route.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Verhalten | Test-Typ | Automatisierter Befehl | Datei vorhanden? |
|--------|----------|----------|----------------------|-----------------|
| SEARCH-03 | Gerankete Treffer mit similarity-Score zurückgeben | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |
| SEARCH-04 | Threshold-Filter schließt Treffer unter Schwellwert aus | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |
| SEARCH-05 | Limit-Parameter begrenzt Anzahl der Ergebnisse | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |
| SEARCH-03/04/05 | Ungültige Query-Params → 400 | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |
| SEARCH-03 | Kein Bild im FormData → 400 | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |
| SEARCH-03 | Worker nicht erreichbar → 502 | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |
| SEARCH-03 | Keine Treffer → leeres results-Array + 200 | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Pro Task-Commit:** `npm test -- src/app/api/search/route.test.ts`
- **Pro Wave-Merge:** `npm test`
- **Phase Gate:** Full Suite grün vor `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/api/search/route.test.ts` — alle SEARCH-03/04/05-Test-Cases (Vitest, mocked `db`, `s3`, `fetch`)
- [ ] `src/app/api/search/route.ts` — Datei existiert noch nicht (wird in Wave 1 erstellt)

*(Kein neues Test-Setup nötig — bestehende `vitest.config.ts` + `src/test/setup.ts` decken die neuen Tests ab)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | nein | Pilot ohne Auth (Phase 1 D-06) |
| V3 Session Management | nein | Stateless API |
| V4 Access Control | nein | Kein Multi-User |
| V5 Input Validation | ja | Zod für Query-Params; MIME-Check für Datei; UUID-Format nicht relevant (kein params.id) |
| V6 Cryptography | nein | Kein Passwort/Key-Handling |

### Bekannte Threat-Patterns für diesen Stack

| Pattern | STRIDE | Standard-Mitigation |
|---------|--------|---------------------|
| Path-Traversal via S3-Key | Tampering | `crypto.randomUUID()` generiert den Key serverseitig — kein User-Input im S3-Key |
| Nicht-Bild-Upload (Polyglot-File) | Spoofing | `file.type.startsWith('image/')` — reicht für Phase 6; tieferes Magic-Byte-Checking in Phase 10 |
| Übermäßig großes Bild (DoS) | DoS | Dateigrößen-Limit im Handler prüfen (z.B. max 10 MB) — DINOv2 resized auf 224x224 im Worker |
| Worker-SSRF via s3_key-Parameter | Tampering | Worker liest nur aus festem `BUCKET_THUMBNAILS`-Bucket — Key-Präfix `search-temp/` kann validiert werden |
| SQL-Injection via Embedding | Tampering | Embedding-Literal ist generierter Float-String — keine User-Input-Strings; Zod-Validierung für threshold/limit |

---

## Project Constraints (aus CLAUDE.md)

Diese Direktiven aus `./CLAUDE.md` und `.claude/rules/` haben unmittelbaren Einfluss auf Phase 6:

| Direktive | Quelle | Auswirkung auf Phase 6 |
|-----------|--------|----------------------|
| `WORKER_URL` ist server-only (kein `NEXT_PUBLIC_`) | CLAUDE.md + security.md | `/api/search` ist Route Handler — kein Client-Bundle-Risiko |
| `db` Tagged Template aus `@/lib/db` verwenden (nicht `sql`) | CLAUDE.md | Alle DB-Queries via `db\`...\`` |
| Zod für alle Inputs | backend.md + security.md | Query-Params, Datei-MIME — bereits in Pattern 3 |
| `z.string().uuid()` für params-Validierung | Established pattern Phase 3–5 | Nicht nötig in `/api/search` (kein `params.id`), aber für `/embed` im Worker Pydantic UUID4 |
| Alle neuen Env-Vars in `.env.local.example` dokumentieren | security.md | Falls `search-temp`-Bucket gewählt: neue Env-Var nötig; bei `BUCKET_THUMBNAILS`-Reuse: nichts |
| shadcn/ui exklusiv für UI-Komponenten | CLAUDE.md | Nicht relevant — Phase 6 ist Backend-only |
| RLS bewusst deaktiviert (Pilot) | Phase 1 D-06 | Kein `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` |

---

## Sources

### Primary (HIGH confidence)

- `/pgvector/pgvector` (Context7) — `<=>` Operator, HNSW-Index, Cosine-Similarity-Query-Muster, Filtering-Verhalten
- `/vercel/next.js` (Context7) — `request.formData()`, `FormData.get()`, `NextRequest.nextUrl.searchParams`, `maxDuration`
- `/websites/zod_dev` (Context7) — `z.coerce.number()`, `.min()/.max()/.int()`, `.default()`
- `/neondatabase/serverless` (Context7) — Tagged Template Parameterisierung, `sql.query()` für dynamisches SQL
- `/websites/fastapi_tiangolo` (Context7) — Sync POST Endpoint mit Pydantic BaseModel
- `worker/embedder.py` (Codebase) — `get_embedding()`, `mean_pool()`, Modul-Global `_model`/`_processor`
- `worker/main.py` (Codebase) — Bestehende FastAPI-Struktur (`/health`, `/enqueue`)
- `src/app/api/upload/confirm/route.ts` (Codebase) — Worker-HTTP-Call-Pattern
- `src/lib/s3.ts` (Codebase) — `BUCKET_THUMBNAILS`-Konstante, S3-Client-Konfiguration
- `supabase/migrations/001_parts_schema.sql` (Codebase) — `embedding vector(768)`, `parts_embedding_hnsw_idx`, `status`-Feld

### Secondary (MEDIUM confidence)

- `.planning/phases/06-search-pipeline/06-CONTEXT.md` — Locked Decisions D-01 bis D-12

### Tertiary (LOW confidence)

- Keine LOW-confidence-Quellen in dieser Recherche.

---

## Metadata

**Konfidenz-Aufschlüsselung:**

- Standard Stack: HIGH — alle Libraries bereits im Projekt, Versionen verifiziert
- Architecture: HIGH — pgvector-Query-Syntax und Next.js-FormData-Pattern aus offiziellen Docs
- Pitfalls: HIGH (Pitfalls 1–5) / MEDIUM (Pitfall 6) — Neon+pgvector-Typ-Mismatch aus Praxis-Pattern

**Research-Datum:** 2026-05-09
**Gültig bis:** 2026-06-09 (stable stack)
