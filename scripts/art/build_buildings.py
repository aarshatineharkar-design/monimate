"""Build the missing MoniMate building sprites from the art already in the project.

Every output is a recolour / re-sign / crop of an existing supplied building sprite, so the
style matches the rest of the town. Writes into public/sprites/buildings/.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/monimate/Monimate 1'
B = f'{ROOT}/public/sprites/buildings'

# ── 5x7 pixel font (only the letters the signs need) ───────────────────────
FONT = {
    'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    'C': ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    'D': ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    'F': ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    'G': ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    'I': ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    'K': ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    'M': ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    'P': ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    'R': ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    'S': ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    'V': ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    'W': ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    ' ': ["000", "000", "000", "000", "000", "000", "000"],
}


def text_mask(text: str, px: int) -> Image.Image:
    """Chunky pixel text as an L-mode mask, each font pixel = px x px."""
    glyphs = [FONT[ch] for ch in text]
    w = sum(len(g[0]) + 1 for g in glyphs) - 1
    m = Image.new('L', (w * px, 7 * px), 0)
    d = ImageDraw.Draw(m)
    x = 0
    for g in glyphs:
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit == '1':
                    d.rectangle([(x + c) * px, r * px, (x + c + 1) * px - 1, (r + 1) * px - 1], fill=255)
        x += len(g[0]) + 1
    return m


def draw_sign(img: Image.Image, cx: int, cy: int, text: str, px: int, plate=(236, 236, 242), ink=(62, 70, 96),
              edge=(44, 46, 66), accent=None, pad=None):
    """A raised sign plate (outline, bevel, drop shadow) centred at (cx, cy) with pixel text."""
    m = text_mask(text, px)
    pad = pad or px * 2
    w, h = m.width + pad * 2, m.height + pad * 2
    x0, y0 = cx - w // 2, cy - h // 2
    d = ImageDraw.Draw(img)
    s = max(2, px // 2)
    d.rectangle([x0 + s, y0 + s, x0 + w + s, y0 + h + s], fill=(20, 20, 30, 140))      # shadow
    d.rectangle([x0 - s, y0 - s, x0 + w + s - 1, y0 + h + s - 1], fill=edge + (255,))   # outline
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=plate + (255,))
    hi = tuple(min(255, c + 18) for c in plate)
    lo = tuple(max(0, c - 34) for c in plate)
    d.rectangle([x0, y0, x0 + w - 1, y0 + s - 1], fill=hi + (255,))                     # top bevel
    d.rectangle([x0, y0 + h - s, x0 + w - 1, y0 + h - 1], fill=lo + (255,))             # bottom bevel
    if accent:
        d.rectangle([x0, y0 + h - s * 2, x0 + w - 1, y0 + h - s - 1], fill=accent + (255,))
    # text with a 1-step darker drop shadow
    tx, ty = x0 + pad, y0 + pad
    shadow = tuple(max(0, c - 60) for c in plate)
    img.paste(Image.new('RGBA', m.size, shadow + (255,)), (tx + max(1, px // 3), ty + max(1, px // 3)), m)
    img.paste(Image.new('RGBA', m.size, ink + (255,)), (tx, ty), m)
    return (x0, y0, w, h)


def recolor(img: Image.Image, hue_lo: float, hue_hi: float, new_hue=None, sat_mul=1.0, val_mul=1.0,
            min_sat=0.12, region=None, sat_add=0.0, val_add=0.0, max_sat=1.01):
    """Shift every pixel whose hue is in [hue_lo, hue_hi] (degrees, may wrap) and saturation >= min_sat."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    delta = mx - mn
    h = np.zeros_like(mx)
    nz = delta > 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    i = nz & (mx == r); h[i] = ((g[i] - b[i]) / delta[i]) % 6
    i = nz & (mx == g) & ~(mx == r); h[i] = (b[i] - r[i]) / delta[i] + 2
    i = nz & (mx == b) & ~(mx == r) & ~(mx == g); h[i] = (r[i] - g[i]) / delta[i] + 4
    h = h * 60
    s = np.where(mx > 0, delta / np.maximum(mx, 1e-6), 0)
    v = mx
    if hue_lo <= hue_hi:
        sel = (h >= hue_lo) & (h <= hue_hi)
    else:
        sel = (h >= hue_lo) | (h <= hue_hi)
    sel &= (s >= min_sat) & (s <= max_sat) & (al > 0)
    if region:
        x0, y0, x1, y1 = region
        rm = np.zeros_like(sel); rm[y0:y1, x0:x1] = True; sel &= rm
    nh = np.where(sel, new_hue if new_hue is not None else h, h)
    ns = np.where(sel, np.clip(s * sat_mul + sat_add, 0, 1), s)
    nv = np.where(sel, np.clip(v * val_mul + val_add, 0, 1), v)
    # hsv -> rgb
    c = nv * ns
    hp = (nh / 60) % 6
    x = c * (1 - np.abs(hp % 2 - 1))
    z = np.zeros_like(c)
    conds = [(hp < 1), (hp < 2), (hp < 3), (hp < 4), (hp < 5), (hp <= 6)]
    vals = [(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]
    out = np.zeros_like(rgb)
    done = np.zeros(c.shape, bool)
    for cond, (rr, gg, bb) in zip(conds, vals):
        m = cond & ~done
        out[m, 0], out[m, 1], out[m, 2] = rr[m], gg[m], bb[m]
        done |= m
    out += (nv - c)[..., None]
    res = np.dstack([out, al])
    return Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8), 'RGBA')


def fill_rect(img, box, color):
    ImageDraw.Draw(img).rectangle(box, fill=color + (255,))


def red_cross(img, cx, cy, size):
    d = ImageDraw.Draw(img)
    t = size // 3
    d.rectangle([cx - size // 2 - 3, cy - size // 2 - 3, cx + size // 2 + 2, cy + size // 2 + 2], fill=(44, 46, 66, 255))
    d.rectangle([cx - size // 2, cy - size // 2, cx + size // 2 - 1, cy + size // 2 - 1], fill=(246, 246, 250, 255))
    d.rectangle([cx - t // 2, cy - size // 2 + 4, cx + t // 2, cy + size // 2 - 5], fill=(214, 48, 49, 255))
    d.rectangle([cx - size // 2 + 4, cy - t // 2, cx + size // 2 - 5, cy + t // 2], fill=(214, 48, 49, 255))


def load(name):
    return Image.open(f'{B}/{name}').convert('RGBA')


def save(img, name):
    img.save(f'{B}/{name}')
    print('wrote', name, img.size)


# ── Clinic: the café shopfront, whitewashed, red & white awnings, CLINIC sign + red cross ─────
im = load('cafe.png')                                     # 336x417
im = im.crop((0, 100, 336, 417))                          # less roof → fits the 9x8 lot
im = recolor(im, 10, 50, new_hue=205, sat_mul=0.25, val_mul=1.18, min_sat=0.08)   # tan roof/walls → cool white
im = recolor(im, 340, 10, new_hue=0, sat_mul=1.1)        # keep awning reds red
fill_rect(im, (98, 108, 238, 168), (232, 236, 244))       # cover the old MARKET plate
draw_sign(im, 168, 138, 'CLINIC', 5, plate=(246, 248, 252), ink=(198, 40, 48), accent=(214, 48, 49))
red_cross(im, 62, 40, 34)
red_cross(im, 274, 40, 34)
save(im, 'clinic.png')

# ── Offices: the corporate tower, cooler glass, CITY OFFICES sign ──────────────────────────
im = load('bank.png')                                     # 561x888
im = recolor(im, 180, 260, new_hue=212, sat_mul=1.25, min_sat=0.16)
im = recolor(im, 0, 360, new_hue=34, sat_add=0.16, val_mul=1.02, min_sat=0.0, max_sat=0.16)   # grey concrete → warm sandstone
fill_rect(im, (252, 392, 508, 438), (196, 204, 216))      # cover LIME CORP
draw_sign(im, 380, 415, 'OFFICES', 4, plate=(34, 52, 86), ink=(255, 214, 92), edge=(20, 26, 40))
save(im, 'office.png')

# ── Apartments: the brick block, re-bricked in warm olive with a slate roof ─────────────────
im = load('library.png')                                  # 768x864
im = recolor(im, 335, 22, new_hue=28, sat_mul=0.85, val_mul=0.95, min_sat=0.25)    # red brick → warm brown brick
im = recolor(im, 25, 45, new_hue=210, sat_mul=0.35, val_mul=0.85, min_sat=0.1, region=(0, 0, 768, 345))  # roof deck → slate
draw_sign(im, 610, 655, 'FLATS', 4, plate=(242, 236, 222), ink=(92, 60, 40))
save(im, 'apartments.png')

# ── Services: the hotel, minus its sign (crop), in civic stone and navy trim ───────────────
im = load('campus.png')                                   # 816x1104
im = im.crop((0, 300, 816, 1104))
im = recolor(im, 140, 200, new_hue=218, sat_mul=0.9, val_mul=0.85, min_sat=0.1)   # teal trim → navy
im = recolor(im, 20, 50, new_hue=40, sat_mul=0.45, val_mul=1.05, min_sat=0.05)    # warm stone → pale civic stone
draw_sign(im, 408, 572, 'SERVICES', 5, plate=(40, 58, 104), ink=(244, 244, 250), edge=(18, 24, 44))
save(im, 'services.png')

# ── Gym: the garage house, painted charcoal with an orange door band, GYM sign ──────────────
im = load('home.png')                                     # 744x672
im = recolor(im, 200, 280, new_hue=220, sat_mul=0.6, val_mul=0.72, min_sat=0.02)  # lavender-grey → charcoal
d = ImageDraw.Draw(im)
d.rectangle([70, 548, 340, 556], fill=(238, 120, 40, 255))   # orange stripe over the roller doors
draw_sign(im, 205, 500, 'GYM', 8, plate=(36, 38, 48), ink=(255, 140, 50), edge=(14, 14, 20))
draw_sign(im, 560, 500, 'FITNESS', 4, plate=(238, 120, 40), ink=(30, 30, 40), edge=(60, 30, 10))
save(im, 'gym.png')

# ── Weekend Market: the awning shop, green & cream stalls, MARKET sign on the roof edge ─────
im = load('dairy.png')                                    # 384x426
im = recolor(im, 340, 25, new_hue=135, sat_mul=0.85, val_mul=0.9, min_sat=0.25)   # red stripes → green
im = recolor(im, 200, 260, new_hue=30, sat_mul=0.5, val_mul=1.05, min_sat=0.02, region=(0, 0, 384, 270))  # grey roof → canvas tan
draw_sign(im, 192, 252, 'WEEKEND MARKET', 3, plate=(250, 240, 210), ink=(46, 110, 60))
save(im, 'market.png')

# ── Bookshop: the green-roof shop, teal paint, BOOKS sign — facade only to fit the 10x7 lot ─
im = load('supermarket.png')                              # 336x543
im = im.crop((0, 200, 336, 543))
im = recolor(im, 320, 20, new_hue=205, sat_mul=0.8, val_mul=0.9, min_sat=0.25)    # pink walls → teal-blue
im = recolor(im, 120, 170, new_hue=30, sat_mul=0.8, val_mul=0.85, min_sat=0.1)    # green roof/awnings → warm brown
fill_rect(im, (98, 146, 238, 206), (226, 230, 238))
draw_sign(im, 168, 176, 'BOOKS', 5, plate=(250, 244, 226), ink=(110, 64, 34))
save(im, 'bookshop.png')

# ── Post Office: the timber house, red roof & cream boards, POST sign ──────────────────────
im = load('bar.png')                                      # 432x624
im = im.crop((0, 150, 432, 624))
im = recolor(im, 15, 40, new_hue=4, sat_mul=1.3, val_mul=0.9, min_sat=0.35, region=(0, 0, 432, 130))   # roof → post red
draw_sign(im, 216, 210, 'POST', 6, plate=(214, 48, 49), ink=(255, 255, 255), edge=(90, 16, 20))
save(im, 'post_office.png')
