/**
 * MoniMate 2.0 — typed domain-event union.
 *
 * This is types only — NOT an event bus. No dispatcher, no subscriber registry, no async
 * delivery is implemented or implied here. The existing game already has a working, sufficient
 * mechanism for this (src/lib/types.ts's `GameEvent` union + GameStore's synchronous
 * `emit`/`onEvent` listener set), and the Step 2 design review concluded a heavier event bus
 * would be premature: every current cross-system reaction is same-frame and synchronous, and the
 * systems involved are a small fixed set, not an open plugin surface. So this union exists purely
 * as a typed vocabulary for the future systems to agree on, to be carried by whatever mechanism
 * (most likely a generalized version of today's GameEvent/emit) is wired up when systems are
 * actually implemented.
 */
import type { AccountId, TransactionCategory, TransactionType } from './transaction';

export interface TimeAdvanced { type: 'time_advanced'; minutes: number }

export interface TransactionRecorded {
  type: 'transaction_recorded';
  transactionId: string;
  account: AccountId;
  amount: number;
  category: TransactionCategory;
  transactionType: TransactionType;
}

export interface MissionStarted { type: 'mission_started'; missionId: string }
export interface MissionCompleted { type: 'mission_completed'; missionId: string; outcome: string }
export interface MissionExpired { type: 'mission_expired'; missionId: string }

export interface NpcInteraction { type: 'npc_interaction'; npcId: string }

export interface GoalCompleted { type: 'goal_completed'; goalId: string }

export type DomainEvent =
  | TimeAdvanced
  | TransactionRecorded
  | MissionStarted
  | MissionCompleted
  | MissionExpired
  | NpcInteraction
  | GoalCompleted;
