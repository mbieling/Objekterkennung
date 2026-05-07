# Phase 1: Database Foundation - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 4 (neue/geänderte Dateien)
**Analogs found:** 1 / 4 (Codebase ist frisches Template — für 3 Dateien kein Analog vorhanden)

---

## File Classification

| Neue/Geänderte Datei | Role | Data Flow | Closest Analog | Match Quality |
|----------------------|------|-----------|----------------|---------------|
| `supabase/migrations/001_parts_schema.sql` | migration | batch | — | kein Analog |
| `src/lib/supabase.ts` | utility/config | request-response | `src/lib/supabase.ts` (bestehend, auskommentiert) | partial-match |
| `src/lib/supabase.test.ts` | test | request-response | `src/test/setup.ts` | partial-match |
| `.env.local` (ergänzen) | config | — | — | kein Analog |

---

## Pattern Assignments

### `supabase/migrations/001_parts_schema.sql` (migration, batch)

**Analog:** Kein Analog in der Codebase — frisches Projekt ohne bestehende Migrations.
**Quelle:** RESEARCH.md Code Examples + Supabase Docs (verifiziert).

**Vollständiges Migrations-Muster** (aus RESEARCH.md):

```sql
-- supabase/migrations/001_parts_schema.sql
-- Reihenfolge: Extension → Tabelle → Indexes → Trigger

-- 1. pgvector Extension aktivieren
-- WICHTIG: with schema extensions (nicht public) — Supabase Best Practice
create extension if not exists vector
with schema extensions;

-- 2. Haupttabelle
create table parts (
  id                uuid        default gen_random_uuid() primary key,
  name              text        not null,
  part_number       text,
  project           text,
  status            text        not null default 'pending',
  sha256            text        not null,
  original_filename text        not null,
  file_size_bytes   bigint,
  step_file_path    text,
  thumbnail_urls    text[],
  embedding         vector(768),          -- NULL erlaubt: Worker trägt Embedding erst ein
  embedding_model   text,
  embedding_version text,
  is_archived       boolean     default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 3. HNSW-Index (NIEMALS IVFFlat — architektonisch gesperrt)
-- vector_cosine_ops entspricht dem <=> Operator (Cosine Distance)
create index parts_embedding_hnsw_idx
on parts
using hnsw (embedding vector_cosine_ops);
-- Defaults: m=16, ef_construction=64 — Tuning in Phase 10

-- 4. Index für sha256 (Deduplizierung in Phase 3)
create index parts_sha256_idx on parts(sha256);

-- 5. Index für Status-Filterung (Admin-Katalog Phase 5)
create index parts_status_idx on parts(status);

-- 6. updated_at Trigger (custom PL/pgSQL, keine moddatetime Extension nötig)
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

-- RLS BEWUSST DEAKTIVIERT für Pilot-Phase (Entscheidung D-06)
-- Frontend kommuniziert ausschließlich mit Next.js API, nie direkt mit Supabase.
-- Aktivierung wenn echter Multi-User-Zugriff benötigt wird.
-- alter table parts enable row level security;
```

**Smoke-Test-Queries** (nach Migration im Supabase SQL Editor ausführen):

```sql
-- Test 1: Schema-Struktur prüfen
select column_name, data_type
from information_schema.columns
where table_name = 'parts'
order by ordinal_position;

-- Test 2: pgvector <=> Operator funktioniert (leere Tabelle = kein Fehler = Erfolg)
select id
from parts
where embedding is not null
order by embedding <=> array_fill(0, ARRAY[768])::vector(768)
limit 1;

-- Test 3: HNSW-Index aktiv
select indexname, indexdef
from pg_indexes
where tablename = 'parts'
  and indexdef ilike '%hnsw%';
```

---

### `src/lib/supabase.ts` (utility/config, request-response)

**Analog:** `src/lib/supabase.ts` (Zeilen 1–14, bestehend aber auskommentiert)

**Bestehender Stand** (Zeilen 1–14):
```typescript
// Supabase Client Setup
// Uncomment this file when you're ready to use Supabase

/*
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
*/

// For now, export a placeholder to avoid import errors
export const supabase = null;
```

**Ziel-Muster** (bestehenden Kommentar-Block aktivieren + Admin-Client ergänzen):

```typescript
// src/lib/supabase.ts
// SERVER-ONLY wenn supabaseAdmin verwendet wird — nie in Client-Komponenten importieren
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Anon-Client (für zukünftige öffentliche Lesezugriffe mit RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin-Client (service_role) — NIEMALS ins Client-Bundle
// Nur in: Server Components, API Routes (src/app/api/), Server Actions
// NIEMALS mit NEXT_PUBLIC_ Prefix — würde Key im Browser-Bundle exponieren
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
```

**Import-Konvention** (aus bestehender Codebase — Pfad-Alias `@/`):
```typescript
// Wie src/lib/utils.ts verwendet wird: import { cn } from '@/lib/utils'
// Analog für supabase:
import { supabaseAdmin } from '@/lib/supabase'
```

---

### `src/lib/supabase.test.ts` (test, request-response)

**Analog:** `src/test/setup.ts` (Zeile 1) — sehr minimal, nur Testing Library Setup.
**Vitest-Konfiguration:** `vitest.config.ts` (Zeilen 1–17) — jsdom-Environment, `@`-Alias, globale Test-Variablen.

**Vitest-Konfiguration** (aus `vitest.config.ts`, Zeilen 6–16):
```typescript
// vitest.config.ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
},
resolve: {
  alias: {
    '@': resolve(__dirname, './src'),
  },
},
```

**Ziel-Muster** (Integrations-Test für supabaseAdmin Client):

```typescript
// src/lib/supabase.test.ts
// Wave 0: Verifikation dass supabaseAdmin die parts-Tabelle erreicht
// Voraussetzung: .env.local mit SUPABASE_SERVICE_ROLE_KEY gesetzt

import { describe, it, expect } from 'vitest'
import { supabaseAdmin } from './supabase'

describe('supabaseAdmin', () => {
  it('should connect to parts table without error', async () => {
    const { data, error } = await supabaseAdmin
      .from('parts')
      .select('id')
      .limit(1)

    // Leere Tabelle ist OK — kein Fehler = Erfolg
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
```

**Hinweis:** Dieser Test benötigt eine echte Supabase-Verbindung (Integration Test). Er schlägt fehl wenn `SUPABASE_SERVICE_ROLE_KEY` nicht in `.env.local` gesetzt ist oder die Migration noch nicht eingespielt wurde.

---

### `.env.local` (config, ergänzen)

**Analog:** Kein Analog — `.env.local` existiert nicht im Repo (in `.gitignore`).

**Ergänzungs-Muster:**
```bash
# .env.local — NEU HINZUFÜGEN
# Bestehend (aus Template bereits dokumentiert):
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# NEU für Phase 1 (server-only, KEIN NEXT_PUBLIC_ Prefix):
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
# Fundort: Supabase Dashboard > Project Settings > API > service_role
```

**Dokumentations-Muster für `.env.local.example`:**
```bash
# .env.local.example — MIT INS REPO (keine echten Werte)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

---

## Shared Patterns

### Kein Auth / Service Role Key
**Quelle:** CONTEXT.md D-06, D-07 + RESEARCH.md Pattern 5
**Gilt für:** `src/lib/supabase.ts`, alle zukünftigen API Routes
```typescript
// Pattern: Service Role Key OHNE NEXT_PUBLIC_ Prefix
// Richtig:
process.env.SUPABASE_SERVICE_ROLE_KEY

// FALSCH (würde Key im Browser exponieren):
process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

### TypeScript Pfad-Alias
**Quelle:** `vitest.config.ts` Zeile 14, `tsconfig.json` (Standard Next.js)
**Gilt für:** alle neuen TypeScript-Dateien
```typescript
// Immer @/ statt relativer Pfade in src/
import { supabaseAdmin } from '@/lib/supabase'
// Nicht: import { supabaseAdmin } from '../lib/supabase'
```

### Supabase-Fehlerbehandlung
**Gilt für:** alle zukünftigen API Routes (Phase 2+)
```typescript
// Standard-Pattern: destructure { data, error }
const { data, error } = await supabaseAdmin.from('parts').select(...)
if (error) throw new Error(error.message)
```

---

## No Analog Found

| Datei | Role | Data Flow | Grund |
|-------|------|-----------|-------|
| `supabase/migrations/001_parts_schema.sql` | migration | batch | Keine bestehenden SQL-Migrations im Repo — frisches Projekt |
| `.env.local` (Ergänzung) | config | — | Datei existiert nicht im Repo (.gitignore); kein Template |

---

## Metadata

**Analog-Suchbereich:** `/Users/mbieling/claude/Objekterkennung/src/`
**Gescannte Dateien:** 8 (alle nicht-UI TypeScript-Dateien)
**Pattern-Extraktion:** 2026-05-07

**Codebase-Zustand:** Frisches Next.js Template. Keine API Routes, keine Services, keine Migrations vorhanden. `src/lib/supabase.ts` existiert mit auskommentiertem Anon-Client — direkter Ausgangspunkt für Phase 1.

**Kritische Abhängigkeit:** Die Migrationsdatei muss vor dem supabaseAdmin-Test eingespielt sein. Reihenfolge: (1) Supabase-Projekt anlegen, (2) Migration einspielen, (3) `.env.local` setzen, (4) Test ausführen.
