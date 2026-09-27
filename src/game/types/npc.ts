/**
 * MoniMate 2.0 — NPC definition vs. runtime state, split the same way the existing
 * src/lib/world.ts (NpcDef, static) / src/lib/types.ts (NpcRuntime, per-save) already split them.
 * This module does not replace either — it's the new-foundation equivalent, compatible in shape
 * with the existing NpcSlot schedule model so the current schedule/movement system can eventually
 * feed these types without a redesign.
 */
import type { PlaceId } from './world';
import type { RelationshipState } from './relationship';

/** Matches src/lib/world.ts's NpcSlot shape: from a minute-of-day, the NPC should be at `place`,
 *  optionally restricted to certain days of week. */
export interface NpcScheduleSlot {
  from: number;
  place: PlaceId;
  days?: number[];
}

export type NpcRole = 'family' | 'friend' | 'classmate' | 'coworker' | 'mentor' | 'stranger';

/** Static content — authored once, not per-save state. Only the handful of main story NPCs
 *  (e.g. Mum, Jordan, Riley) are expected to populate `personality`/`financialBehavior`/`goals`/
 *  `preferences`; background NPCs can leave all of them undefined. */
export interface NpcDefinition {
  id: string;
  name: string;
  role: NpcRole;
  schedule: NpcScheduleSlot[];
  speedTilesPerMin: number;
  /** Character sheet identifier, matches today's NpcDef.sheet. */
  sheet: string;
  personality?: {
    spender: 'impulsive' | 'cautious' | 'balanced';
    socialWeight: number;
  };
  financialBehavior?: {
    lendsMoney?: boolean;
    asksForMoney?: boolean;
  };
  goals?: string[];
  preferences?: string[];
}

export interface NpcRuntimeState {
  id: string;
  x: number;
  y: number;
  place: PlaceId | 'street';
  targetX: number;
  targetY: number;
  facing: number;
  moving: boolean;
  visible: boolean;
  path: { x: number; y: number }[];
  currentActivity?: string;
  /** Present for every NPC (even background ones) with sensible zeroed defaults, so lookups never
   *  need a null check just because an NPC has no authored personality. */
  relationship: RelationshipState;
  /** Optional — only populated once an NPC needs to "remember" something specific. */
  memory?: {
    lastTalkedAt?: number;
    lastTopics?: string[];
  };
}
