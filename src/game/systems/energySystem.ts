/**
 * MoniMate 2.0 — EnergySystem (Step 3 implementation).
 * Owns EnergyState. `current` is kept clamped to [0, max] at all times — consume() rejects an
 * operation that would go negative instead of clamping it, because clamping would silently let an
 * activity "succeed" for less energy than it actually costs; restore() clamps to `max` because
 * overflowing past full energy is harmless and shouldn't require every caller to do its own
 * Math.min. Sleep/rest mechanics are NOT implemented here — restore() is the foundation for them.
 */
import type { EnergyState } from '../types/energy';

export class EnergySystem {
  constructor(private readonly energy: EnergyState) {}

  getState(): EnergyState {
    return this.energy;
  }

  /** Would `consume(amount)` succeed right now, without actually spending anything? */
  canConsume(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    return this.energy.current - amount >= 0;
  }

  consume(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`EnergySystem.consume: amount must be a non-negative finite number, got ${amount}`);
    }
    if (amount === 0) return;
    if (this.energy.current - amount < 0) {
      throw new Error(
        `EnergySystem.consume: insufficient energy (have ${this.energy.current}, need ${amount})`,
      );
    }
    this.energy.current -= amount;
  }

  restore(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`EnergySystem.restore: amount must be a non-negative finite number, got ${amount}`);
    }
    if (amount === 0) return;
    this.energy.current = Math.min(this.energy.max, this.energy.current + amount);
  }
}
