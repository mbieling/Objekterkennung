-- supabase/migrations/004_embedding_dim_1024.sql
-- DINOv2-large: Vektor-Dimension 768 → 1024
--
-- Auswirkung: alle bestehenden Embeddings werden gelöscht — sie sind nicht
-- migrierbar (DINOv2-base 768-dim ≠ DINOv2-large 1024-dim). Nach Einspielen:
--
--    docker compose exec worker python -m worker.reindex
--
-- Reihenfolge (kritisch):
--   1. HNSW-Indices droppen (sonst hängt ALTER COLUMN am Index)
--   2. Datenträger leeren (part_views via TRUNCATE, parts.embedding via UPDATE)
--   3. Spalten-Typ ändern
--   4. HNSW-Indices wieder anlegen (cosine, Default-Parameter wie zuvor)

-- 1. Bestehende HNSW-Indices entfernen
drop index if exists part_views_embedding_hnsw_idx;
drop index if exists parts_embedding_hnsw_idx;

-- 2a. part_views komplett leeren — Inhalt wird via reindex.py wiederhergestellt
truncate table part_views;

-- 2b. parts.embedding (Mean-Pool-Fallback) auf NULL setzen — Spalte ist nullable
update parts set embedding = null;

-- 3. Spalten auf vector(1024) umstellen
alter table part_views alter column embedding type vector(1024);
alter table parts      alter column embedding type vector(1024);

-- 4. HNSW-Indices neu anlegen — cosine-Distanz konsistent mit /api/search
create index part_views_embedding_hnsw_idx
  on part_views
  using hnsw (embedding vector_cosine_ops);

create index parts_embedding_hnsw_idx
  on parts
  using hnsw (embedding vector_cosine_ops);
