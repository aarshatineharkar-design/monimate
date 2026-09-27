/**
 * MoniMate 2.0 — Step 20: proves the two adapter synchronization branches that neither shipped
 * adapter function (`executeAttendClass`/`executeHelpParents`) has ever exercised:
 *
 *   1. `movesPlayerTo` — applying a resulting location change back to the live GameStore.
 *   2. A negative financial effect (an expense) — applying it back via the live GameStore.
 *
 * ATTEND_CLASS has neither. HELP_PARENTS has a financial effect but it's income-only (+5), never
 * an expense. Per the Step 19 audit, this is a real, previously-unexercised gap in the adapter
 * pattern, not a bug — nothing has ever needed either branch live. Per the Step 20 instructions,
 * this file does NOT wire a third feature into page.tsx or mondayAdapter.ts to manufacture
 * coverage — that would mean forcing existing mission-owned gameplay (`GET_MILK_FOR_MUM` already
 * shadow-duplicates the live `pickup_groceries` mission; `WALK_TO_SCHOOL` already shadow-duplicates
 * `get_to_school`) through the adapter merely to exercise a code path, which Step 17/19 already
 * rejected as an architecture regression.
 *
 * Instead, `runActivityAndSyncContract()` below is a TEST-ONLY harness, private to this file: it
 * mirrors the exact shape `executeAttendClass`/`executeHelpParents` already use (build ephemeral
 * state -> ActivitySystem.execute() -> apply back via GameStore's own public methods only), but is
 * never exported, never imported by mondayAdapter.ts or page.tsx, and adds no new live gameplay.
 * It exists purely to prove — under test, with real assertions — which existing GameStore method is
 * the correct one for each branch, and that applying it preserves validate-before-mutate atomicity.
 * `mondayAdapter.ts` itself is untouched by this step: it remains the only deliberate, SHIPPED
 * Core-Sim <-> live seam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClockSystem, PlayerSystem, EnergySystem, FinanceSystem, ActivitySystem } from '../systems';
import { WALK_TO_SCHOOL } from '../content/school/mondayActivities';
import { GET_MILK_FOR_MUM } from '../content/school/mondayActivities';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';
import type { ActivityDef, ActivityResult } from '../types/activity';
import type { TimeState } from '../types/time';
import type { PlayerState } from '../types/player';
import type { EnergyState } from '../types/energy';
import type { FinancialState } from '../types/finance';

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
  store.earn(20, 'test', 'seed money for test');
  return store;
}

/** Exact duplicate, for this test file's own use, of mondayAdapter.ts's private (non-exported)
 *  buildEphemeralState() — reconstructed locally rather than imported, since it is intentionally
 *  not part of that file's public surface. Kept byte-identical in shape to the real one so this
 *  harness proves the real adapter's construction pattern, not a different one. */
function buildEphemeralState(store: GameStore): { time: TimeState; player: PlayerState; energy: EnergyState; finance: FinancialState } {
  const s = store.state;
  const time: TimeState = { minutes: s.minutes, paused: false, timeMultiplier: 1 };
  const player: PlayerState = {
    identity: { id: 'player', lifePath: 'school' },
    attributes: { level: 1, xp: 0, currentActivity: null, transportation: { hasBike: false, hasBusPass: false } },
    world: { x: 0, y: 0, vx: 0, vy: 0, facing: 0, scene: 'outdoor', place: s.player.place ?? 'home', movementStatus: 'idle' },
  };
  const liveEnergy = store.getEnergy();
  const energy: EnergyState = { current: liveEnergy.current, max: liveEnergy.max, recoveryPerHourAsleep: 12.5 };
  const finance: FinancialState = {
    accounts: { cash: s.finance.balance, checking: 0, savings: s.finance.savings, emergencyFund: s.finance.emergencyFund },
    income: { weeklyIncome: s.finance.weeklyIncome, job: null, sideIncome: 0, businessIncome: 0, investmentIncome: 0 },
    expenses: { recurring: [] }, credit: { score: null, cards: [] }, debt: { loans: [] },
    assets: { vehicles: [], property: [], investments: [], businesses: [] }, liabilities: { items: [] },
    transactions: { recent: [], recentCap: 10 }, totals: { totalEarned: 0, totalSpent: 0 },
  };
  return { time, player, energy, finance };
}

/**
 * TEST-ONLY harness — see the module comment. Mirrors executeAttendClass()/executeHelpParents()'s
 * exact shape (validate-before-mutate via ActivitySystem.canExecute(), apply-back only via
 * GameStore's own public methods, never a direct `store.state` write, never leaking ephemeral
 * state), extended with the two branches neither shipped function needed:
 *
 *  - a negative `result.transaction.amount` -> `store.spend(-amount, category, description)`.
 *    (`store.spend()`'s own signature takes a positive amount to subtract — passing the signed
 *    value straight through would silently no-op, since both spend()/earn() guard `amount <= 0`
 *    internally; confirmed by reading their bodies in store.ts before writing this.)
 *  - `def.movesPlayerTo` -> `store.enterPlace(def.movesPlayerTo)` (the only public GameStore method
 *    that mutates `s.player.place`, and the one already used everywhere else in this codebase for a
 *    location change — a raw field write would skip its scene/door/hours bookkeeping).
 *
 * Returns the raw `ActivityResult` so tests can assert against both Core Simulation's own result
 * and the live GameStore's resulting state.
 */
function runActivityAndSyncContract(store: GameStore, def: ActivityDef): ActivityResult {
  const { time, player, energy, finance } = buildEphemeralState(store);
  const clock = new ClockSystem(time);
  const playerSystem = new PlayerSystem(player);
  const energySystem = new EnergySystem(energy);
  const financeSystem = new FinanceSystem(finance);
  const activitySystem = new ActivitySystem(clock, playerSystem, energySystem, financeSystem);

  const result = activitySystem.execute(def);
  if (!result.success) return result; // zero mutation — canExecute() already validated everything

  if (result.timeAdvancedMinutes > 0) store.advance(result.timeAdvancedMinutes);
  if (result.energyConsumed > 0) store.consumeEnergy(result.energyConsumed);
  if (result.transaction) {
    if (result.transaction.amount > 0) {
      store.earn(result.transaction.amount, result.transaction.category, result.transaction.description);
    } else if (result.transaction.amount < 0) {
      store.spend(-result.transaction.amount, result.transaction.category, result.transaction.description);
    }
  }
  if (def.movesPlayerTo) store.enterPlace(def.movesPlayerTo);
  store.setCurrentActivity(player.attributes.currentActivity);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// Branch 1 — movesPlayerTo (WALK_TO_SCHOOL: home -> university, no requirement, no financial effect)
// ══════════════════════════════════════════════════════════════════════════

test('AdapterContract 1: successful movesPlayerTo activity relocates the live player via store.enterPlace()', () => {
  const store = storeAtSchoolOpenTime(); // 8:05 AM, at 'home' — within university's open hours
  assert.equal(store.state.player.place, 'home');
  const result = runActivityAndSyncContract(store, WALK_TO_SCHOOL);
  assert.equal(result.success, true);
  assert.equal(store.state.player.place, 'university');
});

test('AdapterContract 2: enterPlace() is the correct method — it also updates scene, not just place, exactly as every other live location change does', () => {
  const store = storeAtSchoolOpenTime();
  const result = runActivityAndSyncContract(store, WALK_TO_SCHOOL);
  assert.equal(result.success, true);
  // A raw field write (`s.player.place = 'university'`) would never do this — proving enterPlace()
  // is the correct existing method, not just "a" method that happens to work.
  assert.notEqual(store.state.player.scene, 'outdoor'); // university's interior scene, not the street
});

test('AdapterContract 3: time and energy are still applied correctly alongside the location change', () => {
  const store = storeAtSchoolOpenTime();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const result = runActivityAndSyncContract(store, WALK_TO_SCHOOL);
  assert.equal(result.success, true);
  assert.equal(store.state.minutes, minutesBefore + 15);
  assert.equal(store.getEnergy().current, energyBefore - 3);
});

test('AdapterContract 4: failed movesPlayerTo activity (insufficient energy) leaves location, time, and energy completely unchanged', () => {
  const store = storeAtSchoolOpenTime();
  store.consumeEnergy(store.getEnergy().current - 1); // leaves 1, less than WALK_TO_SCHOOL's cost of 3
  const placeBefore = store.state.player.place;
  const sceneBefore = store.state.player.scene;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;

  const result = runActivityAndSyncContract(store, WALK_TO_SCHOOL);

  assert.equal(result.success, false);
  assert.equal(store.state.player.place, placeBefore); // enterPlace() never called
  assert.equal(store.state.player.scene, sceneBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
});

// ══════════════════════════════════════════════════════════════════════════
// Branch 2 — negative financial effect (GET_MILK_FOR_MUM: -$3, requirement place 'home')
// ══════════════════════════════════════════════════════════════════════════

test('AdapterContract 5: successful negative financial effect is applied via store.spend(), not store.earn()', () => {
  const store = storeAtSchoolOpenTime(); // at 'home' — GET_MILK_FOR_MUM's requirement
  const balanceBefore = store.state.finance.balance;
  const result = runActivityAndSyncContract(store, GET_MILK_FOR_MUM);
  assert.equal(result.success, true);
  assert.equal(store.state.finance.balance, balanceBefore - 3); // went DOWN, confirming spend() not earn()
});

test('AdapterContract 6: the resulting ledger entry carries the activity\'s own signed amount/category/description', () => {
  const store = storeAtSchoolOpenTime();
  const ledgerLengthBefore = store.state.ledger.length;
  const result = runActivityAndSyncContract(store, GET_MILK_FOR_MUM);
  assert.equal(result.success, true);
  assert.equal(store.state.ledger.length, ledgerLengthBefore + 1);
  const entry = store.state.ledger[store.state.ledger.length - 1];
  assert.equal(entry.amount, -3); // GameStore's own ledger always stores the signed amount
  assert.equal(entry.category, 'food'); // GET_MILK_FOR_MUM.financialEffect.category
  assert.equal(entry.label, 'Milk for Mum'); // GET_MILK_FOR_MUM.financialEffect.description
});

test('AdapterContract 7: insufficient funds rejects the activity atomically — money, ledger, time, and energy all unchanged', () => {
  const store = freshDefaultStore(); // School's real starting balance is $0
  store.advance(65); // 7:00 -> 8:05 AM, still at home, still $0
  assert.equal(store.state.finance.balance < 3, true); // genuinely can't afford it

  const balanceBefore = store.state.finance.balance;
  const ledgerLengthBefore = store.state.ledger.length;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const placeBefore = store.state.player.place;

  const result = runActivityAndSyncContract(store, GET_MILK_FOR_MUM);

  assert.equal(result.success, false);
  assert.equal(store.state.finance.balance, balanceBefore);
  assert.equal(store.state.ledger.length, ledgerLengthBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.player.place, placeBefore);
});

test('AdapterContract 8: a requirement failure (wrong location) is also atomic — GET_MILK_FOR_MUM requires being at home', () => {
  const store = storeAtSchoolOpenTime();
  const entered = store.enterPlace('university');
  assert.equal(entered.ok, true);
  assert.equal(store.state.player.place, 'university'); // not 'home' — GET_MILK_FOR_MUM's requirement

  const balanceBefore = store.state.finance.balance;
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const placeBefore = store.state.player.place;
  const ledgerLengthBefore = store.state.ledger.length;

  const result = runActivityAndSyncContract(store, GET_MILK_FOR_MUM);

  assert.equal(result.success, false);
  assert.equal(result.reason, 'requirement_not_met');
  assert.equal(store.state.finance.balance, balanceBefore);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.player.place, placeBefore); // enterPlace('home') never called
  assert.equal(store.state.ledger.length, ledgerLengthBefore);
});

test('AdapterContract 9: the harness does not leak or expose ephemeral Core Simulation state (returns the plain ActivityResult only)', () => {
  const store = storeAtSchoolOpenTime();
  const result = runActivityAndSyncContract(store, GET_MILK_FOR_MUM);
  assert.equal(result.success, true);
  if (result.success) {
    // ActivityResult's own documented shape — no ephemeral time/player/energy/finance object refs.
    assert.deepEqual(
      Object.keys(result).sort(),
      ['activityId', 'energyConsumed', 'success', 'timeAdvancedMinutes', 'transaction'].sort(),
    );
  }
});

test('AdapterContract 10: currentActivity is still synchronized correctly alongside both new branches', () => {
  const storeA = storeAtSchoolOpenTime();
  const resultA = runActivityAndSyncContract(storeA, WALK_TO_SCHOOL);
  assert.equal(resultA.success, true);
  assert.equal(storeA.state.currentActivity, 'walking'); // WALK_TO_SCHOOL's category is 'travel'

  const storeB = storeAtSchoolOpenTime();
  const resultB = runActivityAndSyncContract(storeB, GET_MILK_FOR_MUM);
  assert.equal(resultB.success, true);
  assert.equal(storeB.state.currentActivity, 'chore'); // GET_MILK_FOR_MUM's category is 'chore'
});
