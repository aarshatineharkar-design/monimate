/**
 * MoniMate 2.0 — PlayerSystem (Step 3 implementation).
 * Owns PlayerState. Deliberately thin: location/movement/current-activity only, per Step 3 scope.
 * No progression, no combat, no vehicles, no inventory here. Never touches FinancialState —
 * nothing in this file imports finance types or reaches into `finance`.
 */
import type { PlayerState, MovementStatus, ActivityTag } from '../types/player';
import type { PlaceId, SceneId } from '../types/world';

export class PlayerSystem {
  constructor(private readonly player: PlayerState) {}

  getState(): PlayerState {
    return this.player;
  }

  getLocation(): PlaceId | null {
    return this.player.world.place;
  }

  /** The clean way for an activity or future world interaction to move the player. Only updates
   *  `place` — it does not touch x/y/scene/facing, which belong to movement/rendering concerns
   *  outside this step's scope (no collision or camera system exists here to keep in sync). */
  changeLocation(placeId: PlaceId | null): void {
    this.player.world.place = placeId;
  }

  changeScene(scene: SceneId): void {
    this.player.world.scene = scene;
  }

  setMovementStatus(status: MovementStatus): void {
    this.player.world.movementStatus = status;
  }

  setCurrentActivity(activity: ActivityTag | null): void {
    this.player.attributes.currentActivity = activity;
  }
}
