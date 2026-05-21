# Bauteil-Finder

> Web-App für Ingenieure: STEP-Dateien hochladen, Bauteile per Handy-Kamera fotografieren, geometrisch ähnliche Teile in der Datenbank wiederfinden.

Visuelle Ähnlichkeitssuche für CAD-Teile auf Basis von **DINOv3-Embeddings** und **pgvector**. Eine STEP-Datei wird automatisch aus 16 Perspektiven gerendert, jede Ansicht durchläuft den Vision-Transformer, und beim späteren Suchen via Kamera-Foto wird per HNSW-Index die nächstgelegene Ansicht über den gesamten Katalog gefunden.

---

## Was die App leistet

- **Katalog-Upload:** STEP-Datei rein, Worker rendert 16 Thumbnails (Fibonacci-Sphere-Sampling) und berechnet Embeddings.
- **Foto-Suche:** Bis zu 5 Handy-Fotos pro Anfrage. Hintergrund wird automatisch entfernt, das Embedding wird gegen die Katalog-Views gematcht (MAX-per-Part).
- **Admin-Bereich:** Bauteile listen, archivieren, fehlgeschlagene Verarbeitung erneut anstoßen.
- **Eval-Harness:** Reproduzierbare Top-1/3/5-Trefferquote gegen einen festen Referenzfoto-Korpus.

### Aktueller Stand der Suchqualität

Gemessen auf 29 Referenzfotos gegen einen Katalog von ~28 Bauteilen (Stand 20.05.):

| Konfiguration | Views | Top-1 | Top-3 | Top-5 |
|---|---|---|---|---|
| DINOv2-base, 6 Ortho + 2 Iso | 8 | 82,8 % | 96,6 % | 100 % |
| DINOv2-base, 16 Fibonacci | 16 | 89,7 % | 89,7 % | 100 % |
| DINOv2-large, 16 Fibonacci | 16 | 93,1 % | 100 % | 100 % |
| DINOv3 ViT-L/16 + Hebel 1+2+3 (Geo 0.70, W_HITS 0.40) | 16 | 82,8 % | 89,7 % | 93,1 % |
| **DINOv3 ViT-L/16, MAX-per-Part, Re-Ranker aus** | **16** | **96,6 %** | **100 %** | **100 %** |

Aktuelle Produktiv-Konfiguration: `GEO_MIN_FACTOR = 1.0`, `COMBINED_W_HITS = 0` in `src/app/api/search/route.ts` — d. h. Multi-View-Konsens (Hebel 2) und Geo-Re-Rank (Hebel 3a) sind faktisch aus. Begründung und Diagnose-Reihe: [`eval/README.md`](eval/README.md). Snapshots in `eval/results/`. Der verbleibende Top-1-Miss ist ein reines DINOv3-Limit (Distraktor hat höhere Foto-Similarity als das richtige Teil).

---

## Architektur

Zwei Services, klar getrennt:

```
┌────────────────────────────┐         ┌──────────────────────────────┐
│  Next.js 16 (App Router)   │  HTTP   │  Python Worker (FastAPI)     │
│  TypeScript · Tailwind     │ ───────▶│  Celery · Redis · DINOv3     │
│  shadcn/ui                 │         │  PythonOCC · rembg · VTK     │
│                            │◀─── ─── │                              │
│  src/                      │         │  worker/                     │
└──────────────┬─────────────┘         └──────────────┬───────────────┘
               │                                      │
               ▼                                      ▼
        ┌─────────────────────┐              ┌──────────────────┐
        │ Neon PostgreSQL     │              │ AWS S3           │
        │ + pgvector (HNSW)   │              │ STEPs + Renders  │
        └─────────────────────┘              └──────────────────┘
```

### Next.js Frontend + API (`src/`)

| Pfad | Zweck |
|---|---|
| `/upload` | STEP-Datei hochladen — 2-Schritt-Flow mit Presigned PUT |
| `/search` | Bauteil per Kamera suchen (1–5 Fotos) |
| `/parts/[id]` | Bauteil-Detailseite mit 16 Render-Thumbnails |
| `/admin` | Katalogverwaltung (HTTP Basic Auth) |
| `POST /api/upload/init` | Duplikatprüfung via SHA-256, Presigned URL |
| `POST /api/upload/confirm` | Worker-Task einreihen |
| `POST /api/search` | Multi-Foto-Suche, MAX-per-Part-Merge |
| `GET /api/parts/[id]/status` | Polling für Verarbeitungs-Status |

### Python Worker (`worker/`)

| Komponente | Aufgabe |
|---|---|
| `process_step.py` | STEP herunterladen → 16 Thumbnails rendern → embedden → DB schreiben |
| `renderer.py` | Fibonacci-Sphere-Sampling, OCC → VTK → PNG (512 × 512 px) |
| `preprocess.py` | Hintergrund-Entfernung + Crop + Padding → 224 × 224 px. Backend austauschbar (Hebel 5): `rembg` (Default) oder `groundedsam` |
| `embedder.py` | DINOv3 ViT-L/16, Patch-Token Mean-Pool (Indizes 5–200), 1024-dim |
| `geometry.py` | Bbox/Volumen/Oberfläche/Face-Count aus STEP (Hebel 3a, default neutral) |
| `shape_embedder.py` | Mesh-Embedding via Shape Foundation Model (Hebel 4, via `SHAPE_DISABLE=1` aus) |
| `tasks.py` | Celery-Task `process_step_task` |
| `main.py` | FastAPI: `/health`, `/enqueue`, `/embed` |

---

## Tech Stack

| Layer | Technologie |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui |
| API | Next.js Route Handlers · Zod · `@neondatabase/serverless` |
| Datenbank | Neon PostgreSQL + pgvector (HNSW, `vector_cosine_ops`) |
| Object Storage | AWS S3 (zwei Buckets: STEPs + Thumbnails) |
| Worker | FastAPI · Celery · Redis · PythonOCC · VTK · rembg |
| ML-Modell | `facebook/dinov3-vitl16-pretrain-lvd1689m` (HuggingFace, Privacy-Policy-Gate) |
| Test | Vitest (jsdom) · Playwright (Chromium + Mobile Safari) · pytest |
| Deployment | Docker Compose + Traefik |

---

## Setup

### Voraussetzungen

- Node.js 20+
- Docker + Docker Compose
- Neon-Account (PostgreSQL) — `pgvector`-Extension aktiviert
- AWS-S3-Buckets (oder S3-kompatibler Storage)
- HuggingFace-Token mit Lese-Zugriff auf [DINOv3](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m) (Privacy-Policy einmalig bestätigen)

### 1. Repository klonen und Dependencies installieren

```bash
git clone <repo-url> bauteil-finder
cd bauteil-finder
npm install
npx playwright install chromium   # einmalig, für E2E-Tests
```

### 2. Env-Dateien anlegen

```bash
cp .env.local.example .env.local
cp worker/.env.example worker/.env
```

In `.env.local` setzen: `DATABASE_URL`, `AWS_*`, `WORKER_URL`, `ADMIN_PASSWORD`.
In `worker/.env` setzen: `DATABASE_URL`, `AWS_*`, `HF_TOKEN`.

### 3. Datenbank-Migrationen einspielen

Im Neon-Dashboard (SQL Editor) oder via `supabase db push` der Reihe nach:

```
supabase/migrations/001_parts_schema.sql
supabase/migrations/002_add_thumbnail_count.sql
supabase/migrations/003_part_views.sql
supabase/migrations/004_embedding_dim_1024.sql
supabase/migrations/005_part_geometry.sql       # Bbox/Volumen/Oberfläche (Hebel 3a)
supabase/migrations/006_shape_embedding.sql     # parts.shape_embedding vector(128) (Hebel 4)
```

### 4. Worker starten

```bash
docker compose up -d            # Redis + Worker + (in Prod) Next.js
docker compose logs -f worker
```

Erster Start lädt DINOv3 (~1,5 GB) ins `model_cache`-Volume. Danach Cache-Hit.

### 5. Next.js Dev-Server

```bash
npm run dev   # http://localhost:3000
```

---

## Entwicklung

### Test- und Build-Skripte

```bash
# Next.js
npm run dev              # localhost:3000
npm run build
npm run lint
npm test                 # Vitest (unit + integration)
npm run test:watch
npm run test:e2e         # Playwright
npm run test:all

# Worker (lokal, conda env "base" aktivieren)
cd worker && python -m pytest tests/
cd worker && python -m pytest tests/test_embed.py   # einzelner Test

# Einzelnen Vitest-Test
npm test -- src/app/api/parts/route.test.ts
```

### Reindex nach Modell-/Render-Änderungen

Bei Änderungen an `embedder.py`, `renderer.py` oder `preprocess.py` müssen alle bestehenden Bauteile neu eingebettet werden — sonst mischen sich alte und neue Embeddings im Index:

```bash
docker compose exec worker python -m worker.reindex                  # alle ready-Teile
docker compose exec worker python -m worker.reindex <part-uuid>      # einzelnes Teil
```

### Eval ausführen

Nach jeder geometrisch wirksamen Änderung (Render-Konfiguration, Preprocess, Embedder-Modell):

```bash
node scripts/eval_baseline.mjs                                       # gegen Production
SEARCH_BASE_URL=http://localhost:3000 node scripts/eval_baseline.mjs # gegen lokalen Dev
```

Output: `eval/results/baseline_<timestamp>.json` + Konsolen-Report. Snapshots gehören ins Repo (Trend-Doku). Referenzfotos selbst sind **bewusst nicht** im Repo (Kunden-IP) — Pfad via `REF_DIR`-Env überschreibbar.

Details: [`eval/README.md`](eval/README.md).

---

## Wichtige Architekturentscheidungen

Diese Festlegungen sind absichtlich getroffen worden und sollten nicht ohne Diskussion geändert werden:

- **Embedding-Modell:** DINOv3 ViT-L/16 (1024-dim). CLS-Token und 4 Register-Tokens werden bewusst übersprungen — nur Patch-Token (Indizes 5–200) gehen ins Mean-Pool.
- **Render-Views:** 16 Fibonacci-Sphere-Views statt fixer Ortho/Iso. Gleichmäßige Kameraverteilung schlägt manuell gesetzte Standardansichten.
- **Suche:** MAX-per-Part über `part_views`, nicht Mean-Pool über `parts.embedding`. Mean glättet Form-Diskriminanz weg.
- **Multi-Foto:** Bis zu 5 Fotos pro Suche → n parallele HNSW-Queries + JS-Merge. Kein CROSS-JOIN, der den Index umgehen würde.
- **Vektorindex:** pgvector **HNSW** (nie IVFFlat — IVFFlat erfordert Rebuild bei wachsendem Corpus).
- **STEP-Verarbeitung:** Python-Microservice (Docker), niemals in Next.js/Vercel — PythonOCC und VTK gehören nicht in eine Serverless-Runtime.
- **DB-Client:** Neon (`@neondatabase/serverless`) als Tagged-Template-Literal-Client, **nicht** Supabase-Client. RLS bewusst deaktiviert — alle DB-Zugriffe gehen server-only durch Next.js-API-Routen.

### Status der optionalen Hebel

Mehrere Re-Ranker und Segment-Backends sind implementiert, aber **bewusst deaktiviert**, weil sie auf dem aktuellen Korpus mehr kosten als sie bringen oder weil die CPU-Latenz prohibitiv ist:

| Hebel | Was | Stand | Reaktivierung |
|---|---|---|---|
| 1 | Konfidenz/Margin-Banner in der UI | aktiv (kein Ranking-Effekt) | – |
| 2 | Multi-View-Konsens (`COMBINED_W_HITS`) | **aus** (=0) seit 20.05. | wenn Katalog so wächst, dass 4973-artige Cluster-Konflikte auftreten |
| 3a | Geometrie-Re-Rank (`GEO_MIN_FACTOR`) | **aus** (=1.0) seit 20.05. | wenn ein eigenes Eval messbaren Nutzen zeigt — sonst lieber weglassen |
| 4 | Shape Foundation Model (`SHAPE_DISABLE=1`) | **aus** auf CPU | nach GPU-Migration (`docs/GPU-MIGRATION.md`) |
| 5 | GroundedSAM-Segmentierung (`SEGMENTATION_BACKEND`) | **aus** (Default rembg) | nach GPU-Migration; oder gezielt für komplexe Werkstattfotos |

Details und Datengrundlage: [`eval/README.md`](eval/README.md).

### Häufige Stolperfallen

- **pgvector-Query-Format:** Neon serialisiert `number[]` als PG-Array `{0.1,...}`, pgvector erwartet `[0.1,...]::vector`. Embedding immer als String übergeben.
- **VTK-Crash:** `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"` muss in **jeder** Datei mit OCC/VTK-Imports als allererste Zeile vor allen anderen Imports stehen.
- **S3 Presigned URL:** `ContentType` **nicht** in `signableHeaders` aufnehmen — sonst Content-Type-Mismatch beim Browser-Upload.
- **pgvector Threshold-Filter:** Alias im WHERE ist verboten — Cosine-Similarity-Ausdruck im WHERE vollständig wiederholen, nicht aliasieren.

---

## Projektstruktur

```
bauteil-finder/
├── CLAUDE.md                       # Projekt-Kontext für Claude Code
├── DESIGN-SYSTEM.md                # BBS Design System (Orange #f29000, Blau #007cba)
├── docker-compose.yml              # Prod-Stack (App + Worker + Redis)
├── docker-compose.gpu.yml          # GPU-Override (Hebel 4 + 5, nicht aktiv)
├── Dockerfile                      # Next.js Image
├── docs/
│   └── GPU-MIGRATION.md            # Anleitung für CUDA-Worker
├── .planning/                      # GSD-Workflow (Phasen, Roadmap, Forschung)
├── eval/
│   ├── README.md                   # Eval-Harness-Doku
│   ├── results/                    # Top-1/3/5-Snapshots pro Modell-Generation
│   └── spike_results/              # GroundedSAM-Spike-Outputs (gitignored, Kunden-Fotos)
├── scripts/
│   ├── eval_baseline.mjs           # Eval-Skript
│   ├── spike_groundedsam.py        # Hebel-5-Spike (rembg vs. GroundedSAM)
│   ├── run_spike_groundedsam_remote.sh
│   ├── shape_calibration.py        # Hebel-4-Schwellwert-Kalibrierung
│   └── test_shape_embed.py         # Hebel-4-Roundtrip-Diagnose
├── supabase/migrations/            # 001–006 SQL-Migrationen
├── src/
│   ├── app/                        # Next.js App Router (pages + api)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui (nicht neu erstellen)
│   │   └── common/                 # Wiederverwendung (EmptyState, PageHeader, ...)
│   ├── hooks/                      # use-part-status etc.
│   ├── lib/                        # db.ts (Neon), s3.ts
│   └── middleware.ts               # HTTP Basic Auth für /admin
├── worker/
│   ├── Dockerfile                  # CPU-Image (Standard)
│   ├── Dockerfile.gpu              # CUDA-Image (nicht aktiv)
│   ├── main.py                     # FastAPI (/health, /enqueue, /embed)
│   ├── tasks.py                    # Celery-Task
│   ├── process_step.py             # STEP → Thumbnails → Embeddings
│   ├── renderer.py                 # Fibonacci-Sphere Sampling, OCC → VTK
│   ├── preprocess.py               # Backend-Pattern: rembg | groundedsam
│   ├── embedder.py                 # DINOv3 Patch-Token Mean-Pool
│   ├── geometry.py                 # Bbox/Volumen/Face-Count (Hebel 3a)
│   ├── shape_embedder.py           # Shape Foundation Model (Hebel 4)
│   └── reindex.py                  # Bulk-Reindex CLI
└── tests/                          # Playwright E2E
```

---

## Deployment

Der Prod-Stack läuft unter `objekt.bielingserver.de` als Docker-Compose-Setup hinter Traefik (`docker-compose.yml`). Drei Container: Next.js, Python-Worker (Xvfb für headless VTK), Redis. Das DINOv3-Modell wird in einem Docker-Volume (`model_cache`) gecacht, sodass Restarts schnell sind.

Voraussetzungen:

- Externes Docker-Netzwerk `proxy` für Traefik: `docker network create proxy`
- `.env` und `worker/.env` mit Prod-Credentials befüllt
- HuggingFace-Token mit DINOv3-Zugriff in `worker/.env`

```bash
docker compose up -d
docker compose logs -f worker
```

---

## Lizenz

Privates Projekt, keine offene Lizenz.
