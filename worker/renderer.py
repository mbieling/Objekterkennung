# worker/renderer.py
# WARNUNG: Die folgende Zeile MUSS vor allen OCC-Imports stehen (RESEARCH.md Pitfall 1)
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

import logging

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

logger = logging.getLogger(__name__)

# 8 Views: 6 orthografisch + 2 isometrisch (D-04)
VIEWS = [
    ("front",     V3d_Yneg),       # Vorderansicht
    ("rear",      V3d_Ypos),       # Rückansicht
    ("left",      V3d_Xneg),       # Linksansicht
    ("right",     V3d_Xpos),       # Rechtsansicht
    ("top",       V3d_Zpos),       # Draufsicht
    ("bottom",    V3d_Zneg),       # Untersicht
    ("iso_front", V3d_XposYnegZpos),   # Isometrisch vorne-rechts-oben
    ("iso_rear",  V3d_XnegYposZneg),   # Isometrisch hinten-links-unten (A3: zu bestätigen)
]


def load_step(filename: str):
    """Lädt eine STEP-Datei und gibt das TopoDS_Shape zurück.

    Raises:
        ValueError: Bei Lese- oder Transfer-Fehler ("STEP_READ_ERROR:status=N")
    """
    reader = STEPControl_Reader()
    status = reader.ReadFile(filename)
    if status != IFSelect_RetDone:
        raise ValueError(f"STEP_READ_ERROR:status={status}")
    reader.TransferRoots()
    shape = reader.Shape(1)
    return shape


def validate_geometry(shape) -> None:
    """Validiert die Geometrie gegen D-08 (face_count) und Pitfall 4 (bbox).

    Raises:
        ValueError: "INVALID_GEOMETRY:face_count=N" wenn face_count < 4
        ValueError: "INVALID_GEOMETRY:empty_bounding_box" wenn Volumen < 1e-6
    """
    # Prüfung 1: Face-Count (D-08) — weniger als 4 Faces = kein sinnvoller 3D-Körper
    explorer = TopologyExplorer(shape)
    face_count = len(list(explorer.faces()))
    if face_count < 4:
        raise ValueError(f"INVALID_GEOMETRY:face_count={face_count}")
    logger.info(f"Geometrie-Validierung: {face_count} Faces gefunden")

    # Prüfung 2: Bounding-Box-Volumen (RESEARCH.md Pitfall 4)
    # Leere Formen erzeugen weiße Bilder → DINOv2 berechnet Embedding für weißes Bild
    bbox = Bnd_Box()
    brepbndlib_Add(shape, bbox)
    x_min, y_min, z_min, x_max, y_max, z_max = bbox.Get()
    volume = (x_max - x_min) * (y_max - y_min) * (z_max - z_min)
    if volume < 1e-6:
        raise ValueError("INVALID_GEOMETRY:empty_bounding_box")
    logger.info(f"Bounding-Box-Volumen: {volume:.4f}")


def render_views(shape, output_dir: str) -> list[str]:
    """Rendert 8 Views (D-04) als 512x512px PNG-Dateien (D-06).

    Args:
        shape: TopoDS_Shape (validiert — validate_geometry() wurde bereits aufgerufen)
        output_dir: Verzeichnis für PNG-Ausgabe (muss existieren)

    Returns:
        Liste mit 8 PNG-Pfaden: [output_dir/view_0.png, ..., output_dir/view_7.png]
    """
    viewer = Viewer3d()
    viewer.Create()
    viewer.View.Window().SetSize(512, 512)  # IN-03 Fix: explizite Auflösung statt VTK-Default
    viewer.SetModeShaded()
    # Weißer Hintergrund (D-05): maximaler Kontrast für dunkle Metallbauteile
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])
    viewer.DisplayShape(shape, update=True)

    paths = []
    try:
        for i, (name, orientation) in enumerate(VIEWS):
            viewer.View.SetProj(orientation)
            viewer.FitAll()  # Automatischer Kamera-Abstand aus Bounding-Box
            path = os.path.join(output_dir, f"view_{i}.png")  # view_0..view_7 (S3-Pfadkonvention)
            viewer.ExportToImage(path)
            paths.append(path)
            logger.info(f"View {i} ({name}): {path}")
    finally:
        # CR-02 Fix: Nativen Render-Kontext explizit freigeben (verhindert Speicherleck bei Batch-Betrieb)
        try:
            viewer.Viewer.Remove()
        except Exception:
            pass

    return paths  # 8 PNG-Pfade (512x512px explizit gesetzt)
