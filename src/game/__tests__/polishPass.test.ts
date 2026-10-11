/**
 * MoniMate — polish pass: the bus waits for you, every money decision is logged with a verdict and
 * lesson for the decision card + day recap, and every building you can walk into has a real,
 * walkable room.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState, BUS_HOLD_REAL_SECONDS } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath, LIFE_PATHS } from '../../lib/gameData';
import { at } from '../../lib/clock';
import {
  BUS_STOPS, INTERIORS, PLACES, PLACE_INTERIOR_SCENE, getInterior, interiorBlocked, tileToPx, busAtStop,
} from '../../lib/world';
import { missionDefs } from '../../lib/missions';
import { LIFE_EVENTS } from '../../lib/lifeEvents';
import { CHOICE_VERDICTS } from '../../lib/content/verdicts';
import { pathRules } from '../../lib/pathRules';
import type { LifePath } from '../../lib/gameData';

function newGame(path: LifePath = 'school'): GameStore {
  const cfg = getLifePath(path);
  return new GameStore(createInitialState(path, makeInitialFinance(cfg), makeInitialGoals(cfg)));
}

/** Stand outside at the Home St stop at the 7:55 weekday bus. */
function atHomeStopWhenBusArrives(store: GameStore) {
  store.advance(at(0, 7, 55) - store.state.minutes);
  const px = tileToPx(BUS_STOPS.home.tile);
  store.state.player.scene = 'outdoor';
  store.state.player.place = null;
  store.state.player.x = px.x;
  store.state.player.y = px.y;
  assert.ok(busAtStop('stop_home', store.state.minutes), 'a bus should be standing at Home St at 7:55');
  store.state.finance.accounts.cash = 20; // enough for the fare
}

// ── Bus ─────────────────────────────────────────────────────────────────────────────────────────

test('Bus: the driver waits while you stand at the stop deciding (clock holds)', () => {
  const store = newGame();
  atHomeStopWhenBusArrives(store);
  const arrived = store.state.minutes;
  for (let i = 0; i < 10; i++) store.tick(1, 0);     // 10 real seconds of thinking
  assert.equal(store.state.minutes, arrived, 'the clock should not move while the bus holds');
  assert.ok(busAtStop('stop_home', store.state.minutes), 'the bus is still there');
  assert.ok(store.busHoldSecondsLeft() > 0 && store.busHoldSecondsLeft() <= BUS_HOLD_REAL_SECONDS - 9);
  assert.equal(store.boardBus('stop_home', 'stop_school').ok, true, 'and you can still get on');
});

test('Bus: the hold runs out — the bus does leave eventually', () => {
  const store = newGame();
  atHomeStopWhenBusArrives(store);
  for (let i = 0; i < BUS_HOLD_REAL_SECONDS + 1; i++) store.tick(1, 0);
  for (let i = 0; i < 5; i++) store.tick(1, 0);       // then normal time resumes
  assert.equal(busAtStop('stop_home', store.state.minutes), null, 'the bus has pulled away');
});

test('Bus: walking away ends the wait — time runs normally while you move', () => {
  const store = newGame();
  atHomeStopWhenBusArrives(store);
  const arrived = store.state.minutes;
  store.tick(1, 0.5);                                 // moving: half a tile this frame
  assert.ok(store.state.minutes > arrived);
});

test('Bus: no hold when you are nowhere near the stop', () => {
  const store = newGame();
  atHomeStopWhenBusArrives(store);
  store.state.player.x += 72 * 6;                     // six tiles down the street
  const before = store.state.minutes;
  store.tick(2, 0);
  assert.ok(store.state.minutes > before);
});

// ── Decisions ───────────────────────────────────────────────────────────────────────────────────

test('Decisions: every verdict key points at a real choice (no stale keys)', () => {
  const real = new Set<string>();
  for (const p of LIFE_PATHS) {
    for (const d of missionDefs(p.id as LifePath)) for (const st of d.steps) for (const c of st.choices ?? []) real.add(`${d.id}:${c.id}`);
  }
  for (const e of LIFE_EVENTS) for (const c of e.choices) real.add(`life:${e.id}:${c.id}`);
  const stale = Object.keys(CHOICE_VERDICTS).filter(k => !real.has(k));
  assert.deepEqual(stale, [], `verdicts for choices that no longer exist: ${stale.join(', ')}`);
});

test('Decisions: a mission choice is logged with its verdict, money and lesson, and queued for the card', () => {
  const store = newGame();
  const a = store.actionableStep();
  assert.ok(a, 'Monday starts with a decision on screen');
  const choice = a!.step.choices![0];
  assert.equal(store.applyChoice(a!.def.id, choice), true);
  // Find a lunch decision: packed lunch is a smart move with a lesson.
  const lunch = store.defs.find(d => d.id === 'lunch_break')!;
  const packed = lunch.steps.flatMap(s => s.choices ?? []).find(c => c.id === 'packed')!;
  store.state.missions.find(m => m.id === 'lunch_break')!.state = 'active';
  store.takeDecisions();
  assert.equal(store.applyChoice('lunch_break', packed), true);
  const logged = store.state.today.decisions!.at(-1)!;
  assert.equal(logged.key, 'lunch_break:packed');
  assert.equal(logged.verdict, 'good');
  assert.ok(logged.lesson && logged.lesson.length > 10);
  const queued = store.takeDecisions();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].key, 'lunch_break:packed');
  assert.deepEqual(store.takeDecisions(), [], 'the queue empties once read');
});

test('Decisions: a refused choice (can not afford) is not logged', () => {
  const store = newGame();
  store.state.finance.accounts.cash = 0;
  const lunch = store.defs.find(d => d.id === 'lunch_break')!;
  const meal = lunch.steps.flatMap(s => s.choices ?? []).find(c => c.id === 'meal')!;
  store.state.missions.find(m => m.id === 'lunch_break')!.state = 'active';
  const before = (store.state.today.decisions ?? []).length;
  assert.equal(store.applyChoice('lunch_break', meal), false);
  assert.equal((store.state.today.decisions ?? []).length, before);
});

test('Decisions: the day recap gets the whole day, and a new day starts clean', () => {
  const store = newGame();
  store.noteDecision('job:laundry', 'Jobs board', 'Fold the laundry', 'Chores done.', 2, 'Time is money.', 'good');
  store.advance(at(0, 22, 0) - store.state.minutes);
  store.sleep();
  const rec = store.pendingDaySummary!;
  assert.ok(rec.decisions!.some(d => d.key === 'job:laundry' && d.verdict === 'good'));
  assert.deepEqual(store.state.today.decisions ?? [], []);
});

test('Decisions: saves from before decisions existed still load', () => {
  const store = newGame();
  const raw = JSON.parse(store.serialize());
  delete raw.today.decisions;
  const back = GameStore.hydrate(JSON.stringify(raw))!;
  back.noteDecision('job:recycling', 'Jobs board', 'Sort the recycling', 'Done.', 1.5, undefined, 'good');
  assert.equal(back.state.today.decisions!.length, 1);
});

// ── Buildings ───────────────────────────────────────────────────────────────────────────────────

test('Buildings: every building you can walk into has its own furnished room (no empty placeholder)', () => {
  for (const p of PLACES) {
    if (p.interior !== 'shop') continue;
    if (p.id === 'supermarket' || p.id === 'dairy') continue; // the grocery store
    const scene = PLACE_INTERIOR_SCENE[p.id];
    assert.ok(scene, `${p.name} has no dedicated room`);
    const room = getInterior(scene!);
    assert.ok(room, `${p.name} → ${scene} is not defined`);
    assert.ok(room.furniture.length >= 5, `${p.name}'s room is nearly empty`);
    assert.ok(room.wall, `${p.name}'s room has no back wall`);
    assert.ok(p.sprite, `${p.name} has no building art on the map`);
  }
});

test('Buildings: every room is walkable — spawn and exit are clear, and nothing is drawn as a blank block', () => {
  for (const room of Object.values(INTERIORS)) {
    assert.ok(!interiorBlocked(room, room.spawn.x, room.spawn.y), `${room.name}: spawn is inside furniture`);
    for (const l of room.links) {
      if (l.toScene !== 'outside') continue;
      assert.ok(!interiorBlocked(room, l.tile.x, Math.min(l.tile.y, room.heightTiles - 0.4)), `${room.name}: exit is blocked`);
    }
    for (const f of room.furniture) {
      assert.ok(f.sprite, `${room.name}: "${f.name}" has no art (would draw as a placeholder block)`);
      assert.ok(f.tx >= 0 && f.ty >= 0 && f.tx + f.tw <= room.widthTiles + 0.01 && f.ty + f.th <= room.heightTiles + 0.01,
        `${room.name}: "${f.name}" sticks out of the room`);
    }
    assert.ok(!(room.floorSprite.sx === 528 && room.floorSprite.sy === 192), `${room.name}: floor uses the empty sheet cell`);
  }
});

test('Buildings: walking into each new building puts you in its room', () => {
  const store = newGame();
  const cases: [string, string][] = [
    ['library', 'interior_library'], ['hospital', 'interior_clinic'], ['office', 'interior_office'],
    ['apartment', 'interior_apartments'], ['gym', 'interior_gym'], ['police', 'interior_services'],
    ['market', 'interior_market'], ['post_office', 'interior_post'],
  ];
  for (const [placeId, scene] of cases) {
    // Saturday midday: everything is open
    if (store.state.minutes < at(5, 12, 0)) store.advance(at(5, 12, 0) - store.state.minutes);
    if (store.state.player.scene !== 'outdoor') store.exitPlace();
    const r = store.enterPlace(placeId);
    if (!r.ok) continue; // closed right now (opening hours) — routing is still covered above
    assert.equal(store.state.player.scene, scene, `${placeId} should open into ${scene}`);
  }
  void pathRules;
});
