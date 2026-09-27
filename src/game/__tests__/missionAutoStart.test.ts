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
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';

const SCHOOL_CONFIG = LIFE_PATHS.find((p) => p.id === 'school')!;

function freshDefaultStore(): GameStore {
  const finance = makeInitialFinance(SCHOOL_CONFIG);
  const state = createInitialState('school', finance);
  return new GameStore(state);
}

test('MissionAutoStart 1: pocket_money arrives as a phone message the moment Monday starts — no need to find Mum first', () => {
  const store = freshDefaultStore(); // Monday, 7:00 AM
  const rt = store.state.missions.find(m => m.id === 'pocket_money')!;
  assert.equal(rt.state, 'available');
});

test('MissionAutoStart 2: actionableStep() surfaces that available mission immediately, wherever the player is', () => {
  const store = freshDefaultStore();
  store.state.player.place = null; // walked straight outside — the old soft-lock case
  store.state.player.scene = 'outdoor';
  const actionable = store.actionableStep();
  assert.ok(actionable, 'expected pocket_money to be actionable as a remote phone message');
  assert.equal(actionable!.def.id, 'pocket_money');
  assert.equal(actionable!.step.remote, true);
});

test("MissionAutoStart 3: reading actionableStep() flips the runtime state to active", () => {
  const store = freshDefaultStore();
  assert.equal(store.state.missions.find(m => m.id === 'pocket_money')!.state, 'available');
  store.actionableStep();
  assert.equal(store.state.missions.find(m => m.id === 'pocket_money')!.state, 'active');
});

test('MissionAutoStart 4: the auto-started mission plays out normally end to end through applyChoice()', () => {
  const store = freshDefaultStore();
  const actionable = store.actionableStep()!;
  const balanceBefore = store.state.finance.accounts.cash;
  store.applyChoice('pocket_money', actionable.step.choices![0]);
  assert.equal(store.state.finance.accounts.cash, balanceBefore + 35);
  assert.equal(store.state.missions.find(m => m.id === 'pocket_money')!.state, 'completed');
});

test('MissionAutoStart 5: calling actionableStep() repeatedly does not re-trigger startMission or reset progress (idempotent once active)', () => {
  const store = freshDefaultStore();
  store.actionableStep();
  const rt = store.state.missions.find(m => m.id === 'pocket_money')!;
  const startedAt = rt.startedAt;
  store.actionableStep();
  store.actionableStep();
  assert.equal(rt.startedAt, startedAt);
  assert.equal(rt.stepIndex, 0);
});

test('MissionAutoStart 6: an interaction-triggered mission stays locked until the player actually talks to that NPC', () => {
  const store = freshDefaultStore();
  store.advance((2 * 24 + 2) * 60); // -> Wednesday 9:00 AM, inside Riley's birthday window
  store.actionableStep();
  assert.equal(store.state.missions.find(m => m.id === 'friend_birthday')!.state, 'locked');
  assert.ok(store.npcsWantingToTalk().has('riley'), 'Riley should show a speech bubble while she wants to talk');
});

test('MissionAutoStart 7: an available mission whose step is at a place the player is NOT at stays available (not force-started)', () => {
  const store = freshDefaultStore();
  const rt = store.state.missions.find(m => m.id === 'arcade_invite')!;
  rt.state = 'available'; // Jordan's text arrived; the arcade itself is at the Mall
  store.state.missions.find(m => m.id === 'pocket_money')!.state = 'completed';
  store.state.player.place = 'home';
  const actionable = store.actionableStep();
  assert.notEqual(actionable?.def.id, 'arcade_invite');
  assert.equal(rt.state, 'available');
});

test('MissionAutoStart 8: end-to-end through the REAL trigger chain — pickup_groceries is actionable the instant the player is home in its window', () => {
  const store = freshDefaultStore();
  const pm = store.actionableStep()!;
  store.applyChoice(pm.def.id, pm.step.choices![0]); // accept Mum's pocket money
  store.advance(64); // -> 8:05 AM
  store.enterPlace('university');
  const outcome = store.attendClass();
  assert.equal(outcome.ok, true); // now ~12:05, attended
  store.enterPlace('home');
  assert.equal(store.state.missions.find(m => m.id === 'pickup_groceries')!.state, 'locked');
  store.advance(3 * 60 + 30); // -> 15:35 at home
  assert.equal(store.state.missions.find(m => m.id === 'pickup_groceries')!.state, 'available');
  const actionable = store.actionableStep();
  assert.ok(actionable);
  assert.equal(actionable!.def.id, 'pickup_groceries');
  assert.equal(store.state.missions.find(m => m.id === 'pickup_groceries')!.state, 'active');
});

