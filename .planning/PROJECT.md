# Bauteil-Finder (CAD Part Recognition)

## What This Is

Eine Web-App für Ingenieure und Konstrukteure, die per Handykamera ein physisches Bauteil abfotografieren und prüfen können, ob ein geometrisch ähnliches Bauteil bereits in der firmeninternen Teile-Datenbank vorhanden ist. STEP-Dateien werden hochgeladen, per DINOv2 ViT-B/14 in 768-dim Embeddings umgewandelt (8 orthographische Views, Mean-Pool) und bei einer Suchanfrage per pgvector-Cosine-Similarity verglichen. Die App umfasst Upload-UI, Admin-Katalog, mobile Kamera-Suche, Ergebnis-Raster und Bauteil-Detailseite.

## Core Value

Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

## Current State (nach v1)

**Shipped:** v1 — Core Search Experience (2026-05-09)

- **Tech Stack (final):** Next.js 16 App Router + TypeScript + shadcn/ui + Neon (PostgreSQL + pgvector) + AWS S3 + Python/Celery/Redis Worker
- **Codebase:** ~9.800 LOC (TypeScript/Python), 337 geänderte Dateien, 240 Commits
- **API-Routes (13):** /api/upload/init, /api/upload/confirm, /api/parts (CRUD), /api/parts/[id]/status, thumbnail, thumbnails, download, archive, retry, /api/search
- **Pages (5):** /, /upload, /admin, /search, /parts/[id]
- **Worker:** Docker-Container mit pythonocc 7.9.3 + DINOv2 ViT-B/14 (FastAPI + Celery + Redis)

## Requirements

### Validated

- ✓ STEP-Datei mit Metadaten hochladen (max. 100 MB) — v1 Phase 4
- ✓ SHA-256-Deduplizierung verhindert doppelte Uploads — v1 Phase 3
- ✓ System zeigt Verarbeitungsstatus an (pending→processing→ready→failed) — v1 Phase 4
- ✓ System erzeugt automatisch 8 orthographische 3D-Thumbnails beim Ingest — v1 Phase 2
- ✓ Admin kann alle Bauteile in Katalog-Liste mit Status und Thumbnail sehen — v1 Phase 5
- ✓ Admin kann Metadaten eines Bauteils nachträglich bearbeiten — v1 Phase 5
- ✓ Admin kann Bauteil archivieren oder löschen — v1 Phase 5
- ✓ Admin kann Verarbeitung für fehlerhafte Teile neu starten — v1 Phase 5
- ✓ Ingenieur kann Bauteil mit Handy-Kamera im Browser fotografieren — v1 Phase 7
- ✓ Foto-Upload-Fallback für vorhandene Bilddateien — v1 Phase 7
- ✓ Gerankete Treffer mit Match-%, Teilenummer und Thumbnails — v1 Phase 8
- ✓ Ähnlichkeitsschwellwert konfigurierbar (Slider) — v1 Phase 8
- ✓ Anzahl der angezeigten Treffer konfigurierbar (Select) — v1 Phase 8
- ✓ Vollständige Metadaten eines Treffers einsehbar (Galerie + alle Felder) — v1 Phase 9
- ✓ Original-STEP-Datei herunterladbar (Presigned URL, korrekter Dateiname) — v1 Phase 9

### Active (für v2)

- [ ] Bulk-Upload via ZIP-Archiv mit mehreren STEP-Dateien
- [ ] Metadaten-Import aus CSV beim Bulk-Upload
- [ ] Suchhistorie (zuletzt gesuchte Fotos)
- [ ] "Falscher Treffer"-Markierung (Qualitäts-Feedback)
- [ ] Filter nach Projekt oder Status in Suchergebnissen
- [ ] Queue-Übersicht der laufenden Verarbeitungs-Jobs
- [ ] Systemweite Konfiguration von Schwellwert und Trefferanzahl

### Out of Scope

- Interaktiver 3D-Viewer im Browser — Thumbnails decken 90% des Nutzens; Web-STEP-Rendering zu komplex
- ERP/PLM-Integration — zu früh; erst Grundfunktion im Pilot validieren
- QR/Barcode-Erkennung — anderer Workflow, nicht die Anforderung
- OAuth / SSO Login — für internen Pilot nicht notwendig
- Offline-Betrieb — Kamera + KI-Suche setzt Verbindung voraus
- Eigene KI-Modell-Trainingsschleife — vortrainierte Embeddings (DINOv2) ausreichend
- Maßstabs-/Toleranzprüfung — Geometrie-Ähnlichkeit ist das Ziel
- Mehrsprachigkeit — Pilot ist intern; Deutsch ausreichend

## Context

- **Nutzergruppe:** Ingenieure und Konstrukteure, die mit CAD-Software arbeiten; technisch versiert
- **Kernproblem:** Doppelentwicklung von Bauteilen durch fehlende Wiederverwendbarkeit
- **v1-Erkenntnis:** Cosine-Schwellwert muss kalibriert werden (Workshop-Fotos vs. saubere Renders: ~0.55–0.75 statt 0.85+)
- **Offene Tech Debt:** Docker-Worker nie E2E gegen echte STEP-Datei getestet; SEARCH-01 nur Desktop-Playwright

## Constraints

- **Tech Stack:** Next.js + TypeScript + Neon + AWS S3 — locked
- **Dateiformat:** STEP (.step / .stp) — nur dieses Format
- **Embedding:** DINOv2 ViT-B/14, 768-dim, nicht änderbar nach Korpus-Befüllung
- **Vektorindex:** HNSW (NIEMALS IVFFlat — kein Rebuild nötig bei wachsendem Korpus)
- **Mobilfähigkeit:** Kamera-Workflow muss auf Handy-Browser funktionieren
- **Max. STEP-Dateigröße:** 100 MB

## Key Decisions

| Entscheidung | Begründung | Ergebnis |
|--------------|-----------|---------|
| DINOv2 ViT-B/14 für Embeddings | Outperformt CLIP auf texturfreien geometrischen Bildern | ✓ Gut |
| Neon (PostgreSQL + pgvector) | Reines Postgres, pgvector built-in, kein Vendor-Lock-in — Supabase ersetzt | ✓ Gut |
| AWS S3 (2 private Buckets) | Stack-Konsistenz mit Neon, volle CORS-Kontrolle | ✓ Gut |
| HNSW-Index statt IVFFlat | Kein Rebuild bei wachsendem Korpus; IVFFlat degradiert still | ✓ Gut |
| Mean-Pool aus 8 Views (Patch-Token) | Bessere geometrische Ähnlichkeit als CLS-Token | ✓ Gut — CR-03 Fix |
| Celery + Redis für Queue | STEP-Verarbeitung dauert 5–120s; HTTP-Timeout-Entkopplung nötig | ✓ Gut |
| SHA-256 vor Upload-Insert | Redundanz-Prävention vor jeder Netzwerkarbeit | ✓ Gut |
| status='archived' statt is_archived | Einheitliches Status-Feld; Suche filtert auf status='ready' | ✓ Gut |
| Presigned S3-URLs (15min / 300s) | Thumbnails und Downloads ohne Public-Bucket | ✓ Gut |
| isSafeImageUrl mit *.amazonaws.com | Supabase-Allowlist war veraltet nach Stack-Wechsel zu S3 | ✓ Fix in Audit |
| thumbnail_count in DB-UPDATE | Feld fehlte in Worker — /thumbnails-Route gab immer [] zurück | ✓ Fix in Audit |

---
*Last updated: 2026-05-09 nach v1 milestone*
