"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnergySystem = void 0;
class EnergySystem {
    constructor(energy) {
        this.energy = energy;
    }
    getState() {
        return this.energy;
    }
    /** Would `consume(amount)` succeed right now, without actually spending anything? */
    canConsume(amount) {
        if (!Number.isFinite(amount) || amount < 0)
            return false;
        return this.energy.current - amount >= 0;
    }
    consume(amount) {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`EnergySystem.consume: amount must be a non-negative finite number, got ${amount}`);
        }
        if (amount === 0)
            return;
        if (this.energy.current - amount < 0) {
            throw new Error(`EnergySystem.consume: insufficient energy (have ${this.energy.current}, need ${amount})`);
        }
        this.energy.current -= amount;
    }
    restore(amount) {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`EnergySystem.restore: amount must be a non-negative finite number, got ${amount}`);
        }
        if (amount === 0)
            return;
        this.energy.current = Math.min(this.energy.max, this.energy.current + amount);
    }
}
exports.EnergySystem = EnergySystem;
