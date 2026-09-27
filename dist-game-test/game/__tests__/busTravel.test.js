"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate 2.0 — Step 16: focused tests for GameStore.boardBus()'s new Energy cost.
 *
 * Scope: this tests the LIVE general-world bus system (src/lib/store.ts's boardBus()/finishRide(),
 * driven by src/lib/world.ts's real BUS_ROUTE), not Core Simulation's TAKE_BUS — the Step 16 audit
 * found the two are deliberately separate (fixed Monday-school activity vs. real variable-fare/
 * duration live travel) and this step does not merge them. Lives under src/game/__tests__/ only
 * because that's what tsconfig.game-test.json compiles/runs, same as mondayAdapter.test.ts and
 * missionScheduling.test.ts.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const world_1 = require("../../lib/world");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
const HOME_STOP = world_1.BUS_STOPS.home.id; // 'stop_home'
const SCHOOL_STOP = world_1.BUS_STOPS.school.id; // 'stop_school'
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
/** A store advanced exactly to the next moment a real bus is standing (doors open) at Home St —
 *  found via world.ts's own nextBusAt(), not a guessed/hardcoded minute, so this stays correct if
 *  the timetable ever changes. Also seeds $20 (via the store's own public earn()) so fare
 *  affordability isn't a confound in tests that aren't specifically about money. */
function storeWithBusAtHomeStop() {
    const store = freshDefaultStore();
    const arrival = (0, world_1.nextBusAt)(HOME_STOP, store.state.minutes);
    store.advance(arrival.arrivesAt - store.state.minutes);
    store.earn(20, 'other', 'seed fare money for test');
    // Sanity check the fixture itself before any test relies on it.
    if (!(0, world_1.busAtStop)(HOME_STOP, store.state.minutes)) {
        throw new Error('test fixture: expected a bus to be standing at stop_home at this minute');
    }
    return store;
}
(0, node_test_1.default)('Bus 1: successful boarding charges exactly the existing bus fare (BUS_ROUTE.fare)', () => {
    const store = storeWithBusAtHomeStop();
    const balanceBefore = store.state.finance.accounts.cash;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore - 2.0); // BUS_ROUTE.fare
});
(0, node_test_1.default)('Bus 2: successful boarding consumes exactly the selected Energy cost (1)', () => {
    const store = storeWithBusAtHomeStop();
    const energyBefore = store.getEnergy().current;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(store.getEnergy().current, energyBefore - 1);
});
(0, node_test_1.default)('Bus 3: successful boarding creates the expected ride state', () => {
    const store = storeWithBusAtHomeStop();
    const minutesAtBoarding = store.state.minutes;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.ok(store.state.ride, 'expected s.ride to be set after boarding');
    strict_1.default.equal(store.state.ride.fromStop, HOME_STOP);
    strict_1.default.equal(store.state.ride.toStop, SCHOOL_STOP);
    strict_1.default.equal(store.state.ride.startedAt, minutesAtBoarding);
    strict_1.default.equal(store.state.ride.fare, 2.0);
    strict_1.default.equal(store.state.player.scene, 'bus');
    strict_1.default.equal(store.state.player.status, 'on_bus');
    strict_1.default.equal(store.state.player.place, null);
});
(0, node_test_1.default)('Bus 4: successful boarding preserves the existing destination and ride duration (rideMinutes)', () => {
    const store = storeWithBusAtHomeStop();
    const minutesAtBoarding = store.state.minutes;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, true);
    const expectedRide = Math.max(2, (0, world_1.rideMinutes)(HOME_STOP, SCHOOL_STOP));
    strict_1.default.equal(store.state.ride.endsAt, minutesAtBoarding + expectedRide);
});
(0, node_test_1.default)('Bus 5: insufficient money rejects boarding with zero mutation', () => {
    const store = freshDefaultStore(); // $0 starting balance for School — never seeded with $20 here
    const arrival = (0, world_1.nextBusAt)(HOME_STOP, store.state.minutes);
    store.advance(arrival.arrivesAt - store.state.minutes);
    strict_1.default.ok((0, world_1.busAtStop)(HOME_STOP, store.state.minutes));
    strict_1.default.equal(store.state.finance.accounts.cash < 2.0, true); // genuinely can't afford the fare
    const balanceBefore = store.state.finance.accounts.cash;
    const energyBefore = store.getEnergy().current;
    const minutesBefore = store.state.minutes;
    const rideBefore = store.state.ride;
    const placeBefore = store.state.player.place;
    const ledgerLengthBefore = store.state.finance.transactions.recent.length;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore);
    strict_1.default.equal(store.getEnergy().current, energyBefore);
    strict_1.default.equal(store.state.minutes, minutesBefore);
    strict_1.default.equal(store.state.ride, rideBefore);
    strict_1.default.equal(store.state.player.place, placeBefore);
    strict_1.default.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore);
});
(0, node_test_1.default)('Bus 6: insufficient energy rejects boarding with zero mutation', () => {
    const store = storeWithBusAtHomeStop();
    store.consumeEnergy(store.getEnergy().current); // drain to 0 — less than the 1 energy a ride needs
    const balanceBefore = store.state.finance.accounts.cash;
    const energyBefore = store.getEnergy().current;
    const minutesBefore = store.state.minutes;
    const rideBefore = store.state.ride;
    const placeBefore = store.state.player.place;
    const ledgerLengthBefore = store.state.finance.transactions.recent.length;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore); // fare NOT charged even though affordable
    strict_1.default.equal(store.getEnergy().current, energyBefore);
    strict_1.default.equal(store.state.minutes, minutesBefore);
    strict_1.default.equal(store.state.ride, rideBefore);
    strict_1.default.equal(store.state.player.place, placeBefore);
    strict_1.default.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore);
});
(0, node_test_1.default)('Bus 7: failure does not create or modify s.ride', () => {
    const store = storeWithBusAtHomeStop();
    store.consumeEnergy(store.getEnergy().current);
    strict_1.default.equal(store.state.ride, null);
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(store.state.ride, null);
});
(0, node_test_1.default)('Bus 8: failure does not alter player location', () => {
    const store = storeWithBusAtHomeStop();
    store.consumeEnergy(store.getEnergy().current);
    const placeBefore = store.state.player.place;
    const sceneBefore = store.state.player.scene;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, false);
    strict_1.default.equal(store.state.player.place, placeBefore);
    strict_1.default.equal(store.state.player.scene, sceneBefore);
});
(0, node_test_1.default)('Bus 9: successful finishRide() still places the player at the expected destination', () => {
    const store = storeWithBusAtHomeStop();
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, true);
    // finishRide() is only ever triggered from tick() (the per-frame loop), not from advance() —
    // a pre-existing, unrelated live behavior this step does not change (Step 16 preserves "existing
    // asynchronous ride timing" exactly as-is). tick() itself caps how much game-time a single call
    // can cover (advance(Math.min(minutes, 5), true)), so repeated large-dtSec calls simulate the
    // real frame loop eventually completing the ride, without altering any Step 16 code path.
    for (let i = 0; i < 20 && store.state.ride; i++)
        store.tick(1000, 0);
    strict_1.default.equal(store.state.ride, null); // finishRide() clears it
    strict_1.default.equal(store.state.player.scene, 'outdoor');
    strict_1.default.equal(store.state.player.status, 'idle');
});
(0, node_test_1.default)('Bus 10: existing finance ledger behavior remains correct — one new entry for the fare, no separate energy entry', () => {
    const store = storeWithBusAtHomeStop();
    const ledgerLengthBefore = store.state.finance.transactions.recent.length;
    const outcome = store.boardBus(HOME_STOP, SCHOOL_STOP);
    strict_1.default.equal(outcome.ok, true);
    strict_1.default.equal(store.state.finance.transactions.recent.length, ledgerLengthBefore + 1); // exactly one new ledger entry
    const entry = store.state.finance.transactions.recent[store.state.finance.transactions.recent.length - 1];
    strict_1.default.equal(entry.amount, -2.0);
    strict_1.default.equal(entry.category, 'transport');
    strict_1.default.equal(entry.description, 'Bus fare');
});
