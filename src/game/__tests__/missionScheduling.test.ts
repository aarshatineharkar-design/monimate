/**
 * MoniMate 2.0 — Step 13: focused tests for the `pickup_groceries` day-window fix.
 *
 * Scope: this file tests the LIVE mission engine's scheduling behavior (src/lib/missions.ts,
 * driven through the real GameStore), not Core Simulation — it lives under src/game/__tests__/
 * only because that's what tsconfig.game-test.json compiles/runs, same as mondayAdapter.test.ts.
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

/** A store that has attended class (so `attendedToday` is genuinely satisfiable) and is standing
 *  at home — the two non-day conditions `pickup_groceries` also requires. Reuses the same fixture
 *  pattern as mondayAdapter.test.ts's storeAtUniversity(). */
function storeAttendedAndHome(): GameStore {
  const store = freshDefaultStore();
  // Monday starts with Mum's pocket-money message (a phone message, highest priority) — accept it
  // the way a player would, so later actionableStep() calls surface the mission under test.
  const pm = store.actionableStep()!;
  store.applyChoice(pm.def.id, pm.step.choices![0]);
  const goal = store.actionableStep()!; // then the phone asks for this week's goal
  store.applyChoice(goal.def.id, goal.step.choices![0]);
  store.advance(64); // -> 8:05 AM
  store.enterPlace('university');
  const outcome = store.attendClass();
  if (!outcome.ok) throw new Error('test fixture: executeAttendClass unexpectedly failed');
  store.enterPlace('home');
  return store;
}

const pickupState = (store: GameStore) => store.state.missions.find(m => m.id === 'pickup_groceries')?.state;

test('pickup_groceries A: locked before its intended Monday-afternoon window (still Monday, before 15:30), even with attendance and location satisfied', () => {
  const store = storeAttendedAndHome(); // now ~12:05 PM Monday, attended, at home
  assert.equal(pickupState(store), 'locked');
  store.advance(60); // -> 13:05 PM, still before the 15:30 window
  assert.equal(pickupState(store), 'locked');
});

test('pickup_groceries B: becomes available during the intended Monday-afternoon window (15:30-19:00) once attendance and location are satisfied', () => {
  const store = storeAttendedAndHome(); // ~12:05 PM Monday, attended, at home
  store.advance(3 * 60 + 30); // 12:05 -> 15:35 PM, staying at home the whole time
  assert.equal(pickupState(store), 'available');
});

test('pickup_groceries C: remains locked in its Monday window when attendedToday is false (class was never attended)', () => {
  const store = freshDefaultStore(); // never attended class
  store.advance(65);
  store.earn(20, 'other', 'seed');
  store.enterPlace('home'); // at the right place...
  store.advance(8 * 60); // ...and well into the 15:30-19:00 window (7:00 -> ~15:00, then some)
  // Advance further to be solidly inside the window without ever attending class.
  store.advance(60); // now ~16:05, still never attended
  assert.equal(pickupState(store), 'locked');
});

test('pickup_groceries D: the Tuesday 15:30-19:00 slot does NOT open the mission even when attendedToday and location are satisfied THAT day (isolates the day-index fix from the attendedToday fix)', () => {
  const store = freshDefaultStore();
  // Deliberately do nothing during Monday's own window — advance straight through Monday without
  // attending class or being marked present, so Monday's occurrence of the mission never has a
  // chance to become available (attendedToday is false all day Monday), then attend class again on
  // Tuesday specifically, so Tuesday's attendedToday is genuinely true when Tuesday's 15:30-19:00
  // slot arrives. If `days: [0]` (Monday-only) were wrong and the window were actually keyed to
  // "any day", this would incorrectly open on Tuesday; with the Step 13 fix it must not.
  store.advance(24 * 60); // Monday 7:00 AM -> Tuesday 7:00 AM, never attending, never at home-idle
  store.advance(65); // Tuesday 7:00 -> 8:05 AM
  store.earn(20, 'other', 'seed pocket money for test');
  store.enterPlace('university');
  const outcome = store.attendClass();
  assert.equal(outcome.ok, true); // Tuesday's attendedToday is now genuinely true
  store.enterPlace('home');
  store.advance(3 * 60 + 30); // Tuesday 12:05 -> Tuesday 15:35 — inside 15:30-19:00, at home, attended
  // Monday's window is closed (day mismatch) — Tuesday's own 15:30-19:00 slot never opens it because
  // `days: [0]` only matches Monday, not "this weekday's slot every day".
  assert.equal(pickupState(store), 'locked');
});

test('pickup_groceries E: existing mission behavior is not regressed — the mission can still be completed end to end once genuinely eligible', () => {
  const store = storeAttendedAndHome();
  store.advance(3 * 60 + 30); // -> Monday 15:35, mission now available
  assert.equal(pickupState(store), 'available');

  // 'available' is an offer, not yet actionable — same as any other mission, the player (here, the
  // test) accepts it via startMission() before its step becomes actionable.
  store.startMission('pickup_groceries');
  const actionable = store.actionableStep();
  assert.ok(actionable, 'expected the grocery errand step to be actionable at home');
  assert.equal(actionable!.def.id, 'pickup_groceries');

  const balanceBefore = store.state.finance.accounts.cash;
  store.applyChoice('pickup_groceries', actionable!.step.choices![0]);
  assert.equal(store.state.finance.accounts.cash, balanceBefore + 15); // "On it" choice hands over $15
  assert.equal(store.state.world.flags.includes('errand_accepted'), true);
  // Mission has advanced to its second step (the real shopping step) — not completed by this
  // choice alone, since `finish` is not set on it (completion happens via awaitsPurchase).
  const rt = store.state.missions.find(m => m.id === 'pickup_groceries')!;
  assert.equal(rt.state, 'active');
  assert.equal(rt.stepIndex, 1);
});
