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
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;

function newGame(): GameStore {
  return new GameStore(createInitialState('school', makeInitialFinance(SCHOOL)));
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
function sleep(store: GameStore) {
  enter(store, 'home');
  store.sleep();
  store.dismissDaySummary();
  store.dismissWeekSummary();
}
const state = (store: GameStore, id: string) => store.state.missions.find(m => m.id === id)!.state;

// ── Route A: the diligent bus rider ──────────────────────────────────────────
test('School Week A: a player who does everything reaches the recap, and it reports what they did', () => {
  const store = newGame();

  // MONDAY — phone message, bus, class, project notice, lunch, bookshop, Mum's errand
  choose(store, 'pocket_money', 'take');
  assert.equal(store.state.finance.accounts.cash, 35);
  busToSchool(store);
  assert.equal(state(store, 'get_to_school'), 'completed');
  attendClass(store); // 8:30 -> 12:30
  // Ms Patel (in the classroom) announces the project, ahead of the lunch prompt
  choose(store, 'school_project', 'noted');
  choose(store, 'lunch_break', 'packed');
  enter(store, 'shop_small');
  buy(store, 'poster_basic'); buy(store, 'markers_basic'); buy(store, 'glue_basic');
  goOutside(store); // walking out with everything completes it
  assert.equal(state(store, 'school_project'), 'completed');
  advanceTo(store, MON, 15, 35);
  enter(store, 'home');
  choose(store, 'pickup_groceries', 'ok');
  enter(store, 'supermarket');
  buy(store, 'milk_basic'); buy(store, 'bread_basic'); buy(store, 'eggs_basic');
  goOutside(store);
  assert.equal(state(store, 'pickup_groceries'), 'completed');
  sleep(store);

  // TUESDAY — walk, class, lunch with Jordan, noodles with Riley at the park
  walkToSchool(store);
  attendClass(store);
  choose(store, 'lunch_break', 'meal');
  goOutside(store);
  advanceTo(store, TUE, 15, 50); // big jump snaps NPCs to where their schedule says
  const riley = store.state.npcs.riley;
  assert.equal(riley.place, 'park');
  store.state.player.x = riley.x + TILE_PX * 0.5; store.state.player.y = riley.y;
  store.setOutdoorZone('park');
  assert.equal(store.npcNearPlayer()?.id, 'riley');
  store.talkTo('riley');
  choose(store, 'after_school_snack', 'home');
  sleep(store);

  // WEDNESDAY — bus, class, Riley's birthday at lunch in the cafeteria
  busToSchool(store);
  attendClass(store);
  room(store, 'interior_school_cafeteria');
  talkIndoors(store, 'riley');
  choose(store, 'friend_birthday', 'full');
  choose(store, 'lunch_break', 'snack');
  sleep(store);

  // THURSDAY — bus, class, the bus card comes up short, then Jordan's arcade invite at the Mall
  busToSchool(store);
  attendClass(store);
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, THU, 16, 5);
  choose(store, 'unexpected_event', 'pay'); // a phone moment, wherever you are
  enter(store, 'mall');
  assert.ok(store.interiorNpcs().some(e => e.npc.id === 'jordan'), 'Jordan should be at the Mall on Thursday');
  choose(store, 'arcade_invite', 'park');
  sleep(store);

  // FRIDAY — walk, class, home to Mum for the recap
  walkToSchool(store);
  attendClass(store);
  choose(store, 'lunch_break', 'packed');
  advanceTo(store, FRI, 16, 0);
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');

  const sm = store.pendingLevelSummary;
  assert.ok(sm, 'the week recap should be showing');
  assert.equal(sm!.startBalance, 35);
  assert.equal(sm!.daysAttended, 5);
  assert.equal(sm!.schoolProjectDone, true);
  assert.equal(sm!.birthdayOutcome, 'full');
  assert.equal(sm!.unexpectedOutcome, 'paid');
  assert.equal(sm!.wentToArcade, false); // suggested the park instead
  assert.equal(sm!.busRides, 3);
  assert.equal(sm!.busSpent, 9); // 3 fares ($6) + Thursday's $3 bus-card top-up, all filed as transport
  assert.equal(sm!.endBalance, store.state.finance.accounts.cash);
});

// ── Route B: the player who skips everything ─────────────────────────────────
test('School Week B: a player who skips school and avoids everyone still reaches the recap, and it says so', () => {
  const store = newGame();
  choose(store, 'pocket_money', 'take');
  for (const day of [MON, TUE, WED, THU]) {
    advanceTo(store, day, 20, 0); // stays home all day
    store.sleep(); store.dismissDaySummary();
  }
  // Missed obligations count as missed instead of blocking the week:
  assert.equal(state(store, 'friend_birthday'), 'expired');
  assert.equal(state(store, 'arcade_invite'), 'expired');
  assert.equal(store.state.world.relationships.Riley, 1 - 2);
  assert.equal(store.state.world.relationships.Jordan, 2 - 1);

  advanceTo(store, FRI, 16, 0);
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.ok(sm);
  assert.equal(sm.daysAttended, 0);
  assert.equal(sm.schoolProjectDone, false); // never went to class, never heard about it
  assert.equal(sm.birthdayOutcome, 'declined');
  assert.equal(sm.unexpectedOutcome, 'none'); // never rode a bus, so no bus-card surprise
  assert.equal(sm.busRides, 0);
  assert.equal(sm.endBalance, 35);
});

// ── Route C: late for school, recap on the weekend ───────────────────────────
test('School Week C: arriving after 11:30 means no class that day; the recap is still waiting on Saturday', () => {
  const store = newGame();
  choose(store, 'pocket_money', 'take');
  advanceTo(store, MON, 11, 45);
  enter(store, 'university');
  assert.equal(state(store, 'get_to_school'), 'expired');
  assert.equal(store.classStatus(), 'too_late');
  advanceTo(store, 5, 18, 0); // Saturday evening
  enter(store, 'home');
  choose(store, 'friday_recap', 'reflect');
  assert.ok(store.pendingLevelSummary);
});

// ── Individual bugs that used to break the week ──────────────────────────────
test('Bug fix: choosing how to get to school no longer charges a fare without moving you', () => {
  const store = newGame();
  choose(store, 'pocket_money', 'take');
  const a = store.actionableStep();
  assert.notEqual(a?.def.id, 'get_to_school', 'get_to_school must not open a priced menu');
  assert.equal(store.state.finance.accounts.cash, 35);
});

test('Bug fix: class can be attended on every weekday, not only Monday', () => {
  const store = newGame();
  choose(store, 'pocket_money', 'take');
  sleep(store);
  advanceTo(store, WED, 8, 0);
  walkToSchool(store);
  room(store, 'interior_school_hall');
  assert.equal(store.classStatus(), 'go_to_classroom');
  attendClass(store);
});

test("Bug fix: Jordan, Riley and Ms Patel don't start the game standing in the player's bedroom", () => {
  const store = newGame(); // Monday 7:00, inside "Your Room"
  const inRoom = store.interiorNpcs().map(e => e.npc.id);
  assert.deepEqual(inRoom, ['mum']);
});

test('Bug fix: once-a-day chores are remembered across a save and reload', () => {
  const store = newGame();
  store.markDoneToday('helped_parents');
  const reloaded = GameStore.hydrate(store.serialize())!;
  assert.equal(reloaded.hasDoneToday('helped_parents'), true);
  reloaded.sleep();
  assert.equal(reloaded.hasDoneToday('helped_parents'), false); // a new day, a new chance
});

test('Bug fix: walking up to a closed school explains when it opens, to the minute', () => {
  const store = newGame();
  goOutside(store);
  advanceTo(store, 5, 10, 0);
  const r = store.enterPlace('university');
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /opens Mon 7:00 AM/);
});
