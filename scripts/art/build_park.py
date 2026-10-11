"""Compose the Park (22x7 tiles) from the project's own grass/path tiles, props and Kenney urban trees.
Output: public/sprites/buildings/park.png at 72 px per tile (the world's TILE_PX), so props keep the
same on-screen size as the school's decor props."""
import sys
from PIL import Image

ROOT = sys.argv[1]
OUT = sys.argv[2]
T = 72
W, H = 22, 7
tiles = f'{ROOT}/public/sprites/tiles'
props = f'{ROOT}/public/sprites/props'
urban = f'{ROOT}/public/tiles/urban'


def tile(name):
    return Image.open(f'{tiles}/{name}').convert('RGBA').resize((T, T), Image.NEAREST)


def prop(name, scale=1.0):
    im = Image.open(f'{props}/{name}').convert('RGBA')
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.NEAREST)


def kenney(i, scale=4.5):
    im = Image.open(f'{urban}/tile_{i:04d}.png').convert('RGBA')
    return im.resize((round(16 * scale), round(16 * scale)), Image.NEAREST)


park = Image.new('RGBA', (W * T, H * T))
grass = tile('grass_full.png')
for y in range(H):
    for x in range(W):
        park.alpha_composite(grass, (x * T, y * T))

# a footpath through the middle (row 3), with soft edges above and below
fill = tile('path.png')
for x in range(W):
    park.alpha_composite(fill, (x * T, 3 * T))
# and a spur up to the pond
for y in (1, 2):
    park.alpha_composite(fill, (9 * T, y * T + T // 2))

# pond (Kenney water, long oval + round end)
for i, k in enumerate((227, 228, 228, 229)):
    park.alpha_composite(kenney(k), (5 * T + i * T, int(0.6 * T)))
park.alpha_composite(kenney(230), (15 * T, int(5.2 * T)))   # a small round pond below the path


def tree(kind, x, y):
    top, bottom = {'big': (232, 259), 'small': (233, 260), 'autumn': (313, 340), 'autumn2': (314, 341)}[kind]
    park.alpha_composite(kenney(top), (int(x * T), int(y * T)))
    park.alpha_composite(kenney(bottom), (int(x * T), int(y * T + T)))


# trees along the back and front edges (kept off the path)
for x, y, k in [(0.2, 0.0, 'big'), (1.3, 0.3, 'small'), (3.3, 0.0, 'big'), (11.4, 0.0, 'big'), (12.6, 0.4, 'autumn'),
                (14.0, 0.0, 'big'), (17.2, 0.1, 'autumn2'), (18.4, 0.0, 'big'), (20.6, 0.2, 'small'),
                (0.6, 4.6, 'autumn'), (4.0, 4.7, 'big'), (8.2, 4.6, 'small'), (12.0, 4.7, 'big'), (19.5, 4.6, 'big'),
                (21.0, 4.8, 'autumn2')]:
    tree(k, x, y)

# benches facing the path, flower beds, bushes, lamps and bins
bench = prop('bench.png')
for x, y in [(1.6, 2.15), (7.0, 2.15), (14.6, 2.15), (2.6, 4.35), (17.0, 4.35)]:
    park.alpha_composite(bench, (int(x * T), int(y * T)))
flower = prop('flowerbed.png')
for x, y in [(10.4, 2.0), (6.0, 5.6), (16.7, 1.6), (9.8, 5.7)]:
    park.alpha_composite(flower, (int(x * T), int(y * T)))
bush = prop('bush.png', 0.8)
for x, y in [(4.6, 1.3), (10.6, 0.8), (16.0, 0.5), (7.6, 5.0), (13.6, 5.3), (18.6, 5.2)]:
    park.alpha_composite(bush, (int(x * T), int(y * T)))
lamp = prop('lamp.png', 0.75)
for x in (5.0, 12.5, 19.6):
    park.alpha_composite(lamp, (int(x * T), int(2.9 * T) - lamp.height))
can = prop('trashcan.png', 0.6)
for x, y in [(9.0, 2.35), (16.0, 4.15)]:
    park.alpha_composite(can, (int(x * T), int(y * T)))

park.save(OUT)
print('wrote', OUT, park.size)
