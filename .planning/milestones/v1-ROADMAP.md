# Milestone v1: Core Search Experience

**Status:** ✅ SHIPPED 2026-05-09
**Phasen:** 1–10
**Gesamte Pläne:** 43
**Commits:** 240
**LOC:** ~9.800 (TypeScript/Python)
**Timeline:** 2026-05-07 → 2026-05-09 (2 Tage)

## Überblick

Vollständige Implementierung der CAD Part Recognition Web-App: Von der Datenbankinfrastruktur über den Python-Worker-Microservice bis zur mobilen Such-UI. Ingenieure können STEP-Dateien hochladen, automatisch in geometrische Embeddings umwandeln lassen und per Handy-Kamera nach ähnlichen Bauteilen suchen.

## Phasen

### Phase 1: Database Foundation

**Goal**: The database schema is locked and operational — embedding dimension, indexes, and storage buckets are set before any ingestion or search code is written
**Depends on**: Nothing (first phase)
**Plans**: 2 plans

- [x] 01-01-PLAN.md — SQL-Migrationsdatei (parts-Tabelle, pgvector, HNSW-Index, Indexes, Trigger)
- [x] 01-02-PLAN.md — Neon-Client aktivieren, S3-Client, .env.local.example, Integrations-Test

**Completed:** 2026-05-08

---

### Phase 2: Python Worker Spike

**Goal**: The Python STEP-rendering and DINOv2-embedding pipeline is validated end-to-end as a standalone Docker container before any UI or ingestion code depends on it
**Depends on**: Phase 1
**Requirements**: INGEST-03
**Plans**: 3 plans

- [x] 02-01-PLAN.md — Docker-Infrastruktur: Dockerfile (continuumio/miniconda3, OSMesa, pythonocc 7.9.3, DINOv2-Cache)
- [x] 02-02-PLAN.md — Renderer: renderer.py (STEP-Loading, Geometrievalidierung, 8-View-OSMesa-Rendering)
- [x] 02-03-PLAN.md — Embedding + Pipeline: embedder.py (DINOv2 Patch-Token Mean-Pool), process_step.py (S3→render→embed→S3→DB)

**Completed:** 2026-05-08

---

### Phase 3: Ingestion API + Queue

**Goal**: The Next.js upload API accepts STEP files, enforces deduplication, enqueues jobs to the Python worker, and tracks processing status in the database
**Depends on**: Phase 2
**Requirements**: INGEST-04
**Plans**: 6 plans

- [x] 03-01-PLAN.md — CR-01/02/03 Fixes (UUID-Validierung, Viewer-Cleanup, Patch-Mean-Pool) + pytest-Stubs
- [x] 03-02-PLAN.md — Vitest-Test-Stubs + .env.local.example / worker/.env.example
- [x] 03-03-PLAN.md — POST /api/upload/init: SHA-256-Dedup + DB-Insert + Presigned S3 URL
- [x] 03-04-PLAN.md — POST /api/upload/confirm: Worker-Enqueue via HTTP + HTTP 202
- [x] 03-05-PLAN.md — Worker-Erweiterung: celery_app.py + tasks.py + main.py (FastAPI /health + /enqueue)
- [x] 03-06-PLAN.md — Docker Compose (redis:7-alpine + worker-service) + E2E-Checkpoint

**Completed:** 2026-05-08

---

### Phase 4: Ingestion UI

**Goal**: Engineers can upload STEP files with metadata through the browser and see live processing status without refreshing
**Depends on**: Phase 3
**Requirements**: INGEST-01, INGEST-02
**Plans**: 6 plans

- [x] 04-01-PLAN.md — Migration 002_add_thumbnail_count.sql + 5 Test-Stubs
- [x] 04-02-PLAN.md — GET /api/parts/[id]/status
- [x] 04-03-PLAN.md — GET /api/parts/[id]/thumbnail (HeadObject-Race-Mitigation)
- [x] 04-04-PLAN.md — usePartStatus-Hook (variables Polling + 5-Min-Timeout)
- [x] 04-05-PLAN.md — UploadForm.tsx (Phasen-State-Machine, SHA-256 + XHR-PUT)
- [x] 04-06-PLAN.md — /upload Server Component + Homepage-Rewrite

**Completed:** 2026-05-08

---

### Phase 5: Admin Catalog

**Goal**: Administrators can manage the full parts catalog — browsing, editing metadata, removing parts, and retrying failed ingestions
**Depends on**: Phase 4
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Plans**: 5 plans

- [x] 05-01-PLAN.md — Toaster in layout.tsx mounten + 5 Test-Stubs
- [x] 05-02-PLAN.md — GET /api/parts (alle Teile, kein embedding)
- [x] 05-03-PLAN.md — PATCH + DELETE /api/parts/[id] + POST /archive + POST /retry
- [x] 05-04-PLAN.md — /admin page.tsx + CatalogTable.tsx (Tabs, Suche, Pagination, Sheet, AlertDialog)
- [x] 05-05-PLAN.md — Playwright E2E Smoke-Tests + Human-Verify-Checkpoint

**Completed:** 2026-05-09

---

### Phase 6: Search Pipeline

**Goal**: The backend can accept a photo, compute a DINOv2 embedding, query pgvector, and return ranked similarity results
**Depends on**: Phase 2
**Requirements**: SEARCH-03, SEARCH-04, SEARCH-05
**Plans**: 4 plans

- [x] 06-01-PLAN.md — Vitest-Stubs für route.test.ts (9 it.todo)
- [x] 06-02-PLAN.md — /embed-Endpunkt in worker/main.py
- [x] 06-03-PLAN.md — POST /api/search Route (multipart, S3 temp upload, Worker-Call, pgvector, Cleanup)
- [x] 06-04-PLAN.md — route.test.ts Tests implementieren + vollständige Suite grün

**Completed:** 2026-05-09

---

### Phase 7: Camera UI

**Goal**: Engineers on a mobile device can capture a part photo directly in the browser or upload an existing photo file, and submit it to the search pipeline
**Depends on**: Phase 6
**Requirements**: SEARCH-01, SEARCH-02
**Plans**: 4 plans

- [x] 07-01-PLAN.md — Vitest-Stubs (CameraCapture.test.tsx) + Playwright-Stubs
- [x] 07-02-PLAN.md — CameraCapture.tsx (vollständige State Machine) + /search page.tsx
- [x] 07-03-PLAN.md — Homepage zweiter Button + CameraCapture.test.tsx Tests aktivieren
- [x] 07-04-PLAN.md — Playwright E2E Tests aktivieren + Human-Verify-Checkpoint

**Completed:** 2026-05-09

---

### Phase 8: Results UI

**Goal**: Engineers see search results as a ranked visual grid with match percentages and can tune the threshold and result count interactively
**Depends on**: Phase 7
**Requirements**: SEARCH-03, SEARCH-04, SEARCH-05
**Plans**: 4 plans

- [x] 08-01-PLAN.md — shadcn Slider installieren + Test-Stubs + Phase-7-E2E-Fix
- [x] 08-02-PLAN.md — SearchResultCard.tsx + SearchResults.tsx (Controller + Filterlogik + Controls-Zeile)
- [x] 08-03-PLAN.md — CameraCapture.tsx erweitern (displayThreshold/displayLimit, SearchResults-Integration)
- [x] 08-04-PLAN.md — Playwright E2E-Tests aktivieren + Human-Verify-Checkpoint

**Completed:** 2026-05-09

---

### Phase 9: Part Detail

**Goal**: Engineers can access complete metadata for any search result and download the original STEP file for use in their CAD tool
**Depends on**: Phase 8
**Requirements**: DETAIL-01, DETAIL-02
**Plans**: 4 plans

- [x] 09-01-PLAN.md — Vitest-Stubs (PartDetail.test.tsx + usePartDetail.test.ts) + Playwright-Stubs + API-Verzeichnisse
- [x] 09-02-PLAN.md — GET /api/parts/[id] + GET /api/parts/[id]/thumbnails + GET /api/parts/[id]/download
- [x] 09-03-PLAN.md — usePartDetail.ts + PartDetail.tsx (vollständiges UI) + page.tsx
- [x] 09-04-PLAN.md — Playwright E2E-Tests aktivieren + Human-Verify

**Completed:** 2026-05-09

---

### Phase 10: Hardening

**Goal**: The application handles failure modes gracefully, performs reliably under realistic conditions, and delivers a polished mobile experience
**Depends on**: Phase 9
**Requirements**: (Qualitätspass über alle 15 v1 Requirements)
**Plans**: 3 plans

- [x] 10-01-PLAN.md — Worker-Fehler Alert + Retry-Button + Duplikat-Link + Netzwerkfehlertext
- [x] 10-02-PLAN.md — Mobile Touch-Targets (44px), CameraCapture-Fehlertexte, onChange-Validierung
- [x] 10-03-PLAN.md — Serverseitige Pagination (/api/parts + CatalogTable.tsx)

**Completed:** 2026-05-09

---

## Milestone Summary

### Key Decisions

| Entscheidung | Begründung | Ergebnis |
|--------------|-----------|---------|
| DINOv2 ViT-B/14 statt CLIP | Bessere Performance auf texturfreien geometrischen Bildern | ✓ Gut |
| Neon (PostgreSQL) statt Supabase | Reines Postgres, pgvector built-in, kein Vendor-Lock-in | ✓ Gut |
| AWS S3 statt Supabase Storage | Stack-Konsistenz, private Buckets, CORS-Kontrolle | ✓ Gut |
| HNSW statt IVFFlat | Kein Rebuild bei wachsendem Korpus | ✓ Gut |
| Patch-Token Mean-Pool statt CLS-Token | Bessere geometrische Ähnlichkeit | ✓ Gut — CR-03 Fix |
| Celery + Redis für Queue | STEP-Verarbeitung dauert 5–120s, HTTP-Timeout-Entkopplung | ✓ Gut |
| view_0..view_7.png Pfadkonvention | S3-Key-Konsistenz zwischen Worker und API | ✓ Gut |

### Bekannte Tech Debt

- Docker-Container für Phase 2 nie gegen echte STEP-Datei ausgeführt (E2E-Beweis fehlt)
- SEARCH-01: Kamera-Capture nur auf Desktop-Playwright getestet, nicht echtes Mobilgerät
- Admin-Katalog: kein `processing`-Tab, Pagination-Links ohne URL-Deep-Links
- WORKER_URL-Asymmetrie: Upload/Retry überspringen Worker; Search gibt 503

### Issues Resolved

- CR-01: Path-Traversal-Schutz via UUID-Regex-Validierung in process_step.py
- CR-02: OSMesa-Ressourcenleck via try/finally + viewer.Remove()
- CR-03: CLS-Token → Patch-Token Mean-Pool für bessere geometrische Ähnlichkeit
- BLOCKER-01: thumbnail_count nie in DB geschrieben (process_step.py)
- BLOCKER-02: isSafeImageUrl() erlaubte nur Supabase-URLs, nicht AWS S3

---

*Für aktuellen Projektstatus: .planning/ROADMAP.md*
