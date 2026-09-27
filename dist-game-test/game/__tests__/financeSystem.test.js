"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const financeSystem_1 = require("../systems/financeSystem");
const createInitialGameState_1 = require("../state/createInitialGameState");
function freshFinance() {
    return (0, createInitialGameState_1.createInitialGameState)().finance;
}
(0, node_test_1.default)('Finance 9: starting School money is $20 cash', () => {
    const finance = freshFinance();
    strict_1.default.equal(finance.accounts.cash, 20);
    const fs = new financeSystem_1.FinanceSystem(finance);
    strict_1.default.equal(fs.getBalance('cash'), 20);
});
(0, node_test_1.default)('Finance 10: recording income increases the account and totals', () => {
    const finance = freshFinance();
    const fs = new financeSystem_1.FinanceSystem(finance);
    const tx = fs.recordTransaction({ account: 'cash', amount: 5, category: 'income', type: 'income', description: 'Chore payment', source: 'parents' }, 420);
    strict_1.default.equal(fs.getBalance('cash'), 25);
    strict_1.default.equal(finance.totals.totalEarned, 5);
    strict_1.default.equal(tx.amount, 5);
    strict_1.default.equal(tx.timestamp, 420);
});
(0, node_test_1.default)('Finance 11: recording an expense decreases the account and totals', () => {
    const finance = freshFinance();
    const fs = new financeSystem_1.FinanceSystem(finance);
    fs.recordTransaction({ account: 'cash', amount: -6, category: 'food', type: 'expense', description: 'Lunch', source: 'school food stall' }, 430);
    strict_1.default.equal(fs.getBalance('cash'), 14);
    strict_1.default.equal(finance.totals.totalSpent, 6);
});
(0, node_test_1.default)('Finance 12: an expense larger than the balance is rejected, not clamped or faked', () => {
    const finance = freshFinance(); // $20 cash
    const fs = new financeSystem_1.FinanceSystem(finance);
    strict_1.default.equal(fs.canAfford('cash', 25), false);
    strict_1.default.throws(() => fs.recordTransaction({ account: 'cash', amount: -25, category: 'shopping', type: 'expense', description: 'Too expensive' }, 430));
    // balance and history are untouched by the rejected attempt
    strict_1.default.equal(fs.getBalance('cash'), 20);
    strict_1.default.equal(finance.transactions.recent.length, 0);
});
(0, node_test_1.default)('Finance 13: transaction history is preserved across multiple transactions', () => {
    const finance = freshFinance();
    const fs = new financeSystem_1.FinanceSystem(finance);
    fs.recordTransaction({ account: 'cash', amount: -2, category: 'transport', type: 'expense', description: 'Bus fare' }, 100);
    fs.recordTransaction({ account: 'cash', amount: -6, category: 'food', type: 'expense', description: 'Lunch' }, 110);
    fs.recordTransaction({ account: 'cash', amount: 5, category: 'income', type: 'income', description: 'Chore payment' }, 200);
    strict_1.default.equal(finance.transactions.recent.length, 3);
    strict_1.default.deepEqual(finance.transactions.recent.map((t) => t.description), ['Bus fare', 'Lunch', 'Chore payment']);
    strict_1.default.equal(fs.getBalance('cash'), 20 - 2 - 6 + 5);
});
(0, node_test_1.default)('Finance 14: transfer moves money between two accounts as a linked pair', () => {
    const finance = freshFinance();
    const fs = new financeSystem_1.FinanceSystem(finance);
    const { out, in: inTx } = fs.transfer('cash', 'savings', 10, 500, 'Move to savings');
    strict_1.default.equal(fs.getBalance('cash'), 10);
    strict_1.default.equal(fs.getBalance('savings'), 10);
    strict_1.default.equal(out.amount, -10);
    strict_1.default.equal(inTx.amount, 10);
    strict_1.default.equal(out.category, 'transfer');
    strict_1.default.equal(inTx.category, 'transfer');
    strict_1.default.equal(finance.transactions.recent.length, 2);
});
(0, node_test_1.default)('Finance: invalid account id is rejected', () => {
    const finance = freshFinance();
    const fs = new financeSystem_1.FinanceSystem(finance);
    strict_1.default.throws(() => fs.getBalance('bitcoin'));
    strict_1.default.throws(() => fs.recordTransaction({ account: 'bitcoin', amount: 5, category: 'income', type: 'income', description: 'x' }, 100));
});
(0, node_test_1.default)('Finance: zero amount is rejected explicitly, not silently accepted', () => {
    const finance = freshFinance();
    const fs = new financeSystem_1.FinanceSystem(finance);
    strict_1.default.throws(() => fs.recordTransaction({ account: 'cash', amount: 0, category: 'other', type: 'expense', description: 'nothing' }, 100));
});
