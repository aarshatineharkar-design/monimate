/**
 * MoniMate — Pack 1 "one engine": the live game runs on src/game's FinanceSystem, EnergySystem and
 * ActivitySystem directly. These tests pin the rules that come with that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, LIFE_PATHS, getLifePath } from '../../lib/gameData';
import { migrateSave } from '../../lib/saveMigration';
import { at } from '../../lib/clock';

const SCHOOL = getLifePath('school');
const newGame = () => new GameStore(createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL)));

test('One engine: money never goes negative — an unaffordable spend changes nothing', () => {
  const store = newGame(); // $0 before Mum's message
  assert.equal(store.spend(5, 'food', 'Chips'), false);
  assert.equal(store.cash, 0);
  assert.equal(store.state.finance.transactions.recent.length, 0);
});

test('One engine: every spend is a Transaction with category, reason, source and time', () => {
  const store = newGame();
  store.earn(20, 'income', 'Pocket money', 'mum');
  assert.equal(store.spend(3.5, 'food', 'Milk', 'supermarket'), true);
  const tx = store.state.finance.transactions.recent.at(-1)!;
  assert.deepEqual(
    { amount: tx.amount, category: tx.category, type: tx.type, description: tx.description, source: tx.source, account: tx.account, timestamp: tx.timestamp },
    { amount: -3.5, category: 'food', type: 'expense', description: 'Milk', source: 'supermarket', account: 'cash', timestamp: store.state.minutes },
  );
  assert.equal(store.state.today.spent, 3.5);
  assert.equal(store.state.today.earned, 20);
});

test('One engine: a mission choice files its money under the right category', () => {
  const store = newGame();
  const pm = store.actionableStep()!;
  store.applyChoice(pm.def.id, pm.step.choices![0]);
  const tx = store.state.finance.transactions.recent.at(-1)!;
  assert.equal(tx.category, 'income');
  assert.equal(tx.source, 'mum');
  assert.equal(tx.description, 'Thanks Mum!');
});

test('One engine: an unaffordable dialogue choice is refused, not applied', () => {
  const store = newGame(); // $0
  const rt = store.runtime('friend_birthday')!;
  rt.state = 'active';
  const full = store.def('friend_birthday')!.steps[0].choices!.find(c => c.id === 'full')!;
  assert.equal(store.applyChoice('friend_birthday', full), false);
  assert.equal(rt.state, 'active');
  assert.equal(store.state.world.relationships.Riley, 1);
});

test('Piggy bank: moving money to savings is a linked pair of transfers, not spending', () => {
  const store = newGame();
  store.earn(20, 'income', 'Pocket money');
  assert.equal(store.moveToSavings(8), true);
  assert.equal(store.cash, 12);
  assert.equal(store.state.finance.accounts.savings, 8);
  assert.equal(store.state.today.spent, 0, 'saving is not spending');
  const [out, inn] = store.state.finance.transactions.recent.slice(-2);
  assert.equal(out.type, 'transfer');
  assert.equal(inn.metadata?.kind === 'transfer_pair' && inn.metadata.counterpartTransactionId, out.id);
  assert.equal(store.moveToSavings(100), false, "can't save money you don't have");
  assert.equal(store.takeFromSavings(3), true);
  assert.equal(store.cash, 15);
});

test('Bills: rent is paid from cash when due; an unpaid bill becomes money owed, with a notice', () => {
  const working = getLifePath('working');
  const store = new GameStore(createInitialState('working', makeInitialFinance(working), makeInitialGoals(working)));
  // Working path: $2,500 cash, $350 rent due next Monday 9 AM.
  store.advance(at(7, 9, 1) - store.state.minutes);
  assert.ok(store.state.finance.transactions.recent.some(t => t.description === 'Rent' && t.amount === -350));
  // After Thursday's pay has landed, empty the account, then let the next rent fall due.
  store.advance(at(13, 12, 0) - store.state.minutes);
  assert.ok(store.state.finance.transactions.recent.some(t => t.description === 'Office Manager pay'));
  store.spend(store.cash, 'other', 'test drain');
  store.advance(at(14, 9, 1) - store.state.minutes);
  const arrears = store.state.finance.debt.loans.find(l => l.id === 'arrears');
  assert.ok(arrears && arrears.principal >= 350, 'unpaid rent should be owed, not ignored');
  assert.ok(store.takeNotices().some(n => n.includes("Couldn't pay Rent")));
});

test('Save upgrade: a version-2 save loads, keeping money, savings, history and progress', () => {
  const fresh = newGame();
  const v2 = {
    ...JSON.parse(fresh.serialize()),
    version: 2,
    finance: {
      balance: 23.5, savings: 4, emergencyFund: 0, debt: 0, weeklyIncome: 35,
      job: { id: 'allowance', name: 'Weekly Allowance', location: 'home', payPerHour: 0, hoursPerWeek: 0, daysAvailable: [4] },
      weeklyExpenses: [], monthlyExpenses: [], rentDueInDays: 999, rentAmount: 0,
      nextBillAmount: 40, nextBillName: 'Phone bill', nextBillDueInDays: 5,
      goals: [{ id: 'save500', name: 'Save $500', target: 500, saved: 0 }],
      totalEarned: 35, totalSpent: 11.5,
    },
    energy: { current: 70, max: 100 },
    ledger: [
      { minutes: 420, amount: 35, category: 'mission', label: 'Take the $35' },
      { minutes: 500, amount: -2, category: 'transport', label: 'Bus fare' },
      { minutes: 700, amount: -9.5, category: 'shop', label: 'Value Milk' },
    ],
    xp: 55,
  };
  delete v2.goals;
  const st = migrateSave(v2)!;
  assert.equal(st.version, 3);
  assert.equal(st.finance.accounts.cash, 23.5);
  assert.equal(st.finance.accounts.savings, 4);
  assert.equal(st.finance.income.job, null, 'the old allowance placeholder job is dropped');
  assert.equal(st.finance.expenses.recurring.length, 0, 'school path has no phone bill');
  assert.equal(st.finance.transactions.recent.length, 3);
  assert.equal(st.finance.transactions.recent[1].category, 'transport');
  assert.equal(st.finance.transactions.recent[2].category, 'shopping');
  assert.deepEqual(st.goals.active, [], 'the impossible Save $500 goal is not carried over');
  assert.equal(st.energy.current, 70);
  assert.equal(st.xp, 55);
  assert.equal('ledger' in st, false);
  const store = GameStore.hydrate(JSON.stringify(v2))!;
  assert.ok(store);
  assert.equal(store.cash, 23.5);
  assert.equal(migrateSave({ version: 1 }), null);
});

test('Life paths: only School is playable; the others are marked Coming soon', () => {
  assert.deepEqual(LIFE_PATHS.filter(p => p.available).map(p => p.id), ['school']);
});

test('Save upgrade: a mission saved on a step that no longer exists is clamped so it can still finish', () => {
  const store = newGame();
  const pm = store.actionableStep()!;
  store.applyChoice(pm.def.id, pm.step.choices![0]);
  const saved = JSON.parse(store.serialize());
  const rt = saved.missions.find((m: { id: string }) => m.id === 'get_to_school');
  rt.state = 'active'; rt.stepIndex = 1; // old saves: step 2 of the removed walk/bus menu
  const reloaded = GameStore.hydrate(JSON.stringify(saved))!;
  assert.equal(reloaded.runtime('get_to_school')!.stepIndex, 0);
  reloaded.advance(60);
  reloaded.exitPlace();
  assert.equal(reloaded.enterPlace('university').ok, true);
  assert.equal(reloaded.runtime('get_to_school')!.state, 'completed');
});
