/**
 * MoniMate — every day should feel different: the daily task pool, per-day dialogue variants,
 * the effects those tasks have, and the "all done for today" moment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at, parts } from '../../lib/clock';
import { BUS_STOPS, tileToPx, nextBusAt, doorTile } from '../../lib/world';

const SCHOOL = getLifePath('school');
function gameWithSeed(seed: number): GameStore {
  const st = createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL));
  st.world.flags = st.world.flags.filter(f => !f.startsWith('seed:'));
  st.world.flags.push(`seed:${seed}`);
  return new GameStore(st);
}
/** Put a specific side task on today's menu (and clear whatever else the seed rolled today). */
function force(store: GameStore, id: string) {
  const day = parts(store.state.minutes).day;
  store.state.world.dailyMarks = store.state.world.dailyMarks.filter(m => !(m.startsWith('pool:') && m.endsWith(`:${day}`)));
  for (const rt of store.state.missions) if (store.def(rt.id)?.pool && rt.state !== 'locked') rt.state = rt.id === id ? 'locked' : 'expired';
  store.state.world.dailyMarks.push(`pool:${id}:${parts(store.state.minutes).day}`);
}
function answer(store: GameStore, missionId: string, choiceId: string) {
  const a = store.actionableStep();
  assert.equal(a?.def.id, missionId);
  assert.equal(store.applyChoice(missionId, a!.step.choices!.find(c => c.id === choiceId)!), true);
}
function startWeek(store: GameStore) {
  answer(store, 'pocket_money', 'take');
  answer(store, 'pick_goal', 'friends');
}

test('Daily pool: each weekday offers a different set of side tasks', () => {
  const store = gameWithSeed(42);
  const days: string[] = [];
  for (let d = 0; d < 5; d++) {
    if (d > 0) store.advance(at(d, 7, 0) - store.state.minutes);
    days.push(store.todaysPool().sort().join(','));
    assert.ok(store.todaysPool().length >= 2, 'at least two side tasks a day');
  }
  assert.ok(new Set(days).size >= 3, `expected varied days, got ${days.join(' | ')}`);
});

test('Daily pool: the same save and day always roll the same tasks (reload-safe)', () => {
  const a = gameWithSeed(7);
  const b = GameStore.hydrate(a.serialize())!;
  assert.deepEqual(b.todaysPool(), a.todaysPool());
});

test('Daily pool: different saves get different weeks', () => {
  const weekOf = (seed: number) => {
    const g = gameWithSeed(seed), out: string[] = [];
    for (let d = 0; d < 5; d++) { if (d) g.advance(at(d, 7, 0) - g.state.minutes); out.push(...g.todaysPool()); }
    return out.join(',');
  };
  assert.notEqual(weekOf(1), weekOf(2));
});

test('Lunch: the menu and prices change from day to day', () => {
  const store = gameWithSeed(99);
  const menus = new Set<string>();
  for (let d = 0; d < 5; d++) {
    store.advance(at(d, 12, 31) - store.state.minutes);
    const rt = store.runtime('lunch_break')!;
    const step = store.stepFor(store.def('lunch_break')!, rt)!;
    menus.add(step.choices!.find(c => c.id === 'meal')!.label);
  }
  assert.ok(menus.size >= 2, `expected different lunches, got ${[...menus].join(' | ')}`);
});

test('Bus pass: after buying the weekly pass, rides cost nothing until Sunday', () => {
  const store = gameWithSeed(1);
  startWeek(store);
  force(store, 'bus_pass_offer');
  store.advance(1);
  answer(store, 'bus_pass_offer', 'buy');
  assert.equal(store.cash, 13);
  store.exitPlace();
  const stop = tileToPx(BUS_STOPS.home.tile);
  store.state.player.x = stop.x; store.state.player.y = stop.y;
  const bus = nextBusAt('stop_home', store.state.minutes)!;
  store.advance(bus.arrivesAt - store.state.minutes);
  assert.equal(store.boardBus('stop_home', 'stop_school').ok, true);
  assert.equal(store.cash, 13, 'the ride was free with the pass');
});

test('Subscription: keeping the free trial adds a recurring $5 charge', () => {
  const store = gameWithSeed(1);
  startWeek(store);
  store.advance(at(0, 18, 35) - store.state.minutes);
  force(store, 'streaming_trial');
  store.advance(1);
  const before = store.cash;
  answer(store, 'streaming_trial', 'keep');
  assert.equal(store.cash, before - 5);
  const sub = store.state.finance.expenses.recurring.find(r => r.id === 'streambox');
  assert.ok(sub && sub.amount === 5 && sub.periodDays === 30);
});

test('Library fine: ignoring the overdue book charges $2 when the day ends', () => {
  const store = gameWithSeed(1);
  startWeek(store);
  store.advance(at(0, 15, 41) - store.state.minutes);
  force(store, 'library_fine');
  store.advance(1);
  assert.equal(store.runtime('library_fine')!.state, 'available');
  const before = store.cash;
  store.takeNotices();
  store.advance(at(0, 18, 1) - store.state.minutes);
  assert.equal(store.runtime('library_fine')!.state, 'expired');
  assert.equal(store.cash, before - 2);
  assert.ok(store.takeNotices().some(n => n.includes('$2 fine')));
});

test('No packed lunch: taking lunch money means the packed-lunch option is gone today only', () => {
  const store = gameWithSeed(1);
  startWeek(store);
  force(store, 'lunch_money');
  store.advance(1);
  answer(store, 'lunch_money', 'take');
  const def = store.def('lunch_break')!, rt = store.runtime('lunch_break')!;
  assert.equal(store.stepFor(def, rt)!.choices!.some(c => c.id === 'packed'), false);
  store.advance(at(1, 12, 31) - store.state.minutes);
  assert.equal(store.stepFor(def, rt)!.choices!.some(c => c.id === 'packed'), true);
});

test('End of day: once everything is done, the day reports complete and you can head home', () => {
  const store = gameWithSeed(3);
  startWeek(store);
  // Quiet the rest of Monday so only the scripted tasks remain.
  store.state.world.dailyMarks = store.state.world.dailyMarks.filter(m => !m.startsWith('pool:'));
  for (const rt of store.state.missions) if (store.def(rt.id)?.pool && rt.state !== 'locked') rt.state = 'expired';
  store.advance(at(0, 20, 0) - store.state.minutes); // stayed home, skipped school; homework window is open
  assert.equal(store.dayComplete(), false, 'homework is still waiting');
  answer(store, 'homework', store.stepFor(store.def('homework')!, store.runtime('homework')!)!.choices![0].id);
  assert.equal(store.dayComplete(), true);
  const sum = store.todaySummary();
  assert.ok(sum.done.some(d => d.id === 'homework'));
  store.markDayDoneShown();
  assert.equal(store.dayComplete(), false, 'the card shows once per day');
});

test('Go home: walking home from across town takes real time and puts you in your room', () => {
  const store = gameWithSeed(3);
  startWeek(store);
  store.advance(at(0, 16, 0) - store.state.minutes);
  store.exitPlace();
  const mallDoor = tileToPx(doorTile('mall')); // walk over to the Mall's door first
  store.state.player.x = mallDoor.x; store.state.player.y = mallDoor.y;
  assert.equal(store.enterPlace('mall').ok, true);
  const before = store.state.minutes;
  const took = store.goHome();
  assert.ok(took >= 10, `walking from the Mall should take a while, took ${took}`);
  assert.equal(store.state.minutes - before, took);
  assert.equal(store.state.player.place, 'home');
  assert.equal(store.state.player.scene, 'interior_home');
  assert.equal(store.goHome(), 0, 'already home');
});

test('Old saves: missions added later get a runtime when the save loads', () => {
  const store = gameWithSeed(5);
  const saved = JSON.parse(store.serialize());
  saved.missions = saved.missions.filter((m: { id: string }) => m.id !== 'dog_walk');
  const reloaded = GameStore.hydrate(JSON.stringify(saved))!;
  assert.ok(reloaded.runtime('dog_walk'));
});

test("End of day: an ignored offer (an ad, a text) isn't listed as a failure; an ignored obligation is", () => {
  const store = gameWithSeed(1);
  startWeek(store);
  store.advance(at(0, 18, 31) - store.state.minutes);
  force(store, 'sneaker_sale');
  store.advance(at(0, 21, 5) - store.state.minutes); // the ad expired untouched
  const sum = store.todaySummary();
  assert.equal(sum.missed.some(m => m.id === 'sneaker_sale'), false);
  assert.equal(sum.missed.some(m => m.id === 'get_to_school'), true, 'skipping school is a real miss');
});
