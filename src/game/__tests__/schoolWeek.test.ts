/**
 * MoniMate — School Week end-to-end.
 *
 * Plays whole weeks through the live GameStore the way a player would: reading phone messages,
 * catching real buses, walking into rooms, talking to the people standing there, buying things off
 * shelves. Each route must reach the end-of-week recap, and the recap must report what that route
 * actually did. If a change ever soft-locks the week again, this file fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';
import { at } from '../../lib/clock';
import { BUS_STOPS, INTERIOR_TILE_PX, TILE_PX, getInterior, nextBusAt, tileToPx } from '../../lib/world';
import type { SceneId } from '../../lib/types';

const SCHOOL = LIFE_PATHS.find(p => p.id === 'school')!;
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;

/** A new game on a "quiet" world: no random daily side tasks, so these tests check the
 *  scripted week itself. The daily pool has its own tests in dailyVariety.test.ts. */
function newGame(): GameStore {
  const store = new GameStore(createInitialState('school', makeInitialFinance(SCHOOL)));
  const w = store.state.world;
  w.dailyMarks = w.dailyMarks.filter(m => !m.startsWith('pool:'));
  for (let d = 0; d < 21; d++) if (!w.dailyMarks.includes(`pool_rolled:${d}`)) w.dailyMarks.push(`pool_rolled:${d}`);
  store.advance(0.001); // re-evaluate missions without the pool
  return store;
}

// ── small "player" helpers ───────────────────────────────────────────────────
function advanceTo(store: GameStore, day: number, h: number, m = 0) {
  const target = at(day, h, m);
  assert.ok(target >= store.state.minutes, `can't go back in time to day ${day} ${h}:${m}`);
  store.advance(target - store.state.minutes);
}
function goOutside(store: GameStore) {
  if (store.state.player.scene !== 'outdoor') store.exitPlace();
}
function enter(store: GameStore, place: string) {
  goOutside(store);
  const r = store.enterPlace(place);
  assert.ok(r.ok, `could not enter ${place}: ${r.reason}`);
}
function room(store: GameStore, scene: SceneId) {
  store.goToInteriorScene(scene);
}
/** Answer whatever dialogue is on screen; asserts it's the mission we expect. */
function choose(store: GameStore, missionId: string, choiceId: string) {
  const a = store.actionableStep();
  assert.ok(a, `expected ${missionId} to be on screen`);
  assert.equal(a!.def.id, missionId);
  const c = a!.step.choices!.find(x => x.id === choiceId);
  assert.ok(c, `choice ${choiceId} missing on ${missionId}`);
  store.applyChoice(missionId, c!);
}
/** Walk up to an NPC in the current room and press E. */
function talkIndoors(store: GameStore, npcId: string) {
  const here = store.interiorNpcs().find(e => e.npc.id === npcId);
  assert.ok(here, `${npcId} is not in ${store.state.player.scene}`);
  store.state.player.x = here!.x + INTERIOR_TILE_PX * 0.5;
  store.state.player.y = here!.y;
  assert.equal(store.npcNearPlayer()?.id, npcId);
  store.talkTo(npcId);
}
/** Walk up to a shelf and press E. */
function buy(store: GameStore, itemId: string) {
  const item = getInterior(store.state.player.scene)!.shopItems!.find(i => i.id === itemId)!;
  store.state.player.x = item.tx * INTERIOR_TILE_PX;
  store.state.player.y = item.ty * INTERIOR_TILE_PX;
  const r = store.buyNearbyShopItem();
  assert.ok(r.ok, `could not buy ${itemId}: ${r.reason}`);
}
/** Stand at Home St, wait for the next Route 1 bus, ride it to the School Gate. */
function busToSchool(store: GameStore) {
  goOutside(store);
  const stop = tileToPx(BUS_STOPS.home.tile);
  store.state.player.x = stop.x; store.state.player.y = stop.y;
  const bus = nextBusAt('stop_home', store.state.minutes)!;
  if (bus.arrivesAt > store.state.minutes) store.advance(bus.arrivesAt - store.state.minutes);
  const r = store.boardBus('stop_home', 'stop_school');
  assert.ok(r.ok, `boarding failed: ${r.reason}`);
  for (let i = 0; i < 60 && store.state.ride; i++) store.tick(0.25, 0);
  assert.equal(store.state.ride, null);
  enter(store, 'university');
}
/** Walk to school: ~25 minutes on the clock. */
function walkToSchool(store: GameStore) {
  goOutside(store);
  store.advance(25);
  enter(store, 'university');
}
function attendClass(store: GameStore) {
  room(store, 'interior_school_classroom');
  assert.equal(store.classStatus(), 'ready');
  store.waitForBell();
  assert.equal(store.attendClass().ok, true);
  assert.equal(store.classStatus(), 'done');
}
const cash = (store: GameStore) => Math.round(store.cash * 100) / 100;
/** Monday 7:00: take Mum's $20, then pick this week's goal on the phone. */
function startWeek(store: GameStore, goalId: string) {
  choose(store, 'pocket_money', 'take');
  choose(store, 'pick_goal', goalId);
  assert.equal(store.weekGoalId(), goalId);
}
function sleep(store: GameStore) {
  enter(store, 'home');
  store.sleep();
  store.dismissDaySummary();
  store.dismissWeekSummary();
}
const state = (store: GameStore, id: string) => store.state.missions.find(m => m.id === id)!.state;

// ── Route A: the saver — goal: the school fair ───────────────────────────────
test('School Week A: a saver who works for it reaches the fair, and the Sunday recap says so', () => {
  const store = newGame();

  // MONDAY — $20, goal, walk, class, project, lunch, bookshop, Mum's errand, help Mum, piggy bank
  startWeek(store, 'save_event');
  assert.equal(cash(store), 20);
  walkToSchool(store);
  assert.equal(state(store, 'get_to_school'), 'completed');
  attendClass(store); // 8:30 -> 12:30
  choose(store, 'school_project', 'noted');
  choose(store, 'lunch_break', 'packed');
  enter(store, 'shop_small');
  buy(store, 'poster_basic'); buy(store, 'markers_basic'); buy(store, 'glue_basic');
  goOutside(store);
  assert.equal(state(store, 'school_project'), 'completed');
  assert.equal(cash(store), 9);
  advanceTo(store, MON, 15, 35);
  enter(store, 'home');
  choose(store, 'pickup_groceries', 'ok'); // +$15 from Mum
  enter(store, 'supermarket');
  buy(store, 'milk_basic'); buy(store, 'bread_basic'); buy(store, 'eggs_basic'); // $8.70
  goOutside(store); // under budget: +$2 reward, keep the change
  assert.equal(cash(store), 17.3);
  advanceTo(store, MON, 18, 0);
  enter(store, 'home');
  assert.equal(store.helpParents().ok, true); // Mum's home in the evening: +$5
  assert.equal(store.moveToSavings(10), true);
  assert.equal(cash(store), 12.3);
  assert.equal(store.goalStatus()!.progress, 1, '$10 in the piggy bank = goal bar full');
  sleep(store);

  // TUESDAY — bus, class, the basketball sign-up (no thanks), lunch, Riley at the park
  busToSchool(store);
  attendClass(store);
  choose(store, 'sports_signup', 'pass');
  choose(store, 'lunch_break', 'packed');
  goOutside(store);
  advanceTo(store, TUE, 15, 50);
  const riley = store.state.npcs.riley;
  store.state.player.x = riley.x + TILE_PX * 0.5; store.state.player.y = riley.y;
  store.setOutdoorZone('park');
  store.talkTo('riley');
  choose(store, 'after_school_snack', 'home');
  sleep(store);

  // WEDNESDAY — walk, class, Riley's birthday in the cafeteria
  walkToSchool(store);
  attendClass(store);
  room(store, 'interior_school_cafeteria');
  talkIndoors(store, 'riley');
  choose(store, 'friend_birthday', 'full');
  choose(store, 'lunch_break', 'packed');
  assert.equal(cash(store), 5.3);
  sleep(store);

  // THURSDAY — bus, class, Mr Lee's shift (instead of the arcade), the bus card comes up short
  busToSchool(store);
  attendClass(store);
  choose(store, 'lunch_break', 'packed');
  goOutside(store);
  advanceTo(store, THU, 15, 45);
  choose(store, 'dairy_shift', 'accept');
  enter(store, 'dairy');
  choose(store, 'dairy_shift', 'work'); // +$8, 90 minutes
  assert.equal(state(store, 'dairy_shift'), 'completed');
  choose(store, 'unexpected_event', 'pay'); // bus rider's surprise: -$3
  assert.equal(cash(store), 8.3);
  sleep(store);
  assert.equal(state(store, 'arcade_invite'), 'expired', 'you cannot be at the Dairy and the arcade');

  // FRIDAY — walk, class, present the project Monday's shopping paid for
  walkToSchool(store);
  attendClass(store);
  const project = store.actionableStep()!;
  assert.equal(project.def.id, 'project_day');
  assert.deepEqual(project.step.choices!.map(c => c.id), ['present'], 'supplies bought: only the good option');
  choose(store, 'project_day', 'present');
  assert.ok(store.state.world.flags.includes('project_day_merit'));
  choose(store, 'lunch_break', 'packed');
  sleep(store);

  // SATURDAY — empty the piggy bank, go to the fair
  enter(store, 'home');
  assert.equal(store.takeFromSavings(10), true);
  advanceTo(store, SAT, 10, 30);
  enter(store, 'university');
  assert.ok(store.interiorNpcs().some(e => e.npc.id === 'jordan'), 'friends are at the fair');
  choose(store, 'school_fair', 'ticket');
  assert.equal(cash(store), 8.3);
  assert.equal(store.goalStatus()!.achieved, true);
  sleep(store);

  // SUNDAY — recap with Mum
  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.ok(sm, 'the week recap should be showing');
  assert.equal(sm.startBalance, 20);
  assert.equal(sm.endBalance, 8.3);
  assert.equal(sm.daysAttended, 5);
  assert.equal(sm.schoolProjectDone, true);
  assert.equal(sm.birthdayOutcome, 'full');
  assert.equal(sm.unexpectedKind, 'bus');
  assert.equal(sm.unexpectedOutcome, 'paid');
  assert.equal(sm.busRides, 2);
  assert.equal(sm.busSpent, 7); // 2 fares + the $3 top-up
  assert.equal(sm.dairyShift, true);
  assert.equal(sm.fairAttended, true);
  assert.equal(sm.wentToArcade, false);
  assert.deepEqual({ id: sm.goal!.id, achieved: sm.goal!.achieved }, { id: 'save_event', achieved: true });
});

// ── Route B: the spender — goal: headphones, runs out of money ───────────────
test('School Week B: a spender who buys canteen lunch every day cannot afford the headphones', () => {
  const store = newGame();
  startWeek(store, 'buy_headphones');
  for (const day of [MON, TUE, WED, THU, FRI]) {
    if (day > MON) advanceTo(store, day, 7, 30);
    if (store.cash >= 2) busToSchool(store); else walkToSchool(store); // broke by midweek: walk
    attendClass(store);
    const first = store.actionableStep()!;
    const expected = day === MON ? 'school_project' : day === TUE ? 'sports_signup' : day === FRI ? 'project_day' : 'lunch_break';
    assert.equal(first.def.id, expected);
    if (day === MON) choose(store, 'school_project', 'noted');
    if (day === TUE) choose(store, 'sports_signup', 'pass');
    if (day === FRI) {
      assert.ok(!first.step.choices!.some(c => c.id === 'present'), 'never bought the supplies');
      choose(store, 'project_day', 'borrow');
    }
    const meal = store.def('lunch_break')!.steps[0].choices!.find(c => c.id === 'meal')!;
    store.applyChoice('lunch_break', meal); // refused once the money's gone
    sleep(store);
  }
  const g = store.goalStatus()!;
  assert.equal(g.achieved, false);
  assert.ok(store.cash < 15, 'bus + canteen every day leaves nothing for headphones');
  assert.ok(store.cash >= 0, 'but money never goes negative');
});

// ── Route C: the player who skips everything ─────────────────────────────────
test('School Week C: a player who stays home all week still gets the Sunday recap, and fails the friends goal', () => {
  const store = newGame();
  startWeek(store, 'friends');
  for (const day of [MON, TUE, WED, THU, FRI, SAT]) {
    advanceTo(store, day, 20, 0);
    store.sleep(); store.dismissDaySummary();
  }
  assert.equal(state(store, 'friend_birthday'), 'expired');
  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.equal(sm.daysAttended, 0);
  assert.equal(sm.schoolProjectDone, false);
  assert.equal(sm.birthdayOutcome, 'declined');
  assert.equal(sm.unexpectedKind, null, 'never left the house: no bus card, no worn-out shoe'); 
  assert.equal(sm.fairAttended, false);
  assert.equal(sm.goal!.achieved, false, 'Riley -2 for the missed birthday breaks the friends goal');
  assert.equal(sm.endBalance, 20);
});

// ── Week 2: last week's flags don't count ────────────────────────────────────
test('School Week D: next Monday brings a fresh $20 and a fresh goal; last week\'s arcade trip does not count', () => {
  const store = newGame();
  startWeek(store, 'arcade');
  store.state.world.flags.push('arcade_visit');
  assert.equal(store.goalStatus()!.achieved, true);
  advanceTo(store, 7, 7, 0); // next Monday
  const before = store.cash;
  startWeek(store, 'arcade');
  assert.equal(store.cash, before + 20);
  assert.equal(store.goalStatus()!.achieved, false);
  assert.equal(store.state.goals.completed.length, 1, "last week's goal is archived");
});

// ── Individual bugs that used to break the week ──────────────────────────────
test('Bug fix: choosing how to get to school no longer charges a fare without moving you', () => {
  const store = newGame();
  startWeek(store, 'friends');
  const a = store.actionableStep();
  assert.notEqual(a?.def.id, 'get_to_school', 'get_to_school must not open a priced menu');
  assert.equal(store.cash, 20);
});

test('Bug fix: class can be attended on every weekday, not only Monday', () => {
  const store = newGame();
  startWeek(store, 'friends');
  sleep(store);
  advanceTo(store, WED, 8, 0);
  walkToSchool(store);
  room(store, 'interior_school_hall');
  assert.equal(store.classStatus(), 'go_to_classroom');
  attendClass(store);
});

test("Bug fix: Jordan, Riley and Ms Patel don't start the game standing in the player's bedroom", () => {
  const store = newGame();
  assert.deepEqual(store.interiorNpcs().map(e => e.npc.id), ['mum']);
});

test('Bug fix: once-a-day chores are remembered across a save and reload', () => {
  const store = newGame();
  store.markDoneToday('helped_parents');
  const reloaded = GameStore.hydrate(store.serialize())!;
  assert.equal(reloaded.hasDoneToday('helped_parents'), true);
  reloaded.sleep();
  assert.equal(reloaded.hasDoneToday('helped_parents'), false);
});

test('Bug fix: walking up to a closed school explains when it opens, to the minute', () => {
  const store = newGame();
  goOutside(store);
  advanceTo(store, SUN, 10, 0); // Sunday: no school, no fair
  const r = store.enterPlace('university');
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /opens Mon 7:00 AM/);
});
