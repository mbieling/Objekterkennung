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
_MODEL_NAME = "facebook/dinov3-vitl16-pretrain-lvd1689m"
EMBEDDING_DIM = 1024  # DINOv3 ViT-L/16 hidden state dim — identisch zu DINOv2-large, daher keine DB-Migration

# Token-Layout DINOv3 ViT-L/16 bei 224×224-Eingang:
#   [CLS, register_1..register_4, patch_1..patch_196] = 201 Tokens total.
# Patch-Mean-Pool muss CLS UND die 4 Register-Tokens überspringen (DINOv2 hatte keine Register-Tokens
# und der alte Slice [:, 1:, :] reichte). Wenn HF das Layout je ändert, schlägt die Shape-Assertion
# in get_embedding zu — keine stillen Embedding-Drifts.
_PATCH_TOKEN_START = 5
_EXPECTED_PATCH_COUNT = 196  # 224 / 16 = 14 × 14

logger.info(f"Lade DINOv3-Modell: {_MODEL_NAME}")
_processor = AutoImageProcessor.from_pretrained(_MODEL_NAME)
_model = AutoModel.from_pretrained(_MODEL_NAME)
_model.eval()
logger.info("DINOv3-Modell geladen")


def get_embedding(
    image_path: str,
    mode: Literal["photo", "render"] = "photo",
) -> np.ndarray:
    """Berechnet Patch-Token Mean-Pool Embedding (EMBEDDING_DIM-dim) für ein Bild.

    Args:
        image_path: Pfad zu einer Bilddatei (PNG/JPG).
        mode: "photo" für Suchfotos, "render" für STEP-Renderings.
              Beide Modi durchlaufen die gleiche Preprocessing-Pipeline
              (Background-Removal, Crop, Padding) für einen konsistenten Bildraum.

    Returns:
        numpy-Array der Shape (EMBEDDING_DIM,) — DINOv3 ViT-L/16 Patch-Token Mean-Pool.

    Pipeline:
        1. prepare_image() — rembg + Crop + Padding auf 224x224 (worker/preprocess.py)
        2. AutoImageProcessor (Normalisierung)
        3. DINOv3 Forward-Pass
        4. Mean-Pool über die 196 Patch-Tokens (Index 5..200) — CLS + 4 Register-Tokens
           werden bewusst übersprungen.
    """
    img = prepare_image(image_path, mode=mode)

    inputs = _processor(images=img, return_tensors="pt")

    with torch.no_grad():
        outputs = _model(**inputs)

    total_tokens = outputs.last_hidden_state.shape[1]
    expected_total = _PATCH_TOKEN_START + _EXPECTED_PATCH_COUNT
    assert total_tokens == expected_total, (
        f"Unerwartete Token-Anzahl: got {total_tokens}, erwartet {expected_total}. "
        f"DINOv3-Layout hat sich geändert — _PATCH_TOKEN_START / _EXPECTED_PATCH_COUNT anpassen."
    )

    patch_tokens = outputs.last_hidden_state[:, _PATCH_TOKEN_START:, :]
    mean_embedding = patch_tokens.mean(dim=1).squeeze().numpy()

    assert mean_embedding.shape == (EMBEDDING_DIM,), f"Unerwartete Embedding-Shape: {mean_embedding.shape}"
    return mean_embedding


def mean_pool(embeddings: list) -> np.ndarray:
    """Mean-Pool über N View-Embeddings zu einem einzigen EMBEDDING_DIM-Vektor.

    Wird weiterhin als Fallback in parts.embedding geschrieben, damit alte Routen
    (z.B. Admin-Listen) ohne Multi-View-Query auskommen. Die eigentliche Suche
    läuft seit Hebel-2 über part_views (Max-per-Group statt Mean).

    Args:
        embeddings: Liste von numpy-Arrays, je Shape (EMBEDDING_DIM,).

    Returns:
        numpy-Array der Shape (EMBEDDING_DIM,) — arithmetisches Mittel aller Views.
    """
    assert len(embeddings) > 0, "Leere Embedding-Liste"
    stacked = np.stack(embeddings)
    pooled = np.mean(stacked, axis=0)
    assert pooled.shape == (EMBEDDING_DIM,), f"Unerwartete Pool-Shape: {pooled.shape}"
    return pooled
