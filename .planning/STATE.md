# Project State: Bauteil-Finder (CAD Part Recognition)

**Last updated:** 2026-05-08
**Milestone:** v1 — Core Search Experience

---

## Project Reference

**Core Value:** Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

**Current Focus:** Phase 2 planned — ready to execute

---

## Current Position

| Field | Value |
|-------|-------|
| Current Phase | 2 — Python Worker Spike |
| Current Plan | 03 (02-01, 02-02 complete) |
| Phase Status | Phase 2 in progress — Plan 2/3 complete |
| Overall Progress | 1/10 phases complete |

**Progress:** █░░░░░░░░░ 10%

---

## Phase Status Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database Foundation | ✓ Complete (2026-05-08) |
| 2 | Python Worker Spike | Ready to execute (3 plans) |
| 3 | Ingestion API + Queue | Not started |
| 4 | Ingestion UI | Not started |
| 5 | Admin Catalog | Not started |
| 6 | Search Pipeline | Not started |
| 7 | Camera UI | Not started |
| 8 | Results UI | Not started |
| 9 | Part Detail | Not started |
| 10 | Hardening | Not started |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 1/10 |
| Plans complete | 4/? (incl. Phase 2 Plans 1+2) |
| Requirements covered | 15/15 |
| v1 requirements done | 0/15 |

---

## Accumulated Context

### Architectural Decisions (Locked)

| Decision | Value | Rationale |
|----------|-------|-----------|
| Embedding model | DINOv2 ViT-B/14 | Outperforms CLIP on texture-free geometric images |
| Embedding dimension | 768 | Fixed in `vector(768)` column — cannot change after corpus is populated |
| Vector index | HNSW (never IVFFlat) | No rebuild needed as corpus grows; IVFFlat degrades silently |
| Embedding strategy | Mean-pool 6–8 orthographic views for DB; single image for query | Asymmetry must be accepted and threshold-calibrated |
| STEP processing location | External Docker container (Railway/Fly.io) | Cannot run in Next.js/Vercel serverless; model ~600 MB |
| Queue mechanism | Celery + Redis | STEP processing takes 5–120s; must be decoupled from HTTP lifecycle |
| Deduplication | SHA-256 on file content | Prevents redundant processing before any work starts |
| Database | Neon (PostgreSQL + pgvector) | Replaces Supabase; pure Postgres, pgvector built-in, no vendor lock-in |
| Storage | AWS S3 (2 buckets) | Replaces Supabase Storage; `parts-steps` + `parts-thumbnails`, both private |
| PNG-Pfadkonvention | view_0..view_7.png (nicht view_{name}.png) | S3-Key-Format für process_step.py: `{part_id}/view_{i}.png` |
| V3d_XnegYposZneg für iso_rear | Beibehalten — empirisch zu bestätigen | Open Question A3 aus RESEARCH.md; Fallback bei schwarzem Bild |

### Key Risks to Watch

- pythonOCC VTK offscreen rendering on Mesa GL in Docker (validate in Phase 2 spike)
- Cosine similarity scores for real workshop photos vs. clean renders may be 0.55–0.75, not 0.85+ (calibrate in Phase 8)
- DINOv2 CPU inference speed on Railway smallest instance (measure in Phase 2)

### Known Constraints

- Max STEP file size: 100 MB
- Target corpus scale: 1,000+ parts
- Mobile camera workflow must run in browser (WebRTC / getUserMedia) — no native app
- Tech stack locked: Next.js + TypeScript + Supabase

---

## Session Continuity

### How to Resume After Context Loss

1. Read `.planning/STATE.md` (this file) for current position
2. Read `.planning/ROADMAP.md` for phase structure and success criteria
3. Read `.planning/REQUIREMENTS.md` for requirement status
4. Check current phase plan file (`.planning/phases/phaseN/PLAN.md`) if one exists
5. Run `git log --oneline -10` to see recent work

### Next Action

Phase 2 Plan 02 abgeschlossen: renderer.py (load_step, validate_geometry, render_views, VIEWS) und test_renderer.py (OSMesa-Smoketest mit 3 Subtests).
Nächster Schritt: Plan 02-03 ausführen — embedder.py (DINOv2 CLS-Token, mean_pool) + process_step.py (vollständige S3→render→embed→S3→DB-Pipeline).
Hinweis: Docker-Verifikation (docker run --rm bauteil-worker python test_renderer.py) muss vor Plan 03 manuell bestätigt werden.

---
*State initialized: 2026-05-07 after roadmap creation*
