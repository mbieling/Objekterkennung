# worker/tests/test_geometry.py
# Tests für worker/geometry.py — STEP-Geometrie-Extraktor.
#
# OCC ist im lokalen Entwicklungsumfeld nicht ohne Docker verfügbar, daher prüfen
# wir hier vor allem den Vertrag der Funktion über Quellcode-Inspektion und einen
# kleinen Smoke-Test mit Mock. Die echte OCC-Integration wird im Docker-Run getestet.

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


def _read_geometry_source() -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "geometry.py")
    with open(path, "r") as f:
        return f.read()


def test_module_has_vtk_env_guard():
    """VTK_DEFAULT_OPENGL_WINDOW muss vor allen OCC-Imports gesetzt sein (Pitfall 1)."""
    source = _read_geometry_source()
    vtk_idx = source.find("VTK_DEFAULT_OPENGL_WINDOW")
    occ_idx = source.find("from OCC.Core")
    assert vtk_idx >= 0, "Geometrie-Modul muss VTK_DEFAULT_OPENGL_WINDOW setzen"
    assert occ_idx >= 0, "Geometrie-Modul muss OCC-Symbole importieren"
    assert vtk_idx < occ_idx, "VTK_DEFAULT_OPENGL_WINDOW muss VOR OCC-Imports gesetzt werden"


def test_extract_geometry_returns_sorted_bbox_edges():
    """extract_geometry muss bbox_x ≥ bbox_y ≥ bbox_z liefern — rotations­invariant."""
    # OCC-Symbole vollständig mocken, damit der Test offline läuft
    with patch.dict("sys.modules", {
        "OCC": MagicMock(),
        "OCC.Core": MagicMock(),
        "OCC.Core.Bnd": MagicMock(),
        "OCC.Core.BRepBndLib": MagicMock(),
        "OCC.Core.BRepGProp": MagicMock(),
        "OCC.Core.GProp": MagicMock(),
        "OCC.Extend": MagicMock(),
        "OCC.Extend.TopologyUtils": MagicMock(),
    }):
        from worker import geometry as geo_mod
        # Importe sind durch Mocks ersetzt — patche das Modul selbst

        fake_bbox = MagicMock()
        # Bewusst unsortiert übergeben: (mid, max, min, ...) — Sortierung muss
        # absteigend sein, egal in welcher Reihenfolge OCC liefert.
        fake_bbox.Get.return_value = (0.0, 0.0, 0.0, 5.0, 10.0, 2.0)

        fake_vol_props = MagicMock()
        fake_vol_props.Mass.return_value = 100.0
        fake_surf_props = MagicMock()
        fake_surf_props.Mass.return_value = 50.0

        fake_explorer = MagicMock()
        fake_explorer.faces.return_value = iter([1, 2, 3, 4, 5, 6])

        with (
            patch.object(geo_mod, "Bnd_Box", return_value=fake_bbox),
            patch.object(geo_mod, "brepbndlib_Add"),
            patch.object(geo_mod, "GProp_GProps", side_effect=[fake_vol_props, fake_surf_props]),
            patch.object(geo_mod, "brepgprop_VolumeProperties"),
            patch.object(geo_mod, "brepgprop_SurfaceProperties"),
            patch.object(geo_mod, "TopologyExplorer", return_value=fake_explorer),
        ):
            result = geo_mod.extract_geometry(MagicMock(name="fake_shape"))

        # Kanten waren 5, 10, 2 — sortiert: 10 ≥ 5 ≥ 2
        assert result["bbox_x"] == 10.0
        assert result["bbox_y"] == 5.0
        assert result["bbox_z"] == 2.0
        assert result["bbox_x"] >= result["bbox_y"] >= result["bbox_z"]
        assert result["volume"] == 100.0
        assert result["surface_area"] == 50.0
        assert result["face_count"] == 6
