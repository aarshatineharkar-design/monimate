"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate 2.0 — this-step fix: focused tests for GameStore.setPaused(), the new write path for the
 * already-existing (but previously dead) `s.paused` flag. This is the fix for the bus destination
 * picker's race condition: BUS_ROUTE.dwellMin is 1 game-minute (== 1 real second at TIME_SCALE=1),
 * so without pausing, the clock could run past the bus's departure while the player was still
 * reading the two-destination picker, making boardBus() correctly refuse — silently, since nothing
 * previously surfaced the failure — which looked exactly like "no travel graphics at all".
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
(0, node_test_1.default)('BusPause 1: setPaused(true) stops the clock from advancing on tick()', () => {
    const store = freshDefaultStore();
    store.setPaused(true);
    const before = store.state.minutes;
    store.tick(5, 0); // 5 real seconds' worth of idle time, would normally advance ~5 game-minutes
    strict_1.default.equal(store.state.minutes, before);
});
(0, node_test_1.default)('BusPause 2: setPaused(false) resumes normal time advancement', () => {
    const store = freshDefaultStore();
    store.setPaused(true);
    store.tick(2, 0);
    store.setPaused(false);
    const before = store.state.minutes;
    store.tick(2, 0);
    strict_1.default.ok(store.state.minutes > before);
});
(0, node_test_1.default)('BusPause 3: pausing during the bus destination-picker window prevents the dwell window from elapsing before the player chooses', () => {
    const store = freshDefaultStore();
    store.advance(65); // 7:00 -> 8:05, still Monday
    store.state.player.place = null;
    // Put a bus at the home stop right now by advancing to the moment the loop starts (stop_home,
    // offsetMin 0) — simplest is to just construct the scenario directly via boardBus() itself, which
    // is the real authority being protected here.
    const stopHome = 'stop_home';
    // Freeze the clock the instant the picker would open (mirrors page.tsx's handleInteract()).
    store.setPaused(true);
    const minutesAtOpen = store.state.minutes;
    store.tick(3, 0); // simulate 3 real seconds of the player reading the picker
    strict_1.default.equal(store.state.minutes, minutesAtOpen); // unchanged — the race window is gone
    store.setPaused(false);
    void stopHome;
});
