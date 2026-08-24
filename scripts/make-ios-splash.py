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

SRC = pathlib.Path('src/assets/logo-mark.png')
FONT = pathlib.Path('node_modules/@fontsource/montserrat/files/montserrat-latin-800-normal.woff2')
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

def build(bg, ink, name):
    w, h, px = load_rgba(SRC)
    x0, y0, x1, y1 = ink_bbox(w, h, px)
    iw, ih = x1 - x0 + 1, y1 - y0 + 1
    target = int(SIDE * MARK_FRAC)
    scale = target / max(iw, ih)
    dw, dh = max(1, round(iw * scale)), max(1, round(ih * scale))

    word = wordmark_mask(max(8, int(dw * WORD_FRAC)))
    gap = int(dw * GAP_FRAC)
    block_h = dh + gap + word.height
    # optically centred: a lockup sitting on the true centre reads low, so the
    # whole block is lifted by 4% of the canvas, the way Apple sets theirs
    top = (SIDE - block_h) // 2 - int(SIDE * 0.04)
    ox, oy = (SIDE - dw) // 2, top

    canvas = bytearray(bytes(bg) * (SIDE * SIDE))
    for y in range(dh):
        sy = y0 + min(ih - 1, int(y / scale))
        for x in range(dw):
            sx = x0 + min(iw - 1, int(x / scale))
            a = px[((sy * w) + sx) * 4 + 3]
            if not a: continue
            o = (((oy + y) * SIDE) + (ox + x)) * 3
            for k in range(3):
                canvas[o + k] = (ink[k] * a + bg[k] * (255 - a)) // 255

    wx = (SIDE - word.width) // 2
    wy = oy + dh + gap
    wpx = word.load()
    for y in range(word.height):
        for x in range(word.width):
            a = wpx[x, y]
            if not a: continue
            o = (((wy + y) * SIDE) + (wx + x)) * 3
            for k in range(3):
                canvas[o + k] = (ink[k] * a + bg[k] * (255 - a)) // 255

    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / name, SIDE, SIDE, canvas)
    print(f'  {name}  mark {dw}x{dh}, wordmark {word.width}x{word.height}, '
          f'ink #{ink[0]:02X}{ink[1]:02X}{ink[2]:02X} on #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}')

if __name__ == '__main__':
    print('launch screen (Radiant lockup):')
    build(BRAND_BG, BRAND_INK, 'splash-light.png')
    build(BRAND_BG, BRAND_INK, 'splash-dark.png')
