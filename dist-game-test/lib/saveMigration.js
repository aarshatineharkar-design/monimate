"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateSave = migrateSave;
const clock_1 = require("./clock");
/** Old free-text ledger categories → the controlled TransactionCategory union. */
const V2_CATEGORY = {
    shop: 'shopping', mission: 'other', rent: 'housing', transport: 'transport',
    income: 'income', reward: 'mission_reward', life_event: 'life_event',
};
function migrateV2(old) {
    const f = old.finance;
    const now = old.minutes;
    const recurring = [];
    if (f.rentAmount > 0) {
        recurring.push({ id: 'rent', category: 'housing', name: 'Rent', amount: f.rentAmount, periodDays: 7, nextDueAt: now + Math.max(1, f.rentDueInDays) * clock_1.MIN_PER_DAY });
    }
    if (old.lifePath !== 'school' && f.nextBillAmount > 0) {
        recurring.push({ id: 'phone', category: 'subscription', name: f.nextBillName, amount: f.nextBillAmount, periodDays: 30, nextDueAt: now + Math.max(1, f.nextBillDueInDays) * clock_1.MIN_PER_DAY });
    }
    const loans = f.debt > 0
        ? [{ id: 'starting_debt', kind: 'other', principal: f.debt, apr: 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: now + 30 * clock_1.MIN_PER_DAY }]
        : [];
    const recent = (old.ledger ?? []).map((e, i) => ({
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
                .map(g => ({ id: g.id, kind: 'financial', name: g.name, target: g.target, saved: g.saved })),
            completed: [],
        },
        energy: { current: old.energy?.current ?? 100, max: old.energy?.max ?? 100, recoveryPerHourAsleep: 12.5 },
        currentActivity: old.currentActivity ?? null,
    };
}
/** Upgrade any supported save to the current version. Returns null for saves too old or corrupt. */
function migrateSave(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const v = raw.version;
    if (v === 3)
        return raw;
    if (v === 2)
        return migrateV2(raw);
    return null;
}
