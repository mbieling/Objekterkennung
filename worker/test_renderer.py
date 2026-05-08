# worker/test_renderer.py — Isolierter OSMesa-Smoketest
# Ausführen: docker run --rm bauteil-worker python test_renderer.py
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"  # OSMesa ZUERST (Pitfall 1)
# Kein S3, keine DB, kein DINOv2 — nur Rendering.

import sys
import tempfile
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCC.Display.OCCViewer import Viewer3d

# renderer.py importieren (aus gleichem Verzeichnis)
# Hinweis: renderer.py setzt VTK_DEFAULT_OPENGL_WINDOW ebenfalls — kein Problem bei Doppelsetzung
from renderer import load_step, validate_geometry, render_views, VIEWS


def test_osmesa_basic():
    """Teil A: Minimaler OSMesa-Test mit synthetischer Form (kein STEP nötig)."""
    logger.info("=== Test A: OSMesa Basistest ===")

    # Synthetischen Würfel direkt mit pythonOCC erzeugen (kein STEP)
    box = BRepPrimAPI_MakeBox(10, 20, 30).Shape()

    viewer = Viewer3d()
    viewer.Create()
    viewer.SetModeShaded()
    viewer.set_bg_gradient_color([255, 255, 255], [255, 255, 255])
    viewer.DisplayShape(box, update=True)

    output_path = "/tmp/test_osmesa_basic.png"
    viewer.ExportToImage(output_path)

    stat = os.stat(output_path)
    assert stat.st_size > 1000, f"PNG zu klein ({stat.st_size} Bytes) — OSMesa-Rendering fehlgeschlagen"
    logger.info(f"OSMesa Basistest OK: {output_path} ({stat.st_size} Bytes)")
    return True


def test_step_rendering():
    """Teil B: Vollständiger 8-View-Test mit worker/testdata/sample.step."""
    logger.info("=== Test B: STEP-Datei 8-View-Rendering ===")

    # Pfad zur Testdatei relativ zum Skript
    script_dir = os.path.dirname(os.path.abspath(__file__))
    step_path = os.path.join(script_dir, "testdata", "sample.step")

    if not os.path.exists(step_path):
        logger.error(f"Testdatei nicht gefunden: {step_path}")
        logger.error("Bitte worker/testdata/sample.step erstellen (Plan 01, Task 2)")
        return False

    # STEP laden und validieren
    shape = load_step(step_path)
    validate_geometry(shape)
    logger.info("STEP-Validierung OK")

    # 8 Views in temporäres Verzeichnis rendern
    with tempfile.TemporaryDirectory() as tmpdir:
        png_paths = render_views(shape, tmpdir)

        # Verifikation: genau 8 PNGs erzeugt
        assert len(png_paths) == 8, f"Erwartet 8 PNGs, erhalten: {len(png_paths)}"

        # Verifikation: alle PNGs sind nicht leer (> 1 KB)
        failed = []
        for i, path in enumerate(png_paths):
            assert os.path.exists(path), f"PNG fehlt: {path}"
            size = os.stat(path).st_size
            if size < 1000:
                failed.append(f"view_{i}.png zu klein: {size} Bytes")
            else:
                logger.info(f"view_{i}.png: {size} Bytes — OK")

        if failed:
            for msg in failed:
                logger.error(msg)
            return False

        logger.info(f"RENDERER_OK: 8 PNGs generated in {tmpdir}")

    return True


def test_invalid_geometry():
    """Teil C: Geometrievalidierung — face_count < 4 muss ValueError auslösen."""
    logger.info("=== Test C: Ungültige Geometrie (face_count < 4) ===")

    # Erstelle eine Fläche (Face) statt eines Festkörpers — hat weniger als 4 Faces
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCC.Core.gp import gp_Pln, gp_Ax3, gp_Pnt, gp_Dir

    # Einfache planare Fläche — nur 1 Face, muss als ungültig abgelehnt werden
    plane = gp_Pln(gp_Ax3(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)))
    face_maker = BRepBuilderAPI_MakeFace(plane, -10, 10, -10, 10)
    flat_shape = face_maker.Shape()

    try:
        validate_geometry(flat_shape)
        logger.error("FEHLER: ValueError erwartet aber nicht geworfen")
        return False
    except ValueError as e:
        error_msg = str(e)
        if "INVALID_GEOMETRY:face_count=" in error_msg:
            logger.info(f"Ungültige Geometrie korrekt abgelehnt: {error_msg}")
            return True
        else:
            logger.error(f"Falscher Fehlercode: {error_msg}")
            return False


if __name__ == "__main__":
    results = {}

    try:
        results["A_osmesa_basic"] = test_osmesa_basic()
    except Exception as e:
        logger.exception(f"Test A fehlgeschlagen: {e}")
        results["A_osmesa_basic"] = False

    try:
        results["B_step_rendering"] = test_step_rendering()
    except Exception as e:
        logger.exception(f"Test B fehlgeschlagen: {e}")
        results["B_step_rendering"] = False

    try:
        results["C_invalid_geometry"] = test_invalid_geometry()
    except Exception as e:
        logger.exception(f"Test C fehlgeschlagen: {e}")
        results["C_invalid_geometry"] = False

    # Zusammenfassung
    all_passed = all(results.values())
    print("\n=== TESTERGEBNIS ===")
    for test_name, passed in results.items():
        status = "OK" if passed else "FEHLER"
        print(f"  {test_name}: {status}")

    if all_passed:
        print("\nRENDERER_OK: 8 PNGs generated")
        sys.exit(0)
    else:
        print("\nRENDERER_FEHLER: Mindestens ein Test fehlgeschlagen")
        sys.exit(1)
