#!/usr/bin/env python3
"""Rebuild every Radiant icon asset from one source, crisply.

⚠️ THE OLD ICON WAS STAIR-STEPPED, AND THE ARTWORK WAS NOT THE PROBLEM. The
outer disc edge in the previous file was already smooth; only the swirl had
jagged edges. That is the signature of a knockout applied as a binary alpha —
each pixel fully in or fully out, no partial coverage — not of a low-resolution
source. Blurring the finished 1024 would only smear those steps; the fix is to
smooth the CONTOUR at 4x and let the downsample do the anti-aliasing.

⚠️ THE COLOUR IS MEASURED FROM THE OLD FILE, NOT CHOSEN. Tony, 2026-08-19:
"the same exact color it is now". (83, 119, 179).

Two shapes, because both were asked for:
  disc  — what Radiant has always had: a circle with the swirl cut out of it.
  tile  — the AiOS treatment: an opaque squircle with the swirl in white.

    python3 scripts/make-icon.py [disc|tile]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

BLUE = (83, 119, 179)
WHITE = (255, 255, 255)
CANVAS = 1024
SS = 4  # supersample factor for the contour smoothing

ROOT = Path(__file__).resolve().parent.parent
# ⚠️ THE SWIRL IS LIFTED FROM THE SHIPPED ICON because there is no vector
# source in this repo. If one ever appears, point this at it instead — the
# rest of the script does not care where the mask comes from.
SOURCE = ROOT / "src/assets/logo-mark.png"

# Every place the mark is published. Keeping them in one list is the point:
# they drifted apart before, and a favicon that disagrees with the app icon is
# the kind of thing nobody notices until a customer does.
TARGETS = [
    (ROOT / "build/icon.png", 1024),
    (ROOT / "src/assets/logo-mark.png", 1024),
    (ROOT / "public/icon-512.png", 512),
    (ROOT / "public/icon-192.png", 192),
    (ROOT / "public/apple-touch-icon.png", 180),
    (ROOT / "public/favicon.png", 64),
]


def swirl_mask(src: Path) -> Image.Image:
    """The swirl on its own, as a white-on-black mask, cropped to the ink."""
    a = np.array(Image.open(src).convert("RGBA"))
    alpha = a[..., 3]
    opaque = alpha > 128
    ys, xs = np.where(opaque)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    rad = min(xs.max() - xs.min(), ys.max() - ys.min()) / 2
    yy, xx = np.mgrid[0 : alpha.shape[0], 0 : alpha.shape[1]]
    inside = ((xx - cx) ** 2 + (yy - cy) ** 2) <= (rad * 0.99) ** 2
    mark = Image.fromarray(((inside & (alpha < 128)) * 255).astype(np.uint8))
    box = mark.getbbox()
    return mark.crop(box) if box else mark


def crisp(mask: Image.Image, px: int) -> Image.Image:
    """Smooth a stair-stepped contour, then resample down for real anti-aliasing."""
    big = mask.resize((px * SS, px * SS), Image.LANCZOS)
    big = big.filter(ImageFilter.GaussianBlur(radius=px * SS / 260))
    arr = np.array(big).astype(np.float32) / 255
    big = Image.fromarray(((arr > 0.5) * 255).astype(np.uint8))
    return big.resize((px, px), Image.LANCZOS)


def _shape(size: int, kind: str) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size]
    c = (size - 1) / 2
    if kind == "disc":
        d = np.sqrt((x - c) ** 2 + (y - c) ** 2)
        a = np.clip((c - d) * size / 3.0 + 0.5, 0, 1)
    else:
        # Apple's rounded shape is a squircle; a plain rounded rect reads as
        # subtly wrong beside every other icon in the Dock.
        e = (np.abs(x - c) / c) ** 5.0 + (np.abs(y - c) / c) ** 5.0
        a = np.clip((1.0 - e) * size / 3.0 + 0.5, 0, 1)
    return Image.fromarray((a * 255).astype(np.uint8))


def render(kind: str, mark: Image.Image, canvas: int) -> Image.Image:
    # Measured off the two existing icons, so each keeps its own proportions.
    body_frac, mark_frac = (0.920, 0.789) if kind == "disc" else (0.878, 0.753)
    size = int(canvas * body_frac)
    body = Image.new("RGBA", (size, size), (*BLUE, 255))
    body.putalpha(_shape(size, kind))

    m = crisp(mark, int(canvas * mark_frac))
    offset = ((size - m.size[0]) // 2,) * 2
    if kind == "disc":
        # Cut the swirl out of the blue, as it has always been.
        hole = Image.new("L", (size, size), 0)
        hole.paste(m, offset)
        cur = np.array(body.getchannel("A")).astype(np.int16)
        body.putalpha(Image.fromarray(np.clip(cur - np.array(hole), 0, 255).astype(np.uint8)))
    else:
        white = Image.new("RGBA", m.size, (*WHITE, 255))
        white.putalpha(m)
        body.alpha_composite(white, offset)

    icon = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    icon.paste(body, ((canvas - size) // 2,) * 2, body)
    return icon


def main() -> None:
    kind = sys.argv[1] if len(sys.argv) > 1 else "disc"
    if kind not in ("disc", "tile"):
        raise SystemExit("usage: make-icon.py [disc|tile]")
    mark = swirl_mask(SOURCE)
    master = render(kind, mark, CANVAS)
    for path, px in TARGETS:
        path.parent.mkdir(parents=True, exist_ok=True)
        # ⚠️ RESIZE THE FINISHED ICON, never re-render at the small size — the
        # 64px favicon rendered natively would lose the thin inner arcs
        # entirely, and the set would stop looking like one mark.
        (master if px == CANVAS else master.resize((px, px), Image.LANCZOS)).save(path)
        print(f"  {path.relative_to(ROOT)}  {px}x{px}")
    print(f"done — {kind}, colour {BLUE}")


if __name__ == "__main__":
    main()
