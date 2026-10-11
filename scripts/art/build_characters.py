"""Build MoniMate's errand characters (Mrs Kaur, the librarian, Officer Tane…) and Biscuit the dog.

Each person is an exact palette swap of one of the four supplied Modern Interiors character sheets
(same outline, same skin shading, same animation frames) so they sit in the same art style as the
main cast. Biscuit is a small hand-placed pixel sprite. Writes into public/characters/.

Usage: python scripts/art/build_characters.py <project root>
"""
import os
import sys
from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
CH = os.path.join(ROOT, 'public', 'characters')


def hexrgb(h: str):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# base sheet + exact colour swaps (source hex → new hex)
PEOPLE = {
    # Mrs Kaur: silver hair, teal kurta, mustard skirt
    'kaur': ('amelia', {'957350': 'a8a8b4', 'ba8d5e': 'd0d0da', '8d7051': '9a9aa8', '8a6552': '7e7e8c',
                        'a85377': '2f8f86', 'b95d72': '3fa89c', 'b35e3f': 'c2952f', 'c78c59': 'd8b25a', 'ab4a36': 'a8801f'}),
    # Librarian: auburn hair, green cardigan
    'librarian': ('bob', {'5d585f': '8a4b2e', '716b6e': 'a65d38', '555157': '733d25',
                          '6c6e85': '4f7a52', 'c2b8d5': 'e8e0c8', 'd8d0e0': 'f4ecd8',
                          '@46465e': '3e5e40', '@565972': '5a8a5c'}),
    # Officer Tane: navy uniform, pale-blue shirt
    'officer': ('bob', {'6c6e85': '2b3f73', 'c2b8d5': '9fb6e0', 'd8d0e0': 'c8d6f0',
                        '@46465e': '24366a', '@565972': '3a5494'}),
    # Arjun (Mrs Kaur's son): black hair, blue tee, warmer skin
    'arjun': ('adam', {'687253': '2e2a33', '959d58': '4a4552', '5f694a': '262229', '5d6043': '221f26',
                       '805e8e': '3d6fb0', '9f74a8': '5a8fd0',
                       'ffcbb0': 'd7a07a', 'f6ae9f': 'c98d6c', 'f69784': 'b9775a', 'ffb893': 'dda07a', 'e19b9b': 'c08066'}),
    # Council worker: hi-vis vest
    'council': ('alex', {'a2394b': 'f2a516', 'ae4a52': 'ffc23a', '5a444a': '9a6a10', '6f494d': 'b47c12',
                         '8d7051': '5a3f2a', '957350': '634631', 'ba8d5e': '7d5a3e', '8a6552': '4d3524'}),
    # Post Office clerk: postal red shirt, navy trousers, black hair
    'postie': ('alex', {'ae4a52': 'd23a3a', 'a2394b': 'b82f2f', '787d93': '3a4566', '8091a5': '4a5680',
                        '8d7051': '2e2a33', '957350': '3a3540', 'ba8d5e': '4a4552', '8a6552': '262229'}),
    # Psych department researcher: white lab coat
    'researcher': ('bob', {'6c6e85': 'd8dce6', 'c2b8d5': 'f4f4f8', 'd8d0e0': 'ffffff',
                           '@46465e': 'b4b8c6', '@565972': 'e2e4ec'}),
    # Book-fair seller: black hair, purple top
    'bookseller': ('amelia', {'957350': '2e2a33', 'ba8d5e': '4a4552', '8d7051': '262229', '8a6552': '221f26',
                              'a85377': '6a4ca8', 'b95d72': '8462c0'}),
}


BODY_FROM_ROW = 21  # '@' swaps only touch the body (rows 21+ of each 32-px frame), not the head outline


def swap(img: Image.Image, mapping: dict) -> Image.Image:
    m = {hexrgb(k): hexrgb(v) for k, v in mapping.items() if not k.startswith('@')}
    body = {hexrgb(k[1:]): hexrgb(v) for k, v in mapping.items() if k.startswith('@')}
    out = img.convert('RGBA').copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if (r, g, b) in m:
                px[x, y] = m[(r, g, b)] + (a,)
            elif (r, g, b) in body and y % 32 >= BODY_FROM_ROW and not _edge(px, x, y, out.width, out.height):
                px[x, y] = body[(r, g, b)] + (a,)
    return out


def _edge(px, x, y, w, h) -> bool:
    """True for a pixel on the sprite's silhouette edge — that's outline, keep it."""
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
            return True
    return False


for name, (base, mapping) in PEOPLE.items():
    os.makedirs(os.path.join(CH, name), exist_ok=True)
    for anim in ('idle', 'run'):
        src = os.path.join(CH, base, f'{anim}.png')
        if not os.path.exists(src):
            src = os.path.join(CH, base, 'idle.png')
        swap(Image.open(src), mapping).save(os.path.join(CH, name, f'{anim}.png'))
    print('wrote', name, 'from', base)

# ── Biscuit: a golden retriever pup, 16x14, two walking frames, facing right ──────────────────
PAL = {
    'o': (58, 42, 34, 255),    # outline
    'g': (214, 164, 82, 255),  # golden fur
    'l': (238, 200, 126, 255), # light fur
    'd': (168, 116, 52, 255),  # dark fur / ear
    'n': (40, 30, 30, 255),    # nose / eye
    'r': (210, 64, 70, 255),   # collar
    't': (226, 120, 130, 255), # tongue
}
FRAME_A = [
    "................",
    "...........oo...",
    "..........oddo..",
    ".........oggddo.",
    "........oggnggo.",
    "........oggggggn",
    ".........olggto.",
    "..oo....orrrro..",
    ".oggoooooggggo..",
    ".ogggggggggggo..",
    "..olllllllllo...",
    "..og.og..og.og..",
    "..oo.oo..oo.oo..",
    "................",
]
FRAME_B = FRAME_A[:11] + [
    "...og.og.og.og..",
    "...oo.oo.oo.oo..",
    "................",
]
sheet = Image.new('RGBA', (32, 14))
for f, rows in enumerate((FRAME_A, FRAME_B)):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in PAL:
                sheet.putpixel((f * 16 + x, y), PAL[ch])
os.makedirs(os.path.join(CH, 'dog'), exist_ok=True)
sheet.save(os.path.join(CH, 'dog', 'biscuit.png'))
print('wrote dog/biscuit.png')
