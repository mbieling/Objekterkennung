# Phase 3: Ingestion API + Queue — Research

**Recherchiert:** 2026-05-08
**Domain:** Next.js App Router API Routes · AWS S3 Presigned URLs · Celery + Redis · Docker Compose · UUID-Validierung · Neon PostgreSQL
**Confidence:** HIGH (Kernbereiche via Context7 + offizielle Docs verifiziert; Celery-Message-Protokoll MEDIUM)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Presigned S3 URL — API gibt signierte Upload-URL zurück, Client lädt direkt zu S3 hoch. Next.js leitet keine Binärdaten durch.
- **D-02:** 2-Schritt Flow: `POST /api/upload/init` (Metadaten + SHA-256, DB-Insert, Presigned URL) → Client PUT zu S3 → `POST /api/upload/confirm` (Celery-Job auslösen, HTTP 202).
- **D-03:** SHA-256-Timing beim Planner (Empfehlung: Prüfung in `/api/upload/init` vor Presigned-URL-Erstellung).
- **D-04:** Vollständige Celery + Redis Implementierung — kein HTTP-Fire-and-forget.
- **D-05:** Docker Compose für lokale Entwicklung — `docker-compose.yml` im Repo-Root.
- **D-06:** Upstash Redis in Produktion — Vercel-Integration, kein selbstverwaltetes Redis in Prod.
- **D-07:** Alle Metadaten in `/api/upload/init` — SHA-256, original_filename, file_size_bytes, name, part_number (optional), project (optional).
- **D-08:** Pflichtfeld: nur `name` — part_number und project sind optional.
- **D-09:** Vollständige Worker-Integration in Phase 3 — SC#4 vollständig erfüllen: pending → processing → ready/failed.
- **D-10:** Docker Compose für lokalen E2E-Test — Next.js Dev-Server + Redis + Python-Worker.
- **D-11:** CR-01 BLOCKER vor Phase 3: UUID-Validierung in `process_step.py`.
- **D-12:** CR-02 Viewer-Ressourcenleck in `renderer.py` in Phase 3 beheben.

### Claude's Discretion

- SHA-256-Berechnungsort: Im Browser (vor Init-Request) oder in `/api/upload/confirm` nach S3-Upload.
- Celery-Task-Name und -Routing-Konfiguration.
- FastAPI-Endpunkt-Design für den Worker-Health-Endpoint.
- Upstash Redis-Konfigurationsdetails (Connection String Format, TLS).
- Lokale Redis-Version im Docker Compose (redis:7 oder redis:alpine).
- Fehler-Response-Format bei Duplikat-Upload (HTTP 409 mit `{existing_part_id}` empfohlen).

### Deferred Ideas (OUT OF SCOPE)

- FastAPI REST-Endpunkt (vollständige API) — nur Celery-Consumer + Health-Endpoint in Phase 3.
- S3-Multipart-Upload für Dateien > 100 MB — explizit Out of Scope.
- Authentifizierung am Upload-Endpunkt — Phase 1 Entscheidung D-06: kein Auth für den Pilot.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGEST-04 | System verhindert doppelte Uploads per SHA-256-Deduplizierung | SHA-256: Browser via `crypto.subtle` (kein npm nötig); Server-Prüfung via `SELECT WHERE sha256 = $1` auf dem bereits indizierten `parts_sha256_idx`; HTTP 409 bei Duplikat |

</phase_requirements>

---

## Summary

Phase 3 verbindet drei bisher isolierte Teile: die Next.js-API (Phase 1/Stack), den S3-Speicher (Phase 1/Stack) und den Python-Worker (Phase 2). Der 2-Schritt Upload-Flow ist das Herzstück: `/api/upload/init` schreibt den DB-Eintrag und gibt eine Presigned PUT-URL zurück; der Client lädt direkt zu S3; `/api/upload/confirm` enqueued den Celery-Job. Der Python-Worker konsumiert den Job und vollendet den Status-Kreislauf.

Die kritischste technische Frage — wie Next.js (TypeScript) einen Celery-Job in Redis enqueued, ohne Python-Dependencies zu importieren — ist lösbar: `celery-node` (npm) implementiert das Celery-Message-Protokoll v1/v2 und nutzt intern `ioredis`. Alternativ kann die Celery-Task direkt über die Worker-interne FastAPI über einen simplen HTTP-Aufruf ausgelöst werden (ein `/enqueue`-Endpunkt im Worker). Die FastAPI-Option ist schlichter und vermeidet Protokoll-Implementierungsrisiken; sie ist **die empfohlene Lösung** für Phase 3.

CR-01 (Path Traversal) und CR-02 (Viewer-Leck) müssen als Wave 0 behoben sein, bevor die Pipeline scharf gestellt wird.

**Primärempfehlung:** Worker bekommt einen minimalen FastAPI-Endpunkt (`POST /enqueue`, `GET /health`). Next.js ruft diesen über eine interne Docker-Netzwerk-URL auf. Das eliminiert das Celery-Protokoll-Parsing im TypeScript-Code und hält die Grenze sauber.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SHA-256-Berechnung | Browser (Client) | API-Server (Validierung) | `crypto.subtle` ist nativ im Browser; kein serverseitiges Streaming der gesamten Datei nötig |
| Deduplizierungs-Prüfung | API / Backend | — | DB-Lookup auf `parts.sha256` muss server-seitig erfolgen (vertrauenswürdige Umgebung) |
| Presigned URL Generierung | API / Backend | — | AWS-Credentials dürfen nie den Browser erreichen |
| Datei-Upload | Browser / Client | — | Direkt zu S3 via Presigned PUT-URL — Next.js-Server leitet keine Binärdaten durch |
| Job-Enqueueing | API / Backend → Worker | Redis als Kanal | `/api/upload/confirm` triggert Worker via HTTP; Worker schiebt Job in Celery-Queue |
| Job-Verarbeitung | Python Worker (Docker) | — | STEP-Processing nicht in Next.js/Vercel ausführbar (600 MB Modell, CPU-intensiv) |
| Status-Updates | Python Worker → DB | — | Worker schreibt `pending → processing → ready/failed` direkt in Neon |
| Health-Endpoint | Python Worker (FastAPI) | — | Docker-interne Health-Check-URL; Next.js nutzt diesen nicht aktiv |

---

## Standard Stack

### Core (Next.js / TypeScript)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-s3` | 3.1045.0 (bereits installiert) | S3-Client für PutObjectCommand | Offizieller AWS SDK v3, bereits im Projekt |
| `@aws-sdk/s3-request-presigner` | 3.1045.0 (bereits installiert) | `getSignedUrl` für Presigned PUT-URLs | Offizielles AWS-Paket, beste Integration mit v3 |
| `zod` | 4.3.5 (bereits installiert) | Schema-Validierung in API-Routes | Bereits im Stack; `z.uuid()` für part_id |
| `ioredis` | 5.10.1 | Redis-Client für Next.js (Upstash-Verbindung) | Robustester Node.js Redis-Client; von Upstash empfohlen |

[VERIFIED: npm registry — alle Versionen via `npm view` bestätigt]

### Core (Python Worker)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `celery` | 5.6.3 | Distributed Task Queue | Bereits entschieden (D-04); aktuellste Stable-Version |
| `fastapi` | 0.136.1 | Health + Enqueue Endpoint | Minimal; < 50 Zeilen für /health und /enqueue |
| `uvicorn` | aktuell | ASGI-Server für FastAPI | Standard-Pairing mit FastAPI |
| `redis` (redis-py) | 7.4.0 | Celery Redis-Broker-Connector | Celery-Abhängigkeit für Redis-Transport |

[VERIFIED: PyPI via `curl pypi.org/pypi/{package}/json`]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `celery-node` | 0.5.9 | Celery-Protokoll v1/v2 aus Node.js | Nur wenn kein FastAPI-Endpunkt im Worker — vermeiden |

[VERIFIED: npm registry]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FastAPI `/enqueue` Endpoint | `celery-node` npm | celery-node ist 0.5.9, wenig maintained; FastAPI ist einfacher zu debuggen |
| ioredis | `@upstash/redis` | @upstash/redis ist edge-optimiert (fetch-basiert), ioredis ist robuster für Node.js Runtime |

**Installation (neue Pakete):**
```bash
npm install ioredis
```

```bash
# in worker/requirements.txt hinzufügen:
fastapi>=0.136.0
uvicorn>=0.30.0
celery>=5.6.0
redis>=7.0.0
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  │ 1. POST /api/upload/init
  │    { name, sha256, original_filename, file_size_bytes, part_number?, project? }
  ▼
Next.js API (Vercel / Dev)
  │
  ├─► Neon DB: SELECT sha256 → Duplikat? → HTTP 409
  │
  ├─► Neon DB: INSERT parts (status='pending') → part_id (UUID)
  │
  ├─► AWS SDK: getSignedUrl(PutObjectCommand, { expiresIn: 900 })
  │
  └─► Response: { part_id, presigned_url } ◄──────────────────────────────────────┐
                                                                                    │
Browser                                                                             │
  │                                                                                 │
  │ 2. PUT {presigned_url} (Datei-Bytes direkt zu S3)                             │
  ▼                                                                                 │
AWS S3 (BUCKET_STEPS)                                                              │
  │ → speichert {part_id}/original.step                                            │
                                                                                    │
Browser                                                                             │
  │                                                                                 │
  │ 3. POST /api/upload/confirm { part_id }                                        │
  ▼                                                                                 │
Next.js API                                                                         │
  │                                                                                 │
  ├─► Neon DB: UPDATE parts SET status='pending' WHERE id=part_id (idempotent)   │
  │                                                                                 │
  ├─► HTTP POST worker:8000/enqueue { part_id }                                   │
  │                                                                                 │
  └─► Response: HTTP 202 { part_id, status: 'pending' }                           │

Docker Network (lokal) / Railway (prod)
  │
  ▼
FastAPI Worker (port 8000)
  │ POST /enqueue → task.delay(part_id)
  ▼
Celery Worker (gleicher Prozess oder separater)
  │
  ├─► Redis Queue (CELERY_BROKER_URL)
  │
  ▼
process_step.process(part_id)
  │
  ├─► Neon DB: status → 'processing'
  ├─► S3 BUCKET_STEPS: Download {part_id}/original.step
  ├─► renderer.py → 8 PNGs
  ├─► S3 BUCKET_THUMBNAILS: Upload view_0..7.png
  ├─► embedder.py → mean_pool(8 embeddings) → vector(768)
  └─► Neon DB: embedding + thumbnail_urls + status → 'ready' | 'failed'
```

### Recommended Project Structure (Ergänzungen für Phase 3)

```
src/
  app/
    api/
      upload/
        init/
          route.ts       # POST /api/upload/init
        confirm/
          route.ts       # POST /api/upload/confirm
  lib/
    db.ts               # (bereits vorhanden — Neon-Client)
    s3.ts               # (bereits vorhanden — S3-Client)
    redis.ts            # NEU: ioredis-Client für Upstash (nur für Upstash-Health-Check, nicht für Celery-Protokoll)
worker/
  celery_app.py         # NEU: Celery-Instanz-Konfiguration
  tasks.py              # NEU: @celery_app.task process_step_task
  api.py                # NEU: FastAPI-App mit /health + /enqueue
  process_step.py       # bestehend — nach CR-01/CR-02-Fix
  renderer.py           # bestehend — nach CR-02-Fix
  embedder.py           # bestehend
  requirements.txt      # erweitern um fastapi, uvicorn, celery, redis
docker-compose.yml      # NEU: redis:7-alpine + worker-service
```

### Pattern 1: Presigned S3 PUT URL generieren (Next.js API Route)

```typescript
// src/app/api/upload/init/route.ts
// Source: Context7 /aws/aws-sdk-js-v3 + https://github.com/aws/aws-sdk-js-v3/blob/main/packages/s3-request-presigner/README.md
import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3, BUCKET_STEPS } from '@/lib/s3'
import { db } from '@/lib/db'
import { z } from 'zod'

const InitSchema = z.object({
  name: z.string().min(1).max(255),
  sha256: z.string().length(64).regex(/^[0-9a-f]+$/i),
  original_filename: z.string().min(1).max(255),
  file_size_bytes: z.number().int().positive().max(100 * 1024 * 1024),
  part_number: z.string().max(100).optional(),
  project: z.string().max(255).optional(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = InitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { name, sha256, original_filename, file_size_bytes, part_number, project } = parsed.data

  // Deduplizierungs-Prüfung (INGEST-04)
  const existing = await db`SELECT id FROM parts WHERE sha256 = ${sha256} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Duplicate file', existing_part_id: existing[0].id }, { status: 409 })
  }

  // DB-Eintrag anlegen (status='pending')
  const [part] = await db`
    INSERT INTO parts (name, sha256, original_filename, file_size_bytes, part_number, project, status, step_file_path)
    VALUES (${name}, ${sha256}, ${original_filename}, ${file_size_bytes}, ${part_number ?? null}, ${project ?? null}, 'pending', ${''})
    RETURNING id
  `

  // Presigned PUT-URL generieren (900s = 15 Minuten — ausreichend für 100 MB Upload)
  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET_STEPS,
      Key: `${part.id}/original.step`,
      ContentType: 'application/octet-stream',
    }),
    { expiresIn: 900 }
  )

  return NextResponse.json({ part_id: part.id, presigned_url: presignedUrl })
}
```

[VERIFIED: Context7 /aws/aws-sdk-js-v3, Context7 /colinhacks/zod, Context7 /neondatabase/serverless]

### Pattern 2: Upload Confirm + Celery-Job-Dispatch (Next.js API Route)

```typescript
// src/app/api/upload/confirm/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const ConfirmSchema = z.object({
  part_id: z.string().uuid(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = ConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { part_id } = parsed.data

  // Sicherstellen, dass der Part existiert
  const parts = await db`SELECT id, status FROM parts WHERE id = ${part_id} LIMIT 1`
  if (parts.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // Job in Worker-Queue einreihen via FastAPI-Endpunkt
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
}
```

[ASSUMED — Worker-URL via WORKER_URL env var; konkrete URL hängt von Docker Compose Netzwerk-Setup ab]

### Pattern 3: Celery App + Task + FastAPI Endpunkt (Python Worker)

```python
# worker/celery_app.py
# Source: Context7 /celery/celery + https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html
import os
from celery import Celery

BROKER_URL = os.environ["CELERY_BROKER_URL"]  # redis:// oder rediss:// (Upstash)
RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", BROKER_URL)

celery_app = Celery("bauteil_finder", broker=BROKER_URL, backend=RESULT_BACKEND)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,          # Task erst nach erfolgreichem Abschluss aus Queue entfernen
    worker_prefetch_multiplier=1, # Immer nur 1 Task reservieren (STEP-Processing ist CPU-intensiv)
)
```

```python
# worker/tasks.py
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"  # Muss GANZ OBEN stehen

from worker.celery_app import celery_app
from worker.process_step import process

@celery_app.task(name="worker.tasks.process_step", bind=True, max_retries=0)
def process_step_task(self, part_id: str) -> None:
    """Celery-Task-Wrapper für process_step.process().
    max_retries=0: Fehler werden als 'failed' in DB geschrieben — kein automatischer Retry.
    """
    process(part_id)
```

```python
# worker/api.py — FastAPI Health + Enqueue (minimaler Endpunkt)
# Source: https://testdriven.io/blog/fastapi-and-celery/
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, UUID4
from worker.tasks import process_step_task

app = FastAPI()

class EnqueueRequest(BaseModel):
    part_id: UUID4  # Pydantic validiert UUID-Format — zweite Verteidigungslinie nach CR-01-Fix

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

@app.post("/enqueue", status_code=202)
def enqueue(req: EnqueueRequest) -> dict:
    task = process_step_task.delay(str(req.part_id))
    return {"task_id": task.id, "part_id": str(req.part_id)}
```

[VERIFIED: Context7 /celery/celery, Context7 /websites/celeryq_dev_en_stable]

### Pattern 4: CR-01 Fix — UUID-Validierung in process_step.py

```python
# worker/process_step.py — Ersetze die __main__-Block und process()-Signatur
# Source: 02-REVIEW.md CR-01 + https://docs.python.org/3/library/re.html
import re

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

def validate_part_id(part_id: str) -> str:
    """Stellt sicher, dass part_id ein gültiges UUID-Format hat (Path-Traversal-Schutz)."""
    if not UUID_RE.match(part_id):
        raise ValueError(f"Ungültige part_id (kein UUID-Format): {part_id!r}")
    return part_id

def process(part_id: str) -> None:
    part_id = validate_part_id(part_id)  # ERSTE Zeile — vor jeder anderen Operation
    # ... Rest der Pipeline unverändert
```

[VERIFIED: 02-REVIEW.md CR-01 Fix-Pattern — direkte Übernahme des Review-Empfehlungscodes]

### Pattern 5: CR-02 Fix — Viewer3d Ressourcen-Freigabe in renderer.py

```python
# worker/renderer.py — render_views() Funktion
# Source: 02-REVIEW.md CR-02 Fix-Pattern
def render_views(shape, output_dir: str) -> list[str]:
    viewer = Viewer3d()
    viewer.Create()
    viewer.View.Window().SetSize(512, 512)  # IN-03 Fix: explizite Auflösung
    viewer.SetModeShaded()
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])
    viewer.DisplayShape(shape, update=True)

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

[VERIFIED: 02-REVIEW.md CR-02 Fix-Pattern]

### Pattern 6: Docker Compose

```yaml
# docker-compose.yml — im Repo-Root
# Source: https://testdriven.io/blog/fastapi-and-celery/ (Referenz), angepasst für dieses Projekt
services:
  redis:
    image: redis:7-alpine
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
      context: ./worker
      dockerfile: Dockerfile
    command: >
      sh -c "uvicorn worker.api:app --host 0.0.0.0 --port 8000 &
             celery -A worker.tasks worker --loglevel=info --concurrency=1"
    ports:
      - "8000:8000"
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
    env_file:
      - worker/.env          # DATABASE_URL, AWS_* — NICHT in git committen
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "celery -A worker.tasks inspect ping --destination celery@$$HOSTNAME"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

[VERIFIED: celery.school/docker-health-check-for-celery-workers, Context7 /celery/celery]

### Pattern 7: SHA-256 im Browser (crypto.subtle)

```typescript
// Kein npm-Paket nötig — Web Crypto API ist nativ im Browser
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
async function computeFileSha256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()  // gesamte Datei in Memory lesen
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Verwendung vor dem Init-Request:
const sha256 = await computeFileSha256(selectedFile)
// → schicke sha256 im Body von POST /api/upload/init
```

**Wichtige Einschränkung:** `crypto.subtle.digest()` liest die **gesamte Datei in den Browser-Speicher**. Bei 100 MB Dateien sind das 100 MB im JS-Heap — das ist akzeptabel für dieses Projekt (Ingenieure auf Desktop-Rechnern). `crypto.subtle` ist in allen modernen Browsern verfügbar (kein Polyfill nötig).

[VERIFIED: MDN Web Docs (mdn.web.dev/api/SubtleCrypto/digest) + Transloadit Blog, bestätigt via WebSearch]

### Anti-Patterns to Avoid

- **Celery-Protokoll manuell in TypeScript implementieren:** Das Celery v2-Protokoll ist komplex (base64-kodierter Body, spezifische Header-Struktur, RPUSH auf Redis-List). `celery-node@0.5.9` ist wenig gewartet. Stattdessen: einfacher HTTP-Aufruf auf FastAPI `/enqueue`.
- **Binärdaten durch Next.js leiten:** `request.formData()` + `file.arrayBuffer()` in einer Next.js API Route für 100 MB Dateien würde Vercel-Timeouts und Memory-Limits auslösen. SHA-256 + Metadaten im Init-Request, dann Presigned URL an Client — keine Binärdaten im Next.js-Server.
- **`assert` statt explizite Exceptions:** Python mit `-O` deaktiviert `assert`-Statements. WR-06 aus dem Review zeigt, dass alle `assert`-Checks für Embedding-Shape durch `if shape != (768,): raise RuntimeError(...)` ersetzt werden sollten.
- **`TRANSFORMERS_CACHE` statt `HF_HUB_CACHE`:** Im Dockerfile sollte `HF_HUB_CACHE` (neuer) und `TRANSFORMERS_CACHE` (Rückwärtskompatibilität) beide gesetzt sein.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Presigned URL Generierung | Eigene URL-Signierung mit HMAC | `@aws-sdk/s3-request-presigner` `getSignedUrl` | SigV4-Signierung hat viele Edge Cases (canonicalization, datetime, scope) |
| Celery-Message-Protokoll in Node.js | RPUSH + JSON-Serialisierung per Hand | FastAPI `/enqueue` im Worker | Protokoll-Interna sind nicht öffentlich dokumentiert; Risiko für stille Fehler |
| UUID-Validierung | Eigene String-Checks | `re.compile(UUID_RE)` (Python) / `z.uuid()` (Zod) | Edge Cases: nil UUID, uppercase, ohne Bindestriche |
| Datenbankverbindung in Worker | Eigenes Connection-Pooling | `psycopg2.connect()` mit explizitem `close()` | Worker ist short-lived pro Task; kein Pool nötig |

---

## Common Pitfalls

### Pitfall 1: Presigned URL und Content-Type-Mismatch

**Was schiefgeht:** Der Browser sendet den PUT-Request ohne oder mit falschem `Content-Type`. S3 lehnt ab wenn die Presigned URL einen `ContentType` einschließt, der nicht mit dem Request übereinstimmt.

**Warum:** `getSignedUrl` mit `signableHeaders: new Set(["content-type"])` bindet den Content-Type in die Signatur ein. Der Browser-Client muss dann exakt denselben Content-Type im PUT-Header setzen.

**Wie vermeiden:** Für STEP-Dateien: `ContentType: 'application/octet-stream'` in der `PutObjectCommand` — und keinen `signableHeaders`-Override setzen. Damit ist Content-Type NICHT in der Signatur, und S3 akzeptiert den Upload unabhängig vom Client-Header.

[VERIFIED: Context7 /aws/aws-sdk-js-v3 Presigned URL docs]

### Pitfall 2: S3 CORS fehlt — Browser-Upload schlägt fehl

**Was schiefgeht:** Der Browser schickt einen Preflight `OPTIONS`-Request an S3 bevor er PUT ausführt. Ohne CORS-Konfiguration am Bucket antwortet S3 mit einem CORS-Fehler.

**Konfiguration (AWS Console → Bucket → Permissions → CORS):**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["http://localhost:3000", "https://*.vercel.app"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Für Produktion:** `AllowedOrigins` auf die konkrete Vercel-URL einschränken — nicht `*` in Produktion.

[CITED: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html + https://medium.com/@Adekola_Olawale/handling-cross-origin-resource-sharing-cors-issues-in-s3 (via WebSearch)]

### Pitfall 3: VTK_DEFAULT_OPENGL_WINDOW muss VOR allen OCC-Imports stehen

**Was schiefgeht:** Wenn `celery_app.py` oder `tasks.py` zuerst importiert werden (was Celery beim Start tut), und diese Dateien OCC-Module importieren bevor die Env-Var gesetzt ist, initialisiert VTK einen Display-basierten Window-Manager — der im Docker-Container nicht existiert → Crash beim Worker-Start.

**Wie vermeiden:** Jede Python-Datei im Worker, die OCC-Code ausführt, beginnt mit:
```python
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"
```
Diese zwei Zeilen müssen die **allerersten Zeilen** sein — vor allen anderen Imports.

**Auch in `tasks.py`:** `tasks.py` importiert `process_step` indirekt — daher muss die Env-Var auch in `tasks.py` ganz oben stehen.

[VERIFIED: Phase 2 RESEARCH.md Pitfall 1, 02-CONTEXT.md Cross-cutting constraints]

### Pitfall 4: Upstash Redis TLS — falsches Protokoll-Präfix

**Was schiefgeht:** Lokale Redis-Verbindung nutzt `redis://`, Upstash erfordert `rediss://` (mit doppeltem 's'). Wenn `CELERY_BROKER_URL` im Deployment auf `redis://` gesetzt wird, schlägt die TLS-Handshake fehl mit einem kryptischen Timeout.

**Korrekte Upstash-URL:**
```
rediss://:{UPSTASH_REDIS_PASSWORD}@{UPSTASH_REDIS_HOST}:{UPSTASH_REDIS_PORT}?ssl_cert_reqs=required
```

**Lokale Docker Compose URL:**
```
redis://redis:6379/0
```

[VERIFIED: https://upstash.com/docs/redis/integrations/celery via WebFetch]

### Pitfall 5: `celery inspect ping` Health Check braucht laufenden Broker

**Was schiefgeht:** `celery inspect ping` schlägt fehl wenn Redis noch nicht bereit ist. Docker Compose Health-Check startet den Worker erst wenn Redis `healthy` ist — aber beim ersten Build dauert das Setup länger als erwartet.

**Wie vermeiden:** `depends_on: redis: condition: service_healthy` + `start_period: 10s` im Worker-Health-Check.

[VERIFIED: celery.school/docker-health-check-for-celery-workers via WebFetch]

### Pitfall 6: SHA-256 nur im Browser — Server-seitige Verifikation fehlt

**Was schiefgeht:** Der Browser schickt eine SHA-256-Hash, die der Server ungeprüft in die DB schreibt. Ein böswilliger Client kann eine falsche Hash senden und so die Deduplizierung umgehen — oder bei einem Netzwerkfehler wird eine falsche Hash gespeichert.

**Empfehlung:** Für Phase 3 akzeptabel (kein Auth-Kontext; Ingenieure intern). Für Phase 10 (Hardening): S3 ETag nach Upload gegen gespeicherte SHA-256 verifizieren (ETag für single-part uploads = MD5, nicht SHA-256 — daher keine direkte Verifikation möglich ohne S3 Checksum Feature).

[ASSUMED — ETag ist MD5, keine direkte SHA-256-Verifikation ohne `ChecksumSHA256` in PutObjectCommand. Für Phase 3 akzeptabel.]

---

## Runtime State Inventory

> Phase 3 ist keine Umbenennung/Refaktorierung — kein Runtime State Inventory erforderlich. Die Phase erstellt neue Artefakte; bestehender State (parts-Tabelle, S3-Buckets) bleibt unverändert.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js Dev Server | ✓ | v25.6.0 | — |
| npm | Package Installation | ✓ | 11.12.1 | — |
| Python 3 | Worker-Dev-Testing | ✓ | 3.9.6 (System) | Worker läuft im Docker |
| Docker | Worker Container | ✗ | — | Worker direkt via conda ausführen (wie Phase 2) |
| Docker Compose | Lokales E2E-Setup | ✗ | — | Redis + Worker separat starten |
| Redis (lokal) | Lokale Entwicklung | ✗ | — | Upstash-Dev-Instance nutzen |
| Upstash Redis | Produktion | ✓ (via Vercel) | — | — |

**Fehlende Dependencies mit Fallback:**

- **Docker / Docker Compose:** Nicht installiert auf dem Entwicklungs-Mac. Fallback: Worker direkt via `conda activate && python -m uvicorn worker.api:app` starten; Redis via Upstash Dev-Instance.
- **Lokales Redis:** Nicht laufend. Fallback: Upstash Free-Tier für lokale Entwicklung (TLS-URL).

**Empfehlung für den Planner:** Docker ist in Phase 2 (als Deployment-Target) bereits beschrieben. Für Phase 3 sollte der Plan eine Anleitung für beide Szenarien enthalten: (a) mit Docker Compose, (b) ohne Docker (Upstash Dev + Worker direkt).

[VERIFIED: Bash-Probes auf lokaler Maschine — `docker --version` und `redis-cli ping` bestätigen Nicht-Verfügbarkeit]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (vorhanden) |
| Quick run command | `npm test -- src/app/api/upload` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC#1 | Zweiter Upload derselben SHA-256 → HTTP 409 mit `existing_part_id` | unit (mock db) | `npm test -- src/app/api/upload/init/route.test.ts` | ❌ Wave 0 |
| SC#2 | Gültiger Upload → S3-Key korrekt + DB-Status `pending` | unit (mock S3, mock db) | `npm test -- src/app/api/upload/init/route.test.ts` | ❌ Wave 0 |
| SC#3 | `/api/upload/init` + `/api/upload/confirm` antworten < 2s | unit (keine I/O) | `npm test -- src/app/api/upload` | ❌ Wave 0 |
| SC#4 | Worker konsumiert Job → Status `processing` → `ready`/`failed` | integration (echter Worker) | Manuell: `curl` + DB-Check | ❌ manuell |
| INGEST-04 | SHA-256-Duplikat-Ablehnung | unit | in SC#1-Test abgedeckt | ❌ Wave 0 |

### Sampling Rate

- **Per Task Commit:** `npm test -- src/app/api/upload`
- **Per Wave Merge:** `npm test` (full suite)
- **Phase Gate:** Full suite grün + manueller E2E-Test mit echtem Worker vor `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/api/upload/init/route.test.ts` — SC#1 (Duplikat → 409), SC#2 (erfolgreicher Init)
- [ ] `src/app/api/upload/confirm/route.test.ts` — SC#3 (202 < 2s), Worker-Enqueue-Mock
- [ ] `src/test/mocks/db.ts` — gemeinsame DB-Mock-Helpers (analog zu `db.test.ts`-Muster)

*(Bestehende Infrastruktur: `vitest.config.ts`, `src/test/setup.ts` — kein neues Framework nötig)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | nein | Kein Auth in Pilot (D-06 Phase 1) |
| V3 Session Management | nein | Kein Auth in Pilot |
| V4 Access Control | nein | Kein Auth in Pilot |
| V5 Input Validation | **ja** | Zod in Next.js API Routes; UUID-Regex in Python Worker (CR-01 Fix) |
| V6 Cryptography | **ja** | SHA-256 via `crypto.subtle` (Web Crypto API — browser-nativ, kein Hand-Roll) |

### Known Threat Patterns für diesen Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path Traversal via `part_id` | Tampering | UUID-Regex-Validierung (CR-01 Fix) — Pflicht vor Phase-3-Aktivierung |
| Falsche SHA-256 vom Client | Spoofing | Akzeptabel für Pilot (interne Nutzer); keine serverseitige Verifikation in Phase 3 |
| Presigned URL Missbrauch | Elevation of Privilege | `expiresIn: 900` (15 min) begrenzt Missbrauchs-Fenster |
| Secrets in Docker Compose | Information Disclosure | `env_file: worker/.env` (in .gitignore); nie Credentials in docker-compose.yml hardcoden |
| Celery-Task-Injection über `part_id` | Tampering | UUID-Validierung in Python (CR-01) + Zod `z.uuid()` in TypeScript (Confirm-Route) — zwei Schichten |

**Security-Constraint aus CLAUDE.md/backend.md:** `SUPABASE_SERVICE_ROLE_KEY` und `AWS_*`-Keys dürfen nie im Client-Bundle landen (kein `NEXT_PUBLIC_`-Prefix). API-Routes sind server-only — diese Anforderung ist durch das bestehende Muster bereits erfüllt.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| S3 SDK v2 (`aws-sdk`) | AWS SDK v3 (`@aws-sdk/client-s3`) | 2020 (GA 2020) | Modular, tree-shakable, TypeScript-first; bereits im Projekt |
| `TRANSFORMERS_CACHE` | `HF_HUB_CACHE` | transformers >= 4.36 | Deprecation-Warning; beide Variablen setzen für Rückwärtskompatibilität |
| Celery v4 | Celery v5.6.3 | 2021 | `task_acks_late`, `worker_prefetch_multiplier` sind v5-Empfehlungen |
| CLS-Token Embedding | Patch-Token Mean-Pool | CR-03 aus Phase 2 Review | Geometrische Ähnlichkeit: Mean-Pool der Patch-Tokens liefert bessere Retrieval-Qualität |

---

## Assumptions Log

| # | Claim | Section | Risk wenn falsch |
|---|-------|---------|------------------|
| A1 | SHA-256-Duplikat-Check ist ausreichend sicher ohne serverseitige Verifikation des Dateiinhalts | Security Domain, Pitfall 6 | Falsche Deduplication bei manipulierter Client-Hash; akzeptabel für Pilot |
| A2 | `WORKER_URL=http://localhost:8000` funktioniert für lokale Entwicklung ohne Docker | Pattern 2 (Confirm Route) | Wenn Worker nicht auf Port 8000 läuft, schlägt Confirm fehl — Env-Var muss dokumentiert werden |
| A3 | Celery `task_acks_late=True` + `max_retries=0` ist korrekte Konfiguration für diesen Use Case | Pattern 3 (celery_app.py) | Bei Worker-Crash zwischen Start und Ende eines Tasks wird der Job verloren — für Phase 3 akzeptabel; Phase 10 behandelt Retry |
| A4 | Docker Compose `sh -c "uvicorn ... & celery ..."` (Prozessgruppe) ist für lokale Entwicklung ausreichend | Pattern 6 (docker-compose.yml) | In Produktion (Railway/Fly.io) sollten FastAPI und Celery Worker als separate Services laufen |

---

## Open Questions (RESOLVED)

1. **WORKER_URL in Vercel/Produktion**
   - Was wir wissen: Docker Compose nutzt internes Netzwerk (`worker:8000`); Vercel ist serverless und kann keinen internen Docker-Host erreichen.
   - Was unklar war: Wie wird der Worker in Produktion erreichbar gemacht? Railway/Fly.io als öffentliche URL?
   - **RESOLUTION:** Phase-3-Scope-Grenze: Lokaler Docker Compose ausreichend für Phase 3. Produktions-Routing (Railway/Fly.io) ist explizit Out of Scope bis Phase 10 (Hardening).

2. **CR-03 (Embedding-Strategie CLS vs. Patch-Mean-Pool) — Fix-Scope**
   - Was wir wissen: 02-REVIEW.md identifiziert CR-03 als kritisch. Betrifft `embedder.py`.
   - Was unklar war: Wurde CR-03 bereits in Phase 2 behoben oder nicht? (Status nicht dokumentiert in REVIEW.md als "fixed")
   - **RESOLUTION:** Verifikation als Wave-0-Task in Plan 03-01 Task 4 aufgenommen. Fix wird während Ausführung bestätigt. Aktueller Stand von `worker/embedder.py` (geprüft beim Planning): CLS-Token (`last_hidden_state[:, 0]`) — Task 4 korrigiert zu `patch_tokens[:, 1:, :].mean(dim=1)`.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/aws/aws-sdk-js-v3` — Presigned URL Generierung (`getSignedUrl`, `PutObjectCommand`, `signableHeaders`)
- Context7 `/celery/celery` — Task-Definition, `apply_async`, `delay`, `send_task`, `acks_late`, Retry-Konfiguration
- Context7 `/websites/celeryq_dev_en_stable` — Redis Broker TLS (`rediss://`), `ssl_cert_reqs=required`
- Context7 `/colinhacks/zod` — `z.uuid()`, `z.string().length(64)`, `z.object()`, `safeParse`
- Context7 `/neondatabase/serverless` — Tagged Template Literal (`db\`INSERT ... RETURNING id\``)
- `supabase/migrations/001_parts_schema.sql` — Exaktes Schema (17 Felder, Status-Werte, sha256-Index)
- `worker/process_step.py`, `worker/renderer.py` — Bestehende Pipeline-Implementierung
- `.planning/phases/02-python-worker-spike/02-REVIEW.md` — CR-01, CR-02, CR-03 Fix-Patterns

### Secondary (MEDIUM confidence)
- https://upstash.com/docs/redis/integrations/celery — Upstash Celery Konfiguration (via WebFetch, offizielle Upstash-Docs)
- https://celery.school/docker-health-check-for-celery-workers — Docker Health Check für Celery (via WebFetch)
- https://neon.com/guides/next-upload-aws-s3 — S3 CORS-Konfiguration + Presigned URL Pattern (via WebFetch)
- https://testdriven.io/blog/fastapi-and-celery/ — FastAPI + Celery Docker Compose (via WebFetch)
- MDN SubtleCrypto.digest() — SHA-256 im Browser via `crypto.subtle`

### Tertiary (LOW confidence / ASSUMED)
- Celery-Message-Protokoll v2 Interna (RPUSH-Format) — nicht tief recherchiert, da FastAPI-Approach gewählt

---

## Metadata

**Confidence Breakdown:**
- Standard Stack (Next.js/AWS SDK/Zod): HIGH — alle Versionen via npm registry verifiziert
- Celery + Redis Konfiguration: HIGH — offiziell via Context7 + Upstash Docs verifiziert
- SHA-256 Browser-Implementierung: HIGH — MDN Web Docs
- Docker Compose Health Check: MEDIUM — celery.school (verlässliche Quelle, nicht offizielle Celery-Docs)
- Celery-Message-Protokoll in TypeScript: MEDIUM — bewusst nicht tief researched (FastAPI-Ansatz vermeidet das Problem)
- Environment Availability: HIGH — direkte Bash-Probes

**Research Date:** 2026-05-08
**Valid Until:** 2026-06-08 (stabile Libraries; Celery/FastAPI haben längere Release-Zyklen)
