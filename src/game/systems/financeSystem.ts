/**
 * MoniMate 2.0 — FinanceSystem (Step 3 implementation).
 *
 * Owns FinancialState and is the ONLY place account balances change. Every balance change is
 * recorded as a Transaction (Step 2's type, imported unchanged, not duplicated) — there is no
 * method on this class that mutates `accounts` without also appending to `transactions.recent`.
 *
 * Finance is a consequence system here, not an activity: nothing in this file initiates a
 * transaction on its own — it only ever responds to `recordTransaction()` being called by
 * something else (ActivitySystem, later MissionSystem/EventSystem).
 *
 * School-life scope only: cash/checking/savings/emergencyFund accounts, no credit/loans/
 * investments — those fields already exist on FinancialState (Step 2) as empty defaults and are
 * untouched by this system.
 */
import type { FinancialState } from '../types/finance';
import type { AccountId, Transaction, TransactionCategory, TransactionType, RelatedEntityRef, TransactionMetadata } from '../types/transaction';

const VALID_ACCOUNTS: readonly AccountId[] = ['cash', 'checking', 'savings', 'emergencyFund'];

let fallbackCounter = 0;
/** crypto.randomUUID is available in every environment this runs in (Node 19+, browsers, edge);
 *  the counter fallback exists only so this never throws in an unusual runtime. */
function generateTransactionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  fallbackCounter += 1;
  return `tx_${Date.now()}_${fallbackCounter}`;
}

export interface RecordTransactionInput {
  account: AccountId;
  /** Signed: negative = expense, positive = income. Never 0 — see recordTransaction(). */
  amount: number;
  category: TransactionCategory;
  type: TransactionType;
  description: string;
  source?: string;
  relatedEntity?: RelatedEntityRef;
  metadata?: TransactionMetadata;
}

export class FinanceSystem {
  /**
   * @param onRecorded optional listener called after every successful transaction. The live
   *   GameStore uses it to keep day totals, events and achievements in step with the ledger, so
   *   every money change — shop, bus, mission, activity — flows through this one pipeline.
   */
  constructor(
    private readonly finance: FinancialState,
    private readonly onRecorded?: (tx: Transaction) => void,
  ) {}

  getFinancialState(): FinancialState {
    return this.finance;
  }

  getBalance(account: AccountId): number {
    this.assertValidAccount(account);
    return this.finance.accounts[account];
  }

  /** Would a withdrawal of `amount` from `account` succeed right now, without spending anything?
   *  `amount` should be given as a positive number (the amount you'd need available), not signed. */
  canAfford(account: AccountId, amount: number): boolean {
    this.assertValidAccount(account);
    if (!Number.isFinite(amount) || amount <= 0) return true; // nothing to afford
    return this.finance.accounts[account] >= amount;
  }

  /**
   * Records a transaction and applies its effect to the account in one step — this IS the only
   * way an account balance changes. Throws (does not silently fail, does not clamp, does not
   * create a transaction anyway) when:
   *  - the account id is invalid
   *  - amount is 0, NaN, or non-finite (a transaction that changes nothing isn't a real event)
   *  - the withdrawal would take the account negative
   */
  recordTransaction(input: RecordTransactionInput, now: number): Transaction {
    this.assertValidAccount(input.account);
    if (!Number.isFinite(input.amount) || input.amount === 0) {
      throw new Error(
        `FinanceSystem.recordTransaction: amount must be a non-zero finite number, got ${input.amount}`,
      );
    }
    if (!Number.isFinite(now) || now < 0) {
      throw new Error(`FinanceSystem.recordTransaction: invalid timestamp ${now}`);
    }
    const projectedBalance = this.finance.accounts[input.account] + input.amount;
    if (projectedBalance < 0) {
      throw new Error(
        `FinanceSystem.recordTransaction: insufficient funds in ${input.account} ` +
          `(have ${this.finance.accounts[input.account]}, this would take it to ${projectedBalance})`,
      );
    }

    const tx: Transaction = {
      id: generateTransactionId(),
      timestamp: now,
      account: input.account,
      amount: input.amount,
      category: input.category,
      type: input.type,
      description: input.description,
      source: input.source,
      relatedEntity: input.relatedEntity,
      metadata: input.metadata,
    };

    this.finance.accounts[input.account] = projectedBalance;
    if (input.amount > 0) this.finance.totals.totalEarned += input.amount;
    else this.finance.totals.totalSpent += -input.amount;

    this.finance.transactions.recent.push(tx);
    if (this.finance.transactions.recent.length > this.finance.transactions.recentCap) {
      this.finance.transactions.recent.shift();
    }
    this.onRecorded?.(tx);
    return tx;
  }

  /** Moves money between two of the player's own accounts as a pair of linked transactions
   *  (withdrawal + deposit), rather than a silent balance edit — so a transfer shows up in
   *  history exactly like any other financial event. Fails atomically: if the source account
   *  can't cover it, NEITHER transaction is created. */
  transfer(from: AccountId, to: AccountId, amount: number, now: number, description = 'Transfer'): { out: Transaction; in: Transaction } {
    this.assertValidAccount(from);
    this.assertValidAccount(to);
    if (from === to) {
      throw new Error('FinanceSystem.transfer: from and to accounts must be different');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`FinanceSystem.transfer: amount must be a positive finite number, got ${amount}`);
    }
    if (!this.canAfford(from, amount)) {
      throw new Error(`FinanceSystem.transfer: insufficient funds in ${from} to transfer ${amount}`);
    }
    const out = this.recordTransaction(
      { account: from, amount: -amount, category: 'transfer', type: 'transfer', description },
      now,
    );
    const inTx = this.recordTransaction(
      {
        account: to, amount, category: 'transfer', type: 'transfer', description,
        metadata: { kind: 'transfer_pair', counterpartTransactionId: out.id },
      },
      now,
    );
    return { out, in: inTx };
  }

  private assertValidAccount(account: string): asserts account is AccountId {
    if (!VALID_ACCOUNTS.includes(account as AccountId)) {
      throw new Error(`FinanceSystem: invalid account id "${account}"`);
    }
  }
}
