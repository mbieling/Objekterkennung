# Milestones: Bauteil-Finder (CAD Part Recognition)

## v1 — Core Search Experience

**Shipped:** 2026-05-09
**Phases:** 1–10 (10 phases)
**Plans:** 43
**Commits:** 240
**LOC:** ~9.800 (TypeScript/Python)
**Timeline:** 2026-05-07 → 2026-05-09 (2 Tage)

### Delivered

Vollständige CAD Part Recognition Web-App: Ingenieure können STEP-Dateien hochladen, automatisch in geometrische DINOv2-Embeddings umwandeln lassen und per Handy-Kamera nach ähnlichen Bauteilen suchen — mit Admin-Katalog, konfigurierbarem Threshold-Slider und Bauteil-Detailseite inkl. STEP-Download.

### Key Accomplishments

1. PostgreSQL-Datenbank mit pgvector HNSW-Index (Neon) + AWS S3-Storage (2 private Buckets)
2. DINOv2 ViT-B/14 Embedding-Pipeline: STEP → OSMesa-Rendering (8 Views) → 768-dim Mean-Pool (Docker)
3. Upload-API mit SHA-256-Deduplizierung, Celery+Redis-Queue, FastAPI-Worker-Service (13 API-Routes)
4. Upload-UI: 5-stufige State Machine mit Echtzeit-Status-Polling und Thumbnail-Vorschau
5. Admin-Katalog: Tabs, Suche, serverseitige Pagination, Edit-Sheet, Archive/Delete/Retry
6. Such-Pipeline: DINOv2-Foto-Embedding + pgvector-Cosine-Query in < 5 Sekunden
7. Mobile Kamera-Capture (getUserMedia) + File-Upload-Fallback im Browser
8. Ergebnis-Raster: Thumbnail + Match-% + Teilenummer, Threshold-Slider, Limit-Select
9. Part Detail: Metadaten, Thumbnail-Galerie (8 Views), STEP-Datei-Download (Presigned URL)
10. Hardening: Fehlerbehandlung, Touch-Targets (44px), serverseitige Pagination, Audit-Bugfixes

### Known Gaps (Tech Debt)

- Docker-Worker nie E2E gegen echte STEP-Datei ausgeführt
- SEARCH-01: Kamera-Capture nur Desktop-Playwright-getestet, nicht echtes Mobilgerät
- Admin-Katalog: kein `processing`-Tab; Pagination ohne URL-Deep-Links
- WORKER_URL-Asymmetrie: Upload/Retry überspringen Worker; Search gibt 503

### Archive

- [v1-ROADMAP.md](milestones/v1-ROADMAP.md) — vollständige Phase-Details
- [v1-REQUIREMENTS.md](milestones/v1-REQUIREMENTS.md) — Requirements mit Abschluss-Status
- [v1-MILESTONE-AUDIT.md](v1-MILESTONE-AUDIT.md) — Audit-Report

---
*Nächster Milestone: /gsd-new-milestone*
