# Roadmap: Bauteil-Finder (CAD Part Recognition)

**Milestone:** v1 — Core Search Experience
**Granularity:** Fine (10 phases)
**Coverage:** 15/15 v1 requirements mapped
**Created:** 2026-05-07

---

## Phases

- [x] **Phase 1: Database Foundation** — Schema, pgvector, HNSW index, Storage buckets locked before any code is written *(completed 2026-05-08)*
- [x] **Phase 2: Python Worker Spike** — STEP rendering + DINOv2 embedding pipeline validated as standalone Docker service *(completed 2026-05-08)*
- [x] **Phase 3: Ingestion API + Queue** — Upload endpoint, job dispatch, SHA-256 deduplication, status tracking in place *(completed 2026-05-08)*
- [x] **Phase 4: Ingestion UI** — Upload form, real-time status polling, thumbnail display wired to the ingestion API *(completed 2026-05-08)*
- [x] **Phase 5: Admin Catalog** — Parts list with status and thumbnails, metadata edit, archive/delete, retry failed *(completed 2026-05-09)*
- [x] **Phase 6: Search Pipeline** — Photo-to-embedding, pgvector cosine query, ranked results returned by API *(completed 2026-05-09)*
- [ ] **Phase 7: Camera UI** — Mobile camera capture and file upload fallback wired to search pipeline
- [ ] **Phase 8: Results UI** — Ranked results grid with match percentage, configurable threshold and result count
- [ ] **Phase 9: Part Detail** — Full metadata view and STEP file download
- [ ] **Phase 10: Hardening** — Error handling, edge cases, mobile polish, performance validation

---

## Phase Details

### Phase 1: Database Foundation
**Goal**: The database schema is locked and operational — embedding dimension, indexes, and storage buckets are set before any ingestion or search code is written
**Depends on**: Nothing (first phase)
**Requirements**: (none — infrastructure enabler; all 15 v1 requirements depend on this foundation)
**Success Criteria** (what must be TRUE):
  1. Supabase database has `parts` table with `embedding vector(768)` column and HNSW index active
  2. pgvector extension is enabled and a test cosine similarity query executes without error
  3. Supabase Storage buckets for STEP files and thumbnails exist with correct RLS policies
  4. Schema includes `embedding_model` and `embedding_version` columns for future re-embedding
**Plans**: 2 plans

**Wave 1**
- [x] 01-01-PLAN.md — SQL-Migrationsdatei (parts-Tabelle, pgvector, HNSW-Index, Indexes, Trigger)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — Neon-Client aktivieren, S3-Client, .env.local.example, Integrations-Test, Nutzer-Checkpoint

**Cross-cutting constraints:**
- `SUPABASE_SERVICE_ROLE_KEY` darf niemals im Client-Bundle landen (kein `NEXT_PUBLIC_` Prefix)
- RLS ist bewusst deaktiviert (D-06); jede Datei, die die Tabelle berührt, muss diesen Kommentar respektieren

---

### Phase 2: Python Worker Spike
**Goal**: The Python STEP-rendering and DINOv2-embedding pipeline is validated end-to-end as a standalone Docker container before any UI or ingestion code depends on it
**Depends on**: Phase 1
**Requirements**: INGEST-03
**Success Criteria** (what must be TRUE):
  1. A sample STEP file fed into the Docker container produces 6–8 rendered orthographic PNG thumbnails
  2. DINOv2 ViT-B/14 produces a 768-dimensional embedding (mean-pooled from all views) for that STEP file
  3. The embedding is written to Neon and a pgvector cosine similarity query returns it correctly
  4. Empty or malformed STEP files are rejected with a clear error (bounding-box and face-count validation active)
  5. FastAPI health endpoint + Celery queue deferred to Phase 3 (per D-10)
**Plans**: 3 plans

**Wave 1**
- [x] 02-01-PLAN.md — Docker-Infrastruktur: Dockerfile (continuumio/miniconda3, OSMesa, pythonocc 7.9.3, DINOv2-Cache), .env.example, testdata/sample.step *(completed 2026-05-08)*

**Wave 2** *(blocked on Wave 1: Docker-Build muss erfolgreich sein)*
- [x] 02-02-PLAN.md — Renderer: renderer.py (STEP-Loading, Geometrievalidierung, 8-View-OSMesa-Rendering), test_renderer.py (isolierter Smoketest) *(completed 2026-05-08)*

**Wave 3** *(blocked on Wave 2: RENDERER_OK muss bestätigt sein)*
- [x] 02-03-PLAN.md — Embedding + Pipeline: embedder.py (DINOv2 CLS-Token, mean_pool), process_step.py (vollständige S3→render→embed→S3→DB-Pipeline) *(completed 2026-05-08)*

**Cross-cutting constraints:**
- `VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow` muss in jedem Python-Skript vor allen OCC-Imports stehen
- Keine Secrets im Dockerfile — nur via `--env-file worker/.env` zur Laufzeit übergeben
- `worker/.env` in `.gitignore`; nur `worker/.env.example` committen

---

### Phase 3: Ingestion API + Queue
**Goal**: The Next.js upload API accepts STEP files, enforces deduplication, enqueues jobs to the Python worker, and tracks processing status in the database
**Depends on**: Phase 2
**Requirements**: INGEST-04
**Success Criteria** (what must be TRUE):
  1. Uploading the same STEP file twice results in a duplicate rejection with the existing part's ID returned (SHA-256 check)
  2. A valid STEP upload immediately stores the file in Supabase Storage and inserts a `parts` row with status `pending`
  3. The API responds with HTTP 202 within 2 seconds regardless of file size (up to 100 MB)
  4. The Python worker picks up the queued job and updates part status to `processing`, then `ready` or `failed`
**Plans**: 6 plans

**Wave 0** *(Blocker-Fixes und Test-Stubs — vor Wave 1 abschließen)*
- [x] 03-01-PLAN.md — CR-01 Fix (UUID-Validierung in process_step.py) + CR-02 Fix (Viewer3d-Cleanup in renderer.py) + pytest-Stubs *(completed 2026-05-08)*
- [x] 03-02-PLAN.md — Vitest-Test-Stubs (init.test.ts + confirm.test.ts) + .env.local.example + worker/.env.example aktualisieren *(completed 2026-05-08)*

**Wave 1** *(parallel ausführbar, blocked on Wave 0)*
- [x] 03-03-PLAN.md — POST /api/upload/init: SHA-256-Dedup + DB-Insert + Presigned S3 URL *(completed 2026-05-08)*
- [x] 03-04-PLAN.md — POST /api/upload/confirm: Worker-Enqueue via HTTP + HTTP 202 *(completed 2026-05-08)*

**Wave 2** *(blocked on Wave 1: API-Design muss stabil sein)*
- [x] 03-05-PLAN.md — Worker-Erweiterung: celery_app.py + tasks.py + main.py (FastAPI /health + /enqueue) + requirements.txt *(completed 2026-05-08)*

**Wave 3** *(blocked on Wave 2: Worker-Module müssen existieren)*
- [x] 03-06-PLAN.md — Docker Compose (redis:7-alpine + worker-service) + worker/.dockerignore + E2E-Checkpoint *(completed 2026-05-08, human-verify approved)*

**Cross-cutting constraints:**
- `WORKER_URL` und alle AWS_*-Vars sind server-only ohne `NEXT_PUBLIC_`-Prefix
- `VTK_DEFAULT_OPENGL_WINDOW` muss erste Zeile in tasks.py sein (transitiver OCC-Import)
- `worker/.env` in `.gitignore` — nur `worker/.env.example` committen

---

### Phase 4: Ingestion UI
**Goal**: Engineers can upload STEP files with metadata through the browser and see live processing status without refreshing
**Depends on**: Phase 3
**Requirements**: INGEST-01, INGEST-02
**Success Criteria** (what must be TRUE):
  1. User can select a STEP file (up to 100 MB), fill in name, part number, project, and status, and submit the form
  2. After upload, the UI shows a status indicator that updates in real time: pending → processing → ready (or failed)
  3. When processing completes, at least one thumbnail of the part is visible in the UI without a page reload
  4. Duplicate upload attempt shows an inline error message identifying the existing part
**Plans**: 6 plans
**UI hint**: yes

**Wave 0** *(Migration + Test-Stubs — vor Wave 1 abschließen)*
- [x] 04-01-PLAN.md — Migration 002_add_thumbnail_count.sql + supabase db push [BLOCKING] + 5 Test-Stubs (Vitest + Playwright) *(completed 2026-05-08)*

**Wave 1** *(parallel ausführbar, blocked on Wave 0)*
- [x] 04-02-PLAN.md — GET /api/parts/[id]/status (D-05) + 3 Tests aktivieren *(completed 2026-05-08)*
- [x] 04-03-PLAN.md — GET /api/parts/[id]/thumbnail (D-08, HeadObject-Race-Mitigation) + 5 Tests aktivieren *(completed 2026-05-08)*

**Wave 2** *(blocked on Wave 1)*
- [x] 04-04-PLAN.md — usePartStatus-Hook (D-04, D-06, variables Polling + 5-Min-Timeout) + 8 Tests aktivieren *(completed 2026-05-08)*

**Wave 3** *(blocked on Wave 2 — UploadForm konsumiert usePartStatus-Hook)*
- [x] 04-05-PLAN.md — UploadForm.tsx (Phasen-State-Machine, SHA-256 + XHR-PUT, Duplikat-Inline-Alert) + 6 Tests aktivieren *(completed 2026-05-08)*

**Wave 4** *(blocked on Wave 3)*
- [x] 04-06-PLAN.md — /upload Server Component + Homepage-Rewrite (D-01, D-02) + Human-Verify-Checkpoint gegen Roadmap-SC *(completed 2026-05-08)*

**Cross-cutting constraints:**
- Alle neuen API-Routes verwenden `z.string().uuid()` für `params.id`-Validierung (security_enforcement)
- Keine Server-Secrets im Client-Bundle (`NEXT_PUBLIC_`-frei in allen neuen Dateien)
- shadcn/ui exklusiv — keine custom UI-Primitiven (Button, Input, Form, Badge, etc.)
- Tagged-template-SQL via `db` aus `@/lib/db` (nicht `sql`)
- Browser darf KEINEN Content-Type-Header beim S3-PUT setzen (Pitfall 4)

---

### Phase 5: Admin Catalog
**Goal**: Administrators can manage the full parts catalog — browsing, editing metadata, removing parts, and retrying failed ingestions
**Depends on**: Phase 4
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. Admin can see a paginated list of all uploaded parts with their current status and a thumbnail for each ready part
  2. Admin can click any part and edit its name, part number, project, and status fields, with changes persisted on save
  3. Admin can archive or delete a part; archived parts no longer appear in search results
  4. Admin can trigger a retry for any part in `failed` status, which re-enqueues the job and resets the status to `pending`
**Plans**: 5 plans

**Wave 0** *(Toaster-Fix + Test-Stubs — vor Wave 1 abschließen)*
- [x] 05-01-PLAN.md — Toaster in layout.tsx mounten + 5 Vitest/Playwright-Test-Stubs *(completed 2026-05-09)*

**Wave 1** *(parallel ausführbar, blocked on Wave 0)*
- [x] 05-02-PLAN.md — GET /api/parts (alle Teile, kein embedding) *(completed 2026-05-09)*
- [x] 05-03-PLAN.md — PATCH + DELETE /api/parts/[id] + POST /archive + POST /retry *(completed 2026-05-09)*

**Wave 2** *(blocked on Wave 1: API-Design muss stabil sein)*
- [x] 05-04-PLAN.md — /admin page.tsx + CatalogTable.tsx (Tabs, Suche, Pagination, Sheet, AlertDialog) *(completed 2026-05-09)*

**Wave 3** *(blocked on Wave 2: UI muss vorhanden sein)*
- [x] 05-05-PLAN.md — Playwright E2E Smoke-Tests + Human-Verify-Checkpoint *(completed 2026-05-09, human-verify approved)*

**UI hint**: yes

**Downstream-Constraint für Phase 6:** Phase 6 MUSS `WHERE status = 'ready'` als Filter verwenden. Das `is_archived`-Boolean-Feld wird in Phase 5 NICHT beschrieben — Phase 6 darf NICHT `WHERE is_archived = false` nutzen.

---

### Phase 6: Search Pipeline
**Goal**: The backend can accept a photo, compute a DINOv2 embedding, query pgvector, and return ranked similarity results — all within a response time suitable for interactive use
**Depends on**: Phase 2
**Requirements**: SEARCH-03, SEARCH-04, SEARCH-05
**Success Criteria** (what must be TRUE):
  1. POST to the search API with a JPEG photo returns a ranked list of parts with cosine similarity scores
  2. Results below the configurable similarity threshold are excluded from the response
  3. The number of returned results respects the configurable limit parameter
  4. A search against a corpus of 100+ indexed parts completes in under 5 seconds end-to-end
**Plans**: 4 plans

**Wave 0** *(Vitest-Stubs — vor Wave 1 abschließen)*
- [x] 06-01-PLAN.md — Vitest-Stubs für route.test.ts (9 it.todo, alle SEARCH-03/04/05) *(completed 2026-05-09)*

**Wave 1** *(parallel ausführbar, blocked on Wave 0)*
- [x] 06-02-PLAN.md — /embed-Endpunkt in worker/main.py (sync FastAPI, S3-Download, get_embedding()) *(completed 2026-05-09)*

**Wave 2** *(blocked on Wave 1)*
- [x] 06-03-PLAN.md — POST /api/search Route (multipart, S3 temp upload, Worker-Call, pgvector, Cleanup) *(completed 2026-05-09)*

**Wave 3** *(blocked on Wave 2)*
- [x] 06-04-PLAN.md — route.test.ts Tests implementieren + vollständige Suite grün *(completed 2026-05-09)*

**Cross-cutting constraints:**
- embeddingLiteral als String mit ::vector-Cast (Neon Pitfall — kein number[]-Parameter)
- Threshold-Filter mit vollem Ausdruck im WHERE (kein similarity-Alias)
- S3 Cleanup (DeleteObjectCommand) auf ALLEN Fehler-Pfaden
- WHERE status = 'ready' — kein is_archived (Phase-5-Downstream-Constraint)
- WORKER_URL ist server-only (kein NEXT_PUBLIC_)

---

### Phase 7: Camera UI
**Goal**: Engineers on a mobile device can capture a part photo directly in the browser or upload an existing photo file, and submit it to the search pipeline
**Depends on**: Phase 6
**Requirements**: SEARCH-01, SEARCH-02
**Success Criteria** (what must be TRUE):
  1. On a mobile browser, tapping the camera button activates the rear-facing camera via `getUserMedia` and captures a photo
  2. User can alternatively select an existing image file from their device as a search input
  3. Both capture methods deliver the photo to the search API and trigger a search without requiring a native app install
  4. The UI provides visible guidance (framing overlay or instructions) to help the user photograph the part correctly
**Plans**: TBD
**UI hint**: yes

---

### Phase 8: Results UI
**Goal**: Engineers see search results as a ranked visual grid with match percentages and can tune the threshold and result count interactively
**Depends on**: Phase 7
**Requirements**: SEARCH-03, SEARCH-04, SEARCH-05
**Success Criteria** (what must be TRUE):
  1. After a search, results appear as a grid of cards showing thumbnail, part name, part number, and a color-coded match percentage
  2. User can adjust the similarity threshold via a slider or input; the results list updates to reflect the new threshold
  3. User can change the maximum number of results shown; the list updates accordingly
  4. Results are ordered highest-to-lowest similarity score with the best match shown first
**Plans**: TBD
**UI hint**: yes

---

### Phase 9: Part Detail
**Goal**: Engineers can access complete metadata for any search result and download the original STEP file for use in their CAD tool
**Depends on**: Phase 8
**Requirements**: DETAIL-01, DETAIL-02
**Success Criteria** (what must be TRUE):
  1. Clicking any result opens a detail view showing all metadata: name, part number, project, status, and upload date
  2. The detail view displays all generated thumbnails (all 6–8 orthographic views)
  3. A download button delivers the original STEP file to the user's device with the correct filename and MIME type
**Plans**: TBD
**UI hint**: yes

---

### Phase 10: Hardening
**Goal**: The application handles failure modes gracefully, performs reliably under realistic conditions, and delivers a polished mobile experience
**Depends on**: Phase 9
**Requirements**: (none — quality pass over all 15 v1 requirements)
**Success Criteria** (what must be TRUE):
  1. A STEP file that fails worker processing shows a clear, actionable error in the UI — not a silent failure or generic message
  2. The camera search flow is fully usable on a mid-range Android phone in a workshop lighting environment
  3. Uploading a STEP file larger than 100 MB is rejected at the form level with an informative message before any network request
  4. The parts catalog remains responsive (under 2s load) with 1,000+ parts indexed
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 2/2 | Complete | 2026-05-08 |
| 2. Python Worker Spike | 3/3 | Complete (alle Pläne done) | 2026-05-08 |
| 3. Ingestion API + Queue | 6/6 | Complete | 2026-05-08 |
| 4. Ingestion UI | 6/6 | Complete | 2026-05-08 |
| 5. Admin Catalog | 5/5 | Complete | 2026-05-09 |
| 6. Search Pipeline | 0/4 | In progress | - |
| 7. Camera UI | 0/? | Not started | - |
| 8. Results UI | 0/? | Not started | - |
| 9. Part Detail | 0/? | Not started | - |
| 10. Hardening | 0/? | Not started | - |

---

## Coverage Validation

| Requirement | Phase | Notes |
|-------------|-------|-------|
| INGEST-01 | Phase 4 | Upload form with metadata |
| INGEST-02 | Phase 4 | Status polling UI |
| INGEST-03 | Phase 2 | Thumbnail generation in worker spike |
| INGEST-04 | Phase 3 | SHA-256 deduplication in API |
| ADMIN-01 | Phase 5 | Catalog list with status + thumbnail |
| ADMIN-02 | Phase 5 | Metadata edit |
| ADMIN-03 | Phase 5 | Archive / delete |
| ADMIN-04 | Phase 5 | Retry failed |
| SEARCH-01 | Phase 7 | Mobile camera capture |
| SEARCH-02 | Phase 7 | File upload fallback |
| SEARCH-03 | Phase 8 | Ranked results with match % |
| SEARCH-04 | Phase 8 | Configurable threshold |
| SEARCH-05 | Phase 8 | Configurable result count |
| DETAIL-01 | Phase 9 | Full metadata view |
| DETAIL-02 | Phase 9 | STEP file download |

**Total v1 requirements:** 15
**Mapped:** 15
**Orphaned:** 0
**Coverage:** 100% ✓

---
*Roadmap created: 2026-05-07*
*Phase 2 plans created: 2026-05-08*
*Phase 3 plans created: 2026-05-08*
