# Phase 3: Ingestion API + Queue — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 9 (7 neu, 2 Bugfixes)
**Analogs found:** 9 / 9

---

## File Classification

| Neue/geänderte Datei | Rolle | Data Flow | Nächster Analog | Match-Qualität |
|----------------------|-------|-----------|-----------------|----------------|
| `src/app/api/upload/init/route.ts` | api-route | request-response + CRUD | `src/lib/db.ts` + `src/lib/s3.ts` | role-match (kein bestehender API-Route-Analog) |
| `src/app/api/upload/confirm/route.ts` | api-route | request-response + CRUD | `src/app/api/upload/init/route.ts` (neu) | role-match |
| `src/app/api/upload/init/route.test.ts` | test | unit | `src/lib/db.test.ts` | role-match |
| `src/app/api/upload/confirm/route.test.ts` | test | unit | `src/lib/db.test.ts` | role-match |
| `worker/celery_app.py` | config | event-driven | `worker/process_step.py` (Env-Var-Muster) | partial-match |
| `worker/tasks.py` | service | event-driven | `worker/process_step.py` | role-match |
| `worker/main.py` | api-route (FastAPI) | request-response | `worker/process_step.py` | partial-match |
| `worker/process_step.py` | service | CRUD + file-I/O | sich selbst (CR-01 Fix) | exact |
| `worker/renderer.py` | service | file-I/O | sich selbst (CR-02 Fix) | exact |
| `docker-compose.yml` | config | — | `worker/Dockerfile` (Build-Muster) | partial-match |
| `.env.local.example` | config | — | `.env.local.example` (bestehend) | exact |

---

## Pattern Assignments

### `src/app/api/upload/init/route.ts` (api-route, request-response + CRUD)

**Primäre Analogs:** `src/lib/db.ts` (Zeilen 1–13) und `src/lib/s3.ts` (Zeilen 1–16)

**Imports-Muster** — aus `src/lib/db.ts` Zeilen 1–13 und `src/lib/s3.ts` Zeilen 1–16:
```typescript
// Alle Server-only Imports — KEIN "use client"
import { neon } from '@neondatabase/serverless'    // db.ts: Tagged-template SQL-Client
import { S3Client } from '@aws-sdk/client-s3'      // s3.ts: AWS SDK v3, modular
// NEU für init/route.ts:
import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3, BUCKET_STEPS } from '@/lib/s3'        // @ = src/ (tsconfig alias)
import { db } from '@/lib/db'
import { z } from 'zod'
```

**Env-Var-Muster (server-only)** — aus `src/lib/s3.ts` Zeilen 6–16:
```typescript
// Pattern: process.env.VAR! — Non-null-Assertion, KEIN NEXT_PUBLIC_-Prefix
export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})
export const BUCKET_STEPS = process.env.AWS_S3_BUCKET_STEPS!
```

**DB-Abfrage-Muster (Tagged Template Literal)** — aus `src/lib/db.test.ts` Zeilen 14–16:
```typescript
// Pattern: db`SQL ${param}` — typsicher, Parameter-Interpolation via Template Literal
const rows = await db`SELECT id FROM parts LIMIT 1`
// Mit Parametern: db`SELECT id FROM parts WHERE sha256 = ${sha256} LIMIT 1`
// Mit INSERT: db`INSERT INTO parts (...) VALUES (...) RETURNING id`
```

**Zod-Validierung + Error-Response-Muster:**
```typescript
// Pattern: safeParse + flatten() für strukturierte Fehler (aus RESEARCH.md Pattern 1)
const parsed = InitSchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```

**S3-Pfadkonvention** — aus `worker/process_step.py` Zeilen 93–94:
```python
# Etablierte Pfadkonvention: {part_id}/original.step
step_key = f"{part_id}/original.step"
# TypeScript-Äquivalent: `${part.id}/original.step`
```

---

### `src/app/api/upload/confirm/route.ts` (api-route, request-response + CRUD)

**Analog:** `src/app/api/upload/init/route.ts` (wird in selber Welle angelegt)

**Imports-Muster:** identisch zu init/route.ts, ohne S3/presigner-Imports, plus `fetch` für Worker-HTTP-Aufruf.

**Worker-HTTP-Call-Muster** — aus RESEARCH.md Pattern 2:
```typescript
// Pattern: fetch() auf WORKER_URL env var — kein celery-node, keine Redis-Direktverbindung
const workerUrl = process.env.WORKER_URL ?? 'http://localhost:8000'
const resp = await fetch(`${workerUrl}/enqueue`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ part_id }),
})
if (!resp.ok) {
  return NextResponse.json({ error: 'Worker enqueue failed' }, { status: 502 })
}
return NextResponse.json({ part_id, status: 'pending' }, { status: 202 })
```

**UUID-Zod-Schema:**
```typescript
// Pattern für Confirm: nur part_id nötig — z.uuid() validiert UUID-Format (zweite Schicht nach Python CR-01)
const ConfirmSchema = z.object({ part_id: z.string().uuid() })
```

---

### `src/app/api/upload/init/route.test.ts` + `confirm/route.test.ts` (test, unit)

**Analog:** `src/lib/db.test.ts` (Zeilen 1–53)

**Test-File-Struktur** — aus `src/lib/db.test.ts` Zeilen 10–19:
```typescript
// Pattern: Vitest describe/it/expect — kein Jest-Import nötig (globals: true in vitest.config.ts)
import { describe, it, expect } from 'vitest'

describe('POST /api/upload/init', () => {
  it('gibt HTTP 409 zurück bei doppelter SHA-256', async () => {
    // ...
  })
})
```

**Test-Konfigurationskontext** — aus `vitest.config.ts` Zeilen 1–21:
```typescript
// environment: 'jsdom' → Web APIs (fetch, crypto) sind simuliert
// setupFiles: ['./src/test/setup.ts'] → @testing-library/jest-dom verfügbar
// resolve alias: '@' → './src' (import '@/lib/db' funktioniert in Tests)
// dotenv: .env.local wird geladen (für Integration-Tests mit echter DB)
```

**Mock-Muster für db und s3** (kein bestehender Analog — neu anlegen):
```typescript
// Für Unit-Tests: vi.mock('@/lib/db') + vi.mock('@/lib/s3')
// Datei: src/test/mocks/db.ts (kein Analog vorhanden — Wave-0-Aufgabe)
import { vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: vi.fn() }))
vi.mock('@/lib/s3', () => ({
  s3: {},
  BUCKET_STEPS: 'mock-bucket-steps',
}))
```

---

### `worker/celery_app.py` (config, event-driven)

**Analog:** `worker/process_step.py` — Env-Var-Muster (Zeilen 1–8 und 34–35)

**Env-Var-Muster Python** — aus `worker/process_step.py` Zeilen 1–8, 34–35:
```python
# MUSS GANZ OBEN STEHEN — vor allen OCC-Imports (Pitfall 3 aus RESEARCH.md)
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

# Env-Vars mit KeyError wenn fehlend (kein Default für Pflicht-Vars)
BUCKET_STEPS = os.environ["AWS_S3_BUCKET_STEPS"]       # KeyError = explizit
DATABASE_URL = os.environ.get("DATABASE_URL", "")      # .get() für optionale Vars
```

**Celery-Konfigurationsmuster** — aus RESEARCH.md Pattern 3:
```python
# worker/celery_app.py
import os
from celery import Celery

BROKER_URL = os.environ["CELERY_BROKER_URL"]
RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", BROKER_URL)

celery_app = Celery("bauteil_finder", broker=BROKER_URL, backend=RESULT_BACKEND)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,           # Task erst nach Abschluss aus Queue entfernen
    worker_prefetch_multiplier=1,  # CPU-intensiv: nur 1 Task gleichzeitig reservieren
)
```

---

### `worker/tasks.py` (service, event-driven)

**Analog:** `worker/process_step.py` (Zeilen 1–8, 56–76) — VTK-Env-Var + process()-Aufruf-Muster

**VTK-Env-Var zuerst** — aus `worker/process_step.py` Zeilen 1–8 und `worker/renderer.py` Zeilen 1–4:
```python
# MUSS GANZ OBEN STEHEN in tasks.py — auch wenn kein direkter OCC-Import
# Celery lädt tasks.py beim Worker-Start; process_step importiert OCC-Module
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"
```

**Logging-Muster** — aus `worker/process_step.py` Zeilen 27–31:
```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("process_step")
```

**Celery-Task-Dekorator-Muster** — aus RESEARCH.md Pattern 3:
```python
from worker.celery_app import celery_app
from worker.process_step import process

@celery_app.task(name="worker.tasks.process_step", bind=True, max_retries=0)
def process_step_task(self, part_id: str) -> None:
    """max_retries=0: Fehler werden als 'failed' in DB geschrieben — kein auto-Retry."""
    process(part_id)
```

---

### `worker/main.py` (FastAPI api-route, request-response)

**Analog:** `worker/process_step.py` — Logging + Env-Var-Muster

**FastAPI-Endpunkt-Muster** — aus RESEARCH.md Pattern 3 (api.py):
```python
# worker/main.py — FastAPI Health + Enqueue (minimaler Endpunkt, < 50 Zeilen)
from fastapi import FastAPI
from pydantic import BaseModel, UUID4
from worker.tasks import process_step_task

app = FastAPI()

class EnqueueRequest(BaseModel):
    part_id: UUID4  # Pydantic validiert UUID-Format — zweite Schicht nach CR-01-Fix

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

@app.post("/enqueue", status_code=202)
def enqueue(req: EnqueueRequest) -> dict:
    task = process_step_task.delay(str(req.part_id))
    return {"task_id": task.id, "part_id": str(req.part_id)}
```

---

### `worker/process_step.py` — CR-01-Fix (service, CRUD + file-I/O)

**Analog:** sich selbst (Bugfix — kein struktureller Umbau)

**Bestehende process()-Signatur** — `worker/process_step.py` Zeilen 56–75:
```python
def process(part_id: str) -> None:
    # ERSTE ZEILE nach Fix: UUID-Validierung vor jeder anderen Operation
    # Bestehender Ablauf: DB status→'processing', S3 download, render, embed, DB write
```

**CR-01-Fix-Muster** — aus RESEARCH.md Pattern 4:
```python
import re

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

def validate_part_id(part_id: str) -> str:
    """Path-Traversal-Schutz: stellt sicher, dass part_id ein gültiges UUID-Format hat."""
    if not UUID_RE.match(part_id):
        raise ValueError(f"Ungültige part_id (kein UUID-Format): {part_id!r}")
    return part_id

def process(part_id: str) -> None:
    part_id = validate_part_id(part_id)  # ERSTE Zeile — vor jeder anderen Operation
    # ... Rest der Pipeline unverändert (Zeilen 77–189)
```

**`__main__`-Block-Muster** — aus `worker/process_step.py` Zeilen 183–189:
```python
# Muster für CLI-Aufruf (bleibt unverändert, validate_part_id() wird via process() aufgerufen)
if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python process_step.py <part-uuid>")
        sys.exit(1)
    part_id = sys.argv[1]
    process(part_id)
```

---

### `worker/renderer.py` — CR-02-Fix (service, file-I/O)

**Analog:** sich selbst (Bugfix — try/finally um bestehende Render-Schleife)

**Bestehende render_views()-Funktion** — `worker/renderer.py` Zeilen 74–100:
```python
def render_views(shape, output_dir: str) -> list[str]:
    viewer = Viewer3d()
    viewer.Create()
    viewer.SetModeShaded()
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])
    viewer.DisplayShape(shape, update=True)

    paths = []
    for i, (name, orientation) in enumerate(VIEWS):  # Schleife bleibt unverändert
        viewer.View.SetProj(orientation)
        viewer.FitAll()
        path = os.path.join(output_dir, f"view_{i}.png")
        viewer.ExportToImage(path)
        paths.append(path)
        logger.info(f"View {i} ({name}): {path}")

    return paths  # CR-02: kein Viewer.Remove() → Speicherleck bei Batch-Betrieb
```

**CR-02-Fix-Muster** — aus RESEARCH.md Pattern 5:
```python
# Änderung: paths-Liste VOR der Schleife, Schleife in try-Block, finally mit Viewer.Remove()
    paths = []
    try:
        for i, (name, orientation) in enumerate(VIEWS):
            viewer.View.SetProj(orientation)
            viewer.FitAll()
            path = os.path.join(output_dir, f"view_{i}.png")
            viewer.ExportToImage(path)
            paths.append(path)
    finally:
        # Nativen Render-Kontext explizit freigeben (verhindert Speicherleck bei Batch-Betrieb)
        try:
            viewer.Viewer.Remove()
        except Exception:
            pass
    return paths
```

---

### `docker-compose.yml` (config)

**Analog:** `worker/Dockerfile` — Build-Kontext + Env-Var-Muster

**Bestehender Dockerfile-Env-Var-Muster** — `worker/Dockerfile` Zeilen 14–27:
```dockerfile
# Muster: ENV auf Container-Ebene (nicht in entrypoint)
ENV VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow
ENV TRANSFORMERS_CACHE=/app/model_cache

# Muster: COPY + RUN für deps, dann COPY . . für Source
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

**Docker Compose Muster** — aus RESEARCH.md Pattern 6:
```yaml
services:
  redis:
    image: redis:7-alpine       # redis:7-alpine bevorzugt gegenüber redis:alpine (pinned major)
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

  worker:
    build:
      context: ./worker         # Dockerfile liegt in worker/
      dockerfile: Dockerfile
    command: >
      sh -c "uvicorn worker.main:app --host 0.0.0.0 --port 8000 &
             celery -A worker.tasks worker --loglevel=info --concurrency=1"
    ports:
      - "8000:8000"
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    env_file:
      - worker/.env             # DATABASE_URL, AWS_* — NICHT in git committen
    depends_on:
      redis:
        condition: service_healthy
```

---

### `.env.local.example` (config)

**Analog:** `.env.local.example` (bestehend — Zeilen 1–13) und `worker/.env.example` (Zeilen 1–14)

**Bestehendes Format** — `.env.local.example` Zeilen 1–13:
```bash
# Pattern: Kommentar mit Fundort (Neon Dashboard, AWS IAM etc.)
# Variablen ohne NEXT_PUBLIC_-Prefix = server-only (Security Rule)
DATABASE_URL=postgresql://user:password@ep-xxx...neon.tech/neondb?sslmode=require
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_S3_BUCKET_STEPS=parts-steps
AWS_S3_BUCKET_THUMBNAILS=parts-thumbnails
```

**Neue Variablen für Phase 3** (ergänzen im selben Format):
```bash
# Python Worker — URL des FastAPI-Endpunkts (POST /enqueue, GET /health)
# Lokal (ohne Docker): http://localhost:8000
# Lokal (Docker Compose): http://worker:8000 (intern) oder http://localhost:8000 (extern)
# Produktion: https://your-worker.railway.app
WORKER_URL=http://localhost:8000

# Upstash Redis — für Celery Broker in Produktion (TLS: rediss://)
# Lokal: nicht nötig wenn Docker Compose läuft (redis://redis:6379/0 in docker-compose.yml)
# Fundort: Upstash Console > Redis Database > Connect > Celery
UPSTASH_REDIS_URL=rediss://:your_password@your-host.upstash.io:6379
```

---

## Shared Patterns

### Env-Var-Konvention (gilt für alle API-Routes)

**Quelle:** `src/lib/s3.ts` (Zeilen 6–16) und `src/lib/db.ts` (Zeilen 10–13)
**Anwenden auf:** `src/app/api/upload/init/route.ts`, `src/app/api/upload/confirm/route.ts`

```typescript
// Regel 1: KEIN NEXT_PUBLIC_-Prefix für Secrets (Security Rule)
// Regel 2: Non-null-Assertion (!) für Pflicht-Vars — expliziter Fehler wenn fehlend
const databaseUrl = process.env.DATABASE_URL!
const workerUrl = process.env.WORKER_URL ?? 'http://localhost:8000'  // Default für lokale Entwicklung
```

### Python Env-Var-Konvention (gilt für alle Worker-Dateien)

**Quelle:** `worker/process_step.py` (Zeilen 34–35)
**Anwenden auf:** `worker/celery_app.py`, `worker/tasks.py`, `worker/main.py`

```python
# Pflicht-Var: os.environ["KEY"] → KeyError wenn fehlend (explizit)
# Optional-Var: os.environ.get("KEY", "default") → mit Default
CELERY_BROKER_URL = os.environ["CELERY_BROKER_URL"]
RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
```

### VTK_DEFAULT_OPENGL_WINDOW Guard (gilt für alle Worker-Python-Dateien mit OCC-Imports)

**Quelle:** `worker/process_step.py` (Zeilen 6–8), `worker/renderer.py` (Zeilen 1–4), `worker/Dockerfile` (Zeile 14)
**Anwenden auf:** `worker/tasks.py` (importiert process_step → OCC transitiv)

```python
# MUSS GANZ OBEN STEHEN — vor allen anderen Imports in jeder Datei die OCC berührt
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"
```

### Logging-Konvention (gilt für alle Worker-Python-Dateien)

**Quelle:** `worker/process_step.py` (Zeilen 27–31)
**Anwenden auf:** `worker/tasks.py`, `worker/main.py`

```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)  # __name__ statt hartem String für Module
```

### Fehlerbehandlung im Worker (Python try/except Muster)

**Quelle:** `worker/process_step.py` (Zeilen 153–180)
**Anwenden auf:** `worker/tasks.py` (Celery-Task-Wrapper)

```python
# Pattern: ValueError für strukturierte Fehler, Exception für unerwartete Fehler
# Status wird in beiden Fällen auf 'failed' gesetzt
try:
    process(part_id)
except ValueError as e:
    logger.error(f"[{part_id}] Strukturierter Fehler: {e}")
    # set_status('failed') via DB-Direktverbindung oder Celery-Mechanismus
except Exception as e:
    logger.exception(f"[{part_id}] Unerwarteter Fehler: {e}")
    raise  # Re-raise damit Celery den Task als FAILED markiert
```

### Zod-Validierung (gilt für alle TypeScript API-Routes)

**Quelle:** RESEARCH.md Pattern 1 + CONTEXT.md Established Patterns
**Anwenden auf:** `init/route.ts` und `confirm/route.ts`

```typescript
// Pattern: Schema definieren → safeParse → flatten() für Fehlerdetails
const Schema = z.object({ ... })
const parsed = Schema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: parsed.error.flatten() },
    { status: 400 }
  )
}
const data = parsed.data  // vollständig typisiert
```

---

## Keine Analog gefunden

| Datei | Rolle | Data Flow | Begründung |
|-------|-------|-----------|------------|
| `src/test/mocks/db.ts` | test-helper | — | Kein Mock-Infrastruktur-Pattern existiert; Vitest `vi.mock()` direkt in Testdateien ist der Standard |

---

## Kritische Constraints (aus CLAUDE.md + Security Rules)

1. **Kein `"use client"` in API-Routes** — `src/app/api/**` sind server-only. Kein React-Import, kein Browser-API-Zugriff.
2. **Kein `NEXT_PUBLIC_`-Prefix** für `WORKER_URL`, `CELERY_BROKER_URL` oder AWS-Credentials — diese dürfen nie im Client-Bundle landen.
3. **`worker/.env` in `.gitignore`** — `.env.local.example` mit Dummy-Werten dokumentiert alle Pflicht-Vars; echte Werte nie committen.
4. **Import-Pfad-Alias `@/*`** — alle internen TypeScript-Imports nutzen `@/lib/...`, `@/app/...` (tsconfig alias: `@ = ./src`).
5. **Testdateien co-lokiert** — `route.test.ts` neben `route.ts` (CLAUDE.md: "Unit tests co-located next to source files").

---

## Metadata

**Analog-Suchbereich:** `src/`, `worker/`, `.env.local.example`, `worker/.env.example`
**Dateien gescannt:** 12 (alle relevanten Source-Dateien)
**Pattern-Extraktion:** 2026-05-08
