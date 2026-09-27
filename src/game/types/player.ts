/**
 * MoniMate 2.0 — PlayerState: identity/attributes kept separate from world position.
 *
 * Split rationale (from the Step 2 design review): the existing PlayerWorld (lib/types.ts)
 * conflates "who the player is" with "where the player is right now" in one flat object, and
 * conflates movement state with activity state in a single `status` field. This module keeps
 * those as three distinct pieces so each can evolve independently (e.g. adding age/appearance
 * to identity should never require touching collision/movement code).
 */
import type { LifePathId } from './meta';
import type { SceneId, PlaceId } from './world';

/**
 * Step 3 addition: 'chore', 'exercising', 'exploring' were added to this union (additive, no
 * existing value changed/removed) because the blueprint's own named future-activity examples
 * ("Help parents", "Exercise", "Explore") don't fit any tag that existed after Step 2A — reusing
 * e.g. 'working' for chores or 'resting' for exercise would misreport what the player is doing.
 */
export type ActivityTag =
  | 'walking' | 'in_conversation' | 'shopping' | 'studying' | 'working'
  | 'socializing' | 'resting' | 'sleeping' | 'chore' | 'exercising' | 'exploring';

export type MovementStatus = 'idle' | 'walking' | 'waiting' | 'on_bus' | 'sleeping';

export interface PlayerIdentity {
  id: string;
  /** Optional: the existing game keeps the player's display name in lib/auth.ts's PlayerProfile,
   *  outside GameState entirely. Not deciding here whether that folds in later — kept optional
   *  so this type is usable either way without forcing that decision now. */
  name?: string;
  lifePath: LifePathId;
  /** Not used by the School campaign; present for future campaigns where age matters
   *  (e.g. International/Working Life framing). Undefined = not tracked for this save. */
  age?: number;
}

export interface PlayerAttributes {
  level: number;
  xp: number;
  currentActivity: ActivityTag | null;
  transportation: { hasBike: boolean; hasBusPass: boolean };
}

export interface PlayerWorldPosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** radians, 0 = east */
  facing: number;
  scene: SceneId;
  /** place the player is inside or standing at the entrance of; null = out on the street */
  place: PlaceId | null;
  lastDoor?: { placeId: PlaceId; x: number; y: number; facing: number };
  movementStatus: MovementStatus;
}

export interface PlayerState {
  identity: PlayerIdentity;
  attributes: PlayerAttributes;
  world: PlayerWorldPosition;
}
