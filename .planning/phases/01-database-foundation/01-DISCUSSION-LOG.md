# Phase 1: Database Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 1-Database Foundation
**Areas discussed:** Schema (parts-Tabelle), RLS-Policies & Auth, Storage-Bucket-Struktur, Migrations-Strategie

---

## Schema: Spalten der `parts`-Tabelle

### Thumbnails-Speicherung

| Option | Description | Selected |
|--------|-------------|----------|
| JSONB-Array in `parts` | thumbnail_urls direkt in der parts-Tabelle, kein JOIN | ✓ |
| Separate `thumbnails`-Tabelle | Sauberere Normalisierung, JOINs nötig | |
| Nur Storage-Pfad-Konvention | Kein DB-Feld, Pfade aus ID konstruiert | |

**User's choice:** JSONB-Array in `parts` (Empfohlen)
**Notes:** Passt gut zu ≤10k Parts, kein Overhead für Phase 1.

### Status-Modell

| Option | Description | Selected |
|--------|-------------|----------|
| 4 Stati: pending → processing → ready / failed | Deckt Ingestion-Workflow ab | ✓ |
| 5 Stati: + archived | Archived als Status-Wert | |
| 4 Stati + archived als boolean | Status-Enum für Ingestion + separates boolean | |

**User's choice:** 4 Stati (pending/processing/ready/failed)
**Notes:** Archived wird als separates `is_archived` boolean gehandhabt (nächste Frage).

### Metadaten-Felder

| Option | Description | Selected |
|--------|-------------|----------|
| Kern-Set | id, name, part_number, project, status, sha256, original_filename, file_size_bytes, step_file_path, thumbnail_urls, embedding, embedding_model, embedding_version, created_at, updated_at | ✓ |
| Kern-Set + Fehlerdetails | + error_message, retry_count | |
| Kern-Set + is_archived | + is_archived boolean | |

**User's choice:** Kern-Set
**Notes:** Kern-Set als Basis gewählt.

### is_archived jetzt oder später

| Option | Description | Selected |
|--------|-------------|----------|
| Jetzt anlegen | is_archived boolean DEFAULT false | ✓ |
| Später per Migration | ALTER TABLE in Phase 5 | |

**User's choice:** Jetzt anlegen
**Notes:** Schema-Änderungen bei gefüllter DB sind teuer; Feld kostet in Phase 1 nichts.

---

## RLS-Policies & Auth

### Auth-Modell

| Option | Description | Selected |
|--------|-------------|----------|
| Kein Auth, RLS deaktiviert | Service Role Key im Backend, kein direkter Frontend-Supabase-Zugriff | ✓ |
| Supabase Auth, anon key | RLS erlaubt alles für anon — overengineered | |
| Supabase Auth, authenticated users | Email/Passwort Login — zu aufwändig für Pilot | |

**User's choice:** Kein Auth, RLS deaktiviert
**Notes:** Internes Tool ohne Login-Anforderung. OAuth/SSO ist out of scope.

### Backend-Zugriff

| Option | Description | Selected |
|--------|-------------|----------|
| Service Role Key im Server | SUPABASE_SERVICE_ROLE_KEY als Server-only env var | ✓ |
| Anon Key mit Bypass | Technisch funktional, aber Risiko im Client-Bundle | |

**User's choice:** Service Role Key im Server (Empfohlen)

---

## Storage-Bucket-Struktur

### Anzahl Buckets

| Option | Description | Selected |
|--------|-------------|----------|
| 2 getrennte Buckets: `parts-steps` + `parts-thumbnails` | Klare Trennung, verschiedene Policies möglich | ✓ |
| 1 Bucket `parts-assets` | Alles zusammen, Policies gelten für alles | |

**User's choice:** 2 getrennte Buckets
**Notes:** Erlaubt später Thumbnails public zu machen ohne STEP-Dateien zu exponieren.

### Pfadkonvention

| Option | Description | Selected |
|--------|-------------|----------|
| {part_id}/original.step | Feste Dateinamen, part_id als Ordner | ✓ |
| {part_id}/{original_filename} | Original-Dateiname lesbar, Escaping-Probleme möglich | |

**User's choice:** {part_id}/original.step
**Notes:** Vermeidet Sonderzeichen/Leerzeichen in CAD-Dateinamen.

---

## Migrations-Strategie

### Schema-Verwaltung

| Option | Description | Selected |
|--------|-------------|----------|
| SQL-Migrationsdateien im Repo | supabase/migrations/001_parts_schema.sql | ✓ |
| Manuell im Supabase Dashboard | Schnell, aber nicht reproduzierbar | |
| Supabase CLI + lokale Umgebung | Vollständig, aber hoher Setup-Overhead | |

**User's choice:** SQL-Migrationsdateien im Repo
**Notes:** Versioniert und reproduzierbar für andere Devs.

### Einspielen der Migration

| Option | Description | Selected |
|--------|-------------|----------|
| SQL-Datei manuell im Supabase SQL Editor | Kein CLI-Setup nötig, reproduzierbar durch Datei | ✓ |
| supabase db push via CLI | Sauber, aber braucht supabase login + Project Reference | |

**User's choice:** Manuell im Supabase SQL Editor

---

## Claude's Discretion

- HNSW-Index-Parameter (m, ef_construction) — Standardwerte für den Start, Tuning in Phase 10
- `updated_at`-Trigger: Standard moddatetime-Extension oder manuell in Migration

## Deferred Ideas

- HNSW-Tuning nach Messung an echten Daten (Phase 10)
- RLS-Aktivierung wenn Pilot über Single-User hinaus geht
- `supabase db push` via CLI als sauberere Alternative
- `error_message` + `retry_count` Felder falls ADMIN-04 Retry-Workflow komplex wird (Migration in Phase 5)
