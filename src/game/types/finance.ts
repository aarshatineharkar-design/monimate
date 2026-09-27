/**
 * MoniMate 2.0 — FinancialState: current balances, kept separate from transaction history.
 *
 * The School campaign only ever populates `accounts.cash`, `income.weeklyIncome`/`job`, and a
 * couple of `expenses.recurring` entries — everything else (credit, debt, assets, liabilities,
 * investments) is empty/zero by default and stays that way until a later campaign needs it. No
 * financial CALCULATIONS live here (no interest formulas, no net-worth math) — this file is
 * shapes only; deriving net worth/cash flow from these fields is a future FinanceSystem method.
 */
import type { AccountId, TransactionLedger } from './transaction';

export interface AccountBalances {
  cash: number;
  checking: number;
  savings: number;
  emergencyFund: number;
}

export interface Job {
  id: string;
  name: string;
  location: string;
  payPerHour: number;
  hoursPerWeek: number;
  /** 0 = Monday .. 6 = Sunday, matches the existing lib/financeTypes.ts Job shape. */
  daysAvailable: number[];
}

export interface IncomeState {
  weeklyIncome: number;
  job: Job | null;
  sideIncome: number;
  businessIncome: number;
  investmentIncome: number;
}

export type ExpenseCategory =
  | 'housing' | 'food' | 'transport' | 'entertainment' | 'subscription' | 'insurance' | 'tax' | 'other';

export interface RecurringExpense {
  id: string;
  category: ExpenseCategory;
  name: string;
  amount: number;
  /** How often this recurs, in game days. A one-off "next bill" is just an entry with a large
   *  period and a specific `nextDueAt`, so School's single "phone bill" concept and a future
   *  weekly/monthly bill both fit the same shape. */
  periodDays: number;
  nextDueAt: number;
}

export interface ExpenseState {
  recurring: RecurringExpense[];
}

export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  balance: number;
  /** Annual percentage rate, e.g. 0.199 for 19.9%. */
  apr: number;
}

export interface CreditState {
  /** null = this player has no credit history/score yet (School campaign default). */
  score: number | null;
  cards: CreditCard[];
}

export type LoanKind = 'student' | 'car' | 'personal' | 'other';

export interface Loan {
  id: string;
  kind: LoanKind;
  principal: number;
  apr: number;
  paymentPerPeriod: number;
  periodDays: number;
  nextDueAt: number;
}

export interface DebtState {
  loans: Loan[];
}

export type AssetKind = 'vehicle' | 'property' | 'investment' | 'business';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  value: number;
  acquiredAt: number;
}

export interface AssetState {
  vehicles: Asset[];
  property: Asset[];
  investments: Asset[];
  businesses: Asset[];
}

export interface Liability {
  id: string;
  /** Optional link to the asset this obligation is secured against (e.g. a mortgage's property). */
  linkedAssetId?: string;
  balance: number;
}

export interface LiabilityState {
  items: Liability[];
}

export interface FinancialState {
  accounts: AccountBalances;
  income: IncomeState;
  expenses: ExpenseState;
  credit: CreditState;
  debt: DebtState;
  assets: AssetState;
  liabilities: LiabilityState;
  transactions: TransactionLedger;
  /** Running totals — cheap counters, not derived every read. Mirrors the existing
   *  FinancialState.totalEarned/totalSpent in lib/financeTypes.ts. */
  totals: { totalEarned: number; totalSpent: number };
}

/** Re-exported for convenience so consumers of finance.ts don't also need to import from
 *  transaction.ts just to name an account. */
export type { AccountId };
