# Project State: Bauteil-Finder (CAD Part Recognition)

**Last updated:** 2026-05-07
**Milestone:** v1 — Core Search Experience

---

## Project Reference

**Core Value:** Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

**Current Focus:** Roadmap created — ready to begin Phase 1 planning

---

## Current Position

| Field | Value |
|-------|-------|
| Current Phase | — (not started) |
| Current Plan | — |
| Phase Status | Not started |
| Overall Progress | 0/10 phases complete |

**Progress:** ░░░░░░░░░░ 0%

---

## Phase Status Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database Foundation | Not started |
| 2 | Python Worker Spike | Not started |
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
| Phases complete | 0/10 |
| Plans complete | 0/? |
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

Run `/gsd-plan-phase 1` to create the execution plan for Phase 1: Database Foundation.

---
*State initialized: 2026-05-07 after roadmap creation*
