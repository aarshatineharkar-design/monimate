"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate 2.0 — this-step fix: focused tests for actionableStep()'s new auto-start behavior.
 *
 * Root-cause bug this closes: nothing in the live game (src/app/game/page.tsx) ever called
 * store.startMission() — only test fixtures did. Every scheduled mission (pocket_money,
 * lunch_break, pickup_groceries, ...) would sit forever in the 'available' state once its trigger
 * fired, because actionableStep() — the ONLY thing that surfaces a mission's DialoguePanel — used
 * to require rt.state === 'active'. Nothing ever transitioned it there, so no mission dialogue ever
 * actually appeared during real play. actionableStep() now also matches an 'available' mission once
 * its step is reachable (remote, or the player is already at step.place — which can only be true
 * once the mission's own trigger already fired), and starts it at that moment.
 *
 * These tests exercise actionableStep()'s own behavior directly; the existing missionScheduling.test.ts
 * and mondayAdapter.test.ts suites already cover window/day/requires gating and are deliberately left
 * untouched (this file adds new coverage, it does not replace them — both continue passing).
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
(0, node_test_1.default)('MissionAutoStart 1: pocket_money becomes available the moment the player talks to Mum on Monday morning', () => {
    const store = freshDefaultStore(); // Monday, 7:00 AM, at home — pocket_money's own window
    store.talkTo('mum');
    const rt = store.state.missions.find(m => m.id === 'pocket_money');
    strict_1.default.equal(rt.state, 'available');
});
(0, node_test_1.default)('MissionAutoStart 2: actionableStep() surfaces that available mission immediately, without a separate startMission() call from the caller', () => {
    const store = freshDefaultStore();
    store.talkTo('mum');
    const actionable = store.actionableStep();
    strict_1.default.ok(actionable, 'expected pocket_money to be actionable right after the triggering interaction');
    strict_1.default.equal(actionable.def.id, 'pocket_money');
});
(0, node_test_1.default)('MissionAutoStart 3: reading actionableStep() actually flips the runtime state to active (this is the fix — the state used to be stuck on \'available\' forever)', () => {
    const store = freshDefaultStore();
    store.talkTo('mum');
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pocket_money').state, 'available');
    store.actionableStep();
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pocket_money').state, 'active');
});
(0, node_test_1.default)('MissionAutoStart 4: the auto-started mission plays out normally end to end through applyChoice()', () => {
    const store = freshDefaultStore();
    store.talkTo('mum');
    const actionable = store.actionableStep();
    const balanceBefore = store.state.finance.balance;
    store.applyChoice('pocket_money', actionable.step.choices[0]);
    strict_1.default.equal(store.state.finance.balance, balanceBefore + 35);
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pocket_money').state, 'completed');
});
(0, node_test_1.default)('MissionAutoStart 5: calling actionableStep() repeatedly does not re-trigger startMission or reset progress (idempotent once active)', () => {
    const store = freshDefaultStore();
    store.talkTo('mum');
    store.actionableStep();
    const rt = store.state.missions.find(m => m.id === 'pocket_money');
    const startedAt = rt.startedAt;
    store.actionableStep();
    store.actionableStep();
    strict_1.default.equal(rt.startedAt, startedAt);
    strict_1.default.equal(rt.stepIndex, 0);
});
(0, node_test_1.default)('MissionAutoStart 6: a mission stays untouched (locked) if its trigger has not fired — actionableStep() does not force-start unrelated missions', () => {
    const store = freshDefaultStore(); // never talked to anyone
    store.actionableStep();
    const rt = store.state.missions.find(m => m.id === 'pocket_money');
    strict_1.default.equal(rt.state, 'locked');
});
(0, node_test_1.default)('MissionAutoStart 7: an available mission whose step is NOT remote and the player is NOT at its place stays available (auto-start only fires when the step is actually reachable)', () => {
    const store = freshDefaultStore();
    store.talkTo('mum'); // fires the trigger, home
    const rt = store.state.missions.find(m => m.id === 'pocket_money');
    strict_1.default.equal(rt.state, 'available');
    // Walk away before ever reading actionableStep() — simulates the mission becoming available while
    // the player is elsewhere (can't happen for an interaction trigger in practice, but exercises the
    // guard directly rather than assuming it).
    store.state.player.place = 'university';
    const actionable = store.actionableStep();
    strict_1.default.equal(actionable, null);
    strict_1.default.equal(rt.state, 'available'); // untouched — not force-started away from its own place
});
(0, node_test_1.default)('MissionAutoStart 8: end-to-end through the REAL trigger chain (no forced runtime state) — pickup_groceries reaches its DialoguePanel-ready moment the instant the player walks in the door, exactly the "Mom needs groceries" moment this step is about', () => {
    const store = freshDefaultStore();
    store.advance(65); // 7:00 -> 8:05 AM
    store.enterPlace('university');
    // Attend Class is what markSchoolAttended() (attendedToday's own read) requires — go through the
    // real adapter rather than poking dailyMarks directly.
    const outcome = (0, mondayAdapter_1.executeAttendClass)(store);
    strict_1.default.equal(outcome.ok, true); // now ~12:05, attended
    store.enterPlace('home'); // still well before the 15:30 window — trigger can't fire yet
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pickup_groceries').state, 'locked');
    store.advance(3 * 60 + 30); // -> 15:35, staying at home — the mission's own location trigger opens
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pickup_groceries').state, 'available');
    // The moment page.tsx's render loop would call actionableStep() (no separate accept UI exists,
    // and none should be needed for a remote "read Mum's message" step):
    const actionable = store.actionableStep();
    strict_1.default.ok(actionable, 'expected the grocery errand to be immediately actionable — this is the bug this step fixes');
    strict_1.default.equal(actionable.def.id, 'pickup_groceries');
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pickup_groceries').state, 'active');
});
