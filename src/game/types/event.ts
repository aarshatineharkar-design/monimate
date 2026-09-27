/**
 * MoniMate 2.0 — EventState: container for the future generic event engine.
 * Engine behavior (rolling, selecting, resolving) is NOT implemented here — shapes only.
 * Generalizes today's single-purpose lib/lifeEvents.ts LifeEventDef/LifeEventChoice into a shape
 * that can also cover scheduled/conditional/NPC-driven/financial/world events without inventing
 * a separate type per event kind.
 */
import type { TransactionType, TransactionCategory, AccountId } from './transaction';

export type EventKind = 'random' | 'scheduled' | 'conditional' | 'npc' | 'financial' | 'world';

export interface EventConsequenceTransaction {
  account: AccountId;
  amount: number;
  category: TransactionCategory;
  type: TransactionType;
  description: string;
}

export interface EventConsequence {
  transaction?: EventConsequenceTransaction;
  relationshipDelta?: { npcId: string; delta: number };
  flags?: string[];
  message: string;
}

export interface EventChoice {
  id: string;
  label: string;
  consequence: EventConsequence;
}

/** An event waiting on the player right now. */
export interface PendingEvent {
  id: string;
  kind: EventKind;
  emoji: string;
  text: string;
  choices: EventChoice[];
}

export interface EventHistoryEntry {
  id: string;
  at: number;
  chosenId: string;
}

export interface EventState {
  pending: PendingEvent | null;
  /** Short, capped record of recently resolved events — not the permanent financial record
   *  (that's Transaction history); this is just enough for "don't repeat the same event twice in
   *  a row" gating and light context for future dialogue/mentor flavor. */
  recentHistory: EventHistoryEntry[];
}
