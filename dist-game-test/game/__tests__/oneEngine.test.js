"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate — Pack 1 "one engine": the live game runs on src/game's FinanceSystem, EnergySystem and
 * ActivitySystem directly. These tests pin the rules that come with that.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const saveMigration_1 = require("../../lib/saveMigration");
const clock_1 = require("../../lib/clock");
const SCHOOL = (0, gameData_1.getLifePath)('school');
const newGame = () => new store_1.GameStore((0, store_1.createInitialState)('school', (0, gameData_1.makeInitialFinance)(SCHOOL), (0, gameData_1.makeInitialGoals)(SCHOOL)));
(0, node_test_1.default)('One engine: money never goes negative — an unaffordable spend changes nothing', () => {
    const store = newGame(); // $0 before Mum's message
    strict_1.default.equal(store.spend(5, 'food', 'Chips'), false);
    strict_1.default.equal(store.cash, 0);
    strict_1.default.equal(store.state.finance.transactions.recent.length, 0);
});
(0, node_test_1.default)('One engine: every spend is a Transaction with category, reason, source and time', () => {
    const store = newGame();
    store.earn(20, 'income', 'Pocket money', 'mum');
    strict_1.default.equal(store.spend(3.5, 'food', 'Milk', 'supermarket'), true);
    const tx = store.state.finance.transactions.recent.at(-1);
    strict_1.default.deepEqual({ amount: tx.amount, category: tx.category, type: tx.type, description: tx.description, source: tx.source, account: tx.account, timestamp: tx.timestamp }, { amount: -3.5, category: 'food', type: 'expense', description: 'Milk', source: 'supermarket', account: 'cash', timestamp: store.state.minutes });
    strict_1.default.equal(store.state.today.spent, 3.5);
    strict_1.default.equal(store.state.today.earned, 20);
});
(0, node_test_1.default)('One engine: a mission choice files its money under the right category', () => {
    const store = newGame();
    const pm = store.actionableStep();
    store.applyChoice(pm.def.id, pm.step.choices[0]);
    const tx = store.state.finance.transactions.recent.at(-1);
    strict_1.default.equal(tx.category, 'income');
    strict_1.default.equal(tx.source, 'mum');
    strict_1.default.equal(tx.description, 'Thanks Mum!');
});
(0, node_test_1.default)('One engine: an unaffordable dialogue choice is refused, not applied', () => {
    const store = newGame(); // $0
    const rt = store.runtime('friend_birthday');
    rt.state = 'active';
    const full = store.def('friend_birthday').steps[0].choices.find(c => c.id === 'full');
    strict_1.default.equal(store.applyChoice('friend_birthday', full), false);
    strict_1.default.equal(rt.state, 'active');
    strict_1.default.equal(store.state.world.relationships.Riley, 1);
});
(0, node_test_1.default)('Piggy bank: moving money to savings is a linked pair of transfers, not spending', () => {
    const store = newGame();
    store.earn(20, 'income', 'Pocket money');
    strict_1.default.equal(store.moveToSavings(8), true);
    strict_1.default.equal(store.cash, 12);
    strict_1.default.equal(store.state.finance.accounts.savings, 8);
    strict_1.default.equal(store.state.today.spent, 0, 'saving is not spending');
    const [out, inn] = store.state.finance.transactions.recent.slice(-2);
    strict_1.default.equal(out.type, 'transfer');
    strict_1.default.equal(inn.metadata?.kind === 'transfer_pair' && inn.metadata.counterpartTransactionId, out.id);
    strict_1.default.equal(store.moveToSavings(100), false, "can't save money you don't have");
    strict_1.default.equal(store.takeFromSavings(3), true);
    strict_1.default.equal(store.cash, 15);
});
(0, node_test_1.default)('Bills: rent is paid from cash when due; an unpaid bill becomes money owed, with a notice', () => {
    const working = (0, gameData_1.getLifePath)('working');
    const store = new store_1.GameStore((0, store_1.createInitialState)('working', (0, gameData_1.makeInitialFinance)(working), (0, gameData_1.makeInitialGoals)(working)));
    // Working path: $2,500 cash, $350 rent due next Monday 9 AM.
    store.advance((0, clock_1.at)(7, 9, 1) - store.state.minutes);
    strict_1.default.ok(store.state.finance.transactions.recent.some(t => t.description === 'Rent' && t.amount === -350));
    // After Thursday's pay has landed, empty the account, then let the next rent fall due.
    store.advance((0, clock_1.at)(13, 12, 0) - store.state.minutes);
    strict_1.default.ok(store.state.finance.transactions.recent.some(t => t.description === 'Office Manager pay'));
    store.spend(store.cash, 'other', 'test drain');
    store.advance((0, clock_1.at)(14, 9, 1) - store.state.minutes);
    const arrears = store.state.finance.debt.loans.find(l => l.id === 'arrears');
    strict_1.default.ok(arrears && arrears.principal >= 350, 'unpaid rent should be owed, not ignored');
    strict_1.default.ok(store.takeNotices().some(n => n.includes("Couldn't pay Rent")));
});
(0, node_test_1.default)('Save upgrade: a version-2 save loads, keeping money, savings, history and progress', () => {
    const fresh = newGame();
    const v2 = {
        ...JSON.parse(fresh.serialize()),
        version: 2,
        finance: {
            balance: 23.5, savings: 4, emergencyFund: 0, debt: 0, weeklyIncome: 35,
            job: { id: 'allowance', name: 'Weekly Allowance', location: 'home', payPerHour: 0, hoursPerWeek: 0, daysAvailable: [4] },
            weeklyExpenses: [], monthlyExpenses: [], rentDueInDays: 999, rentAmount: 0,
            nextBillAmount: 40, nextBillName: 'Phone bill', nextBillDueInDays: 5,
            goals: [{ id: 'save500', name: 'Save $500', target: 500, saved: 0 }],
            totalEarned: 35, totalSpent: 11.5,
        },
        energy: { current: 70, max: 100 },
        ledger: [
            { minutes: 420, amount: 35, category: 'mission', label: 'Take the $35' },
            { minutes: 500, amount: -2, category: 'transport', label: 'Bus fare' },
            { minutes: 700, amount: -9.5, category: 'shop', label: 'Value Milk' },
        ],
        xp: 55,
    };
    delete v2.goals;
    const st = (0, saveMigration_1.migrateSave)(v2);
    strict_1.default.equal(st.version, 3);
    strict_1.default.equal(st.finance.accounts.cash, 23.5);
    strict_1.default.equal(st.finance.accounts.savings, 4);
    strict_1.default.equal(st.finance.income.job, null, 'the old allowance placeholder job is dropped');
    strict_1.default.equal(st.finance.expenses.recurring.length, 0, 'school path has no phone bill');
    strict_1.default.equal(st.finance.transactions.recent.length, 3);
    strict_1.default.equal(st.finance.transactions.recent[1].category, 'transport');
    strict_1.default.equal(st.finance.transactions.recent[2].category, 'shopping');
    strict_1.default.deepEqual(st.goals.active, [], 'the impossible Save $500 goal is not carried over');
    strict_1.default.equal(st.energy.current, 70);
    strict_1.default.equal(st.xp, 55);
    strict_1.default.equal('ledger' in st, false);
    const store = store_1.GameStore.hydrate(JSON.stringify(v2));
    strict_1.default.ok(store);
    strict_1.default.equal(store.cash, 23.5);
    strict_1.default.equal((0, saveMigration_1.migrateSave)({ version: 1 }), null);
});
(0, node_test_1.default)('Life paths: only School is playable; the others are marked Coming soon', () => {
    strict_1.default.deepEqual(gameData_1.LIFE_PATHS.filter(p => p.available).map(p => p.id), ['school']);
});
(0, node_test_1.default)('Save upgrade: a mission saved on a step that no longer exists is clamped so it can still finish', () => {
    const store = newGame();
    const pm = store.actionableStep();
    store.applyChoice(pm.def.id, pm.step.choices[0]);
    const saved = JSON.parse(store.serialize());
    const rt = saved.missions.find((m) => m.id === 'get_to_school');
    rt.state = 'active';
    rt.stepIndex = 1; // old saves: step 2 of the removed walk/bus menu
    const reloaded = store_1.GameStore.hydrate(JSON.stringify(saved));
    strict_1.default.equal(reloaded.runtime('get_to_school').stepIndex, 0);
    reloaded.advance(60);
    reloaded.exitPlace();
    strict_1.default.equal(reloaded.enterPlace('university').ok, true);
    strict_1.default.equal(reloaded.runtime('get_to_school').state, 'completed');
});
