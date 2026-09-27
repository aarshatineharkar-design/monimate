/**
 * MoniMate — save upgrades. Every save stores `version`; each bump gets one function here that
 * turns the previous shape into the next, so a player's progress survives engine changes.
 *
 *   v2 → v3  Money moved to the src/game FinancialState (accounts + transaction ledger), energy to
 *            EnergyState, goals to GoalState. The old capped `ledger` becomes real transactions.
 */
import type { GameState } from './types';
import type { FinancialState, RecurringExpense, Loan } from '../game/types/finance';
import type { Transaction, TransactionCategory } from '../game/types/transaction';
import { MIN_PER_DAY } from './clock';

/** Old free-text ledger categories → the controlled TransactionCategory union. */
const V2_CATEGORY: Record<string, TransactionCategory> = {
  shop: 'shopping', mission: 'other', rent: 'housing', transport: 'transport',
  income: 'income', reward: 'mission_reward', life_event: 'life_event',
};

interface V2Finance {
  balance: number; savings: number; emergencyFund: number; debt: number; weeklyIncome: number;
  job: FinancialState['income']['job'];
  rentDueInDays: number; rentAmount: number;
  nextBillAmount: number; nextBillName: string; nextBillDueInDays: number;
  goals: { id: string; name: string; target: number; saved: number }[];
  totalEarned: number; totalSpent: number;
}
interface V2Save extends Omit<GameState, 'version' | 'finance' | 'goals' | 'energy'> {
  version: 2;
  finance: V2Finance;
  energy?: { current: number; max: number };
  ledger?: { minutes: number; amount: number; category: string; label: string }[];
}

function migrateV2(old: V2Save): GameState {
  const f = old.finance;
  const now = old.minutes;
  const recurring: RecurringExpense[] = [];
  if (f.rentAmount > 0) {
    recurring.push({ id: 'rent', category: 'housing', name: 'Rent', amount: f.rentAmount, periodDays: 7, nextDueAt: now + Math.max(1, f.rentDueInDays) * MIN_PER_DAY });
  }
  if (old.lifePath !== 'school' && f.nextBillAmount > 0) {
    recurring.push({ id: 'phone', category: 'subscription', name: f.nextBillName, amount: f.nextBillAmount, periodDays: 30, nextDueAt: now + Math.max(1, f.nextBillDueInDays) * MIN_PER_DAY });
  }
  const loans: Loan[] = f.debt > 0
    ? [{ id: 'starting_debt', kind: 'other', principal: f.debt, apr: 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: now + 30 * MIN_PER_DAY }]
    : [];
  const recent: Transaction[] = (old.ledger ?? []).map((e, i) => ({
    id: `v2_${i}_${e.minutes}`,
    timestamp: e.minutes,
    account: 'cash',
    amount: e.amount,
    category: V2_CATEGORY[e.category] ?? 'other',
    type: e.amount >= 0 ? 'income' : 'expense',
    description: e.label,
  }));
  const { ledger: _ledger, ...rest } = old;
  void _ledger;
  return {
    ...rest,
    version: 3,
    finance: {
      accounts: { cash: Math.max(0, f.balance), checking: 0, savings: f.savings, emergencyFund: f.emergencyFund },
      income: { weeklyIncome: f.weeklyIncome, job: f.job && f.job.id !== 'allowance' ? f.job : null, sideIncome: 0, businessIncome: 0, investmentIncome: 0 },
      expenses: { recurring },
      credit: { score: null, cards: [] },
      debt: { loans },
      assets: { vehicles: [], property: [], investments: [], businesses: [] },
      liabilities: { items: [] },
      transactions: { recent, recentCap: 2000 },
      totals: { totalEarned: f.totalEarned, totalSpent: f.totalSpent },
    },
    goals: {
      active: f.goals.filter(g => g.id !== 'save500' && g.id !== 'school_supplies')
        .map(g => ({ id: g.id, kind: 'financial' as const, name: g.name, target: g.target, saved: g.saved })),
      completed: [],
    },
    energy: { current: old.energy?.current ?? 100, max: old.energy?.max ?? 100, recoveryPerHourAsleep: 12.5 },
    currentActivity: old.currentActivity ?? null,
  };
}

/** Upgrade any supported save to the current version. Returns null for saves too old or corrupt. */
export function migrateSave(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = (raw as { version?: number }).version;
  if (v === 3) return raw as GameState;
  if (v === 2) return migrateV2(raw as V2Save);
  return null;
}
