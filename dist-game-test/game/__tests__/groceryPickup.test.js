"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const world_1 = require("../../lib/world");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
/** A fresh store with pickup_groceries forced active on its shopping-list step ('s2'), and the
 *  player standing inside the supermarket interior at the milk shelf. */
function storeAtGroceryStep() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    const store = new store_1.GameStore(state);
    const rt = store.runtime('pickup_groceries');
    rt.state = 'active';
    rt.stepIndex = 1; // steps[0] = 's1' (remote accept), steps[1] = 's2' (awaitsPurchase)
    store.state.player.place = 'supermarket';
    store.state.player.scene = 'interior_supermarket';
    // Stand exactly on the milk shelf (tx:2, ty:4.5 in world.ts's interior_supermarket.shopItems).
    store.state.player.x = 2 * world_1.INTERIOR_TILE_PX;
    store.state.player.y = 4.5 * world_1.INTERIOR_TILE_PX;
    // The real 's1' accept step earns the player $15 for this errand before they ever reach the
    // supermarket; a schoolPath store otherwise starts with $0, which would make every pickup an
    // affordability failure unrelated to what this file is testing.
    store.earn(15, 'income', 'On it');
    return store;
}
function moveTo(store, tx, ty) {
    store.state.player.x = tx * world_1.INTERIOR_TILE_PX;
    store.state.player.y = ty * world_1.INTERIOR_TILE_PX;
}
(0, node_test_1.default)('GroceryPickup 1: an item out of range is not offered for interaction', () => {
    const store = storeAtGroceryStep();
    moveTo(store, 20, 20); // far from every shopItem in interior_supermarket
    strict_1.default.equal(store.nearbyShopItem(), null);
});
(0, node_test_1.default)('GroceryPickup 2: the first pickup of a needed item succeeds and is credited to the mission', () => {
    const store = storeAtGroceryStep();
    const result = store.buyNearbyShopItem();
    strict_1.default.equal(result.ok, true);
    strict_1.default.equal(result.item?.id, 'milk_basic');
});
(0, node_test_1.default)('GroceryPickup 3: the checklist marks milk covered immediately after picking it up', () => {
    const store = storeAtGroceryStep();
    store.buyNearbyShopItem();
    const progress = store.shoppingProgress();
    strict_1.default.ok(progress);
    const milkIdx = progress.need.indexOf('milk_');
    strict_1.default.equal(progress.covered[milkIdx], true);
});
(0, node_test_1.default)('GroceryPickup 4: the same physical item cannot be collected twice', () => {
    const store = storeAtGroceryStep();
    const balanceAfterFirst = (() => { store.buyNearbyShopItem(); return store.state.finance.accounts.cash; })();
    const second = store.buyNearbyShopItem();
    strict_1.default.equal(second.ok, false);
    strict_1.default.equal(second.reason, 'You already picked that up.');
    // Refused pickup must not charge a second time.
    strict_1.default.equal(store.state.finance.accounts.cash, balanceAfterFirst);
});
(0, node_test_1.default)('GroceryPickup 5: a different brand of an already-covered need is also blocked (need is per-prefix, not per-item-id)', () => {
    const store = storeAtGroceryStep();
    store.buyNearbyShopItem(); // covers milk_ via milk_basic
    moveTo(store, 2, 5.5); // milk_mid shelf
    const blocked = store.buyNearbyShopItem();
    strict_1.default.equal(blocked.ok, false);
});
(0, node_test_1.default)('GroceryPickup 6: remaining items stay collectable after one need is covered', () => {
    const store = storeAtGroceryStep();
    store.buyNearbyShopItem(); // milk
    moveTo(store, 4.5, 1.7); // bread shelf
    const bread = store.buyNearbyShopItem();
    strict_1.default.equal(bread.ok, true);
    strict_1.default.equal(bread.item?.id, 'bread_basic');
});
(0, node_test_1.default)('GroceryPickup 7: an incomplete list does not complete the mission on leaving the supermarket', () => {
    const store = storeAtGroceryStep();
    store.buyNearbyShopItem(); // milk only — bread and eggs still missing
    store.state.player.lastDoor = { placeId: 'supermarket', x: 0, y: 0, facing: 0 };
    store.exitPlace();
    strict_1.default.equal(store.runtime('pickup_groceries').state, 'active');
});
(0, node_test_1.default)('GroceryPickup 8: collecting all three items and leaving completes the mission and advances the objective', () => {
    const store = storeAtGroceryStep();
    store.buyNearbyShopItem(); // milk
    moveTo(store, 4.5, 1.7);
    store.buyNearbyShopItem(); // bread
    moveTo(store, 1.5, 1.7);
    store.buyNearbyShopItem(); // eggs
    const progress = store.shoppingProgress();
    strict_1.default.ok(progress.covered.every(Boolean));
    store.state.player.lastDoor = { placeId: 'supermarket', x: 0, y: 0, facing: 0 };
    store.exitPlace();
    strict_1.default.equal(store.runtime('pickup_groceries').state, 'completed');
});
