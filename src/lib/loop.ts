/**
 * MoniMate — GameLoop: wires input → smooth movement → the store's clock → camera/minimap,
 * once per animation frame. This is the only place that calls store.tick(); GamePage's render
 * function just reads state + camera off this object every frame.
 */
import { GameStore } from './store';
import { SmoothCamera, stepMovement, MoveInput, MoverConfig, DEFAULT_MOVER } from './render';
import { TILE_PX, doorTile, getPlace, PLACES, getInterior, INTERIOR_TILE_PX } from './world';

export interface CollisionOptions { worldW: number; worldH: number }

/** True footprint collision only — the door gap (checked separately below) is never solid here. */
function insideAnyBuilding(px: number, py: number): string | null {
  const tx = px / TILE_PX, ty = py / TILE_PX;
  for (const p of PLACES) {
    if (p.interior === 'none') continue;
    if (tx >= p.tx && tx <= p.tx + p.tw && ty >= p.ty + p.th - 0.15 && ty <= p.ty + p.th + 0.4) continue; // door gap
    if (tx > p.tx && tx < p.tx + p.tw && ty > p.ty && ty < p.ty + p.th) return p.id;
  }
  return null;
}

/**
 * Standing in a building's door gap (the walkable strip right at its base). This used to be the
 * ONLY way in, but the strip sits directly against the "inside" zone that `insideAnyBuilding`
 * treats as solid — so a player could walk right up to the door and then hit a wall one step
 * later, and `enterPlace` (which only fired once you were already inside) never got a chance to
 * run. Detecting the door gap itself, and entering from there, fixes the catch-22: you now warp
 * in the moment you reach the doorway instead of needing to walk *through* a wall to get there.
 */
function atBuildingDoor(px: number, py: number): string | null {
  const tx = px / TILE_PX, ty = py / TILE_PX;
  for (const p of PLACES) {
    if (p.interior === 'none') continue;
    if (tx >= p.tx && tx <= p.tx + p.tw && ty >= p.ty + p.th - 0.15 && ty <= p.ty + p.th + 0.4) return p.id;
  }
  return null;
}

export class GameLoop {
  camera = new SmoothCamera();
  private lastTs = 0;
  pulseT = 0;

  constructor(public store: GameStore, private mover: MoverConfig = DEFAULT_MOVER) {}

  /** Call once per requestAnimationFrame with the current timestamp (ms) and current input state. */
  frame(ts: number, input: MoveInput, viewport: { w: number; h: number }, world: CollisionOptions) {
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    this.pulseT += dt;

    const s = this.store.state;

    if (s.player.scene === 'outdoor' && !s.sleeping && !s.paused) {
      const collides = (x: number, y: number) => {
        const b = insideAnyBuilding(x, y);
        return !!b; // buildings are solid except through their own door gap, handled above
      };
      const { movedTiles } = stepMovement(s.player, input, dt, this.mover, collides);
      this.store.tick(dt, movedTiles, 'walk');

      // entering a building through its door
      const hit = atBuildingDoor(s.player.x, s.player.y);
      if (hit) this.store.enterPlace(hit);

      // park has no walls; report entry/exit as a zone
      const park = getPlace('park');
      if (park) {
        const tx = s.player.x / TILE_PX, ty = s.player.y / TILE_PX;
        const inPark = tx >= park.tx && tx <= park.tx + park.tw && ty >= park.ty && ty <= park.ty + park.th;
        this.store.setOutdoorZone(inPark ? 'park' : null);
      }
    } else if (s.player.scene !== 'outdoor' && s.player.scene !== 'bus' && !s.sleeping && !s.paused) {
      // Real interior room: same free movement + collision system, scaled to the room's own grid.
      const interior = getInterior(s.player.scene);
      if (interior) {
        const collides = (x: number, y: number) => {
          const tx = x / INTERIOR_TILE_PX, ty = y / INTERIOR_TILE_PX;
          if (tx < 0.3 || ty < 0.3 || tx > interior.widthTiles - 0.3 || ty > interior.heightTiles - 0.3) return true;
          for (const f of interior.furniture) {
            if (!f.solid) continue;
            if (tx > f.tx - 0.05 && tx < f.tx + f.tw + 0.05 && ty > f.ty - 0.05 && ty < f.ty + f.th + 0.05) return true;
          }
          return false;
        };
        stepMovement(s.player, input, dt, { ...this.mover, maxSpeed: this.mover.maxSpeed * 0.6 }, collides);
        this.store.tick(dt, 0);
        // walking onto any door tile either steps back outside or hops to another room in the
        // same building (school hallway <-> classroom/cafeteria/library/gym), same as pressing ESC
        // for the "leave the building entirely" link.
        const tx = s.player.x / INTERIOR_TILE_PX, ty = s.player.y / INTERIOR_TILE_PX;
        for (const link of interior.links) {
          if (Math.abs(tx - link.tile.x) < 0.45 && Math.abs(ty - link.tile.y) < 0.45) {
            if (link.toScene === 'outside') this.exit();
            else this.store.goToInteriorScene(link.toScene);
            break;
          }
        }
      } else {
        this.store.tick(dt, 0);
      }
    } else if (!s.sleeping && !s.paused) {
      // on the bus: time still passes, just at the base rate (no walking distance)
      this.store.tick(dt, 0);
    }

    this.camera.update(s.player.x, s.player.y, dt, {
      minX: 0, minY: 0, maxX: world.worldW, maxY: world.worldH, viewW: viewport.w, viewH: viewport.h,
    });
  }

  /** Player pressed "exit" while indoors. */
  exit() { this.store.exitPlace(); }
}
