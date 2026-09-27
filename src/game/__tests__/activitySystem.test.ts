import test from 'node:test';
import assert from 'node:assert/strict';
import { ClockSystem, PlayerSystem, EnergySystem, FinanceSystem, ActivitySystem } from '../systems';
import { createInitialGameState } from '../state/createInitialGameState';
import { WALK_TO_SCHOOL, TAKE_BUS, BUY_LUNCH, HELP_PARENTS } from '../content/schoolActivities';
import type { GameState } from '../types/gameState';

function freshSimulation() {
  const state: GameState = createInitialGameState();
  const clock = new ClockSystem(state.time);
  const player = new PlayerSystem(state.player);
  const energy = new EnergySystem(state.energy);
  const finance = new FinanceSystem(state.finance);
  const activity = new ActivitySystem(clock, player, energy, finance);
  return { state, clock, player, energy, finance, activity };
}

test('Activity 15: Walk advances time and consumes energy, with no transaction', () => {
  const { state, activity } = freshSimulation();
  const startMinutes = state.time.minutes;
  const startEnergy = state.energy.current;
  const startCash = state.finance.accounts.cash;

  const result = activity.execute(WALK_TO_SCHOOL);

  assert.equal(result.success, true);
  assert.equal(state.time.minutes, startMinutes + 15);
  assert.equal(state.energy.current, startEnergy - 3);
  assert.equal(state.finance.accounts.cash, startCash); // unchanged
  if (result.success) assert.equal(result.transaction, null);
  assert.equal(state.finance.transactions.recent.length, 0);
});

test('Activity 16: Bus advances time, consumes energy, and creates a transport expense', () => {
  const { state, activity } = freshSimulation();
  const startMinutes = state.time.minutes;
  const startEnergy = state.energy.current;
  const startCash = state.finance.accounts.cash;

  const result = activity.execute(TAKE_BUS);

  assert.equal(result.success, true);
  assert.equal(state.time.minutes, startMinutes + 5);
  assert.equal(state.energy.current, startEnergy - 1);
  assert.equal(state.finance.accounts.cash, startCash - 2);
  if (result.success) {
    assert.ok(result.transaction);
    assert.equal(result.transaction!.category, 'transport');
    assert.equal(result.transaction!.amount, -2);
    assert.equal(result.transaction!.description, 'Bus fare');
  }
});

test('Activity 17: Buy lunch creates a food expense', () => {
  const { state, activity } = freshSimulation();
  const startCash = state.finance.accounts.cash;

  const result = activity.execute(BUY_LUNCH);

  assert.equal(result.success, true);
  assert.equal(state.finance.accounts.cash, startCash - 6);
  if (result.success) {
    assert.equal(result.transaction!.category, 'food');
    assert.equal(result.transaction!.amount, -6);
  }
});

test('Activity 18: Helping parents creates income', () => {
  const { state, activity } = freshSimulation();
  const startCash = state.finance.accounts.cash;
  const startEnergy = state.energy.current;

  const result = activity.execute(HELP_PARENTS);

  assert.equal(result.success, true);
  assert.equal(state.finance.accounts.cash, startCash + 5);
  assert.equal(state.energy.current, startEnergy - 5);
  if (result.success) {
    assert.equal(result.transaction!.category, 'income');
    assert.equal(result.transaction!.amount, 5);
  }
});

test('Activity 19: an activity requiring more energy than available is rejected', () => {
  const { state, energy, activity } = freshSimulation();
  // drain energy down to less than HELP_PARENTS needs (5)
  energy.consume(state.energy.current - 3); // leaves exactly 3
  const result = activity.execute(HELP_PARENTS);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.reason, 'insufficient_energy');
});

test('Activity 19b: an activity requiring more money than available is rejected', () => {
  const { state, finance, activity } = freshSimulation();
  // spend down to $1 cash, less than BUY_LUNCH's $6
  finance.recordTransaction(
    { account: 'cash', amount: -(state.finance.accounts.cash - 1), category: 'other', type: 'expense', description: 'drain for test' },
    state.time.minutes,
  );
  const result = activity.execute(BUY_LUNCH);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.reason, 'insufficient_funds');
});

test('Activity 20: a failed activity does not partially modify time/energy/money', () => {
  const { state, energy, activity } = freshSimulation();
  energy.consume(state.energy.current - 3); // leaves 3 energy — not enough for HELP_PARENTS (needs 5)

  const minutesBefore = state.time.minutes;
  const energyBefore = state.energy.current;
  const cashBefore = state.finance.accounts.cash;
  const historyLengthBefore = state.finance.transactions.recent.length;

  const result = activity.execute(HELP_PARENTS);

  assert.equal(result.success, false);
  assert.equal(state.time.minutes, minutesBefore, 'time must not advance on a failed activity');
  assert.equal(state.energy.current, energyBefore, 'energy must not change on a failed activity');
  assert.equal(state.finance.accounts.cash, cashBefore, 'cash must not change on a failed activity');
  assert.equal(
    state.finance.transactions.recent.length, historyLengthBefore,
    'no transaction must be created for a failed activity',
  );
});

test('Activity: transaction timestamp is the completion time, not the start time', () => {
  // Worked example from the Step 3 patch: lunch starts at 12:00 PM, takes 10 minutes,
  // completes at 12:10 PM — the transaction timestamp must be 12:10 PM (the completion time),
  // not 12:00 PM (the start time).
  const { state, clock, activity } = freshSimulation();

  const startOfDay = state.time.minutes - (state.time.minutes % 1440);
  const noon = startOfDay + 12 * 60; // 12:00 PM that day
  clock.advance(noon - state.time.minutes);

  const startMinutes = state.time.minutes;
  assert.equal(startMinutes, noon); // 1. activity starts at a known time

  const result = activity.execute(BUY_LUNCH); // BUY_LUNCH costs 10 minutes

  assert.equal(result.success, true);
  assert.equal(state.time.minutes, startMinutes + 10); // 2. activity advances time
  assert.ok(result.success && result.transaction); // 3. a transaction is created
  if (result.success) {
    // 4. transaction timestamp equals the post-activity (completion) game time, not the start time
    assert.equal(result.transaction!.timestamp, startMinutes + 10);
    assert.equal(result.transaction!.timestamp, state.time.minutes);
    assert.notEqual(result.transaction!.timestamp, startMinutes);
  }
});

test('Activity: requirement.place is enforced before any mutation', () => {
  const { state, activity } = freshSimulation();
  const gated = {
    ...WALK_TO_SCHOOL,
    id: 'gated_walk',
    requirement: { place: 'university' }, // player starts at 'home', not 'university'
  };
  const minutesBefore = state.time.minutes;
  const result = activity.execute(gated);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.reason, 'requirement_not_met');
  assert.equal(state.time.minutes, minutesBefore);
});
