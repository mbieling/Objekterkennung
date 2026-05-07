# Feature Landscape: CAD Part Recognition / 3D Shape Search

**Domain:** Industrial CAD parts reuse / geometric similarity search
**Researched:** 2026-05-07
**Confidence note:** WebSearch and WebFetch unavailable in this environment.
Findings are based on training knowledge of Cadenas PARTsolutions, Physna/Thangs,
Partful, TraceParts, and general PDM/PLM practitioner knowledge (cutoff Aug 2025).
Confidence levels are marked per section.

---

## Competitive Landscape (Context)

**Cadenas PARTsolutions** — Enterprise parts management with geometric shape search
(GeomSearch). Ingests proprietary formats + STEP. Returns ranked results with 3D
thumbnail, part number, project/revision, material. Strong admin console for bulk
operations, classification systems (eCl@ss, UNSPSC). Aimed at large manufacturers.
MEDIUM confidence — feature list known from published documentation.

**Physna / Thangs** — Geometric similarity search for consumer and SMB 3D files.
Photo-to-3D match ("Geometric Search"), community browsing, version history, team
sharing. Results displayed as 3D thumbnails in a grid with match-percentage badge.
MEDIUM confidence — public product documentation reviewed in training.

**Partful** — Interactive spare parts catalog with visual assembly exploder, part
number lookup by region-click on diagrams. Aimed at aftermarket/service. Less
focused on similarity search, more on structured lookup.
LOW confidence — limited documentation available.

**TraceParts / 3DContentCentral** — Supplier parts libraries with keyword + attribute
search. Engineers use these to find standard parts (bearings, fasteners, brackets).
Search is attribute-driven, not geometry-driven. Engineers download STEP directly.
HIGH confidence — widely documented.

**Real-world engineer workarounds (no formal tool):**
- Browsing the PDM/PLM system by project folder and visual inspection of thumbnails
- Asking colleagues ("does anyone know if we have a bracket like this?")
- Full-text search on part names/descriptions (relies on naming discipline)
- Downloading and opening multiple STEP files in CAD to visually compare
MEDIUM confidence — reported in practitioner surveys and community forums.

---

## Table Stakes

Features without which engineers will not trust or use the system.
Absence creates a "toy" perception among technical users.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Camera photo upload (mobile) | Core workflow — phone camera on the shop floor | Med | Must use `getUserMedia`/WebRTC; also support file upload as fallback for desktop |
| Rendered 3D thumbnail per part | Engineers need visual confirmation before clicking; text-only results are unusable | Med | 2–3 standard views (front, iso, perspective); generated at ingest time from STEP |
| Similarity score / match percentage | Engineers need to judge "how similar" at a glance; raw results list is untrustworthy | Low | Display as percentage or labeled badge (High/Medium/Low match) |
| Part metadata on result card | Part number, name, project/program, creation date, owner/creator | Low | Minimum viable context for triage — engineers won't open every hit |
| Result ranking (best match first) | Assumed behavior; unranked results feel broken | Low | Follows from cosine similarity on embeddings |
| Configurable similarity threshold | Different use cases need different tolerances (exact-match vs. "family" search) | Low | Slider or input field; default of 0.75–0.80 cosine similarity works as starting point |
| Configurable result count | Engineers scanning for "any similar" vs. "top 3" have different needs | Low | Default 10, max 50 reasonable |
| STEP file upload (admin) | Engineers upload their canonical STEP files; no STEP support = no database | Med | Async processing pipeline; file size validation (STEP files can be 10–100 MB) |
| Ingest status / processing feedback | Engineers need to know when their upload is ready to search | Low | Status column: Uploaded → Processing → Ready / Failed |
| Basic text search by part number or name | Engineers often know the family name; visual search supplements, not replaces, text | Low | Simple ILIKE query on metadata fields |
| Delete / archive part from database | Keeps database clean; obsolete parts cause false positives | Low | Soft delete with archive flag preferred over hard delete |

---

## Differentiators

Features that are valuable for v1 but not universally expected. These create
competitive advantage for a focused internal tool vs. enterprise offerings.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-view rendering comparison | Show the matched part's rendered views next to the query photo — lets engineer immediately judge visual relevance without opening the STEP file | Med | Side-by-side or tabbed layout; high impact on triage speed |
| "Report false match" button | Engineers flag bad results → builds trust, feeds future improvement signal | Low | Stores (query_id, result_part_id, feedback) in DB; no ML loop needed in v1 |
| Bulk STEP upload (ZIP or folder) | Seeding the database with 1,000+ existing parts is a one-time migration task; single-file upload makes this painful | Med | ZIP unpacking + metadata CSV pairing or form-per-file with batch modal |
| Processing queue visibility (admin) | Admin sees all pending/failed ingestion jobs; critical for seeding phase | Low | Simple table with status, timestamps, retry button |
| Metadata editing after ingest | Engineers correct OCR-read metadata or add missing fields post-upload | Low | Inline edit on part detail page |
| Download original STEP file | Once a match is confirmed, engineers need the file to use it in their CAD tool | Low | Supabase Storage signed URL; requires access control |
| Part detail page | Full metadata, all rendered views, related project info, download button, edit controls | Low | Deeplink-able URL for sharing among team members |
| Mobile-optimized capture UX | Camera viewport with framing guide (corner brackets), auto-capture on stability, clear "retake" option | Med | Most competitors are desktop-only; this is the primary differentiator of the whole product |
| Search history (per user) | Engineers often re-query the same part; shows last N searches with thumbnail | Low | Persists query image + top result + timestamp; useful for audit trail |

---

## Anti-Features

Features to explicitly NOT build in v1. Each is a scope-creep trap with a better-deferred alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| ERP / PLM / PDM integration (SAP, TeamCenter, Windchill) | Each integration is a 3–6 month project; API formats differ per customer; premature at MVP stage | Provide CSV/XLSX export of search results; let engineers copy part numbers manually |
| QR / barcode scanning | Different workflow (label-based lookup, not geometry-based); adds camera UX complexity; competes with geometry search for scope | Explicitly out of scope per PROJECT.md; do not add to camera UI |
| Tolerance / dimensional analysis | Requires CAD kernel for measurement extraction from STEP (Open CASCADE etc.); not supported by embedding approach | Use similarity score as proxy; document limitation; add to post-v1 backlog |
| Custom AI model training / fine-tuning | Training loop requires labeled dataset, MLOps pipeline, GPU compute; overkill for v1 | Use pre-trained CLIP or similar embedding model; fine-tune only after v1 data validates the concept |
| User-facing 3D viewer (interactive orbit) | Three.js/WebGL STEP rendering in browser requires STEP-to-mesh conversion per request; high complexity, high latency | Show pre-rendered static views; link to download for opening in user's CAD tool |
| Part revision / version management | Version control for STEP files is a PDM feature; complex branching logic | Store latest version only; allow re-upload with manual version note in description field |
| Role-based access control (RBAC) beyond admin/user | Granular permissions (read-only, project-scoped access) add auth complexity | Simple two-role model: admin (can upload/delete) and user (can search/view/download) |
| Classification taxonomy (eCl@ss, UNSPSC) | Enterprise standard but heavy to implement; engineers at target company likely use internal part families | Add free-text "category" or "project" field; taxonomy is a post-v1 migration |
| Notification emails on ingest complete | Nice-to-have; requires email infra and template work | Show status in UI on next visit; polling or Supabase Realtime subscription is sufficient |
| Mobile native app (iOS/Android) | Camera workflow works in mobile browser via `getUserMedia`; native app adds app store, code-signing, and dual codebase overhead | PWA-level mobile web is sufficient for v1 validation |

---

## What Metadata Do Engineers Actually Care About?

Ranked by practitioner importance (HIGH confidence from PDM/PLM domain knowledge):

**Tier 1 — Must have on result card:**
- Part number (internal ID; the thing engineers copy into BOM)
- Part name / description (human-readable)
- Project or program name (context: "which product family uses this?")
- Status (Active / Obsolete / In Development) — prevents engineers from reusing a discontinued part

**Tier 2 — Available on part detail page:**
- Creation date
- Last modified date
- Creator / owner (who to contact for questions)
- Material designation (steel, aluminum grade, plastic type — engineers need this to assess substitutability)
- Surface treatment / finish (anodized, powder-coated — affects interchangeability)
- Mass / weight (sometimes derivable from STEP + material, but unreliable from geometry alone)

**Tier 3 — Useful but deferrable:**
- Supplier / manufacturer (for purchased parts)
- Drawing number (2D reference)
- Assembly parent (where is this part used?)
- Revision / version string
- Cost / price (requires ERP link — defer)

**v1 data model recommendation:** Capture Tier 1 at upload (required fields), Tier 2 as optional fields with inline editing, ignore Tier 3 for now.

---

## How Engineers Currently Search for Parts (Workarounds)

Understanding the status quo informs which friction points this product must eliminate.
MEDIUM confidence — based on practitioner community discussions and PDM vendor case studies.

1. **Folder browsing in PDM (most common):** Navigate project folders, look at thumbnail previews. Breaks down when: naming is inconsistent, parts live in other teams' folders, or the engineer doesn't know which project to look in.

2. **Full-text search on part number / name:** Works only if naming conventions are enforced. A bracket called "BRK-0047" and another called "Haltewinkel-A" are never connected by text search even if geometrically identical.

3. **Asking colleagues:** Tribal knowledge network. Fast when the right person is available; fails with team growth, remote work, or when the original engineer left the company.

4. **Visual inspection by opening files in CAD:** An engineer opens 10–15 similar-looking STEP files in SolidWorks/CATIA to compare. Takes 20–60 minutes per search.

5. **Spreadsheet-based catalogs:** Some teams maintain a manual Excel of "standard parts" with thumbnail screenshots. Goes stale immediately.

**Key pain point to exploit:** The gap between "I have a physical part in my hand" and "I can identify its part number" is entirely unaddressed by existing internal tooling. This is exactly the workflow this product owns.

---

## Similar Part Results UI — What Works

Observations from Physna/Thangs, image search UIs (Google Lens), and practitioner UX feedback.
MEDIUM confidence.

**Effective patterns:**
- **Grid of cards, 3–6 per row on desktop, 1–2 on mobile** — scan-optimized; engineers process visually first
- **Match percentage badge on thumbnail** — prominent, color-coded (green >80%, yellow 60–80%, red <60%)
- **Part number + name below thumbnail** — text confirmation after visual scan
- **Click-to-expand detail** — do not navigate away from results list; use slide-over or modal for part detail
- **"Open full page" link** — for cases where engineer wants to share or bookmark a specific part
- **Sort controls** — by match score (default), by date added, by project
- **Filter controls** — by project, by status (active/obsolete) — low effort, high value for large databases

**Anti-patterns to avoid:**
- **Table/list view as default** — without thumbnails, engineers can't triage visually; tables are acceptable as an alternate view toggle, not the primary
- **Auto-loading more results (infinite scroll)** — engineers scan the top 5–10 matches; if they don't find a match there, they re-photograph; pagination with explicit "load more" is cleaner
- **Requiring login to see result thumbnails** — if the company uses SSO/internal auth, add it at the auth layer, not per-result
- **Similarity score hidden in detail page** — must be visible on the card; hiding it destroys at-a-glance utility

---

## Admin Features Needed

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| Single STEP file upload with metadata form | Must have | Med | Name, part number, project, status, optional fields |
| Bulk upload via ZIP | Should have | Med | ZIP containing STEP files + optional CSV manifest for metadata |
| Processing queue dashboard | Should have | Low | List of all ingestion jobs: status, filename, timestamps, error message if failed |
| Retry failed ingestion | Should have | Low | Re-trigger processing pipeline for a specific file |
| Part list / catalog view | Must have | Low | Searchable, filterable table of all parts with status; admin sees everything |
| Edit part metadata | Must have | Low | Inline or modal form on part record |
| Archive / soft-delete part | Must have | Low | Sets status to Archived; excluded from search results by default |
| Hard delete | Should have | Low | Removes STEP file from storage and record from DB; irreversible, with confirmation |
| Similarity threshold configuration | Should have | Low | Global setting or per-search override; stored in app config table |
| Result count configuration | Nice to have | Low | Global default; per-search override already in search UI |

---

## Feature Dependencies

```
STEP Upload → Async Processing Pipeline → Rendered Thumbnails + Embedding Vector → Search Index
                                                                                        ↓
Camera Capture → Query Embedding ────────────────────────────────────────────────→ Similarity Search → Results UI
                                                                                        ↓
                                                                               Part Detail Page
                                                                                        ↓
                                                                               Download STEP File
```

Critical path: the processing pipeline (STEP → render → embed) must work before any search feature is testable. This means Phase 1 is entirely backend/pipeline.

---

## MVP Recommendation

**Must ship in v1 to validate core hypothesis:**
1. STEP upload + async processing (render + embed)
2. Camera capture on mobile browser
3. Similarity search with ranked results
4. Result grid with thumbnails + match score + part number/name/project
5. Part detail page with full metadata + STEP download
6. Basic admin: catalog list, archive/delete, metadata edit

**Defer from v1:**
- Bulk ZIP upload (use single-file upload for initial seeding; tolerable friction for pilot)
- Search history
- "Report false match" feedback
- Sort/filter controls on results (add in v1.1 once result quality is validated)
- Material and surface treatment metadata fields (add after initial pilot feedback)

**Never (for this product's scope):**
- Interactive 3D viewer in browser
- ERP/PLM integration
- Custom model training

---

## Sources

All findings from training knowledge (cutoff Aug 2025). No web access available in this research session.

- Cadenas PARTsolutions product documentation and feature descriptions (MEDIUM confidence)
- Physna/Thangs product pages and comparison articles (MEDIUM confidence)
- PDM/PLM practitioner literature and community discussions on part reuse (MEDIUM confidence)
- General UX patterns for search result interfaces (HIGH confidence)
- PROJECT.md project definition (HIGH confidence — primary source)
