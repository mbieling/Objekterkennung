---
phase: 02-python-worker-spike
plan: 01
subsystem: worker
tags: [docker, python, pythonocc, dinov2, conda, step]
dependency_graph:
  requires: []
  provides: [worker/Dockerfile, worker/environment.yml, worker/requirements.txt, worker/.env.example, worker/testdata/sample.step]
  affects: [02-02-renderer, 02-03-embedder]
tech_stack:
  added: [continuumio/miniconda3, pythonocc-core=7.9.3, vtk>=9.4, torch>=2.3, transformers>=4.41, psycopg2-binary, pgvector, boto3]
  patterns: [OSMesa offscreen rendering, DINOv2 build-time caching, conda+pip separation]
key_files:
  created:
    - worker/Dockerfile
    - worker/environment.yml
    - worker/requirements.txt
    - worker/.env.example
    - worker/testdata/sample.step
  modified:
    - .gitignore
decisions:
  - "conda für pythonocc-core, pip für restliche Pakete (Pitfall 5 vermieden)"
  - "DINOv2 beim Docker-Build cachen (TRANSFORMERS_CACHE=/app/model_cache)"
  - "environment.yml mit conda env update -n base (nicht neues conda-env) für einfacheren Aufruf"
metrics:
  duration: "98 Sekunden (reine Datei-Erstellungszeit; Docker-Build noch ausstehend)"
  completed: "2026-05-08"
  tasks_completed: 2
  files_created: 5
  files_modified: 1
---

# Phase 02 Plan 01: Docker-Infrastruktur Python Worker Summary

**One-liner:** continuumio/miniconda3 Dockerfile mit OSMesa-Libs, pythonocc-core=7.9.3 via conda-forge, DINOv2-Build-Cache und vollständiger Env-Var-Dokumentation.

## Was wurde gebaut

Fünf Dateien die das Fundament des Python Worker Containers bilden:

1. **worker/Dockerfile** — Multi-Layer-Build: apt-Systemlibs (libgl1-mesa-glx, libglib2.0-0, libgomp1) -> conda env update (pythonocc 7.9.3) -> pip install (vtk, torch, transformers etc.) -> DINOv2-Modell-Cache. OSMesa-Env-Var als ENV-Direktive gesetzt.

2. **worker/environment.yml** — Conda-Umgebungsdefinition mit `name: base` (kein neues conda-env, Update von base) und pythonocc-core=7.9.3 aus conda-forge.

3. **worker/requirements.txt** — pip-Paketliste (vtk>=9.4, torch>=2.3, transformers>=4.41, Pillow, numpy, psycopg2-binary, pgvector, boto3, python-dotenv). Bewusst ohne pythonocc (Pitfall 5).

4. **worker/.env.example** — Alle 6 Env-Vars mit Kommentaren und Fundort-Hinweisen. Kritischer Hinweis: Neon direkte Connection-URL verwenden (nicht Pooler-URL) für psycopg2.

5. **worker/testdata/sample.step** — Manuell erstellte ISO-10303-21 STEP-Datei (4698 Bytes, Würfel 10x10x10mm). Enthält ADVANCED_BREP_SHAPE_REPRESENTATION mit CLOSED_SHELL und 6 ADVANCED_FACEs.

## Docker-Build-Zeit

Der Docker-Build (`docker build -t bauteil-worker worker/`) wurde in dieser Phase NICHT ausgeführt — das Entwickler-Mac hat Docker Desktop nicht vorinstalliert (dokumentiert in RESEARCH.md Environment Availability). Die Dateien sind korrekt erstellt; der Build und die Container-Smoke-Tests sind manuell nach Docker-Installation auszuführen.

**Erwartete Build-Zeit:** 10–20 Minuten beim ersten Build (DINOv2-Download ~330MB + conda pythonocc-Installation).

## DINOv2-Cache

Implementiert via:
```dockerfile
ENV TRANSFORMERS_CACHE=/app/model_cache
RUN python -c "from transformers import AutoImageProcessor, AutoModel; \
    AutoModel.from_pretrained('facebook/dinov2-base'); \
    AutoImageProcessor.from_pretrained('facebook/dinov2-base')"
```
Ob dies beim Build funktioniert: **noch nicht verifiziert** (Docker nicht installiert). Erwartet: ja, da Internet beim Build-Zeit verfügbar.

## sample.step Methode

**Manuell erstellt** (nicht via pythonOCC-Generator). Die Datei enthält eine vollständige ADVANCED_BREP-Darstellung mit 6 Faces (CLOSED_SHELL). Ob pythonOCC den Würfel korrekt lädt und >= 6 Faces zurückgibt, ist beim Docker-Build zu verifizieren:

```bash
docker run --rm -v $(pwd)/worker/testdata:/data bauteil-worker python -c \
  "from OCC.Core.STEPControl import STEPControl_Reader; \
   from OCC.Core.IFSelect import IFSelect_RetDone; \
   from OCC.Extend.TopologyUtils import TopologyExplorer; \
   r=STEPControl_Reader(); \
   assert r.ReadFile('/data/sample.step')==IFSelect_RetDone; \
   r.TransferRoots(); \
   shape=r.Shape(1); \
   faces=list(TopologyExplorer(shape).faces()); \
   print(f'STEP_VALID faces={len(faces)}')"
```

**Fallback falls sample.step nicht korrekt lädt:** STEP-Datei via pythonOCC im Container generieren (aus PLAN.md Task-2-Action beschrieben).

## Pitfall-Treffer

Keine beim Erstellen der Dateien. Alle 5 Pitfalls aus RESEARCH.md wurden präventiv adressiert:

| Pitfall | Prävention |
|---------|-----------|
| P1: VTK vor OSMesa-Env-Var | `ENV VTK_DEFAULT_OPENGL_WINDOW=vtkOSOpenGLRenderWindow` im Dockerfile als erste ENV-Direktive |
| P2: DINOv2-Download zur Laufzeit | TRANSFORMERS_CACHE + Build-Time-Download im Dockerfile |
| P3: Fehlendes libGL | `libgl1-mesa-glx` in apt-get install Block |
| P4: Leere STEP-Renderings | sample.step hat explizite Geometrie (6 Faces, 10x10x10 Bounding-Box) |
| P5: conda+pip Versionskonflikt | vtk nur in requirements.txt (pip), pythonocc nur in environment.yml (conda) |

## Face-Count von sample.step

Erwartet: 6 Faces (CLOSED_SHELL mit 6 ADVANCED_FACEs). Tatsächlicher Wert aus pythonOCC: **noch nicht gemessen** (Docker nicht installiert). Wird in Plan 02-02 (renderer.py) verifiziert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] worker/.env zu .gitignore hinzugefügt**
- **Found during:** Task 2
- **Issue:** Threat T-02-02 aus dem Plan verlangt explizit `worker/.env` in .gitignore; die Datei war dort nicht eingetragen
- **Fix:** `.gitignore` um Eintrag `worker/.env` ergänzt
- **Files modified:** .gitignore
- **Commit:** d4e94ab

**2. [Rule 2 - Completeness] sample.step manuell als vollständige B-Rep erstellt**
- **Found during:** Task 2
- **Issue:** Die im Plan bereitgestellte minimale STEP-Datei war keine vollständige B-Rep (enthielt nur CARTESIAN_POINTs und DIRECTIONs ohne FACE/EDGE/WIRE-Topologie). pythonOCC-STEPControl_Reader würde beim Transfer keine Faces finden.
- **Fix:** Vollständige ADVANCED_BREP-STEP-Datei mit 6 ADVANCED_FACE-Entitäten, EDGE_LOOP, EDGE_CURVE, VERTEX_POINT erstellt.
- **Files modified:** worker/testdata/sample.step
- **Commit:** d4e94ab

## Known Stubs

Keine Stubs in diesem Plan (reine Konfigurationsdateien, keine Python-Logik).

## Threat Flags

Kein neues Bedrohungspotenzial über das plan-definierte Threat-Model hinaus.

## Pending Manual Verification

Die folgenden Acceptance Criteria können erst nach Docker-Installation verifiziert werden:

- [ ] `docker build -t bauteil-worker worker/` endet mit Exit 0
- [ ] `docker run --rm bauteil-worker python -c "import OCC; print('OCC_OK')"` gibt `OCC_OK`
- [ ] `docker run --rm bauteil-worker python -c "import torch; print(torch.__version__)"` gibt >=2.3
- [ ] OSMesa-Env-Var im Container: `docker run --rm bauteil-worker env | grep VTK_DEFAULT_OPENGL_WINDOW`
- [ ] sample.step lädt mit pythonOCC und liefert >= 6 Faces

## Self-Check: PASSED

- [x] worker/Dockerfile existiert: `FROM continuumio/miniconda3:latest`, `ENV VTK_DEFAULT_OPENGL_WINDOW`, `ENV TRANSFORMERS_CACHE`, `libgl1-mesa-glx`
- [x] worker/environment.yml existiert: `pythonocc-core=7.9.3`
- [x] worker/requirements.txt existiert: `vtk>=9.4`, kein pythonocc
- [x] worker/.env.example existiert: DATABASE_URL, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_STEPS, AWS_S3_BUCKET_THUMBNAILS
- [x] worker/testdata/sample.step existiert: ISO-10303-21 Header, 4698 Bytes
- [x] .gitignore: worker/.env eingetragen
- [x] Commits: 13906ff (Task 1), d4e94ab (Task 2)
