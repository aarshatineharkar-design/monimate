"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const mondayFlow_1 = require("../content/school/mondayFlow");
const createInitialGameState_1 = require("../state/createInitialGameState");
function freshMonday() {
    const state = (0, createInitialGameState_1.createInitialGameState)();
    const flow = new mondayFlow_1.MondayFlow(state);
    return { state, flow };
}
(0, node_test_1.default)('Monday 1: Monday starts with $20', () => {
    const { state } = freshMonday();
    strict_1.default.equal(state.finance.accounts.cash, 20);
});
(0, node_test_1.default)('Monday 2: walking to school consumes time and energy but no transport money', () => {
    const { state, flow } = freshMonday();
    const startMinutes = state.time.minutes;
    const startEnergy = state.energy.current;
    const startCash = state.finance.accounts.cash;
    const result = flow.chooseTransport('walk');
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.time.minutes, startMinutes + 15);
    strict_1.default.equal(state.energy.current, startEnergy - 3);
    strict_1.default.equal(state.finance.accounts.cash, startCash); // unchanged
    strict_1.default.equal(state.player.world.place, 'university');
    strict_1.default.equal(flow.phase, 'school');
});
(0, node_test_1.default)('Monday 3: taking the bus consumes time/energy and creates a transport transaction', () => {
    const { state, flow } = freshMonday();
    const startCash = state.finance.accounts.cash;
    const result = flow.chooseTransport('bus');
    strict_1.default.equal(result.success, true);
    if (result.success) {
        strict_1.default.ok(result.transaction);
        strict_1.default.equal(result.transaction.category, 'transport');
        strict_1.default.equal(result.transaction.amount, -2);
    }
    strict_1.default.equal(state.finance.accounts.cash, startCash - 2);
});
(0, node_test_1.default)('Monday 4: buying lunch creates a food transaction', () => {
    const { flow, state } = freshMonday();
    flow.chooseTransport('walk');
    flow.attendClass();
    const startCash = state.finance.accounts.cash;
    const result = flow.chooseLunch('buy');
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.finance.accounts.cash, startCash - 6);
    if (result.success) {
        strict_1.default.ok(result.transaction);
        strict_1.default.equal(result.transaction.category, 'food');
    }
    strict_1.default.equal(flow.phase, 'after_school');
});
(0, node_test_1.default)('Monday 5: bringing lunch does not create a food purchase', () => {
    const { flow, state } = freshMonday();
    flow.chooseTransport('walk');
    flow.attendClass();
    const startCash = state.finance.accounts.cash;
    const historyBefore = state.finance.transactions.recent.length;
    const result = flow.chooseLunch('bring');
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.finance.accounts.cash, startCash); // unchanged
    if (result.success)
        strict_1.default.equal(result.transaction, null);
    strict_1.default.equal(state.finance.transactions.recent.length, historyBefore);
});
(0, node_test_1.default)('Monday 6: activities cannot execute when their requirements are not satisfied', () => {
    const { flow } = freshMonday();
    // attendClass requires being at 'university', but morning_transport hasn't happened yet —
    // calling it out of phase must throw rather than silently doing nothing.
    strict_1.default.throws(() => flow.attendClass());
});
(0, node_test_1.default)('Monday 6b: an in-phase activity whose place requirement is satisfied succeeds (positive control for requirement gating)', () => {
    const { flow } = freshMonday();
    flow.chooseTransport('walk'); // moves player to 'university'
    // Confirms MondayFlow actually routes through ActivitySystem.canExecute()'s requirement check
    // (the negative case — requirement genuinely unmet — is covered directly against
    // ActivitySystem in activitySystem.test.ts, since MondayFlow's phase guard makes it impossible
    // to reach attendClass() without already being at 'university').
    const result = flow.attendClass();
    strict_1.default.equal(result.success, true);
});
(0, node_test_1.default)('Monday 7: failed activities (phase violations) do not partially mutate state', () => {
    const { state, flow } = freshMonday();
    const minutesBefore = state.time.minutes;
    const energyBefore = state.energy.current;
    const cashBefore = state.finance.accounts.cash;
    strict_1.default.throws(() => flow.chooseLunch('buy')); // wrong phase: still morning_transport
    strict_1.default.equal(state.time.minutes, minutesBefore);
    strict_1.default.equal(state.energy.current, energyBefore);
    strict_1.default.equal(state.finance.accounts.cash, cashBefore);
    strict_1.default.equal(flow.phase, 'morning_transport');
});
(0, node_test_1.default)('Monday 8: parent errand can be accepted and completed', () => {
    const { flow, state } = freshMonday();
    flow.chooseTransport('walk');
    flow.attendClass();
    flow.chooseLunch('bring');
    flow.chooseAfterSchool('home');
    strict_1.default.equal(flow.phase, 'errand');
    const cashBeforeErrand = state.finance.accounts.cash;
    const result = flow.resolveErrand(true);
    strict_1.default.ok(result);
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(state.finance.accounts.cash, cashBeforeErrand - 3);
    strict_1.default.equal(flow.phase, 'complete');
});
(0, node_test_1.default)('Monday 8b: parent errand can be declined with zero mutation', () => {
    const { flow, state } = freshMonday();
    flow.chooseTransport('walk');
    flow.attendClass();
    flow.chooseLunch('bring');
    flow.chooseAfterSchool('home');
    const cashBefore = state.finance.accounts.cash;
    const historyBefore = state.finance.transactions.recent.length;
    const result = flow.resolveErrand(false);
    strict_1.default.equal(result, null);
    strict_1.default.equal(state.finance.accounts.cash, cashBefore);
    strict_1.default.equal(state.finance.transactions.recent.length, historyBefore);
    strict_1.default.equal(flow.phase, 'complete');
});
(0, node_test_1.default)('Monday 9: end-of-day state correctly reflects the day\'s transactions', () => {
    const { flow, state } = freshMonday();
    flow.chooseTransport('bus'); // -2
    flow.attendClass();
    flow.chooseLunch('buy'); // -6
    flow.chooseAfterSchool('home');
    flow.resolveErrand(true); // -3
    const summary = flow.endDay();
    strict_1.default.equal(summary.day, 'Monday');
    strict_1.default.equal(summary.startingCash, 20);
    strict_1.default.equal(summary.spentToday, 11); // 2 + 6 + 3
    strict_1.default.equal(summary.earnedToday, 0);
    strict_1.default.equal(summary.remainingCash, 9);
    strict_1.default.equal(summary.remainingCash, state.finance.accounts.cash);
    strict_1.default.equal(summary.transactionsToday, 3);
    strict_1.default.equal(summary.errandAccepted, true);
});
(0, node_test_1.default)('Monday 10: savings goal progress reflects actual money saved/spent', () => {
    const { flow } = freshMonday();
    flow.chooseTransport('walk'); // no cost
    flow.attendClass();
    flow.chooseLunch('bring'); // no cost
    flow.chooseAfterSchool('home');
    flow.resolveErrand(false); // no cost
    const summary = flow.endDay();
    strict_1.default.ok(summary.goal);
    strict_1.default.equal(summary.goal.id, 'save10_saturday');
    strict_1.default.equal(summary.goal.target, 10);
    // No spending happened at all today, so progress toward the goal (earned - spent) is 0, not
    // some fabricated "started with $20 so goal is basically done" figure.
    strict_1.default.equal(summary.goal.progress, 0);
});
(0, node_test_1.default)('Monday: endDay is only reachable once every phase has resolved', () => {
    const { flow } = freshMonday();
    strict_1.default.throws(() => flow.endDay());
    flow.chooseTransport('walk');
    strict_1.default.throws(() => flow.endDay());
});
(0, node_test_1.default)('Monday: the full happy path reaches "complete" and matches the spec\'s loop order', () => {
    const { flow } = freshMonday();
    strict_1.default.equal(flow.phase, 'morning_transport');
    flow.chooseTransport('bus');
    strict_1.default.equal(flow.phase, 'school');
    flow.attendClass();
    strict_1.default.equal(flow.phase, 'lunch');
    flow.chooseLunch('buy');
    strict_1.default.equal(flow.phase, 'after_school');
    flow.chooseAfterSchool('friend');
    strict_1.default.equal(flow.phase, 'errand');
    flow.resolveErrand(true);
    strict_1.default.equal(flow.phase, 'complete');
    const summary = flow.endDay();
    strict_1.default.equal(summary.day, 'Monday');
});
