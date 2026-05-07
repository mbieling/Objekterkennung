# Domain Pitfalls: CAD Part Recognition / 3D Shape Search

**Domain:** Visual similarity search for CAD/STEP files with mobile camera query
**Researched:** 2026-05-07
**Confidence note:** Bash and WebSearch tools were unavailable during this session.
Findings are based on training data covering production STEP pipelines, vector search
systems, CLIP-style embedding research, and mobile web camera UX. Confidence is
HIGH for well-established failure modes (STEP parsing, pgvector indexing), MEDIUM for
mobile UX specifics. All claims flagged accordingly.

---

## Critical Pitfalls

### C1: STEP Files That Pass Validation But Fail to Render

**Severity:** Critical

**What goes wrong:**
The STEP format (ISO 10303) is extremely permissive. A file can be syntactically valid
and parse without errors yet produce no geometry, inverted geometry, or geometry so
degenerate (zero-volume shells, self-intersecting faces, missing surface normals) that a
renderer produces a black frame, a corrupted mesh, or crashes silently. OpenCascade /
pythonocc-core / cadquery all handle these edge cases differently. A file from SolidWorks
may behave correctly in SolidWorks export but trigger assertion failures in a headless
OCC kernel.

**Why it happens:**
CAD vendors implement subsets of the 3400+ STEP entity types inconsistently.
Assembly STEP files (AP214, AP242) contain references between entities; a missing
referenced entity does not always raise a parse error — the kernel silently returns an
empty shape. Many real-world STEP files in industrial databases were exported years ago
from now-unsupported software versions.

**Warning signs:**
- Rendered image is all-black or all-white
- Bounding box of loaded shape reports zero volume
- Processing time is unusually fast (< 100ms for a large file) — geometry was empty
- Error log shows no error but image has no content

**Prevention strategy:**
After STEP load, always validate: bounding box volume > epsilon, face count > 0,
surface area > epsilon. Reject files that fail geometry validation immediately and store
the rejection reason alongside the file record. Never silently discard and proceed to
embedding — an empty render produces a valid embedding vector that will match other
empty renders and corrupt search results.

**Phase:** STEP ingestion pipeline (backend, Phase 1 / Upload + Processing)

---

### C2: Embedding Space Pollution from Multi-Angle View Inconsistency

**Severity:** Critical

**What goes wrong:**
To handle viewpoint dependency, the standard approach is to render a part from multiple
angles (e.g., 6 orthographic views or a sphere of viewpoints) and aggregate embeddings.
If the aggregation strategy is inconsistent between the database-side (STEP → renders →
embeddings) and the query-side (phone photo → embedding), search results become
semantically meaningless. A phone photo captures one real angle; if the DB embedding
is a mean of 20 renders, the cosine distance between query and DB embeddings has no
consistent geometric meaning.

**Why it happens:**
Teams build the ingestion pipeline first, optimizing for comprehensive coverage
(many views), then bolt on the query path later, using a single-image embedding for the
phone photo. The distance metric is never re-calibrated for this asymmetry.

**Warning signs:**
- Similarity scores for clearly matching parts are in the 0.5–0.7 range (expected > 0.85)
- Unrelated parts appear in top-3 results for simple queries
- Scores are unstable: photographing same part twice yields very different ranks

**Prevention strategy:**
Decide the embedding strategy before writing any ingestion code. Two valid choices:

Option A — Single canonical view: pick one deterministic view per part (e.g., isometric
front-right-top). Query photo is expected to approximate this view. Simple, fast, low
storage. Requires UX guidance for the photographer.

Option B — Best-of-N retrieval: store embeddings for each of N views separately.
At query time, compute distance to all N*M embeddings and take the minimum distance
per part. Slower at query time but viewpoint-robust. More storage.

Do not mix these strategies or change strategy after populating the DB without
re-embedding the entire corpus.

**Phase:** Architecture decision — must be locked before any backend implementation

---

### C3: pgvector IVFFlat Index Requiring Manual Rebuild After Bulk Loads

**Severity:** Critical

**What goes wrong:**
pgvector's IVFFlat index (the standard approximate nearest-neighbor index) is built once
and does not automatically rebalance as new vectors are inserted. If the index is created
when the database has 50 parts and then 950 more are added incrementally, the index
clusters are based on the initial 50 vectors. Search quality degrades progressively and
silently — recall drops, wrong matches surface — but no error is thrown.

**Why it happens:**
Developers create the index during initial setup, test it, and never rebuild it as the
database grows. The Postgres planner continues to use the index without signaling that
its cluster centroids are stale.

**Warning signs:**
- Search quality was good initially but degrades over time as more parts are added
- `EXPLAIN` on a similarity query shows seq_scan replacing index_scan
- Running the same query twice returns different results (non-deterministic at index boundary)

**Prevention strategy:**
- Create the IVFFlat index after the initial bulk load, not before.
  Rule: `lists` parameter should be approximately `sqrt(row_count)`.
- Add a post-ingestion job that checks `pg_stat_user_indexes` row counts and triggers
  `REINDEX INDEX` when the indexed row count deviates more than 20% from the total
  vector table row count.
- Consider pgvector HNSW index instead: HNSW supports incremental inserts without
  needing rebuild, at the cost of higher memory usage. For 1000–10000 parts HNSW
  is the better default.

**Phase:** Backend — database schema + vector index setup

---

### C4: STEP File Processing as a Server Resource Exhaustion Attack Surface

**Severity:** Critical

**What goes wrong:**
STEP files can be arbitrarily large (assembly files referencing thousands of sub-parts),
deeply nested (circular references in assembly trees), or crafted to trigger quadratic
parsing behavior in OCC geometry kernels. Without size limits and timeouts, a single
malicious or simply oversized upload can exhaust server RAM, peg a CPU core for minutes,
or crash the processing worker — blocking all other ingestion jobs.

**Why it happens:**
Developers focus on the happy path (normal-sized STEP files from their own CAD tools)
and add no resource guardrails. File processing is often a long-running child process
with no timeout enforced from the parent.

**Warning signs:**
- A single upload causes the processing worker to become unresponsive
- Server RAM spikes to limits during processing of assembly files
- Processing queue backs up and never clears after one "bad" file enters it

**Prevention strategy:**
- Hard upload size limit enforced at the API layer (recommend 100 MB; typical
  machined-part STEP files are < 5 MB; assemblies can be 50–200 MB).
- Processing worker runs in a sandboxed child process with a wall-clock timeout
  (suggest 120s). Parent kills and marks job FAILED if timeout exceeded.
- Rate-limit uploads per user/IP (not just for security: prevents accidental flood).
- Store file size and processing duration in the jobs table — alert on outliers.

**Phase:** Backend — file upload API + async processing worker setup

---

## High Pitfalls

### H1: Scale Sensitivity Breaking Shape Similarity

**Severity:** High

**What goes wrong:**
A bolt photographed from 20 cm looks almost identical to the same bolt photographed
from 5 cm in the embedding space. But a similar bolt that is twice as long will also
look similar. CLIP-style vision embeddings are largely scale-invariant at the image level,
meaning a small screw and a large shaft can produce high cosine similarity if their
silhouette shapes are similar. For parts that differ only in scale (M4 vs M6 bolts,
150mm vs 300mm shafts), the search will fail to distinguish them.

**Why it happens:**
The out-of-scope decision to not do exact dimensional matching is correct for MVP,
but teams don't communicate clearly enough that embedding similarity cannot substitute
for dimensional search. Users expect "similar" to mean "could replace this part";
embedding similarity means "looks like this part."

**Warning signs:**
- Engineers report that completely wrong-size parts appear in results
- Top matches are geometrically similar shapes but with obviously different proportions

**Prevention strategy:**
- Clearly communicate in the UI: "Results are sorted by visual shape similarity, not
  by exact dimensions." Show this on the results page.
- In a later phase, store bounding-box dimensions (X/Y/Z extents) from the STEP
  geometry and offer a dimension filter as a post-search filter (not a replacement for
  the vector search).
- Do not oversell the system as a replacement for dimensional lookup.

**Phase:** UX design (early) + metadata schema (backend Phase 1)

---

### H2: Async Processing Queue Provides No User Feedback

**Severity:** High

**What goes wrong:**
STEP processing is asynchronous (correct architectural decision). But if the upload UI
just shows "Upload successful" and gives no visibility into whether processing has
completed, failed, or is queued, engineers will not know when a part is actually
searchable. They may search immediately after upload, find nothing, conclude the system
is broken, and stop using it.

**Why it happens:**
Teams implement the async worker correctly but skip the status-polling UI because it
feels like a "nice to have." It is not — it is a trust signal essential for adoption.

**Warning signs:**
- User uploads a file and immediately tries to search for it; no results appear
- No way to tell from the UI whether a file is "processing," "failed," or "searchable"

**Prevention strategy:**
- Every uploaded file record must have a `status` column:
  `pending | processing | ready | failed`.
- The upload list UI polls this status (simple interval polling or Supabase Realtime
  subscription) and shows a clear indicator: spinner, checkmark, or error.
- On failure, show the human-readable rejection reason stored during validation.

**Phase:** Backend schema + Frontend — upload management UI

---

### H3: Mobile Camera Lighting Catastrophically Degrading Match Quality

**Severity:** High

**What goes wrong:**
Metal parts under workshop lighting (sodium vapor, LED strips, mixed color temperature)
produce images with strong specular highlights, deep shadows, and color casts that are
absent in the clean white-background renders in the DB. The embedding distance between
a real photo of Part A and the clean render of Part A can be larger than the distance
between the real photo and a clean render of Part B that happens to have a similar silhouette.

**Why it happens:**
The domain gap between rendered images (clean, controlled background, known lighting)
and real photos (cluttered, reflective, variable) is the central unsolved challenge in
instance retrieval for industrial parts. CLIP mitigates this partially because it was
trained on diverse real images, but metallic industrial parts are underrepresented in CLIP's
training data compared to everyday objects.

**Warning signs:**
- System works well in demo conditions (good lighting, white paper background) but
  fails for engineers using it in the workshop
- Match quality varies wildly between users but consistently for the same user
  (indicating environment, not part, is the variable)

**Prevention strategy:**
- Provide explicit in-app guidance during photo capture: "Place part on flat surface,
  avoid direct overhead light, fill the frame." Use visual overlays (corner guides).
- Consider background removal preprocessing on the query image before embedding.
  rembg (Python, U2Net) runs in < 1s and removes cluttered backgrounds.
- Test the prototype with actual workshop photos of real metal parts before
  committing to the embedding model. Do not evaluate only with studio photos.

**Phase:** Research spike before embedding model decision; UX guidelines during
  camera feature implementation

---

### H4: Single-Phase Embedding Without Preprocessing Kills CLIP Performance on CAD

**Severity:** High

**What goes wrong:**
Raw STEP renders on grey or transparent backgrounds fed directly to CLIP produce
worse embeddings than the same renders with a white background, centered bounding
box crop, and consistent resolution. CLIP was trained on natural images, and the
preprocessing assumptions (mean/std normalization, 224x224 crop from 256x256) were
calibrated for that distribution. Renders with large empty areas and off-center geometry
violate these assumptions.

**Why it happens:**
Developers render STEP to PNG with default renderer settings and pass it directly to
the CLIP vision encoder. Nobody benchmarks against a properly preprocessed pipeline.

**Warning signs:**
- Similarity scores cluster around 0.5–0.65 for all parts (low discrimination)
- Adding a simple white background to renders dramatically improves scores

**Prevention strategy:**
- Render to PNG with white background.
- After rendering, crop tightly to the bounding box of the visible geometry (with 5–10%
  padding) before running the CLIP encoder.
- Normalize to the CLIP-expected input: 224x224, RGB, with OpenAI CLIP preprocessing.
- Test preprocessing variants on a sample of 20 parts before finalizing the pipeline.

**Phase:** STEP processing pipeline — embedding extraction step

---

### H5: Next.js API Routes Are Unsuitable for Long-Running STEP Processing

**Severity:** High

**What goes wrong:**
Vercel (and most serverless platforms) enforce a hard execution timeout on API routes:
10 seconds on the Hobby plan, 60 seconds on Pro. STEP file processing (parsing +
rendering + embedding) for a complex part easily takes 30–120 seconds. If processing
runs synchronously in the API route, it will timeout. If it spawns a background process,
the serverless function exits and kills the child process.

**Why it happens:**
Teams design the processing as a synchronous API call during initial development
(where it "works" locally because there's no timeout), then discover the timeout only
when deploying.

**Warning signs:**
- Locally: processing works fine
- On Vercel: uploads complete but parts never become searchable; error logs show
  function timeout

**Prevention strategy:**
- Never run STEP processing inside the Next.js API route. The route should:
  1. Accept and store the file (Supabase Storage)
  2. Create a job record with status `pending`
  3. Enqueue a message to a job queue (Supabase Edge Function, BullMQ worker on
     a separate server, or a dedicated Python microservice)
  4. Return 202 Accepted immediately
- The processing worker runs outside the serverless function lifecycle.
- For the initial MVP with low volume, a Supabase Edge Function or a simple
  Node.js/Python worker process on a VM/Railway/Render instance is sufficient.

**Phase:** Architecture decision — must be addressed before any backend implementation

---

### H6: No Deduplication on Upload Allows Duplicate Embeddings Polluting Search

**Severity:** High

**What goes wrong:**
If the same STEP file (or two STEP files of the same part exported at different times)
is uploaded twice, both embeddings exist in the vector store. When searching, the
"duplicate" appears twice in results, wasting result slots and confusing engineers
("why are there two identical matches?"). At 1000+ parts, duplicate accumulation is
common in industrial databases where parts are re-exported over time.

**Why it happens:**
No deduplication check is implemented because it's not in the initial requirements.
Uploaders don't notice the duplication until the database is sizable.

**Warning signs:**
- Results list shows the same part appearing 2–3 times with nearly identical similarity scores
- Part count in the DB grows faster than the number of distinct parts in the catalog

**Prevention strategy:**
- Compute SHA-256 of the uploaded STEP file at upload time. Store it.
- On new upload, check for hash collision. If found, surface a warning:
  "This file appears to already be in the database (uploaded [date] as [part name]).
  Continue anyway?"
- This does not catch semantically duplicate parts with different geometry (e.g.,
  minor revision changes), but it eliminates exact file duplicates.

**Phase:** Backend — upload API implementation

---

## Moderate Pitfalls

### M1: getUserMedia Failing on Non-HTTPS or Certain Android Browsers

**Severity:** Medium

**What goes wrong:**
`navigator.mediaDevices.getUserMedia` (camera access) is only available over HTTPS.
Additionally, some Android browsers (Samsung Internet, older Chrome WebView) have
quirks: they may not expose the rear camera as the default, may not support
`facingMode: 'environment'`, or may silently fail without a DOMException.

**Prevention strategy:**
- Ensure the production deployment always serves HTTPS (Vercel handles this automatically).
- For local development testing of camera, use `localhost` (browsers treat it as secure)
  or a tunnel like ngrok.
- Implement fallback: if `getUserMedia` fails, allow file upload from camera roll instead.
- Test on at least: iPhone Safari, Chrome Android, Samsung Internet.

**Phase:** Frontend — camera capture feature

---

### M2: Similarity Threshold Miscalibration Leading to Either Empty or Overwhelming Results

**Severity:** Medium

**What goes wrong:**
The configurable similarity threshold defaults are set without empirical calibration.
A default of 0.9 (cosine similarity) might return zero results for most queries
(the domain gap between photos and renders means real-world scores are lower).
A default of 0.5 might return the entire database. Engineers see either "no results found"
or a flood of irrelevant results and conclude the system doesn't work.

**Prevention strategy:**
- Run calibration experiments before finalizing default thresholds: photograph 10–20
  known parts and measure the cosine similarity to their correct DB counterparts.
- Set the default threshold at the 25th percentile of "correct match" scores from this
  calibration — this ensures most correct matches are visible.
- Make the threshold slider prominent and give it human-readable labels:
  "Strict (fewer, more precise)" ↔ "Loose (more results, less precise)".
- Store per-search analytics (how many results returned, which threshold was used) to
  improve defaults over time.

**Phase:** Backend + Frontend — search feature

---

### M3: Large Image Storage Costs from Naive Multi-View Rendering

**Severity:** Medium

**What goes wrong:**
If the system stores 12–20 rendered views per STEP file at full resolution
(e.g., 1024x1024 PNG), storage for 1000 parts reaches 12–20 GB of rendered images
alone, before the original STEP files are counted. Supabase Storage has costs;
image serving to clients at full resolution is slow.

**Prevention strategy:**
- Use JPEG (quality 85) instead of PNG for rendered views — typical 5–10x size reduction
  with minimal visual quality loss for the embedding use case.
- Render at 512x512 or 256x256 — CLIP only processes 224x224 anyway; the extra
  resolution is wasted.
- Store one representative "display thumbnail" per part (larger, higher quality) and
  separate smaller "embedding input" renders. Use the thumbnail only for UI display;
  the small renders feed the embedding pipeline and can be deleted after embedding.
- If storage becomes a concern, store only the thumbnail for display; re-render on
  demand is expensive but avoids permanent storage of all views.

**Phase:** Backend — STEP processing pipeline + storage design

---

### M4: Embedding Model Version Lock-In

**Severity:** Medium

**What goes wrong:**
If the embedding model (e.g., CLIP ViT-B/32) is upgraded or swapped, all existing
embeddings in the DB are incompatible with new embeddings. Mixing embeddings from
different model versions in the same vector table makes cosine similarity meaningless.
There is no in-place migration path — the entire corpus must be re-embedded.

**Prevention strategy:**
- Store the model name and version alongside every embedding record
  (e.g., `embedding_model: "clip-vit-b-32"`, `embedding_version: "openai-20231201"`).
- Design the schema with re-embedding in mind: the original STEP file and rendered
  images must be retained so re-embedding doesn't require re-upload from the user.
- Keep the STEP files in Supabase Storage permanently. Never delete them after embedding.
- When changing models, create a new embedding column or table rather than overwriting.

**Phase:** Backend — schema design (early, must be done before any data is populated)

---

### M5: "Find Similar" UX Antipatterns Destroying Perceived Quality

**Severity:** Medium

**What goes wrong:**
Similarity search has different user mental models than keyword search. Common UX mistakes:

a) Showing a raw cosine score like "0.847" — engineers don't know what this means.

b) No explanation of why a match was returned — engineers distrust results they can't
   verify ("why is this a match?").

c) Showing all results above the threshold with no ranking differentiation — if 50 parts
   clear the threshold, the list is overwhelming and unranked.

d) No "no results" guidance — if threshold is too strict and no results appear,
   users don't know whether to try again or whether the part doesn't exist.

**Prevention strategy:**
- Show similarity as a human-readable percentage or star rating, not a raw decimal.
- Always show the matching rendered view next to the result (so engineers can visually
  verify the geometric match).
- Cap displayed results at 5–10 by default; paginate or offer "show more".
- On zero results: don't show an empty state. Show the top-3 results regardless of
  threshold with a message: "No results met the similarity threshold. These are the
  closest matches found."
- For the query image, show a thumbnail of the uploaded photo alongside results so
  engineers can evaluate the match visually.

**Phase:** Frontend — search results UI

---

### M6: Supabase Storage Multipart Upload Limits Blocking Large STEP Files

**Severity:** Medium

**What goes wrong:**
Supabase Storage has a default upload size limit (50 MB on the free tier, configurable on
paid tiers). Large assembly STEP files frequently exceed this. The client-side upload
will fail with an opaque error if the limit is not raised and communicated.

**Prevention strategy:**
- Check and document the Supabase Storage upload limit for the chosen plan.
- Show clear file size guidance on the upload UI ("Maximum file size: X MB").
- For initial MVP targeting single-part STEP files (not assemblies), 50 MB is sufficient;
  add this constraint to the upload UI.
- If large assemblies must be supported later, implement chunked upload client-side.

**Phase:** Backend + Frontend — upload feature

---

## Minor Pitfalls

### m1: STEP Assembly vs. Part File Rendering Confusion

**Severity:** Low-Medium

**What goes wrong:**
An assembly STEP file contains multiple parts positioned in 3D space. Rendering an
assembly produces a cluttered, multi-object image that embeds poorly (the "shape" is
the combination of all parts, not any individual one). Search results for "find this part"
will not match against assembly renders correctly.

**Prevention strategy:**
- During ingestion, detect whether the STEP file is an assembly (contains PRODUCT
  entities with multiple NEXT_ASSEMBLY_USAGE_OCCURRENCE relationships) or a
  single part.
- Reject assemblies with a clear error: "This system accepts single-part STEP files.
  Please export the individual component."
- Add this to the upload UI instructions.

**Phase:** Backend — STEP validation step

---

### m2: Cold-Start Latency on Serverless Embedding Inference

**Severity:** Low-Medium

**What goes wrong:**
If embedding inference runs in a serverless function (Edge Function or AWS Lambda)
that is not kept warm, the first query after a period of inactivity incurs a cold-start
penalty. For a CLIP model loaded from scratch, this can be 5–15 seconds. Engineers
experience this as "the system is broken."

**Prevention strategy:**
- For MVP, run the embedding inference as a persistent process (not serverless).
  A small VM or container on Railway/Render keeps the model in memory.
- If serverless is required, implement a keep-warm ping every 5 minutes.
- Use an external embedding API (OpenAI embeddings, Replicate CLIP endpoint) as
  an alternative — cold starts are managed by the provider.

**Phase:** Infrastructure — embedding service deployment

---

### m3: Part Orientation Inconsistency in Renders

**Severity:** Low

**What goes wrong:**
STEP files store geometry in an arbitrary coordinate system. A bolt might be stored
vertically or horizontally depending on the CAD session orientation when exported.
Without normalizing orientation before rendering, the same bolt type uploaded from
two different sources produces renders with 90-degree orientation differences, leading
to lower cosine similarity between them than desired.

**Prevention strategy:**
- After loading STEP geometry, compute the principal axes (PCA on vertex cloud) and
  align the longest axis to a canonical direction (e.g., Z-up) before rendering.
- This is a best-effort normalization; perfectly reliable orientation normalization for
  arbitrary CAD geometry is an unsolved problem. Document the limitation.
- For MVP, this is lower priority than the critical pitfalls above.

**Phase:** Backend — STEP processing pipeline (can defer to Phase 2)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Architecture decisions | C2 (embedding asymmetry), H5 (serverless timeout) | Lock embedding strategy + worker architecture before writing code |
| DB schema design | C3 (IVFFlat stale index), H6 (no dedup), M4 (model version lock) | Schema review checkpoint with these constraints |
| STEP ingestion pipeline | C1 (empty renders), C4 (resource exhaustion), m1 (assembly detection) | Geometry validation step; worker timeouts; assembly rejection |
| Embedding extraction | H4 (preprocessing), M3 (storage costs), m3 (orientation) | Preprocessing spec agreed before implementation |
| Search API | C3 (HNSW vs IVFFlat), M2 (threshold calibration) | HNSW index from day 1; calibration run on sample data |
| Upload UI | H2 (no status feedback), M6 (storage limits), H6 (dedup warning) | Status polling required; size limit in UI copy |
| Camera capture | H3 (lighting), M1 (getUserMedia browser compat) | Photo guidance UX; fallback to file picker |
| Search results UI | M5 (similarity UX antipatterns) | Design review against antipattern list |
| Deployment | H5 (serverless timeout confirmation), m2 (cold start) | Verify worker runs outside serverless; keep-warm if needed |

---

## Sources

Note: WebSearch and Bash tools were unavailable during this research session.
Findings are synthesized from:

- ISO 10303 STEP standard documentation (training data, HIGH confidence for file format behavior)
- OpenCascade Technology documentation and known parsing edge cases (MEDIUM-HIGH confidence)
- pgvector GitHub documentation — IVFFlat/HNSW behavior (HIGH confidence, well-documented)
- Published CLIP paper and OpenAI CLIP implementation (HIGH confidence for preprocessing expectations)
- Industrial shape retrieval research literature (PartNet, ShapeNet retrieval benchmarks) (MEDIUM confidence for domain gap claims)
- Vercel serverless function timeout documentation (HIGH confidence — well-known platform constraint)
- WebRTC getUserMedia MDN documentation (HIGH confidence for browser compatibility notes)
- Production experience patterns for vector search pipelines (MEDIUM confidence — general industry knowledge)

Recommend verifying H3 (lighting / domain gap severity) and m3 (orientation normalization quality)
with a practical prototype test on real workshop photos before committing to mitigation strategy.
