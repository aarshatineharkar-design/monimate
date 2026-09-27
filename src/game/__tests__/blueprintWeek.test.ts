/**
 * MoniMate — Pack 2 blueprint-week mechanics: energy as a resource, food, the walker's surprise,
 * the fair-day reminder and the goal picker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath, WEEK_GOALS } from '../../lib/gameData';
import { at } from '../../lib/clock';

const SCHOOL = getLifePath('school');
const newGame = () => new GameStore(createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL)));
function startWeek(store: GameStore, goal: string) {
  for (const id of ['pocket_money', 'pick_goal']) {
    const a = store.actionableStep()!;
    assert.equal(a.def.id, id);
    store.applyChoice(id, a.step.choices!.find(c => c.id === (id === 'pick_goal' ? goal : 'take'))!);
  }
}

test('Goal picker: all four blueprint goals are offered, and picking one sets it', () => {
  const store = newGame();
  const pm = store.actionableStep()!;
  store.applyChoice('pocket_money', pm.step.choices![0]);
  const picker = store.actionableStep()!;
  assert.equal(picker.def.id, 'pick_goal');
  assert.deepEqual(picker.step.choices!.map(c => c.setsGoal), WEEK_GOALS.map(g => g.id));
  store.applyChoice('pick_goal', picker.step.choices![2]);
  assert.equal(store.goalStatus()!.def.id, 'buy_headphones');
  assert.equal(store.state.goals.active[0].id, 'buy_headphones');
});

test('Headphones goal: buying them at the Mall completes it', () => {
  const store = newGame();
  startWeek(store, 'buy_headphones');
  store.advance(at(0, 10, 0) - store.state.minutes);
  store.exitPlace();
  assert.equal(store.enterPlace('mall').ok, true);
  store.state.player.x = 7 * 48; store.state.player.y = 2.6 * 48;
  assert.equal(store.nearbyShopItem()?.id, 'headphones');
  assert.equal(store.buyNearbyShopItem().ok, true);
  assert.equal(store.goalStatus()!.achieved, true);
  assert.equal(store.cash, 5);
});

test('Energy: free play slowly tires you, a bus ride does not, and you get a warning when exhausted', () => {
  const store = newGame();
  const e0 = store.getEnergy().current;
  for (let i = 0; i < 60; i++) store.tick(1, 0); // one game hour standing around
  assert.ok(Math.abs(store.getEnergy().current - (e0 - 3)) < 0.01, 'about 3 energy per hour of play');
  store.consumeEnergy(store.getEnergy().current - 15.02);
  store.takeNotices();
  store.tick(1, 0);
  assert.equal(store.exhausted, true);
  assert.ok(store.takeNotices().some(n => n.includes('exhausted')));
});

test('Food: lunch gives energy back; skipping it costs energy', () => {
  const store = newGame();
  const lunch = store.def('lunch_break')!.steps[0].choices!;
  const rt = store.runtime('lunch_break')!;
  store.earn(10, 'other', 'test');
  store.consumeEnergy(50);
  rt.state = 'active';
  store.applyChoice('lunch_break', lunch.find(c => c.id === 'meal')!);
  assert.equal(store.getEnergy().current, 65);
  rt.state = 'active';
  store.applyChoice('lunch_break', lunch.find(c => c.id === 'skip')!);
  assert.equal(store.getEnergy().current, 55);
});

test("Walker's surprise: a player who walked to school all week gets the split shoe on Thursday", () => {
  const store = newGame();
  startWeek(store, 'friends');
  store.state.today.schoolAttended = true; // walked to school and attended
  store.runtime('friend_birthday')!.state = 'completed';
  store.advance(at(3, 16, 5) - store.state.minutes);
  assert.equal(store.runtime('unexpected_shoe')!.state, 'available');
  assert.equal(store.runtime('unexpected_event')!.state, 'locked', 'the bus-card version is only for bus riders');
});

test('Fair day: a saver with cash short of $10 is reminded to empty the piggy bank', () => {
  const store = newGame();
  startWeek(store, 'save_event');
  store.moveToSavings(20);
  store.takeNotices();
  store.advance(at(5, 9, 1) - store.state.minutes);
  assert.ok(store.takeNotices().some(n => n.includes('piggy bank')));
});
