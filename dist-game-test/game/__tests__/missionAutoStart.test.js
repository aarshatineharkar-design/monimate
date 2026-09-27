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
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
(0, node_test_1.default)('MissionAutoStart 1: pocket_money arrives as a phone message the moment Monday starts — no need to find Mum first', () => {
    const store = freshDefaultStore(); // Monday, 7:00 AM
    const rt = store.state.missions.find(m => m.id === 'pocket_money');
    strict_1.default.equal(rt.state, 'available');
});
(0, node_test_1.default)('MissionAutoStart 2: actionableStep() surfaces that available mission immediately, wherever the player is', () => {
    const store = freshDefaultStore();
    store.state.player.place = null; // walked straight outside — the old soft-lock case
    store.state.player.scene = 'outdoor';
    const actionable = store.actionableStep();
    strict_1.default.ok(actionable, 'expected pocket_money to be actionable as a remote phone message');
    strict_1.default.equal(actionable.def.id, 'pocket_money');
    strict_1.default.equal(actionable.step.remote, true);
});
(0, node_test_1.default)("MissionAutoStart 3: reading actionableStep() flips the runtime state to active", () => {
    const store = freshDefaultStore();
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pocket_money').state, 'available');
    store.actionableStep();
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pocket_money').state, 'active');
});
(0, node_test_1.default)('MissionAutoStart 4: the auto-started mission plays out normally end to end through applyChoice()', () => {
    const store = freshDefaultStore();
    const actionable = store.actionableStep();
    const balanceBefore = store.state.finance.accounts.cash;
    store.applyChoice('pocket_money', actionable.step.choices[0]);
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore + 35);
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pocket_money').state, 'completed');
});
(0, node_test_1.default)('MissionAutoStart 5: calling actionableStep() repeatedly does not re-trigger startMission or reset progress (idempotent once active)', () => {
    const store = freshDefaultStore();
    store.actionableStep();
    const rt = store.state.missions.find(m => m.id === 'pocket_money');
    const startedAt = rt.startedAt;
    store.actionableStep();
    store.actionableStep();
    strict_1.default.equal(rt.startedAt, startedAt);
    strict_1.default.equal(rt.stepIndex, 0);
});
(0, node_test_1.default)('MissionAutoStart 6: an interaction-triggered mission stays locked until the player actually talks to that NPC', () => {
    const store = freshDefaultStore();
    store.advance((2 * 24 + 2) * 60); // -> Wednesday 9:00 AM, inside Riley's birthday window
    store.actionableStep();
    strict_1.default.equal(store.state.missions.find(m => m.id === 'friend_birthday').state, 'locked');
    strict_1.default.ok(store.npcsWantingToTalk().has('riley'), 'Riley should show a speech bubble while she wants to talk');
});
(0, node_test_1.default)('MissionAutoStart 7: an available mission whose step is at a place the player is NOT at stays available (not force-started)', () => {
    const store = freshDefaultStore();
    const rt = store.state.missions.find(m => m.id === 'arcade_invite');
    rt.state = 'available'; // Jordan's text arrived; the arcade itself is at the Mall
    store.state.missions.find(m => m.id === 'pocket_money').state = 'completed';
    store.state.player.place = 'home';
    const actionable = store.actionableStep();
    strict_1.default.notEqual(actionable?.def.id, 'arcade_invite');
    strict_1.default.equal(rt.state, 'available');
});
(0, node_test_1.default)('MissionAutoStart 8: end-to-end through the REAL trigger chain — pickup_groceries is actionable the instant the player is home in its window', () => {
    const store = freshDefaultStore();
    const pm = store.actionableStep();
    store.applyChoice(pm.def.id, pm.step.choices[0]); // accept Mum's pocket money
    store.advance(64); // -> 8:05 AM
    store.enterPlace('university');
    const outcome = store.attendClass();
    strict_1.default.equal(outcome.ok, true); // now ~12:05, attended
    store.enterPlace('home');
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pickup_groceries').state, 'locked');
    store.advance(3 * 60 + 30); // -> 15:35 at home
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pickup_groceries').state, 'available');
    const actionable = store.actionableStep();
    strict_1.default.ok(actionable);
    strict_1.default.equal(actionable.def.id, 'pickup_groceries');
    strict_1.default.equal(store.state.missions.find(m => m.id === 'pickup_groceries').state, 'active');
});
