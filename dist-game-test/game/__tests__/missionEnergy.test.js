"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MoniMate 2.0 — Step 22: proves that GameStore.applyChoice() consumes MissionChoice.energyCost via
 * the existing, unmodified consumeEnergy() mechanism, non-blockingly, without touching any other
 * existing mission effect (money, time, relationship, flags, lesson, finish/advance behavior).
 *
 * These tests exercise the real School mission definitions in src/lib/missions.ts and the real
 * GameStore.applyChoice() in src/lib/store.ts — no fake mission system is fabricated. A couple of
 * cases use a synthetic MissionChoice object applied to a real, already-actionable mission step
 * (same pattern as this file's "real end-to-end" test) purely to isolate the energyCost=5 / no-cost /
 * zero-cost / insufficient-energy cases from any one authored choice's specific side effects.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../../lib/store");
const gameData_1 = require("../../lib/gameData");
const missions_1 = require("../../lib/missions");
const SCHOOL_CONFIG = gameData_1.LIFE_PATHS.find((p) => p.id === 'school');
function freshDefaultStore() {
    const finance = (0, gameData_1.makeInitialFinance)(SCHOOL_CONFIG);
    const state = (0, store_1.createInitialState)('school', finance);
    return new store_1.GameStore(state);
}
/** A store with a real, active, actionable dialogue step: Monday 7:00, Mum's pocket-money message.
 *  Used to apply synthetic choices so the Energy mechanic is tested in isolation. */
function storeWithGetToSchoolActionable() {
    const store = freshDefaultStore();
    const actionable = store.actionableStep();
    strict_1.default.ok(actionable, 'expected pocket_money to be actionable at 7:00 AM Monday');
    strict_1.default.equal(actionable.def.id, 'pocket_money');
    return store;
}
/** A synthetic MissionChoice, applied against a real mission's real actionable step, used only to
 *  isolate the Energy mechanic itself from any one authored choice's specific other effects. */
function syntheticChoice(overrides) {
    return {
        id: 'synthetic', label: 'Synthetic choice', sublabel: '', cost: 0, minutes: 0,
        consequence: 'test-only synthetic choice',
        ...overrides,
    };
}
(0, node_test_1.default)('MissionEnergy 1: a choice with energyCost 5 reduces Energy by exactly 5', () => {
    const store = storeWithGetToSchoolActionable();
    const actionable = store.actionableStep();
    const before = store.getEnergy().current;
    store.applyChoice(actionable.def.id, syntheticChoice({ energyCost: 5 }));
    strict_1.default.equal(store.getEnergy().current, before - 5);
});
(0, node_test_1.default)('MissionEnergy 2: a choice with no energyCost does not change Energy', () => {
    const store = storeWithGetToSchoolActionable();
    const actionable = store.actionableStep();
    const before = store.getEnergy().current;
    store.applyChoice(actionable.def.id, syntheticChoice({}));
    strict_1.default.equal(store.getEnergy().current, before);
});
(0, node_test_1.default)('MissionEnergy 3: a choice with energyCost 0 does not change Energy', () => {
    const store = storeWithGetToSchoolActionable();
    const actionable = store.actionableStep();
    const before = store.getEnergy().current;
    store.applyChoice(actionable.def.id, syntheticChoice({ energyCost: 0 }));
    strict_1.default.equal(store.getEnergy().current, before);
});
(0, node_test_1.default)('MissionEnergy 4: insufficient Energy does not reject the choice — it still applies fully', () => {
    const store = storeWithGetToSchoolActionable();
    store.earn(10, 'other', 'test cash'); // money can't go negative, so give the $3 choice something to spend
    // Drain Energy down to 2, less than the energyCost of 5 we're about to apply.
    store.consumeEnergy(store.getEnergy().current - 2);
    strict_1.default.equal(store.getEnergy().current, 2);
    const actionable = store.actionableStep();
    const balanceBefore = store.state.finance.accounts.cash;
    const minutesBefore = store.state.minutes;
    const relBefore = store.state.world.relationships['Mum'] ?? 0;
    const choice = syntheticChoice({
        energyCost: 5, cost: -3, minutes: 10, relationship: 1, flags: ['synthetic_flag'],
    });
    store.applyChoice(actionable.def.id, choice);
    // Energy clamps at 0 (existing consumeEnergy() semantics) rather than blocking anything.
    strict_1.default.equal(store.getEnergy().current, 0);
    // Every other normal effect of the choice still applied.
    strict_1.default.equal(store.state.finance.accounts.cash, balanceBefore - 3);
    strict_1.default.equal(store.state.minutes, minutesBefore + 10);
    if (actionable.step.speaker === 'Mum') {
        strict_1.default.equal(store.state.world.relationships['Mum'], relBefore + 1);
    }
    strict_1.default.equal(store.state.world.flags.includes('synthetic_flag'), true);
});
(0, node_test_1.default)('MissionEnergy 5: an Energy cost does not alter income, expenses, balance or transaction history', () => {
    const withEnergy = storeWithGetToSchoolActionable();
    const withoutEnergy = storeWithGetToSchoolActionable();
    const actionableA = withEnergy.actionableStep();
    const actionableB = withoutEnergy.actionableStep();
    strict_1.default.equal(actionableA.def.id, actionableB.def.id);
    const shared = { cost: -4, minutes: 10, consequence: 'x' };
    withEnergy.applyChoice(actionableA.def.id, syntheticChoice({ ...shared, energyCost: 8 }));
    withoutEnergy.applyChoice(actionableB.def.id, syntheticChoice({ ...shared }));
    strict_1.default.equal(withEnergy.state.finance.accounts.cash, withoutEnergy.state.finance.accounts.cash);
    strict_1.default.equal(withEnergy.state.finance.totals.totalSpent, withoutEnergy.state.finance.totals.totalSpent);
    strict_1.default.equal(withEnergy.state.finance.totals.totalEarned, withoutEnergy.state.finance.totals.totalEarned);
    strict_1.default.deepEqual(withEnergy.state.finance.transactions.recent, withoutEnergy.state.finance.transactions.recent);
});
(0, node_test_1.default)('MissionEnergy 6: a real School mission choice (unexpected_event / walk) applies Energy end-to-end', () => {
    const store = freshDefaultStore();
    const rt = store.runtime('unexpected_event');
    rt.state = 'active';
    rt.stepIndex = 0;
    const def = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'unexpected_event');
    const walkChoice = def.steps[0].choices.find(c => c.id === 'walk');
    strict_1.default.equal(walkChoice.energyCost, 5);
    const energyBefore = store.getEnergy().current;
    const minutesBefore = store.state.minutes;
    store.applyChoice('unexpected_event', walkChoice);
    strict_1.default.equal(store.getEnergy().current, energyBefore - 5);
    strict_1.default.equal(store.state.minutes, minutesBefore + 25);
    strict_1.default.equal(store.state.world.flags.includes('unexpected_walked'), true);
    strict_1.default.equal(rt.state, 'completed', 'the choice resolves the mission (it used to leave it stuck active)');
});
(0, node_test_1.default)('MissionEnergy 7: an ordinary conversational/passive choice remains free of Energy cost', () => {
    const def = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'pocket_money');
    const takeChoice = def.steps[0].choices.find(c => c.id === 'take');
    strict_1.default.equal(takeChoice.energyCost, undefined);
    const store = freshDefaultStore();
    store.advance(5);
    const before = store.getEnergy().current;
    store.applyChoice('pocket_money', takeChoice);
    strict_1.default.equal(store.getEnergy().current, before);
});
(0, node_test_1.default)('MissionEnergy 8: selected physical choices carry their intended authored values', () => {
    // The trip to school is no longer a menu: real walking and the real bus are the choice.
    const getToSchool = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'get_to_school');
    strict_1.default.equal(getToSchool.steps.length, 1);
    strict_1.default.equal(getToSchool.steps[0].choices, undefined);
    strict_1.default.equal(getToSchool.steps[0].completeOnArrival, true);
    const unexpected = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'unexpected_event');
    const uWalk = unexpected.steps[0].choices.find(c => c.id === 'walk');
    const uPay = unexpected.steps[0].choices.find(c => c.id === 'pay');
    strict_1.default.equal(uWalk.energyCost, 5);
    strict_1.default.equal(uPay.energyCost, undefined);
    const arcade = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'arcade_invite');
    const goAllIn = arcade.steps[0].choices.find(c => c.id === 'arcade');
    const spendLess = arcade.steps[0].choices.find(c => c.id === 'spend_less');
    const park = arcade.steps[0].choices.find(c => c.id === 'park');
    const home = arcade.steps[0].choices.find(c => c.id === 'home');
    strict_1.default.equal(goAllIn.energyCost, 8);
    strict_1.default.equal(spendLess.energyCost, 5);
    strict_1.default.equal(park.energyCost, 5);
    strict_1.default.ok(goAllIn.energyCost > spendLess.energyCost, 'full arcade session should cost more Energy than the lighter option');
    strict_1.default.equal(home.energyCost, undefined);
    const lunch = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'lunch_break');
    const skip = lunch.steps[0].choices.find(c => c.id === 'skip');
    const meal = lunch.steps[0].choices.find(c => c.id === 'meal');
    strict_1.default.equal(skip.energyCost, undefined, 'lunch_break/skip must NOT have an energyCost per the approved spec');
    strict_1.default.equal(meal.energyCost, undefined);
    const homework = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'homework');
    const study = homework.steps[0].choices.find(c => c.id === 'study');
    strict_1.default.equal(study.energyCost, undefined, 'homework/study is intentionally left at zero — deliberately ambiguous, not authored');
    const groceries = (0, missions_1.getDef)(missions_1.SCHOOL_MISSIONS, 'pickup_groceries');
    strict_1.default.equal(groceries.steps[1].awaitsPurchase, true, 'the real shopping step is not a MissionChoice and must stay untouched');
});
