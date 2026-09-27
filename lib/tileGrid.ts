// tileGrid.ts — real tile-by-tile ground/road/path renderer for MoniMate's city.
//
// Unlike BUILDING_IMG_SRC (which drops in one whole pre-made picture per building),
// this composes the *ground* out of individual 48x48 pixel-art tiles cropped straight
// from your own asset packs (Modern Exteriors "Autotiles" sheets), laid out cell by
// cell from a plain 2D array you define per city block. That array is your "map" —
// easy to hand-edit, one character per tile.

export const TILE_IMG_SRC: Record<string, string> = {
  grass:        '/sprites/tiles/auto/grass_full.png',
  grasspath_n:  '/sprites/tiles/auto/grasspath_edge_top.png',
  grasspath_s:  '/sprites/tiles/auto/grasspath_edge_bottom.png',
  grasspath_w:  '/sprites/tiles/auto/grasspath_edge_left.png',
  grasspath_e:  '/sprites/tiles/auto/grasspath_edge_right.png',
  path:         '/sprites/tiles/auto/grasspath_fill.png',

  sidewalk:     '/sprites/tiles/auto/sidewalk_full.png',
  sidewalk_n:   '/sprites/tiles/auto/sidewalk_edge_top.png',
  sidewalk_s:   '/sprites/tiles/auto/sidewalk_edge_bottom.png',
  sidewalk_w:   '/sprites/tiles/auto/sidewalk_edge_left.png',
  sidewalk_e:   '/sprites/tiles/auto/sidewalk_edge_right.png',
  sidewalk_fill:'/sprites/tiles/auto/sidewalk_fill.png',

  asphalt:      '/sprites/tiles/auto/asphalt_full.png',
  road:         '/sprites/tiles/auto/road_plain.png',
  road_h:       '/sprites/tiles/auto/road_straight_h.png',
  road_v:       '/sprites/tiles/auto/road_straight_v.png',
  road_x:       '/sprites/tiles/auto/road_cross.png',
  road_t:       '/sprites/tiles/auto/road_t.png',
  road_corner:  '/sprites/tiles/auto/road_corner.png',
};

// One-letter (or short) codes you use in a city block layout array.
// '.' / '' means "skip" (draw nothing, e.g. leave whatever base layer shows through).
export const TILE_CODE: Record<string, keyof typeof TILE_IMG_SRC> = {
  g: 'grass',
  p: 'path',
  s: 'sidewalk',
  A: 'asphalt',
  H: 'road_h',
  V: 'road_v',
  X: 'road_x',
  T: 'road_t',
  C: 'road_corner',
};

export type TileImageMap = Record<string, HTMLImageElement | null>;

/**
 * Draws a 2D grid of tile codes, tile by tile, at native pixel-art resolution
 * (no smoothing). `grid` is an array of strings — each character is a TILE_CODE key,
 * or a space to skip that cell. originX/originY are world-space pixel coordinates
 * of the grid's top-left corner; tileSize is the on-screen size of each cell
 * (use 48 * your world scale to match the rest of the map).
 */
export function drawTileGrid(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  images: TileImageMap,
  originX: number,
  originY: number,
  tileSize: number
) {
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ' ' || ch === '.') continue;
      const key = TILE_CODE[ch];
      if (!key) continue;
      const img = images[key];
      if (!img) continue;
      ctx.drawImage(
        img,
        originX + col * tileSize,
        originY + row * tileSize,
        tileSize,
        tileSize
      );
    }
  }
}

// Example block: a small crossroads with sidewalks framing a plaza of grass+path.
// Use this as a template — copy/extend it per district (downtown, school block, etc.)
export const SAMPLE_BLOCK: string[] = [
  'sssssssssss',
  's ggggggg s',
  's g p p g s',
  'sssss X sss',
  '    H H    ',
  '    H H    ',
  'sssss X sss',
  's g p p g s',
  's ggggggg s',
  'sssssssssss',
];

export interface Plot {
  id: string;
  x: number; // tile col of top-left
  y: number; // tile row of top-left
  w: number; // width in tiles
  h: number; // height in tiles
}

export interface CityGrid {
  grid: string[];
  plots: Plot[];
  widthTiles: number;
  heightTiles: number;
}

/**
 * Generates a full city street grid procedurally: a set of vertical + horizontal
 * roads (real road/sidewalk/grass tiles, not drawn shapes) carving the world into
 * rectangular blocks, each with a one-tile sidewalk ring and a grass plot inside
 * where a building can later be placed (see `plots`). This is how the whole city's
 * ground layer gets built — one real tile per cell — instead of one big image.
 *
 * roadCols / roadRows: tile indices where a road runs (e.g. every 10 tiles).
 */
export function generateCityGrid(
  widthTiles: number,
  heightTiles: number,
  roadCols: number[],
  roadRows: number[]
): CityGrid {
  const roadColSet = new Set(roadCols);
  const roadRowSet = new Set(roadRows);
  const isRoad = (x: number, y: number) => roadColSet.has(x) || roadRowSet.has(y);

  const rows: string[] = [];
  for (let y = 0; y < heightTiles; y++) {
    let line = '';
    for (let x = 0; x < widthTiles; x++) {
      if (isRoad(x, y)) {
        const v = roadColSet.has(x);
        const h = roadRowSet.has(y);
        line += v && h ? 'X' : v ? 'V' : 'H';
      } else {
        const adjRoad =
          isRoad(x - 1, y) || isRoad(x + 1, y) || isRoad(x, y - 1) || isRoad(x, y + 1);
        line += adjRoad ? 's' : 'g';
      }
    }
    rows.push(line);
  }

  // Derive building plots: the grass interior of each block, inset one tile from
  // its sidewalk ring, so a building placed there has a walkable path all around it.
  const sortedCols = [-1, ...roadCols, widthTiles].sort((a, b) => a - b);
  const sortedRows = [-1, ...roadRows, heightTiles].sort((a, b) => a - b);
  const plots: Plot[] = [];
  for (let bi = 0; bi < sortedCols.length - 1; bi++) {
    const cx0 = sortedCols[bi] + 1;
    const cx1 = sortedCols[bi + 1] - 1;
    if (cx1 - cx0 < 3) continue;
    for (let bj = 0; bj < sortedRows.length - 1; bj++) {
      const cy0 = sortedRows[bj] + 1;
      const cy1 = sortedRows[bj + 1] - 1;
      if (cy1 - cy0 < 3) continue;
      plots.push({
        id: `plot_${bi}_${bj}`,
        x: cx0 + 1,
        y: cy0 + 1,
        w: cx1 - cx0 - 1,
        h: cy1 - cy0 - 1,
      });
    }
  }

  return { grid: rows, plots, widthTiles, heightTiles };
}

// The full downtown layout proven out for MoniMate: a 30x22 tile city (1440x1056px
// at native 48px tiles) with a 3x3 grid of blocks. Each of the 9 `plots` is a real
// building site (id, tile x/y/w/h) — assign one story building per plot next.
export const CITY_GRID: CityGrid = generateCityGrid(30, 22, [0, 10, 20, 29], [0, 10, 21]);
