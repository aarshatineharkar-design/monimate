/**
 * MoniMate — Pack 3: phone messages live on the phone (not as pop-ups), with a reply history,
 * and subscriptions can be cancelled from the Bank app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';

const SCHOOL = getLifePath('school');
const newGame = () => new GameStore(createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL)));

test("Phone: Mum's pocket-money text is in the inbox, not an in-person dialogue", () => {
  const store = newGame();
  const inbox = store.phoneInbox();
  assert.equal(inbox[0].def.id, 'pocket_money', 'highest-priority message first');
  assert.notEqual(store.actionableStep('inPerson')?.def.id, 'pocket_money');
  assert.equal(store.actionableStep()?.def.id, 'pocket_money', "the default still covers everything (used by tests and scripts)");
});

test('Phone: replying moves the message into today\'s history with your reply and what happened', () => {
  const store = newGame();
  const pm = store.phoneInbox()[0];
  store.applyChoice(pm.def.id, pm.step.choices![0]);
  const h = store.messageHistory();
  assert.equal(h[0].id, 'pocket_money');
  assert.equal(h[0].from, 'Mum');
  assert.match(h[0].reply, /Thanks Mum/);
  assert.match(h[0].result, /\$20/);
  assert.equal(store.phoneInbox()[0].def.id, 'pick_goal', 'the next message is waiting');
});

test('Phone: in-person dialogue (lunch with a friend) is not in the inbox', () => {
  const store = newGame();
  for (const m of store.phoneInbox().filter(m => m.def.id === 'pocket_money' || m.def.id === 'pick_goal')) {
    store.applyChoice(m.def.id, m.step.choices![0]);
  }
  store.advance(60);
  store.exitPlace();
  assert.equal(store.enterPlace('university').ok, true);
  store.goToInteriorScene('interior_school_classroom');
  assert.equal(store.attendClass().ok, true);
  const inPerson = store.actionableStep('inPerson');
  assert.ok(inPerson && !inPerson.step.remote);
  assert.equal(store.phoneInbox().some(m => m.def.id === 'lunch_break'), false);
});

test('Bank app: cancelling a subscription removes the monthly charge', () => {
  const store = newGame();
  store.state.finance.expenses.recurring.push({ id: 'streambox', category: 'subscription', name: 'StreamBox', amount: 5, periodDays: 30, nextDueAt: at(30, 9, 0) });
  assert.equal(store.cancelSubscription('streambox'), true);
  assert.equal(store.state.finance.expenses.recurring.length, 0);
  assert.ok(store.state.world.flags.includes('cancelled_streambox'));
  assert.equal(store.cancelSubscription('streambox'), false);
});
