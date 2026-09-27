"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const mondayAdapter_1 = require("../integration/mondayAdapter");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
/** The live game's actual default Monday start (7:00 AM) — matches createInitialState()'s real
 *  behavior exactly, for tests that specifically exercise the open-hours mismatch. */
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
/** A store whose clock has already been advanced past the school's 8:00 AM opening, AND which
 *  has been handed pocket money — so the Attend Class fixture below can put the player at
 *  university without being blocked by two separate, already-documented mismatches this
 *  integration step deliberately does not fix:
 *    1. the open-hours mismatch (the live default Monday start, 7:00 AM, is before the school's
 *       8:00 AM opening — see world.ts's HOURS table);
 *    2. the School life path's real starting balance is $0, not $20/$35 — makeInitialFinance()
 *       gives startingBalance: 0 on purpose, because the live game hands the player $35 through
 *       the "Make It to Friday" mission's Monday dialogue (store.applyChoice()), which this
 *       isolated adapter test does not simulate. $20 is seeded directly here, via the store's own
 *       public earn() method (never a direct state write).
 *  Both are real, discovered mismatches between the blueprint's Monday narrative and the live
 *  game's current content — flagged in earlier step reports, not silently patched around. */
function storeAtSchoolOpenTime() {
    const store = freshDefaultStore();
    store.advance(65); // 7:00 AM -> 8:05 AM, using the store's own public API
    store.earn(20, 'test', 'seed pocket money for test'); // using the store's own public API
    return store;
}
function freshFinance() {
    return (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
}
/** Step 8: a store already inside the school building during a valid class window (8:05 AM,
 *  Monday — within world.ts's university hours of 8:00-15:30). Reuses storeAtSchoolOpenTime()'s
 *  seeded $20 (not needed by ATTEND_CLASS, which has no financialEffect, but keeps the fixture
 *  consistent) and calls the store's own public enterPlace() to put the player at 'university' —
 *  Step 10: this used to be reached via executeMorningTransport(); Monday transport is now owned
 *  solely by the live 'get_to_school' mission (src/lib/missions.ts), so this fixture calls
 *  enterPlace() directly instead. */
function storeAtUniversity() {
    const store = storeAtSchoolOpenTime();
    const entered = store.enterPlace('university');
    if (!entered.ok)
        throw new Error('test fixture: enterPlace(university) unexpectedly failed at 8:05 AM');
    return store;
}
// ══════════════════════════════════════════════════════════════════════════
// Step 6 — live Energy on GameStore (general, not transport/class-specific)
// ══════════════════════════════════════════════════════════════════════════
(0, node_test_1.default)('Energy 1 (Step 6): initial live energy has the expected current/max values', () => {
    const store = freshDefaultStore();
    strict_1.default.deepEqual(store.getEnergy(), { current: 100, max: 100 });
});
(0, node_test_1.default)('Energy 2 (Step 6): sleep() restores live energy to full', () => {
    const store = storeAtSchoolOpenTime();
    // Spend some energy first via the store's own public API.
    store.consumeEnergy(40);
    strict_1.default.equal(store.getEnergy().current, 60);
    store.sleep();
    strict_1.default.deepEqual(store.getEnergy(), { current: 100, max: 100 });
});
(0, node_test_1.default)('Energy 3 (Step 6): consumeEnergy/restoreEnergy never go outside [0, max]', () => {
    const store = freshDefaultStore();
    store.consumeEnergy(1000); // would go to -900
    strict_1.default.equal(store.getEnergy().current, 0);
    store.restoreEnergy(1000); // would go to 1000
    strict_1.default.equal(store.getEnergy().current, 100);
});
// ══════════════════════════════════════════════════════════════════════════
// Step 8 — Attend Class
// ══════════════════════════════════════════════════════════════════════════
(0, node_test_1.default)('Attend Class 1: succeeds at university during valid school hours', () => {
    const store = storeAtUniversity();
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true);
});
(0, node_test_1.default)('Attend Class 2: advances time by 240 minutes', () => {
    const store = storeAtUniversity();
    const minutesBefore = store.state.minutes;
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(outcome.minutesAdvanced, 240);
    strict_1.default.equal(store.state.minutes, minutesBefore + 240);
});
(0, node_test_1.default)('Attend Class 3: consumes 15 energy', () => {
    const store = storeAtUniversity();
    const energyBefore = store.getEnergy().current;
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(outcome.energyConsumed, 15);
    strict_1.default.equal(store.getEnergy().current, energyBefore - 15);
});
(0, node_test_1.default)('Attend Class 4: creates no financial transaction', () => {
    const store = storeAtUniversity();
    const balanceBefore = store.state.finance.balance;
    const ledgerLengthBefore = store.state.ledger.length;
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(store.state.finance.balance, balanceBefore); // unchanged — no financialEffect
    strict_1.default.equal(store.state.ledger.length, ledgerLengthBefore); // no new ledger entry
});
(0, node_test_1.default)('Attend Class 5 & 6: requires university — fails when the player is not there', () => {
    const store = storeAtSchoolOpenTime(); // same time/energy/finance, but never entered the building
    strict_1.default.equal(store.state.player.place, 'home');
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(outcome.reason, 'requirement_not_met');
});
(0, node_test_1.default)('Attend Class 7 (documented, not duplicated here): outside valid school hours the player can never be "at university" in the first place, because store.enterPlace(university) itself is gated by world.ts\'s HOURS table — so ATTEND_CLASS\'s own place requirement is the only gate this adapter needs', () => {
    const store = freshDefaultStore(); // 7:00 AM — before the school opens
    const entered = store.enterPlace('university');
    strict_1.default.equal(entered.ok, false); // enterPlace itself rejects it — school-hours rule enforced upstream
    strict_1.default.equal(store.state.player.place, 'home'); // never arrived, so ATTEND_CLASS's place check would also fail
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(outcome.reason, 'requirement_not_met');
});
(0, node_test_1.default)('Attend Class 8: insufficient energy rejects the activity', () => {
    const store = storeAtUniversity();
    // Drain energy below ATTEND_CLASS's cost (15) using the store's OWN public consumeEnergy().
    store.consumeEnergy(store.getEnergy().current - 10); // leaves 10, less than the 15 class needs
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(outcome.reason, 'insufficient_energy');
});
(0, node_test_1.default)('Attend Class 9, 10, 11: failed attendance does not partially mutate time, energy, or money', () => {
    const store = storeAtUniversity();
    store.consumeEnergy(store.getEnergy().current - 10); // force insufficient_energy
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const balanceBefore = store.state.finance.balance;
    const placeBefore = store.state.player.place;
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(store.state.minutes, minutesBefore); // time unchanged
    strict_1.default.equal(store.getEnergy().current, energyBefore); // energy unchanged
    strict_1.default.equal(store.state.finance.balance, balanceBefore); // money unchanged
    strict_1.default.equal(store.state.player.place, placeBefore); // location unchanged
});
(0, node_test_1.default)('Attend Class 12, 13, 14: successful live integration updates GameStore time/energy and leaves player at university', () => {
    const store = storeAtUniversity();
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(store.state.minutes, minutesBefore + 240); // time updated
    strict_1.default.equal(store.getEnergy().current, energyBefore - 15); // energy updated
    strict_1.default.equal(store.state.player.place, 'university'); // still at university — no movesPlayerTo
});
(0, node_test_1.default)('Attend Class 15: failed live integration leaves GameStore completely unchanged', () => {
    const store = storeAtSchoolOpenTime(); // not at university -> requirement_not_met
    const minutesBefore = store.state.minutes;
    const energyBefore = store.getEnergy().current;
    const balanceBefore = store.state.finance.balance;
    const placeBefore = store.state.player.place;
    const ledgerLengthBefore = store.state.ledger.length;
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(store.state.minutes, minutesBefore);
    strict_1.default.equal(store.getEnergy().current, energyBefore);
    strict_1.default.equal(store.state.finance.balance, balanceBefore);
    strict_1.default.equal(store.state.player.place, placeBefore);
    strict_1.default.equal(store.state.ledger.length, ledgerLengthBefore);
});
