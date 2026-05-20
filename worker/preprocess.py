# worker/preprocess.py
# Bild-Vorverarbeitung vor DINOv3-Embedding.
# Ziel: Render-Domain und Foto-Domain in einen gemeinsamen Bildraum bringen,
#       damit Cosine-Similarity zwischen Foto und Render geometrische Form vergleicht
#       statt Hintergrund-Texturen oder Beleuchtung.
#
# Segmentierungs-Backend ist austauschbar (Hebel 5):
#   SEGMENTATION_BACKEND=rembg          (Default)
#                       =groundedsam    (Grounding DINO + SAM, hoehere Latenz auf CPU,
#                                        bessere Masken bei komplexen Werkstatt-Fotos)

import logging
import os
from typing import Literal, TypedDict

import numpy as np
from PIL import Image, ImageOps


class PrepareMeta(TypedDict):
    aspect_ratio: float  # max(bbox_w, bbox_h) / min(bbox_w, bbox_h) — ≥ 1.0, rotations­invariant

logger = logging.getLogger(__name__)

# Konstante: Eingangsauflösung für DINOv3 ViT-L/16 (16x16 Patches → 196 Patch-Tokens)
DINO_INPUT_SIZE = 224

# Segmentierungs-Backend (Hebel 5)
SEGMENTATION_BACKEND = os.environ.get("SEGMENTATION_BACKEND", "rembg").lower()

# GroundedSAM-Konfiguration. Prompt ist '.'-getrennt — so erwartet es Grounding DINO.
GROUNDEDSAM_PROMPT = os.environ.get(
    "GROUNDEDSAM_PROMPT", "object . metal part . component ."
)
GROUNDEDSAM_DINO_ID = os.environ.get("GROUNDEDSAM_DINO_ID", "IDEA-Research/grounding-dino-tiny")
GROUNDEDSAM_SAM_ID = os.environ.get("GROUNDEDSAM_SAM_ID", "facebook/sam-vit-base")
# Bbox-Score-Schwellen fuer Grounding DINO. 0.25 ist der Modell-Default.
GROUNDEDSAM_DINO_THRESHOLD = float(os.environ.get("GROUNDEDSAM_DINO_THRESHOLD", "0.25"))
GROUNDEDSAM_TEXT_THRESHOLD = float(os.environ.get("GROUNDEDSAM_TEXT_THRESHOLD", "0.20"))
# Skaliert Bilder vor der Inferenz herunter (Speed/RAM). 0 = aus.
GROUNDEDSAM_MAX_SIDE = int(os.environ.get("GROUNDEDSAM_MAX_SIDE", "1024"))

# Lazy-Caches
_REMBG_SESSION = None
_GROUNDEDSAM_MODELS = None


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


def _get_groundedsam_models():
    """Lädt Grounding DINO Tiny + SAM ViT-Base beim ersten Aufruf (~530 MB).

    Modelle werden in HF_HOME gecacht (Dockerfile-ENV / model_cache-Volume).
    Auf CPU dauert die Inferenz ~5-10 s pro Foto — auf GPU ~200-500 ms.
    """
    global _GROUNDEDSAM_MODELS
    if _GROUNDEDSAM_MODELS is None:
        from transformers import (
            AutoModelForZeroShotObjectDetection,
            AutoProcessor,
            SamModel,
            SamProcessor,
        )

        logger.info(f"Lade Grounding DINO ({GROUNDEDSAM_DINO_ID})")
        g_proc = AutoProcessor.from_pretrained(GROUNDEDSAM_DINO_ID)
        g_model = AutoModelForZeroShotObjectDetection.from_pretrained(GROUNDEDSAM_DINO_ID)
        g_model.eval()

        logger.info(f"Lade SAM ({GROUNDEDSAM_SAM_ID})")
        s_proc = SamProcessor.from_pretrained(GROUNDEDSAM_SAM_ID)
        s_model = SamModel.from_pretrained(GROUNDEDSAM_SAM_ID)
        s_model.eval()
        _GROUNDEDSAM_MODELS = (g_proc, g_model, s_proc, s_model)
        logger.info("GroundedSAM-Modelle bereit")
    return _GROUNDEDSAM_MODELS


def _remove_background_rembg(img: Image.Image) -> Image.Image:
    """Entfernt den Hintergrund per rembg/U²Net.

    Eingabe: RGB-PIL-Image (beliebige Größe).
    Ausgabe: RGBA-PIL-Image — Alpha-Kanal markiert das segmentierte Objekt.

    Bei Renderings (weißer Hintergrund) liefert U²Net eine saubere Maske.
    Bei Fotos (komplexer Hintergrund) entfernt es typischen Hintergrund —
    versagt aber gelegentlich (sehr ähnliche Farben, Reflexe). Fallback in compose_on_white.
    """
    from rembg import remove
    return remove(img, session=_get_rembg_session())


def _remove_background_groundedsam(img: Image.Image) -> Image.Image:
    """Entfernt den Hintergrund per Grounding DINO + SAM (Hebel 5).

    Pipeline:
      1. Grounding DINO findet die beste Bbox fuer den Text-Prompt
      2. SAM extrahiert eine pixel-genaue Maske aus dieser Bbox
      3. Maske wird in den Alpha-Kanal des Originalbilds geschrieben

    Wenn Grounding DINO keine Bbox findet (zu unsicher / wrong domain),
    faellt der Caller auf rembg zurueck — wir geben dafuer KEINE RGBA mit
    leerem Alpha zurueck, sondern werfen RuntimeError, damit der Caller
    den Fallback bewusst nimmt.
    """
    import torch

    g_proc, g_model, s_proc, s_model = _get_groundedsam_models()

    # Optionales Pre-Resize fuer Speed/RAM, ohne Original anzufassen.
    work = img
    if GROUNDEDSAM_MAX_SIDE > 0 and max(img.size) > GROUNDEDSAM_MAX_SIDE:
        scale = GROUNDEDSAM_MAX_SIDE / max(img.size)
        work = img.resize(
            (int(img.width * scale), int(img.height * scale)),
            Image.LANCZOS,
        )

    # 1) Grounding DINO — Bbox aus Text-Prompt
    g_in = g_proc(images=work, text=GROUNDEDSAM_PROMPT, return_tensors="pt")
    with torch.no_grad():
        g_out = g_model(**g_in)
    res = g_proc.post_process_grounded_object_detection(
        g_out,
        g_in.input_ids,
        threshold=GROUNDEDSAM_DINO_THRESHOLD,
        text_threshold=GROUNDEDSAM_TEXT_THRESHOLD,
        target_sizes=[work.size[::-1]],
    )[0]
    if len(res["boxes"]) == 0:
        raise RuntimeError("Grounding DINO: keine Bbox gefunden")

    best = int(res["scores"].argmax())
    bbox = res["boxes"][best].tolist()

    # 2) SAM — pixel-genaue Maske aus Bbox
    s_in = s_proc(work, input_boxes=[[bbox]], return_tensors="pt")
    with torch.no_grad():
        s_out = s_model(**s_in)
    masks = s_proc.image_processor.post_process_masks(
        s_out.pred_masks.cpu(),
        s_in["original_sizes"].cpu(),
        s_in["reshaped_input_sizes"].cpu(),
    )
    iou = s_out.iou_scores[0, 0]
    best_mask_idx = int(iou.argmax())
    mask_np = masks[0][0, best_mask_idx].numpy().astype(bool)

    # 3) Achsen-Harmonisierung: SamProcessor liefert die Maske je nach
    #    transformers-Version mit gedrehten Achsen. Per PIL auf work.size
    #    zwingen, dann hochskalieren auf img.size falls Pre-Resize aktiv war.
    if mask_np.shape != (work.height, work.width):
        mask_pil = Image.fromarray((mask_np * 255).astype(np.uint8))
        mask_pil = mask_pil.resize(work.size, Image.NEAREST)
    else:
        mask_pil = Image.fromarray((mask_np * 255).astype(np.uint8))

    if work.size != img.size:
        mask_pil = mask_pil.resize(img.size, Image.NEAREST)
    mask_full = np.array(mask_pil) > 127

    # 4) RGBA aus Maske bauen
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    arr[..., 3] = np.where(mask_full, 255, 0).astype(np.uint8)
    return Image.fromarray(arr)


def _remove_background(img: Image.Image) -> Image.Image:
    """Backend-Dispatcher (Hebel 5).

    Liest SEGMENTATION_BACKEND und ruft die entsprechende Implementierung auf.
    Bei groundedsam: faellt auf rembg zurueck, wenn die Inferenz scheitert
    (z.B. keine Bbox, transformers-Fehler).
    """
    if SEGMENTATION_BACKEND == "groundedsam":
        try:
            return _remove_background_groundedsam(img)
        except Exception as e:
            logger.warning(
                f"GroundedSAM-Backend gescheitert ({e!r}) — Fallback auf rembg"
            )
    return _remove_background_rembg(img)


def _crop_to_alpha_bbox(rgba: Image.Image, padding_pct: float = 0.05) -> tuple[Image.Image, float]:
    """Croppt das Bild auf die Bounding-Box des Alpha-Kanals (= des Objekts).

    Ein kleines Padding (5%) verhindert, dass Kanten an Bildränder stoßen — DINOv3
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
        1. Bild laden, in RGB konvertieren, EXIF-Rotation anwenden
        2. Hintergrund entfernen (rembg ODER GroundedSAM, je nach
           SEGMENTATION_BACKEND) → RGBA
        3. Auf Alpha-BBox croppen + Aspect-Ratio des Objekts berechnen
        4. Auf weißen Hintergrund komponieren, quadratisch mit Padding, 224x224

    Returns:
        (image, meta) — meta.aspect_ratio = max(w,h)/min(w,h) des entfernten-Hintergrund-Crops.
        Bei Fallback (Backend fand nichts) ist aspect_ratio = 1.0.
    """
    logger.info(f"Preprocess [{mode}, backend={SEGMENTATION_BACKEND}]: {image_path}")
    img = Image.open(image_path).convert("RGB")
    # iPhone-Fotos kommen oft mit Orientation-EXIF — rembg/SAM respektieren
    # den Tag nicht einheitlich. Einmal explizit anwenden.
    img = ImageOps.exif_transpose(img)

    rgba = _remove_background(img)
    cropped, aspect_ratio = _crop_to_alpha_bbox(rgba)
    canvas = _compose_on_white_square(cropped, size=DINO_INPUT_SIZE)
    return canvas, {"aspect_ratio": aspect_ratio}
