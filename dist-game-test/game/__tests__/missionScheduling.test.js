"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate 2.0 — Step 13: focused tests for the `pickup_groceries` day-window fix.
 *
 * Scope: this file tests the LIVE mission engine's scheduling behavior (src/lib/missions.ts,
 * driven through the real GameStore), not Core Simulation — it lives under src/game/__tests__/
 * only because that's what tsconfig.game-test.json compiles/runs, same as mondayAdapter.test.ts.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const mondayAdapter_1 = require("../integration/mondayAdapter");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
/** A store that has attended class (so `attendedToday` is genuinely satisfiable) and is standing
 *  at home — the two non-day conditions `pickup_groceries` also requires. Reuses the same fixture
 *  pattern as mondayAdapter.test.ts's storeAtUniversity(). */
function storeAttendedAndHome() {
    const store = freshDefaultStore();
    store.advance(65); // 7:00 -> 8:05 AM
    store.earn(20, 'test', 'seed pocket money for test');
    store.enterPlace('university');
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    if (!outcome.ok)
        throw new Error('test fixture: executeAttendClass unexpectedly failed');
    store.enterPlace('home');
    return store;
}
const pickupState = (store) => store.state.missions.find(m => m.id === 'pickup_groceries')?.state;
(0, node_test_1.default)('pickup_groceries A: locked before its intended Monday-afternoon window (still Monday, before 15:30), even with attendance and location satisfied', () => {
    const store = storeAttendedAndHome(); // now ~12:05 PM Monday, attended, at home
    strict_1.default.equal(pickupState(store), 'locked');
    store.advance(60); // -> 13:05 PM, still before the 15:30 window
    strict_1.default.equal(pickupState(store), 'locked');
});
(0, node_test_1.default)('pickup_groceries B: becomes available during the intended Monday-afternoon window (15:30-19:00) once attendance and location are satisfied', () => {
    const store = storeAttendedAndHome(); // ~12:05 PM Monday, attended, at home
    store.advance(3 * 60 + 30); // 12:05 -> 15:35 PM, staying at home the whole time
    strict_1.default.equal(pickupState(store), 'available');
});
(0, node_test_1.default)('pickup_groceries C: remains locked in its Monday window when attendedToday is false (class was never attended)', () => {
    const store = freshDefaultStore(); // never attended class
    store.advance(65);
    store.earn(20, 'test', 'seed');
    store.enterPlace('home'); // at the right place...
    store.advance(8 * 60); // ...and well into the 15:30-19:00 window (7:00 -> ~15:00, then some)
    // Advance further to be solidly inside the window without ever attending class.
    store.advance(60); // now ~16:05, still never attended
    strict_1.default.equal(pickupState(store), 'locked');
});
(0, node_test_1.default)('pickup_groceries D: the Tuesday 15:30-19:00 slot does NOT open the mission even when attendedToday and location are satisfied THAT day (isolates the day-index fix from the attendedToday fix)', () => {
    const store = freshDefaultStore();
    // Deliberately do nothing during Monday's own window — advance straight through Monday without
    // attending class or being marked present, so Monday's occurrence of the mission never has a
    // chance to become available (attendedToday is false all day Monday), then attend class again on
    // Tuesday specifically, so Tuesday's attendedToday is genuinely true when Tuesday's 15:30-19:00
    // slot arrives. If `days: [0]` (Monday-only) were wrong and the window were actually keyed to
    // "any day", this would incorrectly open on Tuesday; with the Step 13 fix it must not.
    store.advance(24 * 60); // Monday 7:00 AM -> Tuesday 7:00 AM, never attending, never at home-idle
    store.advance(65); // Tuesday 7:00 -> 8:05 AM
    store.earn(20, 'test', 'seed pocket money for test');
    store.enterPlace('university');
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true); // Tuesday's attendedToday is now genuinely true
    store.enterPlace('home');
    store.advance(3 * 60 + 30); // Tuesday 12:05 -> Tuesday 15:35 — inside 15:30-19:00, at home, attended
    // Monday's window is closed (day mismatch) — Tuesday's own 15:30-19:00 slot never opens it because
    // `days: [0]` only matches Monday, not "this weekday's slot every day".
    strict_1.default.equal(pickupState(store), 'locked');
});
(0, node_test_1.default)('pickup_groceries E: existing mission behavior is not regressed — the mission can still be completed end to end once genuinely eligible', () => {
    const store = storeAttendedAndHome();
    store.advance(3 * 60 + 30); // -> Monday 15:35, mission now available
    strict_1.default.equal(pickupState(store), 'available');
    // 'available' is an offer, not yet actionable — same as any other mission, the player (here, the
    // test) accepts it via startMission() before its step becomes actionable.
    store.startMission('pickup_groceries');
    const actionable = store.actionableStep();
    strict_1.default.ok(actionable, 'expected the grocery errand step to be actionable at home');
    strict_1.default.equal(actionable.def.id, 'pickup_groceries');
    const balanceBefore = store.state.finance.balance;
    store.applyChoice('pickup_groceries', actionable.step.choices[0]);
    strict_1.default.equal(store.state.finance.balance, balanceBefore + 15); // "On it" choice hands over $15
    strict_1.default.equal(store.state.world.flags.includes('errand_accepted'), true);
    // Mission has advanced to its second step (the real shopping step) — not completed by this
    // choice alone, since `finish` is not set on it (completion happens via awaitsPurchase).
    const rt = store.state.missions.find(m => m.id === 'pickup_groceries');
    strict_1.default.equal(rt.state, 'active');
    strict_1.default.equal(rt.stepIndex, 1);
});
