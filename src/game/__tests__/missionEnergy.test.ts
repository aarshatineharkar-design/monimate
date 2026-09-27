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
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';
import { SCHOOL_MISSIONS, getDef } from '../../lib/missions';
import type { MissionChoice } from '../../lib/missions';

const SCHOOL_CONFIG = LIFE_PATHS.find((p) => p.id === 'school')!;

function freshDefaultStore(): GameStore {
  const finance = makeInitialFinance(SCHOOL_CONFIG);
  const state = createInitialState('school', finance);
  return new GameStore(state);
}

/** Drives pocket_money to completion (its 'interaction' trigger with Mum fires as soon as its
 *  window is open, since missionsOnMinute() falls through to `rt.triggered` once a time-triggered
 *  mission's window has opened — see get_to_school below for the plain 'time'-triggered case), then
 *  starts and returns get_to_school's real, active, actionable step. Mirrors the accept-then-act
 *  pattern missionScheduling.test.ts uses for pickup_groceries. Used both for the one real
 *  end-to-end School-mission-choice test (Test 6) and, via applyChoice() with a synthetic choice, to
 *  isolate the Energy mechanic itself (Tests 1-5, 7) against a real actionable step. */
function storeWithGetToSchoolActionable(): GameStore {
  const store = freshDefaultStore();
  store.advance(5); // 7:00 -> 7:05 AM, inside pocket_money's window
  store.talkTo('mum'); // pocket_money's trigger is `{ type: 'interaction', npcId: 'mum' }`
  store.advance(1); // let missionsOnMinute() notice `rt.triggered` and make it available
  store.startMission('pocket_money');
  const pocketMoney = store.actionableStep();
  assert.ok(pocketMoney, 'expected pocket_money to be actionable at 7:05 AM Monday');
  assert.equal(pocketMoney!.def.id, 'pocket_money');
  store.applyChoice('pocket_money', pocketMoney!.step.choices![0]); // 'take' — finishes the mission
  store.advance(1); // let missionsOnMinute() notice pocket_money is done and open get_to_school
  store.startMission('get_to_school');
  const getToSchool = store.actionableStep();
  assert.ok(getToSchool, 'expected get_to_school to be actionable right after pocket_money');
  assert.equal(getToSchool!.def.id, 'get_to_school');
  return store;
}

/** A synthetic MissionChoice, applied against a real mission's real actionable step, used only to
 *  isolate the Energy mechanic itself from any one authored choice's specific other effects. */
function syntheticChoice(overrides: Partial<MissionChoice>): MissionChoice {
  return {
    id: 'synthetic', label: 'Synthetic choice', sublabel: '', cost: 0, minutes: 0,
    consequence: 'test-only synthetic choice',
    ...overrides,
  };
}

test('MissionEnergy 1: a choice with energyCost 5 reduces Energy by exactly 5', () => {
  const store = storeWithGetToSchoolActionable();
  const actionable = store.actionableStep()!;
  const before = store.getEnergy().current;
  store.applyChoice(actionable.def.id, syntheticChoice({ energyCost: 5 }));
  assert.equal(store.getEnergy().current, before - 5);
});

test('MissionEnergy 2: a choice with no energyCost does not change Energy', () => {
  const store = storeWithGetToSchoolActionable();
  const actionable = store.actionableStep()!;
  const before = store.getEnergy().current;
  store.applyChoice(actionable.def.id, syntheticChoice({}));
  assert.equal(store.getEnergy().current, before);
});

test('MissionEnergy 3: a choice with energyCost 0 does not change Energy', () => {
  const store = storeWithGetToSchoolActionable();
  const actionable = store.actionableStep()!;
  const before = store.getEnergy().current;
  store.applyChoice(actionable.def.id, syntheticChoice({ energyCost: 0 }));
  assert.equal(store.getEnergy().current, before);
});

test('MissionEnergy 4: insufficient Energy does not reject the choice — it still applies fully', () => {
  const store = storeWithGetToSchoolActionable();
  // Drain Energy down to 2, less than the energyCost of 5 we're about to apply.
  store.consumeEnergy(store.getEnergy().current - 2);
  assert.equal(store.getEnergy().current, 2);

  const actionable = store.actionableStep()!;
  const balanceBefore = store.state.finance.balance;
  const minutesBefore = store.state.minutes;
  const relBefore = store.state.world.relationships['Mum'] ?? 0;

  const choice = syntheticChoice({
    energyCost: 5, cost: -3, minutes: 10, relationship: 1, flags: ['synthetic_flag'],
  });
  store.applyChoice(actionable.def.id, choice);

  // Energy clamps at 0 (existing consumeEnergy() semantics) rather than blocking anything.
  assert.equal(store.getEnergy().current, 0);
  // Every other normal effect of the choice still applied.
  assert.equal(store.state.finance.balance, balanceBefore - 3);
  assert.equal(store.state.minutes, minutesBefore + 10);
  if (actionable.step.speaker === 'Mum') {
    assert.equal(store.state.world.relationships['Mum'], relBefore + 1);
  }
  assert.equal(store.state.world.flags.includes('synthetic_flag'), true);
});

test('MissionEnergy 5: an Energy cost does not alter income, expenses, balance or transaction history', () => {
  const withEnergy = storeWithGetToSchoolActionable();
  const withoutEnergy = storeWithGetToSchoolActionable();

  const actionableA = withEnergy.actionableStep()!;
  const actionableB = withoutEnergy.actionableStep()!;
  assert.equal(actionableA.def.id, actionableB.def.id);

  const shared = { cost: -4, minutes: 10, consequence: 'x' };
  withEnergy.applyChoice(actionableA.def.id, syntheticChoice({ ...shared, energyCost: 8 }));
  withoutEnergy.applyChoice(actionableB.def.id, syntheticChoice({ ...shared }));

  assert.equal(withEnergy.state.finance.balance, withoutEnergy.state.finance.balance);
  assert.equal(withEnergy.state.finance.totalSpent, withoutEnergy.state.finance.totalSpent);
  assert.equal(withEnergy.state.finance.totalEarned, withoutEnergy.state.finance.totalEarned);
  assert.deepEqual(withEnergy.state.ledger, withoutEnergy.state.ledger);
});

test('MissionEnergy 6: a real School mission choice (get_to_school / walk) applies Energy end-to-end', () => {
  const store = storeWithGetToSchoolActionable();
  const def = getDef(SCHOOL_MISSIONS, 'get_to_school')!;
  const walkChoice = def.steps[0].choices!.find(c => c.id === 'walk')!;
  assert.equal(walkChoice.energyCost, 5);

  const energyBefore = store.getEnergy().current;
  const minutesBefore = store.state.minutes;
  store.applyChoice('get_to_school', walkChoice);

  assert.equal(store.getEnergy().current, energyBefore - 5);
  assert.equal(store.state.minutes, minutesBefore + 20); // walk's own `minutes: 20` is unaffected
  assert.equal(store.state.world.flags.includes('walked_to_school'), true);
});

test('MissionEnergy 7: an ordinary conversational/passive choice remains free of Energy cost', () => {
  const def = getDef(SCHOOL_MISSIONS, 'pocket_money')!;
  const takeChoice = def.steps[0].choices!.find(c => c.id === 'take')!;
  assert.equal(takeChoice.energyCost, undefined);

  const store = freshDefaultStore();
  store.advance(5);
  const before = store.getEnergy().current;
  store.applyChoice('pocket_money', takeChoice);
  assert.equal(store.getEnergy().current, before);
});

test('MissionEnergy 8: selected physical choices carry their intended authored values', () => {
  const getToSchool = getDef(SCHOOL_MISSIONS, 'get_to_school')!;
  const walk = getToSchool.steps[0].choices!.find(c => c.id === 'walk')!;
  const bus = getToSchool.steps[0].choices!.find(c => c.id === 'bus')!;
  assert.equal(walk.energyCost, 5);
  assert.equal(bus.energyCost, undefined);

  const unexpected = getDef(SCHOOL_MISSIONS, 'unexpected_event')!;
  const uWalk = unexpected.steps[0].choices!.find(c => c.id === 'walk')!;
  const uPay = unexpected.steps[0].choices!.find(c => c.id === 'pay')!;
  assert.equal(uWalk.energyCost, 5);
  assert.equal(uPay.energyCost, undefined);

  const arcade = getDef(SCHOOL_MISSIONS, 'arcade_invite')!;
  const goAllIn = arcade.steps[0].choices!.find(c => c.id === 'arcade')!;
  const spendLess = arcade.steps[0].choices!.find(c => c.id === 'spend_less')!;
  const park = arcade.steps[0].choices!.find(c => c.id === 'park')!;
  const home = arcade.steps[0].choices!.find(c => c.id === 'home')!;
  assert.equal(goAllIn.energyCost, 8);
  assert.equal(spendLess.energyCost, 5);
  assert.equal(park.energyCost, 5);
  assert.ok(goAllIn.energyCost! > spendLess.energyCost!, 'full arcade session should cost more Energy than the lighter option');
  assert.equal(home.energyCost, undefined);

  const lunch = getDef(SCHOOL_MISSIONS, 'lunch_break')!;
  const skip = lunch.steps[0].choices!.find(c => c.id === 'skip')!;
  const meal = lunch.steps[0].choices!.find(c => c.id === 'meal')!;
  assert.equal(skip.energyCost, undefined, 'lunch_break/skip must NOT have an energyCost per the approved spec');
  assert.equal(meal.energyCost, undefined);

  const homework = getDef(SCHOOL_MISSIONS, 'homework')!;
  const study = homework.steps[0].choices!.find(c => c.id === 'study')!;
  assert.equal(study.energyCost, undefined, 'homework/study is intentionally left at zero — deliberately ambiguous, not authored');

  const groceries = getDef(SCHOOL_MISSIONS, 'pickup_groceries')!;
  assert.equal(groceries.steps[1].awaitsPurchase, true, 'the real shopping step is not a MissionChoice and must stay untouched');
});
