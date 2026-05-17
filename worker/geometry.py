# worker/geometry.py
# Extrahiert geometrische Merkmale aus einer STEP-Datei für das geometrische
# Re-Ranking in /api/search (Hebel 3a).
#
# Liefert:
#   bbox_x ≥ bbox_y ≥ bbox_z  — sortierte Kantenlängen der achsenparallelen
#                                Bounding-Box (mm). Sortierung macht das Tupel
#                                rotationsinvariant — der absolute Achsen-Index
#                                aus dem STEP-Koordinatensystem ist nicht stabil.
#   volume                    — Gesamtvolumen des Solids (mm³)
#   surface_area              — Summe aller Face-Flächen (mm²)
#   face_count                — Anzahl topologischer Faces

# MUSS vor allen OCC-Imports stehen (RESEARCH.md Pitfall 1)
import os
os.environ.setdefault("VTK_DEFAULT_OPENGL_WINDOW", "vtkOSOpenGLRenderWindow")

import logging
from typing import TypedDict

from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRepBndLib import brepbndlib_Add
from OCC.Core.BRepGProp import brepgprop_VolumeProperties, brepgprop_SurfaceProperties
from OCC.Core.GProp import GProp_GProps
from OCC.Extend.TopologyUtils import TopologyExplorer

logger = logging.getLogger(__name__)


class Geometry(TypedDict):
    bbox_x: float        # längste Kantenlänge (mm)
    bbox_y: float        # mittlere
    bbox_z: float        # kürzeste
    volume: float        # mm³
    surface_area: float  # mm²
    face_count: int


def extract_geometry(shape) -> Geometry:
    """Berechnet alle geometrischen Merkmale aus einem TopoDS_Shape.

    Args:
        shape: Bereits geladenes TopoDS_Shape (siehe renderer.load_step).
               Sollte zuvor mit renderer.validate_geometry geprüft sein.

    Returns:
        Geometry-Dict mit allen Spalten für die parts-Tabelle.
        Volumen/Surface können bei degenerierten oder offenen Geometrien 0 sein —
        die Werte werden trotzdem geschrieben (NULL ist für "noch nicht berechnet" reserviert).
    """
    # Bounding-Box — Kantenlängen aus min/max-Koordinaten ableiten und absteigend sortieren.
    bbox = Bnd_Box()
    brepbndlib_Add(shape, bbox)
    x_min, y_min, z_min, x_max, y_max, z_max = bbox.Get()
    edges = sorted(
        [x_max - x_min, y_max - y_min, z_max - z_min],
        reverse=True,
    )

    # Volumen — OCC GProp_GProps berechnet das exakte Solid-Volumen.
    # Bei nicht-wasserdichten Geometrien (offene Shells) gibt OCC 0 oder einen
    # bedeutungslosen Wert zurück — das ist akzeptabel, das Re-Ranking
    # gewichtet Volumen-Mismatches sowieso nur sanft.
    vol_props = GProp_GProps()
    brepgprop_VolumeProperties(shape, vol_props)
    volume = float(vol_props.Mass())

    # Oberfläche — Summe aller Face-Flächen.
    surf_props = GProp_GProps()
    brepgprop_SurfaceProperties(shape, surf_props)
    surface_area = float(surf_props.Mass())

    # Face-Count — Indikator für Geometrie-Komplexität (Mehrkomponenten-Teile
    # haben typischerweise hohe Face-Zahlen).
    face_count = len(list(TopologyExplorer(shape).faces()))

    result: Geometry = {
        "bbox_x": float(edges[0]),
        "bbox_y": float(edges[1]),
        "bbox_z": float(edges[2]),
        "volume": volume,
        "surface_area": surface_area,
        "face_count": int(face_count),
    }
    logger.info(
        f"Geometrie: bbox={edges[0]:.2f}×{edges[1]:.2f}×{edges[2]:.2f} mm, "
        f"vol={volume:.2f} mm³, surf={surface_area:.2f} mm², faces={face_count}"
    )
    return result
