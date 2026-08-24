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

# ── the node field, from templetongroup.dev's hero ──────────────────────────
# Parameters read straight out of that site's canvas code (index.html, #net):
#   count      area / 15000, clamped to 46–104
#   node r     0.8 … 2.2 css px, with a soft glow
#   LINK       132 css px — the distance two nodes will draw a line across
#   links      one in five drawn lighter: (i*13 + j*7) % 5 == 0
#
# COLOUR IS THE ONE DEPARTURE, and it is deliberate: the site's nodes are
# terracotta on graphite, which on Radiant's blue ground would read as a
# different brand's artwork pasted in. These are Radiant's accent. Everything
# about the STRUCTURE — density, radii, link distance, the lighter fifth — is
# the site's.
#
# Rendered ONCE to a PNG at phone proportions, not animated: the site runs a
# rAF loop forever and this phone is about to run a language model. The same
# file backs the launch image and the first-run screen, which is what keeps the
# handoff between them exact.
FIELD = pathlib.Path('src/assets/brand/node-field.png')
FIELD_W, FIELD_H = 1206, 2622      # iPhone 17 Pro in device pixels
SCALE = 3                          # css px → device px


def build_field(seed=7):
    from PIL import Image, ImageDraw, ImageFilter
    import random, math
    rng = random.Random(seed)

    w, h = FIELD_W, FIELD_H
    css_area = (w / SCALE) * (h / SCALE)
    count = max(46, min(104, round(css_area / 15000)))
    link = 132 * SCALE

    nodes = [{
        'x': rng.uniform(0, w), 'y': rng.uniform(0, h),
        'r': (rng.random() * 1.4 + 0.8) * SCALE,
        'g': rng.random() * 0.5 + 0.5,
    } for _ in range(count)]

    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    ink = oklch(0.70, 0.17, 262)          # Radiant accent
    pale = oklch(0.965, 0.008, 262)       # the site's lighter fifth

    # links first, so nodes sit on top of their own threads
    for i, a in enumerate(nodes):
        for j in range(i + 1, count):
            b = nodes[j]
            dist = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
            if dist >= link:
                continue
            al = 1 - dist / link
            lighter = (i * 13 + j * 7) % 5 == 0
            col = pale if lighter else ink
            alpha = int(al * (0.14 if lighter else 0.30) * 255)
            if alpha <= 1:
                continue
            d.line([(a['x'], a['y']), (b['x'], b['y'])], fill=col + (alpha,), width=SCALE)

    # the glow, on its own layer so blurring it cannot soften the nodes
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for n in nodes:
        rr = n['r'] + 8 * n['g'] * SCALE * 0.5
        gd.ellipse([n['x']-rr, n['y']-rr, n['x']+rr, n['y']+rr],
                   fill=ink + (int(70 * n['g']),))
    glow = glow.filter(ImageFilter.GaussianBlur(6 * SCALE * 0.5))
    img = Image.alpha_composite(glow, img)

    d = ImageDraw.Draw(img)
    for n in nodes:
        a = int((0.55 + 0.35 * n['g']) * 255)
        d.ellipse([n['x']-n['r'], n['y']-n['r'], n['x']+n['r'], n['y']+n['r']],
                  fill=ink + (a,))

    FIELD.parent.mkdir(parents=True, exist_ok=True)
    img.save(FIELD)
    print(f'  {FIELD.name}  {w}x{h}, {count} nodes, link {link}px')
    return img


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

    # the node field, scaled to cover the square canvas the way the launch
    # screen's aspectFill will crop it on the phone
    fld = build_field()
    fw, fh = fld.size
    cover = max(SIDE / fw, SIDE / fh)
    fld = fld.resize((max(1, int(fw * cover)), max(1, int(fh * cover))))
    fw, fh = fld.size
    offx, offy = (fw - SIDE) // 2, (fh - SIDE) // 2
    fpx = fld.load()
    for y in range(SIDE):
        row = y * SIDE
        for x in range(SIDE):
            r_, g_, b_, a_ = fpx[x + offx, y + offy]
            if not a_:
                continue
            o = (row + x) * 3
            canvas[o] = (r_ * a_ + canvas[o] * (255 - a_)) // 255
            canvas[o + 1] = (g_ * a_ + canvas[o + 1] * (255 - a_)) // 255
            canvas[o + 2] = (b_ * a_ + canvas[o + 2] * (255 - a_)) // 255

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

    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / name, SIDE, SIDE, canvas)
    print(f'  {name}  ground #{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}, mark {mark_w}px, wordmark {word_w}px')



if __name__ == '__main__':
    # One image, not two: the app is always dark, so the launch screen is too.
    print('launch screen (site hero + brand lockup):')
    build(None, None, 'splash-light.png')
    build(None, None, 'splash-dark.png')
