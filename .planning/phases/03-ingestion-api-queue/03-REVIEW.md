---
phase: 03-ingestion-api-queue
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - .env.local.example
  - docker-compose.yml
  - src/app/api/upload/confirm/route.test.ts
  - src/app/api/upload/confirm/route.ts
  - src/app/api/upload/init/route.test.ts
  - src/app/api/upload/init/route.ts
  - worker/.dockerignore
  - worker/.env.example
  - worker/celery_app.py
  - worker/embedder.py
  - worker/main.py
  - worker/process_step.py
  - worker/renderer.py
  - worker/requirements.txt
  - worker/tasks.py
  - worker/tests/__init__.py
  - worker/tests/conftest.py
  - worker/tests/test_pipeline_e2e.py
  - worker/tests/test_process_step.py
  - worker/tests/test_renderer.py
findings:
  critical: 3
  warning: 6
  info: 4
  total: 13
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Dieser Review umfasst die vollständige Ingestion-API (Next.js) und den Python Worker (FastAPI + Celery). Die Grundarchitektur ist solide: SHA-256-Deduplizierung, UUID-Validierung als Path-Traversal-Schutz, und Presigned-URL-Flow sind korrekt implementiert.

Es wurden 3 kritische Probleme identifiziert: (1) Die Confirm-Route prüft **nicht**, ob der aufrufende Nutzer berechtigt ist, den Part zu bestätigen (fehlende Authentifizierung), (2) `embedder.py` lädt das DINOv2-Modell beim **Modulimport** — das blockiert jeden Celery-Worker-Start für ~3s und crasht, wenn kein GPU/CPU vorhanden ist, und (3) die `process_step.py`-Pipeline setzt den Status bei einem S3-Upload-Fehler für einzelne PNGs **nicht** auf `failed`, weil der Fehler im allgemeinen `except`-Block erst nach abgeschlossenen Uploads auftritt.

---

## Critical Issues

### CR-01: Fehlende Authentifizierung in beiden Upload-Routen

**File:** `src/app/api/upload/init/route.ts:31`, `src/app/api/upload/confirm/route.ts:16`
**Issue:** Beide API-Routen (`/api/upload/init` und `/api/upload/confirm`) prüfen **keine Nutzer-Session**. Jeder nicht-authentifizierte Angreifer kann beliebige Einträge in die `parts`-Tabelle schreiben (`/init`) und anschließend Celery-Jobs auslösen (`/confirm`). Der Worker-Dienst ist damit uneingeschränkt aufrufbar. Das Security-Rule aus `.claude/rules/security.md` schreibt vor: "Always verify authentication before processing API requests."

Die `confirm`-Route prüft zwar, ob die `part_id` in der DB existiert, aber nicht ob der authentifizierte Nutzer der Eigentümer dieses Parts ist — ein anderer Nutzer könnte fremde Part-IDs confirmen und so beliebig viele Worker-Jobs auslösen.

**Fix:**
```typescript
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... rest of handler, filter DB queries by user.id
}
```

---

### CR-02: Modell-Import blockiert Celery-Worker-Start (embedder.py)

**File:** `worker/embedder.py:17-21`
**Issue:** `_processor` und `_model` werden beim **Modulimport** geladen — also beim `import embedder` in `process_step.py`, welches wiederum von `tasks.py` beim **Celery-Worker-Start** importiert wird. Das bedeutet:

1. Der Celery-Worker kann erst starten, nachdem ~3s Modell-Ladezeit vergangen sind.
2. Falls `TRANSFORMERS_CACHE` nicht korrekt gemountet ist, wird ein HuggingFace-Download beim Worker-Start versucht — nicht beim ersten Task.
3. Wenn der Download fehlschlägt, startet **der komplette Worker nicht** statt nur einzelne Tasks zu scheitern.
4. Bei mehreren Celery-Worker-Prozessen (Concurrency > 1) wird das Modell pro Prozess geladen — kein Shared Memory.

Der Kommentar "Einmaliges Laden beim Modulimport" ist falsch: es lädt pro Worker-**Prozess**, nicht pro Deployment.

**Fix:** Lazy-Loading mit einem Modul-Level-Singleton:
```python
_processor = None
_model = None

def _load_model():
    global _processor, _model
    if _model is None:
        logger.info(f"Lade DINOv2-Modell: {_MODEL_NAME}")
        _processor = AutoImageProcessor.from_pretrained(_MODEL_NAME)
        _model = AutoModel.from_pretrained(_MODEL_NAME)
        _model.eval()
        logger.info("DINOv2-Modell geladen")

def get_embedding(image_path: str) -> np.ndarray:
    _load_model()
    # ... rest unchanged
```

---

### CR-03: S3-Upload-Fehler bei einzelnem PNG setzt Status nicht korrekt auf 'failed'

**File:** `worker/process_step.py:131-144`
**Issue:** Die PNG-Upload-Schleife (Schritt 5) ruft `s3.upload_fileobj()` auf, ohne den Rückgabewert zu prüfen und ohne individuelle Fehlerbehandlung. Wenn `upload_fileobj` für einen der 8 Uploads einen `ClientError` wirft (z.B. Bucket nicht erreichbar, Berechtigungsfehler), wird die Exception im äußeren `except Exception`-Block gefangen, der korrekt `status='failed'` setzt. Das ist grundsätzlich korrekt.

**Das eigentliche Problem:** `thumbnail_urls` wird schon vor dem DB-Update (Schritt 7) befüllt, aber nach einem Teilfehler (z.B. 5 von 8 Uploads erfolgreich) enthält `thumbnail_urls` nur die ersten 5 URLs. Bei einem Retry würde Schritt 7 nie erreicht, der Part bleibt auf `failed` — aber S3 enthält bereits 5 verwaiste Thumbnails ohne zugehörigen DB-Eintrag. Das ist kein Datenverlust, aber ein S3-Aufräum-Problem.

Kritischer: Der DB-Commit für `status='processing'` (Schritt 1, Zeile 107) wird ausgeführt, aber wenn `conn` danach durch einen Verbindungsabbruch zu einem zombie-artigen Zustand führt, schlägt der Fehler-Handler in `except Exception` (Zeile 185) ebenfalls fehl — der Part bleibt auf `processing` statt `failed`.

**Fix:** Den DB-Cursor aus dem `except`-Block heraushalten und separat speichern:
```python
cur = conn.cursor()  # außerhalb des try-Blocks definieren
try:
    set_status(cur, part_id, "processing")
    conn.commit()
    # ...
except Exception as e:
    logger.exception(...)
    if conn and not conn.closed:
        try:
            conn.rollback()  # Rollback vor Status-Update
            cur2 = conn.cursor()
            set_status(cur2, part_id, "failed")
            conn.commit()
        except Exception as db_err:
            logger.exception(...)
    raise
```

---

## Warnings

### WR-01: tasks.py verschluckt Exceptions — Celery markiert fehlgeschlagene Tasks als SUCCESS

**File:** `worker/tasks.py:35-39`
**Issue:** Der `except`-Block in `process_step_task` fängt alle Exceptions ab und loggt sie, ohne zu re-raisen. Der Kommentar erklärt die Absicht: Celery soll den Task als `SUCCESS` markieren, weil der Fehler bereits in der DB dokumentiert ist. Das ist aber problematisch:

- Celery-Monitoring-Tools (Flower, Datadog) zeigen alle Tasks als erfolgreich, obwohl Fehler aufgetreten sind.
- `task_acks_late=True` in `celery_app.py` entfernt den Task aus der Queue erst nach Abschluss — bei einem `SUCCESS` wird der Task nicht erneut versucht, auch wenn die DB nicht erreichbar war.
- Ein Crash des Worker-Prozesses selbst (OOM, SIGKILL) wird als `FAILURE` erscheinen, obwohl er eigentlich silent sein sollte — inkonsistentes Verhalten.

**Fix:** Celery-eigenen Fehler-Mechanismus nutzen:
```python
@celery_app.task(name="worker.tasks.process_step", bind=True, max_retries=0)
def process_step_task(self, part_id: str) -> dict:
    logger.info(f"[{part_id}] Celery-Task gestartet")
    process(part_id)  # wirft bei Fehler — Celery markiert als FAILURE
    logger.info(f"[{part_id}] Celery-Task abgeschlossen")
    return {"status": "ok", "part_id": part_id}
```

---

### WR-02: Kein Authentifizierungsschutz auf dem Worker-FastAPI-Endpunkt `/enqueue`

**File:** `worker/main.py:42-52`
**Issue:** Der `/enqueue`-Endpunkt akzeptiert beliebige Anfragen ohne jede Authentifizierung. Obwohl der Worker typischerweise im internen Docker-Netzwerk läuft, fehlt jede Schutzschicht für den Fall, dass der Port versehentlich exponiert wird oder in einer Cloud-Umgebung erreichbar ist. Im `docker-compose.yml` ist Port 8000 nach außen gemappt (`"8000:8000"`), was bedeutet, dass der `/enqueue`-Endpunkt lokal erreichbar ist.

**Fix:** Mindestens einen statischen Bearer-Token als Shared Secret zwischen Next.js und Worker einführen:
```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os

WORKER_SECRET = os.environ.get("WORKER_SECRET")
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    if not WORKER_SECRET or credentials.credentials != WORKER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/enqueue", status_code=202)
def enqueue(req: EnqueueRequest, _=Depends(verify_token)) -> dict:
    ...
```

---

### WR-03: `step_file_path` wird als Leerstring `''` in DB geschrieben

**File:** `src/app/api/upload/init/route.ts:69`
**Issue:** `step_file_path` wird mit `${''}` (Leerstring) eingefügt. Das ist semantisch falsch: der eigentliche S3-Pfad ist `${part.id}/original.step`, aber der ist erst nach dem DB-Insert bekannt. Der Leerstring bleibt dauerhaft in der DB, wenn der Worker die Spalte nicht überschreibt. Im Worker (`process_step.py`) wird `step_file_path` nie aktualisiert — Schritt 7 schreibt nur `embedding`, `embedding_model`, `embedding_version`, `thumbnail_urls` und `status`.

Konsequenz: `parts.step_file_path` ist nach Abschluss der Pipeline immer noch `''` und kann nicht genutzt werden, um die Originaldatei zu lokalisieren.

**Fix:** Entweder den S3-Schlüssel vor dem Insert berechnen (via generierte UUID), oder `step_file_path` im Worker beim Status-Update mit setzen:
```sql
UPDATE parts SET
    step_file_path = %s,
    embedding = %s,
    ...
WHERE id = %s
```

---

### WR-04: `validate_geometry` prüft nur Bounding-Box-Volumen, nicht ob BBox leer/uninitialisiert ist

**File:** `worker/renderer.py:63-70`
**Issue:** `brepbndlib_Add` befüllt die `Bnd_Box`. Wenn die Shape komplett leer ist (kein Solid, nur eine Compound ohne Geometrie), kann `bbox.Get()` je nach OCC-Version einen `Standard_ConstructionError` oder nicht-initialisierte Werte zurückgeben. Die Berechnung `volume = (x_max - x_min) * ...` würde dann mit `nan` oder einem Stack-Fehler scheitern, anstatt die strukturierte `ValueError("INVALID_GEOMETRY:empty_bounding_box")` zu werfen.

**Fix:** Prüfen ob die Box leer ist via `bbox.IsVoid()` bevor `.Get()` aufgerufen wird:
```python
bbox = Bnd_Box()
brepbndlib_Add(shape, bbox)
if bbox.IsVoid():
    raise ValueError("INVALID_GEOMETRY:empty_bounding_box")
x_min, y_min, z_min, x_max, y_max, z_max = bbox.Get()
volume = (x_max - x_min) * (y_max - y_min) * (z_max - z_min)
if volume < 1e-6:
    raise ValueError("INVALID_GEOMETRY:empty_bounding_box")
```

---

### WR-05: `conftest.py` mockt `boto3.client` global, aber `process_step.py` verwendet `get_s3_client()`

**File:** `worker/tests/conftest.py:9-13`
**Issue:** Der `mock_s3`-Fixture patcht `boto3.client` global. `process_step.py` importiert `boto3` direkt und ruft `boto3.client(...)` in der `get_s3_client()`-Funktion auf. Der Patch funktioniert korrekt. **Aber:** `process_step.py` importiert auch `renderer` und `embedder` beim Modulimport — wenn diese OCC- oder torch-Dependencies nicht verfügbar sind, scheitert bereits das Importieren des Moduls, bevor der Fixture greifen kann. Der `conftest.py` bietet keinen Schutz dagegen.

Da `test_process_step.py` dieses Problem durch direkte Regex-Kopie umgeht, aber `conftest.py` für zukünftige Tests gedacht ist, die `process_step.process()` direkt importieren werden, führt das zu schwer debuggbaren `ImportError`-Fehlern.

**Fix:** Dokumentation im `conftest.py` ergänzen, dass direktes Importieren von `process_step` nur in Docker-Umgebungen möglich ist. Alternativ: `mock_db` und `mock_s3` als `autouse=False`-Fixtures behalten und in der Test-Dokumentation explizit auf Docker-Anforderung hinweisen.

---

### WR-06: `mean_pool()` in embedder.py benutzt `assert` zur Eingabevalidierung in Produktionscode

**File:** `worker/embedder.py:66`
**Issue:** `assert len(embeddings) > 0, "Leere Embedding-Liste"` und `assert pooled.shape == (768,)` sind `assert`-Statements. In Python werden `assert`-Statements bei `python -O` (Optimierungs-Flag) komplett wegoptimiert. Celery und uvicorn starten Python ohne `-O`, aber das ist ein implizites Sicherheitsnetz, nicht eine explizite Garantie. Wenn die Assertions wegfallen, wirft `np.stack([])` einen kryptischen numpy-Fehler statt einer klaren Exception.

**Fix:**
```python
if len(embeddings) == 0:
    raise ValueError("Leere Embedding-Liste — mindestens ein Embedding erforderlich")
stacked = np.stack(embeddings)
pooled = np.mean(stacked, axis=0)
if pooled.shape != (768,):
    raise ValueError(f"Unerwartete Pool-Shape: {pooled.shape}, erwartet (768,)")
```

---

## Info

### IN-01: `docker-compose.yml` — FastAPI und Celery im gleichen Container, kein Graceful-Shutdown

**File:** `docker-compose.yml:35-37`
**Issue:** Der `command` startet uvicorn im Hintergrund (`&`) und Celery im Vordergrund. Wenn Docker den Container stoppt (`SIGTERM`), erhält nur der Celery-Prozess das Signal. uvicorn wird nicht sauber beendet, was zu Verbindungsfehlern für laufende HTTP-Anfragen führen kann. Der Kommentar "Für Produktion: separate Services empfohlen" erklärt dies, aber für lokale Entwicklung wäre ein Supervisor (z.B. `supervisord`) robuster.

**Fix:** Kein sofortiger Handlungsbedarf für Entwicklungsumgebung — bei Produktions-Deployment in eigene Services aufteilen (bereits kommentiert). Optional: `trap` in der Shell-Command für sauberes Signal-Forwarding.

---

### IN-02: `renderer.py` — `render_views()` gibt Pfade zurück, nicht Erfolgs-/Fehlerinformationen

**File:** `worker/renderer.py:74-108`
**Issue:** `render_views()` gibt eine Liste von Pfaden zurück, ohne zu prüfen ob die exportierten PNG-Dateien tatsächlich existieren und nicht leer sind. `viewer.ExportToImage(path)` gibt keinen expliziten Boolean zurück (OCC-API-Design), und bei einem Silent-Rendering-Fehler (z.B. zu kleine BBox, degenerate Geometrie) könnte eine PNG erzeugt werden, die nur weißen Hintergrund ohne sichtbare Geometrie enthält. Dies würde zum DINOv2-Embedding eines weißen Bildes führen, ohne Fehler auszulösen.

**Fix:** Nach dem Export prüfen ob die Datei existiert und eine Mindestgröße hat:
```python
viewer.ExportToImage(path)
if not os.path.exists(path) or os.path.getsize(path) < 1000:
    raise ValueError(f"Rendering fehlgeschlagen für View {i} ({name}): leere PNG")
paths.append(path)
```

---

### IN-03: `test_process_step.py` dupliziert `validate_part_id`-Logik statt die Originale zu testen

**File:** `worker/tests/test_process_step.py:16-26`
**Issue:** Der Kommentar "Lokale Kopie für Tests — identisch mit worker/process_step.py:validate_part_id()" beschreibt das Problem selbst: der Test testet nicht die tatsächliche Funktion in `process_step.py`, sondern eine Kopie davon. Wenn die Produktions-Funktion geändert wird (z.B. andere Regex-Flags), schlagen die Tests nicht fehl — sie testen weiterhin die alte Kopie.

Dies ist eine zulässige Umgehung des OCC-Importproblems (ohne Docker nicht importierbar), aber die Einschränkung sollte explizit als bekanntes Problem in einem Kommentar oder `pytest.ini`-Marker dokumentiert werden.

---

### IN-04: `sha256` in Init-Route wird nur format-validiert, nicht verifiziert

**File:** `src/app/api/upload/init/route.ts:17-21`
**Issue:** Das Zod-Schema prüft dass `sha256` 64 Hex-Zeichen hat, aber der tatsächliche SHA-256-Hash der hochzuladenden Datei wird vom Client geliefert und nie serverseitig verifiziert. Ein Client könnte einen falschen Hash senden, Duplikat-Prüfungen umgehen (falscher Hash → keine 409-Antwort) oder identische Hashes für verschiedene Dateien angeben.

Dies ist ein bekanntes Trade-off im Client-Side-Hashing-Pattern und kann in Phase 1 akzeptabel sein — sollte aber als explizites Non-Ziel dokumentiert werden, bevor multi-tenant Features implementiert werden.

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
