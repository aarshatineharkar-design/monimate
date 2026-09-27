/**
 * MoniMate 2.0 — WorldState: persistent world facts, deliberately kept free of anything
 * rendering-related. No sprites, no canvas contexts, no React state, no DOM references — those
 * stay in src/lib/render.ts and src/app/game/page.tsx, untouched by this module.
 *
 * `SceneId`/`PlaceId` are re-declared here (not imported from src/lib/types.ts) on purpose: this
 * module must be able to stand alone as the new foundation without creating an import dependency
 * from src/game/ back onto src/lib/'s current types, which are expected to change shape as the
 * real migration happens later. The VALUES match today's lib/types.ts exactly, so nothing here
 * is incompatible with the existing content in lib/world.ts — it's just declared independently.
 */

export type PlaceId = string;

export type SceneId =
  | 'outdoor' | 'interior_home' | 'interior_shop' | 'interior_supermarket' | 'bus'
  | 'interior_school_hall' | 'interior_school_classroom' | 'interior_school_cafeteria'
  | 'interior_school_library' | 'interior_school_gym'
  | 'interior_cafe' | 'interior_bank' | 'interior_mall' | 'interior_restaurant' | 'interior_bookshop';

export interface WorldState {
  /** Current active outdoor scene/place is tracked on PlayerState.world (it's "where the player
   *  is", a player fact) — WorldState instead holds facts about the WORLD independent of the
   *  player's position: what's unlocked, what's happened, what the player owns that affects the
   *  world (a bus pass, a bike). */
  unlockedLocations: PlaceId[];
  /** Free-form world flags, same purpose as today's WorldFlags.flags — a one-shot "this happened"
   *  marker set. Kept as a plain string array rather than inventing a closed union, since new
   *  flags are added by content (missions/events), not by engine code, exactly as today. */
  flags: string[];
  /** Per-day one-shot markers, e.g. "attended school today" — mirrors today's dailyMarks. */
  dailyMarks: string[];
  /** Ids of world/mission-level events that have fully resolved, for gating repeat content
   *  ("only show this once"). Distinct from `flags`: a flag is an arbitrary marker set by content;
   *  this is specifically the event-completion record for the future EventSystem (see event.ts). */
  completedWorldEvents: string[];
  transportation: {
    hasBike: boolean;
    busPass: { validUntil: number } | null;
  };
}
