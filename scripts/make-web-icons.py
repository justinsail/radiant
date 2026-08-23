#!/usr/bin/env python3
"""Build the web / iOS Home Screen icon set, matching MeOS and AiOS.

⚠️ THIS IS NOT THE MAC ICON. Two separate sets, deliberately different:
    Mac Dock  — scripts/make-mac-icon.py: a squircle inset in a padded canvas
                (body 0.896), because macOS supplies the surrounding spacing.
    Web / iOS — this file: a FULL-BLEED square. iOS applies its own rounded
                mask, so any padding we bake in just shrinks the mark next to
                the other apps on the Home Screen.

⚠️ AND DO NOT RE-RENDER THE SWIRL. make-icon.py redraws it through a
blur/threshold pass that thins the strokes as the size grows — that shipped
once and had to be reverted. Here the swirl pixels are lifted from the existing
artwork and resampled, nothing reinterprets the drawing.

Measured off MeOS's apple-touch-icon, which sits beside Radiant on the Home
Screen: full-bleed tile, swirl 0.756 of the canvas. Radiant's was 0.683, which
read as visibly smaller in the row.

    python3 scripts/make-web-icons.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build/icon.png"          # the Mac icon: correct artwork, big swirl
BLUE = (83, 119, 179)
MASTER = 1024
SWIRL_FRAC = 0.756                     # MeOS / AiOS

TARGETS = [
    (ROOT / "public/icon-512.png", 512),
    (ROOT / "public/icon-192.png", 192),
    (ROOT / "public/apple-touch-icon.png", 180),
    (ROOT / "public/favicon.png", 64),
]


def lift_swirl(img: Image.Image) -> Image.Image:
    """The white swirl as a soft coverage mask, cropped to the ink."""
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    cover = np.clip((lum - 120) / (235 - 120), 0, 1) * (alpha > 128)
    ys, xs = np.where(cover > 0.5)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return Image.fromarray((cover * 255).astype(np.uint8)).crop(box)


def main() -> None:
    mark = lift_swirl(Image.open(SRC))
    px = int(round(MASTER * SWIRL_FRAC))
    mark = mark.resize((px, px), Image.LANCZOS)

    icon = Image.new("RGBA", (MASTER, MASTER), (*BLUE, 255))   # full bleed
    white = Image.new("RGBA", mark.size, (255, 255, 255, 255))
    white.putalpha(mark)
    icon.alpha_composite(white, ((MASTER - px) // 2,) * 2)

    for path, size in TARGETS:
        icon.resize((size, size), Image.LANCZOS).save(path)
        print(f"  {path.relative_to(ROOT)}  {size}x{size}")
    print(f"done — full bleed, swirl {SWIRL_FRAC} of canvas")


if __name__ == "__main__":
    main()
