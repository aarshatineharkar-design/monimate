import test from 'node:test';
import assert from 'node:assert/strict';
import { FinanceSystem } from '../systems/financeSystem';
import { createInitialGameState } from '../state/createInitialGameState';
import type { FinancialState } from '../types/finance';
import type { Transaction } from '../types/transaction';

function freshFinance(): FinancialState {
  return createInitialGameState().finance;
}

test('Finance 9: starting School money is $20 cash', () => {
  const finance = freshFinance();
  assert.equal(finance.accounts.cash, 20);
  const fs = new FinanceSystem(finance);
  assert.equal(fs.getBalance('cash'), 20);
});

test('Finance 10: recording income increases the account and totals', () => {
  const finance = freshFinance();
  const fs = new FinanceSystem(finance);
  const tx = fs.recordTransaction(
    { account: 'cash', amount: 5, category: 'income', type: 'income', description: 'Chore payment', source: 'parents' },
    420,
  );
  assert.equal(fs.getBalance('cash'), 25);
  assert.equal(finance.totals.totalEarned, 5);
  assert.equal(tx.amount, 5);
  assert.equal(tx.timestamp, 420);
});

test('Finance 11: recording an expense decreases the account and totals', () => {
  const finance = freshFinance();
  const fs = new FinanceSystem(finance);
  fs.recordTransaction(
    { account: 'cash', amount: -6, category: 'food', type: 'expense', description: 'Lunch', source: 'school food stall' },
    430,
  );
  assert.equal(fs.getBalance('cash'), 14);
  assert.equal(finance.totals.totalSpent, 6);
});

test('Finance 12: an expense larger than the balance is rejected, not clamped or faked', () => {
  const finance = freshFinance(); // $20 cash
  const fs = new FinanceSystem(finance);
  assert.equal(fs.canAfford('cash', 25), false);
  assert.throws(() => fs.recordTransaction(
    { account: 'cash', amount: -25, category: 'shopping', type: 'expense', description: 'Too expensive' },
    430,
  ));
  // balance and history are untouched by the rejected attempt
  assert.equal(fs.getBalance('cash'), 20);
  assert.equal(finance.transactions.recent.length, 0);
});

test('Finance 13: transaction history is preserved across multiple transactions', () => {
  const finance = freshFinance();
  const fs = new FinanceSystem(finance);
  fs.recordTransaction({ account: 'cash', amount: -2, category: 'transport', type: 'expense', description: 'Bus fare' }, 100);
  fs.recordTransaction({ account: 'cash', amount: -6, category: 'food', type: 'expense', description: 'Lunch' }, 110);
  fs.recordTransaction({ account: 'cash', amount: 5, category: 'income', type: 'income', description: 'Chore payment' }, 200);
  assert.equal(finance.transactions.recent.length, 3);
  assert.deepEqual(
    finance.transactions.recent.map((t: Transaction) => t.description),
    ['Bus fare', 'Lunch', 'Chore payment'],
  );
  assert.equal(fs.getBalance('cash'), 20 - 2 - 6 + 5);
});

test('Finance 14: transfer moves money between two accounts as a linked pair', () => {
  const finance = freshFinance();
  const fs = new FinanceSystem(finance);
  const { out, in: inTx } = fs.transfer('cash', 'savings', 10, 500, 'Move to savings');
  assert.equal(fs.getBalance('cash'), 10);
  assert.equal(fs.getBalance('savings'), 10);
  assert.equal(out.amount, -10);
  assert.equal(inTx.amount, 10);
  assert.equal(out.category, 'transfer');
  assert.equal(inTx.category, 'transfer');
  assert.equal(finance.transactions.recent.length, 2);
});

test('Finance: invalid account id is rejected', () => {
  const finance = freshFinance();
  const fs = new FinanceSystem(finance);
  assert.throws(() => fs.getBalance('bitcoin' as never));
  assert.throws(() => fs.recordTransaction(
    { account: 'bitcoin' as never, amount: 5, category: 'income', type: 'income', description: 'x' },
    100,
  ));
});

test('Finance: zero amount is rejected explicitly, not silently accepted', () => {
  const finance = freshFinance();
  const fs = new FinanceSystem(finance);
  assert.throws(() => fs.recordTransaction(
    { account: 'cash', amount: 0, category: 'other', type: 'expense', description: 'nothing' },
    100,
  ));
});
