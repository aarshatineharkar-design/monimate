/**
 * MoniMate 2.0 — canonical top-level GameState.
 *
 * This is the NEW foundation described in Step 2. It exists ALONGSIDE the current game's
 * GameState (src/lib/types.ts) and is not yet wired into GameStore, page.tsx, or any renderer.
 * See src/game/README.md for how the two relate and what migrating means later.
 */
import type { MetaState } from './meta';
import type { TimeState } from './time';
import type { PlayerState } from './player';
import type { FinancialState } from './finance';
import type { EnergyState } from './energy';
import type { InventoryState } from './inventory';
import type { WorldState } from './world';
import type { NpcRuntimeState } from './npc';
import type { MissionState } from './mission';
import type { EventState } from './event';
import type { ProgressionState } from './progression';
import type { GoalState } from './goal';

export interface GameState {
  meta: MetaState;
  time: TimeState;
  player: PlayerState;
  finance: FinancialState;
  energy: EnergyState;
  inventory: InventoryState;
  world: WorldState;
  /** Keyed by NPC id. NpcDefinition (static content) is NOT part of GameState — only runtime
   *  state is persisted per save, same principle as the existing lib/world.ts NPCS content vs.
   *  lib/types.ts's per-save NpcRuntime record. */
  npcs: Record<string, NpcRuntimeState>;
  missions: MissionState;
  events: EventState;
  progression: ProgressionState;
  goals: GoalState;
}
