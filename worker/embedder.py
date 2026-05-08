# worker/embedder.py
# DINOv2 ViT-B/14 Inferenz für CAD-Part-Embeddings.
# Modell wird beim Modulimport einmalig geladen (~3s).
# TRANSFORMERS_CACHE=/app/model_cache (Dockerfile) — kein HuggingFace-Download zur Laufzeit.

import logging
import numpy as np
from PIL import Image
import torch
from transformers import AutoImageProcessor, AutoModel

logger = logging.getLogger(__name__)

# Einmaliges Laden beim Modulimport (RESEARCH.md Anti-Pattern: nicht in Schleife laden)
# TRANSFORMERS_CACHE=/app/model_cache via Dockerfile ENV — Modell ist bereits gecacht
_MODEL_NAME = "facebook/dinov2-base"
logger.info(f"Lade DINOv2-Modell: {_MODEL_NAME}")
_processor = AutoImageProcessor.from_pretrained(_MODEL_NAME)
_model = AutoModel.from_pretrained(_MODEL_NAME)
_model.eval()
logger.info("DINOv2-Modell geladen")


def get_embedding(image_path: str) -> np.ndarray:
    """Berechnet Patch-Token Mean-Pool Embedding (768-dim) für ein Bild.

    Args:
        image_path: Pfad zu einer PNG-Datei (512x512px aus renderer.py)

    Returns:
        numpy-Array der Shape (768,) — DINOv2 ViT-B/14 Patch-Token Mean-Pool

    Preprocessing (D-06):
        - Resize auf 224x224 VOR AutoImageProcessor (verhindert unerwartete Skalierung)
        - Mean-Pool der Patch-Tokens (Index 1..256) — NICHT CLS-Token (Index 0)
        - CR-03 Fix: Patch-Mean-Pool liefert bessere geometrische Ähnlichkeit als CLS-Token
          Quelle: 02-REVIEW.md CR-03 + CLAUDE.md Architektur-Entscheidung
    """
    # Resize auf 224x224px (D-06: DINOv2 nativer Input) vor Processor
    img = Image.open(image_path).convert("RGB").resize((224, 224))

    inputs = _processor(images=img, return_tensors="pt")

    with torch.no_grad():
        outputs = _model(**inputs)

    # CR-03 Fix: Patch-Token Mean-Pool statt CLS-Token
    # last_hidden_state: Shape [batch=1, seq_len=257, hidden=768]
    # Index 0 = CLS-Token, Index 1..256 = 256 Patch-Tokens (16x16 Patches bei 224px)
    patch_tokens = outputs.last_hidden_state[:, 1:, :]  # Shape: [1, 256, 768]
    mean_embedding = patch_tokens.mean(dim=1).squeeze().numpy()  # Shape: (768,)

    assert mean_embedding.shape == (768,), f"Unerwartete Embedding-Shape: {mean_embedding.shape}"
    return mean_embedding


def mean_pool(embeddings: list) -> np.ndarray:
    """Mean-Pool über alle 8 View-Embeddings zu einem einzigen 768-dim Vektor (D-07).

    Args:
        embeddings: Liste von 8 numpy-Arrays, je Shape (768,)

    Returns:
        numpy-Array der Shape (768,) — arithmetisches Mittel aller Views
    """
    assert len(embeddings) > 0, "Leere Embedding-Liste"
    stacked = np.stack(embeddings)  # Shape: (N, 768)
    pooled = np.mean(stacked, axis=0)  # Shape: (768,)
    assert pooled.shape == (768,), f"Unerwartete Pool-Shape: {pooled.shape}"
    return pooled
