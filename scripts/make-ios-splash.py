#!/usr/bin/env python3
"""Build the iPhone launch screen from the existing mark.

The launch screen shipped as Capacitor's own logo on white for six weeks. This
replaces it, and it does so by LIFTING src/assets/logo-mark.png — a white swirl
on transparent — and tinting it. The swirl is never re-drawn: every attempt to
regenerate it has changed its weight, and it is signed off as it is.

Ground colours are the app's own --rx-bg-grouped, so the launch screen dissolves
into the first screen instead of flashing a different colour at it.
"""
import struct, zlib, pathlib

SRC = pathlib.Path('src/assets/logo-mark.png')
OUT = pathlib.Path('apps/ios/ios/App/App/Assets.xcassets/Splash.imageset')
SIDE = 2732
# the mark occupies this fraction of the SHORT side of a phone (~430pt), so it
# reads at about 96pt — the size Apple's own launch marks sit at, not a hero.
MARK_FRAC = 0.115

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

def build(bg, ink, name):
    w, h, px = load_rgba(SRC)
    x0, y0, x1, y1 = ink_bbox(w, h, px)
    iw, ih = x1-x0+1, y1-y0+1
    target = int(SIDE * MARK_FRAC)
    scale = target / max(iw, ih)
    dw, dh = max(1, round(iw*scale)), max(1, round(ih*scale))
    ox, oy = (SIDE-dw)//2, (SIDE-dh)//2
    canvas = bytearray(bg * (SIDE*SIDE))
    for y in range(dh):
        sy = y0 + min(ih-1, int(y/scale))
        for x in range(dw):
            sx = x0 + min(iw-1, int(x/scale))
            a = px[((sy*w)+sx)*4+3]
            if not a: continue
            o = (((oy+y)*SIDE)+(ox+x))*3
            for k in range(3):
                canvas[o+k] = (ink[k]*a + bg[k]*(255-a)) // 255
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / name, SIDE, SIDE, canvas)
    print(f'  {name}  mark {dw}x{dh} on #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}')

if __name__ == '__main__':
    print('launch screen:')
    build(bytes((0xF2, 0xF2, 0xF7)), (0x3F, 0x69, 0xA7), 'splash-light.png')
    build(bytes((0x00, 0x00, 0x00)), (0x79, 0xA6, 0xE9), 'splash-dark.png')
