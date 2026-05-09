# Phase 6: Search Pipeline - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Die Search-Pipeline nimmt ein Foto entgegen, berechnet per DINOv2 ein 768-dim Embedding, fragt pgvector (cosine similarity) ab und gibt eine gerankete Trefferliste zurück — alles innerhalb einer synchronen HTTP-Anfrage. Kein UI (kommt in Phase 7/8). Keine Kamera-Integration (Phase 7). Keine Ergebnisdarstellung (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Anfrage-Modus (Sync vs. Async)

- **D-01:** **Synchron** — POST /api/search wartet auf das vollständige Ergebnis (DINOv2-Embedding + pgvector-Query). Kein Job-ID-Polling.
- **D-02:** **Timeout: 30 Sekunden** — ausreichend Puffer für Cold-Start des Python Workers auf Railway. Vercel Next.js API-Timeout ist standardmäßig 30s.

### Foto-Transfer zum Python Worker

- **D-03:** **Über S3 (bewährtes Muster)** — das hochgeladene Bild wird temporär in S3 (`parts-thumbnails` oder ein dedizierter `search-temp`-Bucket) gespeichert, der S3-Key wird an den Worker-`/embed`-Endpunkt übergeben. Konsistent mit dem STEP-Workflow. Cleanup nach Embedding-Berechnung.
- **D-04:** Der Python Worker braucht einen neuen synchronen `/embed`-Endpunkt (FastAPI, kein Celery) — nimmt S3-Key entgegen, lädt Bild, berechnet DINOv2-Embedding, gibt `{embedding: [768 floats]}` zurück.

### Threshold & Limit

- **D-05:** **Als optionale Query-Parameter** — `POST /api/search?threshold=0.7&limit=10`. Falls weggelassen, werden die Defaults verwendet.
- **D-06:** **Default threshold: 0.7** — konservativer Ausgangswert; DINOv2-Ähnlichkeit zwischen Kamerafoto und STEP-Rendering liegt typisch bei 0.55–0.80.
- **D-07:** **Default limit: 10** — überschaubar für erste Tests; per Query-Parameter auf bis zu 50 konfigurierbar.
- **D-08:** Phase 8 sendet diese Werte aus dem UI als Query-Parameter — kein API-Refactoring nötig.

### Response-Shape

- **D-09:** **Score als 0–1 Float** — cosine similarity direkt aus pgvector (z.B. `0.73`). Phase 8 rechnet UI-seitig in Prozent um. Keine Rundungsverluste.
- **D-10:** **Keine Thumbnail-URL in der Search-Response** — Phase 7/8 lädt Thumbnails lazy via bereits implementiertem `GET /api/parts/[id]/thumbnail` nach. Konsistent mit Phase-5-Pattern (CatalogTable).
- **D-11:** **Response-Shape:**
  ```json
  {
    "results": [
      {
        "id": "uuid",
        "name": "string",
        "part_number": "string | null",
        "project": "string | null",
        "status": "ready",
        "similarity": 0.73,
        "created_at": "ISO 8601"
      }
    ],
    "query": {
      "threshold": 0.7,
      "limit": 10,
      "results_count": 3
    }
  }
  ```
- **D-12:** Filter: `WHERE status = 'ready'` — kein `is_archived`-Boolean (Phase-5-Downstream-Constraint). Archivierte Teile (`status='archived'`) erscheinen nicht in Suchergebnissen.

### Claude's Discretion

- Genaue Bucket-Entscheidung für temporäre Suchbilder: `parts-thumbnails` (Wiederverwendung) vs. dedizierter `search-temp`-Bucket — Claude entscheidet basierend auf S3-Kosten und Cleanup-Komplexität
- Temp-File-Naming-Schema in S3 (z.B. `search-temp/{uuid}.jpg`)
- Zod-Validierung für Query-Parameter (threshold: 0.0–1.0, limit: 1–50)
- HTTP-Methode für `/api/search`: POST (Bild als multipart/form-data Body) — Claude entscheidet Dateinamen-Konvention

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Out-of-Scope-Liste, Constraints
- `.planning/REQUIREMENTS.md` — SEARCH-03, SEARCH-04, SEARCH-05 (vollständige Anforderungstexte)
- `.planning/ROADMAP.md` — Phase 6 Success Criteria (4 Punkte), Phase 6 Depends on Phase 2

### Phase 2 — Python Worker (direkte Abhängigkeit)
- `worker/main.py` — FastAPI-App mit /health + /enqueue. Hier muss /embed hinzugefügt werden.
- `worker/embedder.py` — DINOv2 ViT-B/14, `get_embedding(image_path)` → np.ndarray (768,). Preprocessing: resize 224×224, Patch-Mean-Pool.
- `worker/tasks.py` — Celery-Task-Pattern (für /embed: KEIN Celery, synchroner FastAPI-Endpunkt)

### Phase 3 — Bestehende Infrastruktur
- `src/app/api/upload/init/route.ts` — S3-Presigned-URL-Pattern + db-Tagged-Template-Muster
- `src/app/api/upload/confirm/route.ts` — Worker-HTTP-Call-Pattern (für /embed-Aufruf analog)
- `src/lib/s3.ts` — S3-Client (für temporären Bild-Upload vor Worker-Aufruf)
- `src/lib/db.ts` — Neon-Client (`db` Tagged-Template) — für pgvector-Query

### Phase 4 — Thumbnail-Endpunkt (wird von Phase 7/8 nach Suche aufgerufen)
- `src/app/api/parts/[id]/thumbnail/route.ts` — Presigned-URL (separat nachladen, nicht in Search-Response)

### Phase 5 — Downstream-Constraint
- `.planning/phases/05-admin-catalog/05-CONTEXT.md` D-10: `WHERE status = 'ready'` — kein `is_archived`-Boolean-Filter

### Infrastruktur
- `src/lib/s3.ts` — S3-Client mit BUCKET_STEPS, BUCKET_THUMBNAILS (Temp-Upload braucht ggf. dritten Bucket oder BUCKET_THUMBNAILS)

</canonical_refs>

<code_context>
## Existing Code Insights

### Wiederverwendbare Assets
- `worker/embedder.py::get_embedding(image_path)` — direkt wiederverwendbar für Suchbild-Embedding (identischer Aufruf wie bei STEP-Verarbeitung)
- `src/lib/s3.ts` — S3-Client bereits konfiguriert (forcePathStyle, DECOMPOSEDS3_ENDPOINT)
- `src/lib/db.ts` — `db` Tagged-Template für pgvector cosine query (`<=>` Operator)
- `src/app/api/upload/confirm/route.ts` — Worker-HTTP-Call-Pattern (fetch + error handling) für /embed-Aufruf

### Etablierte Muster
- UUID-Validierung als erste Operation in allen Route-Handlern (aus Phase 3/4/5)
- `z.string().uuid()` via Zod für params-Validierung
- Server-only Env-Vars: kein `NEXT_PUBLIC_` für WORKER_URL, DB-Credentials, S3-Keys
- Pydantic UUID4 im FastAPI-Worker für zweite Validierungsebene

### Integration Points
- **Worker /embed**: Neuer sync FastAPI-Endpunkt in `worker/main.py` — DINOv2 bereits geladen (`_model`, `_processor` in embedder.py als Modul-Globals)
- **pgvector cosine query**: `SELECT id, name, ... , 1 - (embedding <=> $1::vector) AS similarity FROM parts WHERE status = 'ready' ORDER BY embedding <=> $1::vector LIMIT $2` — HNSW-Index auf embedding-Spalte bereits aktiv (Phase 1)
- **S3 temp cleanup**: DeleteObjectCommand nach Embedding-Berechnung (Phase 5 hat DeleteObjectsCommand-Pattern)

</code_context>

<specifics>
## Specific Ideas

- Bewährtes Muster aus Phase 3/5: S3 für Dateitransfer statt direktem HTTP-Multipart — konsistent halten
- Score als 0–1 Float in API, Prozentdarstellung erst in Phase 8 UI-seitig

</specifics>

<deferred>
## Deferred Ideas

- Asynchrone Suche mit Job-ID-Polling — deutlich komplexer, nicht nötig für <5s Latenz
- Thumbnail-URL inline in Search-Response — vermeidet Roundtrip, aber Presigned-URL-Ablauf-Problem; Phase 8 löst das mit lazy load
- Suchhistorie (SEARCH-V2-01) — v2-Anforderung

</deferred>

---

*Phase: 6-Search Pipeline*
*Context gathered: 2026-05-09*
