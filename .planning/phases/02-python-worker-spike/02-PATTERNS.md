# Phase 2: Python Worker Spike - Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 8 (neue Dateien — worker/ Verzeichnis komplett neu)
**Analogs found:** 3 / 8 (Codebase hat keine Python-Dateien oder Dockerfiles — JS-Analoga für Verbindungsmuster nutzbar)

---

## File Classification

| Neue Datei | Role | Data Flow | Closest Analog | Match Quality |
|------------|------|-----------|----------------|---------------|
| `worker/Dockerfile` | config | batch | — | kein Analog (kein Docker im Repo) |
| `worker/environment.yml` | config | — | — | kein Analog |
| `worker/requirements.txt` | config | — | `package.json` (Paketliste-Konzept) | Konzept-Match |
| `worker/process_step.py` | service | transform/batch | `src/lib/db.ts` + `src/lib/s3.ts` (Verbindungsmuster) | Konzept-Match |
| `worker/renderer.py` | utility | transform | — | kein Analog |
| `worker/embedder.py` | utility | transform | — | kein Analog |
| `worker/test_renderer.py` | test | transform | `src/lib/db.test.ts` (Test-Struktur-Konzept) | Konzept-Match |
| `worker/.env.example` | config | — | `.env.local.example` | role-match |

---

## Pattern Assignments

### `worker/Dockerfile` (config, batch)

**Analog:** Kein Analog in der Codebase. Muster aus RESEARCH.md (Pitfall 3 und Pitfall 5).

**Kritische Reihenfolge:**
1. Basis: `continuumio/miniconda3:latest` (bringt Python 3.11+ und conda mit)
2. System-Libs installieren (`libgl1-mesa-glx` usw. — Pitfall 3)
3. conda: `pythonocc-core=7.9.3` aus conda-forge
4. pip: torch, transformers, Pillow, numpy, psycopg2-binary, pgvector, boto3, python-dotenv
5. DINOv2-Modell beim Build cachen (Pitfall 2)
6. `VTK_DEFAULT_OPENGL_WINDOW` als ENV setzen (Pitfall 1)

**Dockerfile-Skelett** (aus RESEARCH.md Pitfalls 1-3 + Standard Stack):

```dockerfile
FROM continuumio/miniconda3:latest

# Systemabhängigkeiten für OSMesa (RESEARCH.md Pitfall 3)
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# OSMesa erzwingen — VOR allen VTK/OCC-Imports (RESEARCH.md Pitfall 1)
ENV VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow

# conda: pythonocc-core (Pitfall 5: conda + pip trennen)
RUN conda install -c conda-forge pythonocc-core=7.9.3 -y

# pip: restliche Pakete ohne native Library-Konflikte
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# DINOv2 beim Build-Time cachen (RESEARCH.md Pitfall 2)
ENV TRANSFORMERS_CACHE=/app/model_cache
RUN python -c "from transformers import AutoImageProcessor, AutoModel; \
    AutoModel.from_pretrained('facebook/dinov2-base'); \
    AutoImageProcessor.from_pretrained('facebook/dinov2-base')"

COPY . .
```

---

### `worker/environment.yml` (config)

**Analog:** Kein Analog. Conda-Konvention.

**Muster** (aus RESEARCH.md Standard Stack + Pitfall 5):

```yaml
name: bauteil-worker
channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.11
  - pythonocc-core=7.9.3
  - pip:
    - vtk>=9.4
    - torch>=2.3
    - transformers>=4.41
    - Pillow>=10.0
    - numpy>=1.26
    - psycopg2-binary>=2.9
    - pgvector>=0.3
    - boto3>=1.34
    - python-dotenv>=1.0
```

**Hinweis Pitfall 5:** `vtk` nur über pip (vtk 9.4+ enthält OSMesa direkt). pythonocc-core nur über conda-forge. Nicht beide über conda installieren — Versionskonflikt möglich.

---

### `worker/requirements.txt` (config)

**Analog:** Konzeptionell `package.json` (Paketliste). Kein direkter Python-Analog.

**Muster** (aus RESEARCH.md Standard Stack, Versionen verifiziert 2026-05-08):

```
vtk>=9.4
torch>=2.3
transformers>=4.41
Pillow>=10.0
numpy>=1.26
psycopg2-binary>=2.9
pgvector>=0.3
boto3>=1.34
python-dotenv>=1.0
```

**Nicht hier:** `pythonocc-core` gehört in `environment.yml` (conda-forge), nicht in requirements.txt.

---

### `worker/process_step.py` (service, transform/batch)

**Analoga:**
- `src/lib/db.ts` (Zeilen 1–13) — DB-Verbindungsmuster (Python-Äquivalent: psycopg2)
- `src/lib/s3.ts` (Zeilen 1–16) — S3-Client-Muster (Python-Äquivalent: boto3)
- `supabase/migrations/001_parts_schema.sql` (Zeilen 11–28) — Schema der `parts`-Tabelle

**DB-Verbindungsmuster aus `src/lib/db.ts`** (Zeilen 1–13):
```typescript
// Analog — Env-Var-Muster: DATABASE_URL aus process.env
const databaseUrl = process.env.DATABASE_URL!
export const db = neon(databaseUrl)
```

**Python-Äquivalent** (psycopg2, aus RESEARCH.md Pattern 4):
```python
import psycopg2
from pgvector.psycopg2 import register_vector
import os

conn = psycopg2.connect(os.environ["DATABASE_URL"])
register_vector(conn)  # vector(768)-Type registrieren — PFLICHT vor erstem Query
```

**S3-Client-Muster aus `src/lib/s3.ts`** (Zeilen 1–16):
```typescript
// Analog — Bucket-Konstanten und AWS-Env-Vars
export const BUCKET_STEPS = process.env.AWS_S3_BUCKET_STEPS!
export const BUCKET_THUMBNAILS = process.env.AWS_S3_BUCKET_THUMBNAILS!
```

**Python-Äquivalent** (boto3, aus RESEARCH.md Pattern 5):
```python
import boto3
import os

s3 = boto3.client(
    "s3",
    region_name=os.environ["AWS_REGION"],
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

BUCKET_STEPS = os.environ["AWS_S3_BUCKET_STEPS"]
BUCKET_THUMBNAILS = os.environ["AWS_S3_BUCKET_THUMBNAILS"]
```

**Kritische Import-Reihenfolge** (aus RESEARCH.md Pitfall 1 — OBERSTE PRIORITÄT):
```python
# DIESE ZEILEN MÜSSEN GANZ OBEN STEHEN — vor allen anderen Imports
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

# Erst DANACH alle anderen Imports
import sys
import tempfile
import logging
import numpy as np
import boto3
import psycopg2
# ... usw.
```

**Parts-Tabellen-Schema** (aus `supabase/migrations/001_parts_schema.sql`, Zeilen 11–28):
```sql
-- Relevante Spalten die der Worker schreibt:
-- embedding     vector(768)   -- DINOv2 Mean-Pool-Ergebnis
-- embedding_model text        -- 'dinov2-base'
-- embedding_version text      -- 'facebook/dinov2-base'
-- thumbnail_urls text[]       -- ['s3://bucket/part_id/view_0.png', ...]
-- status        text          -- 'pending' → 'processing' → 'ready' | 'failed'
-- updated_at    timestamptz   -- via Trigger automatisch gesetzt
```

**Status-Update-Muster** (aus RESEARCH.md Pattern 4):
```python
# Status: pending → processing (Beginn)
cur.execute("UPDATE parts SET status = 'processing' WHERE id = %s", (part_id,))
conn.commit()

# Status: processing → ready (Erfolg)
cur.execute("""
    UPDATE parts SET
        embedding = %s,
        embedding_model = %s,
        embedding_version = %s,
        thumbnail_urls = %s,
        status = 'ready'
    WHERE id = %s
""", (embedding, "dinov2-base", "facebook/dinov2-base", thumbnail_urls, part_id))
conn.commit()

# Status: → failed (Fehler, mit Fehlercode in Log)
cur.execute("UPDATE parts SET status = 'failed' WHERE id = %s", (part_id,))
conn.commit()
```

**Fehlerbehandlungs-Muster** (aus RESEARCH.md D-09 + Pattern 4):
```python
def process(part_id: str):
    conn = None
    try:
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        register_vector(conn)
        # ... Hauptlogik ...
    except ValueError as e:
        # Strukturierter Fehlercode: z.B. "INVALID_GEOMETRY:face_count=2"
        error_code = str(e)
        logging.error(f"[{part_id}] {error_code}")
        if conn:
            cur = conn.cursor()
            cur.execute("UPDATE parts SET status = 'failed' WHERE id = %s", (part_id,))
            conn.commit()
    except Exception as e:
        logging.exception(f"[{part_id}] Unerwarteter Fehler: {e}")
        if conn:
            cur = conn.cursor()
            cur.execute("UPDATE parts SET status = 'failed' WHERE id = %s", (part_id,))
            conn.commit()
        raise
    finally:
        if conn:
            conn.close()
```

**Vollständige Import-Struktur** (aus RESEARCH.md Code Examples):
```python
# 1. OSMesa ZUERST — vor allen anderen Imports
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

# 2. Stdlib
import sys
import tempfile
import logging

# 3. Numerik + ML
import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

# 4. AWS
import boto3

# 5. DB
import psycopg2
from pgvector.psycopg2 import register_vector

# 6. OCC — NACH Env-Var-Setzung
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Extend.TopologyUtils import TopologyExplorer
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRepBndLib import brepbndlib_Add
from OCC.Display.OCCViewer import Viewer3d
from OCC.Core.V3d import (
    V3d_Yneg, V3d_Ypos, V3d_Xneg, V3d_Xpos,
    V3d_Zpos, V3d_Zneg, V3d_XposYnegZpos, V3d_XnegYposZneg
)
```

---

### `worker/renderer.py` (utility, transform)

**Analog:** Kein Analog in der Codebase. Muster ausschließlich aus RESEARCH.md.

**STEP laden und validieren** (aus RESEARCH.md Pattern 1 + Pitfall 4):
```python
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Extend.TopologyUtils import TopologyExplorer
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRepBndLib import brepbndlib_Add

def load_step(filename: str):
    reader = STEPControl_Reader()
    status = reader.ReadFile(filename)
    if status != IFSelect_RetDone:
        raise ValueError(f"STEP-Lesefehler: status={status}")
    reader.TransferRoots()
    shape = reader.Shape(1)
    return shape

def validate_geometry(shape) -> None:
    """Wirft ValueError mit strukturiertem Fehlercode bei ungültiger Geometrie (D-08, D-09)."""
    # Prüfung 1: Face-Count < 4 = ungültig (D-08)
    explorer = TopologyExplorer(shape)
    face_count = len(list(explorer.faces()))
    if face_count < 4:
        raise ValueError(f"INVALID_GEOMETRY:face_count={face_count}")

    # Prüfung 2: Bounding-Box-Volumen (Pitfall 4 — leere Form erzeugt weißes Bild)
    bbox = Bnd_Box()
    brepbndlib_Add(shape, bbox)
    x_min, y_min, z_min, x_max, y_max, z_max = bbox.Get()
    volume = (x_max - x_min) * (y_max - y_min) * (z_max - z_min)
    if volume < 1e-6:
        raise ValueError("INVALID_GEOMETRY:empty_bounding_box")
```

**8-View-Rendering-Muster** (aus RESEARCH.md Pattern 2):
```python
# View-Konfiguration (D-04): 6 orthografisch + 2 isometrisch
VIEWS = [
    ("front",     V3d_Yneg),
    ("rear",      V3d_Ypos),
    ("left",      V3d_Xneg),
    ("right",     V3d_Xpos),
    ("top",       V3d_Zpos),
    ("bottom",    V3d_Zneg),
    ("iso_front", V3d_XposYnegZpos),
    ("iso_rear",  V3d_XnegYposZneg),  # OPEN QUESTION A3 — ggf. anpassen
]

def render_views(shape, output_dir: str) -> list[str]:
    """Rendert 8 Views, gibt Liste von PNG-Pfaden zurück.
    Speichert 512x512px (Thumbnails) — Resize auf 224px in embedder.py."""
    viewer = Viewer3d()
    viewer.Create()
    viewer.SetModeShaded()
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])  # Weiß (D-05)
    viewer.DisplayShape(shape, update=True)

    paths = []
    for i, (name, orientation) in enumerate(VIEWS):
        viewer.View.SetProj(orientation)
        viewer.FitAll()  # Automatischer Kamera-Abstand aus Bounding-Box (Claude's Discretion)
        path = f"{output_dir}/view_{i}.png"  # Pfadkonvention: view_0..view_7
        viewer.ExportToImage(path)
        paths.append(path)

    return paths  # 8 PNG-Pfade (512x512px via VTK-Default)
```

---

### `worker/embedder.py` (utility, transform)

**Analog:** Kein Analog. Muster aus RESEARCH.md Pattern 3.

**DINOv2-Embedding-Muster** (aus RESEARCH.md Pattern 3):
```python
from transformers import AutoImageProcessor, AutoModel
from PIL import Image
import torch
import numpy as np

# Einmaliges Laden beim Modulimport (RESEARCH.md Anti-Pattern: nie in Schleife laden)
# TRANSFORMERS_CACHE=/app/model_cache via Dockerfile ENV gesetzt
_processor = AutoImageProcessor.from_pretrained("facebook/dinov2-base")
_model = AutoModel.from_pretrained("facebook/dinov2-base")
_model.eval()

def get_embedding(image_path: str) -> np.ndarray:
    """CLS-Token-Embedding (768-dim) für ein View-Bild.

    Preprocessing: Resize auf 224x224 vor AutoImageProcessor (D-06, Claude's Discretion).
    CLS-Token (Index 0) statt mean-pool der Patch-Tokens (RESEARCH.md A1).
    """
    img = Image.open(image_path).convert("RGB").resize((224, 224))  # 224px (D-06)
    inputs = _processor(images=img, return_tensors="pt")
    with torch.no_grad():
        outputs = _model(**inputs)
    # CLS-Token: Shape [1, 257, 768] → Index 0 → (768,)
    cls_embedding = outputs.last_hidden_state[:, 0].squeeze().numpy()
    return cls_embedding  # shape: (768,)

def mean_pool(embeddings: list[np.ndarray]) -> np.ndarray:
    """Mean-Pool über alle 8 View-Embeddings zu einem 768-dim Vektor (D-07)."""
    return np.mean(np.stack(embeddings), axis=0)  # shape: (768,)
```

---

### `worker/test_renderer.py` (test, transform)

**Analog:** Konzeptionell `src/lib/db.test.ts` (isolierter Smoke-Test für einen einzelnen Client).

**db.test.ts Struktur** (aus `src/lib/db.test.ts` — Referenz für isolierten Test-Stil):
```typescript
// src/lib/db.test.ts — Prüft genau eine Sache: DB-Verbindung funktioniert
// Kein Testing-Framework für den Worker-Spike — direktes Python-Skript
```

**OSMesa-Smoke-Test-Muster** (aus RESEARCH.md Code Examples):
```python
# worker/test_renderer.py
# Ziel: Prüft NUR ob VTK+OSMesa im Container funktioniert
# Ausführen: docker run --rm bauteil-worker python test_renderer.py

# OSMesa ZUERST (Pitfall 1)
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCC.Display.OCCViewer import Viewer3d

# Synthetische Form (kein STEP nötig — testet nur Renderer)
viewer = Viewer3d()
viewer.Create()
viewer.SetModeShaded()
box = BRepPrimAPI_MakeBox(10, 20, 30).Shape()
viewer.DisplayShape(box, update=True)
viewer.ExportToImage("/tmp/test_osmesa.png")

# Verifikation: PNG-Datei existiert und ist nicht leer
import os
stat = os.stat("/tmp/test_osmesa.png")
assert stat.st_size > 1000, f"PNG zu klein ({stat.st_size} Bytes) — Renderer fehlgeschlagen"
print(f"OSMesa-Rendering OK: /tmp/test_osmesa.png ({stat.st_size} Bytes)")
```

---

### `worker/.env.example` (config)

**Analog:** `.env.local.example` (Zeilen 1–17) — exaktes Dokumentations-Muster.

**Muster aus `.env.local.example`** (Zeilen 1–17):
```bash
# Neon PostgreSQL
# Fundort: Neon Dashboard > Project > Connection Details > Connection string
DATABASE_URL=postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require

# AWS S3 — für STEP-Dateien (parts-steps) und Thumbnails (parts-thumbnails)
# Fundort: AWS IAM > Users > Security credentials > Create access key
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_S3_BUCKET_STEPS=parts-steps
AWS_S3_BUCKET_THUMBNAILS=parts-thumbnails
```

**Python-Worker-spezifische Ergänzungen** (aus RESEARCH.md):
```bash
# HuggingFace Cache-Verzeichnis (via Dockerfile ENV gesetzt — hier dokumentiert)
TRANSFORMERS_CACHE=/app/model_cache

# Hinweis: Neon psycopg2 braucht direkte (non-Pooler) URL
# Nicht die Pooler-URL aus Neon verwenden — psycopg2 benötigt Session-Mode
# Fundort: Neon Dashboard > Project > Connection Details > "Direct connection"
```

**Kommentar-Stil:** identisch mit `.env.local.example` — Zeile mit `#` als Kommentar, Leerzeile zwischen Gruppen, Fundort-Hinweis für jeden Wert.

---

## Shared Patterns

### OSMesa-Env-Var (KRITISCH)
**Quelle:** RESEARCH.md Pitfall 1
**Gilt für:** `worker/process_step.py`, `worker/renderer.py`, `worker/test_renderer.py`, `worker/Dockerfile`

Die folgende Zeile muss in jedem Python-Skript das OCC importiert als **allererste Anweisung** stehen (vor allen anderen Imports außer `import os`):
```python
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"
```

Im Dockerfile zusätzlich als ENV-Variable damit der Wert auch bei `docker exec`-Aufrufen gesetzt ist:
```dockerfile
ENV VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow
```

### Env-Var-Zugriffsmuster
**Quelle:** `src/lib/db.ts` (Zeile 10), `src/lib/s3.ts` (Zeilen 6–11)
**Gilt für:** `worker/process_step.py`, `worker/.env.example`

Alle Credentials ausschließlich aus Umgebungsvariablen lesen. Kein Fallback auf Hardcoding. Python-Äquivalent zum TypeScript-`!`-Suffix:
```python
# TypeScript-Analog: process.env.DATABASE_URL!
# Python: KeyError wenn nicht gesetzt — gewünschtes Fail-Fast-Verhalten
conn = psycopg2.connect(os.environ["DATABASE_URL"])  # nicht os.environ.get()
```

### S3-Pfadkonvention
**Quelle:** `src/lib/s3.ts` (Zeile 14 Kommentar) + `supabase/migrations/001_parts_schema.sql` (Zeile 21 Kommentar)
**Gilt für:** `worker/process_step.py`

```python
# STEP-Datei (lesen):   {part_id}/original.step  in BUCKET_STEPS
# Thumbnails (schreiben): {part_id}/view_0.png .. view_7.png  in BUCKET_THUMBNAILS
key_step = f"{part_id}/original.step"
key_thumb = f"{part_id}/view_{i}.png"
```

### pgvector register_vector (PFLICHT)
**Quelle:** RESEARCH.md Pattern 4 + Anti-Patterns
**Gilt für:** `worker/process_step.py`

```python
# MUSS vor dem ersten vector(768)-Query aufgerufen werden
# Ohne register_vector(): INSERT schlägt mit Typ-Fehler fehl
register_vector(conn)
```

### Fehlercode-Format
**Quelle:** RESEARCH.md D-09 + Pattern 4
**Gilt für:** `worker/renderer.py`, `worker/process_step.py`

```python
# Format: "KATEGORIE:detail=wert"
# Beispiele:
raise ValueError("INVALID_GEOMETRY:face_count=2")
raise ValueError("INVALID_GEOMETRY:empty_bounding_box")
# Fehlercode landet in Log-Ausgabe; parts.status = 'failed' in DB
```

---

## No Analog Found

| Datei | Role | Data Flow | Grund |
|-------|------|-----------|-------|
| `worker/Dockerfile` | config | batch | Kein Docker im Repo — frisches Next.js-Projekt |
| `worker/environment.yml` | config | — | Keine conda-Umgebungen im Repo |
| `worker/renderer.py` | utility | transform | Keine Python-Renderer oder OCC-Code im Repo |
| `worker/embedder.py` | utility | transform | Keine ML-Inferenz-Module im Repo |
| `worker/testdata/sample.step` | testdata | — | Binärdatei — extern beschaffen (FreeCAD-Export oder grabcad.com) |

**Planerempfehlung für "No Analog":** RESEARCH.md Patterns 1–5 und Code Examples direkt verwenden. Keine eigene Implementierung nötig — alle Patterns sind verifiziert und direkt kopierbar.

---

## Metadata

**Analog-Suchbereich:** `/Users/mbieling/claude/Objekterkennung/src/lib/`, `/Users/mbieling/claude/Objekterkennung/supabase/`, `/Users/mbieling/claude/Objekterkennung/.planning/phases/01-database-foundation/`
**Gescannte Dateien:** 6 (db.ts, s3.ts, 001_parts_schema.sql, .env.local.example, db.test.ts, 01-PATTERNS.md)
**Pattern-Extraktion:** 2026-05-08

**Codebase-Zustand:** Keine Python-Dateien, kein Dockerfile, kein `worker/`-Verzeichnis vorhanden. Alle 8 Dateien werden neu erstellt. Die JS-Analoga (`db.ts`, `s3.ts`) liefern das Verbindungs- und Env-Var-Muster; die konkreten Python-Patterns kommen vollständig aus RESEARCH.md.

**Kritische Abhängigkeiten für den Planner:**
1. `worker/test_renderer.py` muss vor `worker/process_step.py` implementiert und erfolgreich ausgeführt werden (Two-Wave-Strategie aus RESEARCH.md Summary)
2. Docker muss auf dem Entwickler-Mac installiert sein (RESEARCH.md Environment Availability — fehlt derzeit)
3. Neon DATABASE_URL muss die direkte Connection-URL sein (nicht die Pooler-URL) — für psycopg2 zwingend (RESEARCH.md Open Question 3)
