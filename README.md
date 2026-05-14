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

| Modell | Views | Top-1 | Top-3 | Top-5 |
|---|---|---|---|---|
| DINOv2-base, 6 Ortho + 2 Iso | 8 | 82,8 % | 96,6 % | 100 % |
| DINOv2-base, 16 Fibonacci | 16 | 89,7 % | 89,7 % | 100 % |
| DINOv2-large, 16 Fibonacci | 16 | 93,1 % | 100 % | 100 % |
| **DINOv3 ViT-L/16, 16 Fibonacci** | **16** | **100 %** | **100 %** | **100 %** |

Snapshots in `eval/results/`. Beachte: Der Katalog umfasst aktuell nur 5 Referenz-Bauteile — die 100 % sind eine Untergrenze, die Eval gewinnt erst mit wachsendem Katalog echte Aussagekraft.

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
| `preprocess.py` | rembg + Crop + Padding → 224 × 224 px, einheitlich für Foto und Render |
| `embedder.py` | DINOv3 ViT-L/16, Patch-Token Mean-Pool (Indizes 5–200), 1024-dim |
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

# Worker (lokal, conda env aktivieren)
cd worker && python -m pytest tests/

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
├── Dockerfile                      # Next.js Image
├── .planning/                      # GSD-Workflow (Phasen, Roadmap, Forschung)
├── eval/
│   ├── README.md                   # Eval-Harness-Doku
│   └── results/                    # Top-1/3/5-Snapshots pro Modell-Generation
├── scripts/
│   └── eval_baseline.mjs           # Eval-Skript
├── supabase/migrations/            # 001–004 SQL-Migrationen
├── src/
│   ├── app/                        # Next.js App Router (pages + api)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui (nicht neu erstellen)
│   │   └── common/                 # Wiederverwendung (EmptyState, PageHeader, ...)
│   ├── hooks/                      # use-part-status etc.
│   ├── lib/                        # db.ts (Neon), s3.ts
│   └── middleware.ts               # HTTP Basic Auth für /admin
├── worker/
│   ├── Dockerfile
│   ├── main.py                     # FastAPI (/health, /enqueue, /embed)
│   ├── tasks.py                    # Celery-Task
│   ├── process_step.py             # STEP → Thumbnails → Embeddings
│   ├── renderer.py                 # Fibonacci-Sphere Sampling, OCC → VTK
│   ├── preprocess.py               # rembg + Crop + Padding
│   ├── embedder.py                 # DINOv3 Patch-Token Mean-Pool
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
