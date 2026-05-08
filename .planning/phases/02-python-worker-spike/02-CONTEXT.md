# Phase 2: Python Worker Spike - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Ein minimaler Python-Spike validiert die gesamte STEP→Rendering→Embedding-Pipeline in einem lokalen Docker-Container. Deliverable ist ein Testskript (`worker/process_step.py`) das eine STEP-Datei nimmt, 8 PNG-Ansichten rendert, ein 768-dim DINOv2-Embedding berechnet und das Ergebnis in die Neon-Datenbank schreibt. Kein FastAPI, kein Celery, kein produktionsreifes API. Phase 3 baut den echten Microservice auf diesem validierten Fundament.

</domain>

<decisions>
## Implementation Decisions

### Rendering-Backend

- **D-01:** Primär-Renderer: **pythonOCC + VTK + OSMesa** — reines Software-Rendering ohne Display-Server. Keine DISPLAY-Variable, keine Xvfb-Abhängigkeit, funktioniert in jeder Cloud-Umgebung.
- **D-02:** Fallback wenn VTK+OSMesa im Container nicht läuft: **FreeCAD headless** (`freecadcmd`). Spike dokumentiert den Grund des Wechsels explizit. Phase 3 baut dann auf dem funktionierenden Renderer auf.
- **D-03:** Mesa-Modus: **OSMesa** (kein EGL, kein Xvfb). OSMesa ist der stabilste Pfad für Docker-Headless-Rendering.

### View-Konfiguration

- **D-04:** Anzahl Views: **8 pro STEP-Datei** — 6 orthografische (vorne, hinten, links, rechts, oben, unten) + 2 isometrische (vorne-rechts-oben, hinten-links-unten).
- **D-05:** Hintergrundfarbe: **Weiß (#FFFFFF)** — maximaler Kontrast für dunkle/graue Metallbauteile.
- **D-06:** Ausgabegröße: **Zwei Verwendungsgrößen** — 512×512px für UI-Thumbnails (in S3 gespeichert), 224×224px für DINOv2-Embedding-Input. **Klarstellung (2026-05-08):** `renderer.py` rendert nur 512×512px. `get_embedding()` macht intern ein Pillow-Resize auf 224×224px — kein separates Speichern der 224px-Variante nötig.
- **D-07:** Mean-Pool: Alle 8 Views werden zu einem einzigen 768-dim Embedding gemittelt (architektonisch gesperrt aus Phase 1).

### STEP-Validierung

- **D-08:** Validierungskriterium: **Face-Count < 4 = ungültig**. Weniger als 4 Flächen = kein sinnvoller 3D-Körper. Einfach zu implementieren, einheitenunabhängig.
- **D-09:** Fehlerbehandlung: **`parts.status = 'failed'` + strukturierter Fehlercode** in der Datenbank (z.B. `INVALID_GEOMETRY:face_count=2`). Phase 5 (Admin Catalog) kann Fehlermeldungen daraus anzeigen.

### Spike-Scope und Struktur

- **D-10:** Scope: **Minimales Test-Skript** — kein FastAPI, kein Celery. Ziel: Renderer + Embedding-Pipeline validieren. Phase 3 baut den echten asynchronen Microservice.
- **D-11:** Verzeichnisstruktur: **`worker/`** im Repo-Root. Enthält: `Dockerfile`, `process_step.py`, `requirements.txt`. Phase 3 erweitert dieses Verzeichnis zum vollständigen Microservice.

### Claude's Discretion

- Kamera-Abstand und Zoom für die 8 Views (automatisch aus Bounding-Box ableiten)
- DINOv2-Preprocessing-Details (Normalisierung, Resize-Strategie für 224px)
- Basis-Docker-Image (z.B. `python:3.11-slim` + conda vs. offizielle pythonOCC-Images)
- Dateinamenskonvention für die generierten PNGs im S3 (`{part_id}/view_0.png` … `view_7.png`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Architektur
- `.planning/PROJECT.md` — Core Value, Out-of-Scope-Liste, Constraints (Stack, Dateiformat, Mobile)
- `.planning/REQUIREMENTS.md` — INGEST-03 (betrifft diesen Spike direkt)
- `.planning/ROADMAP.md` — Phase 2 Success Criteria (5 Punkte), Phase-Abhängigkeiten

### Research
- `.planning/research/STACK.md` — pythonOCC/VTK-Rendering-Details, DINOv2-Embedding-Strategie, Pitfalls (Mesa GL in Docker)
- `.planning/research/PITFALLS.md` — C1: STEP-Validierung, C2: Embedding-Asymmetrie

### Phase-1-Kontext (Datenbankschema + Client)
- `.planning/phases/01-database-foundation/01-CONTEXT.md` — Architekturentscheidungen D-01 bis D-11 (Schema, HNSW, RLS, Storage)
- `supabase/migrations/001_parts_schema.sql` — Exaktes Schema gegen das der Worker schreibt
- `src/lib/db.ts` — Neon SQL-Client (`db`) — Worker schreibt direkt via Neon, nicht via Next.js API
- `src/lib/s3.ts` — AWS S3-Client (`s3`, `BUCKET_STEPS`, `BUCKET_THUMBNAILS`) — Worker lädt Thumbnails in S3

### Codebase
- `.planning/codebase/STACK.md` — Bestehende Next.js-Konfiguration (Worker ist Python — separates Verzeichnis)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db.ts` — Neon-Client für Next.js; der Python-Worker braucht eine eigene DB-Verbindung (`psycopg2` oder `asyncpg` direkt mit `DATABASE_URL`)
- `src/lib/s3.ts` — S3-Bucket-Konstanten und -Namen (`BUCKET_STEPS`, `BUCKET_THUMBNAILS`); Python-Worker nutzt `boto3` mit denselben Bucket-Namen
- `supabase/migrations/001_parts_schema.sql` — Exaktes Schema: `parts.embedding vector(768)`, `parts.thumbnail_urls text[]`, `parts.embedding_model text`, `parts.embedding_version text`, `parts.status text`

### Established Patterns
- Status-Tracking: `parts.status` wechselt `pending → processing → ready | failed` — Worker muss beide Übergänge schreiben
- Pfadkonvention S3: `{part_id}/original.step` (STEP-Datei), `{part_id}/view_0.png` … `{part_id}/view_7.png` (Thumbnails) — aus Phase 1 D-09

### Integration Points
- Worker liest STEP-Datei aus S3 (`BUCKET_STEPS/{part_id}/original.step`)
- Worker schreibt 8 PNGs nach S3 (`BUCKET_THUMBNAILS/{part_id}/view_0.png` … `view_7.png`)
- Worker schreibt `embedding`, `embedding_model`, `embedding_version`, `thumbnail_urls`, `status` nach Neon (`parts`-Tabelle)
- Worker liest `DATABASE_URL` und `AWS_*`-Env-Vars aus Umgebung (identisch mit `.env.local.example`)

</code_context>

<specifics>
## Specific Ideas

- Der Spike muss mit einer echten STEP-Datei getestet werden — ein einfaches Beispiel-STEP (z.B. ein Würfel oder eine Schraube) sollte im `worker/testdata/`-Verzeichnis liegen
- VTK+OSMesa-Funktionalität zuerst in einer isolierten `test_renderer.py` validieren, bevor der vollständige Pipeline-Flow implementiert wird
- DINOv2-Modell wird beim ersten Start heruntergeladen (Hugging Face Hub, ~330MB) — Docker-Build sollte das Modell cachen

</specifics>

<deferred>
## Deferred Ideas

- **FastAPI + Celery + Redis Queue** — Phase 3: Ingestion API + Queue. Der Spike validiert nur die Rendering+Embedding-Pipeline.
- **Cloud-Deployment-Test** (Railway/Fly.io) — Phase 3 nach Spike-Validierung. Spike läuft nur lokal.
- **HNSW-Tuning** (m, ef_construction) — Phase 10: Hardening.
- **Retry-Mechanismus für fehlgeschlagene Jobs** — Phase 5: Admin Catalog.

</deferred>

---

*Phase: 2-Python Worker Spike*
*Context gathered: 2026-05-08*
