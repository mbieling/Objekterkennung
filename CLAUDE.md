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
- `POST /api/search` — FormData (Foto) → S3-Temp-Upload → Worker `/embed` → pgvector → S3-Cleanup
- `GET /api/parts` — Bauteil-Liste
- `GET/DELETE /api/parts/[id]` — Einzelnes Bauteil
- `GET /api/parts/[id]/status` — Polling (verwendet von `use-part-status` Hook)
- `POST /api/parts/[id]/archive` — Archivieren
- `POST /api/parts/[id]/retry` — Fehlgeschlagene Verarbeitung wiederholen
- `GET /api/parts/[id]/download` — Presigned Download-URL für STEP-Datei

### 2. Python Worker (`worker/`)
- FastAPI + Celery + Redis
- DINOv2 ViT-B/14 für Embeddings (`worker/embedder.py`)
- STEP → Thumbnails via OCC/PythonOCC (`worker/process_step.py`, `worker/renderer.py`)
- Läuft als Docker-Container: `docker compose up`

**Worker-API-Endpunkte (intern, Port 8000):**
- `GET /health` — Health-Check
- `POST /enqueue` — `{part_id}` → Celery-Task einreihen (HTTP 202)
- `POST /embed` — `{s3_key}` → synchrones Embedding (HTTP 200, 768 Floats)

**S3-Pfadkonvention:** `{part_id}/original.step` (STEP-Bucket), `{part_id}/view_0.png … view_7.png` (Thumbnails-Bucket)

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

# Python Worker-Tests direkt (conda env aktivieren)
cd worker && python -m pytest tests/
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
2. 8 Thumbnails rendern (OCC → VTK → PNG, 512×512px)
3. Jedes Thumbnail per `GET /embed`-ähnlichem Aufruf embedden
4. Mean-Pool über alle 8 View-Embeddings → 768-dim Vektor
5. `embedding`, `thumbnail_urls`, `thumbnail_count`, status=`ready` in DB schreiben

**Embedding-Details (`worker/embedder.py`):**
- Modell: `facebook/dinov2-base` (gecacht in `/app/model_cache` via Dockerfile)
- **Patch-Token Mean-Pool** (Indizes 1..256 aus `last_hidden_state`) — **KEIN CLS-Token** (Index 0)
- Input: 224×224px (Resize VOR AutoImageProcessor)
- Output: `np.ndarray` Shape `(768,)`

## Kritische Nicht-Offensichtlichkeiten

**pgvector-Query-Format:** Neon serialisiert `number[]` als PG-Array `{0.1,...}`, pgvector erwartet `[0.1,...]::vector`. Embedding immer als String übergeben:
```typescript
const embeddingLiteral = `[${embedding.join(',')}]`
await db`... WHERE embedding <=> ${embeddingLiteral}::vector ...`
```

**pgvector Threshold-Filter:** Alias im WHERE ist verboten (Pitfall 3) — Cosine-Similarity-Ausdruck im WHERE vollständig wiederholen, nicht aliasieren.

**VTK-Crash verhindern:** `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"` muss in `tasks.py` **vor allen anderen Imports** stehen.

**S3 Presigned URL:** `ContentType` **nicht** in `signableHeaders` angeben — sonst Content-Type-Mismatch beim Browser-Upload.

**Search-Route Timeout:** `export const maxDuration = 30` muss als Module-Level-Export in `route.ts` stehen (Next.js liest beim Build). Worker-Fetch mit `AbortSignal.timeout(28_000)`.

## Datenbankschema (Neon PostgreSQL + pgvector)

Tabelle `parts` — wichtigste Felder:
- `id UUID`, `status text` (`pending`|`processing`|`ready`|`failed`|`archived`)
- `sha256 text` — Deduplizierung beim Upload
- `embedding vector(768)` — NULLABLE bis Worker fertig
- `thumbnail_urls text[]`, `thumbnail_count integer`
- `is_archived boolean` — Admin-Aktion, unabhängig von `status`

**Index:** HNSW mit `vector_cosine_ops` — **NIEMALS IVFFlat ersetzen** (IVFFlat erfordert Rebuild bei wachsendem Corpus).

Migration-Dateien in `supabase/migrations/` — manuell im Neon Dashboard oder via `supabase db push` einspielen. RLS ist **bewusst deaktiviert** (kein direkter Client-Zugriff auf DB).

## Kritische Architektur-Entscheidungen (nicht ändern ohne Diskussion)

- Embedding: DINOv2 ViT-B/14, 768-dim, Patch-Token Mean-Pool, 8 Views
- Vektordatenbank: pgvector **HNSW** (NIEMALS IVFFlat)
- STEP-Verarbeitung: Python-Microservice (Docker), NICHT in Next.js/Vercel
- Async-Queue: FastAPI + Celery + Redis
- DB-Client: Neon (`@neondatabase/serverless`), **nicht** Supabase-Client — `src/lib/db.ts` ist server-only

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

## Feature Overview

@features/INDEX.md
