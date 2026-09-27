/**
 * MoniMate — activities run by ActivitySystem directly against the live game (GameStore.runActivity).
 *
 * There is one engine: ActivitySystem validates place/energy/money first, then moves the real clock,
 * energy and ledger. These tests cover the two branches the shipped activities (Attend Class, Help
 * Parents) don't use — a location change and an expense — and that a failure changes nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WALK_TO_SCHOOL, GET_MILK_FOR_MUM } from '../content/school/mondayActivities';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';

const SCHOOL_CONFIG = LIFE_PATHS.find((p) => p.id === 'school')!;

function freshDefaultStore(): GameStore {
  const finance = makeInitialFinance(SCHOOL_CONFIG);
  const state = createInitialState('school', finance);
  return new GameStore(state);
}

/** A store advanced to 8:05 AM Monday with $20 seeded — same fixture shape as
 *  mondayAdapter.test.ts's storeAtSchoolOpenTime(), reused here so `enterPlace('university')`
 *  (needed to test GET_MILK_FOR_MUM's requirement-failure branch) is valid against world.ts's real
 *  school-hours window. */
function storeAtSchoolOpenTime(): GameStore {
  const store = freshDefaultStore();
  store.advance(65); // 7:00 -> 8:05 AM
  store.earn(20, 'other', 'seed money for test');
  return store;
}

// ══════════════════════════════════════════════════════════════════════════
// Branch 1 — movesPlayerTo (WALK_TO_SCHOOL: home -> university, no requirement, no financial effect)
// ══════════════════════════════════════════════════════════════════════════

test('LiveActivity 1: successful movesPlayerTo activity relocates the live player via store.enterPlace()', () => {
  const store = storeAtSchoolOpenTime(); // 8:05 AM, at 'home' — within university's open hours
  assert.equal(store.state.player.place, 'home');
  const result = store.runActivity(WALK_TO_SCHOOL);
  assert.equal(result.ok, true);
  assert.equal(store.state.player.place, 'university');
});

test('LiveActivity 2: enterPlace() is the correct method — it also updates scene, not just place, exactly as every other live location change does', () => {
  const store = storeAtSchoolOpenTime();
  const result = store.runActivity(WALK_TO_SCHOOL);
  assert.equal(result.ok, true);
  // A raw field write (`s.player.place = 'university'`) would never do this — proving enterPlace()
  // is the correct existing method, not just "a" method that happens to work.
  assert.notEqual(store.state.player.scene, 'outdoor'); // university's interior scene, not the street
});

test('LiveActivity 3: time and energy are still applied correctly alongside the location change', () => {
  const store = storeAtSchoolOpenTime();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const result = store.runActivity(WALK_TO_SCHOOL);
  assert.equal(result.ok, true);
  assert.equal(store.state.minutes, minutesBefore + 15);
  assert.equal(store.getEnergy().current, energyBefore - 3);
});

test('LiveActivity 4: failed movesPlayerTo activity (insufficient energy) leaves location, time, and energy completely unchanged', () => {
  const store = storeAtSchoolOpenTime();
  store.consumeEnergy(store.getEnergy().current - 1); // leaves 1, less than WALK_TO_SCHOOL's cost of 3
  const placeBefore = store.state.player.place;
  const sceneBefore = store.state.player.scene;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;

  const result = store.runActivity(WALK_TO_SCHOOL);

  assert.equal(result.ok, false);
  assert.equal(store.state.player.place, placeBefore); // enterPlace() never called
  assert.equal(store.state.player.scene, sceneBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
});

// ══════════════════════════════════════════════════════════════════════════
// Branch 2 — negative financial effect (GET_MILK_FOR_MUM: -$3, requirement place 'home')
// ══════════════════════════════════════════════════════════════════════════

test('LiveActivity 5: successful negative financial effect is applied via store.spend(), not store.earn()', () => {
  const store = storeAtSchoolOpenTime(); // at 'home' — GET_MILK_FOR_MUM's requirement
  const balanceBefore = store.state.finance.accounts.cash;
  const result = store.runActivity(GET_MILK_FOR_MUM);
  assert.equal(result.ok, true);
  assert.equal(store.state.finance.accounts.cash, balanceBefore - 3); // went DOWN, confirming spend() not earn()
});

test('LiveActivity 6: the resulting ledger entry carries the activity\'s own signed amount/category/description', () => {
  const store = storeAtSchoolOpenTime();
  const ledgerLengthBefore = store.state.finance.transactions.recent.length;
  const result = store.runActivity(GET_MILK_FOR_MUM);
  assert.equal(result.ok, true);
  assert.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore + 1);
  const entry = store.state.finance.transactions.recent[store.state.finance.transactions.recent.length - 1];
  assert.equal(entry.amount, -3); // GameStore's own ledger always stores the signed amount
  assert.equal(entry.category, 'food'); // GET_MILK_FOR_MUM.financialEffect.category
  assert.equal(entry.description, 'Milk for Mum'); // GET_MILK_FOR_MUM.financialEffect.description
});

test('LiveActivity 7: insufficient funds rejects the activity atomically — money, ledger, time, and energy all unchanged', () => {
  const store = freshDefaultStore(); // School's real starting balance is $0
  store.advance(65); // 7:00 -> 8:05 AM, still at home, still $0
  assert.equal(store.state.finance.accounts.cash < 3, true); // genuinely can't afford it

  const balanceBefore = store.state.finance.accounts.cash;
  const ledgerLengthBefore = store.state.finance.transactions.recent.length;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const placeBefore = store.state.player.place;

  const result = store.runActivity(GET_MILK_FOR_MUM);

  assert.equal(result.ok, false);
  assert.equal(store.state.finance.accounts.cash, balanceBefore);
  assert.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.player.place, placeBefore);
});

test('LiveActivity 8: a requirement failure (wrong location) is also atomic — GET_MILK_FOR_MUM requires being at home', () => {
  const store = storeAtSchoolOpenTime();
  const entered = store.enterPlace('university');
  assert.equal(entered.ok, true);
  assert.equal(store.state.player.place, 'university'); // not 'home' — GET_MILK_FOR_MUM's requirement

  const balanceBefore = store.state.finance.accounts.cash;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const placeBefore = store.state.player.place;
  const ledgerLengthBefore = store.state.finance.transactions.recent.length;

  const result = store.runActivity(GET_MILK_FOR_MUM);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'requirement_not_met');
  assert.equal(store.state.finance.accounts.cash, balanceBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.player.place, placeBefore); // enterPlace('home') never called
  assert.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore);
});

test('LiveActivity 9: every transaction an activity makes says why and where (blueprint rule: every transaction has a reason)', () => {
  const store = storeAtSchoolOpenTime();
  const result = store.runActivity(GET_MILK_FOR_MUM);
  assert.equal(result.ok, true);
  const tx = store.state.finance.transactions.recent.at(-1)!;
  assert.equal(tx.account, 'cash');
  assert.equal(tx.type, 'expense');
  assert.equal(tx.source, 'dairy');
  assert.equal(tx.timestamp, store.state.minutes);
  assert.equal(store.state.today.spent, 3, 'the day record is kept in step with the ledger');
});

test('LiveActivity 10: currentActivity is still synchronized correctly alongside both new branches', () => {
  const storeA = storeAtSchoolOpenTime();
  const resultA = storeA.runActivity(WALK_TO_SCHOOL);
  assert.equal(resultA.ok, true);
  assert.equal(storeA.state.currentActivity, 'walking'); // WALK_TO_SCHOOL's category is 'travel'

  const storeB = storeAtSchoolOpenTime();
  const resultB = storeB.runActivity(GET_MILK_FOR_MUM);
  assert.equal(resultB.ok, true);
  assert.equal(storeB.state.currentActivity, 'chore'); // GET_MILK_FOR_MUM's category is 'chore'
});
