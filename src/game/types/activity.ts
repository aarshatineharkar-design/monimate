/**
 * MoniMate 2.0 — Activity: the player-chosen counterpart to Mission (the world-driven counterpart,
 * unchanged in `mission.ts`). This is the type the Step 2B audit flagged as missing — Mission had
 * a full definition-side model already (via the existing engine); Activity had none.
 *
 * Deliberately NOT modeled after MissionDef's window/trigger/expiry machinery — an Activity has no
 * schedule, no trigger, no availability window; the player just chooses it. Its "consequences" ARE
 * its time/energy/financial cost fields — there's no separate `consequences` field duplicating
 * them under another name, per the audit's "do not overdesign" instruction.
 *
 * No runtime array of these lives in GameState: an ActivityDef is static content (like MissionDef),
 * and executing one produces a transient ActivityResult, not persisted state — so no GameState
 * modification was needed to add Activities.
 */
import type { PlaceId } from './world';
import type { AccountId, TransactionCategory, TransactionType, Transaction } from './transaction';

export type ActivityCategory =
  | 'travel' | 'food' | 'study' | 'work' | 'chore' | 'social' | 'rest' | 'exercise' | 'exploration' | 'other';

/** The money side of an activity, if it has one. Shape mirrors Transaction minus the fields the
 *  system fills in at execution time (id, timestamp) — see FinanceSystem.recordTransaction. */
export interface ActivityFinancialEffect {
  account: AccountId;
  /** Signed: negative = the activity costs money, positive = the activity earns money. */
  amount: number;
  category: TransactionCategory;
  type: TransactionType;
  source?: string;
  description: string;
}

/** Minimal, structural requirement check — NOT a predicate-function like MissionDef.requires.
 *  A function would let content express anything, but nothing in this step needs more than "must
 *  be at a specific place" and "must have at least this much energy before starting" — richer
 *  requirements can be added when an activity actually needs them. */
export interface ActivityRequirement {
  place?: PlaceId;
  /** Energy required to even attempt this, if different from (e.g. higher than) `energyCost`.
   *  Most activities can omit this — `energyCost` alone is both the requirement and the cost. */
  minEnergy?: number;
}

export interface ActivityDef {
  id: string;
  name: string;
  category: ActivityCategory;
  timeCostMinutes: number;
  /** 0 = no energy cost. Always >= 0 here — restorative activities (sleep/rest) are out of scope
   *  for this step ("provide the foundation", not the full sleep system) and go through
   *  EnergySystem.restore() directly rather than through ActivityDef, for now. */
  energyCost: number;
  /** Absent = no money involved (e.g. walking). */
  financialEffect?: ActivityFinancialEffect;
  requirement?: ActivityRequirement;
  /** If set, executing this activity also moves the player here (e.g. a future "walk to school"
   *  activity that both takes time AND ends somewhere new). None of Step 3's four examples use
   *  this, but PlayerSystem needs a clean way to be called for it — see ActivitySystem.execute. */
  movesPlayerTo?: PlaceId;
}

export type ActivityFailureReason = 'requirement_not_met' | 'insufficient_energy' | 'insufficient_funds';

export type ActivityResult =
  | {
      success: true;
      activityId: string;
      timeAdvancedMinutes: number;
      energyConsumed: number;
      /** null when the activity had no `financialEffect` (e.g. walking) — no fake/empty
       *  transaction is ever created for a moneyless activity. */
      transaction: Transaction | null;
    }
  | {
      success: false;
      activityId: string;
      reason: ActivityFailureReason;
      message: string;
    };
