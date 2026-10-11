/**
 * MoniMate — Working Person path, Level 1: "Income Management".
 * Tests: payday, fixed bills, budget mapping, WoF surprise, KiwiSaver, gross vs net.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';

const WORK = getLifePath('working');
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SUN = 6;

function newGame(): GameStore {
  const st = createInitialState('working', makeInitialFinance(WORK), makeInitialGoals(WORK));
  st.level = 1; st.levelsCompleted = 0;
  const store = new GameStore(st);
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

test('Working L1: $800 payday lands — week_started and wk_paid set', () => {
  const store = newGame();
  const cashBefore = store.state.finance.accounts.cash;
  choose(store, 'work_payday', 'take');
  assert.ok(hasFlag(store, 'week_started'), 'week_started not set');
  assert.ok(hasFlag(store, 'wk_paid'), 'wk_paid not set');
  assert.equal(store.state.finance.accounts.cash, cashBefore + 800, 'cash should increase by $800');
});

test('Working L1: pick_goal sets goal after payday', () => {
  const store = newGame();
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'save');
  assert.ok(store.state.goals.active.some((g: {id: string}) => g.id === 'work_save'), 'work_save goal not set');
});

test('Working L1: paying both bills sets wk_rent_paid and wk_car_loan_paid', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'pay_both');
  assert.ok(hasFlag(store, 'wk_rent_paid'), 'wk_rent_paid not set');
  assert.ok(hasFlag(store, 'wk_car_loan_paid'), 'wk_car_loan_paid not set');
});

test('Working L1: delaying car loan sets only wk_rent_paid', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'delay_loan');
  assert.ok(hasFlag(store, 'wk_rent_paid'), 'wk_rent_paid should be set');
  assert.ok(!hasFlag(store, 'wk_car_loan_paid'), 'wk_car_loan_paid should NOT be set for delayed payment');
});

test('Working L1: writing budget sets wk_budget_set', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, TUE, 8);
  choose(store, 'work_budget_map', 'write_budget');
  assert.ok(hasFlag(store, 'wk_budget_set'), 'wk_budget_set not set');
});

test('Working L1: app-based budget also sets wk_budget_set', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, TUE, 8);
  choose(store, 'work_budget_map', 'app');
  assert.ok(hasFlag(store, 'wk_budget_set'), 'wk_budget_set not set via app choice');
});

test('Working L1: mental note does not set wk_budget_set', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, TUE, 8);
  choose(store, 'work_budget_map', 'mental_note');
  assert.ok(!hasFlag(store, 'wk_budget_set'), 'wk_budget_set should NOT be set for mental_note');
});

test('Working L1: booking WoF sets wk_wof_done', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'save');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, WED, 7);
  choose(store, 'work_wof', 'book_now');
  assert.ok(hasFlag(store, 'wk_wof_done'), 'wk_wof_done not set after booking');
});

test('Working L1: driving without WoF does not set wk_wof_done', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'save');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, WED, 7);
  choose(store, 'work_wof', 'drive_risk');
  assert.ok(!hasFlag(store, 'wk_wof_done'), 'wk_wof_done should NOT be set for drive_risk choice');
});

test('Working L1: emergency fund transfer sets emergency_buffer_set', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'save');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, WED, 7);
  choose(store, 'work_wof', 'book_now');
  advanceTo(store, WED, 17);
  choose(store, 'work_emergency_fund', 'start');
  assert.ok(hasFlag(store, 'emergency_buffer_set'), 'emergency_buffer_set not set');
  assert.ok(hasFlag(store, 'wk_emergency_started'), 'wk_emergency_started not set');
});

test('Working L1: KiwiSaver lesson sets wk_ks_understood', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'kiwisaver');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, THU, 9);
  choose(store, 'work_kiwisaver', 'understand');
  assert.ok(hasFlag(store, 'wk_ks_understood'), 'wk_ks_understood not set');
  assert.ok(hasFlag(store, 'kiwisaver_joined'), 'kiwisaver_joined not set');
});

test('Working L1: boosting KiwiSaver to 6% also sets wk_ks_understood and kiwisaver_joined', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'kiwisaver');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, THU, 9);
  choose(store, 'work_kiwisaver', 'increase');
  assert.ok(hasFlag(store, 'wk_ks_understood'), 'wk_ks_understood not set via increase');
  assert.ok(hasFlag(store, 'kiwisaver_joined'), 'kiwisaver_joined not set via increase');
});

test('Working L1: student loan lesson sets wk_loan_understood', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'debt');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, THU, 9);
  choose(store, 'work_kiwisaver', 'no_touch'); // complete KiwiSaver so it doesn't block student loan
  advanceTo(store, THU, 14);
  choose(store, 'work_student_loan', 'understand');
  assert.ok(hasFlag(store, 'wk_loan_understood'), 'wk_loan_understood not set');
});

test('Working L1: end-of-week saved sets wk_saved and wk_recap_done', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'save');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, FRI, 16);
  choose(store, 'work_friday_recap', 'saved');
  assert.ok(hasFlag(store, 'wk_saved'), 'wk_saved not set');
  assert.ok(hasFlag(store, 'wk_recap_done'), 'wk_recap_done not set');
});

test('Working L1: overspent choice sets wk_recap_done but not wk_saved', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, FRI, 16);
  choose(store, 'work_friday_recap', 'overspent');
  assert.ok(hasFlag(store, 'wk_recap_done'), 'wk_recap_done not set');
  assert.ok(!hasFlag(store, 'wk_saved'), 'wk_saved should NOT be set for overspent choice');
});

test('Working L1: Sunday gross vs net lesson sets wk_gross_net_known', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 2500;
  choose(store, 'work_payday', 'take');
  choose(store, 'work_pick_goal', 'budget');
  choose(store, 'work_fixed_bills', 'pay_both');
  advanceTo(store, SUN, 13);
  choose(store, 'work_gross_net', 'explain');
  assert.ok(hasFlag(store, 'wk_gross_net_known'), 'wk_gross_net_known not set via explain');
});
