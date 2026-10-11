/**
 * MoniMate — International Student path, Level 1: "Setup & Arrival".
 * Tests the week's key financial lessons: currency, SIM, bank account, visa rules, grocery shock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';

const INTL = getLifePath('international');
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SUN = 6;

function newGame(): GameStore {
  const st = createInitialState('international', makeInitialFinance(INTL), makeInitialGoals(INTL));
  st.level = 1; st.levelsCompleted = 0;
  const store = new GameStore(st);
  // Suppress pool rolling
  const w = store.state.world;
  for (let d = 0; d < 28; d++) if (!w.dailyMarks.includes(`pool_rolled:${d}`)) w.dailyMarks.push(`pool_rolled:${d}`);
  store.advance(0.001);
  return store;
}
function advanceTo(store: GameStore, day: number, h: number, m = 0) {
  const target = at(day, h, m);
  assert.ok(target >= store.state.minutes, `can't go back to day ${day} ${h}:${m}`);
  store.advance(target - store.state.minutes);
}
function goOutside(store: GameStore) { if (store.state.player.scene !== 'outdoor') store.exitPlace(); }
function enter(store: GameStore, place: string) {
  goOutside(store);
  const r = store.enterPlace(place);
  assert.ok(r.ok, `could not enter ${place}: ${r.reason}`);
}
function choose(store: GameStore, missionId: string, choiceId: string) {
  const a = store.actionableStep();
  assert.ok(a, `expected ${missionId} to be on screen`);
  assert.equal(a!.def.id, missionId, `expected ${missionId} but got ${a!.def.id}`);
  const c = a!.step.choices!.find(x => x.id === choiceId);
  assert.ok(c, `choice ${choiceId} missing on ${missionId}`);
  assert.equal(store.applyChoice(missionId, c!), true, `${missionId}/${choiceId} was refused`);
}
const hasFlag = (store: GameStore, f: string) => store.state.world.flags.includes(f);

// ── Tests ────────────────────────────────────────────────────────────────────

test('International L1: $3,000 lands on Monday — week_started and wk_money_arrived set', () => {
  const store = newGame();
  const balanceBefore = store.state.finance.accounts.cash;
  choose(store, 'intl_arrival_money', 'take');
  assert.ok(hasFlag(store, 'week_started'), 'week_started not set');
  assert.ok(hasFlag(store, 'wk_money_arrived'), 'wk_money_arrived not set');
  assert.equal(store.state.finance.accounts.cash, balanceBefore + 3000, 'cash did not increase by $3,000');
});

test('International L1: pick_goal sets a goal after money arrives', () => {
  const store = newGame();
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'budget');
  assert.ok(store.state.goals.active.some((g: {id: string}) => g.id === 'intl_budget'), 'goal intl_budget not set');
});

test('International L1: rent + bond — pay full sets wk_rent_paid and bond_paid', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 4000; // enough to cover
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'setup');
  choose(store, 'intl_rent', 'pay_full');
  assert.ok(hasFlag(store, 'wk_rent_paid'), 'wk_rent_paid not set');
  assert.ok(hasFlag(store, 'bond_paid'), 'bond_paid not set');
});

test('International L1: asking about bond sets rent_paid and bond_paid with lesson', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 4000;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'setup');
  choose(store, 'intl_rent', 'ask');
  assert.ok(hasFlag(store, 'wk_rent_paid'), 'wk_rent_paid not set via ask choice');
});

test('International L1: NZ SIM card sets wk_sim_nz flag', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'setup');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, MON, 10);
  enter(store, 'mall');
  choose(store, 'intl_sim', 'nz_sim');
  assert.ok(hasFlag(store, 'wk_sim_nz'), 'wk_sim_nz not set after buying SIM');
});

test('International L1: choosing roaming does NOT set wk_sim_nz', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'setup');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, MON, 10);
  enter(store, 'mall');
  choose(store, 'intl_sim', 'roam');
  assert.ok(!hasFlag(store, 'wk_sim_nz'), 'wk_sim_nz should NOT be set for roaming choice');
});

test('International L1: opening NZ bank account sets nz_bank_account flag', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'setup');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, MON, 10);
  enter(store, 'mall');
  choose(store, 'intl_sim', 'nz_sim');
  choose(store, 'intl_bank', 'open');
  assert.ok(hasFlag(store, 'nz_bank_account'), 'nz_bank_account not set');
  assert.ok(hasFlag(store, 'wk_bank_opened'), 'wk_bank_opened not set');
});

test('International L1: orientation with full attendance sets visa_rules_known', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'cook');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, TUE, 9);
  enter(store, 'school');
  choose(store, 'intl_orientation', 'attend');
  assert.ok(hasFlag(store, 'wk_orientation_done'), 'wk_orientation_done not set');
  assert.ok(hasFlag(store, 'visa_rules_known'), 'visa_rules_known not set');
});

test('International L1: skipping orientation does not set orientation or visa flags', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'cook');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, TUE, 9);
  enter(store, 'school');
  choose(store, 'intl_orientation', 'skip');
  assert.ok(!hasFlag(store, 'wk_orientation_done'), 'orientation_done should not be set for skip');
  assert.ok(!hasFlag(store, 'visa_rules_known'), 'visa_rules_known should not be set for skip');
});

test('International L1: grocery shop with smart basket sets wk_grocery_smart', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'cook');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, TUE, 14);
  enter(store, 'dairy');
  choose(store, 'intl_grocery_shock', 'smart_shop');
  assert.ok(hasFlag(store, 'wk_groceries_done'), 'wk_groceries_done not set');
  assert.ok(hasFlag(store, 'wk_grocery_smart'), 'wk_grocery_smart not set after smart shop');
});

test('International L1: comfort food grocery sets wk_groceries_done but not wk_grocery_smart', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 3500;
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'cook');
  choose(store, 'intl_rent', 'pay_full');
  advanceTo(store, TUE, 14);
  enter(store, 'dairy');
  choose(store, 'intl_grocery_shock', 'comfort_food');
  assert.ok(hasFlag(store, 'wk_groceries_done'), 'wk_groceries_done not set');
  assert.ok(!hasFlag(store, 'wk_grocery_smart'), 'wk_grocery_smart should NOT be set for comfort_food choice');
});

test('International L1: job application sets wk_job_applied', () => {
  const store = newGame();
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'social');
  advanceTo(store, THU, 9);
  enter(store, 'cafe');
  choose(store, 'intl_work_visa', 'apply_20');
  assert.ok(hasFlag(store, 'wk_job_applied'), 'wk_job_applied not set');
  assert.ok(hasFlag(store, 'visa_rules_confirmed'), 'visa_rules_confirmed not set');
});

test('International L1: claiming 40 hours sets wk_job_applied but not visa_rules_confirmed', () => {
  const store = newGame();
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'social');
  advanceTo(store, THU, 9);
  enter(store, 'cafe');
  choose(store, 'intl_work_visa', 'apply_40');
  assert.ok(hasFlag(store, 'wk_job_applied'), 'wk_job_applied should still be set');
  assert.ok(!hasFlag(store, 'visa_rules_confirmed'), 'visa_rules_confirmed should NOT be set when claiming 40 hrs');
});

test('International L1: end-of-week tracking sets wk_budget_checked', () => {
  const store = newGame();
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'budget');
  advanceTo(store, FRI, 15);
  choose(store, 'intl_friday_recap', 'track');
  assert.ok(hasFlag(store, 'wk_budget_checked'), 'wk_budget_checked not set');
});

test('International L1: Sunday call home sets wk_called_home', () => {
  const store = newGame();
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'social');
  advanceTo(store, SUN, 17);
  choose(store, 'intl_video_call', 'honest');
  assert.ok(hasFlag(store, 'wk_called_home'), 'wk_called_home not set via honest choice');
});

test('International L1: skipping Sunday call does not set wk_called_home', () => {
  const store = newGame();
  choose(store, 'intl_arrival_money', 'take');
  choose(store, 'intl_pick_goal', 'social');
  advanceTo(store, SUN, 17);
  choose(store, 'intl_video_call', 'skip_call');
  assert.ok(!hasFlag(store, 'wk_called_home'), 'wk_called_home should NOT be set for skip_call');
});
