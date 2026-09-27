/**
 * MoniMate 2.0 — mission state container.
 *
 * Explicitly NOT a replacement for MissionDef/MissionStep/MissionChoice/MissionRuntime
 * (src/lib/missions.ts, src/lib/types.ts) — those keep working unchanged. This module only
 * defines how the future GameState references mission runtime state, so GameEngine has a typed
 * slot for it without the mission engine itself being touched.
 *
 * `MissionRuntime` is imported directly from the existing lib types rather than redeclared here,
 * because duplicating it would create exactly the kind of drift this whole exercise is trying to
 * avoid — if the mission engine's runtime shape changes, this reference updates automatically.
 */
import type { MissionRuntime } from '../../lib/types';

export interface MissionState {
  /** One entry per mission definition, same array shape the existing engine already produces via
   *  `initialMissionRuntime()` in lib/missions.ts. */
  active: MissionRuntime[];
}

export type { MissionRuntime };
