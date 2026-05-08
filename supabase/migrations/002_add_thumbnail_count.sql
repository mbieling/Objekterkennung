-- supabase/migrations/002_add_thumbnail_count.sql
-- Phase 4: Ingestion UI
-- Fügt thumbnail_count-Spalte zur parts-Tabelle hinzu (D-05)
-- Einspielen: Supabase Dashboard > SQL Editor > Dateiinhalt einfügen und ausführen
--   ODER: supabase db push

-- thumbnail_count: Anzahl der vom Worker erzeugten Thumbnails (0..8).
-- Wird vom Status-API-Endpunkt GET /api/parts/[id]/status zurückgegeben.
-- Wird in Phase 4 noch nicht in der UI gerendert (UI zeigt nur view_0.png),
-- aber das API-Response-Schema ist bereits durch UI-SPEC und D-05 fixiert.
-- Worker-Update der Spalte erfolgt in Phase 5 (Admin-Katalog) oder später.

alter table parts
  add column if not exists thumbnail_count integer not null default 0;
