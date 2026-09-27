"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceSystem = void 0;
const VALID_ACCOUNTS = ['cash', 'checking', 'savings', 'emergencyFund'];
let fallbackCounter = 0;
/** crypto.randomUUID is available in every environment this runs in (Node 19+, browsers, edge);
 *  the counter fallback exists only so this never throws in an unusual runtime. */
function generateTransactionId() {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    fallbackCounter += 1;
    return `tx_${Date.now()}_${fallbackCounter}`;
}
class FinanceSystem {
    constructor(finance) {
        this.finance = finance;
    }
    getFinancialState() {
        return this.finance;
    }
    getBalance(account) {
        this.assertValidAccount(account);
        return this.finance.accounts[account];
    }
    /** Would a withdrawal of `amount` from `account` succeed right now, without spending anything?
     *  `amount` should be given as a positive number (the amount you'd need available), not signed. */
    canAfford(account, amount) {
        this.assertValidAccount(account);
        if (!Number.isFinite(amount) || amount <= 0)
            return true; // nothing to afford
        return this.finance.accounts[account] >= amount;
    }
    /**
     * Records a transaction and applies its effect to the account in one step — this IS the only
     * way an account balance changes. Throws (does not silently fail, does not clamp, does not
     * create a transaction anyway) when:
     *  - the account id is invalid
     *  - amount is 0, NaN, or non-finite (a transaction that changes nothing isn't a real event)
     *  - the withdrawal would take the account negative
     */
    recordTransaction(input, now) {
        this.assertValidAccount(input.account);
        if (!Number.isFinite(input.amount) || input.amount === 0) {
            throw new Error(`FinanceSystem.recordTransaction: amount must be a non-zero finite number, got ${input.amount}`);
        }
        if (!Number.isFinite(now) || now < 0) {
            throw new Error(`FinanceSystem.recordTransaction: invalid timestamp ${now}`);
        }
        const projectedBalance = this.finance.accounts[input.account] + input.amount;
        if (projectedBalance < 0) {
            throw new Error(`FinanceSystem.recordTransaction: insufficient funds in ${input.account} ` +
                `(have ${this.finance.accounts[input.account]}, this would take it to ${projectedBalance})`);
        }
        const tx = {
            id: generateTransactionId(),
            timestamp: now,
            account: input.account,
            amount: input.amount,
            category: input.category,
            type: input.type,
            description: input.description,
            source: input.source,
            relatedEntity: input.relatedEntity,
            metadata: input.metadata,
        };
        this.finance.accounts[input.account] = projectedBalance;
        if (input.amount > 0)
            this.finance.totals.totalEarned += input.amount;
        else
            this.finance.totals.totalSpent += -input.amount;
        this.finance.transactions.recent.push(tx);
        if (this.finance.transactions.recent.length > this.finance.transactions.recentCap) {
            this.finance.transactions.recent.shift();
        }
        return tx;
    }
    /** Moves money between two of the player's own accounts as a pair of linked transactions
     *  (withdrawal + deposit), rather than a silent balance edit — so a transfer shows up in
     *  history exactly like any other financial event. Fails atomically: if the source account
     *  can't cover it, NEITHER transaction is created. */
    transfer(from, to, amount, now, description = 'Transfer') {
        this.assertValidAccount(from);
        this.assertValidAccount(to);
        if (from === to) {
            throw new Error('FinanceSystem.transfer: from and to accounts must be different');
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error(`FinanceSystem.transfer: amount must be a positive finite number, got ${amount}`);
        }
        if (!this.canAfford(from, amount)) {
            throw new Error(`FinanceSystem.transfer: insufficient funds in ${from} to transfer ${amount}`);
        }
        const out = this.recordTransaction({ account: from, amount: -amount, category: 'transfer', type: 'transfer', description }, now);
        const inTx = this.recordTransaction({
            account: to, amount, category: 'transfer', type: 'transfer', description,
            metadata: { kind: 'transfer_pair', counterpartTransactionId: out.id },
        }, now);
        return { out, in: inTx };
    }
    assertValidAccount(account) {
        if (!VALID_ACCOUNTS.includes(account)) {
            throw new Error(`FinanceSystem: invalid account id "${account}"`);
        }
    }
}
exports.FinanceSystem = FinanceSystem;
