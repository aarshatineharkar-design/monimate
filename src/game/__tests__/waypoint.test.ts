/**
 * MoniMate — the map arrow points at the task you're actually doing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { trackedMission } from '../../lib/missions';
import { waypointReadout } from '../../lib/waypoint';
import { at } from '../../lib/clock';

const SCHOOL = getLifePath('school');
const newGame = () => new GameStore(createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL)));
function quiet(store: GameStore) {
  for (const rt of store.state.missions) { rt.state = 'locked'; rt.stepIndex = 0; }
}

test('Waypoint: an accepted errand wins over an unanswered phone offer', () => {
  const store = newGame();
  store.advance(at(0, 16, 0) - store.state.minutes);
  quiet(store);
  const groceries = store.runtime('pickup_groceries')!;
  groceries.state = 'active'; groceries.stepIndex = 1;           // walking to the supermarket
  store.runtime('found_wallet')!.state = 'available';             // a higher-priority text, not answered
  const t = trackedMission(store.state, store.defs)!;
  assert.equal(t.def.id, 'pickup_groceries');
  assert.equal(t.placeId, 'supermarket');
});

test("Waypoint: Monday's 7 PM grocery run beats Wednesday's project supplies", () => {
  const store = newGame();
  store.advance(at(0, 16, 0) - store.state.minutes);
  quiet(store);
  const project = store.runtime('school_project')!;
  project.state = 'active'; project.stepIndex = 1; project.expiresAt = at(2, 17, 30); // Bookshop, due Wednesday
  const groceries = store.runtime('pickup_groceries')!;
  groceries.state = 'active'; groceries.stepIndex = 1; groceries.expiresAt = at(0, 19, 0); // Supermarket, due tonight
  const t = trackedMission(store.state, store.defs)!;
  assert.equal(t.def.id, 'pickup_groceries');
  // ...and once the groceries are done, the arrow moves on to the project.
  groceries.state = 'completed';
  assert.equal(trackedMission(store.state, store.defs)!.placeId, 'shop_small');
});

test('Waypoint: a text you have not answered never sets a map destination', () => {
  const store = newGame();
  quiet(store);
  store.runtime('found_wallet')!.state = 'available';
  assert.equal(trackedMission(store.state, store.defs), null);
  assert.equal(waypointReadout(store.state, store.defs), null);
});

test('Waypoint: indoors, the arrow is measured from the building you are in', () => {
  const store = newGame();                                       // starts in your room at home
  quiet(store);
  const groceries = store.runtime('pickup_groceries')!;
  groceries.state = 'active'; groceries.stepIndex = 1;
  const w = waypointReadout(store.state, store.defs)!;
  assert.equal(w.label, 'Supermarket');
  assert.equal(w.arrow, '↓', 'the Supermarket is straight down the road from home');
  assert.equal(w.here, false);
  assert.ok(w.metres > 50);
});

test("Waypoint: once you're inside the right building it says you're there", () => {
  const store = newGame();
  quiet(store);
  const groceries = store.runtime('pickup_groceries')!;
  groceries.state = 'active'; groceries.stepIndex = 1;
  store.state.player.place = 'supermarket';
  store.state.player.scene = 'interior_supermarket';
  assert.equal(waypointReadout(store.state, store.defs)!.here, true);
});
