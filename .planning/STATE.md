# Project State: Bauteil-Finder (CAD Part Recognition)

**Last updated:** 2026-05-09 (Phase 8 geplant — 4 Pläne in 4 Waves, Ready to execute)
**Milestone:** v1 — Core Search Experience
**Planning status:** Phase 8 planned — Ready to execute

---

## Project Reference

**Core Value:** Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

**Current Focus:** Phase 6 (Search Pipeline) — nächste Phase

---

## Current Position

| Field | Value |
|-------|-------|
| Current Phase | 8 — Results UI |
| Current Plan | 01 (ready to execute) |
| Phase Status | Planned — 4 plans in 4 waves |
| Overall Progress | 7/10 phases complete |

**Progress:** ███████░░░ 70%

---

## Phase Status Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database Foundation | ✓ Complete (2026-05-08) |
| 2 | Python Worker Spike | ✓ Complete (2026-05-08) |
| 3 | Ingestion API + Queue | ✓ Complete (2026-05-08) |
| 4 | Ingestion UI | ✓ Complete (2026-05-08) |
| 5 | Admin Catalog | ✓ Complete (2026-05-09) |
| 6 | Search Pipeline | ✓ Complete (2026-05-09) |
| 7 | Camera UI | ✓ Complete (2026-05-09) |
| 8 | Results UI | Not started |
| 9 | Part Detail | Not started |
| 10 | Hardening | Not started |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 7/10 |
| Plans complete | 30/30 (Phase 1: 2, Phase 2: 3, Phase 3: 6, Phase 4: 6, Phase 5: 5, Phase 6: 4, Phase 7: 4) |
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

Phase 7 vollständig abgeschlossen (2026-05-09) — alle 4 Pläne done, Human-Verify approved. Nächster Schritt: Phase 8 (Results UI) starten — /gsd-plan-phase 8.

**Phase 7 — Abgeschlossen (4 Pläne in 4 Waves):**
- [x] Wave 0 (07-01): Vitest-Stubs (CameraCapture.test.tsx) + Playwright-Stubs *(completed 2026-05-09)*
- [x] Wave 1 (07-02): CameraCapture.tsx (State Machine) + /search page.tsx *(completed 2026-05-09)*
- [x] Wave 2 (07-03): Homepage D-02 zweiter Button + CameraCapture.test.tsx Tests aktiviert *(completed 2026-05-09)*
- [x] Wave 3 (07-04): Playwright E2E Tests aktiviert + Human-Verify approved *(completed 2026-05-09)*

**Phase 4 — Geplante Pläne (6 Pläne in 5 Waves):**
- [x] Wave 0 (04-01): Migration 002_add_thumbnail_count.sql + supabase db push [BLOCKING] + 5 Test-Stubs *(completed 2026-05-08)*
- [x] Wave 1 (04-02): GET /api/parts/[id]/status-Route (D-05) *(completed 2026-05-08)*
- [x] Wave 1 (04-03): GET /api/parts/[id]/thumbnail-Route (D-08, HeadObject-Race-Mitigation) *(completed 2026-05-08)*
- [x] Wave 2 (04-04): usePartStatus-Hook (D-04, D-06, variables Polling + 5-Min-Timeout) *(completed 2026-05-08)*
- [x] Wave 3 (04-05): UploadForm.tsx (State-Machine, SHA-256 + XHR-PUT, Duplikat-Alert) *(completed 2026-05-08)*
- [x] Wave 4 (04-06): /upload page + Homepage-Link + Human-Verify-Checkpoint *(completed 2026-05-08)*

**Phase 5 — Fortschritt:**
- [x] Wave 0 (05-01): Toaster-Mount + 5 Test-Stubs *(completed 2026-05-09)*
- [x] Wave 1 (05-02): GET /api/parts (ADMIN-01) *(completed 2026-05-09)*
- [x] Wave 1 (05-03): PATCH/DELETE/archive/retry Routes (ADMIN-02/03/04) *(completed 2026-05-09)*
- [x] Wave 2 (05-04): CatalogTable-Komponente (ADMIN-01/02/03/04) *(completed 2026-05-09)*
- [x] Wave 3 (05-05): E2E Smoke-Tests aktiviert (Task 1 done) — Human-Verify-Checkpoint ausstehend

**Nächster Schritt:** Human-Verify-Checkpoint für Phase 5 Success Criteria (Plan 05 Task 2).

### Entscheidung (05-01):
- Playwright `test.skip()` statt `test.todo()` verwenden — Playwright 1.58.2 hat keine `test.todo()` API; `test.skip()` mit leerer async-Funktion ist das etablierte Muster im Projekt (vgl. `tests/phase-04-upload.spec.ts`)

### Entscheidung (05-02):
- `vi.mocked(db)` statt top-level `mockDb = vi.fn()` — Vitest hostet `vi.mock()` ans Dateianfang; Variable noch nicht initialisiert → ReferenceError. Fix: Factory in `vi.mock()`, Import danach, `vi.mocked()` für typisierten Zugriff.

### Entscheidung (05-03):
- Constructor-kompatibles Mock für AWS SDK Konstruktoren: `vi.fn().mockImplementation(function(this, args) { return Object.assign(this, { ...args }) })` statt arrow function — arrow functions können nicht mit `new` aufgerufen werden (TypeError: is not a constructor).

### Entscheidung (05-04):
- Header (h1 + Upload-Link) gehört in CatalogTable, nicht in page.tsx — CatalogTable ist die einzige Client-Komponente und kennt den Sheet-State.
- `archived` nicht im Edit-Schema-Enum (nur pending/processing/ready/failed) — Archivierung bleibt dedizierter /archive-Route vorbehalten (D-10).
- Thumbnail-useEffect mit eslint-disable für thumbnailUrls in Deps-Array — verhindert Endlosschleifen bei URL-Updates im Cache.

### Entscheidung (05-05):
- test.skip-Guard mit hasRows-Check (Timeout 3000ms) statt harter DB-Voraussetzung — ADMIN-02/03-Tests überspringen sich selbst wenn keine Teile in DB vorhanden; CI-kompatibel ohne Testdaten-Setup.
- Suchfeld-Test akzeptiert beide Empty-States (kein Teil vs. kein Treffer) — robuste CI-Kompatibilität unabhängig vom DB-Füllungsgrad.
- Downstream-Constraint für Phase 6: WHERE status = 'ready' als Filter verwenden — NICHT WHERE is_archived = false (is_archived-Boolean wird in Phase 5 nicht geschrieben).

### Entscheidung (07-01):
- `it.todo()` statt `test.skip` für Vitest-Stubs — korrekte todo-Semantik, Tests werden als "todo" markiert ohne zu fehlschlagen oder übersprungen zu werden.
- `Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, writable: true, configurable: true })` — jsdom hat kein `navigator.mediaDevices`; direkte Eigenschaftszuweisung würde TypeError werfen.
- `HTMLCanvasElement.prototype.toBlob = vi.fn(callback => callback(blob))` — jsdom implementiert `toBlob` nicht; synchroner Mock triggert den Callback sofort.

### Entscheidung (07-02):
- `HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))` — jsdom gibt `null` für `getContext('2d')` zurück; Mock erforderlich damit `captureFrame()` nicht mit TypeError crasht.
- Named export `{ CameraCapture }` (nicht default) — konsistent mit UploadForm-Pattern und CameraCapture.test.tsx-Import.
- result-State zeigt JSON in `<pre>` als expliziter D-10 Placeholder — Phase 8 (Results UI) ersetzt dies durch echte Ergebnisdarstellung.

---
*State initialized: 2026-05-07 after roadmap creation*
