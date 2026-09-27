/**
 * MoniMate — where the current task is, relative to you: the arrow + distance on the NEXT card and
 * in the phone's Map app. Pure (no canvas), so it can be tested.
 */
import type { GameState } from './types';
import { TILE_PX, doorTile, getPlace, tileToPx } from './world';
import { trackedMission, type MissionDef } from './missions';
import { placeName } from './pathRules';

export function waypointReadout(state: GameState, defs: MissionDef[]): { label: string; metres: number; arrow: string; here: boolean } | null {
  const tracked = trackedMission(state, defs);
  if (!tracked) return null;
  const place = getPlace(tracked.placeId);
  const label = placeName(state.lifePath, tracked.placeId, place?.name);
  // Indoors, player.x/y are ROOM coordinates, not city ones — measure from this building's door.
  const indoors = state.player.scene !== 'outdoor' && state.player.scene !== 'bus';
  if (indoors && state.player.place === tracked.placeId) return { label, metres: 0, arrow: '📍', here: true };
  const from = indoors && state.player.place
    ? tileToPx(doorTile(state.player.place))
    : { x: state.player.x, y: state.player.y };
  const d = doorTile(tracked.placeId);
  const dx = d.x * TILE_PX - from.x, dy = d.y * TILE_PX - from.y;
  const metres = Math.round(Math.hypot(dx, dy) / TILE_PX * 8 / 10) * 10;
  if (metres <= 10) return { label, metres: 0, arrow: '📍', here: true };
  const angle = Math.atan2(dy, dx);
  const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  const arrow = arrows[Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
  return { label, metres, arrow, here: false };
}

