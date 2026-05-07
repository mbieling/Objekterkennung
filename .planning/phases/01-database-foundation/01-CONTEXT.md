# Phase 1: Database Foundation - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Das Datenbankschema wird final festgelegt und in Supabase eingespielt — `parts`-Tabelle mit pgvector-Spalte und HNSW-Index, Storage-Buckets für STEP-Dateien und Thumbnails. Kein Ingestion-Code, kein UI, kein Worker. Alles nachfolgende schreibt gegen dieses Schema.

</domain>

<decisions>
## Implementation Decisions

### Schema: `parts`-Tabelle

- **D-01:** Thumbnails als **`thumbnail_urls text[]`** (JSONB-Array) direkt in der `parts`-Tabelle — kein JOIN, kein extra Overhead für Phase 1.
- **D-02:** Status-Enum: **4 Werte** — `pending`, `processing`, `ready`, `failed`. Kein `archived` im Status-Enum.
- **D-03:** **`is_archived boolean DEFAULT false`** als separates Feld — Trennt Ingestion-Status sauber von der Admin-Aktion "Archivieren" (ADMIN-03).
- **D-04:** Pflicht-Felder der Tabelle:
  ```
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  part_number text,
  project text,
  status text NOT NULL DEFAULT 'pending',  -- 'pending'|'processing'|'ready'|'failed'
  sha256 text NOT NULL,
  original_filename text NOT NULL,
  file_size_bytes bigint,
  step_file_path text,
  thumbnail_urls text[],
  embedding vector(768),
  embedding_model text,
  embedding_version text,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
  ```
- **D-05:** HNSW-Index auf `embedding` mit Cosine-Distanz (architektonisch gesetzt, niemals IVFFlat).

### Auth & Datenbankzugang

- **D-06:** **Kein Auth für den Pilot** — Frontend kommuniziert ausschließlich mit der Next.js API, nie direkt mit der Datenbank.
- **D-07:** Backend (Next.js API Routes + Python Worker) nutzt **`DATABASE_URL`** (Neon Connection String) als Server-only env var. Nie ins Client-Bundle.

### Storage-Buckets (AWS S3)

- **D-08:** **2 getrennte S3-Buckets**: `parts-steps` (STEP-Dateien, privat) und `parts-thumbnails` (Thumbnails, ggf. später public). Getrennte Bucket-Policies möglich ohne Umbau.
- **D-09:** **Pfadkonvention**: `{part_id}/original.step` und `{part_id}/view_0.png` bis `{part_id}/view_7.png`. Part-ID als Ordner, feste Dateinamen.

### Migrations-Strategie

- **D-10:** Schema als **SQL-Migrationsdatei im Repo** (`supabase/migrations/001_parts_schema.sql`). Versioniert und reproduzierbar.
- **D-11:** Einspielen **manuell im Neon SQL Editor** — kein CLI-Setup für Phase 1. Datei liegt im Repo, wird auf console.neon.tech ausgeführt.

### Claude's Discretion

- HNSW-Index-Parameter (`m`, `ef_construction`) — Standardwerte sind akzeptabel für den Start. Tuning in Phase 10 (Hardening).
- `updated_at`-Trigger: Custom PL/pgSQL-Funktion in der Migration (kein moddatetime).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Architekturentscheidungen (Embedding-Modell, HNSW, Async-Queue), Core Value, Constraints
- `.planning/REQUIREMENTS.md` — Alle v1-Anforderungen; INGEST-01–04 und ADMIN-03 betreffen direkt das Schema
- `.planning/ROADMAP.md` — Phase 1 Success Criteria (4 Punkte: parts-Tabelle, pgvector-Test, Storage-Buckets, embedding_model/version-Spalten)

### Research
- `.planning/research/STACK.md` — pgvector + HNSW-Empfehlung, Supabase-Setup-Details
- `.planning/research/PITFALLS.md` — Kritische Pitfalls (C1: STEP-Validierung, C2: Embedding-Asymmetrie)

### Codebase
- `.planning/codebase/STACK.md` — Bestehende Next.js-Konfiguration im Template
- `src/lib/db.ts` — Neon SQL-Client (`db`)
- `src/lib/s3.ts` — AWS S3-Client (`s3`, `BUCKET_STEPS`, `BUCKET_THUMBNAILS`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db.ts` — Neon SQL-Client (`db`), tagged-template-literal API
- `src/lib/s3.ts` — AWS S3-Client (`s3`, `BUCKET_STEPS`, `BUCKET_THUMBNAILS`)
- `src/lib/utils.ts` — Allgemeine Utilities (cn, etc.)

### Established Patterns
- Next.js App Router — API Routes liegen in `src/app/api/`. Kein direkter DB-Zugriff aus Client-Komponenten.
- shadcn/ui + Tailwind — UI-Komponenten bereits installiert, für Phase 1 irrelevant (kein UI).

### Integration Points
- Migration-Datei `supabase/migrations/001_parts_schema.sql` → wird per Hand im Neon SQL Editor eingespielt.
- `src/lib/db.ts` → Neon-Client für alle API Routes; `DATABASE_URL` als Server-only env var.

</code_context>

<specifics>
## Specific Ideas

- Pfadkonvention `{part_id}/original.step` ist bewusst generisch — der originale Dateiname wird in `original_filename` gespeichert, aber nicht im Storage-Pfad verwendet (vermeidet Escaping-Probleme mit Sonderzeichen in CAD-Dateinamen).
- 2 separate Buckets (`parts-steps`, `parts-thumbnails`) erlauben später, Thumbnails öffentlich lesbar zu machen ohne die STEP-Dateien zu exponieren.

</specifics>

<deferred>
## Deferred Ideas

- **HNSW-Tuning** (m, ef_construction, ef_search) — Phase 10 (Hardening) nach Messung an echten Daten.
- **RLS-Aktivierung** — Wenn das Tool über den Pilot hinaus geht und echter Multi-User-Zugriff benötigt wird.
- **`supabase db push` via CLI** — Sauberere Alternative zur manuellen Dashboard-Methode, wenn lokale Supabase-Entwicklungsumgebung eingerichtet wird.
- **`error_message` + `retry_count` Felder** — Falls der Retry-Workflow (ADMIN-04) in Phase 5 komplex wird, kann eine Migration diese Felder ergänzen.

</deferred>

---

*Phase: 1-Database Foundation*
*Context gathered: 2026-05-07*
