#!/usr/bin/env python3
"""scripts/spike_groundedsam.py — Spike (Hebel 5).

Vergleicht die Hintergrund-Maske von rembg/U²Net (Status quo in
`worker/preprocess.py`) mit der Maske von Grounding DINO + SAM
("GroundedSAM") auf einer kleinen Stichprobe Referenzfotos.

KEINE Integration ins Produkt — reines Diagnose-Tool. Output:
  - Pro Foto ein PNG-Panel (Original | rembg-Cutout | GroundedSAM-Cutout | Diff)
  - summary.json mit Laufzeiten, Masken-Flächen und IoU

Ausführung im Worker-Container (hat rembg, transformers, torch, HF_TOKEN):

    REF_DIR=/Users/mbieling/claude/bbs/Bilder/Reverenz
    OUT_DIR=eval/spike_results/groundedsam_$(date +%Y%m%d-%H%M%S)
    mkdir -p "$OUT_DIR"

    docker compose cp scripts/spike_groundedsam.py worker:/tmp/spike.py
    docker compose exec worker rm -rf /tmp/refs /tmp/spike_out
    docker compose cp "$REF_DIR/." worker:/tmp/refs
    docker compose exec worker python /tmp/spike.py /tmp/refs /tmp/spike_out
    docker compose cp worker:/tmp/spike_out/. "$OUT_DIR"

Default-Prompt für Grounding DINO ist '.'-getrennt
("object . metal part . component ."), wie vom Modell erwartet.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("spike_groundedsam")

# rembg-Pfad aus dem Worker-Modul wiederverwenden, damit der Spike-Vergleich
# exakt das Verhalten der Produktion misst.
sys.path.insert(0, "/app")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


GROUNDING_DINO_ID = "IDEA-Research/grounding-dino-tiny"
SAM_ID = "facebook/sam-vit-base"


def load_groundedsam():
    from transformers import (
        AutoModelForZeroShotObjectDetection,
        AutoProcessor,
        SamModel,
        SamProcessor,
    )

    log.info(f"Lade Grounding DINO ({GROUNDING_DINO_ID}) …")
    g_proc = AutoProcessor.from_pretrained(GROUNDING_DINO_ID)
    g_model = AutoModelForZeroShotObjectDetection.from_pretrained(GROUNDING_DINO_ID)
    g_model.eval()

    log.info(f"Lade SAM ({SAM_ID}) …")
    s_proc = SamProcessor.from_pretrained(SAM_ID)
    s_model = SamModel.from_pretrained(SAM_ID)
    s_model.eval()
    return g_proc, g_model, s_proc, s_model


def rembg_mask(img: Image.Image) -> dict:
    from worker.preprocess import _remove_background  # type: ignore

    t0 = time.time()
    rgba = _remove_background(img)
    alpha = np.array(rgba.split()[-1])
    mask = alpha > 10
    return {"mask": mask, "ms": int((time.time() - t0) * 1000)}


def groundedsam_mask(img: Image.Image, prompt: str, models) -> dict:
    g_proc, g_model, s_proc, s_model = models

    t0 = time.time()
    g_in = g_proc(images=img, text=prompt, return_tensors="pt")
    with torch.no_grad():
        g_out = g_model(**g_in)
    res = g_proc.post_process_grounded_object_detection(
        g_out,
        g_in.input_ids,
        threshold=0.25,
        text_threshold=0.20,
        target_sizes=[img.size[::-1]],
    )[0]
    g_ms = int((time.time() - t0) * 1000)

    if len(res["boxes"]) == 0:
        log.warning("Grounding DINO hat keine Bbox gefunden — Maske leer.")
        return {
            "mask": None,
            "bbox": None,
            "score": 0.0,
            "g_ms": g_ms,
            "s_ms": 0,
            "iou": 0.0,
        }

    scores = res["scores"]
    best = int(scores.argmax())
    bbox = res["boxes"][best].tolist()
    score = float(scores[best])

    t1 = time.time()
    s_in = s_proc(img, input_boxes=[[bbox]], return_tensors="pt")
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
    # SamProcessor liefert die Maske je nach transformers-Version mit gedrehten
    # Achsen — robust per PIL auf img.size resizen, dann ist die Maske garantiert
    # in der gleichen (H, W)-Konvention wie die rembg-Alpha-Maske.
    if mask_np.shape != (img.height, img.width):
        mask_pil = Image.fromarray((mask_np * 255).astype(np.uint8))
        mask_pil = mask_pil.resize(img.size, Image.NEAREST)
        mask_np = np.array(mask_pil) > 127
    s_ms = int((time.time() - t1) * 1000)

    return {
        "mask": mask_np,
        "bbox": bbox,
        "score": score,
        "g_ms": g_ms,
        "s_ms": s_ms,
        "iou": float(iou[best_mask_idx]),
    }


def _cutout(img: Image.Image, mask: np.ndarray | None) -> Image.Image:
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    if mask is None:
        arr[..., 3] = 0
    else:
        arr[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    return Image.fromarray(arr)


def _load_font() -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, 14)
    return ImageFont.load_default()


def composite_panel(orig: Image.Image, rb: dict, gs: dict, title: str) -> Image.Image:
    target_h = 400
    aspect = orig.width / orig.height
    target_w = int(target_h * aspect)
    orig_s = orig.resize((target_w, target_h), Image.LANCZOS)

    bg_grey = Image.new("RGB", (target_w, target_h), (230, 230, 230))

    def _on_grey(cut: Image.Image) -> Image.Image:
        panel = bg_grey.copy()
        panel.paste(cut, (0, 0), mask=cut.split()[-1])
        return panel

    rb_panel = _on_grey(_cutout(orig, rb["mask"]).resize((target_w, target_h), Image.LANCZOS))
    gs_panel = _on_grey(_cutout(orig, gs["mask"]).resize((target_w, target_h), Image.LANCZOS))

    if rb["mask"] is not None and gs["mask"] is not None:
        h, w = rb["mask"].shape
        diff = np.zeros((h, w, 3), dtype=np.uint8)
        diff[..., 0] = np.where(rb["mask"] & ~gs["mask"], 255, 0)  # rot   = nur rembg
        diff[..., 2] = np.where(~rb["mask"] & gs["mask"], 255, 0)  # blau  = nur GroundedSAM
        diff[..., 1] = np.where(rb["mask"] & gs["mask"], 180, 0)   # grün  = beide
        diff_img = Image.fromarray(diff).resize((target_w, target_h), Image.NEAREST)
    else:
        diff_img = Image.new("RGB", (target_w, target_h), (60, 60, 60))

    header_h = 60
    gap = 10
    total_w = target_w * 4 + gap * 3
    total_h = target_h + header_h
    canvas = Image.new("RGB", (total_w, total_h), (255, 255, 255))
    canvas.paste(orig_s, (0, header_h))
    canvas.paste(rb_panel, (target_w + gap, header_h))
    canvas.paste(gs_panel, (2 * target_w + 2 * gap, header_h))
    canvas.paste(diff_img, (3 * target_w + 3 * gap, header_h))

    draw = ImageDraw.Draw(canvas)
    font = _load_font()
    draw.text((10, 8), title, fill=(0, 0, 0), font=font)
    gs_total = gs["g_ms"] + gs["s_ms"]
    labels = [
        "Original",
        f"rembg/U2Net ({rb['ms']} ms)",
        f"GroundedSAM ({gs_total} ms, score={gs['score']:.2f}, sam-iou={gs['iou']:.2f})",
        "Diff (R=rembg-only, B=GS-only, G=both)",
    ]
    for i, lab in enumerate(labels):
        x = i * (target_w + gap) + 10
        draw.text((x, 32), lab, fill=(60, 60, 60), font=font)

    return canvas


def sample_photos(ref_dir: Path, n: int) -> list[Path]:
    """Wähle die Stichprobe deterministisch: erstes Foto aus jedem Unterordner +
    lose Open-Set-Queries aus dem Wurzelverzeichnis, dann gleichmäßig gestreckt
    auf n Stück (np.linspace-Indices)."""
    candidates: list[Path] = []
    for sub in sorted(ref_dir.iterdir()):
        if sub.is_dir():
            in_folder = sorted(
                [*sub.glob("*.jpg"), *sub.glob("*.jpeg"), *sub.glob("*.JPG"), *sub.glob("*.png")]
            )
            if in_folder:
                candidates.append(in_folder[0])
    for f in sorted(
        [*ref_dir.glob("*.jpg"), *ref_dir.glob("*.jpeg"), *ref_dir.glob("*.JPG"), *ref_dir.glob("*.png")]
    ):
        candidates.append(f)

    if len(candidates) <= n:
        return candidates
    idxs = np.linspace(0, len(candidates) - 1, n).astype(int)
    return [candidates[i] for i in idxs]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ref_dir", type=Path, help="Wurzel des Referenzfoto-Ordners")
    ap.add_argument("out_dir", type=Path, help="Ausgabe-Ordner (wird angelegt)")
    ap.add_argument("--n", type=int, default=5, help="Anzahl Stichprobenfotos (default 5)")
    ap.add_argument(
        "--prompt",
        default="object . metal part . component .",
        help="Grounding-DINO-Prompt, .-getrennte Labels",
    )
    ap.add_argument(
        "--max-side",
        type=int,
        default=1024,
        help="Längste Bildkante vor der Inferenz auf diesen Wert herunterskalieren (Speed/RAM)",
    )
    args = ap.parse_args()

    if not args.ref_dir.is_dir():
        log.error(f"REF_DIR nicht gefunden: {args.ref_dir}")
        sys.exit(2)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    photos = sample_photos(args.ref_dir, args.n)
    if not photos:
        log.error(f"Keine Fotos in {args.ref_dir} gefunden.")
        sys.exit(1)
    log.info(f"Stichprobe ({len(photos)}):")
    for p in photos:
        log.info(f"  {p}")

    models = load_groundedsam()

    summary: dict = {
        "timestamp": time.strftime("%Y-%m-%dT%H-%M-%S"),
        "prompt": args.prompt,
        "max_side": args.max_side,
        "grounding_dino": GROUNDING_DINO_ID,
        "sam": SAM_ID,
        "results": [],
    }

    for p in photos:
        log.info(f"--- {p.name} ---")
        img = Image.open(p).convert("RGB")
        # EXIF-Rotation explizit anwenden — iPhone-Fotos haben oft Orientation-Tags,
        # die rembg/SAM unterschiedlich respektieren. Erzwingt eine konsistente Pixel-Achse.
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
        if max(img.size) > args.max_side:
            scale = args.max_side / max(img.size)
            img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

        log.info(f"  img.size (W,H) = {img.size}  -> erwarte mask shape (H,W) = ({img.height}, {img.width})")

        rb = rembg_mask(img)
        gs = groundedsam_mask(img, args.prompt, models)

        # Defensive Achsen-Harmonisierung: beide Masken auf (img.height, img.width) zwingen
        expected_shape = (img.height, img.width)
        for name, m in (("rembg", rb), ("groundedsam", gs)):
            if m["mask"] is not None and m["mask"].shape != expected_shape:
                log.warning(f"  {name}-Maske Shape {m['mask'].shape} != erwartet {expected_shape} — resize via PIL")
                pil = Image.fromarray((m["mask"] * 255).astype(np.uint8))
                pil = pil.resize(img.size, Image.NEAREST)
                m["mask"] = np.array(pil) > 127

        rb_pct = float(rb["mask"].mean()) if rb["mask"] is not None else 0.0
        gs_pct = float(gs["mask"].mean()) if gs["mask"] is not None else 0.0
        iou_rb_gs = 0.0
        if rb["mask"] is not None and gs["mask"] is not None:
            inter = int((rb["mask"] & gs["mask"]).sum())
            union = int((rb["mask"] | gs["mask"]).sum())
            iou_rb_gs = inter / union if union > 0 else 0.0

        gs_total = gs["g_ms"] + gs["s_ms"]
        log.info(f"  rembg       : {rb['ms']:>5d} ms | maske {rb_pct * 100:5.1f} %")
        log.info(
            f"  GroundedSAM : {gs_total:>5d} ms | maske {gs_pct * 100:5.1f} % | "
            f"dino-score={gs['score']:.2f} sam-iou={gs['iou']:.2f}"
        )
        log.info(f"  IoU(rembg, GS): {iou_rb_gs:.3f}")

        panel = composite_panel(img, rb, gs, p.name)
        out_png = args.out_dir / f"compare_{p.stem}.png"
        panel.save(out_png)
        log.info(f"  -> {out_png}")

        summary["results"].append(
            {
                "file": str(p),
                "image_size": list(img.size),
                "rembg": {"mask_pct": rb_pct, "ms": rb["ms"]},
                "groundedsam": {
                    "mask_pct": gs_pct,
                    "bbox": gs["bbox"],
                    "dino_score": gs["score"],
                    "sam_iou": gs["iou"],
                    "dino_ms": gs["g_ms"],
                    "sam_ms": gs["s_ms"],
                },
                "iou_rembg_vs_groundedsam": iou_rb_gs,
                "comparison_png": out_png.name,
            }
        )

    summary_path = args.out_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    log.info("")
    log.info(f"Fertig. {len(photos)} Vergleich(e). Summary: {summary_path}")


if __name__ == "__main__":
    main()
