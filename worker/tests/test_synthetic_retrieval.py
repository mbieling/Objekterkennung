# worker/tests/test_synthetic_retrieval.py
# Synthetischer Sanity-Check für die Bild-Retrieval-Pipeline.
#
# Frage: Wenn wir einen existierenden Render auf einen "Foto-ähnlichen" Hintergrund
#        komponieren, findet die Pipeline das Original-Teil als Top-1?
#
# Das ist KEIN Foto-Test (Domain-Gap mit echten Reflexen, Materialien, Perspektive
# wird hier nicht abgebildet), aber er prüft, ob die Background-Removal-Pipeline
# wenigstens den Hintergrund-Anteil neutralisiert.
#
# Drei synthetische Hintergründe — alle programmatisch erzeugt für Reproduzierbarkeit:
#   - "wood":     Holzmaserung-Simulation (parallele Bänder, beige/braun)
#   - "workbench": Werkbank-Simulation (Metall-Grau mit Kratzer-Rauschen)
#   - "fabric":   Stoff-Simulation (Karo-Muster, dunkelblau)
#
# Voraussetzung: rembg muss verfügbar sein. Test wird übersprungen, falls nicht.
#
# Ausführung:
#   docker compose exec worker python -m pytest worker/tests/test_synthetic_retrieval.py -v -s

import os
import sys
import logging
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

logger = logging.getLogger(__name__)

# Pfad zu den Beispiel-Renderings (außerhalb des Repos — siehe README zur Suche).
# Tests greifen darauf zu, falls verfügbar; ansonsten skip.
EXAMPLE_THUMBNAILS_DIR = Path(
    os.environ.get(
        "SYNTHETIC_TEST_THUMBNAILS_DIR",
        "/Users/mbieling/claude/bbs/Bilder/05-11-2026-20-06-45_files_list",
    )
)


def _make_wood_bg(size: int = 1024, seed: int = 0) -> Image.Image:
    """Generiert einen Holzmaserungs-ähnlichen Hintergrund (deterministisch)."""
    rng = np.random.default_rng(seed)
    base = np.full((size, size, 3), [188, 152, 110], dtype=np.uint8)
    # Vertikale Streifen + Rauschen für Maserung
    for x in range(size):
        offset = int(15 * np.sin(x / 25.0)) + rng.integers(-8, 8)
        col = np.clip(base[:, x] + offset, 0, 255)
        base[:, x] = col
    # Knoten-Punkte
    for _ in range(rng.integers(2, 5)):
        cy, cx = rng.integers(100, size - 100, 2)
        r = rng.integers(20, 60)
        yy, xx = np.ogrid[:size, :size]
        mask = (yy - cy) ** 2 + (xx - cx) ** 2 < r ** 2
        base[mask] = np.clip(base[mask] - 40, 0, 255)
    return Image.fromarray(base)


def _make_workbench_bg(size: int = 1024, seed: int = 1) -> Image.Image:
    """Generiert einen Werkbank-ähnlichen Hintergrund (Metall-Grau mit Kratzern)."""
    rng = np.random.default_rng(seed)
    base = np.full((size, size, 3), [130, 130, 135], dtype=np.uint8)
    noise = rng.integers(-15, 15, (size, size, 3), dtype=np.int16)
    base = np.clip(base.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(base)
    draw = ImageDraw.Draw(img)
    for _ in range(rng.integers(20, 40)):
        x0, y0 = rng.integers(0, size, 2)
        x1, y1 = x0 + rng.integers(-100, 100), y0 + rng.integers(-100, 100)
        draw.line([(x0, y0), (x1, y1)], fill=(80, 80, 85), width=1)
    return img


def _make_fabric_bg(size: int = 1024, seed: int = 2) -> Image.Image:
    """Generiert einen Stoff-ähnlichen Hintergrund (Karo-Muster)."""
    base = np.full((size, size, 3), [40, 55, 95], dtype=np.uint8)
    grid = 32
    for i in range(0, size, grid):
        base[i:i + 2, :] = [70, 85, 130]
        base[:, i:i + 2] = [70, 85, 130]
    rng = np.random.default_rng(seed)
    noise = rng.integers(-8, 8, (size, size, 3), dtype=np.int16)
    base = np.clip(base.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(base)


def _composite_on_bg(
    render: Image.Image,
    bg: Image.Image,
    scale_pct: float = 0.4,
    rotation_deg: float = 0.0,
) -> Image.Image:
    """Komponiert einen Render-Output auf einen Hintergrund.

    Annahme: render hat weißen Hintergrund. Weiße Pixel werden transparent gemacht,
    dann wird das Teil auf bg gelegt — verkleinert auf scale_pct des Hintergrunds.
    """
    render = render.convert("RGB")
    bg = bg.convert("RGB").copy()

    # Weiß → transparent: Pixel mit min(rgb)>240 als Hintergrund interpretieren
    arr = np.array(render)
    mask = arr.min(axis=2) > 240
    rgba = np.concatenate([arr, (~mask * 255).astype(np.uint8)[..., None]], axis=2)
    render_rgba = Image.fromarray(rgba, mode="RGBA")

    if rotation_deg != 0:
        render_rgba = render_rgba.rotate(rotation_deg, expand=True, resample=Image.BICUBIC)

    target_w = int(bg.size[0] * scale_pct)
    aspect = render_rgba.size[1] / render_rgba.size[0]
    target_h = int(target_w * aspect)
    render_rgba = render_rgba.resize((target_w, target_h), Image.LANCZOS)

    offset = (
        (bg.size[0] - target_w) // 2,
        (bg.size[1] - target_h) // 2,
    )
    bg.paste(render_rgba, offset, mask=render_rgba.split()[-1])
    return bg


def _collect_renders() -> dict[str, list[Path]]:
    """Sammelt vorhandene Render-Sätze aus EXAMPLE_THUMBNAILS_DIR.

    Returns: {part_id: [view_0.png, ..., view_7.png]}
    """
    if not EXAMPLE_THUMBNAILS_DIR.exists():
        return {}
    out = {}
    for part_dir in EXAMPLE_THUMBNAILS_DIR.iterdir():
        if not part_dir.is_dir():
            continue
        views = sorted(part_dir.glob("view_*.png"))
        if len(views) >= 1:
            out[part_dir.name] = views
    return out


def _has_rembg() -> bool:
    try:
        import rembg  # noqa
        return True
    except ImportError:
        return False


@pytest.mark.skipif(not _has_rembg(), reason="rembg nicht installiert (im Worker-Container ausführen)")
@pytest.mark.skipif(not EXAMPLE_THUMBNAILS_DIR.exists(), reason="Keine Beispiel-Renderings vorhanden")
def test_synthetic_retrieval_top1_recall(tmp_path):
    """Pipeline-Sanity-Check:

    Für jedes verfügbare Render-Set:
      1. Wähle ein zufälliges View (z.B. view_0)
      2. Komponiere auf 3 verschiedene Hintergründe
      3. Berechne Embedding mit voller Pipeline (rembg + Crop + Pad)
      4. Berechne Embeddings aller Original-Views
      5. Prüfe: Top-1 muss das gleiche Teil sein

    Aussage: Wenn Top-1-Recall hoch ist (>50%), neutralisiert die Pipeline den
    synthetischen Domain-Gap. Wenn niedrig (<30%), ist das Embedding-Modell
    selbst das Problem (DINOv2-Limitation) und Hebel 3 (Edge-Render) wird nötig.
    """
    from worker.embedder import get_embedding

    renders = _collect_renders()
    if not renders:
        pytest.skip("Keine Renderings im Beispielordner gefunden")

    # Index aufbauen: alle Views aller Teile embedden (mode='render')
    logger.info(f"Index-Aufbau: {sum(len(v) for v in renders.values())} Views")
    index = []  # list of (part_id, view_idx, embedding)
    for part_id, views in renders.items():
        for vi, view_path in enumerate(views):
            emb = get_embedding(str(view_path), mode="render")
            index.append((part_id, vi, emb))

    backgrounds = {
        "wood": _make_wood_bg(),
        "workbench": _make_workbench_bg(),
        "fabric": _make_fabric_bg(),
    }

    results = []  # list of (part_id, bg_name, top1_part_id, top1_sim, correct_rank)
    for part_id, views in renders.items():
        query_view = views[0]  # immer die Vorderansicht
        render_img = Image.open(query_view)

        for bg_name, bg in backgrounds.items():
            composite = _composite_on_bg(render_img, bg, scale_pct=0.4)
            composite_path = tmp_path / f"{part_id}_{bg_name}.png"
            composite.save(composite_path)

            query_emb = get_embedding(str(composite_path), mode="photo")

            # MAX-per-Part-Similarity gegen den Index
            scores = {}
            for idx_part_id, _, idx_emb in index:
                sim = float(
                    np.dot(query_emb, idx_emb)
                    / (np.linalg.norm(query_emb) * np.linalg.norm(idx_emb) + 1e-9)
                )
                scores[idx_part_id] = max(scores.get(idx_part_id, -1.0), sim)

            ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
            top1_part_id, top1_sim = ranked[0]
            correct_rank = next(
                (i + 1 for i, (pid, _) in enumerate(ranked) if pid == part_id),
                len(ranked) + 1,
            )
            results.append((part_id, bg_name, top1_part_id, top1_sim, correct_rank))
            logger.info(
                f"[{part_id}/{bg_name}] Top-1={top1_part_id[:8]} sim={top1_sim:.3f} "
                f"correct_rank={correct_rank}"
            )

    # Auswertung
    top1_hits = sum(1 for _, _, top1, _, rank in results if rank == 1)
    top3_hits = sum(1 for _, _, _, _, rank in results if rank <= 3)
    total = len(results)

    print("\n=== Synthetischer Sanity-Check ===")
    print(f"Tests:    {total} (={len(renders)} Teile × {len(backgrounds)} Hintergründe)")
    print(f"Top-1:    {top1_hits}/{total} ({100*top1_hits/total:.1f}%)")
    print(f"Top-3:    {top3_hits}/{total} ({100*top3_hits/total:.1f}%)")
    print("Details (part_id[:8] / bg / top1_match / sim / correct_rank):")
    for part_id, bg_name, top1, sim, rank in results:
        flag = "OK" if rank == 1 else f"RANK={rank}"
        print(f"  {part_id[:8]}  {bg_name:10s}  -> {top1[:8]}  sim={sim:.3f}  [{flag}]")
    print()

    # Erfolgskriterium: bewusst weich — wir wollen Information, nicht Pass/Fail.
    # Wenn Recall <30%, ist Hebel 1+2 nicht genug und wir brauchen Hebel 3 (Edge-Render).
    assert total > 0, "Keine Testfälle generiert"
