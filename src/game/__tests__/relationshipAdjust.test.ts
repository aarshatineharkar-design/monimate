/**
 * MoniMate 2.0 — Step 27: focused tests for the one new piece of store.ts logic this step added,
 * GameStore.adjustRelationship() — the public write path a Decline consequence (or any future ad hoc
 * activity outside the mission-choice engine) uses to move a relationship value. Everything else
 * Step 27 added (the Help Parents activity sequence, the bus banners) is presentational, in
 * page.tsx, and per the Step 27 instructions ("do not create tests merely for visual presentation")
 * is not covered by automated tests — only this one real logic change is.
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

test('RelationshipAdjust 1: a negative delta lowers an existing relationship by exactly that amount', () => {
  const store = freshDefaultStore();
  const before = store.state.world.relationships['Mum'] ?? 0;
  store.adjustRelationship('Mum', -1);
  assert.equal(store.state.world.relationships['Mum'], before - 1);
});

test('RelationshipAdjust 2: a positive delta raises an existing relationship by exactly that amount', () => {
  const store = freshDefaultStore();
  const before = store.state.world.relationships['Jordan'] ?? 0;
  store.adjustRelationship('Jordan', 2);
  assert.equal(store.state.world.relationships['Jordan'], before + 2);
});

test('RelationshipAdjust 3: a delta of 0 is a no-op (does not create a spurious entry or touch)', () => {
  const store = freshDefaultStore();
  const versionBefore = store.getVersion();
  store.adjustRelationship('Mum', 0);
  assert.equal(store.getVersion(), versionBefore);
});

test('RelationshipAdjust 4: an NPC with no existing entry starts from 0, exactly like applyChoice() does', () => {
  const store = freshDefaultStore();
  assert.equal(store.state.world.relationships['Ms Patel'], undefined);
  store.adjustRelationship('Ms Patel', -1);
  assert.equal(store.state.world.relationships['Ms Patel'], -1);
});

test('RelationshipAdjust 5: the value clamps at -5, the same bound applyChoice() enforces', () => {
  const store = freshDefaultStore();
  store.state.world.relationships['Mum'] = -4;
  store.adjustRelationship('Mum', -5);
  assert.equal(store.state.world.relationships['Mum'], -5);
});

test('RelationshipAdjust 6: the value clamps at +5, the same bound applyChoice() enforces', () => {
  const store = freshDefaultStore();
  store.state.world.relationships['Jordan'] = 4;
  store.adjustRelationship('Jordan', 5);
  assert.equal(store.state.world.relationships['Jordan'], 5);
});

test('RelationshipAdjust 7: adjusting one NPC does not affect another NPC\'s relationship value', () => {
  const store = freshDefaultStore();
  const rileyBefore = store.state.world.relationships['Riley'] ?? 0;
  store.adjustRelationship('Mum', -1);
  assert.equal(store.state.world.relationships['Riley'], rileyBefore);
});

test('RelationshipAdjust 8: adjusting a relationship does not change money, time, or energy', () => {
  const store = freshDefaultStore();
  const balanceBefore = store.state.finance.balance;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  store.adjustRelationship('Mum', -1);
  assert.equal(store.state.finance.balance, balanceBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
});
