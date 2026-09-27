/**
 * MoniMate 2.0 — future system contracts (the systems NOT yet implemented).
 *
 * TYPES ONLY for everything below. No classes, no implementations — creating empty classes here
 * just to "satisfy the architecture" was explicitly ruled out for Step 2A. Each interface lists
 * the MINIMUM public surface its system will eventually need.
 *
 * Step 3 UPDATE: ClockSystem, PlayerSystem, EnergySystem, FinanceSystem and ActivitySystem are now
 * REAL, implemented classes — see clockSystem.ts / playerSystem.ts / energySystem.ts /
 * financeSystem.ts / activitySystem.ts (exported together from ./index). Their Step 2A interface
 * sketches below were removed rather than kept as parallel, drifting documentation: Step 2A's
 * PlayerSystem sketch had `spendEnergy`/`restEnergy`, which Step 3 deliberately does NOT give
 * PlayerSystem — those belong to EnergySystem alone, and PlayerSystem never touches
 * energy/finance, per Step 3's explicit system-responsibilities rule. The concrete classes are now
 * the authoritative contract for those five systems; this file covers only what's still unbuilt.
 *
 * None of these are used anywhere yet. The existing GameStore (src/lib/store.ts) continues to be
 * the game's real engine; this file is the target shape for the later, incremental migration
 * described in src/game/README.md.
 */
import type { TimeState } from '../types/time';
import type { WorldState } from '../types/world';
import type { NpcRuntimeState } from '../types/npc';
import type { MissionState } from '../types/mission';
import type { EventState, PendingEvent } from '../types/event';
import type { ProgressionState } from '../types/progression';
import type { GameState } from '../types/gameState';

export interface EconomySystem {
  /** Runs whatever periodic economic effects (payday, rent, interest) are due as of the current
   *  time — acts only through FinanceSystem.recordTransaction, holds no state of its own. */
  processDue(now: TimeState): void;
}

export interface WorldSystem {
  getState(): WorldState;
  setFlag(flag: string): void;
  hasFlag(flag: string): boolean;
  isLocationUnlocked(placeId: string): boolean;
}

export interface NPCSystem {
  getNpc(id: string): NpcRuntimeState | undefined;
  getAllNpcs(): Record<string, NpcRuntimeState>;
  stepAll(gameMinutes: number): void;
}

export interface MissionSystem {
  getState(): MissionState;
  startMission(missionId: string): void;
  applyChoice(missionId: string, choiceId: string): void;
}

export interface EventSystem {
  getState(): EventState;
  getPendingEvent(): PendingEvent | null;
  resolvePendingEvent(choiceId: string): void;
}

export interface RelationshipSystem {
  getStanding(npcId: string): number;
  adjustStanding(npcId: string, delta: number, reason: string): void;
}

export interface ProgressionSystem {
  getState(): ProgressionState;
  grantXp(amount: number): void;
  unlockAchievement(id: string): void;
}

export interface SaveSystem {
  serialize(state: GameState): string;
  hydrate(json: string): GameState | null;
}
