# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Bauteil-Finder (CAD Part Recognition)

Web-App für Ingenieure: STEP-Dateien hochladen, Bauteile per Handy-Kamera fotografieren, geometrisch ähnliche Teile in der Datenbank finden.

## GSD Workflow

Dieses Projekt verwendet Get-Shit-Done (GSD). Planungsdokumente liegen in `.planning/`.

**Workflow-Befehle:**
- `/gsd-progress` — Aktuellen Stand prüfen
- `/gsd-discuss-phase N` — Phase N besprechen
- `/gsd-plan-phase N` — Phase N planen
- `/gsd-execute-phase N` — Phase N ausführen

**Planungsdateien:** `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/research/`

## Architektur: Zwei Services

### 1. Next.js Frontend + API (`src/`)
- Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui
- Datenbankzugriff ausschließlich über **Neon PostgreSQL** (`src/lib/db.ts`) — `db` ist ein tagged-template-literal-Client
- S3-Zugriff über `src/lib/s3.ts` — zwei Buckets: `BUCKET_STEPS` (STEP-Dateien) und `BUCKET_THUMBNAILS` (Thumbnails + Search-Temp)
- `src/components/ui/` sind shadcn/ui-Komponenten — **niemals neu erstellen, nur importieren**
- `src/components/common/` — projektspezifische Wiederverwendungskomponenten (`EmptyState`, `LoadingSkeleton`, `PageHeader`) — immer prüfen, bevor neue erstellt werden

**Pages:**
- `/upload` — STEP-Datei hochladen (`UploadForm.tsx`)
- `/search` — Bauteil per Kamera suchen (`CameraCapture.tsx` + `SearchResults.tsx`)
- `/parts/[id]` — Bauteil-Detailseite (`PartDetail.tsx`)
- `/admin` — Katalogverwaltung (`CatalogTable.tsx`)

**API-Routen (Next.js):**
- `POST /api/upload/init` — Duplikatprüfung, `parts`-Eintrag anlegen, Presigned PUT-URL
- `POST /api/upload/confirm` — Status → `processing`, Worker `/enqueue` aufrufen
- `POST /api/search` — FormData mit 1..5 `image`-Feldern → S3-Temp-Upload je Foto → Worker `/embed` je Foto → pgvector (eine HNSW-Query je Foto, MAX-per-Part-Merge in JS) → S3-Cleanup. Multi-Foto-Modus ist additiv (Single-Photo = N=1).
- `GET /api/parts` — Bauteil-Liste
- `GET/DELETE /api/parts/[id]` — Einzelnes Bauteil
- `GET /api/parts/[id]/status` — Polling (verwendet von `use-part-status` Hook)
- `POST /api/parts/[id]/archive` — Archivieren
- `POST /api/parts/[id]/retry` — Fehlgeschlagene Verarbeitung wiederholen
- `GET /api/parts/[id]/download` — Presigned Download-URL für STEP-Datei

### 2. Python Worker (`worker/`)
- FastAPI + Celery + Redis
- **DINOv3 ViT-L/16** (`facebook/dinov3-vitl16-pretrain-lvd1689m`) für Embeddings (`worker/embedder.py`)
- STEP → Thumbnails via OCC/PythonOCC (`worker/process_step.py`, `worker/renderer.py`)
- Celery-Task-Definition in `worker/tasks.py`, FastAPI-App in `worker/main.py`, Celery-Konfiguration in `worker/celery_app.py`
- `worker/geometry.py` — extrahiert Bounding-Box (sortiert, rotationsinvariant), Volumen, Oberfläche, Face-Count aus STEP-Datei via OCC. Speist die geometrischen Re-Ranking-Spalten in `parts` (Hebel 3a).
- `worker/shape_embedder.py` — Mesh-basiertes Shape Foundation Model (`bayang/shape-foundation-small-v3`, 128-dim) für den Shape-Re-Ranker (Hebel 4). Aktuell via `SHAPE_DISABLE=1` deaktiviert; lädt erst beim ersten Import.
- `worker/preprocess.py` — Hintergrund-Entfernung mit austauschbarem Backend (Hebel 5): `SEGMENTATION_BACKEND=rembg` (Default, U²Net) oder `=groundedsam` (Grounding DINO Tiny + SAM ViT-Base). GroundedSAM-Pfad auf CPU ~9 s/Foto, daher default off — sinnvoll erst nach GPU-Migration.
- Läuft als Docker-Container: `docker compose up`
- **HF_TOKEN** nötig (`worker/.env`) — DINOv3 ist hinter einer HF-Privacy-Policy-Gate

**Worker-API-Endpunkte (intern, Port 8000):**
- `GET /health` — Health-Check
- `POST /enqueue` — `{part_id}` → Celery-Task einreihen (HTTP 202)
- `POST /embed` — `{s3_key}` → synchrones Embedding (HTTP 200, 1024 Floats)

**S3-Pfadkonvention:** `{part_id}/original.step` (STEP-Bucket), `{part_id}/view_0.png … view_15.png` (Thumbnails-Bucket — 16 Fibonacci-Sphere-Views)

## Build & Test

```bash
# Next.js
npm run dev          # localhost:3000
npm run build
npm run lint
npm test             # Vitest (unit + integration, jsdom)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright (Chromium + Mobile Safari)
npm run test:all     # beide Suites

# Python Worker
docker compose up               # Redis + Worker starten
docker compose logs -f worker   # Worker-Logs
docker compose down

# Python Worker-Tests direkt (conda env "base" aktivieren)
cd worker && python -m pytest tests/
cd worker && python -m pytest tests/test_embed.py   # einzelner Test
```

**Einzelnen Vitest-Test ausführen:**
```bash
npm test -- src/app/api/parts/route.test.ts
```

**Vitest-Konfiguration:** Lädt `.env.local` via dotenv — Integration-Tests brauchen `DATABASE_URL`.

## Upload-Flow (2-Schritt)

1. `POST /api/upload/init` — SHA-256-Duplikatprüfung → `parts`-Eintrag anlegen (status=`pending`) → Presigned S3 PUT-URL zurückgeben
2. Client lädt STEP-Datei direkt per PUT in S3
3. `POST /api/upload/confirm` — status=`processing` → Worker `POST /enqueue` → Celery-Task

## Worker-Pipeline

`process_step_task` (Celery) → `process()` (`process_step.py`):
1. STEP-Datei aus S3 herunterladen
2. **16 Thumbnails rendern** (Fibonacci-Sphere-Sampling in `worker/renderer.py` — VIEW_DIRECTIONS, OCC → VTK → PNG, 512×512px)
3. Jedes Thumbnail einzeln embedden (via `prepare_image` → DINOv3)
4. **Beide Speicherpfade**:
   - `part_views(part_id, view_idx, embedding)` — 16 Zeilen pro Bauteil, **das ist die für Suche relevante Tabelle** (MAX-per-Part-Query, HNSW-indiziert)
   - `parts.embedding` — Mean-Pool als Fallback für Alt-Code (Admin-Listen etc.)
5. `thumbnail_urls`, `thumbnail_count=16`, `embedding_model`, status=`ready` in `parts` schreiben

**Embedding-Details (`worker/embedder.py`):**
- Modell: `facebook/dinov3-vitl16-pretrain-lvd1689m` (gecacht in `/app/model_cache` via Dockerfile + `model_cache`-Volume)
- **Patch-Token Mean-Pool** (Indizes 5..200 aus `last_hidden_state`) — CLS-Token (Index 0) **und 4 Register-Tokens** (Indizes 1..4) bewusst überspringen. Wenn HF das Layout je ändert: Shape-Assertion in `get_embedding` schlägt zu.
- Input: 224×224px (rembg ODER GroundedSAM + Crop + Padding via `worker/preprocess.py`, beide Modi `photo` und `render` identisch; Backend per `SEGMENTATION_BACKEND`-Env)
- Output: `np.ndarray` Shape `(1024,)` — Konstante `EMBEDDING_DIM` in `embedder.py`

## Kritische Nicht-Offensichtlichkeiten

**pgvector-Query-Format:** Neon serialisiert `number[]` als PG-Array `{0.1,...}`, pgvector erwartet `[0.1,...]::vector`. Embedding immer als String übergeben:
```typescript
const embeddingLiteral = `[${embedding.join(',')}]`
await db`... WHERE embedding <=> ${embeddingLiteral}::vector ...`
```

**pgvector Threshold-Filter:** Alias im WHERE ist verboten (Pitfall 3) — Cosine-Similarity-Ausdruck im WHERE vollständig wiederholen, nicht aliasieren.

**VTK-Crash verhindern:** `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"` muss in **jeder Datei mit OCC/VTK-Imports** als allererste Zeile vor allen anderen Imports stehen (`renderer.py`, `process_step.py`, `reindex.py`).

**S3 Presigned URL:** `ContentType` **nicht** in `signableHeaders` angeben — sonst Content-Type-Mismatch beim Browser-Upload.

**Search-Route Timeout:** `export const maxDuration = 30` muss als Module-Level-Export in `route.ts` stehen (Next.js liest beim Build). Worker-Fetch mit `AbortSignal.timeout(28_000)`.

## Datenbankschema (Neon PostgreSQL + pgvector)

Tabelle `parts` — wichtigste Felder:
- `id UUID`, `status text` (`pending`|`processing`|`ready`|`failed`|`archived`)
- `sha256 text` — Deduplizierung beim Upload
- `embedding vector(1024)` — Mean-Pool-Fallback, NULLABLE bis Worker fertig
- `thumbnail_urls text[]`, `thumbnail_count integer`
- `embedding_model text`, `embedding_version text` — bei Modellwechsel mitführen
- `is_archived boolean` — Admin-Aktion, unabhängig von `status`
- `bbox_x ≥ bbox_y ≥ bbox_z`, `volume`, `surface_area`, `face_count` (Migration 005) — geometrische Merkmale für Re-Ranking (Hebel 3a), alle NULLABLE
- `shape_embedding vector(128)` (Migration 006) — Mesh-Embedding für Shape-Re-Ranker (Hebel 4), HNSW-indiziert, NULLABLE (Re-Ranker neutral wenn NULL)

Tabelle `part_views` (Migration 003) — eine Zeile pro Render-Perspektive:
- `(part_id, view_idx)` Primary Key, `view_idx` in 0..15
- `embedding vector(1024) NOT NULL`
- **Das ist die Suchquellen-Tabelle** — `/api/search` macht MAX-per-Part über die 16 Views statt Mean-Pool über `parts.embedding` (Mean zerstörte die Form-Diskriminanz)

**Index:** HNSW mit `vector_cosine_ops` auf beiden Vector-Spalten — **NIEMALS IVFFlat ersetzen** (IVFFlat erfordert Rebuild bei wachsendem Corpus).

Migration-Dateien in `supabase/migrations/`:
- `001_parts_schema.sql` — Grundschema
- `002_add_thumbnail_count.sql` — `thumbnail_count`-Spalte
- `003_part_views.sql` — Multi-View-Tabelle
- `004_embedding_dim_1024.sql` — Wechsel vector(768) → vector(1024) (DINOv2-base → -large/DINOv3)
- `005_part_geometry.sql` — Bounding-Box (sortiert), Volumen, Oberfläche, Face-Count (Hebel 3a, alle NULLABLE — ohne Reindex einspielbar)
- `006_shape_embedding.sql` — `parts.shape_embedding vector(128)` + HNSW-Index für Shape Foundation Model (Hebel 4, NULLABLE)

Einspielen: manuell im Neon Dashboard oder via `supabase db push`. RLS ist **bewusst deaktiviert** (kein direkter Client-Zugriff auf DB).

## Kritische Architektur-Entscheidungen (nicht ändern ohne Diskussion)

- Embedding-Modell: **DINOv3 ViT-L/16**, 1024-dim Patch-Token Mean-Pool (CLS + 4 Register-Tokens überspringen)
- Render-Views: **16 Fibonacci-Sphere-Views** (statt fixe Ortho/Iso) — gleichmäßige Kamera-Verteilung um das Objekt
- Suche: **MAX-per-Part über `part_views`**, nicht Mean-Pool — Mean glättete Form-Diskriminanz weg
- Multi-Foto: bis zu 5 Fotos pro Suche, n parallele HNSW-Queries + JS-Merge (kein CROSS-JOIN, der den Index umgehen würde)
- Vektordatenbank: pgvector **HNSW** (NIEMALS IVFFlat)
- STEP-Verarbeitung: Python-Microservice (Docker), NICHT in Next.js/Vercel
- Async-Queue: FastAPI + Celery + Redis
- DB-Client: Neon (`@neondatabase/serverless`), **nicht** Supabase-Client — `src/lib/db.ts` ist server-only
- **Hebel 4 (Shape Foundation Model)**: Code in `worker/shape_embedder.py` + DB-Spalte `parts.shape_embedding` + Re-Ranker in `src/app/api/search/route.ts` sind implementiert, aber via `SHAPE_DISABLE=1` (worker/.env) deaktiviert — CPU-Inferenz hängt deterministisch bei einzelnen STEP-Files. Reaktivierung beim Wechsel auf GPU-Hardware: siehe `docs/GPU-MIGRATION.md` (separate `Dockerfile.gpu` + `docker-compose.gpu.yml` liegen bereit).
- **Hebel 5 (GroundedSAM-Segmentierung)**: Code in `worker/preprocess.py` (Backend-Pattern) ist implementiert, aber via `SEGMENTATION_BACKEND` (worker/.env) standardmäßig auf `rembg`. Aktivierung mit `SEGMENTATION_BACKEND=groundedsam` lädt Grounding DINO Tiny + SAM ViT-Base (~530 MB) lazy beim ersten Foto. Auf CPU ~9 s/Foto — multi-photo-Suche (5 Fotos × 9 s = 45 s) sprengt das 28 s-Timeout in `route.ts`. Daher: sinnvoll erst auf GPU oder als gezieltes Diagnose-Tool. Spike-Vergleich: `scripts/spike_groundedsam.py` (siehe Hilfsscripts-Block).
- **Tuning Hebel 2+3a (Stand 20.05.)**: `COMBINED_W_HITS = 0` und `GEO_MIN_FACTOR = 1.0` in `route.ts` deaktivieren Multi-View-Konsens und Geo-Re-Rank de facto. Grund: beide kosteten beim aktuellen 28-Teile-Korpus mehr Top-1 als sie brachten (vgl. eval/results/baseline_2026-05-20T19-*.json). Reaktivieren, sobald der Korpus wächst und Konflikte messbar werden.

**Bei Änderungen an `embedder.py`, `renderer.py` oder `preprocess.py` ist ein Reindex aller Teile pflicht:**
```bash
docker compose exec worker python -m worker.reindex                  # alle ready-Teile
docker compose exec worker python -m worker.reindex <part-uuid>      # einzelnes Teil, bypass status-Filter
```
Bei Schema-Wechseln (z.B. neuer Embedding-Dim) erst Migration einspielen, dann reindexen.

## Design System

Das Projekt verwendet das BBS Design System (`DESIGN-SYSTEM.md`). Keine generischen Tailwind-Graustufen für Markenfarben verwenden:
- **BBS Orange** `#f29000` → `bg-primary` / `text-primary` (Buttons, Links, Fokus)
- **BBS Blau** `#007cba` → `bg-secondary` / `text-secondary` (Sekundäre Aktionen)

Tailwind-Konfiguration aus `DESIGN-SYSTEM-files/tailwind.config.ts` kopieren, nicht manuell erstellen.

## Umgebungsvariablen

Vorlage: `.env.local.example` — alle benötigten Variablen mit Platzhaltern. Lokal: `.env.local`.

Worker nutzt eigene `.env` (`worker/.env.example`). Wichtig: `DECOMPOSEDS3_ENDPOINT` nur bei Non-AWS-S3 setzen (aktiviert `forcePathStyle: true`).

## Tests

- Unit-Tests co-located neben Quelldateien (z.B. `route.test.ts` neben `route.ts`)
- E2E-Tests in `tests/` (Playwright)
- Vitest mit `environment: 'jsdom'`, globals aktiv, Setup in `src/test/setup.ts`

## Retrieval-Eval-Harness

Reproduzierbare Messung der Such-Qualität in `eval/` + `scripts/eval_baseline.mjs` — Top-1/3/5-Trefferquote gegen einen festen Referenzfoto-Korpus. Nach jeder Render-/Preprocess-/Embedder-Änderung laufen lassen (Pflicht bei Modellwechseln):

```bash
node scripts/eval_baseline.mjs                                       # gegen Production
SEARCH_BASE_URL=http://localhost:3000 node scripts/eval_baseline.mjs # gegen lokalen Dev
```

Output: `eval/results/baseline_<ts>.json` + Konsolen-Report. Snapshot in Git einchecken, damit der Trend dokumentiert ist (`eval/README.md` listet die bisherigen Messpunkte). Referenzfotos selbst sind **nicht** im Repo (Kunden-IP, Pfad via `REF_DIR`-Env überschreibbar).

**Shape-Re-Ranker-Hilfsscripts (`scripts/`):**
- `scripts/shape_calibration.py` — misst paarweise Cosine-Verteilung der Shape-Embeddings im Korpus und gibt datengetriebene Schwellwert-Empfehlungen für `SHAPE_FAIL_SIM` / `SHAPE_PERFECT_SIM`. Im Worker-Container ausführen (siehe Docstring).
- `scripts/test_shape_embed.py` — Isolierter End-to-End-Test (STEP → Shape-Embedding → DB-Write → Read-Back) für ein einzelnes Teil. Diagnose-Tool, wenn `shape_embedding` unerwartet NULL bleibt.

**Hebel-5-Spike-Tooling (`scripts/`):**
- `scripts/spike_groundedsam.py` — vergleicht rembg- und GroundedSAM-Maske auf einer Stichprobe Referenzfotos. Produziert side-by-side PNG-Panels und `summary.json` mit Laufzeiten, Masken-Flächen, IoU.
- `scripts/run_spike_groundedsam_remote.sh` — Helper, der das Spike-Script gegen den Produktions-Worker fährt (lädt Fotos hoch, ruft im Container auf, holt Output zurück). Setzt `SERVER=user@host` und `REPO_REMOTE=/pfad` voraus. Vor jeder Aktivierung von `SEGMENTATION_BACKEND=groundedsam` laufen lassen, um auf der eigenen Foto-Verteilung zu prüfen, ob es lohnt. Outputs landen in `eval/spike_results/` und sind via `.gitignore` vom Repo ausgeschlossen (Kunden-Fotos).

## GPU-Setup (vorbereitet, nicht aktiv)

Hebel 4 (Shape Foundation Model) ist auf CPU instabil und deshalb via `SHAPE_DISABLE=1` deaktiviert. Für die Reaktivierung auf GPU-Hardware liegen bereits parallele Build-Artefakte im Repo:

- `Dockerfile.gpu` — CUDA-fähiges Worker-Image
- `docker-compose.gpu.yml` — Override mit GPU-Reservation
- `docs/GPU-MIGRATION.md` — Schritt-für-Schritt-Anleitung (Treiber, NVIDIA Container Toolkit, Compose-Override)

CPU-Stack bleibt unverändert lauffähig — beide Pfade existieren parallel.

## Detaillierte Entwicklungsregeln

Kontextspezifische Regeln (werden automatisch per Pfad-Matching geladen):
- `.claude/rules/backend.md` — DB/S3/API-Regeln (für `src/app/api/**`, `src/lib/**`, `worker/**`)
- `.claude/rules/frontend.md` — shadcn/ui-Pflicht, Tailwind-Tokens, Responsive-Anforderungen (für `src/components/**`, `src/app/**/page.tsx`)
- `.claude/rules/security.md` — Sicherheitsregeln
- `.claude/rules/general.md` — Feature-Tracking, Git-Konventionen, Human-in-the-Loop

## Feature Overview

@features/INDEX.md
