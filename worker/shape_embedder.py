# worker/shape_embedder.py
# Shape Foundation Model (bayang/shape-foundation-small-v3) — Mesh-basiertes
# 3D-Form-Embedding für den Suchpfad-Re-Ranker (Hebel 4).
#
# Architektur:
#   STEP-Datei  → trimesh/gmsh Tessellation  → 4096 Surface-Punkte
#   → MAGNO-Encoder (24³ Latent-Grid) → Transformer-Processor (3 Layer × 4 Heads)
#   → Attention-Pooling über Tokens → 128-dim L2-normalisiertes Embedding
#
# Modell wird beim Modulimport einmalig geladen (~80MB Checkpoint). HF_HOME=/app/model_cache
# (Dockerfile-ENV) sorgt dafür, dass `hf download bayang/shape-foundation-small-v3`
# beim Container-Build ausgeführt wird und kein Laufzeit-Download nötig ist.
#
# Diese Datei isoliert das Shape-Modell hinter einer schmalen Public-API
# (get_shape_embedding) — die heavy imports von shape_foundation passieren nur
# einmalig beim ersten Import. Bei Modul-Ladefehlern (Modell-Checkpoint fehlt,
# torch-geometric nicht installiert) loggen wir und liefern None statt zu crashen —
# Hebel 4 ist optional, die Pipeline läuft auch ohne weiter.

# MUSS vor allen OCC/VTK-Imports stehen (RESEARCH.md Pitfall 1)
import os
os.environ.setdefault("VTK_DEFAULT_OPENGL_WINDOW", "vtkOSOpenGLRenderWindow")

import logging
import signal
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 128  # Shape small-v3 — siehe small.yaml: heads.embedding_dim

# Sicherheitsnetz: Mesh-Loading + Inferenz wird nach diesen Sekunden hart abgebrochen.
# Auf CPU mit komplexen STEP-Files (>2000 Faces) hängt trimesh.load mehrere Minuten
# bis ewig. Wir lieber kein Shape-Embedding als einen blockierten Worker.
SHAPE_TIMEOUT_SECONDS = int(os.environ.get("SHAPE_TIMEOUT_SECONDS", "60"))


class _ShapeTimeout(Exception):
    pass


def _timeout_handler(signum, frame):
    raise _ShapeTimeout(f"Shape-Embedding-Timeout nach {SHAPE_TIMEOUT_SECONDS}s")

# Anzahl Surface-Punkte pro Mesh-Sampling. Default in small.yaml ist 4096 — das ist
# für GPU-Training gedacht. Auf CPU skaliert das radius_search im MAGNO-Encoder
# überlinear mit der Punktzahl und wird bei komplexen Meshes (>2000 Faces) unbenutzbar
# langsam (10+ Min pro Teil). 1024 Punkte sind ~4× schneller und reichen für unsere
# Größenklasse von Bauteilen (~20-100mm Kantenlänge) erfahrungsgemäß für stabile Embeddings.
# Override per Env-Var möglich für Experimente.
SURFACE_POINTS_OVERRIDE = int(os.environ.get("SHAPE_SURFACE_POINTS", "1024"))

# Lazy-Singleton-Pattern: Modell, Preprocessor und Sampler werden beim ersten
# Aufruf von get_shape_embedding initialisiert, NICHT beim Modulimport. Das hält
# Worker-Startup-Tests offen, die Shape nicht brauchen (Renderer-Tests etc.).
_MODEL = None
_PREPROCESSOR = None
_SAMPLER = None
_DEVICE = None
_LOAD_FAILED = False  # einmaliger Fehler-Cache — verhindert wiederholtes Load-Retry


def _ensure_loaded() -> bool:
    """Lädt Modell + Preprocessor beim ersten Aufruf. Returns True bei Erfolg."""
    global _MODEL, _PREPROCESSOR, _SAMPLER, _DEVICE, _LOAD_FAILED
    if _MODEL is not None:
        return True
    if _LOAD_FAILED:
        return False

    try:
        import torch
        from shape_foundation.configs.default import ShapeConfig
        from shape_foundation.models.gaot_backbone import GAOTBackbone
        from shape_foundation.data.preprocessing import MeshPreprocessor
        from shape_foundation.data.sampling import SurfaceSampler
    except ImportError as e:
        logger.error(f"Shape-Foundation-Stack nicht installiert: {e}. Re-Ranking wird übersprungen.")
        _LOAD_FAILED = True
        return False

    ckpt_path = os.environ.get(
        "SHAPE_CHECKPOINT_PATH",
        "/app/model_cache/shape-foundation-small-v3/checkpoint_final.pt",
    )
    if not os.path.exists(ckpt_path):
        logger.error(f"Shape-Checkpoint nicht gefunden unter {ckpt_path}. Re-Ranking wird übersprungen.")
        _LOAD_FAILED = True
        return False

    logger.info(f"Lade Shape-Foundation-Modell: {ckpt_path}")
    try:
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        cfg = ckpt.get("config") or ShapeConfig()

        # Anzahl Surface-Punkte runterdrehen, damit CPU-Inferenz mit komplexen Meshes nicht
        # explodiert (radius_search ist O(N×M) und wird bei 4096 Punkten × 13824 Grid-Tokens
        # auf CPU unbenutzbar). 1024 ist der Sweet-Spot für unsere Bauteil-Größenklasse.
        if hasattr(cfg, "input") and hasattr(cfg.input, "num_surface_points"):
            cfg.input.num_surface_points = SURFACE_POINTS_OVERRIDE
            logger.info(f"Surface-Sample-Punkte gesetzt auf {SURFACE_POINTS_OVERRIDE} (CPU-Optimierung)")

        model = GAOTBackbone(cfg)
        model.load_state_dict(ckpt["model_state_dict"], strict=False)
        model.eval()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)

        _MODEL = model
        _PREPROCESSOR = MeshPreprocessor(cfg.input)
        _SAMPLER = SurfaceSampler(cfg.input)
        _DEVICE = device
        logger.info(f"Shape-Modell geladen (device={device}, params={model.get_num_params():,})")
        return True
    except Exception as e:
        logger.exception(f"Shape-Modell-Laden fehlgeschlagen: {e}")
        _LOAD_FAILED = True
        return False


def get_shape_embedding(step_path: str) -> Optional[np.ndarray]:
    """Berechnet ein 128-dim Shape-Embedding für eine STEP-Datei.

    Args:
        step_path: Pfad zu einer STEP-/STP-Datei (auch STL/OBJ/PLY werden akzeptiert).

    Returns:
        numpy-Array der Shape (EMBEDDING_DIM,) ODER None bei Fehler.
        None ist explizit erlaubt — die Pipeline schreibt dann NULL in parts.shape_embedding
        und der Suchpfad-Re-Ranker hält den Beitrag neutral.

    Pipeline:
        1. Mesh laden (trimesh STEP-Loader oder gmsh-Fallback)
        2. MeshPreprocessor (Normalisierung in [-1,1])
        3. SurfaceSampler (4096 Punkte mit Features + Normalen + Curvature)
        4. GAOTBackbone.forward_tokens → pooled_embedding (B, 128)
        5. L2-Normalisierung für stabilen Cosine-Vergleich
    """
    if not _ensure_loaded():
        return None

    try:
        import torch
        from shape_foundation.preprocessing.mesh_io import load_mesh
    except ImportError:
        return None

    # Timeout via SIGALRM — Schutz vor trimesh-STEP-Loader, der bei komplexen
    # Geometrien auf CPU minutenlang hängen kann. Funktioniert nur im main thread
    # (reindex.py + celery --pool=solo). In Worker-Pools muss der Aufrufer den
    # Timeout selbst lösen.
    try:
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(SHAPE_TIMEOUT_SECONDS)
    except (ValueError, AttributeError):
        # Nicht in main thread oder Plattform ohne SIGALRM — laufen wir ohne Timeout
        pass

    try:
        mesh = load_mesh(step_path)
        if mesh.vertices.shape[0] < 4 or mesh.faces.shape[0] < 4:
            logger.warning(f"Mesh zu degeneriert für Shape-Embedding: {step_path} "
                           f"(V={mesh.vertices.shape[0]}, F={mesh.faces.shape[0]})")
            return None

        processed = _PREPROCESSOR(mesh.vertices, mesh.faces, mesh.normals)
        sampled = _SAMPLER.sample(
            processed["vertices"], processed["faces"],
            processed["normals"], processed.get("curvature"),
        )

        features = _PREPROCESSOR.build_features(
            sampled["points"], sampled["normals"], sampled.get("curvature"),
        )

        points_t = torch.from_numpy(sampled["points"]).unsqueeze(0).to(_DEVICE)
        feat_t = torch.from_numpy(features).unsqueeze(0).to(_DEVICE)
        normals_t = torch.from_numpy(sampled["normals"]).unsqueeze(0).to(_DEVICE)
        curvature_t = None
        if sampled.get("curvature") is not None:
            crv = sampled["curvature"]
            curvature_t = torch.from_numpy(
                crv[:, None] if crv.ndim == 1 else crv
            ).unsqueeze(0).to(_DEVICE)

        with torch.no_grad():
            out = _MODEL.forward_tokens(points_t, feat_t, normals_t, curvature_t)
            pooled = out["pooled_embedding"]  # (1, 128)
            # L2-Normalisierung für stabilen Cosine-Vergleich (analog DINOv3-Pipeline)
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=-1)

        emb = pooled.squeeze(0).cpu().numpy().astype(np.float32)
        assert emb.shape == (EMBEDDING_DIM,), f"Unerwartete Embedding-Shape: {emb.shape}"
        return emb

    except _ShapeTimeout:
        logger.warning(f"Shape-Embedding-Timeout (>{SHAPE_TIMEOUT_SECONDS}s) für {step_path} — überspringe")
        return None
    except Exception as e:
        logger.exception(f"Shape-Embedding fehlgeschlagen für {step_path}: {e}")
        return None
    finally:
        try:
            signal.alarm(0)
        except (ValueError, AttributeError):
            pass
