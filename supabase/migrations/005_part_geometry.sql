-- supabase/migrations/005_part_geometry.sql
-- Geometrische Merkmale aus STEP-Datei (Hebel 3a — geometrisches Re-Ranking in der Suche).
--
-- Quelle: worker/geometry.py extrahiert die Werte beim Worker-Lauf aus der STEP-Datei
-- (OCC Bnd_Box, GProp_GProps, TopExp_Explorer). Alle Spalten NULLABLE, damit:
--   - die Migration ohne Reindex einspielbar ist (alte Zeilen bleiben gültig)
--   - die Suche bei NULL-Werten den Re-Ranking-Beitrag einfach auf 0 setzt
--
-- Konvention für bbox_x/y/z: sortiert nach Größe absteigend (bbox_x ≥ bbox_y ≥ bbox_z).
-- Begründung: der absolute Achsen-Index ist nicht stabil (STEP-Koordinatensystem
-- variiert je nach CAD-Programm), die sortierten Kantenlängen sind invariant unter
-- Rotation. Für 2D-Aspect-Ratio-Vergleich reicht das vollständig aus.
--
-- Einheiten:
--   bbox_x/y/z, surface_area: Millimeter / mm² (STEP-Default, OCC liefert es direkt)
--   volume: mm³
--   face_count: ganzzahlig

alter table parts
  add column if not exists bbox_x        double precision,
  add column if not exists bbox_y        double precision,
  add column if not exists bbox_z        double precision,
  add column if not exists volume        double precision,
  add column if not exists surface_area  double precision,
  add column if not exists face_count    integer;

comment on column parts.bbox_x is 'Längste Kantenlänge der achsenparallelen Bounding-Box (mm). Sortiert: x ≥ y ≥ z.';
comment on column parts.bbox_y is 'Mittlere Kantenlänge der Bounding-Box (mm).';
comment on column parts.bbox_z is 'Kürzeste Kantenlänge der Bounding-Box (mm).';
comment on column parts.volume is 'Geschlossenes Volumen des STEP-Solids (mm³, via OCC GProp_GProps).';
comment on column parts.surface_area is 'Gesamte Oberfläche aller Faces (mm², via OCC GProp_GProps).';
comment on column parts.face_count is 'Anzahl topologischer Faces (Indikator für Geometrie-Komplexität).';
