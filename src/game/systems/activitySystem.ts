/**
 * MoniMate 2.0 — ActivitySystem (Step 3 implementation).
 *
 * Coordinates activity execution across ClockSystem/PlayerSystem/EnergySystem/FinanceSystem. It
 * never touches their owned state directly (no `.time.minutes =`, no `.energy.current -=`, no
 * `.finance.accounts[...] =` anywhere in this file) — every effect goes through their public
 * methods. This is the thing that keeps this from becoming another GameStore: state ownership
 * stays with the system whose domain it is, ActivitySystem only sequences calls.
 *
 * Atomicity (Step 3 requirement #20 — a failed activity must not partially update state): this is
 * achieved by validating everything in `canExecute()` BEFORE any mutating call is made, not by
 * catching errors mid-sequence and rolling back. If validation passes, every subsequent step in
 * `execute()` is expected to succeed (the checks it did are exactly what those calls need to not
 * throw) — but see the ADVANCE-TIME-BEFORE-FINANCE-CHECK note below for the one ordering subtlety
 * this leaves.
 */
import { ClockSystem } from './clockSystem';
import { PlayerSystem } from './playerSystem';
import { EnergySystem } from './energySystem';
import { FinanceSystem } from './financeSystem';
import type { ActivityDef, ActivityResult, ActivityFailureReason } from '../types/activity';
import type { ActivityTag } from '../types/player';

const CATEGORY_TO_ACTIVITY_TAG: Record<ActivityDef['category'], ActivityTag | null> = {
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

export class ActivitySystem {
  constructor(
    private readonly clock: ClockSystem,
    private readonly player: PlayerSystem,
    private readonly energy: EnergySystem,
    private readonly finance: FinanceSystem,
  ) {}

  /** Checks every requirement WITHOUT mutating anything. Exposed on its own so UI can grey out
   *  an unavailable activity before the player even chooses it, not just after. */
  canExecute(def: ActivityDef): { ok: true } | { ok: false; reason: ActivityFailureReason; message: string } {
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
  execute(def: ActivityDef): ActivityResult {
    const check = this.canExecute(def);
    if (!check.ok) {
      return { success: false, activityId: def.id, reason: check.reason, message: check.message };
    }

    if (def.timeCostMinutes > 0) this.clock.advance(def.timeCostMinutes);
    if (def.energyCost > 0) this.energy.consume(def.energyCost);

    let transaction = null;
    if (def.financialEffect) {
      const now = this.clock.getTime().minutes;
      transaction = this.finance.recordTransaction(
        {
          account: def.financialEffect.account,
          amount: def.financialEffect.amount,
          category: def.financialEffect.category,
          type: def.financialEffect.type,
          description: def.financialEffect.description,
          source: def.financialEffect.source,
        },
        now,
      );
    }

    if (def.movesPlayerTo) this.player.changeLocation(def.movesPlayerTo);
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
