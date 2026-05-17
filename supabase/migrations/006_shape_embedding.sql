-- supabase/migrations/006_shape_embedding.sql
-- Shape-Foundation-Model Embedding pro Bauteil (Hebel 4 — 3D-Form-Re-Ranking in der Suche).
--
-- Quelle: worker/shape_embedder.py rechnet das Embedding aus dem STEP-Mesh
-- (bayang/shape-foundation-small-v3, 128-dim attention-gepooltes Mesh-Embedding).
--
-- Im Suchpfad wird das Embedding NICHT vom Foto abgeleitet (Shape arbeitet Mesh→Mesh,
-- nicht Bild→Mesh). Stattdessen vergleichen wir die Shape-Embeddings der Top-K-Kandidaten
-- paarweise und werten Kandidaten ab, deren Form klar vom Top-1-Anker abweicht.
--
-- NULLABLE, damit:
--   - die Migration ohne Reindex einspielbar ist (alte Zeilen bleiben gültig)
--   - der Shape-Re-Ranker bei NULL-Werten den Beitrag neutral hält (factor = 1.0)
--   - STEP-Files, die trimesh/gmsh nicht tessellieren können, die Pipeline nicht brechen

alter table parts
  add column if not exists shape_embedding vector(128);

comment on column parts.shape_embedding is
  'Mesh-basiertes Shape-Embedding (Shape Foundation Model small-v3, 128-dim). Wird bei der Suche als Form-Cluster-Re-Ranker auf den Top-K DINOv3-Kandidaten genutzt — NICHT als primärer Index. Wenn NULL, fällt das Re-Ranking neutral aus.';

-- HNSW-Index — Cosine-Distanz konsistent mit Render-Embedding-Indices.
-- Nicht zwingend für unsere aktuelle Nutzung (Top-K kommt aus Render-Index, dann
-- werden nur die K Shape-Embeddings nachgeladen), aber zukunftssicher für direkte
-- Shape-Queries (z.B. STEP-zu-STEP-Suche im Admin-UI).
create index if not exists parts_shape_embedding_hnsw_idx
  on parts
  using hnsw (shape_embedding vector_cosine_ops);
