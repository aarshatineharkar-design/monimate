/**
 * MoniMate — School levels. Each level is a week; finishing Sunday's recap starts the next level on
 * Monday with new story, new goals and new side tasks, and each level asks more of the player.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';
import { BUS_STOPS, INTERIOR_TILE_PX, getInterior, nextBusAt, tileToPx } from '../../lib/world';
import { pathUnlocked, maxLevel } from '../../lib/pathRules';
import type { GameEvent, SceneId } from '../../lib/types';

const SCHOOL = getLifePath('school');
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;

/** A School game at a given level, on a quiet world (no random side tasks) unless `pools` is set. */
function newGame(level = 1, pools = false): GameStore {
  const st = createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL));
  st.level = level; st.levelsCompleted = level - 1;
  const store = new GameStore(st);
  if (!pools) {
    const w = store.state.world;
    w.dailyMarks = w.dailyMarks.filter(m => !m.startsWith('pool:'));
    for (let d = 0; d < 28; d++) if (!w.dailyMarks.includes(`pool_rolled:${d}`)) w.dailyMarks.push(`pool_rolled:${d}`);
    store.advance(0.001);
  }
  return store;
}
function advanceTo(store: GameStore, day: number, h: number, m = 0) {
  const target = at(day, h, m);
  assert.ok(target >= store.state.minutes, `can't go back in time to day ${day} ${h}:${m}`);
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
  assert.equal(a!.def.id, missionId);
  const c = a!.step.choices!.find(x => x.id === choiceId);
  assert.ok(c, `choice ${choiceId} missing on ${missionId} (have ${a!.step.choices!.map(x => x.id).join(', ')})`);
  assert.equal(store.applyChoice(missionId, c!), true, `${missionId}/${choiceId} was refused`);
}
/** Reply to one specific phone message, whatever else is waiting. */
function reply(store: GameStore, missionId: string, choiceId: string) {
  const m = store.phoneInbox().find(x => x.def.id === missionId);
  assert.ok(m, `expected a ${missionId} message (inbox: ${store.phoneInbox().map(x => x.def.id).join(', ')})`);
  assert.equal(store.applyChoice(missionId, m!.step.choices!.find(c => c.id === choiceId)!), true);
}
function buy(store: GameStore, itemId: string) {
  const item = getInterior(store.state.player.scene)!.shopItems!.find(i => i.id === itemId)!;
  store.state.player.x = item.tx * INTERIOR_TILE_PX;
  store.state.player.y = item.ty * INTERIOR_TILE_PX;
  const r = store.buyNearbyShopItem();
  assert.ok(r.ok, `could not buy ${itemId}: ${r.reason}`);
}
/** Walk to school and sit through class (to 12:30). */
function school(store: GameStore) {
  goOutside(store);
  store.advance(25);
  enter(store, 'university');
  store.goToInteriorScene('interior_school_classroom' as SceneId);
  store.waitForBell();
  assert.equal(store.attendClass().ok, true);
}
function sleep(store: GameStore) {
  enter(store, 'home');
  store.sleep();
  store.dismissDaySummary();
  store.dismissWeekSummary();
  store.dismissLevelSummary();
}
function startWeek(store: GameStore, goal: string) {
  choose(store, 'pocket_money', 'take');
  choose(store, 'pick_goal', goal);
}
const cash = (store: GameStore) => Math.round(store.cash * 100) / 100;
const flags = (store: GameStore) => store.state.world.flags;

// ── Progression ────────────────────────────────────────────────────────────
test('Levels: finishing Sunday\'s recap starts Level 2 next Monday — with its own money talk and goals', () => {
  const store = newGame(1);
  const events: GameEvent[] = [];
  store.onEvent(e => events.push(e));
  startWeek(store, 'friends');
  for (const d of [MON, TUE, WED, THU, FRI, SAT]) { advanceTo(store, d, 21, 0); store.sleep(); store.dismissDaySummary(); }
  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.equal(sm.level, 1);
  assert.ok(sm.stars >= 1 && sm.stars <= 3);
  assert.deepEqual(sm.next, { level: 2, name: 'Saving Up', isNew: true });
  assert.equal(store.state.levelsCompleted, 1);
  assert.equal(store.state.levelStars!['1'], sm.stars);
  sleep(store);                                               // → Monday of week 2
  assert.equal(store.level, 2);
  assert.ok(events.some(e => e.type === 'level_started' && e.level === 2));
  const pm = store.actionableStep()!;
  assert.equal(pm.def.id, 'pocket_money');
  assert.ok(pm.step.lines.join(' ').includes('Kids Saver'));
  choose(store, 'pocket_money', 'take');
  const goals = store.actionableStep()!;
  assert.deepEqual(goals.step.choices!.map(c => c.setsGoal), ['l2_bike', 'l2_bank', 'l2_patience', 'l2_gift']);
  // Level 1's story doesn't come back.
  assert.ok(!store.defs.filter(d => d.levels?.length === 1 && d.levels[0] === 1).some(d => store.runtime(d.id)!.state !== 'locked'));
});

test('Levels: skipping the Sunday recap means replaying the same level', () => {
  const store = newGame(1);
  startWeek(store, 'friends');
  advanceTo(store, 7, 7, 30);                                  // straight to next Monday, no recap
  assert.equal(store.level, 1);
  assert.equal(store.state.levelsCompleted, 0);
});

test('Levels: the last level built repeats, and the recap says what is coming next', () => {
  const store = newGame(maxLevel('school'));
  const rt = store.runtime('friday_recap')!;
  store.advance(at(SUN, 16, 0) - store.state.minutes);
  rt.state = 'active';
  store.applyChoice('friday_recap', store.def('friday_recap')!.steps[0].choices![0]);
  assert.deepEqual(store.pendingLevelSummary!.next, { level: 4, name: 'Earning Money', isNew: false });
  assert.equal(maxLevel('school'), 3);
});

test('Unlocks: International and Working need 5 finished levels in BOTH School and University', () => {
  assert.equal(pathUnlocked('school', {}), true);
  assert.equal(pathUnlocked('university', {}), true);
  assert.equal(pathUnlocked('international', { school: 5, university: 4 }), false);
  assert.equal(pathUnlocked('working', { school: 6, university: 5 }), true);
});

test('Old saves: a save that already finished week one carries on at Level 2', () => {
  const st = createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL));
  delete st.level; delete st.levelsCompleted; delete st.levelStars;
  st.world.flags.push('level1_complete');
  st.minutes = at(8, 9, 0);                                   // Tuesday of week 2
  const store = GameStore.hydrate(JSON.stringify(st))!;
  assert.equal(store.state.levelsCompleted, 1);
  assert.equal(store.level, 2);
});

// ── Level 2: Saving Up ─────────────────────────────────────────────────────
test('Level 2: a patient saver opens a Kids Saver, keeps the dishes deal and earns interest — 3 stars', () => {
  const store = newGame(2);
  startWeek(store, 'bank');

  // MONDAY — school, then open a Kids Saver at the Bank
  school(store);
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, MON, 15, 40);
  choose(store, 'l2_bank_account', 'go');
  enter(store, 'bank');
  choose(store, 'l2_bank_account', 'open');
  assert.ok(flags(store).includes('bank_account_open'));
  assert.equal(store.savingsInfo.name, 'Kids Saver');
  assert.equal(store.state.finance.accounts.savings, 5);
  assert.equal(cash(store), 15);
  sleep(store);

  // TUESDAY — the patience test, a broken bag
  advanceTo(store, TUE, 7, 30);
  school(store);
  choose(store, 'l2_patience', 'wait');
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, TUE, 15, 40);
  choose(store, 'l2_school_bag', 'fix');
  sleep(store);

  // WEDNESDAY — the dishes deal, the hole in your pocket, first night of dishes
  choose(store, 'l2_chore_contract', 'deal');
  school(store);
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, WED, 15, 45);
  choose(store, 'l2_lost_cash', 'retrace');                 // -$2
  advanceTo(store, WED, 18, 35);
  enter(store, 'home');
  choose(store, 'l2_dishes', 'do');                          // +$2
  assert.equal(store.moveToSavings(10), true);
  assert.equal(cash(store), 5);
  sleep(store);

  // THURSDAY — the compound-interest quiz, Jordan's mystery boxes (no), dishes
  advanceTo(store, THU, 7, 30);
  school(store);
  choose(store, 'l2_interest_lesson', 'b');
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, THU, 15, 45);
  choose(store, 'l2_mystery_boxes', 'no');
  advanceTo(store, THU, 18, 35);
  enter(store, 'home');
  choose(store, 'l2_dishes', 'do');
  sleep(store);

  // FRIDAY — two chocolates, the bike (pass), dishes
  advanceTo(store, FRI, 7, 30);
  school(store);
  choose(store, 'l2_patience_payout', 'take');
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, FRI, 15, 45);
  choose(store, 'l2_bike_sale', 'pass');
  advanceTo(store, FRI, 18, 35);
  enter(store, 'home');
  choose(store, 'l2_dishes', 'do');
  sleep(store);

  // SATURDAY — a homemade present, dishes
  advanceTo(store, SAT, 9, 5);
  choose(store, 'l2_gift_shopping', 'homemade');
  advanceTo(store, SAT, 18, 35);
  choose(store, 'l2_dishes', 'do');
  sleep(store);

  // SUNDAY — Mum's birthday, interest day, the recap
  advanceTo(store, SUN, 7, 35);
  choose(store, 'l2_mum_birthday', 'breakfast');
  advanceTo(store, SUN, 9, 5);
  assert.ok(store.state.finance.accounts.savings > 16, 'interest + the $1 no-withdrawal bonus');
  advanceTo(store, SUN, 16, 0);
  choose(store, 'friday_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  const text = sm.highlights.map(h => `${h.tone}:${h.text}`).join(' | ');
  assert.ok(sm.goal!.achieved, 'goal: $15 in the Kids Saver');
  for (const expected of ['Opened a Kids Saver', 'Kids Saver paid', 'two chocolates', 'Fixed your old bag', 'Kept the dishes deal', 'compound interest', "Said no to Jordan's mystery boxes", 'breakfast in bed']) {
    assert.ok(text.includes(expected), `recap should mention "${expected}" — got ${text}`);
  }
  assert.ok(!sm.highlights.some(h => h.tone === 'bad'), text);
  assert.equal(sm.stars, 3);
  assert.equal(cash(store), 11);
});

test('Level 2: withdrawing from the Kids Saver costs you the weekly bonus', () => {
  const store = newGame(2);
  startWeek(store, 'bike');
  store.state.world.flags.push('bank_account_open');
  store.moveToSavings(20);
  assert.equal(store.takeFromSavings(5), true);
  const before = store.state.finance.accounts.savings;
  advanceTo(store, SUN, 9, 5);
  const gained = store.state.finance.accounts.savings - before;
  assert.ok(gained > 0 && gained < 0.1, `only interest, no bonus (got ${gained})`);
});

test('Level 2: a broken dishes deal stays broken, and the recap says so', () => {
  const store = newGame(2);
  startWeek(store, 'patience');
  advanceTo(store, WED, 7, 30);
  choose(store, 'l2_chore_contract', 'deal');
  advanceTo(store, WED, 21, 45);                               // never did the dishes
  assert.ok(flags(store).includes('wk_contract_broken'));
  advanceTo(store, THU, 19, 0);
  assert.equal(store.runtime('l2_dishes')!.state, 'locked', 'no more dishes nights once the deal is off');
});

test('Level 2: Jordan\'s mystery boxes are a gamble that pays back less than $10 most of the time', () => {
  let losses = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const store = newGame(2);
    store.state.world.flags = store.state.world.flags.filter(f => !f.startsWith('seed:')).concat(`seed:${seed}`);
    store.state.world.flags.push('wk_mystery');
    advanceTo(store, SUN, 10, 5);
    const a = store.phoneInbox().find(m => m.def.id === 'l2_mystery_result')!;
    assert.ok(a, 'Jordan reports back on Sunday');
    if (a.step.choices![0].id === 'lose') losses++;
  }
  assert.ok(losses >= 6, `most seeds should lose (lost ${losses}/12)`);
});

// ── Level 3: Budgeting ─────────────────────────────────────────────────────
test('Level 3: $30 and a budget plan — lunch supplies, the tuck-shop tab, the trip and a fare rise all land in the recap', () => {
  const store = newGame(3);
  startWeek(store, 'packed');
  assert.equal(cash(store), 30);
  choose(store, 'l3_budget_plan', 'balanced');
  assert.deepEqual(store.budgetPlan(), { food: 12, transport: 6, fun: 4, save: 3 });
  choose(store, 'l3_phone_topup', 'topup');
  assert.equal(cash(store), 25);

  // Monday: no packed lunch yet — Mum doesn't pack lunches any more
  school(store);
  const lunch = store.actionableStep()!;
  assert.equal(lunch.def.id, 'lunch_break');
  assert.ok(!lunch.step.choices!.some(c => c.id === 'packed'), 'no supplies bought yet');
  choose(store, 'lunch_break', 'skip');
  advanceTo(store, MON, 15, 40);
  choose(store, 'l3_meal_prep', 'go');
  enter(store, 'supermarket');
  buy(store, 'bread_basic'); buy(store, 'eggs_basic');        // $5.20
  goOutside(store);
  assert.equal(store.runtime('l3_meal_prep')!.state, 'completed');
  sleep(store);

  // Tuesday: packed lunch is back, trip announced
  advanceTo(store, TUE, 7, 30);
  school(store);
  choose(store, 'l3_trip_notice', 'noted');
  choose(store, 'lunch_break', 'packed');
  sleep(store);

  // Wednesday: fare notice, a pie on the tuck-shop tab, and saying no to pizza (the trip is coming)
  advanceTo(store, WED, 7, 5);
  choose(store, 'l3_fare_rise', 'no');
  school(store);
  choose(store, 'l3_tuck_tab', 'tab');
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, WED, 15, 45);
  choose(store, 'l3_split_bill', 'no');
  sleep(store);

  // Thursday: fares have gone up; pay for the trip at the office
  assert.equal(store.busFare(), 2.5);
  advanceTo(store, THU, 7, 30);
  school(store);
  choose(store, 'l3_trip_payment', 'pay');                    // $12
  choose(store, 'lunch_break', 'packed');
  sleep(store);

  // Friday: the museum trip, then the tab
  advanceTo(store, FRI, 7, 55);
  goOutside(store);
  store.advance(25);
  enter(store, 'university');
  choose(store, 'l3_museum_trip', 'nothing');
  assert.equal(store.state.today.schoolAttended, true, 'the trip counts as a school day');
  choose(store, 'l3_tab_due', 'pay');                         // $4
  advanceTo(store, FRI, 12, 31);
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, FRI, 18, 5);
  choose(store, 'l3_budget_checkin', 'fine');
  assert.equal(store.moveToSavings(3), true);
  assert.equal(cash(store), 0.8);
  sleep(store);
  sleep(store);

  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  const text = sm.highlights.map(h => `${h.tone}:${h.text}`).join(' | ');
  assert.ok(sm.goal!.achieved, `4 packed lunches — ${store.goalStatus()!.detail}`);
  for (const expected of ['good:Food: spent $9.20 of $12', 'good:Transport: spent $0 of $6', 'bad:Fun & shopping: spent $12 of $4',
    'good:Saved $3 of $3', 'Packed your own lunch 4 days', 'Went on the museum trip', 'Paid off the tuck-shop tab']) {
    assert.ok(text.includes(expected), `recap should include "${expected}" — got ${text}`);
  }
  assert.equal(sm.stars, 2, 'goal hit, but the trip blew the fun envelope');
});

test('Level 3: the 10-trip card rides free after the fare rise', () => {
  const store = newGame(3);
  startWeek(store, 'save');
  advanceTo(store, WED, 7, 5);
  choose(store, 'l3_fare_rise', 'buy');
  assert.equal(store.state.world.rideCredits, 10);
  advanceTo(store, THU, 7, 30);
  goOutside(store);
  const stop = tileToPx(BUS_STOPS.home.tile);
  store.state.player.x = stop.x; store.state.player.y = stop.y;
  const bus = nextBusAt('stop_home', store.state.minutes)!;
  store.advance(bus.arrivesAt - store.state.minutes);
  const before = store.cash;
  assert.equal(store.boardBus('stop_home', 'stop_school').ok, true);
  assert.equal(store.cash, before, 'no fare charged');
  assert.equal(store.state.world.rideCredits, 9);
});

test('Level 3: a free trial nobody cancels becomes a weekly charge', () => {
  const store = newGame(3);
  startWeek(store, 'save');
  advanceTo(store, TUE, 19, 5);
  reply(store, 'l3_free_trial', 'trial');
  assert.ok(store.state.finance.expenses.recurring.some(r => r.id === 'game_premium'));
  advanceTo(store, SAT, 10, 5);
  reply(store, 'l3_trial_reminder', 'cancel');
  assert.ok(!store.state.finance.expenses.recurring.some(r => r.id === 'game_premium'));
});

// ── Variety across weeks ───────────────────────────────────────────────────
test('Variety: week two brings the side tasks you did not get in week one first', () => {
  const store = newGame(2, true);
  const pools = (from: number) => {
    const out: string[] = [];
    for (let d = from; d < from + 5; d++) { store.advance(at(d, 6, 0) - store.state.minutes); out.push(...store.todaysPool()); }
    return out;
  };
  const week1 = pools(0);
  store.state.levelsCompleted = 2;                            // stay on Level 2 next week too
  const week2 = pools(7);
  const byPool = new Map(store.defs.map(d => [d.id, d.pool]));
  const all = store.defs.filter(d => d.pool === 'after_school' && d.levels?.includes(2) !== false && (!d.levels || d.levels.includes(2)));
  const unseen = all.filter(d => !week1.includes(d.id) && d.window.days.some(x => x < 5) && !d.requires).map(d => d.id);
  const week2After = week2.filter(id => byPool.get(id) === 'after_school');
  for (const id of unseen) assert.ok(week2After.includes(id), `${id} wasn't offered in week 1, so week 2 should offer it (week 2: ${week2After.join(', ')})`);
});
