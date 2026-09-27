/**
 * MoniMate 2.0 — Step 28: focused tests for the two genuinely new pieces of store.ts logic this
 * step added:
 *   1. buyNearbyShopItem() now refuses a second pickup of a grocery-list need already covered by a
 *      real purchase this mission (the "same physical item can't be collected twice" rule).
 *   2. The existing shoppingProgress()/purchase-log machinery, exercised end-to-end through a real
 *      pickup_groceries run, to prove the checklist updates correctly and completion only fires once
 *      every need is covered.
 * Everything else Step 28 added (the "[E] Talk"/"[E] Pick Up" HUD prompts, the world-space NPC
 * marker, the objective-name NPC label) is presentational, in page.tsx, and per the project's
 * established convention ("do not write tests for visual appearance") is not covered here.
 *
 * These tests force the pickup_groceries mission straight into its 's2' (awaitsPurchase) step and
 * place the player inside the supermarket interior, rather than driving the full location/interaction
 * trigger chain — the trigger/window machinery itself is exercised by the pre-existing mission
 * engine tests, so this file only exercises the new pickup-blocking logic and its interaction with
 * the pre-existing shopping-list resolution path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';
import { INTERIOR_TILE_PX } from '../../lib/world';

const SCHOOL_CONFIG = LIFE_PATHS.find((p) => p.id === 'school')!;

/** A fresh store with pickup_groceries forced active on its shopping-list step ('s2'), and the
 *  player standing inside the supermarket interior at the milk shelf. */
function storeAtGroceryStep(): GameStore {
  const finance = makeInitialFinance(SCHOOL_CONFIG);
  const state = createInitialState('school', finance);
  const store = new GameStore(state);
  const rt = store.runtime('pickup_groceries')!;
  rt.state = 'active';
  rt.stepIndex = 1; // steps[0] = 's1' (remote accept), steps[1] = 's2' (awaitsPurchase)
  store.state.player.place = 'supermarket';
  store.state.player.scene = 'interior_supermarket';
  // Stand exactly on the milk shelf (tx:2, ty:4.5 in world.ts's interior_supermarket.shopItems).
  store.state.player.x = 2 * INTERIOR_TILE_PX;
  store.state.player.y = 4.5 * INTERIOR_TILE_PX;
  // The real 's1' accept step earns the player $15 for this errand before they ever reach the
  // supermarket; a schoolPath store otherwise starts with $0, which would make every pickup an
  // affordability failure unrelated to what this file is testing.
  store.earn(15, 'mission', 'On it');
  return store;
}

function moveTo(store: GameStore, tx: number, ty: number) {
  store.state.player.x = tx * INTERIOR_TILE_PX;
  store.state.player.y = ty * INTERIOR_TILE_PX;
}

test('GroceryPickup 1: an item out of range is not offered for interaction', () => {
  const store = storeAtGroceryStep();
  moveTo(store, 20, 20); // far from every shopItem in interior_supermarket
  assert.equal(store.nearbyShopItem(), null);
});

test('GroceryPickup 2: the first pickup of a needed item succeeds and is credited to the mission', () => {
  const store = storeAtGroceryStep();
  const result = store.buyNearbyShopItem();
  assert.equal(result.ok, true);
  assert.equal(result.item?.id, 'milk_basic');
});

test('GroceryPickup 3: the checklist marks milk covered immediately after picking it up', () => {
  const store = storeAtGroceryStep();
  store.buyNearbyShopItem();
  const progress = store.shoppingProgress();
  assert.ok(progress);
  const milkIdx = progress!.need.indexOf('milk_');
  assert.equal(progress!.covered[milkIdx], true);
});

test('GroceryPickup 4: the same physical item cannot be collected twice', () => {
  const store = storeAtGroceryStep();
  const balanceAfterFirst = (() => { store.buyNearbyShopItem(); return store.state.finance.balance; })();
  const second = store.buyNearbyShopItem();
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'You already picked that up.');
  // Refused pickup must not charge a second time.
  assert.equal(store.state.finance.balance, balanceAfterFirst);
});

test('GroceryPickup 5: a different brand of an already-covered need is also blocked (need is per-prefix, not per-item-id)', () => {
  const store = storeAtGroceryStep();
  store.buyNearbyShopItem(); // covers milk_ via milk_basic
  moveTo(store, 2, 5.5); // milk_mid shelf
  const blocked = store.buyNearbyShopItem();
  assert.equal(blocked.ok, false);
});

test('GroceryPickup 6: remaining items stay collectable after one need is covered', () => {
  const store = storeAtGroceryStep();
  store.buyNearbyShopItem(); // milk
  moveTo(store, 4.5, 1.7); // bread shelf
  const bread = store.buyNearbyShopItem();
  assert.equal(bread.ok, true);
  assert.equal(bread.item?.id, 'bread_basic');
});

test('GroceryPickup 7: an incomplete list does not complete the mission on leaving the supermarket', () => {
  const store = storeAtGroceryStep();
  store.buyNearbyShopItem(); // milk only — bread and eggs still missing
  store.state.player.lastDoor = { placeId: 'supermarket', x: 0, y: 0, facing: 0 };
  store.exitPlace();
  assert.equal(store.runtime('pickup_groceries')!.state, 'active');
});

test('GroceryPickup 8: collecting all three items and leaving completes the mission and advances the objective', () => {
  const store = storeAtGroceryStep();
  store.buyNearbyShopItem(); // milk
  moveTo(store, 4.5, 1.7); store.buyNearbyShopItem(); // bread
  moveTo(store, 1.5, 1.7); store.buyNearbyShopItem(); // eggs
  const progress = store.shoppingProgress()!;
  assert.ok(progress.covered.every(Boolean));
  store.state.player.lastDoor = { placeId: 'supermarket', x: 0, y: 0, facing: 0 };
  store.exitPlace();
  assert.equal(store.runtime('pickup_groceries')!.state, 'completed');
});
