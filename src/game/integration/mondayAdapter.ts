/**
 * MoniMate 2.0 — the live GameStore <-> Core Simulation adapter.
 *
 * This is the ONLY file that is allowed to know about both the live GameStore (src/lib/store.ts)
 * and the Core Simulation systems (src/game/systems). Nothing else in src/game/ imports from
 * src/lib/, and nothing in src/lib/ imports from src/game/ — this module is the one deliberate
 * seam between them, exactly as the Step 4B audit recommended (an adapter, not a merge).
 *
 * STEP 10 UPDATE: the original Step 5 `executeMorningTransport()`/`MondayTransportOutcome` (walk
 * vs bus) has been REMOVED. The Step 9 audit found it duplicated the live game's own pre-existing
 * `get_to_school` mission (src/lib/missions.ts) — a stronger, already-integrated implementation
 * with its own lateness tracking — and the two could independently move the player/spend
 * money/advance time with no shared "already done" state between them. Per the decision to prefer
 * a clean migration over two competing versions of the same concept, `get_to_school` is now the
 * sole owner of Monday transport and the adapter duplicate is deleted, not left dormant. Only
 * `executeAttendClass()` (Step 8 — genuinely new content with no live-mission equivalent) remains.
 *
 * SCOPE: exactly one activity — Attend Class. It does not construct a MondayFlow (that would pull
 * in the school/lunch/after-school/errand phase lock this step deliberately does not wire up yet);
 * it talks to the five Step 3 systems directly, for exactly one execute() call, then discards them.
 *
 * WHY NO SECOND CLOCK OR LEDGER EVER EXISTS AFTER THIS RUNS:
 *   - `TimeState.minutes` (Core Simulation) and `GameState.minutes` (live game) are independently
 *     documented as "minutes since Monday 00:00 of week 1" — the SAME epoch, not merely similar
 *     ones. So `buildEphemeralState()` below is a straight passthrough (`s.minutes` in, `s.minutes`
 *     back out via `store.advance()`), never a unit conversion. There's no drift risk from the
 *     translation itself.
 *   - The ephemeral TimeState/PlayerState/EnergyState/FinancialState objects built here exist for
 *     the lifetime of a single adapter call and are never stored anywhere. Once the result is
 *     applied back to `store` via its own public methods, the ephemeral copies are garbage — there
 *     is exactly one durable clock (`store.state.minutes`) and exactly one durable ledger
 *     (`store.state.finance`/`store.state.ledger`) after this function returns.
 *
 * STEP 6 — ENERGY SYNCHRONIZATION: `GameState.energy` (src/lib/types.ts) is now the one
 * authoritative live energy value — added in Step 6, mirroring the Core Simulation's own
 * EnergyState shape ({current, max}) so the two stay conceptually interchangeable without being
 * the same object. `buildEphemeralState()` below seeds the ephemeral EnergyState from
 * `store.getEnergy()` (never a direct field read of `store.state.energy` — the public getter is
 * used like every other read here), and a successful activity's `energyConsumed` is applied back
 * via `store.consumeEnergy()` — the same "public methods only" rule that already governs time and
 * money in this adapter. There is exactly one durable energy value after this function returns,
 * same as there is exactly one durable clock and one durable ledger.
 */
import { ClockSystem } from '../systems/clockSystem';
import { PlayerSystem } from '../systems/playerSystem';
import { EnergySystem } from '../systems/energySystem';
import { FinanceSystem } from '../systems/financeSystem';
import { ActivitySystem } from '../systems/activitySystem';
import { ATTEND_CLASS } from '../content/school/mondayActivities';
import { HELP_PARENTS } from '../content/schoolActivities';
import type { TimeState } from '../types/time';
import type { PlayerState } from '../types/player';
import type { EnergyState } from '../types/energy';
import type { FinancialState } from '../types/finance';
import type { ActivityResult } from '../types/activity';
import type { GameStore } from '../../lib/store';

/** Builds the minimal, throwaway Core Simulation sub-state this one activity needs, seeded from
 *  the live GameStore's current values. See the module-level comment for why this is safe to
 *  discard immediately after use. */
function buildEphemeralState(store: GameStore): {
  time: TimeState;
  player: PlayerState;
  energy: EnergyState;
  finance: FinancialState;
} {
  const s = store.state;

  const time: TimeState = {
    minutes: s.minutes, // same epoch as the live clock — see module comment
    paused: false,
    timeMultiplier: 1,
  };

  const player: PlayerState = {
    identity: { id: 'player', lifePath: 'school' },
    attributes: {
      level: 1,
      xp: 0,
      currentActivity: null,
      transportation: { hasBike: false, hasBusPass: false },
    },
    world: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 0,
      scene: 'outdoor',
      place: s.player.place ?? 'home',
      movementStatus: 'idle',
    },
  };

  // Step 6: seeded from the live energy value via the store's own public getter — see the
  // module-level "STEP 6 — ENERGY SYNCHRONIZATION" comment.
  const liveEnergy = store.getEnergy();
  const energy: EnergyState = { current: liveEnergy.current, max: liveEnergy.max, recoveryPerHourAsleep: 12.5 };

  const finance: FinancialState = {
    accounts: { cash: s.finance.balance, checking: 0, savings: s.finance.savings, emergencyFund: s.finance.emergencyFund },
    income: { weeklyIncome: s.finance.weeklyIncome, job: null, sideIncome: 0, businessIncome: 0, investmentIncome: 0 },
    expenses: { recurring: [] },
    credit: { score: null, cards: [] },
    debt: { loans: [] },
    assets: { vehicles: [], property: [], investments: [], businesses: [] },
    liabilities: { items: [] },
    // recentCap doesn't matter here — this ledger is discarded after one call, never read back.
    transactions: { recent: [], recentCap: 10 },
    totals: { totalEarned: 0, totalSpent: 0 },
  };

  return { time, player, energy, finance };
}

/**
 * Step 8 — the Attend Class adapter. Build a throwaway Core Simulation state from the live store,
 * run exactly one ActivitySystem.execute()
 * call against the existing ATTEND_CLASS content (src/game/content/school/mondayActivities.ts —
 * not redefined or duplicated here), then apply a successful result back to `store` via its own
 * public methods only.
 *
 * ATTEND_CLASS has no financialEffect and no movesPlayerTo, so on success only `store.advance()`
 * and `store.consumeEnergy()` are called — there is nothing to spend/earn and the player's place
 * does not change (they were already at 'university' — enforced by ActivitySystem.canExecute()'s
 * own requirement.place check, not re-checked here, per the "Core Simulation remains authoritative
 * for the location requirement" instruction).
 *
 * SCHOOL HOURS: this function does NOT check `store.isOpenNow('university')` or any clock window
 * itself — that would duplicate a rule the live game already enforces elsewhere (world.ts's HOURS
 * table gates enterPlace(), which is what puts the player at 'university' in the first place; once
 * there, ATTEND_CLASS's only location requirement is "at university", not "before the bell"). If a
 * future step wants "no class after 3:30pm" enforced even while still standing on the school
 * grounds, that is a new requirement to add to ATTEND_CLASS's content (or a live-side check before
 * calling this), not something invented inside this adapter — flagged, not silently added here.
 */
export interface MondayClassOutcome {
  ok: boolean;
  reason?: string;
  message?: string;
  minutesAdvanced: number;
  energyConsumed: number;
}

export function executeAttendClass(store: GameStore): MondayClassOutcome {
  const { time, player, energy, finance } = buildEphemeralState(store);

  const clock = new ClockSystem(time);
  const playerSystem = new PlayerSystem(player);
  const energySystem = new EnergySystem(energy);
  const financeSystem = new FinanceSystem(finance);
  const activitySystem = new ActivitySystem(clock, playerSystem, energySystem, financeSystem);

  const result: ActivityResult = activitySystem.execute(ATTEND_CLASS);

  if (!result.success) {
    // Nothing executed — store is untouched. ATTEND_CLASS has no financialEffect, so the only
    // ways this can fail are "not at university" or "insufficient energy" (canExecute() checks
    // requirement.place and energy before any mutating call is made).
    return {
      ok: false,
      reason: result.reason,
      message: result.message,
      minutesAdvanced: 0,
      energyConsumed: 0,
    };
  }

  // Apply time, then energy — same order ActivitySystem itself used internally. No transaction
  // and no movesPlayerTo on ATTEND_CLASS, so there is nothing else to apply back to the store.
  if (result.timeAdvancedMinutes > 0) {
    store.advance(result.timeAdvancedMinutes);
  }
  if (result.energyConsumed > 0) {
    store.consumeEnergy(result.energyConsumed);
  }

  // Step 12: ONLY on a genuinely successful class does school attendance get recorded — this is
  // the sole write path for attendance (see GameStore.markSchoolAttended()'s own comment). A
  // rejected activity returns before this line is ever reached (canExecute() validates everything
  // before any mutating call), so attendance can never be marked on a failed attempt.
  store.markSchoolAttended();

  // Step 18: ActivitySystem.execute() already computed the activity tag for ATTEND_CLASS on the
  // ephemeral player state (playerSystem.setCurrentActivity(...), inside execute() above) — this
  // reads that existing result and synchronizes it into the live store via its own public setter,
  // rather than hardcoding a duplicate 'studying' value here. Core Simulation remains the one
  // source of truth for what the tag actually is.
  store.setCurrentActivity(player.attributes.currentActivity);

  return {
    ok: true,
    minutesAdvanced: result.timeAdvancedMinutes,
    energyConsumed: result.energyConsumed,
  };
}

/**
 * Step 15 — the Help Parents adapter. Same shape as executeAttendClass(): build a throwaway Core
 * Simulation state from the live store, run exactly one ActivitySystem.execute() call against the
 * existing HELP_PARENTS content (src/game/content/schoolActivities.ts — not redefined or
 * duplicated here), then apply a successful result back to `store` via its own public methods
 * only. This does not introduce a new pattern — it is the same adapter shape reused for a second
 * activity.
 *
 * HELP_PARENTS has no `requirement` at all (confirmed by inspection — no place, no minEnergy), so
 * ActivitySystem.canExecute() can only reject this on insufficient energy (5 needed). Any location
 * or "already done today" gating is therefore a LIVE UI decision (see page.tsx's helpParentsEligible),
 * not something silently added to the Core Simulation ActivityDef here.
 *
 * FINANCIAL EFFECT: HELP_PARENTS.financialEffect.amount is +5 (income, not an expense) — confirmed
 * by inspection of schoolActivities.ts and of FinanceSystem.recordTransaction()/ActivitySystem.execute(),
 * which build a signed `Transaction` (positive amount = income) on the ephemeral ledger only. That
 * ephemeral transaction is discarded with the rest of the ephemeral state; the amount it carries is
 * applied back to the live store via `store.earn(amount, category, description)` — mirroring the
 * exact pattern the now-removed Step 5 executeMorningTransport() used for its own positive-amount
 * case, before it was deleted in Step 10. store.spend()/store.earn() take (amount, category, label);
 * the transaction's own `category`/`description` fields are passed through unchanged rather than
 * re-typed here, so a future change to HELP_PARENTS's copy does not need a matching edit in this
 * adapter.
 */
export interface HelpParentsOutcome {
  ok: boolean;
  reason?: string;
  message?: string;
  minutesAdvanced: number;
  energyConsumed: number;
  amountEarned: number;
}

export function executeHelpParents(store: GameStore): HelpParentsOutcome {
  const { time, player, energy, finance } = buildEphemeralState(store);

  const clock = new ClockSystem(time);
  const playerSystem = new PlayerSystem(player);
  const energySystem = new EnergySystem(energy);
  const financeSystem = new FinanceSystem(finance);
  const activitySystem = new ActivitySystem(clock, playerSystem, energySystem, financeSystem);

  const result: ActivityResult = activitySystem.execute(HELP_PARENTS);

  if (!result.success) {
    // Nothing executed — store is untouched. HELP_PARENTS has no requirement.place/minEnergy, so
    // the only way this can fail is insufficient energy (canExecute() checks this before any
    // mutating call is made).
    return {
      ok: false,
      reason: result.reason,
      message: result.message,
      minutesAdvanced: 0,
      energyConsumed: 0,
      amountEarned: 0,
    };
  }

  // Apply time, then energy — same order ActivitySystem itself used internally and the same order
  // executeAttendClass() already applies them in.
  if (result.timeAdvancedMinutes > 0) {
    store.advance(result.timeAdvancedMinutes);
  }
  if (result.energyConsumed > 0) {
    store.consumeEnergy(result.energyConsumed);
  }

  // HELP_PARENTS has a financialEffect, so ActivitySystem.execute() always returns a `transaction`
  // on success (see activitySystem.ts: `if (def.financialEffect) { transaction = ... }`). Its
  // amount is positive (income), so the live-side equivalent is store.earn(), not store.spend() —
  // verified against FinanceSystem's signed-amount convention rather than assumed.
  let amountEarned = 0;
  if (result.transaction && result.transaction.amount > 0) {
    amountEarned = result.transaction.amount;
    store.earn(amountEarned, result.transaction.category, result.transaction.description);
  }

  // Step 18: same synchronization as executeAttendClass() — ActivitySystem.execute() already
  // computed HELP_PARENTS's activity tag ('chore') on the ephemeral player state; read it back and
  // apply it via the store's own public setter rather than duplicating the value here.
  store.setCurrentActivity(player.attributes.currentActivity);

  return {
    ok: true,
    minutesAdvanced: result.timeAdvancedMinutes,
    energyConsumed: result.energyConsumed,
    amountEarned,
  };
}
