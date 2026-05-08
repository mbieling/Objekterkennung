---
phase: 03-ingestion-api-queue
verified: 2026-05-08T16:30:00Z
status: human_needed
score: 3/4 must-haves automated-verified
overrides_applied: 0
human_verification:
  - test: "Vollstaendiger E2E-Durchlauf: curl /api/upload/init → S3-PUT → curl /api/upload/confirm → Worker setzt status='ready'"
    expected: "parts.status wechselt von 'pending' → 'processing' → 'ready' in der Datenbank"
    why_human: "Benoetigt laufende Docker-Umgebung (Redis + Worker + S3) sowie eine echte STEP-Datei. Nicht automatisch ohne Docker testbar."
---

# Phase 3: Ingestion API + Queue — Verifikationsbericht

**Phasenziel:** The Next.js upload API accepts STEP files, enforces deduplication, enqueues jobs to the Python worker, and tracks processing status in the database
**Verifiziert:** 2026-05-08T16:30:00Z
**Status:** human_needed
**Re-Verifikation:** Nein — initiale Verifikation

---

## Ziel-Erreichung

### Erfolgskriterien aus ROADMAP.md

| # | Erfolgskriterium | Status | Evidenz |
|---|------------------|--------|---------|
| SC#1 | Zweiter Upload derselben STEP-Datei wird mit Duplikat-Ablehnung + existing_part_id zurueckgewiesen (SHA-256-Pruefung) | VERIFIED | `init/route.ts` Zeile 52: `SELECT id FROM parts WHERE sha256 = ${sha256}` → HTTP 409 `{ error: 'Duplicate file', existing_part_id }`. Vitest-Test gruен. |
| SC#2 | Gueltiger STEP-Upload speichert Datei sofort in Storage und legt `parts`-Eintrag mit status='pending' an | VERIFIED (teilweise) | DB-Insert mit `status='pending'` in `init/route.ts` Zeile 63-70 bestaetigt. Presigned S3-PUT-URL wird generiert (`getSignedUrl`, 900s). Eigentliche S3-Speicherung erfolgt client-seitig — korrekte Architektur gemaess D-01 (Binaerdaten gehen direkt zu S3, nicht durch Next.js). |
| SC#3 | API antwortet mit HTTP 202 innerhalb von 2 Sekunden (bis 100 MB) | VERIFIED (Wiring) | `confirm/route.ts` dispatched via `fetch(workerUrl + '/enqueue')` und antwortet sofort mit HTTP 202 (Zeile 69) — ohne auf Verarbeitung zu warten. Laufzeit-Constraint (2 Sek.) benoetigt Human-Verifikation. |
| SC#4 | Python-Worker nimmt Job auf und aktualisiert status: pending → processing → ready/failed | HUMAN_NEEDED | Wiring bestaetigt: `main.py:/enqueue` → `process_step_task.delay()` → `process()` setzt explizit status='processing' (Zeile 106), 'ready' (Zeile 160), 'failed' (Zeile 179/190). Tatsaechliche Ausfuehrung benoetigt laufenden Docker+Redis+Worker. |

**Automatisiert verifiziert:** 3/4 Erfolgskriterien (SC#4 benoetigt Laufzeit-Verifikation)

---

### Beobachtbare Wahrheiten (aus Plan-must_haves)

| # | Wahrheit | Status | Evidenz |
|---|----------|--------|---------|
| 1 | Ungueltiger part_id (kein UUID-Format) wird in process_step.py mit ValueError abgewiesen, bevor S3 oder DB beruehrt wird | VERIFIED | `UUID_RE = re.compile(...)` Zeile 34, `validate_part_id()` Zeile 40, Aufruf als erste Anweisung in `process()` Zeile 93 — vor `logger.info`. 7 pytest-Tests gruen. |
| 2 | Viewer3d-Ressourcen werden in renderer.py nach jedem Rendering-Aufruf sicher freigegeben | VERIFIED | `finally:` Zeile 101, `viewer.Viewer.Remove()` Zeile 104 in renderer.py. `SetSize(512, 512)` Zeile 86. 2 pytest-Tests gruen (Source-Code-Pruefung). |
| 3 | embedder.py verwendet Patch-Token Mean-Pool (last_hidden_state[:, 1:].mean(dim=1)), NICHT CLS-Token | VERIFIED | Zeile 50: `patch_tokens = outputs.last_hidden_state[:, 1:, :]`, Zeile 51: `mean_embedding = patch_tokens.mean(dim=1)`. Kein `cls_embedding` mehr vorhanden. |
| 4 | pytest-Tests fuer CR-01 und CR-02 sind vorhanden und laufen gruen | VERIFIED | `python3 -m pytest worker/tests/ -v`: 9 passed, 2 skipped (E2E-Stubs mit @pytest.mark.skip — erwartet). |
| 5 | Zweiter Upload derselben SHA-256 wird mit HTTP 409 und existing_part_id abgewiesen | VERIFIED | `init/route.ts`: SHA-256-Lookup vor Insert, HTTP 409 Response. Vitest-Test: "gibt HTTP 409 zurueck wenn SHA-256 bereits in der Datenbank existiert". |
| 6 | Gueltiger Init-Request legt parts-Eintrag mit status='pending' an und gibt presigned_url zurueck | VERIFIED | `init/route.ts` Zeile 65: `status` in INSERT, Zeile 76: `getSignedUrl`. Vitest-Test gruen. |
| 7 | Confirm-Request mit gueltiger part_id loest HTTP-Aufruf auf Worker /enqueue aus | VERIFIED | `confirm/route.ts` Zeile 48: `fetch(workerUrl + '/enqueue', { method: 'POST' })`. Vitest-Test: Worker wurde aufgerufen (mockFetch.toHaveBeenCalledWith). |
| 8 | API antwortet mit HTTP 202 und { part_id, status: 'pending' } | VERIFIED | `confirm/route.ts` Zeile 69: `return NextResponse.json({ part_id, status: 'pending' }, { status: 202 })`. Vitest-Test gruen. |
| 9 | FastAPI /health gibt { status: 'ok' } zurueck | VERIFIED | `main.py` Zeile 33: `def health()` returns `{"status": "ok"}`. Syntax OK. |
| 10 | FastAPI /enqueue schiebt Celery-Task in Redis-Queue | VERIFIED | `main.py` Zeile 51: `process_step_task.delay(part_id_str)`. |
| 11 | VTK_DEFAULT_OPENGL_WINDOW ist erste Zeile in tasks.py (vor allen anderen Imports) | VERIFIED | Zeile 8: `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"` — nach `import os`, vor allen anderen Imports. |
| 12 | docker compose up startet Redis und Worker-Services | HUMAN_NEEDED | `docker-compose.yml` syntaktisch korrekt, `redis:7-alpine` und Worker-Service vorhanden. Tatsaechlicher Start benoetigt Docker. |
| 13 | .dockerignore verhindert dass model_cache/ und .env ins Image kopiert werden | VERIFIED | `worker/.dockerignore` Zeile 5: `model_cache/`, Zeile 15: `.env`. |

---

### Erforderliche Artefakte

| Artefakt | Erwartet | Status | Details |
|----------|----------|--------|---------|
| `worker/process_step.py` | UUID-Validierung + validate_part_id() | VERIFIED | UUID_RE + validate_part_id() vorhanden, erste Anweisung in process() |
| `worker/renderer.py` | try/finally mit viewer.Viewer.Remove() | VERIFIED | try/finally Zeile 101, Remove() Zeile 104, SetSize(512,512) Zeile 86 |
| `worker/embedder.py` | Patch-Token Mean-Pool statt CLS-Token | VERIFIED | last_hidden_state[:, 1:, :].mean(dim=1) — kein CLS-Token mehr |
| `worker/tests/test_process_step.py` | 7 CR-01 Unit-Tests | VERIFIED | 7 Tests gruен in pytest |
| `worker/tests/test_renderer.py` | 2 CR-02 Unit-Tests | VERIFIED | 2 Tests gruен (Source-Code-Pruefung) |
| `worker/tests/test_pipeline_e2e.py` | E2E-Stub mit skip-Marker | VERIFIED | 2 skipped-Tests mit @pytest.mark.skip |
| `src/app/api/upload/init/route.test.ts` | SHA-256-Dedup Tests | VERIFIED | 5 Vitest-Tests gruен, inkl. HTTP 409 Test |
| `src/app/api/upload/confirm/route.test.ts` | Worker-Enqueue Tests | VERIFIED | 4 Vitest-Tests gruен, inkl. HTTP 202 Test |
| `src/app/api/upload/init/route.ts` | POST /api/upload/init | VERIFIED | SHA-256-Dedup + DB-Insert + Presigned URL implementiert |
| `src/app/api/upload/confirm/route.ts` | POST /api/upload/confirm | VERIFIED | Worker-Dispatch + HTTP 202 implementiert |
| `worker/celery_app.py` | Celery-Instanz mit Redis-Broker | VERIFIED | celery_app = Celery, task_acks_late=True, CELERY_BROKER_URL |
| `worker/tasks.py` | process_step_task Celery-Task | VERIFIED | VTK-Guard Zeile 8, process_step_task mit max_retries=0 |
| `worker/main.py` | FastAPI /health + /enqueue | VERIFIED | app = FastAPI(), /health, /enqueue (status_code=202), UUID4-Validierung |
| `worker/requirements.txt` | fastapi, uvicorn, celery, redis | VERIFIED | Alle vier Pakete in requirements.txt |
| `docker-compose.yml` | Redis + Worker mit Health-Checks | VERIFIED | redis:7-alpine, service_healthy, env_file |
| `worker/.dockerignore` | model_cache/ und .env ausgeschlossen | VERIFIED | Beide Eintraege vorhanden |
| `.env.local.example` | WORKER_URL + UPSTASH_REDIS_URL | VERIFIED | Beide Variablen mit Kommentaren vorhanden |
| `worker/.env.example` | CELERY_BROKER_URL + CELERY_RESULT_BACKEND | VERIFIED | Beide Variablen vorhanden |

---

### Key-Link-Verifikation

| Von | Nach | Via | Status | Details |
|-----|------|-----|--------|---------|
| `process_step.py:process()` | `validate_part_id()` | erste Anweisung in process() | WIRED | Zeile 93: `part_id = validate_part_id(part_id)` — vor logger.info |
| `renderer.py:render_views()` | `viewer.Viewer.Remove()` | finally-Block | WIRED | Zeile 101: `finally:`, Zeile 104: `viewer.Viewer.Remove()` |
| `embedder.py:get_embedding()` | Patch-Token Mean-Pool | last_hidden_state[:, 1:].mean(dim=1) | WIRED | Zeile 50-51 |
| `init/route.ts` | Neon DB (parts) | `db\`SELECT sha256\`` + `db\`INSERT INTO parts\`` | WIRED | Zeile 52: SELECT sha256, Zeile 63: INSERT INTO parts |
| `init/route.ts` | AWS S3 (BUCKET_STEPS) | getSignedUrl(s3, PutObjectCommand) | WIRED | Zeile 76-85 |
| `confirm/route.ts` | Worker FastAPI /enqueue | fetch(WORKER_URL + '/enqueue') | WIRED | Zeile 45-48 |
| `confirm/route.ts` | Neon DB (parts) | `db\`SELECT id FROM parts WHERE id\`` | WIRED | Zeile 37 |
| `main.py:/enqueue` | `tasks.py:process_step_task` | process_step_task.delay() | WIRED | Zeile 51 |
| `tasks.py:process_step_task` | `process_step.py:process()` | from worker.process_step import process | WIRED | Zeile 12 |
| `celery_app.py` | Redis (CELERY_BROKER_URL) | Celery(broker=BROKER_URL) | WIRED | Zeile 10 |
| `docker-compose.yml:worker` | `worker/Dockerfile` | build: context: ./worker | WIRED | Zeile 31 |
| `docker-compose.yml:worker` | redis service | depends_on: condition: service_healthy | WIRED | Zeile 45-47 |

---

### Anforderungsabdeckung

| Anforderung | Quell-Plan | Beschreibung | Status | Evidenz |
|-------------|------------|--------------|--------|---------|
| INGEST-04 | 03-01 bis 03-06 (alle Plaene) | System verhindert doppelte Uploads per SHA-256-Deduplizierung | SATISFIED | `init/route.ts` prueft SHA-256 vor Insert. HTTP 409 bei Duplikat. 5 Vitest-Tests gruен. REQUIREMENTS.md markiert als Complete (03-03). |

---

### Verhaltenspruefungen (Behavioral Spot-Checks)

| Verhalten | Kommando | Ergebnis | Status |
|-----------|----------|----------|--------|
| Vitest Upload-Tests gruен | `npm test -- --run src/app/api/upload/` | 2 Testdateien, 9 Tests gruен | PASS |
| pytest Worker-Tests gruен | `python3 -m pytest worker/tests/ -v` | 9 passed, 2 skipped (E2E erwartet) | PASS |
| Python-Syntax celery_app.py | `python3 -m py_compile worker/celery_app.py` | OK | PASS |
| Python-Syntax tasks.py | `python3 -m py_compile worker/tasks.py` | OK | PASS |
| Python-Syntax main.py | `python3 -m py_compile worker/main.py` | OK | PASS |
| Python-Syntax process_step.py | `python3 -m py_compile worker/process_step.py` | OK | PASS |
| docker compose E2E | docker compose up (nicht ausgefuehrt — kein Docker) | Nicht testbar ohne Docker | SKIP |

---

### Anti-Pattern-Pruefung

Keine Blocker-Anti-Pattern gefunden:
- Keine TODO/FIXME/PLACEHOLDER in Implementierungsdateien
- Keine leeren Handler (`return null`, `return {}`, `return []`) in Produktionscode
- E2E-Stubs (`test_pipeline_e2e.py`) sind korrekt mit `@pytest.mark.skip` markiert — kein falscher Produktionscode
- `NEXT_PUBLIC_`-Prefix nicht in server-only Routen verwendet
- `use client` nicht in API-Routen

---

### Menschliche Verifikation erforderlich

#### 1. E2E-Pipeline-Durchlauf: pending → processing → ready

**Test:** Docker Compose starten (`docker compose up -d`), `worker/.env` mit DATABASE_URL und AWS_*-Variablen belegen, dann:
1. `curl -X POST http://localhost:3000/api/upload/init -H "Content-Type: application/json" -d '{"name":"Test","sha256":"<64-hex>","original_filename":"test.step","file_size_bytes":1024}'` → part_id und presigned_url erhalten
2. STEP-Datei direkt via PUT an presigned_url hochladen
3. `curl -X POST http://localhost:3000/api/upload/confirm -H "Content-Type: application/json" -d '{"part_id":"<part_id>"}'` → HTTP 202 erwarten
4. In der Datenbank pruefen: `SELECT status FROM parts WHERE id = '<part_id>'` zeigt zunaechst 'processing', dann 'ready' oder 'failed'

**Erwartet:** parts.status wechselt von 'pending' → 'processing' → 'ready' (oder 'failed' bei ungueltigem STEP). Worker setzt alle Statusuebergaenge in der DB.

**Warum menschlich:** Benoetigt laufenden Docker-Stack (Redis + Worker), echte Neon DB-Verbindung, konfiguriertes S3-Bucket mit CORS-Regeln. Nicht automatisch ohne Docker testbar.

#### 2. S3-CORS und Presigned URL

**Test:** Nach `curl /api/upload/init` die zurueckgegebene presigned_url mit `curl -X PUT --upload-file test.step "<presigned_url>"` aufrufen.

**Erwartet:** HTTP 200 von S3. STEP-Datei erscheint im S3-Bucket unter `{part_id}/original.step`.

**Warum menschlich:** Benoetigt konfigurierte S3-CORS-Regel fuer PUT-Methode (`AllowedMethods: ["PUT"]`) und echten AWS-Zugriff.

#### 3. HTTP 202 Antwortzeit unter 2 Sekunden bei 100-MB-Datei

**Test:** Init-Request mit `file_size_bytes: 104857600` (100 MB), dann Confirm-Request timing messen.

**Erwartet:** Confirm-Route antwortet in unter 2 Sekunden, da Worker asynchron arbeitet (Celery-Queue).

**Warum menschlich:** Erfordert vollstaendigen Stack mit messbarer Netzwerklast.

---

### Lueckenzusammenfassung

Es wurden **keine Blocker-Luecken** gefunden. Alle Implementierungsartefakte existieren, sind substantiell (keine Stubs) und vollstaendig verdrahtet. Die Vitest- und pytest-Testsuite ist gruен.

Der Status `human_needed` ergibt sich ausschliesslich aus Laufzeit-Verhalten (SC#4 — Worker-Statusuebergaenge und E2E-Durchlauf), das ohne Docker-Infrastruktur nicht programmatisch verifizierbar ist. Die Codebase-Evidenz fuer die korrekte Implementierung ist stark.

---

_Verifiziert: 2026-05-08T16:30:00Z_
_Verifizierer: Claude (gsd-verifier)_
