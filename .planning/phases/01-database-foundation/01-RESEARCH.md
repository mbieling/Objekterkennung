# Phase 1: Database Foundation - Research

**Recherchiert:** 2026-05-07
**Domain:** Supabase PostgreSQL + pgvector + HNSW + Storage Buckets
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (aus CONTEXT.md)

### Locked Decisions

**Schema: `parts`-Tabelle**
- D-01: `thumbnail_urls text[]` direkt in der `parts`-Tabelle (kein JOIN)
- D-02: Status-Enum: 4 Werte — `pending`, `processing`, `ready`, `failed`
- D-03: `is_archived boolean DEFAULT false` als separates Feld
- D-04: Vollständiges Schema (exakte Felddefinition, siehe unten):
  ```
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  part_number text,
  project text,
  status text NOT NULL DEFAULT 'pending',
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
- D-05: HNSW-Index auf `embedding` mit Cosine-Distanz (NIEMALS IVFFlat)

**Auth & RLS**
- D-06: Kein Auth für den Pilot — RLS deaktiviert. Frontend kommuniziert NUR mit Next.js API, nie direkt mit Supabase
- D-07: Backend nutzt `SUPABASE_SERVICE_ROLE_KEY` als Server-only env var

**Storage-Buckets**
- D-08: 2 getrennte Buckets: `parts-steps` (privat) und `parts-thumbnails`
- D-09: Pfadkonvention: `{part_id}/original.step` und `{part_id}/view_0.png` bis `{part_id}/view_7.png`

**Migrations-Strategie**
- D-10: SQL-Migrationsdatei im Repo: `supabase/migrations/001_parts_schema.sql`
- D-11: Manuelles Einspielen im Supabase SQL Editor (kein CLI-Setup für Phase 1)

### Claude's Discretion
- HNSW-Index-Parameter (`m`, `ef_construction`) — Standardwerte akzeptabel, Tuning in Phase 10
- `updated_at`-Trigger: Standard-Trigger via `moddatetime`-Extension oder custom Trigger in Migration

### Deferred Ideas (AUSSER SCOPE)
- HNSW-Tuning (m, ef_construction, ef_search) — Phase 10
- RLS-Aktivierung — erst nach Pilot
- `supabase db push` via CLI — wenn lokale Dev-Umgebung aufgesetzt wird
- `error_message` + `retry_count` Felder — falls Phase 5 komplex wird
</user_constraints>

---

## Summary

Phase 1 richtet die gesamte Datenbankinfrastruktur ein, auf der alle nachfolgenden Phasen aufbauen. Der Deliverable ist eine einzelne SQL-Migrationsdatei (`supabase/migrations/001_parts_schema.sql`), die manuell im Supabase SQL Editor eingespielt wird. Die Migrationsdatei aktiviert pgvector, legt die `parts`-Tabelle mit allen erforderlichen Feldern an, erstellt den HNSW-Index für Cosine-Ähnlichkeitssuche, und richtet zwei Storage-Buckets ein. Zusätzlich wird der Server-seitige Supabase-Client in `src/lib/supabase.ts` aktiviert und für die Service-Role-Key-Verwendung konfiguriert.

Die Architektur dieser Phase ist bewusst einfach gehalten: kein Ingestion-Code, kein UI, kein Worker. Alles in Phase 1 ist reine Infrastruktur-Konfiguration. Die einzige Verifikation ist ein manuell ausgeführter Test-Query im Supabase SQL Editor.

**Primäre Empfehlung:** Migrationsdatei in einem Schritt schreiben und testen — pgvector aktivieren, Schema anlegen, HNSW-Index erstellen, Storage-Buckets per SQL oder Supabase Dashboard anlegen, Test-Query ausführen. Kein CLI-Setup erforderlich.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Embedding-Vektor-Speicher | Database (Supabase/pgvector) | — | Kern dieser Phase; pgvector-Spalte + HNSW-Index |
| Ähnlichkeitssuche (cosine) | Database (pgvector) | API/Backend (Query-Konstruktion) | Abfrage passiert in der DB per `<=>` Operator |
| STEP-Datei-Speicherung | CDN/Storage (Supabase Storage) | — | Bucket `parts-steps`, privat |
| Thumbnail-Speicherung | CDN/Storage (Supabase Storage) | — | Bucket `parts-thumbnails` |
| Supabase-Client (Server) | API/Backend (Next.js) | — | Service Role Key nur serverseitig |
| Schema-Migration | Database | — | SQL-Datei, manuell eingespielt |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pgvector | 0.7+ | 768-dim Vektor-Spalte + HNSW-Index | In Supabase managed Postgres integriert; HNSW-Support ab 0.5.0, halfvec ab 0.7.0 [VERIFIED: supabase docs] |
| @supabase/supabase-js | ^2.39.3 | Supabase-Client für Next.js | Bereits im Projekt installiert [VERIFIED: .planning/codebase/STACK.md] |
| PostgreSQL (via Supabase) | — | Relationale Basis + pgvector Host | Bereits im Stack; kein separater Dienst nötig |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| moddatetime (Supabase Extension) | built-in | `updated_at` automatisch aktualisieren | Wenn Extension verfügbar ist (Supabase stellt sie bereit) |
| Custom PL/pgSQL Trigger | — | `updated_at` aktualisieren | Fallback wenn moddatetime nicht gewünscht |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HNSW-Index | IVFFlat-Index | IVFFlat erfordert Rebuild nach Bulk-Loads; HNSW ist inkrementell — für dieses Projekt gesperrt: IMMER HNSW |
| text[] für thumbnail_urls | JSONB-Array | text[] reicht für einfache URL-Listen; JSONB nur nötig wenn strukturierte Metadaten je URL nötig werden |
| Service Role Key direkt | Anon Key mit RLS | Ohne RLS muss Service Role Key verwendet werden; für Pilot-Phase akzeptiert |

---

## Architecture Patterns

### System Architecture Diagram

```
[SQL Migration File: supabase/migrations/001_parts_schema.sql]
    |
    | (manuell eingespielt via Supabase SQL Editor)
    v
[Supabase PostgreSQL]
    |-- CREATE EXTENSION vector
    |-- CREATE TABLE parts (...)
    |      |-- embedding vector(768)       <-- pgvector Spalte
    |      |-- status text DEFAULT 'pending'
    |      |-- thumbnail_urls text[]
    |      |-- embedding_model, embedding_version
    |      `-- is_archived boolean
    |-- CREATE INDEX (HNSW, vector_cosine_ops)
    |-- CREATE TRIGGER updated_at
    `-- (Storage-Buckets: via Dashboard oder SQL)

[Supabase Storage]
    |-- Bucket: parts-steps    (privat)
    |      `-- {part_id}/original.step
    `-- Bucket: parts-thumbnails (privat für Pilot)
           `-- {part_id}/view_0.png ... view_7.png

[src/lib/supabase.ts]
    |-- supabase (Anon-Client für spätere Phasen, currently unused)
    `-- supabaseAdmin (Service Role, server-only)

[.env.local + Vercel Env]
    |-- NEXT_PUBLIC_SUPABASE_URL
    |-- NEXT_PUBLIC_SUPABASE_ANON_KEY  (public, bereits dokumentiert)
    `-- SUPABASE_SERVICE_ROLE_KEY      (server-only, NEU)
```

### Recommended Project Structure
```
supabase/
  migrations/
    001_parts_schema.sql    # Phase 1: Komplette DB-Infrastruktur
src/
  lib/
    supabase.ts             # Aktivieren: Anon-Client + Admin-Client
.env.local                  # SUPABASE_SERVICE_ROLE_KEY hinzufügen
.env.local.example          # Dokumentation des neuen Keys
```

### Pattern 1: pgvector HNSW-Index mit Cosine-Distanz
**Was:** HNSW-Index auf der `embedding`-Spalte mit `vector_cosine_ops`
**Wann verwenden:** Bei Einfügen des Indexes nach Tabellenerstellung; Standardparameter für Phase 1 ausreichend

```sql
-- Source: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
create index on parts
using hnsw (embedding vector_cosine_ops);
-- Standardparameter: m=16, ef_construction=64 (pgvector-Defaults)
-- Tuning via: WITH (m = 16, ef_construction = 64)
-- Phase 10 entscheidet über optimierte Werte nach Messung an echten Daten
```

### Pattern 2: pgvector Extension aktivieren
**Was:** Extension in Supabase SQL Editor einmalig aktivieren
**Wann verwenden:** Erste Zeile der Migrationsdatei

```sql
-- Source: https://supabase.com/docs/guides/ai/semantic-search
create extension if not exists vector
with schema extensions;
```

### Pattern 3: Cosine-Ähnlichkeits-Testquery
**Was:** Verifikations-Query zum Bestätigen, dass pgvector und HNSW funktionieren
**Wann verwenden:** Nach Einspielen der Migration als Smoke-Test

```sql
-- Source: https://supabase.com/docs/guides/ai/vector-columns (adaptiert für parts-Tabelle)
-- Test-Embedding mit 768 Dimensionen (Nullvektor für Smoke-Test)
select id, name, 1 - (embedding <=> '[0,0,0,...]'::vector(768)) as similarity
from parts
where embedding is not null
order by embedding <=> '[0,0,0,...]'::vector(768)
limit 5;
-- Erwartet: Kein Fehler (leere Tabelle ist OK), kein "operator does not exist"-Fehler
```

### Pattern 4: updated_at Trigger (PL/pgSQL, kein moddatetime)
**Was:** Custom Trigger zum automatischen Aktualisieren von `updated_at`
**Warum custom statt moddatetime:** In der Migration selbst definierbar, keine Extension-Abhängigkeit

```sql
-- Source: https://supabase.com/docs/guides/getting-started/ai-prompts/database-functions
create or replace function update_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger update_parts_updated_at
before update on parts
for each row
execute function update_updated_at();
```

### Pattern 5: Server-seitiger Supabase Admin Client
**Was:** Service Role Client für Next.js API Routes (server-only)
**Wann verwenden:** In allen Next.js API Routes, die Schreibzugriff auf Supabase benötigen

```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser (adaptiert)
// src/lib/supabase.ts — SERVER-ONLY, nie in Client-Komponenten importieren
import { createClient } from '@supabase/supabase-js'

// Anon-Client (für zukünftige öffentliche Lesezugriffe mit RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin-Client (service_role, NIEMALS ins Client-Bundle)
// Nur in Server Components, API Routes, Server Actions verwenden
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
```

### Anti-Patterns to Avoid

- **IVFFlat statt HNSW:** IVFFlat erfordert Training und manuelle Rebuilds nach Bulk-Loads. Für dieses Projekt architektonisch gesperrt — immer HNSW verwenden.
- **Service Role Key mit NEXT_PUBLIC_ Prefix:** Würde den Key in das Browser-Bundle exponieren. Key MUSS ohne `NEXT_PUBLIC_`-Prefix gesetzt werden.
- **RLS aktivieren und dann Service Role Key verwenden:** Service Role Key umgeht RLS immer. Für Pilot-Phase ist RLS deaktiviert (D-06) — kein Widerspruch.
- **pgvector in `public` Schema statt `extensions` Schema:** Supabase installiert Extensions in `extensions`-Schema. Beim Referenzieren: `extensions.vector(768)` oder nach `SET search_path` einfach `vector(768)`.
- **Embedding-Spalte ohne NULL erlaubt:** `embedding vector(768)` OHNE `NOT NULL` — Teile werden mit `NULL` Embedding angelegt (Status `pending`/`processing`). Das Embedding wird erst vom Worker eingetragen. `NOT NULL` würde Worker-Inserts blockieren.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Approximate Nearest Neighbor Search | Custom KD-Tree oder Brute-Force-Scan | pgvector HNSW | HNSW ist O(log n), Brute-Force O(n). Bei 1000+ Teilen kein linearer Scan |
| Vektor-Distanz-Berechnung | Eigene Cosine-Similarity in TypeScript | pgvector `<=>` Operator | Läuft in der DB, nutzt den Index, kein Datentransfer zum App-Server |
| updated_at Timestamps | Manuell in jedem UPDATE-Statement | PostgreSQL Trigger | Ein Trigger deckt alle Updates ab; keine vergessenen Felder |
| UUID-Generierung | UUID in TypeScript generieren | `gen_random_uuid()` in PostgreSQL | DB-seitig generiert = konsistent, kein Roundtrip nötig |

**Key Insight:** pgvector ist eine ausgereifte PostgreSQL-Extension, die in Supabase direkt verfügbar ist. Es gibt keinen Grund, Vektor-Operationen außerhalb der Datenbank zu implementieren.

---

## Common Pitfalls

### Pitfall 1: pgvector Extension nicht im richtigen Schema
**Was schiefgeht:** `create extension vector` ohne `with schema extensions` legt die Extension im `public`-Schema an, was in Supabase zu Problemen mit PostgREST führen kann.
**Warum:** Supabase empfiehlt Extensions explizit in `extensions`-Schema zu installieren.
**Vermeidung:** Immer `create extension if not exists vector with schema extensions;` verwenden.
**Warnsignal:** Fehlermeldung "could not open file ...vector..." oder Typfehler beim Erstellen der Tabelle.

### Pitfall 2: HNSW-Index vor Tabellenbefüllung erstellt — kein Problem, aber beachten
**Was schiefgeht:** Der HNSW-Index bei leerer Tabelle anlegen ist problemlos (anders als IVFFlat, das Daten zum Training braucht). HNSW ist inkrementell und unterstützt Einfügen nach Indexerstellung.
**Hinweis:** Keine Aktion nötig — nur für IVFFlat wäre Timing ein Problem.
**Warnsignal:** Wenn IVFFlat versehentlich verwendet wird, degradiert die Suchqualität nach Bulk-Inserts ohne Rebuild.

### Pitfall 3: Service Role Key im Client-Bundle
**Was schiefgeht:** `SUPABASE_SERVICE_ROLE_KEY` in einer Client-Komponente oder mit `NEXT_PUBLIC_`-Prefix verwendet.
**Warum:** Next.js bundled alle `NEXT_PUBLIC_`-Variablen in den Browser-Build. Der Service Role Key würde öffentlich sichtbar.
**Vermeidung:** Key ohne Prefix definieren (`SUPABASE_SERVICE_ROLE_KEY`), ausschließlich in API Routes / Server Components / Server Actions verwenden.
**Warnsignal:** `process.env.SUPABASE_SERVICE_ROLE_KEY` in einer Datei ohne `'use server'` oder außerhalb von `src/app/api/`.

### Pitfall 4: Storage-Buckets ohne korrekte RLS — für Pilot kein Problem, Fallstrick für spätere Phasen
**Was schiefgeht:** Buckets ohne RLS-Policies sind per Default vollständig gesperrt (nicht öffentlich lesbar). Der Python Worker muss mit Service Role Key auf Storage zugreifen.
**Für Phase 1:** Kein direkter Client-Zugriff auf Storage — der Worker und die API nutzen Service Role Key. Keine benutzer-seitigen RLS-Policies nötig.
**Warnsignal für Phase 3+:** Wenn Thumbnails im Browser angezeigt werden sollen, muss `parts-thumbnails` entweder public gemacht oder Signed URLs generiert werden.

### Pitfall 5: `embedding` Spalte mit NOT NULL Constraint
**Was schiefgeht:** Wenn `embedding vector(768) NOT NULL`, schlägt der INSERT beim Upload fehl, da das Embedding erst vom Worker erzeugt wird (Status `pending`).
**Vermeidung:** `embedding vector(768)` ohne NOT NULL — NULL ist der korrekte Initialzustand.
**Warnsignal:** `null value in column "embedding" violates not-null constraint` beim ersten Upload-Test.

### Pitfall 6: sha256 Constraint vergessen
**Was schiefgeht:** Ohne UNIQUE Constraint auf `sha256` kann die Deduplizierung (INGEST-04) nicht per Datenbankebene erzwungen werden; der Application-Layer muss es alleine abfangen.
**Empfehlung:** `sha256 text NOT NULL` — UNIQUE-Constraint ist für Phase 1 optional (Phase 3 implementiert die Logik), aber ein Index auf `sha256` verbessert die Lookup-Performance.
**Hinweis:** CONTEXT.md enthält kein UNIQUE auf sha256 — keine eigene Entscheidung, aber ein Index (`CREATE INDEX ON parts(sha256)`) kostet nichts und hilft Phase 3.

---

## Code Examples

### Vollständige Migrationsdatei (Skelett)

```sql
-- Source: Supabase docs + CONTEXT.md D-04, D-05
-- supabase/migrations/001_parts_schema.sql

-- 1. pgvector Extension aktivieren
create extension if not exists vector
with schema extensions;

-- 2. parts-Tabelle erstellen
create table parts (
  id                uuid      default gen_random_uuid() primary key,
  name              text      not null,
  part_number       text,
  project           text,
  status            text      not null default 'pending',
  sha256            text      not null,
  original_filename text      not null,
  file_size_bytes   bigint,
  step_file_path    text,
  thumbnail_urls    text[],
  embedding         vector(768),
  embedding_model   text,
  embedding_version text,
  is_archived       boolean   default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 3. HNSW-Index für Cosine-Ähnlichkeitssuche
-- vector_cosine_ops entspricht dem <=> Operator (cosine distance)
create index parts_embedding_hnsw_idx
on parts
using hnsw (embedding vector_cosine_ops);
-- Standardwerte: m=16, ef_construction=64 — ausreichend für Phase 1

-- 4. Index für sha256 (Deduplizierung in Phase 3)
create index parts_sha256_idx on parts(sha256);

-- 5. Index für Status-Filterung (Admin-Katalog in Phase 5)
create index parts_status_idx on parts(status);

-- 6. updated_at Trigger
create or replace function update_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger update_parts_updated_at
before update on parts
for each row
execute function update_updated_at();

-- RLS BEWUSST DEAKTIVIERT für Pilot-Phase (D-06)
-- alter table parts enable row level security;
-- Kommentar erklärt die Entscheidung für spätere Reviewer
```

### Smoke-Test-Query (nach Migration ausführen)

```sql
-- Source: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes (adaptiert)
-- Im Supabase SQL Editor ausführen nach Einspielen der Migration

-- Test 1: Tabelle existiert und hat korrekte Struktur
select column_name, data_type
from information_schema.columns
where table_name = 'parts'
order by ordinal_position;

-- Test 2: pgvector und <=> Operator funktionieren
-- (Leere Tabelle ist OK — kein Fehler = Erfolg)
select id
from parts
where embedding is not null
order by embedding <=> array_fill(0, ARRAY[768])::vector(768)
limit 1;

-- Test 3: HNSW-Index ist aktiv
select indexname, indexdef
from pg_indexes
where tablename = 'parts'
  and indexdef ilike '%hnsw%';
```

### Storage-Buckets anlegen (Supabase SQL oder Dashboard)

```sql
-- Option A: Via Supabase Dashboard (Storage > Create Bucket) — einfacher für Phase 1
-- Bucket: parts-steps    → Public: OFF
-- Bucket: parts-thumbnails → Public: OFF (für Pilot; kann später auf ON gesetzt werden)

-- Option B: Via SQL (Storage-Schema muss zugreifbar sein)
-- Hinweis: In Supabase managed können Buckets nur über das Dashboard
-- oder die Management API erstellt werden, nicht über direktes SQL auf storage.buckets
-- → Dashboard-Methode empfohlen für Phase 1
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| IVFFlat Index (frühe pgvector-Versionen) | HNSW Index | pgvector 0.5.0 (2023) | HNSW benötigt keinen Rebuild nach Bulk-Inserts; bessere Recall für inkrementelle Daten |
| `vector(n)` für alle Dimensionen | `halfvec(n)` für >2000 Dim | pgvector 0.7.0 | 768 Dim liegt unter dem Grenzwert — `vector(768)` weiterhin korrekt, kein halfvec nötig |
| Extension in `public` Schema | Extension in `extensions` Schema | Supabase Best Practice | Sauberere Schema-Trennung in Supabase managed Postgres |

**Deprecated/veraltet:**
- IVFFlat Index: Für neue Projekte nie verwenden. HNSW ist der aktuelle Standard.
- `create extension vector` ohne Schema-Angabe: In Supabase immer `with schema extensions` verwenden.

---

## Assumptions Log

| # | Claim | Section | Risk bei Fehler |
|---|-------|---------|-----------------|
| A1 | Storage-Buckets können im Supabase Dashboard per UI angelegt werden (kein SQL nötig) | Code Examples | Niedrig — falls nicht: SQL-Alternative über Management API vorhanden |
| A2 | pgvector 0.7+ ist in dem Supabase-Projekt des Users bereits verfügbar (oder aktivierbar) | Standard Stack | Mittel — falls ältere Version: HNSW könnte anders parametrisiert sein; `halfvec` nicht verfügbar (für 768 Dim kein Problem) |
| A3 | HNSW Default-Parameter (m=16, ef_construction=64) sind bei pgvector die Defaults wenn keine WITH-Klausel angegeben | Code Examples | Niedrig — Defaults funktionieren für Phase 1, Tuning in Phase 10 |
| A4 | Der `update_updated_at` Trigger-Name ist noch nicht in der Datenbank vergeben | Code Examples | Niedrig — `create or replace function` überschreibt existierende Funktion; `create trigger` würde bei Konflikt Fehler werfen |

**Wenn diese Tabelle leer wäre:** Alle Claims wären verifiziert oder zitiert. A1-A4 sind niedrig-risiko Annahmen.

---

## Open Questions

1. **Supabase-Plan des Users (free vs. paid)**
   - Was wir wissen: Free-Tier hat Einschränkungen bei Storage-Upload-Größe (50 MB Default) und Compute
   - Was unklar: Welchen Plan nutzt der User? Ist der `SUPABASE_SERVICE_ROLE_KEY` bereits vorhanden?
   - Empfehlung: User bestätigt vor Ausführung, dass Supabase-Projekt eingerichtet ist und Service Role Key verfügbar ist. Phase 1 schlägt fehl wenn kein Supabase-Projekt existiert.

2. **`moddatetime` Extension vs. custom Trigger**
   - Was wir wissen: Beide Ansätze funktionieren. Supabase stellt `moddatetime` bereit.
   - Was unklar: Ist die Präferenz des Users eher "weniger Extensions" oder "kürzerere Migration"?
   - Empfehlung: Custom Trigger in der Migration (keine zusätzliche Extension nötig, selbsterklärend für Reviewer).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Projekt-Build | ✓ | v25.6.0 | — |
| @supabase/supabase-js | Supabase Client | ✓ | ^2.39.3 | — |
| Supabase-Projekt (online) | Alle DB-Tasks | Unbekannt | — | User muss Projekt anlegen |
| SUPABASE_SERVICE_ROLE_KEY | Admin-Client | Unbekannt | — | Im Supabase Dashboard unter Project Settings > API |
| pgvector Extension | HNSW-Index | Unbekannt (muss aktiviert werden) | 0.7+ erwartet | Falls nicht verfügbar: Supabase Dashboard > Extensions > vector |

**Missing dependencies ohne Fallback:**
- Supabase-Projekt: User muss auf supabase.com ein Projekt erstellt haben. Ohne Projekt kann die Migration nicht eingespielt werden.
- `SUPABASE_SERVICE_ROLE_KEY`: Muss in `.env.local` gesetzt sein. Fundort: Supabase Dashboard > Project Settings > API > service_role key.

**Missing dependencies mit Fallback:**
- pgvector Extension: Wird durch die Migrationsdatei selbst aktiviert (`create extension if not exists vector`). Kein manuelle Vorab-Aktivierung nötig.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm run test:all` |

### Phase Requirements → Test Map

Phase 1 hat keine Anforderungs-IDs (Infrastructure Enabler). Die Verifikation erfolgt durch manuelle SQL-Queries im Supabase SQL Editor, nicht durch automatisierte Tests.

| Verifikationsziel | Test-Typ | Methode | Automatisierbar |
|-------------------|----------|---------|-----------------|
| `parts`-Tabelle mit korrektem Schema | Smoke-Test SQL | SQL Editor Query | Nein (manuell) |
| pgvector Extension aktiv + `<=>` Operator funktioniert | Smoke-Test SQL | SQL Editor Query | Nein (manuell) |
| HNSW-Index aktiv auf `embedding`-Spalte | Smoke-Test SQL | `pg_indexes` Query | Nein (manuell) |
| Storage-Buckets `parts-steps` + `parts-thumbnails` existieren | Visuell | Supabase Dashboard > Storage | Nein (manuell) |
| `SUPABASE_SERVICE_ROLE_KEY` korrekt konfiguriert | Integrations-Test | TypeScript Test mit supabaseAdmin Client | Ja — Wave 0 |

### Wave 0 Gaps
- [ ] `src/lib/supabase.test.ts` — Minimal-Test: `supabaseAdmin` Client kann `parts`-Tabelle abfragen (gibt leere Liste zurück ohne Fehler)
- [ ] `.env.local` muss `SUPABASE_SERVICE_ROLE_KEY` enthalten (Wave 0 Schritt für den User)

*(Die eigentliche SQL-Migration ist manuell — die Migrations-Datei selbst braucht keinen automatisierten Test. Der supabaseAdmin-Client-Test ist der einzige automatisierbare Verifikationsschritt.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Nein (kein Auth in Phase 1) | — |
| V3 Session Management | Nein | — |
| V4 Access Control | Ja (RLS deaktiviert per D-06) | Service Role Key als einziger Zugangspunkt; explizit dokumentiert |
| V5 Input Validation | Nein (Phase 1 hat keine User-Inputs) | — |
| V6 Cryptography | Partiell | Service Role Key: sicher in env var; nie im Client-Bundle |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Service Role Key Exposition | Information Disclosure | Kein `NEXT_PUBLIC_` Prefix; Key nur in Server-Code; `.env.local` in `.gitignore` |
| Direkt-Zugriff auf Supabase vom Browser | Elevation of Privilege | D-06: Frontend kommuniziert NUR mit Next.js API; nie direkt mit Supabase |
| RLS deaktiviert ohne Dokumentation | Tampering | Expliziter Kommentar in Migration: `-- RLS BEWUSST DEAKTIVIERT für Pilot-Phase` |

**Hinweis zur CLAUDE.md Backend-Rule:** Die Backend-Regel fordert `ALWAYS enable Row Level Security on every table`. Phase 1 weicht hiervon bewusst ab (D-06: kein Auth für Pilot). Diese Abweichung ist in der Migration zu kommentieren und dem Planner bekannt.

---

## Project Constraints (aus CLAUDE.md)

| Directive | Source | Impact auf Phase 1 |
|-----------|--------|-------------------|
| ALWAYS enable RLS on every table | `.claude/rules/backend.md` | **Bewusst abgewichen per D-06** — RLS deaktiviert für Pilot. Migration enthält erklärenden Kommentar. |
| Never hardcode secrets in source code | `.claude/rules/backend.md` | `SUPABASE_SERVICE_ROLE_KEY` nur in `.env.local` (gitignored); niemals in Quellcode |
| Use environment variables for all credentials | `.claude/rules/backend.md` | Supabase URL + Keys als env vars |
| Validate all inputs with Zod | `.claude/rules/backend.md` | Nicht anwendbar in Phase 1 (kein User-Input) |
| Next.js App Router | `CLAUDE.md` | Supabase Admin Client nur in `src/app/api/` oder Server Components |
| shadcn/ui first, never recreate installed components | `CLAUDE.md` | Nicht anwendbar (Phase 1 hat kein UI) |
| Commits: feat(PROJ-X): description | `.claude/rules/general.md` | Phase 1 hat keine PROJ-X-ID; Commit-Format: `feat(db): add parts schema and pgvector setup` |

---

## Sources

### Primary (HIGH confidence)
- `/websites/supabase` (Context7) — pgvector HNSW setup, storage buckets, service role client, trigger patterns [VERIFIED: Context7]
- `supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes` — HNSW-Index-Syntax, Parameter [CITED: supabase.com/docs]
- `supabase.com/docs/guides/ai/semantic-search` — pgvector Extension aktivieren [CITED: supabase.com/docs]
- `supabase.com/docs/guides/ai/vector-columns` — match_documents Funktion, cosine distance Query [CITED: supabase.com/docs]
- `.planning/phases/01-database-foundation/01-CONTEXT.md` — Alle locked decisions D-01 bis D-11 [VERIFIED: Codebase]
- `.planning/codebase/STACK.md` — Bestehende Bibliotheksversionen [VERIFIED: Codebase]
- `.planning/codebase/INTEGRATIONS.md` — Supabase-Client Status, env vars [VERIFIED: Codebase]
- `.planning/research/STACK.md` — pgvector HNSW Rationale, NEVER IVFFlat [VERIFIED: Codebase]
- `.planning/research/PITFALLS.md` — C3 (IVFFlat), M4 (Model Version Lock-In) [VERIFIED: Codebase]

### Secondary (MEDIUM confidence)
- CONTEXT.md Claude's Discretion: HNSW Default-Parameter akzeptabel — bestätigt durch Supabase Docs (keine WITH-Klausel = Defaults verwendet)
- pgvector HNSW Default-Parameter (m=16, ef_construction=64) — aus Supabase Docs zu "going to production" [ASSUMED: exakte Defaults nicht explizit in abgefraften Docs-Snippets genannt]

### Tertiary (LOW confidence)
- Keine LOW-confidence Findings für Phase 1

---

## Metadata

**Confidence breakdown:**
- SQL-Migrations-Syntax: HIGH — direkt aus Supabase Docs verifiziert
- HNSW-Parameter-Defaults: MEDIUM — Supabase Docs nennen Parameter, exakte Defaults [ASSUMED]
- Storage-Bucket-Erstellung via Dashboard: HIGH — dokumentierte Methode für Supabase
- `updated_at`-Trigger-Pattern: HIGH — direkt aus Supabase AI Prompts verifiziert
- Service Role Client-Konfiguration: HIGH — direkt aus Supabase Reference verifiziert

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (stabile Supabase-APIs, pgvector-Syntax)
