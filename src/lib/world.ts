/**
 * MoniMate — world systems driven by the central clock:
 * places & doors, routing/distance, shop hours, NPC schedules, bus timetable, travel options.
 * Every function takes `minutes` (the clock) as input. None of them own a timer.
 */
import { DailyWindow, MIN_PER_DAY, at, hm, inDailyWindows, parts } from './clock';
import type { SceneId } from './types';

export const TILE_PX = 72;          // 48 * 1.5, must match TS in the game
export const METRES_PER_TILE = 8;   // for the "250m" style readouts
export const WALK_MIN_PER_TILE = 0.6;
export const BIKE_MIN_PER_TILE = 0.3;

export interface Tile { x: number; y: number }
export const tileToPx = (t: Tile) => ({ x: t.x * TILE_PX, y: t.y * TILE_PX });
export const pxToTile = (x: number, y: number): Tile => ({ x: x / TILE_PX, y: y / TILE_PX });

// ── Real ground autotiles (sprites_bundle2 / city_tiles_bundle, 48x48 native) ──────────────
// Road/sidewalk layout mirrors the old page.tsx's ROAD_COLS/ROAD_ROWS grid, just resolved to a
// sprite path per tile instead of a flat fill colour.
export const ROAD_COLS = [0, 12, 24, 36, 48, 59];
export const ROAD_ROWS = [0, 10, 22, 34, 43];
const roadColSet = new Set(ROAD_COLS), roadRowSet = new Set(ROAD_ROWS);
export const isRoadTile = (x: number, y: number) => roadColSet.has(x) || roadRowSet.has(y);
export const isSidewalkTile = (x: number, y: number) =>
  !isRoadTile(x, y) && (isRoadTile(x - 1, y) || isRoadTile(x + 1, y) || isRoadTile(x, y - 1) || isRoadTile(x, y + 1));

export function groundSprite(x: number, y: number): string {
  const onCol = roadColSet.has(x), onRow = roadRowSet.has(y);
  if (onCol && onRow) return '/sprites/tiles/road_cross.png';
  if (onCol) return '/sprites/tiles/road_straight_v.png';
  if (onRow) return '/sprites/tiles/road_straight_h.png';
  if (isSidewalkTile(x, y)) return '/sprites/tiles/sidewalk_full.png';
  return '/sprites/tiles/grass_full.png';
}

// ── Player / NPC character sheet (Modern Interiors "Characters_free", 16x32 per frame) ─────
// Frame order in idle.png (4 frames) and run.png (4 dirs x 6 frames) is Down, Up, Left, Right —
// confirmed by inspecting the sheet. Only Adam is wired to the player for now; Alex/Amelia/Bob
// are copied in for NPCs to use the same way later.
export const CHAR_FRAME_W = 16, CHAR_FRAME_H = 32;
export const CHAR_RUN_FRAMES = 6;
export type Dir = 'down' | 'up' | 'left' | 'right';
export const DIR_ORDER: Dir[] = ['down', 'up', 'left', 'right'];
export function facingToDir(angle: number): Dir {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0..2PI, 0 = facing +x (right)
  if (a >= Math.PI * 0.25 && a < Math.PI * 0.75) return 'down';
  if (a >= Math.PI * 0.75 && a < Math.PI * 1.25) return 'left';
  if (a >= Math.PI * 1.25 && a < Math.PI * 1.75) return 'up';
  return 'right';
}
export const characterSheet = (name: string, anim: 'idle' | 'run') => `/characters/${name}/${anim}.png`;

// ── Interiors (Phase 7) ──────────────────────────────────────────────────────
// Real explorable rooms, built from the actual Modern Interiors 48x48 sheets — not a door+menu.
// Furniture pieces that couldn't yet be reliably sliced out of the multi-cell furniture sheet are
// drawn as labelled placeholder blocks (never invented art) until an exact tile-coordinate pass is
// done; floor/wall tiles ARE real single-cell sprites already confirmed against the sheet.
export const INTERIOR_TILE_PX = 48; // interiors render at native scale, no *1.5 world zoom
export interface FurniturePiece {
  id: string; name: string; emoji: string;
  tx: number; ty: number; tw: number; th: number; // tile position/size inside the room
  solid: boolean;
  sprite?: { src: string; sx: number; sy: number; sw: number; sh: number }; // real sliced art, if confirmed
}
/** A door tile inside an interior. `toScene: 'outside'` steps back out through the building's real
 *  exterior door (store.exitPlace()); any other SceneId hops to another room in the same building,
 *  landing at that room's `spawn` — this is what makes the school a real multi-room building
 *  (hallway ↔ classroom/cafeteria/library/gym) instead of one box. */
export interface InteriorLink { tile: Tile; toScene: SceneId | 'outside'; label: string }
/** A single shelf-standable product (Phase 10 / Rule 27-28): the player walks up, interacts, sees
 *  the price, and buys — no dropdown. `brand`/`note` let the grocery items support real price
 *  comparison (Rule 28: same product, different price/quality) without the game saying which is "right". */
export interface ShopItemDef {
  id: string; name: string; brand?: string; price: number; tx: number; ty: number;
  /** what the product looks like on its price tag */
  icon?: string;
  /** world flag set when bought (e.g. a weekly goal item) */
  flag?: string;
}
export interface InteriorDef {
  id: string;
  name: string;
  widthTiles: number; heightTiles: number;
  floorSprite: { src: string; sx: number; sy: number; sw: number; sh: number };
  wallColor: string;
  spawn: Tile;      // where the player appears on entering this room
  links: InteriorLink[];
  furniture: FurniturePiece[];
  shopItems?: ShopItemDef[];
}

const ROOM_BUILDER = '/sprites/interiors/room_builder.png';
const FURNITURE = '/sprites/interiors/furniture.png';
// Every crop below was located and visually confirmed against a labelled grid overlay of the
// real Interiors_free_48x48 sheet (Modern Interiors Free v2.2) — no invented or mismatched art.
export const INTERIORS: Record<string, InteriorDef> = {
  interior_home: {
    id: 'interior_home', name: 'Your Room',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 0, sy: 768, sw: 48, sh: 48 }, // confirmed real wood-floor cell
    wallColor: '#3a3040',
    spawn: { x: 4, y: 5 },
    links: [{ tile: { x: 4, y: 6 }, toScene: 'outside', label: 'Leave house' }],
    furniture: [
      { id: 'bed', name: 'Bed', emoji: '🛏️', tx: 1, ty: 0, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 48, sy: 480, sw: 96, sh: 96 } },
      { id: 'kitchen', name: 'Kitchen', emoji: '🍳', tx: 1, ty: 2, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 96, sy: 768, sw: 96, sh: 96 } },
      { id: 'wardrobe', name: 'Wardrobe', emoji: '🚪', tx: 1, ty: 4, tw: 2, th: 3, solid: true,
        sprite: { src: FURNITURE, sx: 0, sy: 288, sw: 96, sh: 144 } },
      { id: 'desk', name: 'Desk', emoji: '🖥️', tx: 4, ty: 0, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 144, sy: 192, sw: 48, sh: 48 } },
      { id: 'table', name: 'Table', emoji: '🪑', tx: 4, ty: 2, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'shelf', name: 'Shelf', emoji: '📚', tx: 6, ty: 0, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'sofa', name: 'Sofa', emoji: '🛋️', tx: 6, ty: 4, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 480, sw: 96, sh: 96 } },
    ],
  },
  // Phase 9: a real school with separate rooms off one hallway, not a single box. The hallway is
  // the room you land in from outside; each door along it leads to a different activity room, per
  // Rule 26 (classroom = attend class, cafeteria = lunch/social, library = study, gym = recreation).
  interior_school_hall: {
    id: 'interior_school_hall', name: 'School Hallway',
    widthTiles: 13, heightTiles: 5,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#2c3a52',
    spawn: { x: 6, y: 3 },
    links: [
      { tile: { x: 6, y: 4 }, toScene: 'outside', label: 'Leave school' },
      { tile: { x: 1, y: 1 }, toScene: 'interior_school_classroom', label: 'Enter classroom' },
      { tile: { x: 4, y: 1 }, toScene: 'interior_school_cafeteria', label: 'Enter cafeteria' },
      { tile: { x: 8, y: 1 }, toScene: 'interior_school_library', label: 'Enter library' },
      { tile: { x: 11, y: 1 }, toScene: 'interior_school_gym', label: 'Enter gym' },
    ],
    furniture: [
      { id: 'lockers', name: 'Lockers', emoji: '🔒', tx: 3, ty: 3, tw: 2, th: 1, solid: true },
      { id: 'noticeboard', name: 'Notice Board', emoji: '📌', tx: 9, ty: 3, tw: 2, th: 1, solid: true },
    ],
  },
  interior_school_classroom: {
    id: 'interior_school_classroom', name: 'Classroom',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#2c3a52',
    spawn: { x: 4, y: 6 },
    links: [{ tile: { x: 4, y: 6.7 }, toScene: 'interior_school_hall', label: 'Back to hallway' }],
    furniture: [
      { id: 'teacher_desk', name: "Teacher's Desk", emoji: '🖥️', tx: 4, ty: 1, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 144, sy: 192, sw: 48, sh: 48 } },
      { id: 'desks1', name: 'Student Desks', emoji: '🪑', tx: 1, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'desks2', name: 'Student Desks', emoji: '🪑', tx: 3, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'desks3', name: 'Student Desks', emoji: '🪑', tx: 5, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'desks4', name: 'Student Desks', emoji: '🪑', tx: 7, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'bookshelf', name: 'Shelf', emoji: '📚', tx: 7, ty: 1, tw: 1, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
    ],
  },
  interior_school_cafeteria: {
    id: 'interior_school_cafeteria', name: 'Cafeteria',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#4a3a2c',
    spawn: { x: 4, y: 6 },
    links: [{ tile: { x: 4, y: 6.7 }, toScene: 'interior_school_hall', label: 'Back to hallway' }],
    furniture: [
      { id: 'counter', name: 'Lunch Counter', emoji: '🍔', tx: 1, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 96, sy: 768, sw: 96, sh: 96 } },
      { id: 'table1', name: 'Table', emoji: '🍽️', tx: 4, ty: 2, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table2', name: 'Table', emoji: '🍽️', tx: 6, ty: 2, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table3', name: 'Table', emoji: '🍽️', tx: 4, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table4', name: 'Table', emoji: '🍽️', tx: 6, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
    ],
  },
  interior_school_library: {
    id: 'interior_school_library', name: 'Library',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 0, sy: 768, sw: 48, sh: 48 },
    wallColor: '#2c4038',
    spawn: { x: 4, y: 6 },
    links: [{ tile: { x: 4, y: 6.7 }, toScene: 'interior_school_hall', label: 'Back to hallway' }],
    furniture: [
      { id: 'shelf1', name: 'Bookshelf', emoji: '📚', tx: 1, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'shelf2', name: 'Bookshelf', emoji: '📚', tx: 6, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'reading_table', name: 'Reading Table', emoji: '📖', tx: 4, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
    ],
  },
  interior_school_gym: {
    id: 'interior_school_gym', name: 'Gym',
    widthTiles: 11, heightTiles: 8,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 192, sw: 48, sh: 48 },
    wallColor: '#3a2c2c',
    spawn: { x: 5, y: 7 },
    links: [{ tile: { x: 5, y: 7.7 }, toScene: 'interior_school_hall', label: 'Back to hallway' }],
    furniture: [
      { id: 'bench1', name: 'Bench', emoji: '🪑', tx: 1, ty: 1, tw: 1, th: 1, solid: true },
      { id: 'bench2', name: 'Bench', emoji: '🪑', tx: 9, ty: 1, tw: 1, th: 1, solid: true },
    ],
  },
  // Phase 10: the grocery store — the one interior your MVP loop actually needs to be real (Mission 4,
  // "Parent's Errand": milk/bread/eggs, price comparison, stay within budget). Shared by supermarket
  // and dairy, since both are the same kind of space at MVP scale.
  interior_supermarket: {
    id: 'interior_supermarket', name: 'Supermarket',
    widthTiles: 11, heightTiles: 8,
    floorSprite: { src: ROOM_BUILDER, sx: 0, sy: 768, sw: 48, sh: 48 },
    wallColor: '#2c4a3a',
    spawn: { x: 5, y: 7 },
    links: [{ tile: { x: 5, y: 7.7 }, toScene: 'outside', label: 'Leave store' }],
    furniture: [
      { id: 'shelf1', name: 'Shelf', emoji: '🛒', tx: 1, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'shelf2', name: 'Shelf', emoji: '🛒', tx: 4, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'shelf3', name: 'Shelf', emoji: '🛒', tx: 8, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'fridge', name: 'Fridge', emoji: '🧊', tx: 1, ty: 4, tw: 2, th: 3, solid: true,
        sprite: { src: FURNITURE, sx: 0, sy: 48, sw: 96, sh: 144 } },
      { id: 'checkout', name: 'Checkout', emoji: '🧾', tx: 8, ty: 5, tw: 2, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 96, sy: 768, sw: 96, sh: 96 } },
      // Pantry island in the middle of the floor: pasta and rice (the student's weekly shop).
      { id: 'shelf4', name: 'Pantry Shelf', emoji: '🥫', tx: 4.5, ty: 4.2, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
    ],
    // Real price comparison, exactly per Rule 28 — the game never labels one "correct".
    // Every tag sits on the FRONT edge of the shelf/fridge it belongs to (the side you can walk up
    // to), so it's drawn on top of the furniture and always within reach — see interiorBlocked().
    shopItems: [
      { id: 'bread_basic', name: 'Bread', brand: 'Value', price: 2.20, tx: 1.5, ty: 2.75, icon: '🍞' },
      { id: 'bread_mid', name: 'Bread', brand: 'Bakery', price: 3.90, tx: 2.5, ty: 2.75, icon: '🥖' },
      { id: 'notebook_4', name: 'Notebook', brand: 'Basic', price: 4.00, tx: 4.5, ty: 2.75, icon: '📓' },
      { id: 'notebook_7', name: 'Notebook', brand: 'Standard', price: 7.00, tx: 5.5, ty: 2.75, icon: '📒' },
      { id: 'notebook_10', name: 'Notebook', brand: 'Deluxe', price: 10.00, tx: 8.5, ty: 2.75, icon: '📔' },
      { id: 'choc_bar', name: 'Chocolate', brand: 'Cocoa Co', price: 2.50, tx: 9.5, ty: 2.75, icon: '🍫' },
      { id: 'eggs_basic', name: 'Eggs (6)', brand: 'Value', price: 3.00, tx: 1.5, ty: 4.25, icon: '🥚' },
      { id: 'eggs_free_range', name: 'Eggs (6)', brand: 'Free Range', price: 4.50, tx: 2.5, ty: 4.25, icon: '🥚' },
      { id: 'milk_basic', name: 'Milk', brand: 'Value', price: 3.50, tx: 2.75, ty: 5.1, icon: '🥛' },
      { id: 'milk_mid', name: 'Milk', brand: 'Farmhouse', price: 4.80, tx: 2.75, ty: 5.9, icon: '🥛' },
      { id: 'milk_premium', name: 'Milk', brand: 'Premium', price: 6.00, tx: 2.75, ty: 6.7, icon: '🥛' },
      { id: 'pasta_basic', name: 'Pasta', brand: 'Value', price: 1.80, tx: 5, ty: 3.95, icon: '🍝' },
      { id: 'pasta_brand', name: 'Pasta', brand: 'Italia', price: 3.20, tx: 6, ty: 3.95, icon: '🍝' },
      { id: 'rice_basic', name: 'Rice 1kg', brand: 'Value', price: 2.50, tx: 5, ty: 6.45, icon: '🍚' },
      { id: 'rice_jasmine', name: 'Rice 1kg', brand: 'Jasmine', price: 4.50, tx: 6, ty: 6.45, icon: '🍚' },
      { id: 'noodles_5pk', name: 'Noodles', brand: '5-pack', price: 2.90, tx: 4.25, ty: 5.2, icon: '🍜' },
      { id: 'frozen_veg', name: 'Frozen Veg', price: 3.40, tx: 6.75, ty: 5.2, icon: '🥦' },
    ],
  },
  interior_shop: {
    id: 'interior_shop', name: 'Shop Floor',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#403020',
    spawn: { x: 4, y: 5 },
    links: [{ tile: { x: 4, y: 6 }, toScene: 'outside', label: 'Leave shop' }],
    furniture: [], // generic fallback — buildings with no dedicated interior below still use this
  },
  // Real furnished rooms, built the same way as interior_home (confirmed FURNITURE crops only —
  // no shopItems yet, that's a later pass; this phase is "walk in and it looks like the real place").
  interior_cafe: {
    id: 'interior_cafe', name: 'Café',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 0, sy: 768, sw: 48, sh: 48 },
    wallColor: '#4a3428',
    spawn: { x: 4, y: 5 },
    links: [{ tile: { x: 4, y: 6 }, toScene: 'outside', label: 'Leave café' }],
    furniture: [
      { id: 'counter', name: 'Counter', emoji: '☕', tx: 3, ty: 0, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 96, sy: 768, sw: 96, sh: 96 } },
      { id: 'fridge', name: 'Drinks Fridge', emoji: '🧊', tx: 6, ty: 0, tw: 2, th: 3, solid: true,
        sprite: { src: FURNITURE, sx: 0, sy: 48, sw: 96, sh: 144 } },
      { id: 'table1', name: 'Table', emoji: '☕', tx: 1, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table2', name: 'Table', emoji: '☕', tx: 1, ty: 5, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table3', name: 'Table', emoji: '☕', tx: 6, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
    ],
  },
  interior_bank: {
    id: 'interior_bank', name: 'Bank',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#26343f',
    spawn: { x: 4, y: 5 },
    links: [{ tile: { x: 4, y: 6 }, toScene: 'outside', label: 'Leave bank' }],
    furniture: [
      { id: 'teller1', name: 'Teller Desk', emoji: '🏦', tx: 2, ty: 0, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 144, sy: 192, sw: 48, sh: 48 } },
      { id: 'teller2', name: 'Teller Desk', emoji: '🏦', tx: 5, ty: 0, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 144, sy: 192, sw: 48, sh: 48 } },
      { id: 'brochures', name: 'Brochure Stand', emoji: '📋', tx: 7, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'waiting', name: 'Waiting Seats', emoji: '🪑', tx: 1, ty: 4, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 480, sw: 96, sh: 96 } },
    ],
  },
  interior_mall: {
    id: 'interior_mall', name: 'Mall',
    widthTiles: 11, heightTiles: 8,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#3a2e46',
    spawn: { x: 5, y: 6 },
    links: [{ tile: { x: 5, y: 7 }, toScene: 'outside', label: 'Leave mall' }],
    furniture: [
      { id: 'rack1', name: 'Clothing Rack', emoji: '🛍️', tx: 1, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'rack2', name: 'Clothing Rack', emoji: '🛍️', tx: 4, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'rack3', name: 'Clothing Rack', emoji: '🛍️', tx: 8, ty: 1, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'fitting', name: 'Fitting Room', emoji: '🚪', tx: 1, ty: 5, tw: 2, th: 3, solid: true,
        sprite: { src: FURNITURE, sx: 0, sy: 288, sw: 96, sh: 144 } },
      { id: 'checkout', name: 'Checkout', emoji: '🧾', tx: 8, ty: 5, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 144, sy: 192, sw: 48, sh: 48 } },
    ],
    shopItems: [
      { id: 'sneakers', name: 'Sneakers', brand: 'Stride', price: 30.00, tx: 1.5, ty: 2.75, icon: '👟', flag: 'bought_sneakers' },
      { id: 'hoodie', name: 'Hoodie', brand: 'Urban', price: 25.00, tx: 2.5, ty: 2.75, icon: '🧥' },
      { id: 'tshirt', name: 'T-Shirt', brand: 'Basic', price: 12.00, tx: 4.5, ty: 2.75, icon: '👕' },
      { id: 'cap', name: 'Cap', brand: 'Urban', price: 10.00, tx: 5.5, ty: 2.75, icon: '🧢' },
      { id: 'headphones', name: 'Headphones', brand: 'SoundBud', price: 15.00, tx: 7, ty: 2.6, icon: '🎧', flag: 'bought_headphones' },
      { id: 'phone_case', name: 'Phone Case', brand: 'Glitter', price: 6.00, tx: 8.5, ty: 2.75, icon: '📱' },
      { id: 'sticker_pack', name: 'Stickers', price: 2.50, tx: 9.5, ty: 2.75, icon: '✨' },
    ],
  },
  interior_restaurant: {
    id: 'interior_restaurant', name: 'Restaurant',
    widthTiles: 10, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 0, sy: 768, sw: 48, sh: 48 },
    wallColor: '#4a2a28',
    spawn: { x: 5, y: 5 },
    links: [{ tile: { x: 5, y: 6 }, toScene: 'outside', label: 'Leave restaurant' }],
    furniture: [
      { id: 'kitchen', name: 'Kitchen Pass', emoji: '🍳', tx: 3, ty: 0, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 96, sy: 768, sw: 96, sh: 96 } },
      { id: 'fridge', name: 'Fridge', emoji: '🧊', tx: 7, ty: 0, tw: 2, th: 3, solid: true,
        sprite: { src: FURNITURE, sx: 0, sy: 48, sw: 96, sh: 144 } },
      { id: 'table1', name: 'Table', emoji: '🍽️', tx: 1, ty: 3, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table2', name: 'Table', emoji: '🍽️', tx: 3, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table3', name: 'Table', emoji: '🍽️', tx: 6, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
      { id: 'table4', name: 'Table', emoji: '🍽️', tx: 8, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 288, sy: 624, sw: 48, sh: 48 } },
    ],
  },
  interior_bookshop: {
    id: 'interior_bookshop', name: 'Bookshop',
    widthTiles: 9, heightTiles: 7,
    floorSprite: { src: ROOM_BUILDER, sx: 528, sy: 240, sw: 48, sh: 48 },
    wallColor: '#33291f',
    spawn: { x: 4, y: 5 },
    links: [{ tile: { x: 4, y: 6 }, toScene: 'outside', label: 'Leave bookshop' }],
    furniture: [
      { id: 'shelf1', name: 'Bookshelf', emoji: '📚', tx: 1, ty: 0, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'shelf2', name: 'Bookshelf', emoji: '📚', tx: 4, ty: 0, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'shelf3', name: 'Bookshelf', emoji: '📚', tx: 1, ty: 3, tw: 2, th: 2, solid: true,
        sprite: { src: FURNITURE, sx: 240, sy: 672, sw: 96, sh: 96 } },
      { id: 'checkout', name: 'Checkout Desk', emoji: '🧾', tx: 6, ty: 4, tw: 1, th: 1, solid: true,
        sprite: { src: FURNITURE, sx: 144, sy: 192, sw: 48, sh: 48 } },
    ],
    // The "School Project Supplies" mission's shopping list — real walk-up-and-buy items, same
    // system as the supermarket (Rule 27/28: the game never picks a tier for the player).
    shopItems: [
      { id: 'poster_basic', name: 'Poster Board', brand: 'Plain', price: 4.00, tx: 1.5, ty: 2.25, icon: '🪧' },
      { id: 'markers_basic', name: 'Markers (8pk)', brand: 'Standard', price: 5.00, tx: 2.5, ty: 2.25, icon: '🖍️' },
      { id: 'novel', name: 'Novel', brand: 'Paperback', price: 12.00, tx: 4.5, ty: 2.25, icon: '📘' },
      { id: 'comic', name: 'Comic', price: 6.00, tx: 5.5, ty: 2.25, icon: '📗' },
      { id: 'puzzle_book', name: 'Puzzle Book', price: 5.00, tx: 6.5, ty: 3.75, icon: '🧩' },
      { id: 'glue_basic', name: 'Glue Stick', brand: 'Standard', price: 2.00, tx: 1.5, ty: 5.25, icon: '🧴' },
      { id: 'pens', name: 'Pens (5pk)', price: 3.00, tx: 2.5, ty: 5.25, icon: '🖊️' },
      // University: the ECON101 textbook (see uni_textbook). Buying it any time counts.
      { id: 'textbook_econ', name: 'Textbook', brand: 'ECON101', price: 120.00, tx: 3.25, ty: 4.0, icon: '📕', flag: 'wk_textbook_new' },
    ],
  },
};
/** Which real interior scene each non-generic building routes to (everything else falls back to
 *  the plain interior_shop placeholder room). Keeping this here, next to INTERIORS, rather than
 *  cluttering PlaceDef with a field only 5 of 19 places use. */
export const PLACE_INTERIOR_SCENE: Partial<Record<string, string>> = {
  cafe: 'interior_cafe',
  bank: 'interior_bank',
  mall: 'interior_mall',
  restaurant: 'interior_restaurant',
  shop_small: 'interior_bookshop',
};
export const getInterior = (sceneId: string) => INTERIORS[sceneId];

/** True when a point (in interior tiles) is inside a wall or a solid piece of furniture. Shared by
 *  the movement loop and the tests, so "can the player stand here?" has exactly one answer. */
export function interiorBlocked(interior: InteriorDef, tx: number, ty: number): boolean {
  if (tx < 0.3 || ty < 0.3 || tx > interior.widthTiles - 0.3 || ty > interior.heightTiles - 0.3) return true;
  for (const f of interior.furniture) {
    if (!f.solid) continue;
    if (tx > f.tx - 0.05 && tx < f.tx + f.tw + 0.05 && ty > f.ty - 0.05 && ty < f.ty + f.th + 0.05) return true;
  }
  return false;
}

// ── Places ──────────────────────────────────────────────────────────────────
// `door` is the sidewalk tile directly in front of the entrance (building bottom edge, centred).
// Numbers mirror your LOCATIONS table (tx, ty, tw, th).
export interface PlaceDef {
  id: string; name: string; tx: number; ty: number; tw: number; th: number;
  interior: 'home' | 'school' | 'shop' | 'none';
  sprite?: string; emoji: string;
}

const P = (
  id: string, name: string, tx: number, ty: number, tw: number, th: number,
  emoji: string, sprite?: string, interior: PlaceDef['interior'] = 'shop',
): PlaceDef => ({ id, name, tx, ty, tw, th, interior, sprite, emoji });

// Matches your real city layout (LOCATIONS in the old page.tsx) tile-for-tile, so no re-tuning needed.
// Sprite paths point at real files copied from the user's supplied asset packs
// (sprites_bundle2 + Modern Interiors). Where no matching building sprite exists in the
// supplied packs, `sprite` is left undefined and the renderer draws a labelled placeholder
// block instead of inventing art — per the "don't substitute unrelated art" rule. Those gaps
// are outside the Chapter-1/School-Student MVP loop (home / university / supermarket / dairy /
// mall / bus_stop), which are all fully asset-backed.
export const PLACES: PlaceDef[] = [
  P('home', 'Home', 1, 1, 10, 8, '🏠', '/sprites/buildings/flat.png', 'home'),
  P('cafe', 'Café', 13, 1, 10, 8, '☕', '/sprites/buildings/cafe.png'),
  P('library', 'Library', 25, 1, 10, 8, '📚', '/sprites/buildings/library.png'),
  // Chapter-1 MVP calls this "School" (id stays 'university' internally — renaming it would touch
  // every schedule/mission/bus-stop reference below). Uses the real school-building sprite; campus.png
  // was previously shown here and school.png sat unused on the Bookshop, so this was the actual
  // building you were looking for, just mislabeled and wearing the wrong sprite.
  P('university', 'School', 37, 1, 10, 8, '🎓', '/sprites/buildings/school.png', 'school'),
  P('hospital', 'Clinic', 49, 1, 9, 8, '🏥', undefined),
  P('supermarket', 'Supermarket', 1, 11, 10, 10, '🛒', '/sprites/buildings/supermarket.png'),
  P('bank', 'Bank', 13, 11, 10, 10, '🏦', '/sprites/buildings/bank.png'),
  P('mall', 'Mall', 25, 11, 10, 10, '🛍️', '/sprites/buildings/mall.png'),
  P('office', 'Office', 37, 11, 10, 10, '💼', undefined),
  P('apartment', 'Apartments', 49, 11, 9, 10, '🏢', undefined),
  P('dairy', 'Dairy', 1, 23, 10, 10, '🥛', '/sprites/buildings/dairy.png'),
  P('gym', 'Gym', 13, 23, 10, 10, '🏋️', undefined),
  P('restaurant', 'Restaurant', 25, 23, 10, 10, '🍔', '/sprites/buildings/cafe-work.png'),
  P('police', 'Services', 37, 23, 10, 10, '🏛️', undefined),
  P('market', 'Weekend Market', 49, 23, 9, 10, '🧺', undefined),
  P('park', 'Park', 1, 35, 22, 7, '🌳', undefined, 'none'),
  P('bus_stop', 'Bus Stop', 25, 35, 3, 4, '🚌', '/sprites/props/sign.png', 'none'),
  P('shop_small', 'Bookshop', 37, 35, 10, 7, '📖', undefined), // Rule 50: no bookshop-specific sprite supplied
  P('post_office', 'Post Office', 49, 35, 9, 7, '📮', undefined),
];

// Phase 8: school exterior detail — purely decorative props (drawn above ground, below characters;
// no extra collision, since the connector sidewalk columns run close beside the school footprint and
// I don't want to risk blocking a route that's already working). Real per-object collision already
// comes from the building footprint itself (world.ts PLACES + loop.ts insideAnyBuilding).
export interface DecorProp { placeId: string; sprite: string; tx: number; ty: number; anchorBottom?: boolean }
export const DECOR_PROPS: DecorProp[] = [
  // fence line tracing the top (map-edge side) of the schoolyard, purely visual
  ...Array.from({ length: 10 }, (_, i) => ({ placeId: 'university', sprite: '/sprites/props/fence.png', tx: 37 + i, ty: 0.55, anchorBottom: true })),
  { placeId: 'university', sprite: '/sprites/props/sign.png', tx: 39.3, ty: 8.9, anchorBottom: true },
  { placeId: 'university', sprite: '/sprites/props/lamp.png', tx: 37.3, ty: 8.85, anchorBottom: true },
  { placeId: 'university', sprite: '/sprites/props/lamp.png', tx: 46.3, ty: 8.85, anchorBottom: true },
];

const placeById = new Map(PLACES.map(p => [p.id, p]));
export const getPlace = (id: string) => placeById.get(id);

/** Door tile: bottom-centre of the building, on the sidewalk row just below it. Park uses its open middle. */
export function doorTile(placeId: string): Tile {
  const p = placeById.get(placeId);
  if (placeId === 'bus_stop') return BUS_STOPS.south.tile;
  if (!p) return { x: 6, y: 9 };
  if (p.id === 'park') return { x: p.tx + Math.floor(p.tw / 2), y: p.ty + 1 };
  return { x: p.tx + Math.floor(p.tw / 2), y: p.ty + p.th };
}
export const doorPx = (placeId: string) => tileToPx(doorTile(placeId));

// ── Routing on the sidewalk grid ────────────────────────────────────────────
// Doors sit on horizontal sidewalk rows. Vertical travel between rows must use a road-side column
// (x = road ± 1), otherwise NPCs would walk through buildings. This gives cheap, believable paths
// and a real walking distance for "School 250m" without a full A* pathfinder.
const CONNECTOR_COLS = [11, 23, 35, 47]; // sidewalk columns beside vertical roads (x = roadCol - 1)

export function routeTiles(from: Tile, to: Tile): Tile[] {
  if (Math.abs(from.y - to.y) < 1.5) return [from, to];
  // choose the connector column that minimises total horizontal travel
  let best = CONNECTOR_COLS[0], bestCost = Infinity;
  for (const c of CONNECTOR_COLS) {
    const cost = Math.abs(from.x - c) + Math.abs(to.x - c);
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  // walk on the sidewalk row nearest each end
  return [from, { x: best, y: from.y }, { x: best, y: to.y }, to];
}

export function routeLengthTiles(route: Tile[]): number {
  let d = 0;
  for (let i = 1; i < route.length; i++) d += Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y);
  return d;
}

export const distanceTiles = (a: Tile, b: Tile) => routeLengthTiles(routeTiles(a, b));
export const distanceMetres = (a: Tile, b: Tile) => Math.round(distanceTiles(a, b) * METRES_PER_TILE / 10) * 10;

// ── Shop / service opening hours ────────────────────────────────────────────
const WEEKDAYS = [0, 1, 2, 3, 4];
const ALWAYS: DailyWindow[] = [{ open: 0, close: MIN_PER_DAY }];

export const OPENING_HOURS: Record<string, DailyWindow[]> = {
  home: ALWAYS,
  park: ALWAYS,
  bus_stop: ALWAYS,
  university: [{ open: hm(7, 0), close: hm(15, 30), days: WEEKDAYS }, { open: hm(10), close: hm(14), days: [5] }], // weekdays; Saturday = school fair
  supermarket: [{ open: hm(7), close: hm(21) }],
  dairy: [{ open: hm(6, 30), close: hm(22) }],
  cafe: [{ open: hm(7), close: hm(17) }],
  library: [{ open: hm(9), close: hm(20), days: WEEKDAYS }, { open: hm(10), close: hm(16), days: [5] }],
  bank: [{ open: hm(9), close: hm(16, 30), days: WEEKDAYS }],
  mall: [{ open: hm(9), close: hm(21) }],
  shop_small: [{ open: hm(8), close: hm(17, 30), days: [0, 1, 2, 3, 4, 5] }],
  post_office: [{ open: hm(8, 30), close: hm(17), days: WEEKDAYS }],
  market: [{ open: hm(8), close: hm(14), days: [5, 6] }],
  restaurant: [{ open: hm(11, 30), close: hm(22) }],
  gym: [{ open: hm(6), close: hm(21) }],
  hospital: [{ open: hm(8), close: hm(17), days: WEEKDAYS }],
  office: [{ open: hm(8), close: hm(18), days: WEEKDAYS }],
  police: [{ open: hm(9), close: hm(17, 30), days: WEEKDAYS }], // open late enough to hand in a wallet found after school
  apartment: [{ open: hm(9), close: hm(18) }],
};

export const isOpen = (placeId: string, minutes: number) =>
  inDailyWindows(minutes, OPENING_HOURS[placeId] ?? ALWAYS);

/** Next time (absolute minutes) this place opens, or null if open now / never. */
export function nextOpening(placeId: string, minutes: number): number | null {
  if (isOpen(placeId, minutes)) return null;
  // minute by minute, so "opens at 7:30" is exact (5-minute steps used to say 7:34)
  for (let m = Math.floor(minutes) + 1; m < minutes + 8 * MIN_PER_DAY; m += 1) {
    if (isOpen(placeId, m)) return m;
  }
  return null;
}

export function closedReason(placeId: string, minutes: number): string {
  const n = nextOpening(placeId, minutes);
  if (!n) return 'Closed.';
  const p = parts(n), now = parts(minutes);
  const hh = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const label = `${hh}:${String(p.minute).padStart(2, '0')} ${p.hour >= 12 ? 'PM' : 'AM'}`;
  return p.day === now.day ? `Closed — opens at ${label}.` : `Closed — opens ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][p.dayOfWeek]} ${label}.`;
}

// ── NPC schedules ───────────────────────────────────────────────────────────
export interface NpcDef { id: string; name: string; color: string; schedule: NpcSlot[]; speedTilesPerMin: number; sheet: string }
/** From `from` (minute of day) until the next slot, the NPC should be at `place`. */
export interface NpcSlot { from: number; place: string; days?: number[] }

export const NPCS: NpcDef[] = [
  {
    id: 'mum', name: 'Mum', color: '#c06090', speedTilesPerMin: 2.2, sheet: 'amelia',
    schedule: [
      { from: hm(0), place: 'home' },
      { from: hm(8, 0), place: 'office', days: WEEKDAYS },
      { from: hm(17, 0), place: 'supermarket', days: [2] },  // Wednesday shop
      { from: hm(17, 30), place: 'home' },
    ],
  },
  // Everyone except Mum lives in the Apartments block, NOT at 'home' — 'home' is the player's house,
  // so using it here used to put Jordan, Riley and Ms Patel in your bedroom every night.
  {
    id: 'jordan', name: 'Jordan', color: '#4f8fd0', speedTilesPerMin: 2.0, sheet: 'alex',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(7, 55), place: 'university', days: WEEKDAYS },
      { from: hm(15, 35), place: 'university', days: WEEKDAYS }, // outside the school gate after the bell
      { from: hm(10, 0), place: 'university', days: [5] },    // Saturday: school fair
      { from: hm(14, 0), place: 'park', days: [5] },
      { from: hm(16, 0), place: 'park', days: [0, 1, 2, 4] },
      { from: hm(15, 45), place: 'mall', days: [3] },        // Thursday: arcade (matches arcade_invite)
      { from: hm(18, 0), place: 'apartment' },
    ],
  },
  {
    id: 'riley', name: 'Riley', color: '#d0a040', speedTilesPerMin: 2.0, sheet: 'bob',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(8, 0), place: 'university', days: WEEKDAYS },
      { from: hm(15, 40), place: 'park', days: WEEKDAYS },   // the after-school food truck
      { from: hm(10, 0), place: 'university', days: [5] },   // Saturday: school fair
      { from: hm(10, 0), place: 'market', days: [6] },       // Sunday: weekend market
      { from: hm(17, 0), place: 'apartment' },
    ],
  },
  {
    id: 'teacher', name: 'Ms Patel', color: '#7050a0', speedTilesPerMin: 2.0, sheet: 'amelia',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(7, 30), place: 'university', days: WEEKDAYS },
      { from: hm(9, 30), place: 'university', days: [5] },   // running the fair
      { from: hm(14, 30), place: 'apartment', days: [5] },
      { from: hm(16, 30), place: 'apartment' },
    ],
  },
  {
    id: 'shopkeeper', name: 'Mr Lee', color: '#409070', speedTilesPerMin: 2.0, sheet: 'bob',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(6, 30), place: 'dairy' },
      { from: hm(22), place: 'apartment' },
    ],
  },
  // ── University path cast ──────────────────────────────────────────────────
  // Sam is your flatmate, so unlike the School cast he really does live at 'home' (your flat).
  {
    id: 'sam', name: 'Sam', color: '#4f8fd0', speedTilesPerMin: 2.0, sheet: 'alex',
    schedule: [
      { from: hm(0), place: 'home' },
      { from: hm(9, 30), place: 'university', days: WEEKDAYS },
      { from: hm(15, 0), place: 'gym', days: WEEKDAYS },
      { from: hm(10, 30), place: 'park', days: [5, 6] },
      { from: hm(17, 30), place: 'home' },
    ],
  },
  {
    id: 'mei', name: 'Mei', color: '#d0a040', speedTilesPerMin: 2.0, sheet: 'amelia',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(9, 40), place: 'university', days: WEEKDAYS },
      { from: hm(13, 30), place: 'library', days: WEEKDAYS },
      { from: hm(10, 0), place: 'market', days: [5] },
      { from: hm(11, 0), place: 'cafe', days: [6] },
      { from: hm(17, 0), place: 'apartment' },
    ],
  },
  {
    id: 'lecturer', name: 'Dr Hughes', color: '#7050a0', speedTilesPerMin: 1.8, sheet: 'bob',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(8, 30), place: 'university', days: WEEKDAYS },
      { from: hm(16, 30), place: 'apartment' },
    ],
  },
  {
    id: 'leah', name: 'Leah', color: '#c06090', speedTilesPerMin: 2.0, sheet: 'amelia',
    schedule: [
      { from: hm(0), place: 'apartment' },
      { from: hm(6, 45), place: 'cafe' },
      { from: hm(17, 15), place: 'apartment' },
    ],
  },
];

/**
 * Which room of a multi-room building an NPC is standing in right now. Only the school has
 * separate rooms: Ms Patel teaches in the classroom; students are in the cafeteria over lunch and
 * the hallway otherwise. `undefined` = the building's only room.
 */
export function npcRoomAt(npcId: string, placeId: string, minutes: number): string | undefined {
  if (placeId !== 'university') return undefined;
  if (parts(minutes).dayOfWeek >= 5) return 'interior_school_hall'; // fair day: everyone's in the hall
  if (npcId === 'teacher' || npcId === 'lecturer') return 'interior_school_classroom';
  const m = parts(minutes).minuteOfDay;
  // University: your classmates sit the 10–12 lecture with you, then grab lunch in the student café.
  if (npcId === 'sam' || npcId === 'mei') {
    if (m >= hm(10) && m < hm(12)) return 'interior_school_classroom';
    return m >= hm(12) && m < hm(13) ? 'interior_school_cafeteria' : 'interior_school_hall';
  }
  return m >= hm(12, 30) && m < hm(13, 30) ? 'interior_school_cafeteria' : 'interior_school_hall';
}

const npcDefById = new Map(NPCS.map(n => [n.id, n]));
export const getNpcDef = (id: string) => npcDefById.get(id);

/** Where the schedule says this NPC belongs right now. Uses the latest matching slot. */
export function npcPlaceAt(npc: NpcDef, minutes: number): string {
  const p = parts(minutes);
  let place = npc.schedule[0].place;
  let best = -1;
  for (const s of npc.schedule) {
    if (s.days && !s.days.includes(p.dayOfWeek)) continue;
    if (s.from <= p.minuteOfDay && s.from >= best) { best = s.from; place = s.place; }
  }
  return place;
}

/** Fewer NPCs outside late at night: anyone whose place isn't 'home' is home after 23:00 unless the place is open. */
export function npcVisibleOutside(placeId: string, minutes: number): boolean {
  if (placeId === 'home') return false;         // indoors
  const p = parts(minutes);
  if (p.minuteOfDay >= hm(23) || p.minuteOfDay < hm(6)) return false;
  // buildings hide their occupants when open (they're inside); the door area shows those "outside" (park, market, stop)
  return placeId === 'park' || placeId === 'market' || placeId === 'bus_stop';
}

// ── Bus system ──────────────────────────────────────────────────────────────
export interface BusStop { id: string; name: string; tile: Tile; placeId: string }

export const BUS_STOPS: Record<string, BusStop> = {
  home:   { id: 'stop_home',   name: 'Home St',      tile: { x: 6,  y: 9 },  placeId: 'home' },
  school: { id: 'stop_school', name: 'School Gate',  tile: { x: 42, y: 9 },  placeId: 'university' },
  mall:   { id: 'stop_mall',   name: 'Mall Plaza',   tile: { x: 30, y: 21 }, placeId: 'mall' },
  south:  { id: 'stop_south',  name: 'Park & Ride',  tile: { x: 26, y: 39 }, placeId: 'bus_stop' },
};

/** One loop route. `offsetMin` = minutes after the loop starts at Home St. */
export const BUS_ROUTE = {
  id: 'route_1',
  name: 'Route 1 — City Loop',
  fare: 2.0,
  stops: [
    { stopId: 'stop_home',   offsetMin: 0 },
    { stopId: 'stop_school', offsetMin: 13 },
    { stopId: 'stop_mall',   offsetMin: 21 },
    { stopId: 'stop_south',  offsetMin: 34 },
  ],
  dwellMin: 1,
};

/** Headway (minutes between loop starts) for a given minute-of-day and day-of-week. More frequent in school peaks. */
function headway(minuteOfDay: number, dow: number): number | null {
  const weekend = dow >= 5;
  if (minuteOfDay < hm(6) || minuteOfDay >= hm(22)) return null;   // no service overnight
  if (weekend) return minuteOfDay >= hm(8) && minuteOfDay < hm(20) ? 30 : null;
  if (minuteOfDay >= hm(7) && minuteOfDay < hm(9)) return 10;      // morning peak
  if (minuteOfDay >= hm(15) && minuteOfDay < hm(18)) return 10;    // afternoon peak
  if (minuteOfDay < hm(19)) return 20;
  return 30;
}

/** All loop start times (absolute minutes) for a given absolute day. Anchored so a bus reaches Home St at 7:55 on weekdays. */
export function busLoopStartsForDay(day: number): number[] {
  const dow = day % 7;
  const out: number[] = [];
  // anchor the weekday morning peak on :55 / :05 / :15 ... (7:55 hits Home St, 8:05, 8:15 ...)
  let m = dow < 5 ? hm(6, 5) : hm(8, 0);
  while (m < hm(22)) {
    out.push(at(day, 0, m));
    const h = headway(m, dow);
    if (h === null) { m += 30; continue; }
    m += h;
  }
  // Weekdays from 6:05: 20-min headway to 7:05, then 10-min peak → 7:15 … 7:55 (Home St), 8:05, 8:15 …
  return out;
}

export interface BusArrival { stopId: string; arrivesAt: number; departsAt: number; loopStart: number }

/** Next bus at a stop at or after `minutes`. */
export function nextBusAt(stopId: string, minutes: number): BusArrival | null {
  const stop = BUS_ROUTE.stops.find(s => s.stopId === stopId);
  if (!stop) return null;
  const d0 = parts(minutes).day;
  for (let d = d0; d <= d0 + 1; d++) {
    for (const start of busLoopStartsForDay(d)) {
      const arrives = start + stop.offsetMin;
      if (arrives >= minutes) return { stopId, arrivesAt: arrives, departsAt: arrives + BUS_ROUTE.dwellMin, loopStart: start };
    }
  }
  return null;
}

/** Is a bus physically standing at the stop right now (doors open)? */
export function busAtStop(stopId: string, minutes: number): BusArrival | null {
  const stop = BUS_ROUTE.stops.find(s => s.stopId === stopId);
  if (!stop) return null;
  const d = parts(minutes).day;
  for (const start of [...busLoopStartsForDay(d - 1), ...busLoopStartsForDay(d)]) {
    const arrives = start + stop.offsetMin;
    if (minutes >= arrives && minutes < arrives + BUS_ROUTE.dwellMin) {
      return { stopId, arrivesAt: arrives, departsAt: arrives + BUS_ROUTE.dwellMin, loopStart: start };
    }
  }
  return null;
}

export const rideMinutes = (fromStopId: string, toStopId: string): number => {
  const a = BUS_ROUTE.stops.find(s => s.stopId === fromStopId);
  const b = BUS_ROUTE.stops.find(s => s.stopId === toStopId);
  if (!a || !b) return 0;
  const d = b.offsetMin - a.offsetMin;
  return d >= 0 ? d : d + 40; // wrap round the loop
};

export const stopById = (id: string) => Object.values(BUS_STOPS).find(s => s.id === id)!;
export const nearestStop = (t: Tile): BusStop =>
  Object.values(BUS_STOPS).reduce((best, s) => (distanceTiles(t, s.tile) < distanceTiles(t, best.tile) ? s : best));

// ── Travel comparison (walk vs bike vs bus) ─────────────────────────────────
export interface TravelOption {
  mode: 'walk' | 'bike' | 'bus';
  label: string;
  minutes: number;     // total door-to-door from `now`
  arrivesAt: number;
  cost: number;
  detail: string;
  available: boolean;
}

export function travelOptions(fromTile: Tile, toPlaceId: string, now: number, opts: { hasBike: boolean; hasPass: boolean }): TravelOption[] {
  const to = doorTile(toPlaceId);
  const tiles = distanceTiles(fromTile, to);
  const walk = Math.round(tiles * WALK_MIN_PER_TILE);
  const bike = Math.round(tiles * BIKE_MIN_PER_TILE);

  const board = nearestStop(fromTile);
  const alight = nearestStop(to);
  const toBoard = Math.round(distanceTiles(fromTile, board.tile) * WALK_MIN_PER_TILE);
  const readyAt = now + toBoard;
  const bus = nextBusAt(board.id, readyAt);
  let busOpt: TravelOption;
  if (!bus || board.id === alight.id) {
    busOpt = { mode: 'bus', label: 'Bus', minutes: Infinity, arrivesAt: Infinity, cost: BUS_ROUTE.fare, detail: 'No useful bus', available: false };
  } else {
    const ride = rideMinutes(board.id, alight.id);
    const alightAt = bus.arrivesAt + ride;
    const fromAlight = Math.round(distanceTiles(alight.tile, to) * WALK_MIN_PER_TILE);
    const arrives = alightAt + fromAlight;
    busOpt = {
      mode: 'bus', label: 'Bus', minutes: arrives - now, arrivesAt: arrives,
      cost: opts.hasPass ? 0 : BUS_ROUTE.fare,
      detail: `${board.name} bus at ${fmt(bus.arrivesAt)}`, available: true,
    };
  }
  return [
    { mode: 'walk', label: 'Walk', minutes: walk, arrivesAt: now + walk, cost: 0, detail: `${distanceMetres(fromTile, to)}m on foot`, available: true },
    { mode: 'bike', label: 'Bike', minutes: bike, arrivesAt: now + bike, cost: 0, detail: 'Free, moderate effort', available: opts.hasBike },
    busOpt,
  ];
}

function fmt(m: number) {
  const p = parts(m);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour >= 12 ? 'PM' : 'AM'}`;
}
