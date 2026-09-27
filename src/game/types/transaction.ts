/**
 * MoniMate 2.0 — first-class Transaction model.
 *
 * IMPORTANT design rule this file exists to enforce: a Transaction represents a financial EVENT,
 * not a balance mutation. Applying one is idempotent bookkeeping (append to history + adjust the
 * relevant account), never "add/subtract a number and forget it happened" — that is exactly what
 * the current game's ledger (capped at 400 entries, wiped every Monday) does today, and why the
 * Step 1 audit flagged it as something to eventually replace.
 */

export type AccountId = 'cash' | 'checking' | 'savings' | 'emergencyFund';

/** Controlled category union rather than a free string, so summaries/analytics/mentor code can
 *  exhaustively switch over it instead of guessing at string values. Extend this union, don't
 *  loosen it to `string`, when a new category is genuinely needed. */
export type TransactionCategory =
  | 'income' | 'food' | 'transport' | 'shopping' | 'housing' | 'entertainment'
  | 'subscription' | 'insurance' | 'tax' | 'mission_reward' | 'life_event'
  | 'fee' | 'interest' | 'debt_payment' | 'investment' | 'transfer' | 'refund' | 'gift' | 'other';

/** What KIND of financial event this is, independent of category. A transfer between two of the
 *  player's own accounts and a refund are structurally different from an ordinary income/expense,
 *  even though all four adjust an account balance — keeping `type` separate from `category` lets
 *  code ask "is this money actually leaving the player's control?" without a big string switch. */
export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund' | 'debt_payment' | 'investment';

export interface RelatedEntityRef {
  type: 'mission' | 'npc' | 'place' | 'loan' | 'asset' | 'event';
  id: string;
}

export interface Transaction {
  id: string;
  /** Game-world minute this occurred (TimeState.minutes at the time), not a wall-clock timestamp. */
  timestamp: number;
  account: AccountId;
  /** Signed: negative = money left the account, positive = money arrived. */
  amount: number;
  category: TransactionCategory;
  type: TransactionType;
  /** Short label for HUD/history display, e.g. "Canteen lunch", "Bus fare". */
  description: string;
  /** What caused this — a place id, an NPC id, a mission id, or 'system' for engine-driven
   *  transactions (rent, interest). Optional: not every transaction has a clear external source. */
  source?: string;
  relatedEntity?: RelatedEntityRef;
  /** Narrow, optional escape hatch for category-specific detail (e.g. { itemId, brand } for a shop
   *  purchase) that doesn't deserve its own field on every transaction. Deliberately typed as a
   *  small closed record, not `Record<string, any>` — extend the union as real needs appear. */
  metadata?: TransactionMetadata;
}

export type TransactionMetadata =
  | { kind: 'shop_item'; itemId: string; brand?: string }
  | { kind: 'transfer_pair'; counterpartTransactionId: string }
  | { kind: 'loan_payment'; loanId: string; principalPortion: number; interestPortion: number };

/** Bounded, UI-facing view of recent transactions — mirrors today's capped ledger's PURPOSE
 *  (cheap "what just happened" reads for the HUD), not its lifecycle problem. The permanent
 *  financial record lives in day/week rollups derived from the full transaction stream, exactly
 *  as it does today for DayRecord/WeekRecord — this cap is about UI cost, not data retention. */
export interface TransactionLedger {
  recent: Transaction[];
  /** Soft cap for `recent`; enforced by whatever appends to it (FinanceSystem, later). */
  recentCap: number;
}
