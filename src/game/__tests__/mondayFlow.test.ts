import test from 'node:test';
import assert from 'node:assert/strict';
import { MondayFlow } from '../content/school/mondayFlow';
import { createInitialGameState } from '../state/createInitialGameState';
import type { GameState } from '../types/gameState';

function freshMonday(): { state: GameState; flow: MondayFlow } {
  const state: GameState = createInitialGameState();
  const flow = new MondayFlow(state);
  return { state, flow };
}

test('Monday 1: Monday starts with $20', () => {
  const { state } = freshMonday();
  assert.equal(state.finance.accounts.cash, 20);
});

test('Monday 2: walking to school consumes time and energy but no transport money', () => {
  const { state, flow } = freshMonday();
  const startMinutes = state.time.minutes;
  const startEnergy = state.energy.current;
  const startCash = state.finance.accounts.cash;

  const result = flow.chooseTransport('walk');

  assert.equal(result.success, true);
  assert.equal(state.time.minutes, startMinutes + 15);
  assert.equal(state.energy.current, startEnergy - 3);
  assert.equal(state.finance.accounts.cash, startCash); // unchanged
  assert.equal(state.player.world.place, 'university');
  assert.equal(flow.phase, 'school');
});

test('Monday 3: taking the bus consumes time/energy and creates a transport transaction', () => {
  const { state, flow } = freshMonday();
  const startCash = state.finance.accounts.cash;

  const result = flow.chooseTransport('bus');

  assert.equal(result.success, true);
  if (result.success) {
    assert.ok(result.transaction);
    assert.equal(result.transaction!.category, 'transport');
    assert.equal(result.transaction!.amount, -2);
  }
  assert.equal(state.finance.accounts.cash, startCash - 2);
});

test('Monday 4: buying lunch creates a food transaction', () => {
  const { flow, state } = freshMonday();
  flow.chooseTransport('walk');
  flow.attendClass();

  const startCash = state.finance.accounts.cash;
  const result = flow.chooseLunch('buy');

  assert.equal(result.success, true);
  assert.equal(state.finance.accounts.cash, startCash - 6);
  if (result.success) {
    assert.ok(result.transaction);
    assert.equal(result.transaction!.category, 'food');
  }
  assert.equal(flow.phase, 'after_school');
});

test('Monday 5: bringing lunch does not create a food purchase', () => {
  const { flow, state } = freshMonday();
  flow.chooseTransport('walk');
  flow.attendClass();

  const startCash = state.finance.accounts.cash;
  const historyBefore = state.finance.transactions.recent.length;
  const result = flow.chooseLunch('bring');

  assert.equal(result.success, true);
  assert.equal(state.finance.accounts.cash, startCash); // unchanged
  if (result.success) assert.equal(result.transaction, null);
  assert.equal(state.finance.transactions.recent.length, historyBefore);
});

test('Monday 6: activities cannot execute when their requirements are not satisfied', () => {
  const { flow } = freshMonday();
  // attendClass requires being at 'university', but morning_transport hasn't happened yet —
  // calling it out of phase must throw rather than silently doing nothing.
  assert.throws(() => flow.attendClass());
});

test('Monday 6b: an in-phase activity whose place requirement is satisfied succeeds (positive control for requirement gating)', () => {
  const { flow } = freshMonday();
  flow.chooseTransport('walk'); // moves player to 'university'
  // Confirms MondayFlow actually routes through ActivitySystem.canExecute()'s requirement check
  // (the negative case — requirement genuinely unmet — is covered directly against
  // ActivitySystem in activitySystem.test.ts, since MondayFlow's phase guard makes it impossible
  // to reach attendClass() without already being at 'university').
  const result = flow.attendClass();
  assert.equal(result.success, true);
});

test('Monday 7: failed activities (phase violations) do not partially mutate state', () => {
  const { state, flow } = freshMonday();
  const minutesBefore = state.time.minutes;
  const energyBefore = state.energy.current;
  const cashBefore = state.finance.accounts.cash;

  assert.throws(() => flow.chooseLunch('buy')); // wrong phase: still morning_transport

  assert.equal(state.time.minutes, minutesBefore);
  assert.equal(state.energy.current, energyBefore);
  assert.equal(state.finance.accounts.cash, cashBefore);
  assert.equal(flow.phase, 'morning_transport');
});

test('Monday 8: parent errand can be accepted and completed', () => {
  const { flow, state } = freshMonday();
  flow.chooseTransport('walk');
  flow.attendClass();
  flow.chooseLunch('bring');
  flow.chooseAfterSchool('home');

  assert.equal(flow.phase, 'errand');
  const cashBeforeErrand = state.finance.accounts.cash;
  const result = flow.resolveErrand(true);

  assert.ok(result);
  assert.equal(result!.success, true);
  assert.equal(state.finance.accounts.cash, cashBeforeErrand - 3);
  assert.equal(flow.phase, 'complete');
});

test('Monday 8b: parent errand can be declined with zero mutation', () => {
  const { flow, state } = freshMonday();
  flow.chooseTransport('walk');
  flow.attendClass();
  flow.chooseLunch('bring');
  flow.chooseAfterSchool('home');

  const cashBefore = state.finance.accounts.cash;
  const historyBefore = state.finance.transactions.recent.length;
  const result = flow.resolveErrand(false);

  assert.equal(result, null);
  assert.equal(state.finance.accounts.cash, cashBefore);
  assert.equal(state.finance.transactions.recent.length, historyBefore);
  assert.equal(flow.phase, 'complete');
});

test('Monday 9: end-of-day state correctly reflects the day\'s transactions', () => {
  const { flow, state } = freshMonday();
  flow.chooseTransport('bus'); // -2
  flow.attendClass();
  flow.chooseLunch('buy'); // -6
  flow.chooseAfterSchool('home');
  flow.resolveErrand(true); // -3

  const summary = flow.endDay();

  assert.equal(summary.day, 'Monday');
  assert.equal(summary.startingCash, 20);
  assert.equal(summary.spentToday, 11); // 2 + 6 + 3
  assert.equal(summary.earnedToday, 0);
  assert.equal(summary.remainingCash, 9);
  assert.equal(summary.remainingCash, state.finance.accounts.cash);
  assert.equal(summary.transactionsToday, 3);
  assert.equal(summary.errandAccepted, true);
});

test('Monday 10: savings goal progress reflects actual money saved/spent', () => {
  const { flow } = freshMonday();
  flow.chooseTransport('walk'); // no cost
  flow.attendClass();
  flow.chooseLunch('bring'); // no cost
  flow.chooseAfterSchool('home');
  flow.resolveErrand(false); // no cost

  const summary = flow.endDay();

  assert.ok(summary.goal);
  assert.equal(summary.goal!.id, 'save10_saturday');
  assert.equal(summary.goal!.target, 10);
  // No spending happened at all today, so progress toward the goal (earned - spent) is 0, not
  // some fabricated "started with $20 so goal is basically done" figure.
  assert.equal(summary.goal!.progress, 0);
});

test('Monday: endDay is only reachable once every phase has resolved', () => {
  const { flow } = freshMonday();
  assert.throws(() => flow.endDay());
  flow.chooseTransport('walk');
  assert.throws(() => flow.endDay());
});

test('Monday: the full happy path reaches "complete" and matches the spec\'s loop order', () => {
  const { flow } = freshMonday();
  assert.equal(flow.phase, 'morning_transport');
  flow.chooseTransport('bus');
  assert.equal(flow.phase, 'school');
  flow.attendClass();
  assert.equal(flow.phase, 'lunch');
  flow.chooseLunch('buy');
  assert.equal(flow.phase, 'after_school');
  flow.chooseAfterSchool('friend');
  assert.equal(flow.phase, 'errand');
  flow.resolveErrand(true);
  assert.equal(flow.phase, 'complete');
  const summary = flow.endDay();
  assert.equal(summary.day, 'Monday');
});
