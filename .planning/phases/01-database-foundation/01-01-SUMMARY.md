---
plan: 01-01
phase: 01-database-foundation
status: complete
completed: 2026-05-07
self_check: PASSED
key-files:
  created:
    - supabase/migrations/001_parts_schema.sql
---

## Was gebaut wurde

Die SQL-Migrationsdatei `supabase/migrations/001_parts_schema.sql` wurde erstellt. Sie enthält die gesamte Datenbankinfrastruktur für alle nachfolgenden Phasen (2–10).

## Inhalt der Migrationsdatei

**pgvector-Extension:**
- `create extension if not exists vector with schema extensions` (Supabase-Konvention)

**parts-Tabelle mit 17 Feldern (gemäß D-04):**
- id, name, part_number, project, status, sha256, original_filename, file_size_bytes, step_file_path, thumbnail_urls, embedding, embedding_model, embedding_version, is_archived, created_at, updated_at

**Indexes:**
- `parts_embedding_hnsw_idx` — HNSW mit `vector_cosine_ops` (NIEMALS IVFFlat)
- `parts_sha256_idx` — für Deduplizierungs-Lookups (Phase 3)
- `parts_status_idx` — für Admin-Filterung (Phase 5)

**updated_at-Trigger:**
- `update_updated_at()` PL/pgSQL-Funktion + `update_parts_updated_at` Trigger

**RLS-Kommentar:**
- Explizite Erklärung warum RLS für Pilot deaktiviert ist (D-06)

## Abweichungen von CONTEXT.md

Keine. Alle Entscheidungen D-01 bis D-11 wurden exakt umgesetzt.

## Verifikation

| Check | Ergebnis |
|-------|----------|
| Datei existiert | ✓ |
| `create table parts` (1x) | ✓ |
| `with schema extensions` | ✓ |
| `embedding vector(768)` ohne NOT NULL | ✓ |
| `vector_cosine_ops` (HNSW) | ✓ |
| Kein IVFFlat im SQL | ✓ |
| `is_archived` Feld | ✓ |
| `embedding_model` + `embedding_version` | ✓ |
| `parts_sha256_idx` | ✓ |
| `update_parts_updated_at` Trigger | ✓ |
| RLS-Kommentar | ✓ |

## Self-Check: PASSED
