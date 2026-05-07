# Architecture Patterns

**Domain:** CAD Part Recognition — STEP-file similarity search via visual embeddings
**Project:** Bauteil-Finder
**Researched:** 2026-05-07
**Confidence:** HIGH (based on established patterns in vector search systems, async processing pipelines, and CAD toolchain constraints)

---

## Recommended Architecture

Two completely separate data flows share one database. The **ingestion pipeline** is asynchronous and heavy; the **search pipeline** is synchronous and must be fast.

```
┌─────────────────────────────────────────────────────────────────┐
│                        INGESTION FLOW                           │
│                                                                 │
│  Browser (Desktop)                                              │
│  ┌──────────────┐                                               │
│  │ Upload UI    │──── multipart/form-data ────┐                 │
│  │ (Next.js)    │                             ▼                 │
│  └──────────────┘                   ┌──────────────────┐        │
│                                     │ Next.js API Route│        │
│                                     │ /api/parts/upload│        │
│                                     └────────┬─────────┘        │
│                                              │                  │
│                              ① store raw file to Supabase       │
│                                     Storage (parts-raw/)        │
│                                              │                  │
│                              ② insert parts row (status=pending) │
│                                              │                  │
│                              ③ enqueue job (Supabase pg_cron    │
│                                 OR external queue)              │
│                                              │                  │
│                                              ▼                  │
│                                   ┌──────────────────┐          │
│                                   │  Python Worker   │          │
│                                   │  (separate svc)  │          │
│                                   └────────┬─────────┘          │
│                                            │                    │
│                              ④ download STEP from Storage        │
│                                            │                    │
│                              ⑤ render to N images               │
│                                 (pythonocc / cadquery)          │
│                                            │                    │
│                              ⑥ run images through               │
│                                 CLIP / DINOv2 model             │
│                                            │                    │
│                              ⑦ store rendered images            │
│                                 to Supabase Storage             │
│                                 (parts-renders/)                │
│                                            │                    │
│                              ⑧ upsert embedding + status=ready  │
│                                 into parts table                │
│                                            │                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          SEARCH FLOW                            │
│                                                                 │
│  Browser (Mobile — phone camera)                                │
│  ┌──────────────┐                                               │
│  │ Camera UI    │──── JPEG / WebP blob ──────┐                  │
│  │ (Next.js PWA)│                            ▼                  │
│  └──────────────┘                  ┌──────────────────┐         │
│                                    │ Next.js API Route│         │
│                                    │ /api/search      │         │
│                                    └────────┬─────────┘         │
│                                             │                   │
│                              ① send image to embedding service  │
│                                 (same Python worker, HTTP call) │
│                                             │                   │
│                              ② receive query embedding vector   │
│                                             │                   │
│                              ③ pgvector ANN search              │
│                                 (cosine distance, HNSW index)   │
│                                             │                   │
│                              ④ return top-K parts with          │
│                                 metadata + similarity score     │
│                                             │                   │
│                                             ▼                   │
│                                   ┌──────────────────┐          │
│                                   │  Results UI      │          │
│                                   │  (Next.js)       │          │
│                                   └──────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Technology |
|-----------|---------------|-------------------|------------|
| **Upload UI** | File picker, metadata form, upload progress, status polling | Next.js API `/api/parts/upload`, `/api/parts/[id]/status` | Next.js App Router, React, shadcn/ui |
| **Camera / Search UI** | `getUserMedia` capture, image preview, threshold/count controls, results display | Next.js API `/api/search` | Next.js App Router, React, shadcn/ui |
| **Next.js API — Upload** | Receive file + metadata, validate, store to Supabase Storage, insert DB row, trigger worker | Supabase Storage, Supabase DB, Python Worker (HTTP or queue) | Next.js Route Handler, `@supabase/supabase-js` |
| **Next.js API — Search** | Receive photo, forward to embedding service, execute pgvector query, return results | Python Embedding Service (HTTP), Supabase DB | Next.js Route Handler |
| **Next.js API — Status** | Polling endpoint for ingestion progress | Supabase DB | Next.js Route Handler |
| **Python Worker / Embedding Service** | STEP → render → embedding (ingestion); image → embedding (search) | Supabase Storage (read STEP, write renders), Supabase DB (write embedding + status) | Python, pythonocc-core or cadquery, open3d, transformers (CLIP/DINOv2) |
| **Supabase Storage** | Binary file hosting (raw STEP files, rendered PNG/JPG previews) | Upload API, Python Worker | Supabase Storage buckets |
| **Supabase PostgreSQL + pgvector** | Part metadata, processing status, embedding vectors, HNSW index | All API routes, Python Worker | PostgreSQL 15+, pgvector extension |

---

## Where STEP Processing Should Live

**Recommendation: Dedicated Python microservice, not Next.js API routes.**

Rationale:
- STEP parsing (pythonocc-core / cadquery) requires a compiled C++ kernel (OpenCASCADE). This cannot run inside a Node.js process or serverless function.
- Rendering a single STEP file takes 2–30 seconds depending on complexity. Serverless timeouts (Vercel: 60s max on Pro) make this unreliable for real-world parts.
- The CLIP / DINOv2 model is a 300–600 MB PyTorch artifact. Loading it repeatedly in a serverless context is prohibitively expensive.
- A persistent Python service keeps the model hot in memory, making search embedding extraction ~100ms instead of ~10s.

**Deployment options for the Python service (in order of preference for this project):**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Docker container on Railway / Render (free tier → paid)** | Full control, persistent process, model stays hot, STEP libs available | Requires separate deployment | **Recommended for MVP** |
| **Modal.com serverless GPU functions** | No infra management, scales to zero, GPU available | Cold-start latency, cost per call | Good for later scale-up |
| **Google Cloud Run (container)** | Managed, scales to zero but keeps minimum 1 instance | More DevOps setup | Alternative to Railway |
| **Next.js API route with child_process** | Stays in one repo | STEP libs not installable in Node, Vercel build size limits | Not viable |
| **Vercel Edge Functions** | Zero latency, simple | Cannot run PyTorch or OpenCASCADE | Not viable |

---

## Async Processing Pipeline Detail

```
UPLOAD REQUEST (synchronous — completes in <500ms)
  ▼
  1. Validate file extension (.step / .stp), max size (e.g. 200MB)
  2. Upload raw STEP to Supabase Storage: parts-raw/{uuid}.step
  3. INSERT into parts table:
       id, name, part_number, project, uploaded_at,
       status = 'pending', file_path, embedding = NULL
  4. POST /internal/process to Python Worker (fire-and-forget)
     OR insert into processing_jobs table (polling-based trigger)
  5. Return { partId, status: 'pending' } to browser

PYTHON WORKER (asynchronous — runs in background)
  ▼
  1. UPDATE parts SET status = 'processing' WHERE id = ?
  2. Download STEP file from Supabase Storage
  3. Parse + render to 6 views (front, back, top, bottom, left, right)
     using pythonocc-core + offscreen renderer (OSMesa / EGL)
  4. For each rendered view: extract embedding via CLIP ViT-B/32
  5. Average-pool all 6 view embeddings → single 512-dim vector
  6. Upload rendered preview images to parts-renders/{uuid}/*.png
  7. UPDATE parts SET
       status = 'ready',
       embedding = '[0.123, ...]'::vector,
       preview_image_url = '...'
     WHERE id = ?
  8. If any step fails: UPDATE parts SET status = 'error', error_msg = ?

STATUS POLLING (browser polls every 3s until status != 'pending'/'processing')
  GET /api/parts/{id}/status → { status, previewUrl? }
```

---

## Search Query Data Flow

```
MOBILE BROWSER
  ├─ getUserMedia({ video: { facingMode: 'environment' } })
  ├─ Capture frame as JPEG (canvas.toBlob)
  └─ POST /api/search  { image: Blob, threshold: 0.7, limit: 10 }

NEXT.JS /api/search
  ├─ Validate image (size, mime type)
  ├─ POST http://python-worker/embed  { image: base64 }
  │   └─ Returns: { embedding: float[512] }
  ├─ Supabase RPC: match_parts(query_embedding, threshold, limit)
  │   └─ SQL (see schema section below)
  └─ Return: { results: [{ id, name, partNumber, project,
                           similarity, previewUrl, uploadedAt }] }

MOBILE BROWSER
  └─ Render result cards sorted by similarity descending
```

The Next.js API layer acts as an orchestrator: it does not know how embeddings are created, only how to call the Python service and query the database. This keeps the two concerns separately deployable.

---

## pgvector Schema and Index Structure

**Recommended embedding model:** CLIP ViT-B/32 produces 512-dimensional vectors. DINOv2 ViT-S/14 produces 384-dimensional vectors. Both work well for visual similarity; CLIP is preferred because it is widely available and the same model handles both the rendered views and the query photo.

```sql
-- Enable extension (done once in Supabase dashboard)
CREATE EXTENSION IF NOT EXISTS vector;

-- Parts table
CREATE TABLE parts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  part_number   TEXT,
  project       TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'ready' | 'error'
  error_msg     TEXT,
  file_path     TEXT NOT NULL,          -- Supabase Storage path to .step
  preview_urls  TEXT[],                 -- array of rendered view URLs
  embedding     vector(512),            -- NULL until status = 'ready'
  created_by    UUID REFERENCES auth.users(id)
);

-- HNSW index for approximate nearest-neighbor search
-- Build AFTER bulk ingestion, or incrementally (pgvector >= 0.5.0)
-- m=16, ef_construction=64 are good defaults for 1000-10000 vectors
CREATE INDEX parts_embedding_hnsw
  ON parts USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index on status for efficient polling queries
CREATE INDEX parts_status_idx ON parts (status);

-- RPC function called by Next.js search API
-- Supabase wraps this as a callable RPC
CREATE OR REPLACE FUNCTION match_parts(
  query_embedding vector(512),
  similarity_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  part_number TEXT,
  project TEXT,
  uploaded_at TIMESTAMPTZ,
  preview_urls TEXT[],
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    id,
    name,
    part_number,
    project,
    uploaded_at,
    preview_urls,
    1 - (embedding <=> query_embedding) AS similarity
  FROM parts
  WHERE
    status = 'ready'
    AND 1 - (embedding <=> query_embedding) >= similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Key design decisions in the schema:**

- `embedding <=> query_embedding` is cosine distance (lower = more similar). `1 - distance` converts to similarity score (higher = more similar) for display.
- The HNSW index (`hnsw`) is preferred over IVFFlat for this use case: HNSW does not require a training step and maintains quality as the dataset grows incrementally. IVFFlat requires re-training when the dataset grows significantly. At 1000–10000 vectors, HNSW with default parameters gives excellent recall with sub-millisecond query time.
- `embedding` is NULL for unprocessed parts. The `WHERE status = 'ready'` guard in the RPC prevents NULL vectors from reaching the distance operator (which would cause a PostgreSQL error).
- `preview_urls TEXT[]` stores the array of rendered views. The first element is used as the card thumbnail.

---

## Major Subsystems and Their Interfaces

```
┌─────────────────────────────────────────────────────────────┐
│ SUBSYSTEM MAP                                               │
│                                                             │
│  ┌──────────────┐     HTTP REST      ┌─────────────────┐   │
│  │  Next.js     │ ◄────────────────► │  Python Worker  │   │
│  │  (Vercel)    │                    │  (Railway/Render)│  │
│  └──────┬───────┘                    └────────┬────────┘   │
│         │                                     │            │
│         │ Supabase JS SDK            Supabase Storage SDK  │
│         │ (REST + Realtime)          (direct bucket access) │
│         ▼                                     ▼            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Supabase Platform                     │   │
│  │  ┌──────────────────┐   ┌──────────────────────┐   │   │
│  │  │  PostgreSQL DB   │   │  Storage Buckets     │   │   │
│  │  │  + pgvector      │   │  parts-raw/          │   │   │
│  │  │  + auth.users    │   │  parts-renders/      │   │   │
│  │  └──────────────────┘   └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Interface contracts:**

| Interface | Protocol | Payload | Caller → Callee |
|-----------|----------|---------|-----------------|
| Upload trigger | HTTP POST or DB row insert | `{ partId, filePath }` | Next.js → Python Worker |
| Embedding extraction (search) | HTTP POST `/embed` | `{ image: base64 }` → `{ embedding: float[] }` | Next.js → Python Worker |
| DB read (search) | Supabase RPC | `match_parts(vec, threshold, limit)` | Next.js → PostgreSQL |
| DB write (ingestion) | Supabase JS / Python client | SQL UPDATE | Python Worker → PostgreSQL |
| File storage (write) | Supabase Storage SDK | binary blob | Next.js + Python Worker → Storage |
| File storage (read) | Supabase Storage SDK | binary stream | Python Worker ← Storage |
| Status poll | HTTP GET | `{ status, previewUrl }` | Browser → Next.js |

---

## Suggested Build Order (Dependency-Driven)

Build in this order to have a working system at each phase boundary:

### Phase 1 — Database Foundation
**Why first:** Everything else depends on the schema. Get it right before building around it.
- Enable pgvector extension in Supabase
- Create `parts` table with all columns including `vector(512)` embedding column
- Create HNSW index
- Create `match_parts` RPC function
- Set up Row-Level Security (RLS) policies
- Set up Storage buckets (`parts-raw`, `parts-renders`) with access policies

No UI, no worker. Just the data layer. Validate with direct SQL in Supabase dashboard.

### Phase 2 — Python Worker (Core Engine)
**Why second:** The worker is the hardest part and the biggest technical risk. Validate it early before building UI around it.
- Dockerize with pythonocc-core + CLIP model baked in
- Implement `/process` endpoint: STEP download → render → embed → write to DB
- Implement `/embed` endpoint: image base64 → embedding vector
- Deploy to Railway or Render with health check endpoint
- Test with a handful of real STEP files; verify embeddings are stored correctly

This phase has the most uncertainty (STEP rendering environment, model size, render quality). Tackle it before any UI work.

### Phase 3 — Ingestion Pipeline (Upload API + Status)
**Why third:** Now that the worker exists, wire up the upload flow.
- `POST /api/parts/upload` — validate, store to Supabase Storage, insert DB row, call worker
- `GET /api/parts/[id]/status` — return current status and preview URLs
- Upload UI — file picker with metadata fields, progress indicator, status polling
- Part list page — show all parts with status badges

Milestone: an engineer can upload a STEP file and watch it move from `pending` → `processing` → `ready`.

### Phase 4 — Search Pipeline (Camera + Similarity Query)
**Why fourth:** Depends on Phase 2 (Python `/embed`) and Phase 1 (pgvector RPC).
- `POST /api/search` — receive image, call Python `/embed`, call `match_parts`, return results
- Camera capture UI — `getUserMedia`, capture button, preview frame
- Results display — ranked cards with similarity score, metadata, rendered preview
- Threshold and result-count controls (configurable per requirement)

Milestone: engineer can photograph a part and see the top matches.

### Phase 5 — Hardening and Mobile Polish
**Why last:** Optimization concerns that only matter once the happy path works.
- Mobile layout optimization (camera UI must work on small screens in landscape and portrait)
- Error states (upload failed, worker error, no camera permission, no matches found)
- Similarity threshold calibration (test with real parts to choose sensible defaults)
- Re-process failed parts (admin action)
- Upload authentication / access control (if needed)

---

## Scalability Considerations

| Concern | At 100 parts | At 1,000 parts | At 10,000 parts |
|---------|-------------|----------------|-----------------|
| **Vector search latency** | Exact scan is fine (<5ms) | HNSW index needed — already recommended | HNSW handles this well; consider `ef_search` tuning |
| **Ingestion throughput** | Single Python worker, sequential processing | Single worker still fine (10 min/file × 1000 = manageable over days) | Worker pool with multiple instances; job queue becomes essential |
| **Storage costs** | ~100MB STEP + 600MB renders | ~1GB STEP + 6GB renders | ~10GB STEP + 60GB renders; move to Supabase Storage tiers or S3 |
| **Embedding quality** | 6 fixed views sufficient | Same | Consider adding more views for complex topologies |
| **DB table size** | Trivial | 1000 × 512 floats = ~2MB embedding data; negligible | ~20MB embedding data; still trivial for PostgreSQL |
| **Python worker memory** | CLIP ViT-B/32 = ~600MB RAM | Same; model stays hot | Same; horizontal scaling of stateless `/embed` endpoint |
| **Job queue** | Fire-and-forget HTTP POST to worker is acceptable | Switch to database-backed queue (`processing_jobs` table, pg_cron poll) or Redis/BullMQ | Full queue infrastructure (Redis + worker pool) |

**Key scaling lever:** The HNSW index scales well to hundreds of thousands of vectors without rebuilding. The bottleneck at scale is ingestion throughput (STEP parsing + rendering is CPU-bound), not search. Horizontal scaling of the Python worker handles ingestion throughput.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Synchronous STEP Processing in the Upload Request
**What goes wrong:** User uploads → API waits for STEP render → timeout after 30–60s → upload appears to fail.
**Why it happens:** Treating STEP processing like a fast image resize.
**Instead:** Always decouple upload acknowledgment from processing. Return `partId` immediately; let the worker do the heavy lifting.

### Anti-Pattern 2: One Embedding Per Part (Single View)
**What goes wrong:** A photo of the front face of a bracket matches poorly against the rendered right-side view embedding. Similarity drops dramatically with viewpoint changes.
**Why it happens:** Assuming one canonical view is enough.
**Instead:** Render 6 orthographic views, extract one embedding per view, average-pool into a single 512-dim vector that is viewpoint-robust. (More advanced: store N embeddings and take max similarity across views — but average-pooling is simpler and works well for mechanical parts.)

### Anti-Pattern 3: Storing Embeddings in Application Code (not DB)
**What goes wrong:** The embedding becomes a JSON blob in application memory, requiring a full load and linear scan on every search. At 1000+ parts this is 500ms+.
**Why it happens:** Avoiding pgvector setup complexity.
**Instead:** Store embeddings natively as `vector(512)` in PostgreSQL with an HNSW index. Query time stays under 10ms regardless of dataset size.

### Anti-Pattern 4: Running CLIP Model in Next.js API Routes
**What goes wrong:** Next.js API routes on Vercel are serverless. Loading a 600MB PyTorch model on every cold start takes 10–30 seconds and exceeds Vercel memory limits (1GB on Pro).
**Why it happens:** Wanting to keep everything in one deployment.
**Instead:** The Python worker is a persistent service. Next.js only makes lightweight HTTP calls to it. This is the correct separation of concerns.

### Anti-Pattern 5: Using IVFFlat Instead of HNSW
**What goes wrong:** IVFFlat requires specifying the number of clusters (`lists`) at index creation time and degrades if the dataset grows significantly beyond that size. Rebuilding the index on a production database causes downtime.
**Why it happens:** IVFFlat is more widely documented in older pgvector tutorials.
**Instead:** Use HNSW from the start. It is append-friendly, does not require training, and has consistently better recall. Available in pgvector >= 0.5.0 (released 2023), which is what Supabase runs.

---

## Sources

- pgvector documentation: HNSW index semantics, cosine distance operator, RPC patterns — HIGH confidence (established, stable API)
- pythonocc-core / OpenCASCADE: headless rendering capability confirmed in community usage — MEDIUM confidence (rendering environment setup is non-trivial and environment-specific)
- CLIP ViT-B/32 embedding dimension (512), DINOv2 ViT-S/14 (384): official model cards — HIGH confidence
- Multi-view averaging as a technique for viewpoint-robust shape retrieval: well-established in 3D shape retrieval literature (MVCNN et al.) — HIGH confidence for the principle, MEDIUM confidence for specific hyperparameters (number of views, pooling strategy)
- HNSW parameters (m=16, ef_construction=64): pgvector default recommendation, appropriate for datasets up to ~100K vectors — HIGH confidence
- Railway / Render as deployment targets for containerized Python: current platform capabilities — MEDIUM confidence (verify current free tier limits before committing)
