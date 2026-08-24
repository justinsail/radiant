#!/usr/bin/env python3
"""Build the iPhone launch screen: the Radiant lockup, mark over wordmark.

The launch screen shipped as Capacitor's own logo on white for six weeks. This
replaces it, and it does so by LIFTING src/assets/logo-mark.png — a white swirl
on transparent — and tinting it. The swirl is never re-drawn: every attempt to
regenerate it has changed its weight, and it is signed off as it is.

The lockup is the brand as it appears everywhere else — the WHITE swirl on
Radiant blue, exactly the app icon, with RADIANT set beneath it in Montserrat
800 uppercase at 0.02em, which is what src/styles.css has always meant by
".wordmark". An earlier pass here tinted the swirl blue on a light ground and
left the name off entirely; it read as a random blue spiral rather than as this
product, which is precisely what Tony said when he saw it.

Montserrat is not installed on the system and ships as woff2, so the build
converts node_modules/@fontsource/montserrat to TTF with fontTools. Requires:
    python3 -m pip install fonttools brotli pillow
"""
import struct, zlib, pathlib

# THE BRAND, used as pixels. Not re-rendered, not re-tinted, not set in a font
# I picked — these are the same two files the marketing site ships.
MARK = pathlib.Path('src/assets/brand/radiant-mark.png')
WORD = pathlib.Path('src/assets/brand/radiant-wordmark.png')
TT   = pathlib.Path('src/assets/brand/templeton-tech-mark.png')
# The iOS system font, so the byline is set in the same face the live screen
# uses rather than in the brand's display weight.
UI_FONT = pathlib.Path('/System/Library/Fonts/SFNS.ttf')
OUT = pathlib.Path('apps/ios/ios/App/App/Assets.xcassets/Splash.imageset')
SIDE = 2732
# The mark reads at about 110pt on a phone. Bigger than a bar glyph, nowhere
# near a hero — the wordmark under it is what carries the name.
MARK_FRAC = 0.13
# Wordmark cap height as a fraction of the mark's width, and the gap between
# them. Both taken from how the desktop sidebar sets brand-mark + brand-word.
WORD_FRAC = 0.20
GAP_FRAC = 0.34
BRAND_BG = (0x53, 0x77, 0xB3)   # the app icon's measured ground
# ⚠️ THE SIDES OF THIS SQUARE ARE NOT ON SCREEN. The launch image is one square
# shown scaleAspectFill, so on a tall phone it is scaled to the screen's HEIGHT
# and cropped left and right: an iPhone 17 Pro Max (440x956pt) shows the middle
# 46% of the width and the full height. Anything wider than that band is cut in
# half. Footer content is therefore held inside SAFE_W, and the vertical
# position can be trusted because nothing crops vertically.
SAFE_W = 0.40
BRAND_INK = (0xFF, 0xFF, 0xFF)

def load_rgba(p):
    p = pathlib.Path(p)
    d = p.read_bytes(); pos = 8; idat = b''
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]; data = d[pos+8:pos+8+ln]
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT': idat += data
        pos += 12 + ln
    assert ct == 6 and bd == 8, 'expected 8-bit RGBA'
    raw = zlib.decompress(idat); ch = 4; stride = w * ch
    out = bytearray(); prev = bytearray(stride); i = 0
    for _ in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i+stride]); i += stride
        for x in range(stride):
            a = line[x-ch] if x >= ch else 0
            b = prev[x]
            c = prev[x-ch] if x >= ch else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a+b)//2) & 255
            elif f == 4:
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line; prev = line
    return w, h, out

def ink_bbox(w, h, px):
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        row = y*w
        for x in range(w):
            if px[(row+x)*4+3] > 8:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    return minx, miny, maxx, maxy

def write_png(path, w, h, rgb):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgb[y*w*3:(y+1)*w*3]
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    path.write_bytes(png)

def oklch(L, C, H):
    """OKLCH -> sRGB 0-255, the same transform src/theme.js uses."""
    import math
    h = math.radians(H)
    a, b = math.cos(h) * C, math.sin(h) * C
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lin = (4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
           -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
           -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_)
    out = []
    for v in lin:
        v = max(0.0, min(1.0, v))
        v = 12.92 * v if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055
        out.append(int(round(max(0.0, min(1.0, v)) * 255)))
    return tuple(out)


def wordmark_mask(cap_px):
    """RADIANT as an alpha mask at the brand's own tracking, via Pillow."""
    from PIL import Image, ImageDraw, ImageFont
    from fontTools.ttLib import TTFont
    import io
    f = TTFont(str(FONT)); f.flavor = None
    buf = io.BytesIO(); f.save(buf); buf.seek(0)
    tmp = pathlib.Path('/tmp/.radiant-montserrat-800.ttf')
    tmp.write_bytes(buf.getvalue())
    # size by CAP height, not em, so the wordmark optically matches the mark
    size = cap_px
    for _ in range(24):
        font = ImageFont.truetype(str(tmp), size)
        a, b, c, d = font.getbbox('H')
        if d - b >= cap_px: break
        size += max(1, cap_px // 12)
    font = ImageFont.truetype(str(tmp), size)
    track = max(1, round(size * 0.02))          # .wordmark letter-spacing
    letters = list('RADIANT')
    widths = [font.getlength(ch) for ch in letters]
    total = int(sum(widths) + track * (len(letters) - 1)) + 8
    x0, y0, x1, y1 = font.getbbox('RADIANT')
    img = Image.new('L', (total, int(y1 - y0) + 8), 0)
    d = ImageDraw.Draw(img)
    x = 4.0
    for ch, w in zip(letters, widths):
        d.text((x, -y0 + 4), ch, font=font, fill=255)
        x += w + track
    return img.crop(img.getbbox())

def build(_a, _b, name):
    """The website's hero, as a launch screen.

    Deep blue-black ground and the two radial glows exactly where index.html
    puts them, a luminous halo behind the mark (the site's breathing
    `.swirl::before`, held still), then the brand's own blue swirl and RADIANT
    wordmark composited as-is. The atmosphere is the site's; the logo is the
    logo.
    """
    import math
    W = H = SIDE
    BG = oklch(0.15, 0.018, 262)
    GLOW_A = oklch(0.40, 0.14, 262)
    GLOW_B = oklch(0.58, 0.15, 262)   # blue, not the site's violet — Tony's call
    HALO = oklch(0.70, 0.18, 262)

    canvas = bytearray(bytes(BG) * (W * H))

    def wash(cx, cy, rx, ry, col, peak, falloff):
        x0, x1 = max(0, int(cx - rx)), min(W, int(cx + rx) + 1)
        y0, y1 = max(0, int(cy - ry)), min(H, int(cy + ry) + 1)
        for y in range(y0, y1):
            dy = (y - cy) / ry
            row = y * W
            for x in range(x0, x1):
                dx = (x - cx) / rx
                d = math.hypot(dx, dy)
                if d >= 1.0:
                    continue
                a = peak * ((1.0 - d) ** falloff)
                if a <= 0.002:
                    continue
                o = (row + x) * 3
                for k in range(3):
                    base = canvas[o + k]
                    canvas[o + k] = min(255, int(base + (col[k] - base * col[k] / 255) * a))

    wash(W * 0.50, -H * 0.10, W * 0.60, H * 0.80, GLOW_A, 0.55, 1.7)
    wash(W * 0.82, H * 0.08, W * 0.40, H * 0.60, GLOW_B, 0.34, 1.7)
    # the low quiet one, matching .rx-intro-glow-c
    wash(W * 0.32, H * 1.05, W * 0.78, H * 0.46, oklch(0.52, 0.13, 262), 0.26, 1.7)

    def place(path, target_w, cx, top):
        """Composite an RGBA brand asset at its own colours."""
        w, h, px = load_rgba(path)
        x0, y0, x1, y1 = ink_bbox(w, h, px)
        iw, ih = x1 - x0 + 1, y1 - y0 + 1
        sc = target_w / iw
        dw, dh = max(1, round(iw * sc)), max(1, round(ih * sc))
        ox, oy = int(cx - dw / 2), top
        for y in range(dh):
            sy = y0 + min(ih - 1, int(y / sc))
            for x in range(dw):
                sx = x0 + min(iw - 1, int(x / sc))
                so = ((sy * w) + sx) * 4
                a = px[so + 3]
                if not a:
                    continue
                o = (((oy + y) * SIDE) + (ox + x)) * 3
                for k in range(3):
                    canvas[o + k] = (px[so + k] * a + canvas[o + k] * (255 - a)) // 255
        return dw, dh

    def text_mask(s, px):
        """A line of UI text as an alpha mask, sized by pixel height."""
        from PIL import Image, ImageDraw, ImageFont
        font = ImageFont.truetype(str(UI_FONT), px)
        x0, y0, x1, y1 = font.getbbox(s)
        img = Image.new('L', (int(x1 - x0) + 8, int(y1 - y0) + 8), 0)
        ImageDraw.Draw(img).text((4 - x0, 4 - y0), s, font=font, fill=255)
        return img.crop(img.getbbox())

    def place_mask(mask, col, cx, top, alpha=1.0):
        mw, mh = mask.size
        px = mask.load()
        ox = int(cx - mw / 2)
        for y in range(mh):
            for x in range(mw):
                a = px[x, y] * alpha
                if not a:
                    continue
                o = (((top + y) * SIDE) + (ox + x)) * 3
                for k in range(3):
                    canvas[o + k] = int((col[k] * a + canvas[o + k] * (255 - a)) / 255)
        return mh

    mark_w = int(SIDE * MARK_FRAC)
    word_w = int(mark_w * 1.42)          # the site sets the wordmark wider than the mark
    gap = int(mark_w * 0.30)
    # measure the wordmark's height before laying out, so the block centres true
    ww, wh, wpx = load_rgba(WORD)
    wx0, wy0, wx1, wy1 = ink_bbox(ww, wh, wpx)
    word_h = round((wy1 - wy0 + 1) * (word_w / (wx1 - wx0 + 1)))
    block = mark_w + gap + word_h
    top = (SIDE - block) // 2 - int(SIDE * 0.03)

    wash(W / 2, top + mark_w / 2, mark_w * 1.5, mark_w * 1.5, HALO, 0.62, 2.1)
    _, dh = place(MARK, mark_w, W / 2, top)
    place(WORD, word_w, W / 2, top + dh + gap)

    # ---- the site's footer, at the foot -----------------------------------
    # radiant-site/index.html `.footer-fine`: the line, then the Templeton
    # Technologies mark under it. Tony asked for this on the splash screen and
    # I put it only on the live first-run view — which he never sees, because
    # first run happens once. The launch image is the splash screen in practice,
    # so it goes here too, and the two now match.
    #
    # ⚠️ THE TEMPLETON MARK KEEPS ITS OWN COLOURS. Composited with `place`, like
    # the Radiant lockup — it is another company's logo, and recolouring it is
    # exactly what you do not do to someone's mark. It reads on this ground
    # because it is the same ground the site puts it on.
    tt_h = int(SIDE * 0.031)                     # ~30pt on a phone
    tw, th, tpx = load_rgba(TT)
    tx0, ty0, tx1, ty1 = ink_bbox(tw, th, tpx)
    tt_w = round((tx1 - tx0 + 1) * (tt_h / (ty1 - ty0 + 1)))
    tt_w = min(tt_w, int(SIDE * SAFE_W))         # never wider than the visible band

    line = 'Radiant is a Templeton Technologies product.'
    byline = text_mask(line, int(SIDE * 0.0125))
    if byline.size[0] > SIDE * SAFE_W:           # shrink to fit rather than crop
        from PIL import Image as _I
        k = (SIDE * SAFE_W) / byline.size[0]
        byline = byline.resize((int(byline.size[0] * k), int(byline.size[1] * k)), _I.LANCZOS)

    foot_gap = int(SIDE * 0.016)
    bottom = int(SIDE * 0.935)                   # clear of the home indicator
    tt_top = bottom - tt_h
    by_top = tt_top - foot_gap - byline.size[1]
    place_mask(byline, oklch(0.60, 0.02, 262), W / 2, by_top)
    place(TT, tt_w, W / 2, tt_top)

    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / name, SIDE, SIDE, canvas)
    print(f'  {name}  ground #{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}, mark {mark_w}px, wordmark {word_w}px')



if __name__ == '__main__':
    # One image, not two: the app is always dark, so the launch screen is too.
    print('launch screen (site hero + brand lockup):')
    build(None, None, 'splash-light.png')
    build(None, None, 'splash-dark.png')
