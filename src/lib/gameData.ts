/**
 * MoniMate — life-path configs (starting money, goals, jobs) used to seed a new GameStore.
 * Builds the src/game FinancialState/GoalState directly, so a new game starts in the one engine.
 */
import type { FinancialState, Job, RecurringExpense, Loan } from '../game/types/finance';
import type { GoalState } from '../game/types/goal';
import { MIN_PER_DAY } from './clock';

/** The goals a School Week player can pick on Monday (blueprint section 24). The Sunday recap
 *  judges the one they picked; GameStore.goalStatus() tracks progress. */
export interface WeekGoalDef {
  id: string;
  emoji: string;
  name: string;
  /** financial goals show a $x / $target bar */
  target?: number;
}
export const WEEK_GOALS: WeekGoalDef[] = [
  { id: 'save_event', emoji: '🎟️', name: 'Go to the school fair', target: 10 },
  { id: 'arcade', emoji: '🕹️', name: 'Hit the arcade with Jordan' },
  { id: 'buy_headphones', emoji: '🎧', name: 'Buy the $15 headphones', target: 15 },
  { id: 'friends', emoji: '🤝', name: 'Be there for your friends' },
];
/** University Week 1 goals (picked from the phone on Monday, judged by the Sunday call with Mum). */
export const UNI_WEEK_GOALS: WeekGoalDef[] = [
  { id: 'uni_buffer', emoji: '🛟', name: 'Save a $150 safety buffer', target: 150 },
  { id: 'uni_job', emoji: '💼', name: 'Land a part-time job' },
  { id: 'uni_ready', emoji: '📚', name: 'Nail your first assignment' },
  { id: 'uni_social', emoji: '🤝', name: 'Make friends in week one' },
];
const ALL_WEEK_GOALS = [...WEEK_GOALS, ...UNI_WEEK_GOALS];
export const getWeekGoal = (id: string) => ALL_WEEK_GOALS.find(g => g.id === id);

/** A savings target as authored in a life-path config. */
export interface GoalSeed { id: string; name: string; target: number }

export type LifePath = 'school' | 'university' | 'international' | 'working';

export interface LifePathConfig {
  id: LifePath;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  startingBalance: number;
  weeklyIncome: number;
  rentAmount: number;
  debt: number;
  goals: GoalSeed[];
  startingJob: Job | null;
  levelNames: string[];
  color: string;
  /** false = shown on the path-select screen as "Coming soon" (no missions written yet). */
  available: boolean;
}

export const LIFE_PATHS: LifePathConfig[] = [
  {
    id: 'school', name: 'School Student', emoji: '🧑‍🎓',
    tagline: 'Learn the basics — every dollar counts',
    description: 'You get a weekly allowance and have to manage your spending. Simple goals, big lessons.',
    // $0 on purpose: Mum's Monday-morning message hands you $20, and that
    // IS your week's budget (Rule: the player should not have unlimited money). No passive income
    // tops it up mid-week either — the 'allowance' job id is explicitly excluded from Thursday payday.
    startingBalance: 0, weeklyIncome: 0, rentAmount: 0, debt: 0,
    startingJob: null,
    goals: [
      // Pack 2 replaces this with the goal the player picks on Monday morning.
    ],
    levelNames: ['Money Basics', 'Saving Up', 'Budgeting', 'Bigger Goals'],
    color: '#60b8ff', available: true,
  },
  {
    id: 'university', name: 'University Student', emoji: '🎓',
    tagline: 'Rent, study, survive — no job yet',
    description: 'First week flatting in Hamilton: StudyLink, rent, a textbook you can\'t afford and a job to find.',
    // $180 left over from a summer job. StudyLink's $316 living-costs payment lands Monday morning,
    // and week one's $200 rent is a decision (see uni_rent) — from week two it's charged automatically.
    startingBalance: 180, weeklyIncome: 0, rentAmount: 200, debt: 15000,
    startingJob: null,
    goals: [
      // Replaced by the goal the player picks on Monday morning (UNI_WEEK_GOALS).
    ],
    levelNames: ['First Week', 'Student Budget', 'Independence', 'Financial Challenges'],
    color: '#ffd700', available: true,
  },
  {
    id: 'international', name: 'International Student', emoji: '🌎',
    tagline: 'New country, new costs, new challenges',
    description: 'You arrived with savings but face high setup costs, limited work rights, and currency conversions.',
    startingBalance: 3000, weeklyIncome: 0, rentAmount: 280, debt: 0,
    startingJob: null,
    goals: [
      { id: 'setup', name: 'Setup Costs $500', target: 500 },
      { id: 'emergency_int', name: 'Emergency Fund $2,000', target: 2000 },
    ],
    levelNames: ['Setup & Arrival', 'Living Costs', 'Work & Study', 'Advanced Challenges'],
    color: '#ffa657', available: false,
  },
  {
    id: 'working', name: 'Working Person', emoji: '💼',
    tagline: 'Good income, bigger responsibilities',
    description: 'You earn a salary but have a car loan and rent. Build wealth, manage debt, plan your future.',
    startingBalance: 2500, weeklyIncome: 800, rentAmount: 350, debt: 25000,
    startingJob: { id: 'office_job', name: 'Office Manager', location: 'office', payPerHour: 28, hoursPerWeek: 40, daysAvailable: [0, 1, 2, 3, 4] },
    goals: [
      { id: 'car_loan', name: 'Pay Car Loan', target: 25000 },
      { id: 'invest', name: 'Investment Fund $10,000', target: 10000 },
    ],
    levelNames: ['Income Management', 'Budgeting Pro', 'Debt & Major Purchases', 'Long-Term Planning'],
    color: '#3fb950', available: false,
  },
];

/** A fresh FinancialState for this life path. */
export function makeInitialFinance(path: LifePathConfig): FinancialState {
  const recurring: RecurringExpense[] = [];
  // University rent is a weekly decision (the uni_rent mission), not an automatic debit.
  if (path.rentAmount > 0 && path.id !== 'university') {
    recurring.push({ id: 'rent', category: 'housing', name: 'Rent', amount: path.rentAmount, periodDays: 7, nextDueAt: 7 * MIN_PER_DAY + 9 * 60 });
  }
  if (path.id !== 'school') {
    recurring.push({ id: 'phone', category: 'subscription', name: 'Phone bill', amount: 40, periodDays: 30, nextDueAt: 4 * MIN_PER_DAY + 9 * 60 });
  }
  const loans: Loan[] = path.debt > 0
    ? [{ id: 'starting_debt', kind: path.id === 'working' ? 'car' : 'student', principal: path.debt, apr: path.id === 'working' ? 0.089 : 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: 30 * MIN_PER_DAY }]
    : [];
  return {
    accounts: { cash: path.startingBalance, checking: 0, savings: 0, emergencyFund: 0 },
    income: { weeklyIncome: path.weeklyIncome, job: path.startingJob, sideIncome: 0, businessIncome: 0, investmentIncome: 0 },
    expenses: { recurring },
    credit: { score: null, cards: [] },
    debt: { loans },
    assets: { vehicles: [], property: [], investments: [], businesses: [] },
    liabilities: { items: [] },
    // Keeps several weeks of history; day/week summaries and the phone filter it by time.
    transactions: { recent: [], recentCap: 2000 },
    totals: { totalEarned: 0, totalSpent: 0 },
  };
}

export function makeInitialGoals(path: LifePathConfig): GoalState {
  return { active: path.goals.map(g => ({ id: g.id, kind: 'financial' as const, name: g.name, target: g.target, saved: 0 })), completed: [] };
}

export const getLifePath = (id: LifePath) => LIFE_PATHS.find(p => p.id === id)!;
