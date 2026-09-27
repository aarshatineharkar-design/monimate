/**
 * MoniMate 2.0 — save/campaign identity.
 *
 * This is the ONLY place a "version" concept lives for the new state. The existing game
 * (src/lib/types.ts GameState.version) has its own separate versioning and is untouched —
 * `schemaVersion` here versions the NEW GameState shape defined under src/game/, not the
 * old one. When migration actually happens (a later step), the old save's `version` and this
 * `schemaVersion` become two points on the same migration chain, not two competing concepts.
 */

/** Which campaign/life-path this save belongs to. Matches the existing lib/gameData.ts LifePath
 *  union exactly on purpose — the value space doesn't change, only where it's declared. */
export type LifePathId = 'school' | 'university' | 'international' | 'working';

export interface MetaState {
  /** Schema version of THIS (src/game/) GameState shape. Starts at 1 — this is a brand new,
   *  parallel foundation, not a continuation of the existing save's version: 2 numbering. */
  schemaVersion: 1;
  lifePath: LifePathId;
  /** Game-world minute this save was first created at (see TimeState) — not a wall-clock value,
   *  so a fresh game always starts at createdAt === time.minutes. */
  createdAt: number;
  /** Game-world minute this save was last written at. Updated by SaveSystem on every write. */
  updatedAt: number;
}
