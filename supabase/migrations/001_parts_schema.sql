-- supabase/migrations/001_parts_schema.sql
-- Phase 1: Database Foundation
-- Erstellt: Bauteil-Finder v1 Datenbankinfrastruktur
-- Einspielen: Supabase Dashboard > SQL Editor > Dateiinhalt einfügen und ausführen

-- 1. pgvector-Extension aktivieren
--    Neon hat pgvector vorinstalliert; einfaches CREATE EXTENSION reicht
create extension if not exists vector;

-- 2. parts-Tabelle anlegen (17 Felder gemäß D-04)
create table parts (
  id                uuid         default gen_random_uuid() primary key,
  name              text         not null,
  part_number       text,
  project           text,
  status            text         not null default 'pending',  -- 'pending'|'processing'|'ready'|'failed' (D-02)
  sha256            text         not null,
  original_filename text         not null,
  file_size_bytes   bigint,
  step_file_path    text,
  thumbnail_urls    text[],                                    -- kein JSONB, kein JOIN (D-01)
  embedding         vector(768),                               -- KEIN NOT NULL: Worker trägt Embedding erst nach STEP-Verarbeitung ein
  embedding_model   text,
  embedding_version text,
  is_archived       boolean      default false,                -- trennt Ingestion-Status von Admin-Aktion (D-03)
  created_at        timestamptz  default now(),
  updated_at        timestamptz  default now()
);

-- 3. HNSW-Index auf embedding mit Cosine-Distanz (D-05, architektonisch gesperrt — NIEMALS IVFFlat)
--    IVFFlat erfordert Rebuild wenn Corpus wächst; HNSW wächst dynamisch ohne Qualitätsverlust.
--    Standardwerte m=16, ef_construction=64 sind ausreichend für den Start (Tuning in Phase 10).
create index parts_embedding_hnsw_idx
  on parts
  using hnsw (embedding vector_cosine_ops);

-- 4. Index auf sha256 für Deduplizierungs-Lookups (Phase 3: Ingestion API)
create index parts_sha256_idx on parts(sha256);

-- 5. Index auf status für Admin-Katalog-Filterung (Phase 5: Admin Catalog)
create index parts_status_idx on parts(status);

-- 6. updated_at-Trigger (custom PL/pgSQL, keine moddatetime-Extension — zuverlässiger)
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

-- 7. RLS BEWUSST DEAKTIVIERT für Pilot-Phase (Entscheidung D-06)
-- Frontend kommuniziert ausschließlich mit Next.js API, nie direkt mit Supabase.
-- Backend und Python Worker nutzen SUPABASE_SERVICE_ROLE_KEY (server-only).
-- Aktivierung wenn echter Multi-User-Zugriff benötigt wird.
-- alter table parts enable row level security;
