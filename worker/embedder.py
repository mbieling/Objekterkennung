# worker/embedder.py
# DINOv2 ViT-B/14 Inferenz für CAD-Part-Embeddings.
# Modell wird beim Modulimport einmalig geladen (~3s).
# HF_HOME=/app/model_cache (Dockerfile) — kein HuggingFace-Download zur Laufzeit.

import logging
from typing import Literal

import numpy as np
import torch
from transformers import AutoImageProcessor, AutoModel

from worker.preprocess import prepare_image

logger = logging.getLogger(__name__)

# Einmaliges Laden beim Modulimport (RESEARCH.md Anti-Pattern: nicht in Schleife laden)
# TRANSFORMERS_CACHE=/app/model_cache via Dockerfile ENV — Modell ist bereits gecacht
_MODEL_NAME = "facebook/dinov2-base"
logger.info(f"Lade DINOv2-Modell: {_MODEL_NAME}")
_processor = AutoImageProcessor.from_pretrained(_MODEL_NAME)
_model = AutoModel.from_pretrained(_MODEL_NAME)
_model.eval()
logger.info("DINOv2-Modell geladen")


def get_embedding(
    image_path: str,
    mode: Literal["photo", "render"] = "photo",
) -> np.ndarray:
    """Berechnet Patch-Token Mean-Pool Embedding (768-dim) für ein Bild.

    Args:
        image_path: Pfad zu einer Bilddatei (PNG/JPG).
        mode: "photo" für Suchfotos, "render" für STEP-Renderings.
              Beide Modi durchlaufen die gleiche Preprocessing-Pipeline
              (Background-Removal, Crop, Padding) für einen konsistenten Bildraum.

    Returns:
        numpy-Array der Shape (768,) — DINOv2 ViT-B/14 Patch-Token Mean-Pool.

    Pipeline:
        1. prepare_image() — rembg + Crop + Padding auf 224x224 (worker/preprocess.py)
        2. AutoImageProcessor (Normalisierung)
        3. DINOv2 Forward-Pass
        4. Mean-Pool über Patch-Tokens (Index 1..256), KEIN CLS-Token
    """
    img = prepare_image(image_path, mode=mode)

    inputs = _processor(images=img, return_tensors="pt")

    with torch.no_grad():
        outputs = _model(**inputs)

    # Patch-Token Mean-Pool — last_hidden_state Shape: [1, 257, 768]
    # Index 0 = CLS-Token, Index 1..256 = 256 Patch-Tokens (16x16 bei 224px)
    patch_tokens = outputs.last_hidden_state[:, 1:, :]
    mean_embedding = patch_tokens.mean(dim=1).squeeze().numpy()

    assert mean_embedding.shape == (768,), f"Unerwartete Embedding-Shape: {mean_embedding.shape}"
    return mean_embedding


def mean_pool(embeddings: list) -> np.ndarray:
    """Mean-Pool über N View-Embeddings zu einem einzigen 768-dim Vektor.

    Wird weiterhin als Fallback in parts.embedding geschrieben, damit alte Routen
    (z.B. Admin-Listen) ohne Multi-View-Query auskommen. Die eigentliche Suche
    läuft seit Hebel-2 über part_views (Max-per-Group statt Mean).

    Args:
        embeddings: Liste von numpy-Arrays, je Shape (768,).

    Returns:
        numpy-Array der Shape (768,) — arithmetisches Mittel aller Views.
    """
    assert len(embeddings) > 0, "Leere Embedding-Liste"
    stacked = np.stack(embeddings)
    pooled = np.mean(stacked, axis=0)
    assert pooled.shape == (768,), f"Unerwartete Pool-Shape: {pooled.shape}"
    return pooled
