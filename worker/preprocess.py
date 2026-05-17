# worker/preprocess.py
# Bild-Vorverarbeitung vor DINOv2-Embedding.
# Ziel: Render-Domain und Foto-Domain in einen gemeinsamen Bildraum bringen,
#       damit Cosine-Similarity zwischen Foto und Render geometrische Form vergleicht
#       statt Hintergrund-Texturen oder Beleuchtung.

import logging
from typing import Literal, TypedDict

import numpy as np
from PIL import Image


class PrepareMeta(TypedDict):
    aspect_ratio: float  # max(bbox_w, bbox_h) / min(bbox_w, bbox_h) — ≥ 1.0, rotations­invariant

logger = logging.getLogger(__name__)

# Konstante: Eingangsauflösung für DINOv2 ViT-B/14 (16x16 Patches → 256 Tokens)
DINO_INPUT_SIZE = 224

# rembg-Session lazy initialisiert (Modell-Download/Load nur wenn tatsächlich gebraucht)
_REMBG_SESSION = None


def _get_rembg_session():
    """Lädt rembg-Session beim ersten Aufruf (U²Net-Modell, ~170MB).

    Modell wird in HF_HOME/u2net.onnx gecacht (Dockerfile-ENV).
    Bei wiederholten Aufrufen wird die Session wiederverwendet — keine GPU/CPU-Reload.
    """
    global _REMBG_SESSION
    if _REMBG_SESSION is None:
        from rembg import new_session
        logger.info("Lade rembg U²Net-Session (einmalig)")
        _REMBG_SESSION = new_session("u2net")
        logger.info("rembg-Session bereit")
    return _REMBG_SESSION


def _remove_background(img: Image.Image) -> Image.Image:
    """Entfernt den Hintergrund per rembg/U²Net.

    Eingabe: RGB-PIL-Image (beliebige Größe).
    Ausgabe: RGBA-PIL-Image — Alpha-Kanal markiert das segmentierte Objekt.

    Bei Renderings (weißer Hintergrund) liefert U²Net eine saubere Maske.
    Bei Fotos (komplexer Hintergrund) entfernt es typischen Hintergrund —
    versagt aber gelegentlich (sehr ähnliche Farben, Reflexe). Fallback in compose_on_white.
    """
    from rembg import remove
    return remove(img, session=_get_rembg_session())


def _crop_to_alpha_bbox(rgba: Image.Image, padding_pct: float = 0.05) -> tuple[Image.Image, float]:
    """Croppt das Bild auf die Bounding-Box des Alpha-Kanals (= des Objekts).

    Ein kleines Padding (5%) verhindert, dass Kanten an Bildränder stoßen — DINOv2
    Patch-Tokens an den Rändern bekommen sonst halb-Hintergrund, halb-Objekt.

    Fallback: wenn Alpha-Kanal leer ist (rembg hat nichts gefunden), wird das
    Originalbild unverändert zurückgegeben.

    Returns:
        (cropped_rgba, aspect_ratio) — aspect_ratio = max(w,h) / min(w,h),
        also ≥ 1.0 und unabhängig von der Bild-Orientierung. 1.0 = Fallback
        (Crop nicht möglich) oder echtes Quadrat.
    """
    alpha = np.array(rgba.split()[-1])
    if alpha.max() == 0:
        logger.warning("Alpha-Kanal leer — rembg hat kein Objekt gefunden. Fallback: kein Crop.")
        return rgba, 1.0

    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    if not rows.any() or not cols.any():
        logger.warning("Alpha-BBox degeneriert. Fallback: kein Crop.")
        return rgba, 1.0

    y0, y1 = np.where(rows)[0][[0, -1]]
    x0, x1 = np.where(cols)[0][[0, -1]]

    w, h = rgba.size
    pad_x = int((x1 - x0) * padding_pct)
    pad_y = int((y1 - y0) * padding_pct)

    x0 = max(0, x0 - pad_x)
    y0 = max(0, y0 - pad_y)
    x1 = min(w, x1 + pad_x)
    y1 = min(h, y1 + pad_y)

    # Aspect-Ratio des Objekt-Crops (vor Padding-Resize). Wir nehmen die Größe
    # OHNE das 5%-Padding, damit das Ratio echtes Form-Verhältnis abbildet.
    obj_w = max(1, x1 - x0 + 1 - 2 * pad_x)
    obj_h = max(1, y1 - y0 + 1 - 2 * pad_y)
    aspect_ratio = max(obj_w, obj_h) / min(obj_w, obj_h)

    return rgba.crop((x0, y0, x1 + 1, y1 + 1)), float(aspect_ratio)


def _compose_on_white_square(rgba: Image.Image, size: int = DINO_INPUT_SIZE) -> Image.Image:
    """Kombiniert das segmentierte Objekt auf weißem Hintergrund, quadratisch, mit Padding.

    Wichtig: KEIN Hard-Squashing (resize zu (size, size) ohne Aspect-Ratio).
    Stattdessen: längere Seite auf `size` skalieren, kürzere Seite zentriert mit Weiß padden.

    Fallback: wenn rgba.mode != 'RGBA' oder Alpha leer → reines Resize+Pad ohne Compositing
    (Bild ist dann opak, wird einfach als-ist auf weißen Hintergrund gelegt).
    """
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")

    w, h = rgba.size
    if w == 0 or h == 0:
        logger.warning(f"Degenerierte Bildgröße {w}x{h} — gebe weißes Bild zurück.")
        return Image.new("RGB", (size, size), (255, 255, 255))

    scale = size / max(w, h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    rgba_resized = rgba.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    offset = ((size - new_w) // 2, (size - new_h) // 2)
    canvas.paste(rgba_resized, offset, mask=rgba_resized.split()[-1])
    return canvas


def prepare_image(
    image_path: str,
    mode: Literal["photo", "render"] = "photo",
) -> Image.Image:
    """Bereitet ein Bild für DINOv3-Embedding vor (nur Bild).

    Dünner Wrapper um prepare_image_with_meta(...) — gibt nur das Bild zurück,
    damit Bestandscode (process_step.py, Tests) unverändert weiterläuft.
    Neue Caller, die das Aspect-Ratio brauchen (geometrisches Re-Ranking in
    /api/search), nutzen direkt prepare_image_with_meta.

    Args:
        image_path: Pfad zur Bilddatei (PNG/JPG).
        mode: "photo" für Suchfotos, "render" für STEP-Renderings.

    Returns:
        PIL.Image (RGB, 224x224) — direkt einsetzbar für AutoImageProcessor.
    """
    img, _meta = prepare_image_with_meta(image_path, mode=mode)
    return img


def prepare_image_with_meta(
    image_path: str,
    mode: Literal["photo", "render"] = "photo",
) -> tuple[Image.Image, PrepareMeta]:
    """Wie prepare_image, gibt zusätzlich Crop-Metadaten zurück.

    Pipeline (identisch für beide Modi):
        1. Bild laden, in RGB konvertieren
        2. Hintergrund entfernen (rembg / U²Net) → RGBA
        3. Auf Alpha-BBox croppen + Aspect-Ratio des Objekts berechnen
        4. Auf weißen Hintergrund komponieren, quadratisch mit Padding, 224x224

    Returns:
        (image, meta) — meta.aspect_ratio = max(w,h)/min(w,h) des entfernten-Hintergrund-Crops.
        Bei Fallback (rembg fand nichts) ist aspect_ratio = 1.0.
    """
    logger.info(f"Preprocess [{mode}]: {image_path}")
    img = Image.open(image_path).convert("RGB")

    rgba = _remove_background(img)
    cropped, aspect_ratio = _crop_to_alpha_bbox(rgba)
    canvas = _compose_on_white_square(cropped, size=DINO_INPUT_SIZE)
    return canvas, {"aspect_ratio": aspect_ratio}
