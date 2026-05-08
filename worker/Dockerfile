FROM continuumio/miniconda3:latest

# Systemabhängigkeiten für OSMesa (RESEARCH.md Pitfall 3: libGL muss vorhanden sein)
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
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

# DINOv2-Modell beim Build cachen — kein Download zur Laufzeit (RESEARCH.md Pitfall 2)
# ~330 MB; Build-Zeit ~3 Minuten beim ersten Mal
ENV TRANSFORMERS_CACHE=/app/model_cache
RUN python -c "from transformers import AutoImageProcessor, AutoModel; \
    AutoModel.from_pretrained('facebook/dinov2-base'); \
    AutoImageProcessor.from_pretrained('facebook/dinov2-base')"

COPY . .
