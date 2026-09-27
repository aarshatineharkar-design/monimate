"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const systems_1 = require("../systems");
const createInitialGameState_1 = require("../state/createInitialGameState");
const schoolActivities_1 = require("../content/schoolActivities");
function freshSimulation() {
    const state = (0, createInitialGameState_1.createInitialGameState)();
    const clock = new systems_1.ClockSystem(state.time);
    const player = new systems_1.PlayerSystem(state.player);
    const energy = new systems_1.EnergySystem(state.energy);
    const finance = new systems_1.FinanceSystem(state.finance);
    const activity = new systems_1.ActivitySystem(clock, player, energy, finance);
    return { state, clock, player, energy, finance, activity };
}
(0, node_test_1.default)('Activity 15: Walk advances time and consumes energy, with no transaction', () => {
    const { state, activity } = freshSimulation();
    const startMinutes = state.time.minutes;
    const startEnergy = state.energy.current;
    const startCash = state.finance.accounts.cash;
    const result = activity.execute(schoolActivities_1.WALK_TO_SCHOOL);
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.time.minutes, startMinutes + 15);
    strict_1.default.equal(state.energy.current, startEnergy - 3);
    strict_1.default.equal(state.finance.accounts.cash, startCash); // unchanged
    if (result.success)
        strict_1.default.equal(result.transaction, null);
    strict_1.default.equal(state.finance.transactions.recent.length, 0);
});
(0, node_test_1.default)('Activity 16: Bus advances time, consumes energy, and creates a transport expense', () => {
    const { state, activity } = freshSimulation();
    const startMinutes = state.time.minutes;
    const startEnergy = state.energy.current;
    const startCash = state.finance.accounts.cash;
    const result = activity.execute(schoolActivities_1.TAKE_BUS);
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.time.minutes, startMinutes + 5);
    strict_1.default.equal(state.energy.current, startEnergy - 1);
    strict_1.default.equal(state.finance.accounts.cash, startCash - 2);
    if (result.success) {
        strict_1.default.ok(result.transaction);
        strict_1.default.equal(result.transaction.category, 'transport');
        strict_1.default.equal(result.transaction.amount, -2);
        strict_1.default.equal(result.transaction.description, 'Bus fare');
    }
});
(0, node_test_1.default)('Activity 17: Buy lunch creates a food expense', () => {
    const { state, activity } = freshSimulation();
    const startCash = state.finance.accounts.cash;
    const result = activity.execute(schoolActivities_1.BUY_LUNCH);
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.finance.accounts.cash, startCash - 6);
    if (result.success) {
        strict_1.default.equal(result.transaction.category, 'food');
        strict_1.default.equal(result.transaction.amount, -6);
    }
});
(0, node_test_1.default)('Activity 18: Helping parents creates income', () => {
    const { state, activity } = freshSimulation();
    const startCash = state.finance.accounts.cash;
    const startEnergy = state.energy.current;
    const result = activity.execute(schoolActivities_1.HELP_PARENTS);
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.finance.accounts.cash, startCash + 5);
    strict_1.default.equal(state.energy.current, startEnergy - 5);
    if (result.success) {
        strict_1.default.equal(result.transaction.category, 'income');
        strict_1.default.equal(result.transaction.amount, 5);
    }
});
(0, node_test_1.default)('Activity 19: an activity requiring more energy than available is rejected', () => {
    const { state, energy, activity } = freshSimulation();
    // drain energy down to less than HELP_PARENTS needs (5)
    energy.consume(state.energy.current - 3); // leaves exactly 3
    const result = activity.execute(schoolActivities_1.HELP_PARENTS);
    strict_1.default.equal(result.success, false);
    if (!result.success)
        strict_1.default.equal(result.reason, 'insufficient_energy');
});
(0, node_test_1.default)('Activity 19b: an activity requiring more money than available is rejected', () => {
    const { state, finance, activity } = freshSimulation();
    // spend down to $1 cash, less than BUY_LUNCH's $6
    finance.recordTransaction({ account: 'cash', amount: -(state.finance.accounts.cash - 1), category: 'other', type: 'expense', description: 'drain for test' }, state.time.minutes);
    const result = activity.execute(schoolActivities_1.BUY_LUNCH);
    strict_1.default.equal(result.success, false);
    if (!result.success)
        strict_1.default.equal(result.reason, 'insufficient_funds');
});
(0, node_test_1.default)('Activity 20: a failed activity does not partially modify time/energy/money', () => {
    const { state, energy, activity } = freshSimulation();
    energy.consume(state.energy.current - 3); // leaves 3 energy — not enough for HELP_PARENTS (needs 5)
    const minutesBefore = state.time.minutes;
    const energyBefore = state.energy.current;
    const cashBefore = state.finance.accounts.cash;
    const historyLengthBefore = state.finance.transactions.recent.length;
    const result = activity.execute(schoolActivities_1.HELP_PARENTS);
    strict_1.default.equal(result.success, false);
    strict_1.default.equal(state.time.minutes, minutesBefore, 'time must not advance on a failed activity');
    strict_1.default.equal(state.energy.current, energyBefore, 'energy must not change on a failed activity');
    strict_1.default.equal(state.finance.accounts.cash, cashBefore, 'cash must not change on a failed activity');
    strict_1.default.equal(state.finance.transactions.recent.length, historyLengthBefore, 'no transaction must be created for a failed activity');
});
(0, node_test_1.default)('Activity: transaction timestamp is the completion time, not the start time', () => {
    // Worked example from the Step 3 patch: lunch starts at 12:00 PM, takes 10 minutes,
    // completes at 12:10 PM — the transaction timestamp must be 12:10 PM (the completion time),
    // not 12:00 PM (the start time).
    const { state, clock, activity } = freshSimulation();
    const startOfDay = state.time.minutes - (state.time.minutes % 1440);
    const noon = startOfDay + 12 * 60; // 12:00 PM that day
    clock.advance(noon - state.time.minutes);
    const startMinutes = state.time.minutes;
    strict_1.default.equal(startMinutes, noon); // 1. activity starts at a known time
    const result = activity.execute(schoolActivities_1.BUY_LUNCH); // BUY_LUNCH costs 10 minutes
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.time.minutes, startMinutes + 10); // 2. activity advances time
    strict_1.default.ok(result.success && result.transaction); // 3. a transaction is created
    if (result.success) {
        // 4. transaction timestamp equals the post-activity (completion) game time, not the start time
        strict_1.default.equal(result.transaction.timestamp, startMinutes + 10);
        strict_1.default.equal(result.transaction.timestamp, state.time.minutes);
        strict_1.default.notEqual(result.transaction.timestamp, startMinutes);
    }
});
(0, node_test_1.default)('Activity: requirement.place is enforced before any mutation', () => {
    const { state, activity } = freshSimulation();
    const gated = {
        ...schoolActivities_1.WALK_TO_SCHOOL,
        id: 'gated_walk',
        requirement: { place: 'university' }, // player starts at 'home', not 'university'
    };
    const minutesBefore = state.time.minutes;
    const result = activity.execute(gated);
    strict_1.default.equal(result.success, false);
    if (!result.success)
        strict_1.default.equal(result.reason, 'requirement_not_met');
    strict_1.default.equal(state.time.minutes, minutesBefore);
});
