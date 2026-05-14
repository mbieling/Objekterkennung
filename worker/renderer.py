# worker/renderer.py
# WARNUNG: Die folgende Zeile MUSS vor allen OCC-Imports stehen (RESEARCH.md Pitfall 1)
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

import logging
import math

from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Extend.TopologyUtils import TopologyExplorer
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRepBndLib import brepbndlib_Add
from OCC.Display.OCCViewer import Viewer3d

logger = logging.getLogger(__name__)


def _fibonacci_sphere(n: int) -> list[tuple[float, float, float]]:
    """Liefert n Richtungsvektoren gleichmäßig verteilt auf der Einheitskugel.

    Fibonacci-Spirale (auch: golden-angle sphere). Im Vergleich zu festen
    Ortho-/Iso-Views: keine Häufung an Polen, kein Loch am Äquator, deterministisch.
    """
    if n < 1:
        return []
    pts: list[tuple[float, float, float]] = []
    phi = math.pi * (3.0 - math.sqrt(5.0))  # goldener Winkel
    for i in range(n):
        y = 1.0 - (i / (n - 1)) * 2.0 if n > 1 else 0.0  # y von 1 bis -1
        r = math.sqrt(max(0.0, 1.0 - y * y))
        theta = phi * i
        x = r * math.cos(theta)
        z = r * math.sin(theta)
        pts.append((x, y, z))
    return pts


# 16 Render-Perspektiven, gleichmäßig auf einer Kugel verteilt (Fibonacci-Spirale).
# Begründung: Fotos werden nie exakt von vorne/oben aufgenommen; dichte, gleichmäßige
# Kamera-Verteilung erhöht die Chance, dass eine View zum Foto-Winkel passt
# (Max-per-Part-Query in /api/search nutzt jede View einzeln).
# DB-Constraint part_views.view_idx < 16 → 16 ist das aktuell zulässige Maximum.
VIEW_COUNT = 16
VIEW_DIRECTIONS = _fibonacci_sphere(VIEW_COUNT)


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
    """Rendert VIEW_COUNT (=16) Views als 512x512px PNG-Dateien.

    Args:
        shape: TopoDS_Shape (validiert — validate_geometry() wurde bereits aufgerufen)
        output_dir: Verzeichnis für PNG-Ausgabe (muss existieren)

    Returns:
        Liste der PNG-Pfade: [output_dir/view_0.png, ..., output_dir/view_{N-1}.png]
    """
    viewer = Viewer3d()
    try:
        viewer.Create()
        viewer.SetSize(512, 512)  # IN-03
        viewer.SetModeShaded()
        # Weißer Hintergrund (D-05): maximaler Kontrast für dunkle Metallbauteile
        viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])
        viewer.DisplayShape(shape, update=True)

        paths = []
        for i, (dx, dy, dz) in enumerate(VIEW_DIRECTIONS):
            viewer.View.SetProj(dx, dy, dz)
            viewer.FitAll()
            path = os.path.join(output_dir, f"view_{i}.png")
            viewer.ExportToImage(path)
            paths.append(path)
            logger.info(f"View {i} (dir=({dx:+.3f},{dy:+.3f},{dz:+.3f})): {path}")
        return paths
    finally:
        viewer.Viewer.Remove()  # CR-02: OCC-Viewer-Ressourcen freigeben
