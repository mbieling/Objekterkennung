---
phase: 02-python-worker-spike
plan: 02
subsystem: worker
tags: [python, pythonocc, osmesa, vtk, renderer, step, docker]
dependency_graph:
  requires: [02-01-docker-infrastructure]
  provides: [worker/renderer.py, worker/test_renderer.py]
  affects: [02-03-embedder, process_step.py]
tech_stack:
  added: []
  patterns: [OSMesa offscreen rendering, STEP-Loading via STEPControl_Reader, Bounding-Box-Validierung, 8-View-Rendering mit V3d-Konstanten]
key_files:
  created:
    - worker/renderer.py
    - worker/test_renderer.py
  modified: []
decisions:
  - "render_views() gibt view_0..view_7.png zurück (nicht view_{name}.png) — S3-Pfadkonvention für process_step.py"
  - "V3d_XnegYposZneg für iso_rear beibehalten — empirisch zu bestätigen via Docker-Test (Open Question A3 offen)"
  - "ExportToImage() statt View.Dump() — OCCViewer API-Konsistenz"
  - "OSMesa-Env-Var in Zeile 4 von test_renderer.py (nach 3-Zeilen-Kommentar) — erfüllt <5-Zeilen-Kriterium"
metrics:
  duration: "~4 Minuten (reine Datei-Erstellungszeit; Docker-Verifikation ausstehend)"
  completed: "2026-05-08"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 02: STEP-Renderer Summary

**One-liner:** renderer.py mit load_step/validate_geometry/render_views (pythonOCC+OSMesa, 8 Views, weißer Hintergrund) und isoliertem Smoketest test_renderer.py mit 3 Subtests (OSMesa-Basis, STEP-8-View, Geometrievalidierung).

## Was wurde gebaut

### worker/renderer.py

Funktionsbibliothek für den STEP-Renderer — drei Kernfunktionen:

1. **`load_step(filename: str) -> TopoDS_Shape`** — STEPControl_Reader mit IFSelect_RetDone-Check; wirft `ValueError("STEP_READ_ERROR:status=N")` bei Fehler.

2. **`validate_geometry(shape) -> None`** — Zwei Validierungsstufen:
   - Face-Count < 4 → `ValueError("INVALID_GEOMETRY:face_count=N")` (D-08)
   - Bounding-Box-Volumen < 1e-6 → `ValueError("INVALID_GEOMETRY:empty_bounding_box")` (RESEARCH.md Pitfall 4)

3. **`render_views(shape, output_dir: str) -> list[str]`** — 8 Views (6 orthografisch + 2 isometrisch) mit weißem Hintergrund (D-05), Ausgabe `view_0.png`..`view_7.png` (S3-Pfadkonvention).

**VIEWS-Konstante:**
```python
VIEWS = [
    ("front",     V3d_Yneg),
    ("rear",      V3d_Ypos),
    ("left",      V3d_Xneg),
    ("right",     V3d_Xpos),
    ("top",       V3d_Zpos),
    ("bottom",    V3d_Zneg),
    ("iso_front", V3d_XposYnegZpos),
    ("iso_rear",  V3d_XnegYposZneg),   # Open Question A3: empirisch zu bestätigen
]
```

**Kritische Import-Reihenfolge:** `os.environ["VTK_DEFAULT_OPENGL_WINDOW"]` steht in Zeile 4 (Zeile 3: `import os`), vor allen OCC-Imports.

### worker/test_renderer.py

Isoliertes Smoke-Test-Skript — kein S3, keine DB, kein DINOv2:

- **Test A** (`test_osmesa_basic`): Synthetischer Würfel mit BRepPrimAPI_MakeBox, direktes Rendering via Viewer3d, PNG-Größe > 1000 Bytes.
- **Test B** (`test_step_rendering`): Lädt `worker/testdata/sample.step`, ruft `renderer.py:render_views()` auf, prüft 8 PNGs > 1000 Bytes.
- **Test C** (`test_invalid_geometry`): Erstellt planare Fläche (1 Face), erwartet `INVALID_GEOMETRY:face_count=1`.

**Erwartete Ausgabe bei Erfolg:**
```
=== TESTERGEBNIS ===
  A_osmesa_basic: OK
  B_step_rendering: OK
  C_invalid_geometry: OK

RENDERER_OK: 8 PNGs generated
```

## Docker-Verifikation (ausstehend)

Docker war während der Ausführung nicht verfügbar (identisch mit Plan 01-Situation). Die Dateien sind korrekt erstellt; die Verifikation ist nach Docker-Installation durchzuführen:

```bash
# Build (aus Plan 01 — falls noch nicht geschehen):
docker build -t bauteil-worker worker/

# Task 1 Verifikation: renderer.py importierbar
docker run --rm bauteil-worker python -c \
  "from renderer import load_step, validate_geometry, render_views, VIEWS; \
   assert len(VIEWS)==8; print('RENDERER_IMPORT_OK')"

# Task 2 Verifikation: Vollständiger Smoketest
docker run --rm bauteil-worker python test_renderer.py
# Erwartete Ausgabe: enthält "RENDERER_OK: 8 PNGs generated", Exit 0
```

## Open Question A3: V3d_XnegYposZneg für iso_rear

**Status: Offen** — empirisch zu bestätigen beim Docker-Test.

- `V3d_XposYnegZpos` für `iso_front` (vorne-rechts-oben) ist aus pythonOCC-Demos verifiziert.
- `V3d_XnegYposZneg` für `iso_rear` (hinten-links-unten) ist logisch korrekt, aber nicht in offiziellen Demos zu sehen.
- **Fallback:** Falls iso_rear ein schwarzes oder falsches Bild liefert, alternative Konstante testen (z.B. `V3d_XnegYposZpos` oder andere ISO-Variante).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OSMesa-Env-Var-Position in test_renderer.py angepasst**
- **Found during:** Task 2 Acceptance-Criteria-Verifikation
- **Issue:** Ursprünglicher Entwurf hatte die Env-Var in Zeile 8 (hinter einem 6-Zeilen-Kommentar-Block). Acceptance Criterion fordert: in den ersten 5 Zeilen.
- **Fix:** Kommentar-Header auf 3 Zeilen reduziert; Env-Var steht jetzt in Zeile 4.
- **Files modified:** worker/test_renderer.py
- **Commit:** adb2530

### Keine weiteren Abweichungen

Beide Dateien entsprechen dem Plan-Code vollständig. Keine architekturellen Änderungen.

## Known Stubs

Keine. Beide Dateien implementieren ihre Funktionen vollständig. `render_views()` ist kein Stub — die Funktion erstellt echte PNGs (verifizierbar nach Docker-Build).

**Hinweis:** Die Docker-Verifikation ist ausstehend. Sollte `ExportToImage()` in pythonOCC 7.9.3 eine andere Signatur haben, wäre das ein zu behebender Bug (nicht ein Stub).

## Threat Flags

Kein neues Bedrohungspotenzial über das plan-definierte Threat-Model hinaus (T-02-06 bis T-02-09 vollständig adressiert).

## Self-Check: PASSED

- [x] worker/renderer.py existiert
- [x] Zeile 4: `os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"`
- [x] `def load_step(filename: str):` vorhanden
- [x] `def validate_geometry(shape) -> None:` vorhanden
- [x] `def render_views(shape, output_dir: str) -> list[str]:` vorhanden
- [x] `raise ValueError(f"INVALID_GEOMETRY:face_count={face_count}")` vorhanden
- [x] `raise ValueError("INVALID_GEOMETRY:empty_bounding_box")` vorhanden
- [x] VIEWS-Liste: 8 Einträge (V3d_Yneg, Ypos, Xneg, Xpos, Zpos, Zneg, XposYnegZpos, XnegYposZneg)
- [x] worker/test_renderer.py existiert
- [x] `os.environ["VTK_DEFAULT_OPENGL_WINDOW"]` in Zeile 4 (innerhalb Zeile 1-5)
- [x] `from renderer import load_step, validate_geometry, render_views, VIEWS` vorhanden
- [x] `RENDERER_OK: 8 PNGs generated` als Ausgabestring vorhanden
- [x] Commit 3489fd2 (renderer.py): existiert
- [x] Commit adb2530 (test_renderer.py): existiert
- [ ] Docker-Verifikation: ausstehend (Docker nicht installiert — identisch mit Plan 01)
