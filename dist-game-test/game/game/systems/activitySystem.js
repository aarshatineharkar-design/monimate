"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivitySystem = void 0;
const CATEGORY_TO_ACTIVITY_TAG = {
    travel: 'walking',
    food: 'shopping',
    study: 'studying',
    work: 'working',
    chore: 'chore',
    social: 'socializing',
    rest: 'resting',
    exercise: 'exercising',
    exploration: 'exploring',
    other: null,
};
class ActivitySystem {
    constructor(clock, player, energy, finance) {
        this.clock = clock;
        this.player = player;
        this.energy = energy;
        this.finance = finance;
    }
    /** Checks every requirement WITHOUT mutating anything. Exposed on its own so UI can grey out
     *  an unavailable activity before the player even chooses it, not just after. */
    canExecute(def) {
        if (def.requirement?.place && this.player.getLocation() !== def.requirement.place) {
            return {
                ok: false, reason: 'requirement_not_met',
                message: `${def.name} requires being at "${def.requirement.place}".`,
            };
        }
        const energyNeeded = Math.max(def.energyCost, def.requirement?.minEnergy ?? 0);
        if (energyNeeded > 0 && !this.energy.canConsume(energyNeeded)) {
            return {
                ok: false, reason: 'insufficient_energy',
                message: `Not enough energy for ${def.name} (needs ${energyNeeded}, have ${this.energy.getState().current}).`,
            };
        }
        if (def.financialEffect && def.financialEffect.amount < 0) {
            const cost = -def.financialEffect.amount;
            if (!this.finance.canAfford(def.financialEffect.account, cost)) {
                return {
                    ok: false, reason: 'insufficient_funds',
                    message: `Not enough money for ${def.name} (needs ${cost}, have ${this.finance.getBalance(def.financialEffect.account)}).`,
                };
            }
        }
        return { ok: true };
    }
    /**
     * PLAYER CHOOSES ACTIVITY → VALIDATE REQUIREMENTS → CHECK ENERGY → CHECK FINANCIAL REQUIREMENTS
     * → ADVANCE TIME → CONSUME ENERGY → APPLY FINANCIAL CONSEQUENCES → CREATE TRANSACTION IF MONEY
     * CHANGED → UPDATE PLAYER ACTIVITY STATE → RETURN RESULT — exactly the Step 3 pipeline.
     *
     * All four validation checks happen in canExecute() before this proceeds to a single mutating
     * call, so a failure here always means ZERO mutation happened this call.
     */
    execute(def) {
        const check = this.canExecute(def);
        if (!check.ok) {
            return { success: false, activityId: def.id, reason: check.reason, message: check.message };
        }
        if (def.timeCostMinutes > 0)
            this.clock.advance(def.timeCostMinutes);
        if (def.energyCost > 0)
            this.energy.consume(def.energyCost);
        let transaction = null;
        if (def.financialEffect) {
            const now = this.clock.getTime().minutes;
            transaction = this.finance.recordTransaction({
                account: def.financialEffect.account,
                amount: def.financialEffect.amount,
                category: def.financialEffect.category,
                type: def.financialEffect.type,
                description: def.financialEffect.description,
                source: def.financialEffect.source,
            }, now);
        }
        if (def.movesPlayerTo)
            this.player.changeLocation(def.movesPlayerTo);
        this.player.setCurrentActivity(CATEGORY_TO_ACTIVITY_TAG[def.category]);
        return {
            success: true,
            activityId: def.id,
            timeAdvancedMinutes: def.timeCostMinutes,
            energyConsumed: def.energyCost,
            transaction,
        };
    }
}
exports.ActivitySystem = ActivitySystem;
