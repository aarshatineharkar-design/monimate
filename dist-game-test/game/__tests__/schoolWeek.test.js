"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate — School Week end-to-end.
 *
 * Plays whole weeks through the live GameStore the way a player would: reading phone messages,
 * catching real buses, walking into rooms, talking to the people standing there, buying things off
 * shelves. Each route must reach the end-of-week recap, and the recap must report what that route
 * actually did. If a change ever soft-locks the week again, this file fails.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const clock_1 = require("../../lib/clock");
const world_1 = require("../../lib/world");
const SCHOOL = gameData_1.LIFE_PATHS.find(p => p.id === 'school');
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;
function newGame() {
    return new store_1.GameStore((0, store_1.createInitialState)('school', (0, gameData_1.makeInitialFinance)(SCHOOL)));
}
// ── small "player" helpers ───────────────────────────────────────────────────
function advanceTo(store, day, h, m = 0) {
    const target = (0, clock_1.at)(day, h, m);
    strict_1.default.ok(target >= store.state.minutes, `can't go back in time to day ${day} ${h}:${m}`);
    store.advance(target - store.state.minutes);
}
function goOutside(store) {
    if (store.state.player.scene !== 'outdoor')
        store.exitPlace();
}
function enter(store, place) {
    goOutside(store);
    const r = store.enterPlace(place);
    strict_1.default.ok(r.ok, `could not enter ${place}: ${r.reason}`);
}
function room(store, scene) {
    store.goToInteriorScene(scene);
}
/** Answer whatever dialogue is on screen; asserts it's the mission we expect. */
function choose(store, missionId, choiceId) {
    const a = store.actionableStep();
    strict_1.default.ok(a, `expected ${missionId} to be on screen`);
    strict_1.default.equal(a.def.id, missionId);
    const c = a.step.choices.find(x => x.id === choiceId);
    strict_1.default.ok(c, `choice ${choiceId} missing on ${missionId}`);
    store.applyChoice(missionId, c);
}
/** Walk up to an NPC in the current room and press E. */
function talkIndoors(store, npcId) {
    const here = store.interiorNpcs().find(e => e.npc.id === npcId);
    strict_1.default.ok(here, `${npcId} is not in ${store.state.player.scene}`);
    store.state.player.x = here.x + world_1.INTERIOR_TILE_PX * 0.5;
    store.state.player.y = here.y;
    strict_1.default.equal(store.npcNearPlayer()?.id, npcId);
    store.talkTo(npcId);
}
/** Walk up to a shelf and press E. */
function buy(store, itemId) {
    const item = (0, world_1.getInterior)(store.state.player.scene).shopItems.find(i => i.id === itemId);
    store.state.player.x = item.tx * world_1.INTERIOR_TILE_PX;
    store.state.player.y = item.ty * world_1.INTERIOR_TILE_PX;
    const r = store.buyNearbyShopItem();
    strict_1.default.ok(r.ok, `could not buy ${itemId}: ${r.reason}`);
}
/** Stand at Home St, wait for the next Route 1 bus, ride it to the School Gate. */
function busToSchool(store) {
    goOutside(store);
    const stop = (0, world_1.tileToPx)(world_1.BUS_STOPS.home.tile);
    store.state.player.x = stop.x;
    store.state.player.y = stop.y;
    const bus = (0, world_1.nextBusAt)('stop_home', store.state.minutes);
    if (bus.arrivesAt > store.state.minutes)
        store.advance(bus.arrivesAt - store.state.minutes);
    const r = store.boardBus('stop_home', 'stop_school');
    strict_1.default.ok(r.ok, `boarding failed: ${r.reason}`);
    for (let i = 0; i < 60 && store.state.ride; i++)
        store.tick(0.25, 0);
    strict_1.default.equal(store.state.ride, null);
    enter(store, 'university');
}
/** Walk to school: ~25 minutes on the clock. */
function walkToSchool(store) {
    goOutside(store);
    store.advance(25);
    enter(store, 'university');
}
function attendClass(store) {
    room(store, 'interior_school_classroom');
    strict_1.default.equal(store.classStatus(), 'ready');
    store.waitForBell();
    strict_1.default.equal(store.attendClass().ok, true);
    strict_1.default.equal(store.classStatus(), 'done');
}
function sleep(store) {
    enter(store, 'home');
    store.sleep();
    store.dismissDaySummary();
    store.dismissWeekSummary();
}
const state = (store, id) => store.state.missions.find(m => m.id === id).state;
// ── Route A: the diligent bus rider ──────────────────────────────────────────
(0, node_test_1.default)('School Week A: a player who does everything reaches the recap, and it reports what they did', () => {
    const store = newGame();
    // MONDAY — phone message, bus, class, project notice, lunch, bookshop, Mum's errand
    choose(store, 'pocket_money', 'take');
    strict_1.default.equal(store.state.finance.accounts.cash, 35);
    busToSchool(store);
    strict_1.default.equal(state(store, 'get_to_school'), 'completed');
    attendClass(store); // 8:30 -> 12:30
    // Ms Patel (in the classroom) announces the project, ahead of the lunch prompt
    choose(store, 'school_project', 'noted');
    choose(store, 'lunch_break', 'packed');
    enter(store, 'shop_small');
    buy(store, 'poster_basic');
    buy(store, 'markers_basic');
    buy(store, 'glue_basic');
    goOutside(store); // walking out with everything completes it
    strict_1.default.equal(state(store, 'school_project'), 'completed');
    advanceTo(store, MON, 15, 35);
    enter(store, 'home');
    choose(store, 'pickup_groceries', 'ok');
    enter(store, 'supermarket');
    buy(store, 'milk_basic');
    buy(store, 'bread_basic');
    buy(store, 'eggs_basic');
    goOutside(store);
    strict_1.default.equal(state(store, 'pickup_groceries'), 'completed');
    sleep(store);
    // TUESDAY — walk, class, lunch with Jordan, noodles with Riley at the park
    walkToSchool(store);
    attendClass(store);
    choose(store, 'lunch_break', 'meal');
    goOutside(store);
    advanceTo(store, TUE, 15, 50); // big jump snaps NPCs to where their schedule says
    const riley = store.state.npcs.riley;
    strict_1.default.equal(riley.place, 'park');
    store.state.player.x = riley.x + world_1.TILE_PX * 0.5;
    store.state.player.y = riley.y;
    store.setOutdoorZone('park');
    strict_1.default.equal(store.npcNearPlayer()?.id, 'riley');
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
    strict_1.default.ok(store.interiorNpcs().some(e => e.npc.id === 'jordan'), 'Jordan should be at the Mall on Thursday');
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
    strict_1.default.ok(sm, 'the week recap should be showing');
    strict_1.default.equal(sm.startBalance, 35);
    strict_1.default.equal(sm.daysAttended, 5);
    strict_1.default.equal(sm.schoolProjectDone, true);
    strict_1.default.equal(sm.birthdayOutcome, 'full');
    strict_1.default.equal(sm.unexpectedOutcome, 'paid');
    strict_1.default.equal(sm.wentToArcade, false); // suggested the park instead
    strict_1.default.equal(sm.busRides, 3);
    strict_1.default.equal(sm.busSpent, 9); // 3 fares ($6) + Thursday's $3 bus-card top-up, all filed as transport
    strict_1.default.equal(sm.endBalance, store.state.finance.accounts.cash);
});
// ── Route B: the player who skips everything ─────────────────────────────────
(0, node_test_1.default)('School Week B: a player who skips school and avoids everyone still reaches the recap, and it says so', () => {
    const store = newGame();
    choose(store, 'pocket_money', 'take');
    for (const day of [MON, TUE, WED, THU]) {
        advanceTo(store, day, 20, 0); // stays home all day
        store.sleep();
        store.dismissDaySummary();
    }
    // Missed obligations count as missed instead of blocking the week:
    strict_1.default.equal(state(store, 'friend_birthday'), 'expired');
    strict_1.default.equal(state(store, 'arcade_invite'), 'expired');
    strict_1.default.equal(store.state.world.relationships.Riley, 1 - 2);
    strict_1.default.equal(store.state.world.relationships.Jordan, 2 - 1);
    advanceTo(store, FRI, 16, 0);
    enter(store, 'home');
    choose(store, 'friday_recap', 'reflect');
    const sm = store.pendingLevelSummary;
    strict_1.default.ok(sm);
    strict_1.default.equal(sm.daysAttended, 0);
    strict_1.default.equal(sm.schoolProjectDone, false); // never went to class, never heard about it
    strict_1.default.equal(sm.birthdayOutcome, 'declined');
    strict_1.default.equal(sm.unexpectedOutcome, 'none'); // never rode a bus, so no bus-card surprise
    strict_1.default.equal(sm.busRides, 0);
    strict_1.default.equal(sm.endBalance, 35);
});
// ── Route C: late for school, recap on the weekend ───────────────────────────
(0, node_test_1.default)('School Week C: arriving after 11:30 means no class that day; the recap is still waiting on Saturday', () => {
    const store = newGame();
    choose(store, 'pocket_money', 'take');
    advanceTo(store, MON, 11, 45);
    enter(store, 'university');
    strict_1.default.equal(state(store, 'get_to_school'), 'expired');
    strict_1.default.equal(store.classStatus(), 'too_late');
    advanceTo(store, 5, 18, 0); // Saturday evening
    enter(store, 'home');
    choose(store, 'friday_recap', 'reflect');
    strict_1.default.ok(store.pendingLevelSummary);
});
// ── Individual bugs that used to break the week ──────────────────────────────
(0, node_test_1.default)('Bug fix: choosing how to get to school no longer charges a fare without moving you', () => {
    const store = newGame();
    choose(store, 'pocket_money', 'take');
    const a = store.actionableStep();
    strict_1.default.notEqual(a?.def.id, 'get_to_school', 'get_to_school must not open a priced menu');
    strict_1.default.equal(store.state.finance.accounts.cash, 35);
});
(0, node_test_1.default)('Bug fix: class can be attended on every weekday, not only Monday', () => {
    const store = newGame();
    choose(store, 'pocket_money', 'take');
    sleep(store);
    advanceTo(store, WED, 8, 0);
    walkToSchool(store);
    room(store, 'interior_school_hall');
    strict_1.default.equal(store.classStatus(), 'go_to_classroom');
    attendClass(store);
});
(0, node_test_1.default)("Bug fix: Jordan, Riley and Ms Patel don't start the game standing in the player's bedroom", () => {
    const store = newGame(); // Monday 7:00, inside "Your Room"
    const inRoom = store.interiorNpcs().map(e => e.npc.id);
    strict_1.default.deepEqual(inRoom, ['mum']);
});
(0, node_test_1.default)('Bug fix: once-a-day chores are remembered across a save and reload', () => {
    const store = newGame();
    store.markDoneToday('helped_parents');
    const reloaded = store_1.GameStore.hydrate(store.serialize());
    strict_1.default.equal(reloaded.hasDoneToday('helped_parents'), true);
    reloaded.sleep();
    strict_1.default.equal(reloaded.hasDoneToday('helped_parents'), false); // a new day, a new chance
});
(0, node_test_1.default)('Bug fix: walking up to a closed school explains when it opens, to the minute', () => {
    const store = newGame();
    goOutside(store);
    advanceTo(store, 5, 10, 0);
    const r = store.enterPlace('university');
    strict_1.default.equal(r.ok, false);
    strict_1.default.match(r.reason ?? '', /opens Mon 7:00 AM/);
});
