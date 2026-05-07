# Technology Stack

**Project:** Bauteil-Finder (CAD Part Recognition)
**Researched:** 2026-05-07
**Verification note:** External tool access (WebSearch, WebFetch, Bash/Context7) was denied during this research session. All findings are based on training knowledge with cutoff August 2025. Confidence levels reflect this limitation — HIGH means well-established prior to cutoff, MEDIUM means established but verify version numbers, LOW means area evolves fast or was thin in training data.

---

## Recommended Stack

### STEP File Parsing and Rendering

**Recommendation: Python microservice using pythonOCC + Open CASCADE Technology (OCCT)**

| Technology | Version (verify) | Purpose | Why |
|------------|-----------------|---------|-----|
| pythonOCC-core | 7.7.x (OCCT 7.7) | Parse STEP, build 3D topology, generate geometry for rendering | The canonical Python binding to OpenCASCADE. Handles ISO 10303 STEP reliably. Used in production CAD tooling (FreeCAD internals). |
| OpenCASCADE (OCCT) | 7.7.x | Geometry kernel | Industry standard geometry kernel. pythonOCC wraps it. Not a dependency you install separately — pythonOCC bundles it via conda. |
| VTK (via pythonOCC offscreen) | 9.x | Offscreen rendering to PNG | pythonOCC ships with an offscreen renderer using VTK or coin3d. Works headless (no display server needed). |
| FastAPI | 0.111+ | Python microservice HTTP API | Lightweight async Python HTTP server. Appropriate for the job-processing microservice that Next.js calls. |
| Celery + Redis | Celery 5.x, Redis 7.x | Async task queue | STEP processing takes seconds to tens of seconds per file. Must be async. Celery dispatches jobs; Redis is the broker. |

**Confidence: MEDIUM** — pythonOCC + OCCT is the established open-source stack for this problem. FreeCAD uses it internally, confirming production viability. VTK offscreen rendering is well-documented but requires Linux container with Mesa GL (software rasterizer) or a GPU. Verify that pythonOCC 7.7 is the current release.

**Why not alternatives:**

| Alternative | Why Not |
|-------------|---------|
| FreeCAD headless (CLI) | FreeCAD can be called as `freecadcmd` to run Python scripts. This works but FreeCAD is a heavy dependency (~500MB+ install). pythonOCC is the same underlying kernel without the GUI application overhead. Viable fallback if pythonOCC proves difficult to containerize. |
| Three.js + step-loader (browser-side) | No mature STEP parser exists in JavaScript/WASM that handles the full STEP AP214/AP242 spec reliably. `three-step` and similar loaders exist but have significant geometry gaps. Server-side rendering is the right call for this domain. |
| HOOPS Communicator | Commercial SDK (Tech Soft 3D). Excellent quality but per-seat licensing makes it inappropriate for an internal tool MVP. |
| OpenSCAD | Does not read STEP files. It uses its own CSG format. Not applicable. |
| Blender headless | Blender's STEP import is via third-party add-ons and is unreliable for industrial STEP files. Not recommended. |
| ifcopenshell | Targets IFC (BIM/architecture) format, not mechanical STEP. Wrong domain. |

**Rendering approach detail:**
pythonOCC has two rendering paths:
1. `Display3d` with a VTK-based offscreen viewer — generates PNG directly, no display server needed when Mesa is installed.
2. Export to VRML/STL/OBJ → render with a separate renderer (e.g., Blender Python API, trimesh + pyrender). This is slower but more flexible for camera angle control.

Recommended: path 1 for speed. Generate 6-8 views (front, back, left, right, top, bottom, isometric from two angles). Each view becomes an image fed to the embedding model.

**Confidence for offscreen rendering: MEDIUM** — Mesa (software GL) on Linux Docker is standard for headless VTK. GPU passthrough (NVIDIA) is possible but not required for an internal tool at 1000-file scale.

---

### Embedding Model

**Recommendation: DINOv2 (ViT-B/14) via Hugging Face Transformers**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| DINOv2 (facebook/dinov2-base) | ViT-B/14 | Generate 768-dim visual embeddings from rendered CAD images | DINOv2 produces dense, geometry-aware features without text supervision. Outperforms CLIP on visual similarity tasks. Strong performance on texture-free images (which CAD renderings are). |
| transformers (Hugging Face) | 4.40+ | Load and run DINOv2 | Standard Python library for pretrained models. |
| torch | 2.x | DINOv2 inference backend | PyTorch is the runtime for DINOv2. CPU inference is feasible for a 1000-part database (batch processing at upload time, not at query time). |
| Pillow | 10.x | Image preprocessing before embedding | Standard image manipulation for model input normalization. |

**Confidence: MEDIUM-HIGH** — DINOv2 was published by Meta in 2023 and has become the de facto recommendation for visual feature extraction where CLIP's text-image alignment is unnecessary. Multiple academic papers (2023-2024) validate it for industrial part similarity tasks. The key insight: CAD renderings have no texture variation, so CLIP's image-text alignment provides no benefit. DINOv2's self-supervised objective produces features that respond to geometric structure, which is exactly what this application needs.

**Multi-view aggregation strategy:**
Generate N views (recommend 8) per STEP file. Run DINOv2 on each view. Mean-pool the embeddings into a single 768-dim vector per part. Store this aggregated vector. At query time, run the phone photo through DINOv2 once and compare against the stored vectors.

**Why not alternatives:**

| Alternative | Why Not |
|-------------|---------|
| CLIP (openai/clip-vit-base-patch32) | CLIP is trained for image-text alignment. On pure geometric/visual similarity without text queries, DINOv2 consistently scores higher. However, CLIP is a valid fallback if DINOv2 inference proves too slow — it is faster and smaller. |
| ResNet-50 / EfficientNet | Older architectures. DINOv2 ViT-B outperforms them on feature quality. No compelling reason to use legacy CNNs. |
| Point-E, ShapE, or 3D-specific models (PointNet, PointNet++) | These operate on point clouds, not images. Requires converting STEP to point cloud first (additional complexity). DINOv2 on multi-view 2D images achieves comparable or better retrieval accuracy with much simpler infrastructure. |
| TripoSR or similar 3D reconstruction models | Overkill. These reconstruct geometry; we need embeddings. |
| Fine-tuned contrastive model | Would require labeled pairs of similar parts. Out of scope per PROJECT.md. Pre-trained embeddings are the explicit constraint. |

**Confidence for multi-view mean-pooling: MEDIUM** — This is an established heuristic from the retrieval literature. The exact number of views to optimize quality vs. processing cost should be empirically tested. 8 views is a reasonable starting point.

---

### Vector Database

**Recommendation: Supabase pgvector (PostgreSQL extension)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pgvector | 0.7+ | Store and query 768-dim embedding vectors with ANN index | Already inside Supabase's managed PostgreSQL. No additional service to deploy or pay for. HNSW indexing supports fast approximate nearest-neighbor queries at 1000-part scale comfortably. |

**At 1000 parts:** pgvector with HNSW index is fast — sub-10ms queries for this corpus size. pgvector scales to millions of vectors with HNSW. At 1000 parts, it is effectively instant.

**Schema decision:**
- `parts` table: id, name, part_number, project, date, step_file_path, status, created_at
- `part_embeddings` table: id, part_id (FK), embedding (vector(768)), view_index
- Store one aggregated embedding per part OR one embedding per view with a GROUP BY aggregation at query time. Storing the pre-aggregated vector is simpler and faster.

**pgvector index type:** Use HNSW (not IVFFlat). HNSW has better recall and does not require training a clustering step. For 1000 vectors, the difference is negligible, but HNSW is the correct default for new projects.

**Distance metric:** Cosine similarity. DINOv2 embeddings are L2-normalized, making cosine similarity equivalent to dot product. Use `<=>` operator in pgvector for cosine distance.

**Why not alternatives:**

| Alternative | Why Not |
|-------------|---------|
| Pinecone | Managed vector DB, excellent at scale. Not needed at 1000 parts. Adds monthly cost and an external dependency when pgvector does the job inside the existing Supabase instance. Revisit if the corpus grows to 100K+. |
| Weaviate | Self-hosted or cloud. Same argument as Pinecone — external service complexity is not justified at this scale. |
| Qdrant | Same. Excellent product, wrong scale for this use case. |
| Milvus | Heavy infrastructure (needs etcd, MinIO). Definitely overkill. |
| Chroma | Dev-focused, embedded. Not the right architecture for a production web service backed by Supabase. |

**Confidence: HIGH** — pgvector + Supabase is a well-documented combination. Supabase explicitly supports and documents the pgvector extension. HNSW at 1000 vectors is a solved problem with published benchmarks.

---

### Processing Pipeline Architecture

**Recommendation: Async Python microservice with Celery queue, called from Next.js API route**

```
[Next.js Upload API Route]
    → upload STEP file to Supabase Storage
    → insert part record (status: "processing")
    → POST to Python microservice /process-step (fire-and-forget or return job_id)

[Python Microservice - FastAPI]
    → receives job (file URL, part_id)
    → enqueues Celery task

[Celery Worker (same Python container or separate)]
    → downloads STEP from Supabase Storage
    → pythonOCC: parse STEP, render 8 views to PNG
    → DINOv2: generate embeddings for each view, mean-pool
    → INSERT embedding into Supabase via REST API or direct pg connection
    → UPDATE part status to "ready"

[Next.js]
    → polls part status OR listens via Supabase Realtime
    → shows "processing" spinner until status = "ready"
```

**Queue choice: Celery + Redis**
- Redis as broker: lowest operational overhead, widely supported
- Alternative: Celery + PostgreSQL broker (via `celery-sqlalchemy-scheduler` or `django-db-geventpool`) — avoids a Redis dependency but PostgreSQL as a queue broker is slower and less battle-tested. Redis is the right call.

**Deployment options for the Python microservice:**

| Option | Pros | Cons |
|--------|------|------|
| Docker container on Railway.app | Simple, cheap, $5-20/month, handles the Python environment including Mesa GL | Adds a deployment target beyond Vercel |
| Docker container on Fly.io | Similar to Railway, persistent volumes available | Same |
| Vercel Fluid compute (Python runtime) | Would eliminate separate deployment | Vercel's Python runtime does NOT support native binaries well — pythonOCC requires compiled OpenCASCADE libs. Not viable. |
| AWS Lambda / Google Cloud Run | Cloud Run works well (Docker-based). Lambda has package size limits that are incompatible with OCCT binaries. Cloud Run is a valid choice if team is comfortable with GCP. |

**Recommendation: Railway or Fly.io** for simplicity. Both support Docker, both charge for actual compute time. The Python microservice only runs on-demand when STEP files are uploaded, so cost is minimal.

**Confidence for pipeline architecture: HIGH** — Async queue pattern for CPU-intensive processing is standard. The specific technology choices (Celery, Redis, FastAPI) are well-established and have broad documentation. The deployment platform question is MEDIUM confidence — Railway and Fly.io are relatively new but actively maintained as of training cutoff.

---

### Mobile Camera Integration (Next.js Frontend)

**Recommendation: Browser native getUserMedia API + HTML `<input type="file" accept="image/*" capture="environment">`**

| Technology | Purpose | Why |
|------------|---------|-----|
| HTML input with capture attribute | Trigger native camera on mobile | Zero JavaScript required, maximum compatibility across iOS Safari and Android Chrome. The `capture="environment"` attribute opens the rear camera directly. |
| WebRTC getUserMedia (fallback) | Live viewfinder before capture | If a viewfinder UX is desired (vs. just picking a photo), getUserMedia provides a live camera stream. More complex but better UX. |
| Canvas API | Resize/compress image before upload | Phone photos can be 10-15MB. Resize to 512x512 or 1024x1024 on the client before uploading to reduce server load and latency. |

**Confidence: HIGH** — This is standard web platform capability, well-documented, and stable.

---

### Supporting Libraries

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| python-dotenv | 1.x | Environment config in Python service | Standard |
| supabase-py | 2.x | Python client for Supabase REST API | Used by Celery worker to update part status and insert embeddings |
| numpy | 1.26+ / 2.x | Embedding vector math (mean pooling) | Standard scientific Python |
| Pillow | 10.x | Image manipulation in Python | Resize rendered PNGs before feeding to DINOv2 |
| next (App Router) | 16.x | Frontend + API routes | Already in stack |
| @supabase/supabase-js | 2.x | Supabase client for Next.js | Already in stack or add it |

---

## What NOT to Use

| Technology | Verdict | Reason |
|------------|---------|--------|
| Three.js STEP loader | Do not use | No production-quality STEP parser exists in JavaScript. STEP is complex (ISO 10303 has 200+ application protocols). OpenCASCADE handles this properly; JS parsers handle a subset. |
| PointNet / point cloud models | Defer | Requires STEP-to-point-cloud conversion pipeline. Multi-view DINOv2 achieves comparable retrieval with simpler infra. |
| Vercel serverless for Python processing | Do not use | Vercel's Python runtime cannot install compiled native libraries (pythonOCC requires OpenCASCADE compiled binaries ~200MB). Use Docker on Railway/Fly.io. |
| Pinecone / Weaviate / Qdrant | Defer | Excellent at 100K+ vectors. At 1000 parts, pgvector is sufficient and eliminates an external service. Revisit at 50K+ parts. |
| CLIP for embeddings | Consider as fallback | DINOv2 is recommended for geometric visual similarity. CLIP is 30-40% faster and smaller — valid if DINOv2 inference is too slow on CPU. |
| Redis Streams instead of Celery | Defer | More complex to implement. Celery abstracts task serialization, retry, and monitoring. Use Celery for the MVP. |
| FreeCAD headless (freecadcmd) | Possible fallback only | Heavy install (~500MB container), but identical kernel to pythonOCC. Use if pythonOCC containerization fails. |
| WebAssembly OCCT (opencascade.js) | Do not use for server rendering | opencascade.js is a WASM port for browser-side rendering. It runs in the browser, not on the server. Useful for a future interactive 3D preview in the UI but not for batch rendering in the backend. |

---

## Installation Sketch

**Python microservice (requirements.txt):**
```
fastapi==0.111.*
uvicorn[standard]==0.29.*
celery==5.4.*
redis==5.0.*
pythonOCC-core==7.7.*        # install via conda, not pip
torch==2.3.*
transformers==4.41.*
Pillow==10.3.*
numpy==1.26.*
supabase==2.4.*
python-dotenv==1.0.*
```

**Note on pythonOCC installation:** pythonOCC-core is best installed via conda-forge (`conda install -c conda-forge pythonocc-core`). The pip wheel is available but may have platform-specific issues. The Docker container should be based on a conda image (e.g., `continuumio/miniconda3`) and install pythonOCC via conda.

**Docker base image recommendation:**
```dockerfile
FROM continuumio/miniconda3:latest
# Install Mesa GL for offscreen rendering
RUN apt-get install -y libgl1-mesa-glx libglib2.0-0
RUN conda install -c conda-forge pythonocc-core
```

**Confidence for conda approach: MEDIUM** — This is the documented installation method for pythonOCC. The exact Dockerfile may need iteration.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| STEP parsing | pythonOCC + OCCT | FreeCAD headless | Same kernel, heavier image. Fallback option. |
| Embedding model | DINOv2 ViT-B/14 | CLIP ViT-B/32 | CLIP is faster but geometry-agnostic; DINOv2 better for visual structure. |
| Vector search | pgvector (Supabase) | Pinecone | External service, unnecessary at 1000-part scale. |
| Task queue broker | Redis | PostgreSQL | PostgreSQL as queue broker is slower, less tested. |
| Microservice HTTP | FastAPI | Flask | FastAPI is async-native, has auto-generated docs, better for this use case. |
| Microservice deployment | Railway / Fly.io | Cloud Run (GCP) | Cloud Run valid alternative; Railway/Fly.io simpler for single-engineer teams. |
| Rendering backend | pythonOCC VTK offscreen | pythonOCC → OBJ export → pyrender | Direct VTK offscreen path is faster; OBJ export adds a step. |

---

## Open Questions (Require Validation)

1. **pythonOCC VTK offscreen on Linux Docker**: Does the VTK offscreen renderer work without a GPU using Mesa software rasterization? Needs a test container to validate. FreeCAD headless is the fallback if this fails.

2. **DINOv2 CPU inference speed**: At upload time, how long does DINOv2 ViT-B take per image on a typical Railway/Fly.io CPU instance? Estimate 0.5-2 seconds per image × 8 views = 4-16 seconds per STEP file. Acceptable for an async pipeline. Verify empirically.

3. **pgvector HNSW index build**: Supabase managed Postgres — does the managed instance expose the ability to create HNSW indexes? Yes per public Supabase docs, but verify with current Supabase dashboard.

4. **pythonOCC version currency**: Training data shows 7.7.x as current. Verify on PyPI / conda-forge before pinning.

5. **Redis on Railway**: Railway provides managed Redis. Verify current pricing (was $3-5/month persistent Redis as of training data).

---

## Sources

- Training knowledge (pythonOCC, OCCT, DINOv2, pgvector, Celery, FastAPI) — cutoff August 2025
- Confidence levels assigned conservatively given inability to verify with live web sources
- Priority verification targets: pythonOCC installation docs, Supabase pgvector docs, DINOv2 Hugging Face model card, Railway pricing page
