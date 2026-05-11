-- supabase/migrations/003_part_views.sql
-- Hebel 2: Multi-View-Index für CAD-Photo-Retrieval.
-- Bisher: 8 View-Embeddings → Mean-Pool → 1 Vektor in parts.embedding
-- Problem: Mean-Pool zerstört Form-Diskriminanz (gemittelter Rundkörper ≈ gemittelter Quader)
-- Lösung: Alle 8 View-Embeddings einzeln indizieren, Suche mit MAX-Similarity per Part.

-- 1. Tabelle part_views — eine Zeile pro Render-Perspektive pro Bauteil
create table part_views (
  part_id     uuid    not null references parts(id) on delete cascade,
  view_idx    int     not null check (view_idx >= 0 and view_idx < 16),  -- aktuell 8, Reserve auf 16
  embedding   vector(768) not null,
  primary key (part_id, view_idx)
);

-- 2. HNSW-Index auf den einzelnen View-Embeddings (NIEMALS IVFFlat — siehe CLAUDE.md)
--    Cosine-Distanz konsistent mit parts.embedding-Index.
create index part_views_embedding_hnsw_idx
  on part_views
  using hnsw (embedding vector_cosine_ops);

-- 3. parts.embedding bleibt erhalten — wird weiterhin als Mean-Fallback geschrieben.
--    Begründung: Bestandsroutes (Admin-Liste, Detail-Page) brauchen keinen Multi-View-Query;
--                erst /api/search profitiert vom MAX-per-Group-Pattern.
