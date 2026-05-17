FROM continuumio/miniconda3:latest

# Systemabhängigkeiten für OSMesa (RESEARCH.md Pitfall 3: libGL muss vorhanden sein)
# X11-Libs (libxft2 etc.) werden von gmsh/trimesh beim STEP-Laden gebraucht (Hebel 4 — Shape Foundation Model)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libxft2 \
    libxcursor1 \
    libxinerama1 \
    libxmu6 \
    libxi6 \
    libglu1-mesa \
    curl \
    xvfb \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# OSMesa erzwingen — VOR allen VTK/OCC-Imports (RESEARCH.md Pitfall 1)
# Gilt auch für docker exec -Aufrufe außerhalb des Entrypoints
ENV VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow

# conda: pythonocc-core 7.9.3 aus conda-forge
# NICHT zusätzlich vtk via conda — Pitfall 5: conda-vtk vs. pip-vtk Konflikt
COPY environment.yml .
RUN conda env update -n base -f environment.yml && conda clean -afy

# pip: restliche Pakete (kein pythonocc — das ist in conda)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# HF_HOME: Modell-Cache-Pfad — wird per Docker Volume persistiert (docker-compose.yml)
ENV HF_HOME=/app/model_cache

# DINOv3-large vorab herunterladen (~1.3 GB), damit erster Embedding-Aufruf nicht
# 30+ Sekunden blockiert. Bei Modellwechsel hier den Namen anpassen — muss mit
# worker/embedder.py:_MODEL_NAME übereinstimmen.
#
# DINOv3 benötigt einen authentifizierten Hugging-Face-Zugriff (Privacy Policy
# muss auf der Modell-Seite einmal bestätigt werden). Für den Pre-Download im
# Build muss daher HF_TOKEN beim `docker build` als --build-arg/--secret übergeben
# werden — ohne Token schlägt der Download still fehl und das Modell wird beim
# ersten Worker-Start zur Laufzeit nachgezogen (HF_TOKEN aus worker/.env).
# ARG (nicht ENV) → Token landet NICHT als persistente Environment-Variable im Image-Layer.
# Wird nur an dieses einzelne RUN-Command durchgereicht. Zur Laufzeit kommt HF_TOKEN aus
# worker/.env via docker-compose.
ARG HF_TOKEN
RUN HF_TOKEN="${HF_TOKEN}" python -c "from transformers import AutoImageProcessor, AutoModel; AutoImageProcessor.from_pretrained('facebook/dinov3-vitl16-pretrain-lvd1689m'); AutoModel.from_pretrained('facebook/dinov3-vitl16-pretrain-lvd1689m')" || \
    echo "DINOv3-large pre-download fehlgeschlagen — Modell wird beim ersten Aufruf geladen (HF_TOKEN in worker/.env nötig)"

# rembg U²Net-Modell vorab herunterladen, damit erster Suchaufruf nicht blockiert.
# Standardpfad: ~/.u2net/u2net.onnx (~170 MB) — wir setzen explizit U2NET_HOME.
ENV U2NET_HOME=/app/u2net_cache
RUN python -c "from rembg import new_session; new_session('u2net')" || \
    echo "rembg pre-download fehlgeschlagen — Modell wird beim ersten Aufruf geladen"

# Hebel 4 — Shape Foundation Model (3D-Mesh-Embeddings für Re-Ranking).
# torch-geometric + torch-cluster + torch-scatter sind PyG-Companion-Pakete, die
# Shape für radius-search im MAGNO-Encoder braucht. CPU-Wheels von data.pyg.org —
# müssen zur installierten torch-Version passen (siehe requirements.txt: torch>=2.6).
# Wenn die Installation scheitert (Versions-Konflikt, Network-Fehler), läuft die
# Pipeline ohne Shape weiter (siehe worker/shape_embedder.py — graceful fallback bei ImportError).
RUN pip install --no-cache-dir torch-geometric>=2.5.0 || \
    echo "torch-geometric pre-install fehlgeschlagen — Shape-Re-Ranking wird übersprungen"
RUN pip install --no-cache-dir torch-cluster torch-scatter \
    -f https://data.pyg.org/whl/torch-2.9.1+cpu.html || \
    echo "torch-cluster/torch-scatter pre-install fehlgeschlagen — Shape-Re-Ranking wird übersprungen"
RUN pip install --no-cache-dir "git+https://github.com/simd-ai/shape@main" || \
    echo "shape-foundation Install fehlgeschlagen — Shape-Re-Ranking wird übersprungen"

# Shape-Checkpoint vorab herunterladen (~80MB). HF_HOME unten ist bereits gesetzt,
# huggingface_hub schreibt nach /app/model_cache. Im shape_embedder.py wird
# SHAPE_CHECKPOINT_PATH gelesen, default zeigt auf den hier abgelegten Pfad.
ENV SHAPE_CHECKPOINT_PATH=/app/model_cache/shape-foundation-small-v3/checkpoint_final.pt
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('bayang/shape-foundation-small-v3', local_dir='/app/model_cache/shape-foundation-small-v3', allow_patterns=['checkpoint_final.pt', 'small.yaml'])" || \
    echo "Shape-Checkpoint pre-download fehlgeschlagen — Re-Ranking startet ohne Modell"

# Dateien als worker/-Paket kopieren, damit uvicorn/celery worker.main finden
COPY . ./worker/
