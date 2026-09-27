"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLifePath = exports.LIFE_PATHS = void 0;
exports.makeInitialFinance = makeInitialFinance;
exports.LIFE_PATHS = [
    {
        id: 'school', name: 'School Student', emoji: '🧑‍🎓',
        tagline: 'Learn the basics — every dollar counts',
        description: 'You get a weekly allowance and have to manage your spending. Simple goals, big lessons.',
        // $0 on purpose: the "Make It to Friday" mission chain hands you $35 Monday morning, and that
        // IS your week's budget (Rule: the player should not have unlimited money). No passive income
        // tops it up mid-week either — the 'allowance' job id is explicitly excluded from Thursday payday.
        startingBalance: 0, weeklyIncome: 35, rentAmount: 0, debt: 0,
        startingJob: { id: 'allowance', name: 'Weekly Allowance', location: 'home', payPerHour: 0, hoursPerWeek: 0, daysAvailable: [4] },
        goals: [
            { id: 'save500', name: 'Save $500', target: 500, saved: 0 },
            { id: 'school_supplies', name: 'School Supplies', target: 80, saved: 0 },
        ],
        levelNames: ['Money Basics', 'Saving Up', 'Budgeting', 'Bigger Goals'],
        color: '#60b8ff',
    },
    {
        id: 'university', name: 'University Student', emoji: '🎓',
        tagline: 'Rent, study, survive — no job yet',
        description: 'You have a student loan and rent to pay. Find work fast, manage your budget, build independence.',
        startingBalance: 1200, weeklyIncome: 0, rentAmount: 200, debt: 15000,
        startingJob: null,
        goals: [
            { id: 'emergency', name: 'Emergency Fund $1,000', target: 1000, saved: 0 },
            { id: 'laptop', name: 'New Laptop $1,200', target: 1200, saved: 0 },
        ],
        levelNames: ['Money Basics', 'Student Budget', 'Independence', 'Financial Challenges'],
        color: '#ffd700',
    },
    {
        id: 'international', name: 'International Student', emoji: '🌎',
        tagline: 'New country, new costs, new challenges',
        description: 'You arrived with savings but face high setup costs, limited work rights, and currency conversions.',
        startingBalance: 3000, weeklyIncome: 0, rentAmount: 280, debt: 0,
        startingJob: null,
        goals: [
            { id: 'setup', name: 'Setup Costs $500', target: 500, saved: 0 },
            { id: 'emergency_int', name: 'Emergency Fund $2,000', target: 2000, saved: 0 },
        ],
        levelNames: ['Setup & Arrival', 'Living Costs', 'Work & Study', 'Advanced Challenges'],
        color: '#ffa657',
    },
    {
        id: 'working', name: 'Working Person', emoji: '💼',
        tagline: 'Good income, bigger responsibilities',
        description: 'You earn a salary but have a car loan and rent. Build wealth, manage debt, plan your future.',
        startingBalance: 2500, weeklyIncome: 800, rentAmount: 350, debt: 25000,
        startingJob: { id: 'office_job', name: 'Office Manager', location: 'office', payPerHour: 28, hoursPerWeek: 40, daysAvailable: [0, 1, 2, 3, 4] },
        goals: [
            { id: 'car_loan', name: 'Pay Car Loan', target: 25000, saved: 0 },
            { id: 'invest', name: 'Investment Fund $10,000', target: 10000, saved: 0 },
        ],
        levelNames: ['Income Management', 'Budgeting Pro', 'Debt & Major Purchases', 'Long-Term Planning'],
        color: '#3fb950',
    },
];
function makeInitialFinance(path) {
    return {
        balance: path.startingBalance, savings: 0, emergencyFund: 0, debt: path.debt,
        weeklyIncome: path.weeklyIncome, job: path.startingJob,
        weeklyExpenses: [], monthlyExpenses: [],
        rentDueInDays: path.rentAmount > 0 ? 7 : 999, rentAmount: path.rentAmount,
        nextBillAmount: 40, nextBillName: 'Phone bill', nextBillDueInDays: 5,
        goals: path.goals.map(g => ({ ...g })),
        totalEarned: 0, totalSpent: 0,
    };
}
const getLifePath = (id) => exports.LIFE_PATHS.find(p => p.id === id);
exports.getLifePath = getLifePath;
