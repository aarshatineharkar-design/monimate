"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate — activities run by ActivitySystem directly against the live game (GameStore.runActivity).
 *
 * There is one engine: ActivitySystem validates place/energy/money first, then moves the real clock,
 * energy and ledger. These tests cover the two branches the shipped activities (Attend Class, Help
 * Parents) don't use — a location change and an expense — and that a failure changes nothing.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const mondayActivities_1 = require("../content/school/mondayActivities");
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
/** A store advanced to 8:05 AM Monday with $20 seeded — same fixture shape as
 *  mondayAdapter.test.ts's storeAtSchoolOpenTime(), reused here so `enterPlace('university')`
 *  (needed to test GET_MILK_FOR_MUM's requirement-failure branch) is valid against world.ts's real
 *  school-hours window. */
function storeAtSchoolOpenTime() {
    const store = freshDefaultStore();
    store.advance(65); // 7:00 -> 8:05 AM
    store.earn(20, 'other', 'seed money for test');
    return store;
}
// ══════════════════════════════════════════════════════════════════════════
// Branch 1 — movesPlayerTo (WALK_TO_SCHOOL: home -> university, no requirement, no financial effect)
// ══════════════════════════════════════════════════════════════════════════
(0, node_test_1.default)('LiveActivity 1: successful movesPlayerTo activity relocates the live player via store.enterPlace()', () => {
    const store = storeAtSchoolOpenTime(); // 8:05 AM, at 'home' — within university's open hours
    strict_1.default.equal(store.state.player.place, 'home');
    const result = store.runActivity(mondayActivities_1.WALK_TO_SCHOOL);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(store.state.player.place, 'university');
});
(0, node_test_1.default)('LiveActivity 2: enterPlace() is the correct method — it also updates scene, not just place, exactly as every other live location change does', () => {
    const store = storeAtSchoolOpenTime();
    const result = store.runActivity(mondayActivities_1.WALK_TO_SCHOOL);
    strict_1.default.equal(result.ok, true);
    // A raw field write (`s.player.place = 'university'`) would never do this — proving enterPlace()
    // is the correct existing method, not just "a" method that happens to work.
    strict_1.default.notEqual(store.state.player.scene, 'outdoor'); // university's interior scene, not the street
});
(0, node_test_1.default)('LiveActivity 3: time and energy are still applied correctly alongside the location change', () => {
    const store = storeAtSchoolOpenTime();
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const result = store.runActivity(mondayActivities_1.WALK_TO_SCHOOL);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(store.state.minutes, minutesBefore + 15);
    strict_1.default.equal(store.getEnergy().current, energyBefore - 3);
});
(0, node_test_1.default)('LiveActivity 4: failed movesPlayerTo activity (insufficient energy) leaves location, time, and energy completely unchanged', () => {
    const store = storeAtSchoolOpenTime();
    store.consumeEnergy(store.getEnergy().current - 1); // leaves 1, less than WALK_TO_SCHOOL's cost of 3
    const placeBefore = store.state.player.place;
    const sceneBefore = store.state.player.scene;
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const result = store.runActivity(mondayActivities_1.WALK_TO_SCHOOL);
    strict_1.default.equal(result.ok, false);
    strict_1.default.equal(store.state.player.place, placeBefore); // enterPlace() never called
    strict_1.default.equal(store.state.player.scene, sceneBefore);
    strict_1.default.equal(store.state.minutes, minutesBefore);
    strict_1.default.equal(store.getEnergy().current, energyBefore);
});
// ══════════════════════════════════════════════════════════════════════════
// Branch 2 — negative financial effect (GET_MILK_FOR_MUM: -$3, requirement place 'home')
// ══════════════════════════════════════════════════════════════════════════
(0, node_test_1.default)('LiveActivity 5: successful negative financial effect is applied via store.spend(), not store.earn()', () => {
    const store = storeAtSchoolOpenTime(); // at 'home' — GET_MILK_FOR_MUM's requirement
    const balanceBefore = store.state.finance.accounts.cash;
    const result = store.runActivity(mondayActivities_1.GET_MILK_FOR_MUM);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore - 3); // went DOWN, confirming spend() not earn()
});
(0, node_test_1.default)('LiveActivity 6: the resulting ledger entry carries the activity\'s own signed amount/category/description', () => {
    const store = storeAtSchoolOpenTime();
    const ledgerLengthBefore = store.state.finance.transactions.recent.length;
    const result = store.runActivity(mondayActivities_1.GET_MILK_FOR_MUM);
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore + 1);
    const entry = store.state.finance.transactions.recent[store.state.finance.transactions.recent.length - 1];
    strict_1.default.equal(entry.amount, -3); // GameStore's own ledger always stores the signed amount
    strict_1.default.equal(entry.category, 'food'); // GET_MILK_FOR_MUM.financialEffect.category
    strict_1.default.equal(entry.description, 'Milk for Mum'); // GET_MILK_FOR_MUM.financialEffect.description
});
(0, node_test_1.default)('LiveActivity 7: insufficient funds rejects the activity atomically — money, ledger, time, and energy all unchanged', () => {
    const store = freshDefaultStore(); // School's real starting balance is $0
    store.advance(65); // 7:00 -> 8:05 AM, still at home, still $0
    strict_1.default.equal(store.state.finance.accounts.cash < 3, true); // genuinely can't afford it
    const balanceBefore = store.state.finance.accounts.cash;
    const ledgerLengthBefore = store.state.finance.transactions.recent.length;
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const placeBefore = store.state.player.place;
    const result = store.runActivity(mondayActivities_1.GET_MILK_FOR_MUM);
    strict_1.default.equal(result.ok, false);
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore);
    strict_1.default.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore);
    strict_1.default.equal(store.state.minutes, minutesBefore);
    strict_1.default.equal(store.getEnergy().current, energyBefore);
    strict_1.default.equal(store.state.player.place, placeBefore);
});
(0, node_test_1.default)('LiveActivity 8: a requirement failure (wrong location) is also atomic — GET_MILK_FOR_MUM requires being at home', () => {
    const store = storeAtSchoolOpenTime();
    const entered = store.enterPlace('university');
    strict_1.default.equal(entered.ok, true);
    strict_1.default.equal(store.state.player.place, 'university'); // not 'home' — GET_MILK_FOR_MUM's requirement
    const balanceBefore = store.state.finance.accounts.cash;
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const placeBefore = store.state.player.place;
    const ledgerLengthBefore = store.state.finance.transactions.recent.length;
    const result = store.runActivity(mondayActivities_1.GET_MILK_FOR_MUM);
    strict_1.default.equal(result.ok, false);
    strict_1.default.equal(result.reason, 'requirement_not_met');
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore);
    strict_1.default.equal(store.state.minutes, minutesBefore);
    strict_1.default.equal(store.getEnergy().current, energyBefore);
    strict_1.default.equal(store.state.player.place, placeBefore); // enterPlace('home') never called
    strict_1.default.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore);
});
(0, node_test_1.default)('LiveActivity 9: every transaction an activity makes says why and where (blueprint rule: every transaction has a reason)', () => {
    const store = storeAtSchoolOpenTime();
    const result = store.runActivity(mondayActivities_1.GET_MILK_FOR_MUM);
    strict_1.default.equal(result.ok, true);
    const tx = store.state.finance.transactions.recent.at(-1);
    strict_1.default.equal(tx.account, 'cash');
    strict_1.default.equal(tx.type, 'expense');
    strict_1.default.equal(tx.source, 'dairy');
    strict_1.default.equal(tx.timestamp, store.state.minutes);
    strict_1.default.equal(store.state.today.spent, 3, 'the day record is kept in step with the ledger');
});
(0, node_test_1.default)('LiveActivity 10: currentActivity is still synchronized correctly alongside both new branches', () => {
    const storeA = storeAtSchoolOpenTime();
    const resultA = storeA.runActivity(mondayActivities_1.WALK_TO_SCHOOL);
    strict_1.default.equal(resultA.ok, true);
    strict_1.default.equal(storeA.state.currentActivity, 'walking'); // WALK_TO_SCHOOL's category is 'travel'
    const storeB = storeAtSchoolOpenTime();
    const resultB = storeB.runActivity(mondayActivities_1.GET_MILK_FOR_MUM);
    strict_1.default.equal(resultB.ok, true);
    strict_1.default.equal(storeB.state.currentActivity, 'chore'); // GET_MILK_FOR_MUM's category is 'chore'
});
