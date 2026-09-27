"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nearestStop = exports.stopById = exports.rideMinutes = exports.BUS_ROUTE = exports.BUS_STOPS = exports.getNpcDef = exports.NPCS = exports.isOpen = exports.OPENING_HOURS = exports.distanceMetres = exports.distanceTiles = exports.doorPx = exports.getPlace = exports.DECOR_PROPS = exports.PLACES = exports.getInterior = exports.PLACE_INTERIOR_SCENE = exports.INTERIORS = exports.INTERIOR_TILE_PX = exports.characterSheet = exports.DIR_ORDER = exports.CHAR_RUN_FRAMES = exports.CHAR_FRAME_H = exports.CHAR_FRAME_W = exports.isSidewalkTile = exports.isRoadTile = exports.ROAD_ROWS = exports.ROAD_COLS = exports.pxToTile = exports.tileToPx = exports.BIKE_MIN_PER_TILE = exports.WALK_MIN_PER_TILE = exports.METRES_PER_TILE = exports.TILE_PX = void 0;
exports.groundSprite = groundSprite;
exports.facingToDir = facingToDir;
exports.doorTile = doorTile;
exports.routeTiles = routeTiles;
exports.routeLengthTiles = routeLengthTiles;
exports.nextOpening = nextOpening;
exports.closedReason = closedReason;
exports.npcPlaceAt = npcPlaceAt;
exports.npcVisibleOutside = npcVisibleOutside;
exports.busLoopStartsForDay = busLoopStartsForDay;
exports.nextBusAt = nextBusAt;
exports.busAtStop = busAtStop;
exports.travelOptions = travelOptions;
/**
 * MoniMate — world systems driven by the central clock:
 * places & doors, routing/distance, shop hours, NPC schedules, bus timetable, travel options.
 * Every function takes `minutes` (the clock) as input. None of them own a timer.
 */
const clock_1 = require("./clock");
exports.TILE_PX = 72; // 48 * 1.5, must match TS in the game
exports.METRES_PER_TILE = 8; // for the "250m" style readouts
exports.WALK_MIN_PER_TILE = 0.6;
exports.BIKE_MIN_PER_TILE = 0.3;
const tileToPx = (t) => ({ x: t.x * exports.TILE_PX, y: t.y * exports.TILE_PX });
exports.tileToPx = tileToPx;
const pxToTile = (x, y) => ({ x: x / exports.TILE_PX, y: y / exports.TILE_PX });
exports.pxToTile = pxToTile;
// ── Real ground autotiles (sprites_bundle2 / city_tiles_bundle, 48x48 native) ──────────────
// Road/sidewalk layout mirrors the old page.tsx's ROAD_COLS/ROAD_ROWS grid, just resolved to a
// sprite path per tile instead of a flat fill colour.
exports.ROAD_COLS = [0, 12, 24, 36, 48, 59];
exports.ROAD_ROWS = [0, 10, 22, 34, 43];
const roadColSet = new Set(exports.ROAD_COLS), roadRowSet = new Set(exports.ROAD_ROWS);
const isRoadTile = (x, y) => roadColSet.has(x) || roadRowSet.has(y);
exports.isRoadTile = isRoadTile;
const isSidewalkTile = (x, y) => !(0, exports.isRoadTile)(x, y) && ((0, exports.isRoadTile)(x - 1, y) || (0, exports.isRoadTile)(x + 1, y) || (0, exports.isRoadTile)(x, y - 1) || (0, exports.isRoadTile)(x, y + 1));
exports.isSidewalkTile = isSidewalkTile;
function groundSprite(x, y) {
    const onCol = roadColSet.has(x), onRow = roadRowSet.has(y);
    if (onCol && onRow)
        return '/sprites/tiles/road_cross.png';
    if (onCol)
        return '/sprites/tiles/road_straight_v.png';
    if (onRow)
        return '/sprites/tiles/road_straight_h.png';
    if ((0, exports.isSidewalkTile)(x, y))
        return '/sprites/tiles/sidewalk_full.png';
    return '/sprites/tiles/grass_full.png';
}
// ── Player / NPC character sheet (Modern Interiors "Characters_free", 16x32 per frame) ─────
// Frame order in idle.png (4 frames) and run.png (4 dirs x 6 frames) is Down, Up, Left, Right —
// confirmed by inspecting the sheet. Only Adam is wired to the player for now; Alex/Amelia/Bob
// are copied in for NPCs to use the same way later.
exports.CHAR_FRAME_W = 16, exports.CHAR_FRAME_H = 32;
exports.CHAR_RUN_FRAMES = 6;
exports.DIR_ORDER = ['down', 'up', 'left', 'right'];
function facingToDir(angle) {
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0..2PI, 0 = facing +x (right)
    if (a >= Math.PI * 0.25 && a < Math.PI * 0.75)
        return 'down';
    if (a >= Math.PI * 0.75 && a < Math.PI * 1.25)
        return 'left';
    if (a >= Math.PI * 1.25 && a < Math.PI * 1.75)
        return 'up';
    return 'right';
}
const characterSheet = (name, anim) => `/characters/${name}/${anim}.png`;
exports.characterSheet = characterSheet;
// ── Interiors (Phase 7) ──────────────────────────────────────────────────────
// Real explorable rooms, built from the actual Modern Interiors 48x48 sheets — not a door+menu.
// Furniture pieces that couldn't yet be reliably sliced out of the multi-cell furniture sheet are
// drawn as labelled placeholder blocks (never invented art) until an exact tile-coordinate pass is
// done; floor/wall tiles ARE real single-cell sprites already confirmed against the sheet.
exports.INTERIOR_TILE_PX = 48; // interiors render at native scale, no *1.5 world zoom
const ROOM_BUILDER = '/sprites/interiors/room_builder.png';
const FURNITURE = '/sprites/interiors/furniture.png';
// Every crop below was located and visually confirmed against a labelled grid overlay of the
// real Interiors_free_48x48 sheet (Modern Interiors Free v2.2) — no invented or mismatched art.
exports.INTERIORS = {
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
        ],
        // Real price comparison, exactly per Rule 28 — the game never labels one "correct".
        shopItems: [
            { id: 'milk_basic', name: 'Milk', brand: 'Value', price: 3.50, tx: 2, ty: 4.5 },
            { id: 'milk_mid', name: 'Milk', brand: 'Farmhouse', price: 4.80, tx: 2, ty: 5.5 },
            { id: 'milk_premium', name: 'Milk', brand: 'Premium', price: 6.00, tx: 2, ty: 6.2 },
            { id: 'bread_basic', name: 'Bread', brand: 'Value', price: 2.20, tx: 4.5, ty: 1.7 },
            { id: 'bread_mid', name: 'Bread', brand: 'Bakery', price: 3.90, tx: 5.5, ty: 1.7 },
            { id: 'eggs_basic', name: 'Eggs (6)', brand: 'Value', price: 3.00, tx: 1.5, ty: 1.7 },
            { id: 'eggs_free_range', name: 'Eggs (6)', brand: 'Free Range', price: 4.50, tx: 2.5, ty: 1.7 },
            { id: 'notebook_4', name: 'Notebook', brand: 'Basic', price: 4.00, tx: 8.5, ty: 1.7 },
            { id: 'notebook_7', name: 'Notebook', brand: 'Standard', price: 7.00, tx: 9.5, ty: 1.7 },
            { id: 'notebook_10', name: 'Notebook', brand: 'Deluxe', price: 10.00, tx: 8.5, ty: 2.5 },
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
            { id: 'poster_basic', name: 'Poster Board', brand: 'Plain', price: 4.00, tx: 1.5, ty: 1.7 },
            { id: 'markers_basic', name: 'Markers (8pk)', brand: 'Standard', price: 5.00, tx: 4.5, ty: 1.7 },
            { id: 'glue_basic', name: 'Glue Stick', brand: 'Standard', price: 2.00, tx: 1.5, ty: 5.2 },
        ],
    },
};
/** Which real interior scene each non-generic building routes to (everything else falls back to
 *  the plain interior_shop placeholder room). Keeping this here, next to INTERIORS, rather than
 *  cluttering PlaceDef with a field only 5 of 19 places use. */
exports.PLACE_INTERIOR_SCENE = {
    cafe: 'interior_cafe',
    bank: 'interior_bank',
    mall: 'interior_mall',
    restaurant: 'interior_restaurant',
    shop_small: 'interior_bookshop',
};
const getInterior = (sceneId) => exports.INTERIORS[sceneId];
exports.getInterior = getInterior;
const P = (id, name, tx, ty, tw, th, emoji, sprite, interior = 'shop') => ({ id, name, tx, ty, tw, th, interior, sprite, emoji });
// Matches your real city layout (LOCATIONS in the old page.tsx) tile-for-tile, so no re-tuning needed.
// Sprite paths point at real files copied from the user's supplied asset packs
// (sprites_bundle2 + Modern Interiors). Where no matching building sprite exists in the
// supplied packs, `sprite` is left undefined and the renderer draws a labelled placeholder
// block instead of inventing art — per the "don't substitute unrelated art" rule. Those gaps
// are outside the Chapter-1/School-Student MVP loop (home / university / supermarket / dairy /
// mall / bus_stop), which are all fully asset-backed.
exports.PLACES = [
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
exports.DECOR_PROPS = [
    // fence line tracing the top (map-edge side) of the schoolyard, purely visual
    ...Array.from({ length: 10 }, (_, i) => ({ placeId: 'university', sprite: '/sprites/props/fence.png', tx: 37 + i, ty: 0.55, anchorBottom: true })),
    { placeId: 'university', sprite: '/sprites/props/sign.png', tx: 39.3, ty: 8.9, anchorBottom: true },
    { placeId: 'university', sprite: '/sprites/props/lamp.png', tx: 37.3, ty: 8.85, anchorBottom: true },
    { placeId: 'university', sprite: '/sprites/props/lamp.png', tx: 46.3, ty: 8.85, anchorBottom: true },
];
const placeById = new Map(exports.PLACES.map(p => [p.id, p]));
const getPlace = (id) => placeById.get(id);
exports.getPlace = getPlace;
/** Door tile: bottom-centre of the building, on the sidewalk row just below it. Park uses its open middle. */
function doorTile(placeId) {
    const p = placeById.get(placeId);
    if (placeId === 'bus_stop')
        return exports.BUS_STOPS.south.tile;
    if (!p)
        return { x: 6, y: 9 };
    if (p.id === 'park')
        return { x: p.tx + Math.floor(p.tw / 2), y: p.ty + 1 };
    return { x: p.tx + Math.floor(p.tw / 2), y: p.ty + p.th };
}
const doorPx = (placeId) => (0, exports.tileToPx)(doorTile(placeId));
exports.doorPx = doorPx;
// ── Routing on the sidewalk grid ────────────────────────────────────────────
// Doors sit on horizontal sidewalk rows. Vertical travel between rows must use a road-side column
// (x = road ± 1), otherwise NPCs would walk through buildings. This gives cheap, believable paths
// and a real walking distance for "School 250m" without a full A* pathfinder.
const CONNECTOR_COLS = [11, 23, 35, 47]; // sidewalk columns beside vertical roads (x = roadCol - 1)
function routeTiles(from, to) {
    if (Math.abs(from.y - to.y) < 1.5)
        return [from, to];
    // choose the connector column that minimises total horizontal travel
    let best = CONNECTOR_COLS[0], bestCost = Infinity;
    for (const c of CONNECTOR_COLS) {
        const cost = Math.abs(from.x - c) + Math.abs(to.x - c);
        if (cost < bestCost) {
            bestCost = cost;
            best = c;
        }
    }
    // walk on the sidewalk row nearest each end
    return [from, { x: best, y: from.y }, { x: best, y: to.y }, to];
}
function routeLengthTiles(route) {
    let d = 0;
    for (let i = 1; i < route.length; i++)
        d += Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y);
    return d;
}
const distanceTiles = (a, b) => routeLengthTiles(routeTiles(a, b));
exports.distanceTiles = distanceTiles;
const distanceMetres = (a, b) => Math.round((0, exports.distanceTiles)(a, b) * exports.METRES_PER_TILE / 10) * 10;
exports.distanceMetres = distanceMetres;
// ── Shop / service opening hours ────────────────────────────────────────────
const WEEKDAYS = [0, 1, 2, 3, 4];
const ALWAYS = [{ open: 0, close: clock_1.MIN_PER_DAY }];
exports.OPENING_HOURS = {
    home: ALWAYS,
    park: ALWAYS,
    bus_stop: ALWAYS,
    university: [{ open: (0, clock_1.hm)(8, 0), close: (0, clock_1.hm)(15, 30), days: WEEKDAYS }],
    supermarket: [{ open: (0, clock_1.hm)(7), close: (0, clock_1.hm)(21) }],
    dairy: [{ open: (0, clock_1.hm)(6, 30), close: (0, clock_1.hm)(22) }],
    cafe: [{ open: (0, clock_1.hm)(7), close: (0, clock_1.hm)(17) }],
    library: [{ open: (0, clock_1.hm)(9), close: (0, clock_1.hm)(20), days: WEEKDAYS }, { open: (0, clock_1.hm)(10), close: (0, clock_1.hm)(16), days: [5] }],
    bank: [{ open: (0, clock_1.hm)(9), close: (0, clock_1.hm)(16, 30), days: WEEKDAYS }],
    mall: [{ open: (0, clock_1.hm)(9), close: (0, clock_1.hm)(21) }],
    shop_small: [{ open: (0, clock_1.hm)(8), close: (0, clock_1.hm)(17, 30), days: [0, 1, 2, 3, 4, 5] }],
    post_office: [{ open: (0, clock_1.hm)(8, 30), close: (0, clock_1.hm)(17), days: WEEKDAYS }],
    market: [{ open: (0, clock_1.hm)(8), close: (0, clock_1.hm)(14), days: [5, 6] }],
    restaurant: [{ open: (0, clock_1.hm)(11, 30), close: (0, clock_1.hm)(22) }],
    gym: [{ open: (0, clock_1.hm)(6), close: (0, clock_1.hm)(21) }],
    hospital: [{ open: (0, clock_1.hm)(8), close: (0, clock_1.hm)(17), days: WEEKDAYS }],
    office: [{ open: (0, clock_1.hm)(8), close: (0, clock_1.hm)(18), days: WEEKDAYS }],
    police: [{ open: (0, clock_1.hm)(9), close: (0, clock_1.hm)(16), days: WEEKDAYS }],
    apartment: [{ open: (0, clock_1.hm)(9), close: (0, clock_1.hm)(18) }],
};
const isOpen = (placeId, minutes) => (0, clock_1.inDailyWindows)(minutes, exports.OPENING_HOURS[placeId] ?? ALWAYS);
exports.isOpen = isOpen;
/** Next time (absolute minutes) this place opens, or null if open now / never. */
function nextOpening(placeId, minutes) {
    if ((0, exports.isOpen)(placeId, minutes))
        return null;
    for (let m = Math.floor(minutes) + 1; m < minutes + 8 * clock_1.MIN_PER_DAY; m += 5) {
        if ((0, exports.isOpen)(placeId, m))
            return m;
    }
    return null;
}
function closedReason(placeId, minutes) {
    const n = nextOpening(placeId, minutes);
    if (!n)
        return 'Closed.';
    const p = (0, clock_1.parts)(n), now = (0, clock_1.parts)(minutes);
    const hh = p.hour % 12 === 0 ? 12 : p.hour % 12;
    const label = `${hh}:${String(p.minute).padStart(2, '0')} ${p.hour >= 12 ? 'PM' : 'AM'}`;
    return p.day === now.day ? `Closed — opens at ${label}.` : `Closed — opens ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][p.dayOfWeek]} ${label}.`;
}
exports.NPCS = [
    {
        id: 'mum', name: 'Mum', color: '#c06090', speedTilesPerMin: 2.2, sheet: 'amelia',
        schedule: [
            { from: (0, clock_1.hm)(0), place: 'home' },
            { from: (0, clock_1.hm)(8, 0), place: 'office', days: WEEKDAYS },
            { from: (0, clock_1.hm)(17, 0), place: 'supermarket', days: [2] }, // Wednesday shop
            { from: (0, clock_1.hm)(17, 30), place: 'home' },
        ],
    },
    {
        id: 'jordan', name: 'Jordan', color: '#4f8fd0', speedTilesPerMin: 2.0, sheet: 'alex',
        schedule: [
            { from: (0, clock_1.hm)(0), place: 'home' }, // (their own home, shown as "home" area)
            { from: (0, clock_1.hm)(7, 55), place: 'university', days: WEEKDAYS },
            { from: (0, clock_1.hm)(15, 35), place: 'university' }, // outside the school gate after bell
            { from: (0, clock_1.hm)(16, 0), place: 'park', days: [0, 1, 3] },
            { from: (0, clock_1.hm)(16, 0), place: 'mall', days: [4] }, // Fridays: arcade
            { from: (0, clock_1.hm)(18, 0), place: 'home' },
        ],
    },
    {
        id: 'riley', name: 'Riley', color: '#d0a040', speedTilesPerMin: 2.0, sheet: 'bob',
        schedule: [
            { from: (0, clock_1.hm)(0), place: 'home' },
            { from: (0, clock_1.hm)(8, 0), place: 'university', days: WEEKDAYS },
            { from: (0, clock_1.hm)(15, 40), place: 'market' },
            { from: (0, clock_1.hm)(17, 0), place: 'home' },
        ],
    },
    {
        id: 'teacher', name: 'Ms Patel', color: '#7050a0', speedTilesPerMin: 2.0, sheet: 'amelia',
        schedule: [
            { from: (0, clock_1.hm)(0), place: 'home' },
            { from: (0, clock_1.hm)(7, 30), place: 'university', days: WEEKDAYS },
            { from: (0, clock_1.hm)(16, 30), place: 'home' },
        ],
    },
    {
        id: 'shopkeeper', name: 'Mr Lee', color: '#409070', speedTilesPerMin: 2.0, sheet: 'bob',
        schedule: [
            { from: (0, clock_1.hm)(0), place: 'home' },
            { from: (0, clock_1.hm)(6, 30), place: 'dairy' },
            { from: (0, clock_1.hm)(22), place: 'home' },
        ],
    },
];
const npcDefById = new Map(exports.NPCS.map(n => [n.id, n]));
const getNpcDef = (id) => npcDefById.get(id);
exports.getNpcDef = getNpcDef;
/** Where the schedule says this NPC belongs right now. Uses the latest matching slot. */
function npcPlaceAt(npc, minutes) {
    const p = (0, clock_1.parts)(minutes);
    let place = npc.schedule[0].place;
    let best = -1;
    for (const s of npc.schedule) {
        if (s.days && !s.days.includes(p.dayOfWeek))
            continue;
        if (s.from <= p.minuteOfDay && s.from >= best) {
            best = s.from;
            place = s.place;
        }
    }
    return place;
}
/** Fewer NPCs outside late at night: anyone whose place isn't 'home' is home after 23:00 unless the place is open. */
function npcVisibleOutside(placeId, minutes) {
    if (placeId === 'home')
        return false; // indoors
    const p = (0, clock_1.parts)(minutes);
    if (p.minuteOfDay >= (0, clock_1.hm)(23) || p.minuteOfDay < (0, clock_1.hm)(6))
        return false;
    // buildings hide their occupants when open (they're inside); the door area shows those "outside" (park, market, stop)
    return placeId === 'park' || placeId === 'market' || placeId === 'bus_stop';
}
exports.BUS_STOPS = {
    home: { id: 'stop_home', name: 'Home St', tile: { x: 6, y: 9 }, placeId: 'home' },
    school: { id: 'stop_school', name: 'School Gate', tile: { x: 42, y: 9 }, placeId: 'university' },
    mall: { id: 'stop_mall', name: 'Mall Plaza', tile: { x: 30, y: 21 }, placeId: 'mall' },
    south: { id: 'stop_south', name: 'Park & Ride', tile: { x: 26, y: 39 }, placeId: 'bus_stop' },
};
/** One loop route. `offsetMin` = minutes after the loop starts at Home St. */
exports.BUS_ROUTE = {
    id: 'route_1',
    name: 'Route 1 — City Loop',
    fare: 2.0,
    stops: [
        { stopId: 'stop_home', offsetMin: 0 },
        { stopId: 'stop_school', offsetMin: 13 },
        { stopId: 'stop_mall', offsetMin: 21 },
        { stopId: 'stop_south', offsetMin: 34 },
    ],
    dwellMin: 1,
};
/** Headway (minutes between loop starts) for a given minute-of-day and day-of-week. More frequent in school peaks. */
function headway(minuteOfDay, dow) {
    const weekend = dow >= 5;
    if (minuteOfDay < (0, clock_1.hm)(6) || minuteOfDay >= (0, clock_1.hm)(22))
        return null; // no service overnight
    if (weekend)
        return minuteOfDay >= (0, clock_1.hm)(8) && minuteOfDay < (0, clock_1.hm)(20) ? 30 : null;
    if (minuteOfDay >= (0, clock_1.hm)(7) && minuteOfDay < (0, clock_1.hm)(9))
        return 10; // morning peak
    if (minuteOfDay >= (0, clock_1.hm)(15) && minuteOfDay < (0, clock_1.hm)(18))
        return 10; // afternoon peak
    if (minuteOfDay < (0, clock_1.hm)(19))
        return 20;
    return 30;
}
/** All loop start times (absolute minutes) for a given absolute day. Anchored so a bus reaches Home St at 7:55 on weekdays. */
function busLoopStartsForDay(day) {
    const dow = day % 7;
    const out = [];
    // anchor the weekday morning peak on :55 / :05 / :15 ... (7:55 hits Home St, 8:05, 8:15 ...)
    let m = dow < 5 ? (0, clock_1.hm)(6, 5) : (0, clock_1.hm)(8, 0);
    while (m < (0, clock_1.hm)(22)) {
        out.push((0, clock_1.at)(day, 0, m));
        const h = headway(m, dow);
        if (h === null) {
            m += 30;
            continue;
        }
        m += h;
    }
    // Weekdays from 6:05: 20-min headway to 7:05, then 10-min peak → 7:15 … 7:55 (Home St), 8:05, 8:15 …
    return out;
}
/** Next bus at a stop at or after `minutes`. */
function nextBusAt(stopId, minutes) {
    const stop = exports.BUS_ROUTE.stops.find(s => s.stopId === stopId);
    if (!stop)
        return null;
    const d0 = (0, clock_1.parts)(minutes).day;
    for (let d = d0; d <= d0 + 1; d++) {
        for (const start of busLoopStartsForDay(d)) {
            const arrives = start + stop.offsetMin;
            if (arrives >= minutes)
                return { stopId, arrivesAt: arrives, departsAt: arrives + exports.BUS_ROUTE.dwellMin, loopStart: start };
        }
    }
    return null;
}
/** Is a bus physically standing at the stop right now (doors open)? */
function busAtStop(stopId, minutes) {
    const stop = exports.BUS_ROUTE.stops.find(s => s.stopId === stopId);
    if (!stop)
        return null;
    const d = (0, clock_1.parts)(minutes).day;
    for (const start of [...busLoopStartsForDay(d - 1), ...busLoopStartsForDay(d)]) {
        const arrives = start + stop.offsetMin;
        if (minutes >= arrives && minutes < arrives + exports.BUS_ROUTE.dwellMin) {
            return { stopId, arrivesAt: arrives, departsAt: arrives + exports.BUS_ROUTE.dwellMin, loopStart: start };
        }
    }
    return null;
}
const rideMinutes = (fromStopId, toStopId) => {
    const a = exports.BUS_ROUTE.stops.find(s => s.stopId === fromStopId);
    const b = exports.BUS_ROUTE.stops.find(s => s.stopId === toStopId);
    if (!a || !b)
        return 0;
    const d = b.offsetMin - a.offsetMin;
    return d >= 0 ? d : d + 40; // wrap round the loop
};
exports.rideMinutes = rideMinutes;
const stopById = (id) => Object.values(exports.BUS_STOPS).find(s => s.id === id);
exports.stopById = stopById;
const nearestStop = (t) => Object.values(exports.BUS_STOPS).reduce((best, s) => ((0, exports.distanceTiles)(t, s.tile) < (0, exports.distanceTiles)(t, best.tile) ? s : best));
exports.nearestStop = nearestStop;
function travelOptions(fromTile, toPlaceId, now, opts) {
    const to = doorTile(toPlaceId);
    const tiles = (0, exports.distanceTiles)(fromTile, to);
    const walk = Math.round(tiles * exports.WALK_MIN_PER_TILE);
    const bike = Math.round(tiles * exports.BIKE_MIN_PER_TILE);
    const board = (0, exports.nearestStop)(fromTile);
    const alight = (0, exports.nearestStop)(to);
    const toBoard = Math.round((0, exports.distanceTiles)(fromTile, board.tile) * exports.WALK_MIN_PER_TILE);
    const readyAt = now + toBoard;
    const bus = nextBusAt(board.id, readyAt);
    let busOpt;
    if (!bus || board.id === alight.id) {
        busOpt = { mode: 'bus', label: 'Bus', minutes: Infinity, arrivesAt: Infinity, cost: exports.BUS_ROUTE.fare, detail: 'No useful bus', available: false };
    }
    else {
        const ride = (0, exports.rideMinutes)(board.id, alight.id);
        const alightAt = bus.arrivesAt + ride;
        const fromAlight = Math.round((0, exports.distanceTiles)(alight.tile, to) * exports.WALK_MIN_PER_TILE);
        const arrives = alightAt + fromAlight;
        busOpt = {
            mode: 'bus', label: 'Bus', minutes: arrives - now, arrivesAt: arrives,
            cost: opts.hasPass ? 0 : exports.BUS_ROUTE.fare,
            detail: `${board.name} bus at ${fmt(bus.arrivesAt)}`, available: true,
        };
    }
    return [
        { mode: 'walk', label: 'Walk', minutes: walk, arrivesAt: now + walk, cost: 0, detail: `${(0, exports.distanceMetres)(fromTile, to)}m on foot`, available: true },
        { mode: 'bike', label: 'Bike', minutes: bike, arrivesAt: now + bike, cost: 0, detail: 'Free, moderate effort', available: opts.hasBike },
        busOpt,
    ];
}
function fmt(m) {
    const p = (0, clock_1.parts)(m);
    const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
    return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour >= 12 ? 'PM' : 'AM'}`;
}
