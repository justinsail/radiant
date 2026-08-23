#!/usr/bin/env python3
"""Build the Mac Dock icon by RESIZING the shipped swirl, never re-rendering it.

⚠️ DO NOT USE make-icon.py FOR THE DOCK ICON. That script re-renders the mark
from the vector-ish source through a blur/threshold "crisp" pass whose radius
scales with the output size. Rendering the swirl larger ran it through a heavier
blur, and the remap ate the thin inner arcs: measured ink density inside the
swirl's own bounding box fell from 51.8% to 28.2%. The rings turned into a few
fat blobs. Tony, 2026-08-22: "you completely fucked up the swirl".

The artwork is already right. The only thing that was ever wrong is its SIZE
next to AiOS in the Dock. So: lift the exact pixels off the shipped icon,
resample once, and composite. Nothing reinterprets the drawing.

Targets, measured off ~/Projects/aios-claude/mac/icon-1024.png:
    body  918/1024 = 0.896 of the canvas
    swirl 694/1024 = 0.678

    python3 scripts/make-mac-icon.py [source.png]

Writes build/icon.png only. The web/iOS favicon set is separate, full-bleed,
and signed off — see AGENTS.md. Rebuild the .icns afterwards with iconutil.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CANVAS = 1024
BLUE = (83, 119, 179)
BODY = int(round(0.896 * CANVAS))   # 918
MARK = 694                          # AiOS's swirl, exactly


def lift_swirl(img: Image.Image) -> Image.Image:
    """The white swirl as a soft coverage mask, cropped to the ink.

    Soft, not binary: a hard threshold would throw away the anti-aliased edge
    and the resize would then look stair-stepped.
    """
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    cover = np.clip((lum - 120) / (235 - 120), 0, 1) * (alpha > 128)
    ys, xs = np.where(cover > 0.5)
    if not len(xs):
        raise SystemExit("no white swirl found in the source icon")
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return Image.fromarray((cover * 255).astype(np.uint8)).crop(box)


def squircle(size: int) -> Image.Image:
    """Apple's rounded shape. A plain rounded rect reads as subtly wrong."""
    y, x = np.mgrid[0:size, 0:size]
    c = (size - 1) / 2
    e = (np.abs(x - c) / c) ** 5.0 + (np.abs(y - c) / c) ** 5.0
    return Image.fromarray((np.clip((1.0 - e) * size / 3.0 + 0.5, 0, 1) * 255).astype(np.uint8))


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build/icon.png"
    mark = lift_swirl(Image.open(src))
    print(f"  lifted swirl {mark.size[0]}x{mark.size[1]} from {src.name}")

    mark = mark.resize((MARK, MARK), Image.LANCZOS)
    body = Image.new("RGBA", (BODY, BODY), (*BLUE, 255))
    body.putalpha(squircle(BODY))
    white = Image.new("RGBA", mark.size, (255, 255, 255, 255))
    white.putalpha(mark)
    body.alpha_composite(white, ((BODY - MARK) // 2,) * 2)

    icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    icon.paste(body, ((CANVAS - BODY) // 2,) * 2, body)
    out = ROOT / "build/icon.png"
    icon.save(out)
    print(f"  wrote {out.relative_to(ROOT)}  body {BODY}  swirl {MARK}")

    # .icns from the same master, so they can never disagree
    iconset = ROOT / "build/icon.iconset"
    subprocess.run(["rm", "-rf", str(iconset)], check=True)
    iconset.mkdir(parents=True)
    for px, names in [(16, ["16x16"]), (32, ["16x16@2x", "32x32"]), (64, ["32x32@2x"]),
                      (128, ["128x128"]), (256, ["128x128@2x", "256x256"]),
                      (512, ["256x256@2x", "512x512"]), (1024, ["512x512@2x"])]:
        im = icon.resize((px, px), Image.LANCZOS)
        for n in names:
            im.save(iconset / f"icon_{n}.png")
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(ROOT / "build/icon.icns")], check=True)
    print("  wrote build/icon.icns")


if __name__ == "__main__":
    main()
