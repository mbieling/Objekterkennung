# worker/tests/test_preprocess.py
# Unit-Tests für worker/preprocess.py — Bild-Vorverarbeitung.
# rembg wird gemockt, damit Tests offline und ohne Modell-Download laufen.

import os
import sys
from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from worker.preprocess import (
    DINO_INPUT_SIZE,
    _compose_on_white_square,
    _crop_to_alpha_bbox,
    prepare_image,
)


def _make_rgba(width: int, height: int, alpha_box: tuple[int, int, int, int] | None) -> Image.Image:
    """Erzeugt RGBA-Bild mit einem Alpha-Block (Objekt-Simulation).

    alpha_box: (x0, y0, x1, y1) wo Alpha=255, sonst 0.
    None → komplett transparent (Edge-Case).
    """
    img = Image.new("RGBA", (width, height), (200, 100, 50, 0))
    if alpha_box is not None:
        x0, y0, x1, y1 = alpha_box
        pixels = np.array(img)
        pixels[y0:y1, x0:x1, 3] = 255
        img = Image.fromarray(pixels)
    return img


class TestCropToAlphaBbox:
    def test_crops_to_alpha_region(self):
        """Wenn Alpha nur in einer kleinen Region gesetzt ist, wird darauf gecroppt (plus Padding)."""
        img = _make_rgba(100, 100, alpha_box=(40, 30, 60, 70))
        cropped, aspect = _crop_to_alpha_bbox(img, padding_pct=0.0)
        # Crop sollte ungefähr 20x40 sein (x: 40..60, y: 30..70)
        assert cropped.size[0] == 21  # 60-40+1
        assert cropped.size[1] == 41  # 70-30+1
        # Aspect-Ratio = max/min: 41/21 ≈ 1.95
        assert 1.8 < aspect < 2.1

    def test_padding_extends_bbox(self):
        """5% Padding vergrößert den Crop in beide Richtungen."""
        img = _make_rgba(200, 200, alpha_box=(50, 50, 150, 150))
        cropped, aspect = _crop_to_alpha_bbox(img, padding_pct=0.1)
        # bbox=100x100, padding=10 → erwartet ~120x120
        assert 115 <= cropped.size[0] <= 125
        assert 115 <= cropped.size[1] <= 125
        # Quadrat → aspect ≈ 1.0 (Aspect basiert auf der ungepaddeten Objekt-Größe)
        assert 0.95 <= aspect <= 1.05

    def test_empty_alpha_returns_original_with_neutral_aspect(self):
        """rembg hat nichts gefunden → Fallback: Originalbild + Aspect=1.0."""
        img = _make_rgba(100, 100, alpha_box=None)
        result, aspect = _crop_to_alpha_bbox(img)
        assert result.size == (100, 100)
        assert aspect == 1.0


class TestComposeOnWhiteSquare:
    def test_output_is_square_and_correct_size(self):
        img = _make_rgba(80, 40, alpha_box=(0, 0, 80, 40))
        result = _compose_on_white_square(img, size=224)
        assert result.size == (224, 224)
        assert result.mode == "RGB"

    def test_preserves_aspect_ratio_with_padding(self):
        """Querformat-Bild wird zentriert mit weißem Padding oben/unten — KEIN Squashing."""
        img = _make_rgba(200, 100, alpha_box=(0, 0, 200, 100))
        result = _compose_on_white_square(img, size=224)
        arr = np.array(result)
        # Oberer/unterer Rand muss weiß sein (Padding-Zone bei Querformat)
        assert arr[0, 112].tolist() == [255, 255, 255]
        assert arr[223, 112].tolist() == [255, 255, 255]
        # Mittlerer Bereich muss das Objekt enthalten (nicht weiß)
        assert arr[112, 112].tolist() != [255, 255, 255]

    def test_hochkant_image_padded_left_right(self):
        """Hochkant-Bild wird mit weißem Padding links/rechts versehen."""
        img = _make_rgba(100, 200, alpha_box=(0, 0, 100, 200))
        result = _compose_on_white_square(img, size=224)
        arr = np.array(result)
        assert arr[112, 0].tolist() == [255, 255, 255]
        assert arr[112, 223].tolist() == [255, 255, 255]
        assert arr[112, 112].tolist() != [255, 255, 255]

    def test_rgb_input_converted_to_rgba_internally(self):
        """RGB-Input ohne Alpha wird trotzdem akzeptiert (Fallback-Pfad)."""
        img = Image.new("RGB", (50, 50), (128, 128, 128))
        result = _compose_on_white_square(img, size=224)
        assert result.size == (224, 224)


class TestPrepareImage:
    def test_calls_rembg_and_returns_224_square(self, tmp_path):
        """End-to-End: prepare_image ruft rembg, croppt, paddet auf 224x224."""
        # Erzeuge Test-PNG: kleines Objekt auf großem weißen Hintergrund
        img = Image.new("RGB", (400, 400), (255, 255, 255))
        # "Objekt" als grauer Block in der Mitte
        pixels = np.array(img)
        pixels[150:250, 150:250] = (100, 100, 100)
        Image.fromarray(pixels).save(tmp_path / "test.png")

        # rembg-Aufruf mocken — simuliert U²Net-Output (Alpha im mittleren Block)
        def fake_remove(input_img, session=None):
            out = input_img.convert("RGBA")
            arr = np.array(out)
            arr[..., 3] = 0
            arr[150:250, 150:250, 3] = 255
            return Image.fromarray(arr)

        with patch("worker.preprocess._remove_background", side_effect=fake_remove):
            result = prepare_image(str(tmp_path / "test.png"), mode="photo")

        assert result.size == (DINO_INPUT_SIZE, DINO_INPUT_SIZE)
        assert result.mode == "RGB"

    def test_mode_render_uses_same_pipeline(self, tmp_path):
        """Konsistente Pipeline: mode='render' läuft durch identische Schritte."""
        img = Image.new("RGB", (300, 300), (255, 255, 255))
        img.save(tmp_path / "render.png")

        def fake_remove(input_img, session=None):
            out = input_img.convert("RGBA")
            arr = np.array(out)
            arr[..., 3] = 255  # ganzes Bild als Objekt markiert
            return Image.fromarray(arr)

        with patch("worker.preprocess._remove_background", side_effect=fake_remove):
            result = prepare_image(str(tmp_path / "render.png"), mode="render")

        assert result.size == (DINO_INPUT_SIZE, DINO_INPUT_SIZE)

    def test_empty_alpha_fallback(self, tmp_path):
        """Wenn rembg nichts findet (komplett leerer Alpha), läuft die Pipeline ohne Crash durch."""
        img = Image.new("RGB", (300, 300), (255, 255, 255))
        img.save(tmp_path / "empty.png")

        def fake_remove_empty(input_img, session=None):
            out = input_img.convert("RGBA")
            arr = np.array(out)
            arr[..., 3] = 0  # alles transparent
            return Image.fromarray(arr)

        with patch("worker.preprocess._remove_background", side_effect=fake_remove_empty):
            result = prepare_image(str(tmp_path / "empty.png"), mode="photo")

        assert result.size == (DINO_INPUT_SIZE, DINO_INPUT_SIZE)
        # Bei leerem Alpha sollte das Bild komplett weiß sein (Fallback)
        arr = np.array(result)
        assert arr.mean() > 250
