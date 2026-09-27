/**
 * MoniMate — canvas renderer helpers: camera, day/night overlay, minimap, movement smoothing.
 * Pure functions + small stateful helpers; the actual <canvas> drawing calls live in GamePage,
 * these just compute what to draw so the loop stays cheap and the code stays testable.
 */
import { formatDay, formatTime, lightingAt, lampsOn } from './clock';
import type { GameState, NpcRuntime } from './types';
import { BUS_STOPS, PLACES, TILE_PX, doorTile, getPlace } from './world';
import type { Tile } from './world';
import type { MissionDef } from './missions';
import { trackedMission } from './missions';

// ── Camera ───────────────────────────────────────────────────────────────
export interface Camera { x: number; y: number }

/** Smoothly interpolates toward the player so the camera never jump-cuts or shakes. */
export class SmoothCamera {
  x = 0; y = 0; initialized = false;
  /** exponential smoothing factor per second; higher = snappier */
  private readonly speed = 8;

  update(targetX: number, targetY: number, dtSec: number, bounds?: { minX: number; minY: number; maxX: number; maxY: number; viewW: number; viewH: number }) {
    if (!this.initialized) { this.x = targetX; this.y = targetY; this.initialized = true; }
    const k = 1 - Math.exp(-this.speed * dtSec); // frame-rate independent smoothing
    this.x += (targetX - this.x) * k;
    this.y += (targetY - this.y) * k;
    if (bounds) {
      const halfW = bounds.viewW / 2, halfH = bounds.viewH / 2;
      this.x = Math.min(Math.max(this.x, bounds.minX + halfW), Math.max(bounds.minX + halfW, bounds.maxX - halfW));
      this.y = Math.min(Math.max(this.y, bounds.minY + halfH), Math.max(bounds.minY + halfH, bounds.maxY - halfH));
    }
  }
}

// ── Smooth player movement (no grid snapping, accel/decel, corner-friendly) ─
export interface MoveInput { up: boolean; down: boolean; left: boolean; right: boolean }

export interface MoverConfig { maxSpeed: number; accel: number; decel: number }
export const DEFAULT_MOVER: MoverConfig = { maxSpeed: 4.4 * TILE_PX, accel: 26 * TILE_PX, decel: 34 * TILE_PX };

/**
 * Advances velocity/position with acceleration + deceleration (no instant start/stop, no slippery
 * overshoot). Returns the distance actually travelled this frame in tiles, which the store's clock
 * uses to convert walking into game-minutes.
 */
export function stepMovement(
  pos: { x: number; y: number; vx: number; vy: number; facing: number },
  input: MoveInput, dtSec: number, cfg: MoverConfig = DEFAULT_MOVER,
  collides?: (x: number, y: number) => boolean,
): { movedTiles: number; moving: boolean } {
  let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(ix, iy);
  if (len > 0) { ix /= len; iy /= len; }

  const targetVx = ix * cfg.maxSpeed, targetVy = iy * cfg.maxSpeed;
  const rate = len > 0 ? cfg.accel : cfg.decel;
  pos.vx += clampStep(targetVx - pos.vx, rate * dtSec);
  pos.vy += clampStep(targetVy - pos.vy, rate * dtSec);

  const dx = pos.vx * dtSec, dy = pos.vy * dtSec;
  let nx = pos.x + dx, ny = pos.y + dy;

  // Corner-friendly collision: try full move, then slide along one axis instead of stopping dead.
  if (collides) {
    if (collides(nx, ny)) {
      const slideX = !collides(nx, pos.y);
      const slideY = !collides(pos.x, ny);
      if (slideX) { ny = pos.y; pos.vy = 0; }
      else if (slideY) { nx = pos.x; pos.vx = 0; }
      else { nx = pos.x; ny = pos.y; pos.vx = 0; pos.vy = 0; }
    }
  }

  const moved = Math.hypot(nx - pos.x, ny - pos.y);
  pos.x = nx; pos.y = ny;
  if (moved > 0.05) pos.facing = Math.atan2(dy, dx) || pos.facing;
  return { movedTiles: moved / TILE_PX, moving: len > 0 || Math.hypot(pos.vx, pos.vy) > 4 };
}

function clampStep(delta: number, maxStep: number) {
  return Math.max(-maxStep, Math.min(maxStep, delta));
}

// ── Day/night overlay ────────────────────────────────────────────────────
/** Draws the current lighting tint as one full-canvas rect. Cheap: no per-tile redraw needed. */
export function drawDayNightOverlay(ctx: CanvasRenderingContext2D, minutes: number, w: number, h: number) {
  const l = lightingAt(minutes);
  if (l.a <= 0.002) return;
  ctx.save();
  ctx.fillStyle = `rgba(${Math.round(l.r)}, ${Math.round(l.g)}, ${Math.round(l.b)}, ${l.a})`;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  // faint warm/cool screen pass so it doesn't just look "darkened", it looks lit
  if (l.phase === 'dusk' || l.phase === 'night' || l.phase === 'late_night') {
    ctx.fillStyle = `rgba(40,50,90,${Math.min(0.18, l.a * 0.25)})`;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Small glow circles at each street-lamp-worthy building door, only drawn once it's dark enough. */
export function streetLampSpots(minutes: number): Tile[] {
  if (!lampsOn(minutes)) return [];
  return PLACES.filter(p => p.interior !== 'none').map(p => doorTile(p.id));
}

// ── Minimap ──────────────────────────────────────────────────────────────
export interface MinimapOptions { size: number; worldW: number; worldH: number; }

/**
 * Draws a compact top-down minimap into its own small canvas region (caller positions it, e.g.
 * bottom-right with a fixed margin). Shows roads/buildings as simple shapes, bus stops, the player
 * as a rotating directional arrow, and the tracked mission's destination as a pulsing dot + line.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D, x: number, y: number, opts: MinimapOptions,
  state: GameState, defs: MissionDef[], pulseT: number,
) {
  const { size, worldW, worldH } = opts;
  const scale = size / Math.max(worldW, worldH);
  const ox = x, oy = y;

  ctx.save();
  ctx.translate(ox, oy);

  // panel
  ctx.fillStyle = 'rgba(18,20,30,0.72)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  roundRect(ctx, 0, 0, size, size, 10);
  ctx.fill(); ctx.stroke();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 2, 2, size - 4, size - 4, 8);
  ctx.clip();

  // buildings
  for (const p of PLACES) {
    if (p.interior === 'none') continue; // park drawn as green patch below
    ctx.fillStyle = p.id === 'home' ? '#5fb87a' : p.id === 'university' ? '#5f8ab8' : '#7a7f96';
    ctx.fillRect(p.tx * TILE_PX * scale, p.ty * TILE_PX * scale, p.tw * TILE_PX * scale, p.th * TILE_PX * scale);
  }
  // park
  const park = getPlace('park');
  if (park) { ctx.fillStyle = '#3f7a4a'; ctx.fillRect(park.tx * TILE_PX * scale, park.ty * TILE_PX * scale, park.tw * TILE_PX * scale, park.th * TILE_PX * scale); }

  // bus stops
  ctx.fillStyle = '#e0b93c';
  for (const stop of Object.values(BUS_STOPS)) {
    const sx = stop.tile.x * TILE_PX * scale, sy = stop.tile.y * TILE_PX * scale;
    ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // NPCs (tiny dots, only if visible outside)
  ctx.fillStyle = '#d68ac0';
  for (const npc of Object.values(state.npcs) as NpcRuntime[]) {
    if (!npc.visible) continue;
    ctx.beginPath(); ctx.arc(npc.x * scale, npc.y * scale, 1.6, 0, Math.PI * 2); ctx.fill();
  }

  // tracked mission destination
  const tracked = trackedMission(state, defs);
  if (tracked) {
    const d = doorTile(tracked.placeId);
    const dx = d.x * TILE_PX * scale, dy = d.y * TILE_PX * scale;
    const pulse = 3 + Math.sin(pulseT * 4) * 1.2;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(state.player.x * scale, state.player.y * scale);
    ctx.lineTo(dx, dy);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(dx, dy, pulse, 0, Math.PI * 2); ctx.fill();
  }

  // player direction indicator ("I am here")
  const px = state.player.x * scale, py = state.player.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.facing);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1c2440';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5, 0); ctx.lineTo(-3.5, 3.2); ctx.lineTo(-1.5, 0); ctx.lineTo(-3.5, -3.2);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.restore(); // clip
  ctx.restore(); // translate
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Waypoint distance/direction readout (subtle, non-GPS) ───────────────
export { waypointReadout } from './waypoint';

// ── HUD strings ───────────────────────────────────────────────────────────
export const hudTime = (minutes: number) => ({ day: formatDay(minutes), time: formatTime(minutes) });
