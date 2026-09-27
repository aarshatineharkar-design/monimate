"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLifePath = exports.LIFE_PATHS = void 0;
exports.makeInitialFinance = makeInitialFinance;
exports.makeInitialGoals = makeInitialGoals;
const clock_1 = require("./clock");
exports.LIFE_PATHS = [
    {
        id: 'school', name: 'School Student', emoji: '🧑‍🎓',
        tagline: 'Learn the basics — every dollar counts',
        description: 'You get a weekly allowance and have to manage your spending. Simple goals, big lessons.',
        // $0 on purpose: the "Make It to Friday" mission chain hands you $35 Monday morning, and that
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
        description: 'You have a student loan and rent to pay. Find work fast, manage your budget, build independence.',
        startingBalance: 1200, weeklyIncome: 0, rentAmount: 200, debt: 15000,
        startingJob: null,
        goals: [
            { id: 'emergency', name: 'Emergency Fund $1,000', target: 1000 },
            { id: 'laptop', name: 'New Laptop $1,200', target: 1200 },
        ],
        levelNames: ['Money Basics', 'Student Budget', 'Independence', 'Financial Challenges'],
        color: '#ffd700', available: false,
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
function makeInitialFinance(path) {
    const recurring = [];
    if (path.rentAmount > 0) {
        recurring.push({ id: 'rent', category: 'housing', name: 'Rent', amount: path.rentAmount, periodDays: 7, nextDueAt: 7 * clock_1.MIN_PER_DAY + 9 * 60 });
    }
    if (path.id !== 'school') {
        recurring.push({ id: 'phone', category: 'subscription', name: 'Phone bill', amount: 40, periodDays: 30, nextDueAt: 4 * clock_1.MIN_PER_DAY + 9 * 60 });
    }
    const loans = path.debt > 0
        ? [{ id: 'starting_debt', kind: path.id === 'working' ? 'car' : 'student', principal: path.debt, apr: path.id === 'working' ? 0.089 : 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: 30 * clock_1.MIN_PER_DAY }]
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
function makeInitialGoals(path) {
    return { active: path.goals.map(g => ({ id: g.id, kind: 'financial', name: g.name, target: g.target, saved: 0 })), completed: [] };
}
const getLifePath = (id) => exports.LIFE_PATHS.find(p => p.id === id);
exports.getLifePath = getLifePath;
