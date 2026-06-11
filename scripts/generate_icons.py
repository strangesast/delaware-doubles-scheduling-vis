#!/usr/bin/env python3
"""Generate the PWA icon set for pitch.html — no third-party deps.

The artwork mirrors the page itself: the same deep-navy radial gradient
(#16233b -> #0b1220, centred at 70% 10%) behind a ring of "team" circles,
mostly green (playing) with one orange (waiting) and green pairing links —
the exact palette used in pitch.html.
"""
import math, struct, zlib, binascii, os

# ── palette pulled straight from pitch.html ─────────────────────────────
BG_INNER = (0x16, 0x23, 0x3b)   # #16233b  radial-gradient inner
BG_OUTER = (0x0b, 0x12, 0x20)   # #0b1220  body background / outer
PLAY     = (0x22, 0xc5, 0x5e)   # #22c55e  circle.play fill
PLAY_S   = (0x86, 0xef, 0xac)   # #86efac  circle.play stroke
WAIT     = (0xf9, 0x73, 0x16)   # #f97316  circle.wait fill
WAIT_S   = (0xfd, 0xba, 0x74)   # #fdba74  circle.wait stroke
LINK     = (0x34, 0xd3, 0x99)   # #34d399  .pair link

OUTDIR = os.path.join(os.path.dirname(__file__), "..")


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def make_buf(size):
    """Opaque RGBA buffer filled with the page's radial gradient."""
    buf = bytearray(size * size * 4)
    # radial-gradient(120% 100% at 70% 10%, #16233b 0%, #0b1220 60%)
    cx, cy = 0.70 * size, 0.10 * size
    rad = 0.60 * 1.20 * size   # ~60% colour stop scaled by the 120% sizing
    for y in range(size):
        for x in range(size):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad
            r, g, b = lerp(BG_INNER, BG_OUTER, clamp01(d))
            i = (y * size + x) * 4
            buf[i] = int(r + 0.5); buf[i + 1] = int(g + 0.5)
            buf[i + 2] = int(b + 0.5); buf[i + 3] = 255
    return buf


def blend(buf, size, x, y, col, a):
    if a <= 0 or x < 0 or y < 0 or x >= size or y >= size:
        return
    i = (y * size + x) * 4
    ia = 1 - a
    buf[i]     = int(col[0] * a + buf[i]     * ia + 0.5)
    buf[i + 1] = int(col[1] * a + buf[i + 1] * ia + 0.5)
    buf[i + 2] = int(col[2] * a + buf[i + 2] * ia + 0.5)
    buf[i + 3] = 255


def disc(buf, size, cx, cy, rad, col):
    x0, x1 = int(cx - rad - 1), int(cx + rad + 2)
    y0, y1 = int(cy - rad - 1), int(cy + rad + 2)
    for y in range(max(0, y0), min(size, y1)):
        for x in range(max(0, x0), min(size, x1)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            blend(buf, size, x, y, col, clamp01(rad - d + 0.5))


def capsule(buf, size, x0, y0, x1, y1, half, col):
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy or 1.0
    bx0, bx1 = int(min(x0, x1) - half - 1), int(max(x0, x1) + half + 2)
    by0, by1 = int(min(y0, y1) - half - 1), int(max(y0, y1) + half + 2)
    for y in range(max(0, by0), min(size, by1)):
        for x in range(max(0, bx0), min(size, bx1)):
            px, py = x + 0.5 - x0, y + 0.5 - y0
            t = clamp01((px * dx + py * dy) / L2)
            d = math.hypot(px - t * dx, py - t * dy)
            blend(buf, size, x, y, col, clamp01(half - d + 0.5))


def draw_icon(size, scale=1.0):
    """scale<1 keeps the motif inside the maskable safe zone."""
    buf = make_buf(size)
    c = size / 2.0
    R  = 0.30 * size * scale      # ring radius
    nr = 0.090 * size * scale     # node radius
    sw = nr * 0.16                # node stroke width
    lh = nr * 0.34                # link half-width

    N = 7
    pos = []
    for i in range(N):
        a = -math.pi / 2 + i * 2 * math.pi / N
        pos.append((c + R * math.cos(a), c + R * math.sin(a)))

    pairs = [(0, 1), (2, 3), (4, 5)]   # adjacent neighbours play; node 6 waits
    for a, b in pairs:
        capsule(buf, size, pos[a][0], pos[a][1], pos[b][0], pos[b][1], lh, LINK)

    for i, (x, y) in enumerate(pos):
        fill, stroke = (WAIT, WAIT_S) if i == 6 else (PLAY, PLAY_S)
        disc(buf, size, x, y, nr + sw, stroke)   # stroke ring
        disc(buf, size, x, y, nr, fill)          # fill on top
    return buf


def write_png(path, size, buf):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)                            # filter: none
        raw.extend(buf[y * stride:(y + 1) * stride])
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", binascii.crc32(typ + data) & 0xffffffff))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))
    print("wrote", os.path.relpath(path, OUTDIR), f"({size}x{size})")


def main():
    out = lambda name: os.path.join(OUTDIR, name)
    write_png(out("icon-192.png"), 192, draw_icon(192))
    write_png(out("icon-512.png"), 512, draw_icon(512))
    write_png(out("icon-512-maskable.png"), 512, draw_icon(512, scale=0.72))
    write_png(out("apple-touch-icon.png"), 180, draw_icon(180, scale=0.92))


if __name__ == "__main__":
    main()
