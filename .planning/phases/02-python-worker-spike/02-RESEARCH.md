# Phase 2: Python Worker Spike — Research

**Recherchiert:** 2026-05-08
**Domain:** Python STEP-Rendering + DINOv2-Embedding + PostgreSQL/pgvector-Schreiben in Docker
**Confidence:** MEDIUM (kritische Teile via offizielle Docs und GitHub verifiziert; OSMesa-in-Docker-Verhalten bleibt empirisch zu bestätigen)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Primär-Renderer: pythonOCC + VTK + OSMesa (kein Display-Server, kein Xvfb)
- **D-02:** Fallback: FreeCAD headless (`freecadcmd`), dokumentiert warum Wechsel nötig war
- **D-03:** Mesa-Modus: OSMesa (kein EGL, kein Xvfb)
- **D-04:** 8 Views pro STEP: 6 orthografisch (vorne, hinten, links, rechts, oben, unten) + 2 isometrisch
- **D-05:** Hintergrundfarbe: Weiß (#FFFFFF)
- **D-06:** Zwei Ausgabegrößen: 512×512px (S3-Thumbnail), 224×224px (DINOv2-Input)
- **D-07:** Mean-Pool: alle 8 Views zu einem einzigen 768-dim Embedding (architektonisch gesperrt)
- **D-08:** Validierungskriterium: Face-Count < 4 = ungültig
- **D-09:** Fehlerbehandlung: `parts.status = 'failed'` + strukturierter Fehlercode (z.B. `INVALID_GEOMETRY:face_count=2`)
- **D-10:** Scope: Minimales Test-Skript — kein FastAPI, kein Celery
- **D-11:** Verzeichnisstruktur: `worker/` im Repo-Root (Dockerfile, process_step.py, requirements.txt)

### Claude's Discretion

- Kamera-Abstand und Zoom für die 8 Views (automatisch aus Bounding-Box ableiten)
- DINOv2-Preprocessing-Details (Normalisierung, Resize-Strategie für 224px)
- Basis-Docker-Image (z.B. `python:3.11-slim` + conda vs. offizielle pythonOCC-Images)
- Dateinamenskonvention für die generierten PNGs im S3 (`{part_id}/view_0.png` … `view_7.png`)

### Deferred Ideas (OUT OF SCOPE)

- FastAPI + Celery + Redis Queue (Phase 3)
- Cloud-Deployment-Test Railway/Fly.io (Phase 3)
- HNSW-Tuning (Phase 10)
- Retry-Mechanismus für fehlgeschlagene Jobs (Phase 5)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Beschreibung | Research-Grundlage |
|----|--------------|-------------------|
| INGEST-03 | System erzeugt automatisch 6–8 orthografische 3D-Thumbnails beim Ingest | Abschnitte Standard Stack (pythonOCC), Architecture Patterns (8-View-Workflow), Code Examples (STEPControl_Reader, Viewer3d, DINOv2) |
</phase_requirements>

---

## Summary

Phase 2 ist technisch der risikoreichste Teil des gesamten Projekts: Die Kombination aus OpenCASCADE-Rendering in einem Display-freien Docker-Container und DINOv2-Inferenz auf CPU ist funktionsfähig, aber die genauen Versionen und Env-Vars müssen im ersten Implementierungsschritt empirisch verifiziert werden. Die gute Nachricht: Alle drei Kernprobleme — STEP-Parsing, Offscreen-Rendering und DINOv2-Embedding — sind gut dokumentiert und haben klare API-Muster.

**Kritische Erkenntnis für den Planner:** VTK 9.4+ integriert OSMesa direkt in den Standard-Pip-Wheel. Das vereinfacht den Dockerfile erheblich: kein separates `vtk-osmesa`-Paket nötig. Stattdessen wird `VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow` als Env-Var gesetzt. [VERIFIED: docs.vtk.org]

**pythonOCC aktuelle Version:** 7.9.3 (veröffentlicht 16. Februar 2026, via conda-forge). [VERIFIED: github.com/tpaviot/pythonocc-core]

**Primary recommendation:** Implementierung in zwei Wellen — zuerst Rendering isoliert validieren (`test_renderer.py`), dann DINOv2 hinzufügen, dann DB-Schreiben. Frühes Scheitern des Renderers vermeidet aufwendiges Debugging in der vollständigen Pipeline.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| STEP-Datei herunterladen | Python Worker | — | Direkter boto3-S3-Zugriff, kein Next.js-Proxy nötig |
| STEP validieren (Face-Count, Bounding Box) | Python Worker | — | OpenCASCADE-API läuft nur im Python-Container |
| 8 Views rendern (PNG) | Python Worker | — | pythonOCC+VTK; keine GPU, kein Display-Server |
| PNGs nach S3 hochladen | Python Worker | — | boto3 direkt, gleiche Bucket-Konstanten wie Next.js |
| DINOv2-Embedding berechnen | Python Worker | — | PyTorch-Model im Python-Container; CPU-Inferenz |
| Mean-Pool über 8 Embeddings | Python Worker | — | Numpy-Operation im Worker |
| Embedding in DB schreiben | Python Worker | — | psycopg2 + pgvector direkt gegen Neon DATABASE_URL |
| Status-Updates (pending→processing→ready/failed) | Python Worker | — | Worker hält vollen DB-Zugriff via SERVICE_ROLE |

---

## Standard Stack

### Core

| Library | Version | Zweck | Begründung |
|---------|---------|-------|-----------|
| pythonocc-core | 7.9.3 | STEP-Parsing, Geometrie-Validierung, Offscreen-Rendering | Einziges produktionsreifes Python-Binding für OpenCASCADE; conda-forge-Paket |
| vtk | 9.4+ | Offscreen-Rendering-Backend für pythonocc | Ab 9.4 OSMesa integriert; kein vtk-osmesa-Sonderpaket mehr nötig |
| transformers | 4.41+ | DINOv2 ViT-B/14 laden und ausführen | Standard HuggingFace-Bibliothek |
| torch | 2.3+ | PyTorch-Backend für DINOv2-Inferenz | CPU-Inferenz ausreichend |
| Pillow | 10.x | PNG-Resize (512→224), Bildvorverarbeitung | Standard |
| numpy | 1.26+ | Mean-Pool der Embeddings, Vektor-Arithmetik | Standard |
| psycopg2-binary | 2.9+ | PostgreSQL-Verbindung zu Neon | Einfachste Option; kein C-Compiler nötig |
| pgvector | 0.3.x | `register_vector()` für psycopg2, vector(768)-Type | Offizieller pgvector Python-Client |
| boto3 | 1.34+ | S3-Upload für PNGs und Download für STEP | AWS SDK Standard |
| python-dotenv | 1.0 | .env-Datei in Docker laden | Standard |

### Supporting

| Library | Version | Zweck | Wann verwenden |
|---------|---------|-------|---------------|
| freecadcmd | 0.21+ | Fallback-Renderer wenn VTK+OSMesa nicht läuft | Nur wenn D-01 scheitert (D-02) |

### Alternatives Considered

| Statt | Könnte man | Tradeoff |
|-------|-----------|----------|
| pythonocc 7.9.3 | FreeCAD headless | Gleicher OCCT-Kernel, aber ~500MB Container-Overhead; Fallback wenn pythonocc-Containerisierung scheitert |
| DINOv2 CLS-Token | Mean-Pool aller Patch-Tokens | CLS besser für globale Klassifikation; mean-pool besser für lokale Features; Empfehlung: CLS-Token für diese Use-Case (siehe Code Examples) |
| psycopg2 | asyncpg | Asyncpg ist schneller, aber für ein sync Skript unnötige Komplexität |

**Installation (im Docker-Build):**
```bash
# Conda-Umgebung für pythonOCC
conda install -c conda-forge pythonocc-core=7.9.3

# Pip-Pakete
pip install vtk torch transformers Pillow numpy psycopg2-binary pgvector boto3 python-dotenv
```

**Versionsverifikation (2026-05-08):**
- pythonocc-core 7.9.3: [VERIFIED: anaconda.org/conda-forge/pythonocc-core] — veröffentlicht 2026-02-16
- vtk 9.4+: [VERIFIED: docs.vtk.org/en/latest/advanced/available_python_wheels.html] — OSMesa ab 9.4 integriert
- facebook/dinov2-base: [VERIFIED: huggingface.co/facebook/dinov2-base] — 86.6M Parameter, 768-dim

---

## Architecture Patterns

### System Architecture Diagram

```
S3 (BUCKET_STEPS)
    |
    | boto3.download_file({part_id}/original.step)
    v
[process_step.py]
    |
    |-- STEPControl_Reader.ReadFile() --> shape (TopoDS_Shape)
    |-- TopologyExplorer(shape).faces() --> face_count
    |
    |-- face_count < 4? --> UPDATE parts SET status='failed', error_code='INVALID_GEOMETRY:face_count=N'
    |                        EXIT
    |
    |-- Viewer3d (OSMesa-Modus)
    |       |-- SetProj(V3d_Yneg)  --> front.png
    |       |-- SetProj(V3d_Ypos)  --> rear.png
    |       |-- SetProj(V3d_Xneg)  --> left.png
    |       |-- SetProj(V3d_Xpos)  --> right.png
    |       |-- SetProj(V3d_Zpos)  --> top.png
    |       |-- SetProj(V3d_Zneg)  --> bottom.png
    |       |-- SetProj(V3d_XposYnegZpos) --> iso_front.png
    |       |-- SetProj(V3d_XnegYposZneg) --> iso_rear.png
    |       |-- FitAll() + View.Dump() x 8
    |
    |-- Pillow: PNG 512x512 speichern (Thumbnail)
    |-- Pillow: PNG 224x224 speichern (DINOv2-Input)
    |
    |-- boto3.upload_fileobj() --> S3 BUCKET_THUMBNAILS/{part_id}/view_N.png (x8)
    |
    |-- AutoImageProcessor('facebook/dinov2-base')
    |-- AutoModel('facebook/dinov2-base')
    |       |-- processor(images=img_224, return_tensors="pt")
    |       |-- model(**inputs).last_hidden_state[:, 0]  --> embedding[i] (768-dim)
    |       |-- x 8 views
    |
    |-- numpy.mean([embedding_0..7], axis=0)  --> mean_embedding (768-dim)
    |
    |-- psycopg2.connect(DATABASE_URL)
    |-- register_vector(conn)
    |-- UPDATE parts SET
    |       embedding = mean_embedding,
    |       embedding_model = 'dinov2-base',
    |       embedding_version = 'facebook/dinov2-base@20231205',
    |       thumbnail_urls = [url_0..7],
    |       status = 'ready'
    |   WHERE id = {part_id}

S3 (BUCKET_THUMBNAILS)
    ^
    | view_0.png .. view_7.png (512x512, JPEG-like quality)
```

### Recommended Project Structure

```
worker/
├── Dockerfile                  # continuumio/miniconda3 + vtk + pythonocc
├── requirements.txt            # pip-Pakete (torch, transformers, ...)
├── environment.yml             # conda-Pakete (pythonocc-core)
├── process_step.py             # Haupt-Skript (Spike)
├── renderer.py                 # STEP -> PNG via pythonocc (isolierter Test möglich)
├── embedder.py                 # PNG -> 768-dim via DINOv2 (isolierter Test möglich)
├── db_writer.py                # psycopg2 + pgvector Schreiben
├── test_renderer.py            # Isolierter Test: VTK+OSMesa funktioniert?
├── testdata/
│   └── sample.step             # Testdatei (z.B. simpler Würfel oder Schraube)
└── .env.example                # DATABASE_URL, AWS_*, etc.
```

### Pattern 1: STEP laden und Faces zählen

**Was es tut:** Lädt eine STEP-Datei, transferiert die Geometrie, zählt Faces mit TopologyExplorer.
**Wann verwenden:** Immer als erste Validierung nach dem Datei-Download.

```python
# Source: github.com/tpaviot/pythonocc-demos/blob/master/examples/core_geometry_face_recognition_from_stepfile.py
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Extend.TopologyUtils import TopologyExplorer

def load_step(filename: str):
    reader = STEPControl_Reader()
    status = reader.ReadFile(filename)
    if status != IFSelect_RetDone:
        raise ValueError(f"STEP-Lesefehler: status={status}")
    reader.TransferRoots()
    shape = reader.Shape(1)
    return shape

def count_faces(shape) -> int:
    explorer = TopologyExplorer(shape)
    return len(list(explorer.faces()))

# Validierung per D-08
shape = load_step("/tmp/part.step")
face_count = count_faces(shape)
if face_count < 4:
    raise ValueError(f"INVALID_GEOMETRY:face_count={face_count}")
```

### Pattern 2: Offscreen-Rendering mit OSMesa (8 Views)

**Was es tut:** Rendert eine geladene Form aus 8 Kamerapositionen, speichert jedes als PNG.
**Wann verwenden:** Nach erfolgreicher Geometrie-Validierung.

```python
# Source: github.com/tpaviot/pythonocc-core/blob/master/src/Display/OCCViewer.py
# Source: github.com/tpaviot/pythonocc-demos/blob/master/examples/core_offscreen_rendering.py
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"  # OSMesa erzwingen (D-03)

from OCC.Display.OCCViewer import Viewer3d
from OCC.Core.V3d import (
    V3d_Yneg, V3d_Ypos, V3d_Xneg, V3d_Xpos,
    V3d_Zpos, V3d_Zneg, V3d_XposYnegZpos, V3d_XnegYposZneg
)

# 8 Views: 6 orthografisch + 2 isometrisch (D-04)
VIEWS = [
    ("front",    V3d_Yneg),
    ("rear",     V3d_Ypos),
    ("left",     V3d_Xneg),
    ("right",    V3d_Xpos),
    ("top",      V3d_Zpos),
    ("bottom",   V3d_Zneg),
    ("iso_front", V3d_XposYnegZpos),
    ("iso_rear",  V3d_XnegYposZneg),
]

def render_views(shape, output_dir: str, size: int = 512):
    viewer = Viewer3d()
    viewer.Create()
    viewer.SetModeShaded()
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])  # Weißer Hintergrund (D-05)
    viewer.DisplayShape(shape, update=True)

    paths = []
    for name, orientation in VIEWS:
        viewer.View.SetProj(orientation)
        viewer.View_Iso()  # FitAll nach Projektion
        viewer.FitAll()
        path = f"{output_dir}/view_{name}.png"
        viewer.ExportToImage(path)
        paths.append(path)

    return paths  # 8 PNG-Pfade
```

**Wichtiger Hinweis:** `VTK_DEFAULT_OPENGL_WINDOW` muss **vor** dem ersten VTK-Import gesetzt werden. In process_step.py als allererstes setzen, bevor OCC importiert wird.

### Pattern 3: DINOv2 CLS-Token Embedding

**Was es tut:** Lädt facebook/dinov2-base, verarbeitet ein 224x224px-Bild, extrahiert den CLS-Token als 768-dim Vektor.
**Wann verwenden:** Für jedes der 8 gerenderten Views.

```python
# Source: huggingface.co/facebook/dinov2-base (verifiziert 2026-05-08)
from transformers import AutoImageProcessor, AutoModel
from PIL import Image
import torch
import numpy as np

# Model wird beim ersten Start aus HuggingFace Hub geladen (~330MB)
# Im Docker-Build cachen: TRANSFORMERS_CACHE=/app/model_cache
processor = AutoImageProcessor.from_pretrained("facebook/dinov2-base")
model = AutoModel.from_pretrained("facebook/dinov2-base")
model.eval()

def get_embedding(image_path: str) -> np.ndarray:
    """Gibt CLS-Token-Embedding (768-dim) zurück."""
    img = Image.open(image_path).convert("RGB").resize((224, 224))
    inputs = processor(images=img, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    # CLS-Token: erstes Token in last_hidden_state (768-dim)
    # Shape: [batch=1, seq_len=257, hidden=768]
    cls_embedding = outputs.last_hidden_state[:, 0].squeeze().numpy()
    return cls_embedding  # shape: (768,)

def mean_pool_embeddings(embeddings: list[np.ndarray]) -> np.ndarray:
    """Mean-Pool über alle 8 View-Embeddings (D-07)."""
    return np.mean(np.stack(embeddings), axis=0)  # shape: (768,)
```

**CLS-Token vs. Mean-Pool der Patch-Tokens:** CLS-Token empfohlen für globale Bildklassifikation (Ähnlichkeitssuche). Der CLS-Token aggregiert alle Patch-Informationen durch Self-Attention. [CITED: huggingface.co/docs/transformers/model_doc/dinov2]

### Pattern 4: pgvector-Schreiben mit psycopg2

**Was es tut:** Schreibt das 768-dim Embedding und Status-Update in die Neon-Datenbank.
**Wann verwenden:** Nach erfolgreichem Mean-Pool.

```python
# Source: github.com/pgvector/pgvector-python (verifiziert 2026-05-08)
import psycopg2
from pgvector.psycopg2 import register_vector
import numpy as np
import os

def write_to_db(part_id: str, embedding: np.ndarray, thumbnail_urls: list[str]):
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    register_vector(conn)  # Registriert vector(768)-Type für psycopg2
    cur = conn.cursor()

    cur.execute("""
        UPDATE parts SET
            embedding = %s,
            embedding_model = %s,
            embedding_version = %s,
            thumbnail_urls = %s,
            status = 'ready',
            updated_at = now()
        WHERE id = %s
    """, (
        embedding,                      # numpy array -> vector(768)
        "dinov2-base",
        "facebook/dinov2-base",
        thumbnail_urls,                 # list[str] -> text[]
        part_id
    ))
    conn.commit()
    cur.close()
    conn.close()

def write_failure_to_db(part_id: str, error_code: str):
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""
        UPDATE parts SET
            status = 'failed',
            updated_at = now()
        WHERE id = %s
    """, (part_id,))
    # Fehlercode als strukturierter String — z.B. "INVALID_GEOMETRY:face_count=2"
    # Gespeichert in einer error_details-Spalte falls vorhanden, sonst in logs
    conn.commit()
    cur.close()
    conn.close()
```

**Hinweis:** Die `parts`-Tabelle aus Phase 1 hat kein `error_code`-Feld. Der Fehler wird in der Log-Ausgabe des Skripts festgehalten. Die `status`-Spalte wechselt auf `'failed'`. Phase 5 (Admin Catalog) kann dann Retry auslösen.

### Pattern 5: S3-Upload (Thumbnails)

```python
# Source: boto3.amazonaws.com/v1/documentation/api/latest/guide/s3-uploading-files.html
import boto3
from io import BytesIO

s3 = boto3.client(
    "s3",
    region_name=os.environ["AWS_REGION"],
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

def upload_png(local_path: str, part_id: str, view_index: int, bucket: str) -> str:
    key = f"{part_id}/view_{view_index}.png"
    with open(local_path, "rb") as f:
        s3.upload_fileobj(f, bucket, key, ExtraArgs={"ContentType": "image/png"})
    return f"s3://{bucket}/{key}"
```

### Anti-Patterns to Avoid

- **VTK vor Env-Var setzen:** `import OCC` vor `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = ...` führt zum Absturz ohne Display. VTK-Import muss nach Env-Var-Setzung erfolgen.
- **DINOv2 bei jeder View-Iteration neu laden:** Model einmal laden, für alle 8 Views wiederverwenden. Einmaliges Laden dauert ~3s.
- **Embedding ohne `register_vector()`:** psycopg2 kennt den vector-Type nicht ohne Registrierung; INSERT schlägt fehl.
- **PNG direkt ohne Resize an DINOv2:** Die `AutoImageProcessor` normalisiert zwar auf 224px, aber explizites Resize auf 224px vor dem Processor vermeidet unnötige Zwischenschritte.
- **`face_count < 4` Check ohne BBox-Prüfung:** Ergänzend zur Face-Zahl prüfen ob Bounding-Box-Volumen > epsilon (Pitfall C1 aus PITFALLS.md).

---

## Don't Hand-Roll

| Problem | Nicht selbst bauen | Stattdessen verwenden | Warum |
|---------|-------------------|----------------------|-------|
| STEP-Parsing | Eigenen ISO 10303 Parser | pythonOCC STEPControl_Reader | STEP hat 3400+ Entity-Typen; handgeschriebene Parser decken nur einen Bruchteil ab |
| Offscreen-Rendering | Software-Rasterizer | VTK mit OSMesa (via vtk 9.4+) | OSMesa ist optimierter Software-GL; kein GPU nötig |
| Bildvorverarbeitung für DINOv2 | Manuell normalisieren | `AutoImageProcessor.from_pretrained()` | Processor enthält exakte mean/std aus DINOv2-Training |
| Vector-Type für psycopg2 | Numpy-Array als String serialisieren | pgvector-python `register_vector()` | pgvector-python serialisiert korrekt; Handimplementierung produziert Formatfehler |
| Kamera-Fitting | Manuellen FOV berechnen | `viewer.FitAll()` | FitAll berechnet automatisch optimalen Abstand aus Bounding-Box |

---

## Common Pitfalls

### Pitfall 1: VTK Import-Reihenfolge bei OSMesa

**Was schiefläuft:** Python importiert OCC-Module, bevor `VTK_DEFAULT_OPENGL_WINDOW` gesetzt ist. VTK wählt dann xOpenGL (benötigt DISPLAY) statt OSMesa. Ergebnis: Segfault oder `DISPLAY not set`-Fehler.

**Warum passiert es:** In Python werden Module beim ersten Import initialisiert. VTK liest Env-Vars beim ersten Import.

**Vermeidung:** `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"` muss die allererste Zeile von `process_step.py` sein, vor allen anderen Imports außer `os`.

**Warnzeichen:** `Segmentation fault (core dumped)` beim Start des Containers, oder `cannot connect to X server :0`.

### Pitfall 2: DINOv2 Model-Download im Container (kein Internet)

**Was schiefläuft:** Container lädt das Modell zur Laufzeit von huggingface.co — das schlägt in Produktions-Umgebungen ohne Outbound-Internet fehl. Auch bei vorhandenem Internet dauert der erste Start ~3 Minuten.

**Warum passiert es:** `from_pretrained()` ohne lokalen Cache lädt immer neu.

**Vermeidung:** Im `Dockerfile` das Modell beim Build-Time cachen:
```dockerfile
ENV TRANSFORMERS_CACHE=/app/model_cache
RUN python -c "from transformers import AutoImageProcessor, AutoModel; \
    AutoModel.from_pretrained('facebook/dinov2-base'); \
    AutoImageProcessor.from_pretrained('facebook/dinov2-base')"
```

**Warnzeichen:** Erster Container-Start dauert >5 Minuten; Fehler `ConnectionError: repository could not be accessed`.

### Pitfall 3: pythonocc Offscreen-Renderer — Segfault bei fehlendem libGL

**Was schiefläuft:** Der Viewer3d-Konstruktor stürzt ab, wenn `libGL.so` nicht vorhanden ist — auch bei OSMesa-Konfiguration. `libGL1-mesa-glx` oder `libGL1` muss im Container installiert sein.

**Warum passiert es:** OSMesa benötigt die Mesa-OpenGL-Libraries. Slim-Docker-Images enthalten sie nicht.

**Vermeidung:**
```dockerfile
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*
```

**Warnzeichen:** `ImportError: libGL.so.1: cannot open shared object file`.

### Pitfall 4: Leere STEP-Renderings erzeugen valide Embeddings (C1 aus PITFALLS.md)

**Was schiefläuft:** Eine STEP-Datei lädt ohne Fehler, gibt aber eine leere Form zurück. Der Renderer erzeugt ein weißes Bild. DINOv2 berechnet ein Embedding für ein weißes Bild. Dieses Embedding landet in der DB und matcht gegen andere leere Renderings.

**Vermeidung:** Bounding-Box nach STEP-Load prüfen:
```python
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRepBndLib import brepbndlib_Add

bbox = Bnd_Box()
brepbndlib_Add(shape, bbox)
x_min, y_min, z_min, x_max, y_max, z_max = bbox.Get()
volume = (x_max - x_min) * (y_max - y_min) * (z_max - z_min)
if volume < 1e-6:
    raise ValueError("INVALID_GEOMETRY:empty_bounding_box")
```

### Pitfall 5: conda-Umgebung vs. pip — Versionskonflikt

**Was schiefläuft:** `pip install` im gleichen conda-Env wie pythonocc kann OCC-Libraries überschreiben, da manche Pip-Packages native Libraries mitbringen (z.B. `vtk` hat eigene `libvtk*`). Konflikt zwischen conda-vtk und pip-vtk.

**Vermeidung:** Entweder:
- `vtk` nur über Pip installieren (vtk 9.4+ enthält OSMesa), pythonocc über conda
- Oder: pythonocc + vtk beide über conda-forge

**Empfehlung für Spike:** conda für pythonocc-core, pip für `torch transformers Pillow numpy psycopg2-binary pgvector boto3` (diese haben keine native Library-Konflikte).

---

## Code Examples

### Vollständige Struktur von process_step.py

```python
# MUSS GANZ OBEN STEHEN — vor allen OCC-Imports
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

import sys
import tempfile
import logging
import numpy as np
import boto3
import psycopg2
from pgvector.psycopg2 import register_vector
from PIL import Image
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Extend.TopologyUtils import TopologyExplorer
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRepBndLib import brepbndlib_Add
from OCC.Display.OCCViewer import Viewer3d
from OCC.Core.V3d import (V3d_Yneg, V3d_Ypos, V3d_Xneg, V3d_Xpos,
                           V3d_Zpos, V3d_Zneg, V3d_XposYnegZpos, V3d_XnegYposZneg)
from transformers import AutoImageProcessor, AutoModel
import torch

VIEWS = [
    ("front",     V3d_Yneg),
    ("rear",      V3d_Ypos),
    ("left",      V3d_Xneg),
    ("right",     V3d_Xpos),
    ("top",       V3d_Zpos),
    ("bottom",    V3d_Zneg),
    ("iso_front", V3d_XposYnegZpos),
    ("iso_rear",  V3d_XnegYposZneg),
]

def process(part_id: str):
    # 1. Status auf 'processing' setzen
    # 2. STEP von S3 laden
    # 3. Validieren (face_count, bbox)
    # 4. 8 Views rendern
    # 5. S3-Upload (512px Thumbnails)
    # 6. DINOv2 Embeddings (224px Input)
    # 7. Mean-Pool
    # 8. DB schreiben (embedding, thumbnail_urls, status='ready')
    pass

if __name__ == "__main__":
    part_id = sys.argv[1]
    process(part_id)
```

### Test: OSMesa funktioniert?

```python
# worker/test_renderer.py — Isolierter VTK+OSMesa-Test
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCC.Display.OCCViewer import Viewer3d

viewer = Viewer3d()
viewer.Create()
viewer.SetModeShaded()
box = BRepPrimAPI_MakeBox(10, 20, 30).Shape()
viewer.DisplayShape(box, update=True)
viewer.ExportToImage("/tmp/test_osmesa.png")
print("OSMesa-Rendering erfolgreich: /tmp/test_osmesa.png")
```

### Cosine-Similarity-Query zur Verifikation

```python
# Verifikation nach DB-Write: pgvector-Query testen
import psycopg2
from pgvector.psycopg2 import register_vector
import numpy as np

conn = psycopg2.connect(os.environ["DATABASE_URL"])
register_vector(conn)
cur = conn.cursor()

# Eigenes Embedding zurückfragen (Cosine-Ähnlichkeit muss ~1.0 sein)
test_embedding = np.load("/tmp/test_embedding.npy")
cur.execute("""
    SELECT id, 1 - (embedding <=> %s) AS similarity
    FROM parts
    WHERE status = 'ready'
    ORDER BY embedding <=> %s
    LIMIT 3
""", (test_embedding, test_embedding))
results = cur.fetchall()
print(f"Top-Match: id={results[0][0]}, similarity={results[0][1]:.4f}")
# Erwarteter Wert: similarity ≈ 1.0 für das eigene Part
```

---

## State of the Art

| Alter Ansatz | Aktueller Ansatz | Geändert in | Impact |
|--------------|-----------------|-------------|--------|
| vtk-osmesa (separates Pip-Paket) | vtk 9.4+ (OSMesa integriert) | VTK 9.4 (2024) | Kein separates vtk-osmesa-Paket; einfacherer Dockerfile |
| pythonocc-core 7.7 | pythonocc-core 7.9.3 | Februar 2026 | Aktuellste stabile Version; conda-forge verfügbar |
| IVFFlat-Index | HNSW-Index | pgvector 0.5.0 (2023) | HNSW wächst ohne Rebuild; Phase 1 hat bereits HNSW |

**Veraltet/nicht mehr verwenden:**
- `vtk-osmesa` Pip-Paket: Nicht mehr erforderlich ab vtk 9.4
- pythonOCC 7.6.x oder älter: 7.9.3 ist die aktuelle stabile Version

---

## Assumptions Log

| # | Claim | Abschnitt | Risiko bei Falsch |
|---|-------|----------|-------------------|
| A1 | CLS-Token (Index 0 in last_hidden_state) ist für geometrische Ähnlichkeitssuche besser als mean-pool der Patch-Tokens | Pattern 3 | Mean-pool könnte höhere Recall-Werte liefern; empirisch zu testen |
| A2 | `VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow` reicht aus für OSMesa-Auswahl in pythonocc | Pattern 2 | pythonocc nutzt möglicherweise andere Mechanismen; Test mit test_renderer.py klärt das sofort |
| A3 | pythonocc 7.9.3 unterstützt `V3d_XnegYposZneg` als Orientierungskonstante | Pattern 2 | Ältere pythonocc-Demos verwenden nur 6 standard Views; isometrische Rückseitenansicht könnte anders heißen |
| A4 | conda-forge pythonocc 7.9.3 funktioniert in `continuumio/miniconda3:latest` ohne manuelle OCCT-Build-Schritte | Standard Stack | Build könnte fehlschlagen; FreeCAD-Fallback (D-02) wäre dann Lösung |

---

## Open Questions

1. **Isometrische Rückseitenansicht — Korrekte V3d-Konstante?**
   - Was bekannt ist: `V3d_XposYnegZpos` ist front-isometrisch (vorne-rechts-oben)
   - Unklar: Welche Konstante ist die exakte Rückseite? `V3d_XnegYposZneg` erscheint logisch, ist aber nicht in der offiziellen Demo zu sehen
   - Empfehlung: `test_renderer.py` mit verschiedenen Konstanten testen; Bilder visuell prüfen

2. **CPU-Inferenzzeit für DINOv2 ViT-B/14 auf typischer CI-Hardware**
   - Was bekannt ist: Schätzung 0.5–2s pro View × 8 Views = 4–16s
   - Unklar: Konkrete Zeit auf ARM-Entwickler-Mac vs. Linux-Docker-Container
   - Empfehlung: `timeit`-Benchmark in test-Skript einbauen; für Spike akzeptabel, für Phase 3 relevant

3. **Neon vs. Supabase — DATABASE_URL Format**
   - Was bekannt ist: Phase 1 nutzte Neon als PostgreSQL-Anbieter; `src/lib/db.ts` verwendet `DATABASE_URL`
   - Unklar: Pooler-URL (Session-Mode) vs. direkte URL für psycopg2
   - Empfehlung: Neon-Dashboard prüfen; für psycopg2 die "Direct connection"-URL verwenden, nicht den Connection-Pooler

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|---------|
| Docker | Container-Build | ✗ | — | Entwickler-Mac hat kein Docker; muss installiert werden (Docker Desktop) |
| conda / miniconda | pythonocc-core install | ✗ | — | Über Docker-Image `continuumio/miniconda3:latest` verfügbar |
| Python 3.11+ | Worker-Skript | ✓ | 3.9.6 (System) | Zu alt für pythonocc 7.9.3; Docker-Image bringt eigenes Python mit |
| AWS S3 Buckets | Thumbnail-Upload | [ASSUMED] | — | Aus Phase 1 D-09 bekannt; Bucket-Namen in .env.local.example |
| Neon DATABASE_URL | DB-Schreiben | [ASSUMED] | — | Aus Phase 1 bekannt; Worker braucht direkte (non-Pooler) URL |

**Missing dependencies with no fallback:**
- Docker (muss installiert werden vor Phase-2-Ausführung)

**Missing dependencies with fallback:**
- Python 3.9 auf Host-System: Docker-Container bringt Python 3.11/3.12 mit — kein Problem

**Step 2.6: SKIPPED für conda/pip** — alle Python-Dependencies werden im Docker-Build installiert, nicht auf dem Host.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Kein Testframework (Spike — direktes Skript-Ausführen) |
| Config file | Kein pytest.ini — manuelle Verifikation via Ausgabe und Dateiinspektion |
| Quick run command | `docker run --rm bauteil-worker python test_renderer.py` |
| Full suite command | `docker run --rm --env-file .env bauteil-worker python process_step.py <test-part-id>` |

### Phase Requirements → Test Map

| Req ID | Verhalten | Test-Typ | Automatisierter Befehl | Datei vorhanden? |
|--------|-----------|---------|----------------------|----------------|
| INGEST-03 | 6–8 orthografische PNG-Thumbnails werden erzeugt | Smoke | `docker run --rm bauteil-worker python test_renderer.py` | ❌ Wave 0 |
| INGEST-03 | DINOv2 erzeugt 768-dim Embedding | Smoke | `docker run --rm bauteil-worker python -c "from embedder import get_embedding; e=get_embedding('/tmp/view_front.png'); assert e.shape==(768,)"` | ❌ Wave 0 |
| INGEST-03 | Embedding wird in Neon geschrieben und via pgvector abgefragt | Integration | `docker run --rm --env-file .env bauteil-worker python process_step.py <uuid>` → psql-Query prüft | ❌ Wave 0 |
| D-08 | Face-Count < 4 = INVALID_GEOMETRY Fehler | Unit | `docker run --rm --env-file .env bauteil-worker python -c "from renderer import load_step, count_faces; ..."` | ❌ Wave 0 |

### Sampling Rate

- **Pro Task-Commit:** `docker build -t bauteil-worker worker/ && docker run --rm bauteil-worker python test_renderer.py`
- **Pro Wave-Merge:** Vollständiger End-to-End-Test mit echter STEP-Datei + DB-Verifikation
- **Phase Gate:** Alle 5 Success Criteria aus ROADMAP.md erfüllt (außer SC #5 FastAPI/Celery — per D-10 deferred)

### Wave 0 Gaps

- [ ] `worker/test_renderer.py` — isolierter OSMesa-Test (muss zuerst)
- [ ] `worker/testdata/sample.step` — Testdatei (einfacher Würfel via FreeCAD oder von grabcad.com)
- [ ] `worker/Dockerfile` — continuumio/miniconda3 Basis mit apt-Paketen und conda/pip-Install
- [ ] `worker/.env.example` — alle erforderlichen Env-Vars dokumentiert

---

## Projekt-Constraints (aus CLAUDE.md)

| Direktive | Relevant für Phase 2? | Impact |
|-----------|-----------------------|--------|
| Secrets nie in git committen | Ja | `worker/.env` in `.gitignore`, nur `.env.example` committed |
| RLS deaktiviert (pilot-Entscheidung D-06) | Ja | Worker nutzt SERVICE_ROLE_KEY für direkte DB-Schreibrechte |
| worker/ in Repo-Root (D-11) | Ja | Kein src/worker, kein /services/worker |
| Nein zu FastAPI/Celery in Phase 2 (D-10) | Ja | Scope strikt: nur process_step.py + Dockerfile |
| Embedding: DINOv2 ViT-B/14, 768-dim (CLAUDE.md kritische Entscheidung) | Ja | `facebook/dinov2-base` — nicht dinov2-small (384-dim) oder dinov2-large (1024-dim) |
| HNSW (NIEMALS IVFFlat) (CLAUDE.md kritische Entscheidung) | Indirekt | Phase 1 hat HNSW-Index bereits; Worker-Queries nutzen automatisch |

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Betroffen | Standard Control |
|---------------|-----------|-----------------|
| V2 Authentication | Nein | Spike hat kein HTTP-Endpoint |
| V3 Session Management | Nein | Kein Session-State |
| V4 Access Control | Ja | DATABASE_URL mit SERVICE_ROLE — nie im Git; nur über Env-Var |
| V5 Input Validation | Ja | STEP-Datei-Validierung: face_count, bbox-Volume |
| V6 Cryptography | Nein | Keine Kryptografie im Spike |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed STEP (zip-bomb equivalent: große Assemblies) | DoS | Face-Count-Validierung; STEP kommt aus eigenem S3-Bucket (nicht von externen) |
| DATABASE_URL im Docker-Image gebacken | Information Disclosure | Env-Vars via `--env-file`, nie im Dockerfile hardcodiert |
| Hugging Face Download zur Laufzeit | Verfügbarkeit | Modell beim Build cachen (TRANSFORMERS_CACHE im Dockerfile) |

---

## Sources

### Primary (HIGH confidence)
- [pythonocc-core GitHub](https://github.com/tpaviot/pythonocc-core) — Version 7.9.3 (Feb 2026), Installation, OCCViewer.py View-Methoden
- [pythonocc-demos: core_offscreen_rendering.py](https://github.com/tpaviot/pythonocc-demos/blob/master/examples/core_offscreen_rendering.py) — Exaktes Offscreen-Rendering-Pattern
- [VTK Python Wheels Dokumentation](https://docs.vtk.org/en/latest/advanced/available_python_wheels.html) — OSMesa ab VTK 9.4 integriert, `VTK_DEFAULT_OPENGL_WINDOW`
- [pgvector-python GitHub](https://github.com/pgvector/pgvector-python) — `register_vector()`, psycopg2-Integration
- [facebook/dinov2-base HuggingFace](https://huggingface.co/facebook/dinov2-base) — 768-dim, CLS-Token, AutoImageProcessor

### Secondary (MEDIUM confidence)
- [pythonocc-demos: face_recognition_from_stepfile.py](https://github.com/tpaviot/pythonocc-demos/blob/master/examples/core_geometry_face_recognition_from_stepfile.py) — TopologyExplorer Face-Count-Pattern
- [pythonocc-core OCCViewer.py](https://github.com/tpaviot/pythonocc-core/blob/master/src/Display/OCCViewer.py) — View_Top, View_Front, etc. via V3d_TypeOfOrientation-Konstanten
- [pythonocc-core DataExchange.py](https://github.com/tpaviot/pythonocc-core/blob/master/src/Extend/DataExchange.py) — STEPControl_Reader Pattern
- [Neon + pgvector OpenAI Cookbook](https://cookbook.openai.com/examples/vector_databases/neon/neon-postgres-vector-search-pgvector) — Neon-spezifische Verbindungsdetails

### Tertiary (LOW confidence — für Validierung bestätigen)
- WebSearch: VTK_DEFAULT_OPENGL_WINDOW für OSMesa in Docker (mehrere Quellen übereinstimmend, aber nicht offiziell in pythonocc-Doku verlinkt)
- WebSearch: isometrische Rückseitenansicht `V3d_XnegYposZneg` — plausibel aber nicht aus Demos verifiziert

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — pythonocc 7.9.3 via conda-forge verifiziert; VTK-OSMesa-Integration via offizielle VTK-Docs verifiziert
- Architecture: HIGH — Workflow basiert auf etablierten pythonOCC-Demos und Phase-1-Artefakten
- OSMesa-in-Docker: MEDIUM — Env-Var-Mechanismus dokumentiert, aber Container-spezifisches Verhalten muss empirisch bestätigt werden (test_renderer.py)
- DINOv2 CLS vs. mean-pool: MEDIUM — CLS empfohlen per offizieller Doku, empirische Validierung für CAD-Domain steht aus

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stabil; vtk/pythonocc-Versionen langsam im Wandel)
