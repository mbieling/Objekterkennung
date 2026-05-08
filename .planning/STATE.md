# Project State: Bauteil-Finder (CAD Part Recognition)

**Last updated:** 2026-05-08 (03-01 abgeschlossen)
**Milestone:** v1 — Core Search Experience
**Planning status:** Phase 3 geplant — bereit zur Ausführung

---

## Project Reference

**Core Value:** Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

**Current Focus:** Phase 3 (Ingestion API + Queue) — geplant, bereit zur Ausführung

---

## Current Position

| Field | Value |
|-------|-------|
| Current Phase | 3 — Ingestion API + Queue |
| Current Plan | 03-01 abgeschlossen — 03-02 als nächstes (Wave 0) |
| Phase Status | In Progress — 1/6 Pläne done |
| Overall Progress | 2/10 phases complete (Phase 3 in progress) |

**Progress:** ██░░░░░░░░ 22%

---

## Phase Status Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database Foundation | ✓ Complete (2026-05-08) |
| 2 | Python Worker Spike | ✓ Complete (2026-05-08) |
| 3 | Ingestion API + Queue | ◷ In Progress (1/6 plans done) |
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
| Phases complete | 2/10 |
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
| CR-01 Fix (03-01) | UUID_RE-Regex als erste Operation in process() | Path-Traversal-Schutz vor S3-Key-Konstruktion — BLOCKER-Status aufgelöst |
| CR-02 Fix (03-01) | try/finally mit viewer.Viewer.Remove() in render_views() | Verhindert OSMesa-Ressourcenleck bei Batch-Betrieb |
| CR-03 Fix (03-01) | Patch-Token Mean-Pool statt CLS-Token in get_embedding() | Bessere geometrische Ähnlichkeit — CLAUDE.md Architektur-Entscheidung umgesetzt |
| IN-03 Fix (03-01) | viewer.View.Window().SetSize(512, 512) explizit | D-06-konform, nicht mehr von VTK-Default abhängig |

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

Phase 3 in Ausführung: 1/6 Pläne abgeschlossen.
- [x] Wave 0 (03-01): CR-01/CR-02/CR-03-Fixes + pytest-Tests — abgeschlossen 2026-05-08
- [ ] Wave 0 (03-02): Vitest-Test-Stubs + .env.local.example — als nächstes
- [ ] Wave 1 (03-03, 03-04): POST /api/upload/init + POST /api/upload/confirm — parallel nach Wave 0
- [ ] Wave 2 (03-05): Worker-Microservice FastAPI + Celery
- [ ] Wave 3 (03-06): Docker Compose + E2E-Checkpoint (manuell)
Nächster Schritt: `/gsd-execute-phase 3` (03-02)

---
*State initialized: 2026-05-07 after roadmap creation*
