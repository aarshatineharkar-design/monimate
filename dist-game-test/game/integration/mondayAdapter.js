"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAttendClass = executeAttendClass;
exports.executeHelpParents = executeHelpParents;
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
const clockSystem_1 = require("../systems/clockSystem");
const playerSystem_1 = require("../systems/playerSystem");
const energySystem_1 = require("../systems/energySystem");
const financeSystem_1 = require("../systems/financeSystem");
const activitySystem_1 = require("../systems/activitySystem");
const mondayActivities_1 = require("../content/school/mondayActivities");
const schoolActivities_1 = require("../content/schoolActivities");
/** Builds the minimal, throwaway Core Simulation sub-state this one activity needs, seeded from
 *  the live GameStore's current values. See the module-level comment for why this is safe to
 *  discard immediately after use. */
function buildEphemeralState(store) {
    const s = store.state;
    const time = {
        minutes: s.minutes, // same epoch as the live clock — see module comment
        paused: false,
        timeMultiplier: 1,
    };
    const player = {
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
    const energy = { current: liveEnergy.current, max: liveEnergy.max, recoveryPerHourAsleep: 12.5 };
    const finance = {
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
function executeAttendClass(store) {
    const { time, player, energy, finance } = buildEphemeralState(store);
    const clock = new clockSystem_1.ClockSystem(time);
    const playerSystem = new playerSystem_1.PlayerSystem(player);
    const energySystem = new energySystem_1.EnergySystem(energy);
    const financeSystem = new financeSystem_1.FinanceSystem(finance);
    const activitySystem = new activitySystem_1.ActivitySystem(clock, playerSystem, energySystem, financeSystem);
    const result = activitySystem.execute(mondayActivities_1.ATTEND_CLASS);
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
function executeHelpParents(store) {
    const { time, player, energy, finance } = buildEphemeralState(store);
    const clock = new clockSystem_1.ClockSystem(time);
    const playerSystem = new playerSystem_1.PlayerSystem(player);
    const energySystem = new energySystem_1.EnergySystem(energy);
    const financeSystem = new financeSystem_1.FinanceSystem(finance);
    const activitySystem = new activitySystem_1.ActivitySystem(clock, playerSystem, energySystem, financeSystem);
    const result = activitySystem.execute(schoolActivities_1.HELP_PARENTS);
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
