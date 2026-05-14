FROM continuumio/miniconda3:latest

# Systemabhängigkeiten für OSMesa (RESEARCH.md Pitfall 3: libGL muss vorhanden sein)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
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

# Dateien als worker/-Paket kopieren, damit uvicorn/celery worker.main finden
COPY . ./worker/
