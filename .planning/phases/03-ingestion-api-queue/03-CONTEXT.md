# Phase 3: Ingestion API + Queue - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Die Next.js-API nimmt STEP-Dateien entgegen, erzwingt SHA-256-Deduplizierung, schreibt einen `parts`-Eintrag in Neon (Status `pending`), speichert die Datei in S3, und schiebt einen Celery-Job in die Redis-Queue. Der Python-Worker (aus Phase 2) konsumiert den Job und setzt Status auf `processing` → `ready`/`failed`. Phase 3 liefert die vollständige, testbare Ingestion-Pipeline — von HTTP-Request bis zur fertigen Embedding-Zeile in der Datenbank.

Kein Upload-UI (kommt in Phase 4). API wird mit curl/Postman getestet.

</domain>

<decisions>
## Implementation Decisions

### Upload-Strategie

- **D-01:** **Presigned S3 URL** — API gibt eine signierte Upload-URL zurück, Client lädt direkt zu S3 hoch. Next.js-Server leitet keine Binärdaten durch. SC#3 (HTTP 202 < 2s) ist damit trivial erfüllbar, unabhängig von der Dateigröße.
- **D-02:** **2-Schritt Flow:**
  - Step 1: `POST /api/upload/init` — nimmt Metadaten + SHA-256, erstellt `parts`-DB-Eintrag, gibt `{part_id, presigned_url}` zurück.
  - Step 2: Client lädt Datei direkt zu S3 hoch (PUT auf presigned_url).
  - Step 3: `POST /api/upload/confirm` — bestätigt erfolgreichen S3-Upload, löst Celery-Job aus, antwortet mit HTTP 202.
- **D-03:** SHA-256-Timing liegt beim Planner (Empfehlung: Prüfung in `/api/upload/init` vor Presigned-URL-Erstellung — kein unnötiger S3-Upload bei Duplikaten).

### Queue-Infrastruktur

- **D-04:** **Vollständige Celery+Redis-Implementierung** — `worker/` bekommt FastAPI-Health-Endpoint + Celery-Worker. Kein vereinfachter HTTP-Fire-and-forget.
- **D-05:** **Docker Compose für lokale Entwicklung** — `docker-compose.yml` im Repo-Root startet Redis + Python-Worker zusammen. Ein Befehl für das vollständige lokale Setup.
- **D-06:** **Upstash Redis in Produktion** — Managed Redis-as-a-Service mit Vercel-Integration. Kein selbstverwaltetes Redis in Prod.

### Metadaten-Upload-Flow

- **D-07:** **Alle Metadaten in `/api/upload/init`** — SHA-256, original_filename, file_size_bytes + `name`, `part_number` (optional), `project` (optional) kommen im Init-Request. `parts`-DB-Eintrag wird sofort vollständig angelegt.
- **D-08:** **Pflichtfeld: nur `name`** — `part_number` und `project` sind optional. Niedrigste Reibung für den Ingenieur, höchste Flexibilität.

### Worker-Integration-Tiefe

- **D-09:** **Vollständige Integration in Phase 3** — SC#4 wird vollständig erfüllt: Worker konsumiert Job aus Queue, setzt `parts.status` von `pending` → `processing` → `ready`/`failed`. Phase 3 ist erst abgeschlossen wenn dieser Status-Kreis geschlossen ist.
- **D-10:** **Docker Compose für lokalen E2E-Test** — Next.js Dev-Server + Redis + Python-Worker laufen zusammen. Ein Befehl, vollständiger lokaler E2E-Test möglich.

### Bekannte Defekte aus Phase 2 (vor Phase 3 zu beheben)

- **D-11:** **CR-01 BLOCKER vor Phase 3:** `part_id` in `process_step.py` ohne UUID-Validierung — Path Traversal. Muss behoben sein bevor Phase 3 die Pipeline scharf schaltet. Fix: UUID-Regex-Validierung am Eingang von `process()`.
- **D-12:** **CR-02 Viewer-Ressourcenleck** (`renderer.py`): `Viewer3d` nie explizit freigegeben. Fix in Phase 3 empfohlen, da Batch-Verarbeitung im Worker beginnt.

### Claude's Discretion

- SHA-256-Berechnungsort: Im Browser (vor Init-Request) oder in `/api/upload/confirm` nach S3-Upload (über S3 ETag oder eigenes Hashing)?
- Celery-Task-Name und -Routing-Konfiguration
- FastAPI-Endpunkt-Design für den Worker-Health-Endpoint
- Upstash Redis-Konfigurationsdetails (Connection String Format, TLS)
- Lokale Redis-Version im Docker Compose (redis:7 oder redis:alpine)
- Fehler-Response-Format bei Duplikat-Upload (HTTP 409 mit `{existing_part_id}` empfohlen)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Out-of-Scope-Liste, Constraints
- `.planning/REQUIREMENTS.md` — INGEST-04 (SHA-256-Deduplizierung), INGEST-01, INGEST-02
- `.planning/ROADMAP.md` — Phase 3 Success Criteria (4 Punkte), Phase-Abhängigkeiten

### Datenbankschema & Clients
- `supabase/migrations/001_parts_schema.sql` — Exaktes Schema: `parts`-Tabelle mit allen Spalten, Status-Enum, SHA-256-Feld
- `src/lib/db.ts` — Neon SQL-Client (`db`) — API-Routes verwenden diesen Client
- `src/lib/s3.ts` — AWS S3-Client (`s3`, `BUCKET_STEPS`, `BUCKET_THUMBNAILS`) — Bucket-Namen und Pfad-Konvention

### Phase-2-Artefakte (Worker-Basis)
- `.planning/phases/02-python-worker-spike/02-CONTEXT.md` — Worker-Architekturentscheidungen (D-01 bis D-11), insb. D-09: Pfadkonvention `{part_id}/view_{i}.png`
- `worker/process_step.py` — Vollständige Pipeline-Implementierung (S3→validate→render→embed→DB)
- `worker/Dockerfile` — Container-Konfiguration für Docker Compose
- `.planning/phases/02-python-worker-spike/02-REVIEW.md` — CR-01 (Path Traversal BLOCKER) und CR-02 (Viewer-Leak) müssen vor Phase 3 behoben sein

### Architektur & Patterns
- `.planning/codebase/ARCHITECTURE.md` — Next.js App Router, API Route Pattern, "use client"-Regel
- `.planning/codebase/CONVENTIONS.md` — Code-Konventionen, Import-Pfade (`@/*`)
- `.planning/STATE.md` — Architektonische Entscheidungen (Queue: Celery+Redis; Storage: S3; DB: Neon)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db.ts` — Neon SQL-Client direkt verwendbar in API-Routes
- `src/lib/s3.ts` — S3-Client mit `BUCKET_STEPS` und `BUCKET_THUMBNAILS` — Bucket-Namen und Pfade übernehmen
- `src/components/ui/` — 39 shadcn/ui-Komponenten verfügbar für Phase-4-UI (noch nicht Phase 3)
- `src/hooks/use-toast.ts` — Toast-System für Fehlermeldungen in Phase 4

### Established Patterns
- **API Routes:** Next.js App Router `src/app/api/*/route.ts` — Server-only, kein `"use client"`
- **Env-Vars:** Server-only ohne `NEXT_PUBLIC_`-Prefix (`DATABASE_URL`, `AWS_ACCESS_KEY_ID` etc.)
- **Validation:** Zod für alle User-Inputs (in Stack vorhanden, noch nicht aktiv genutzt)
- **SHA-256:** Browser: `crypto.subtle.digest('SHA-256', ...)` — nativ, kein npm-Paket nötig

### Integration Points
- `POST /api/upload/init` → Neon (parts INSERT) + S3 (generatePresignedUrl)
- `POST /api/upload/confirm` → Neon (parts UPDATE status) + Redis (Celery task publish)
- Python Worker: Celery Consumer → liest Job aus Redis → ruft `process_step.process(part_id)` auf
- Docker Compose: `redis:7-alpine` + `worker/` Container + optionaler Next.js-Proxy

</code_context>

<specifics>
## Specific Ideas

- **2-Schritt Upload-Flow** ist explizit gewünscht (nicht 1-Schritt mit Callback) — Init gibt `{part_id, presigned_url}`, Confirm triggert Queue
- **Docker Compose ein Befehl** — `docker compose up` startet alles: Redis + Worker. Next.js läuft separat mit `npm run dev` (oder optional auch im Compose)
- **Upstash Redis** in Prod — Vercel-Integration nutzen, kein selbstverwaltetes Redis

</specifics>

<deferred>
## Deferred Ideas

- FastAPI REST-Endpunkt für den Worker (vollständige API) → Phase 3 baut nur Celery-Consumer + Health-Endpoint; vollständiges FastAPI kommt wenn nötig
- S3-Multipart-Upload für sehr große Dateien (>100 MB) → explizit Out of Scope (max. 100 MB)
- Authentifizierung am Upload-Endpunkt → Phase 1 Entscheidung D-06: Kein Auth für den Pilot

</deferred>

---

*Phase: 3-Ingestion API + Queue*
*Context gathered: 2026-05-08*
