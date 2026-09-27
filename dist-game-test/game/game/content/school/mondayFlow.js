"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MondayFlow = void 0;
exports.computeMondaySummary = computeMondaySummary;
/**
 * MoniMate 2.0 — Step 4: MondayFlow, the School Week 1 Monday vertical slice.
 *
 * This is application/orchestration logic, not engine code: it sequences the existing Step 3
 * systems (ClockSystem/PlayerSystem/EnergySystem/FinanceSystem/ActivitySystem) through the fixed
 * Monday loop the spec lays out (wake up → transport → school → lunch → after-school → parent
 * errand → end-of-day summary). It never mutates time/energy/money/player state directly — every
 * effect goes through ActivitySystem.execute() or the systems' own public methods, same rule
 * ActivitySystem itself follows. A UI would sit ABOVE this class and call its methods; this class
 * never renders anything or reads from React state.
 *
 * The linear phase machine below is deliberate: Monday is meant to be a real playable loop, not a
 * bag of independently-callable functions the player could invoke in any order. Calling a method
 * out of turn throws, and — matching ActivitySystem's own atomicity rule — a thrown call leaves
 * every system's state exactly as it was; validation happens before any mutating call.
 */
const clockSystem_1 = require("../../systems/clockSystem");
const playerSystem_1 = require("../../systems/playerSystem");
const energySystem_1 = require("../../systems/energySystem");
const financeSystem_1 = require("../../systems/financeSystem");
const activitySystem_1 = require("../../systems/activitySystem");
const mondayActivities_1 = require("./mondayActivities");
/** Pure function, independently testable: reads GameState + the cash balance captured at the
 *  start of the day and produces the recap. Does not know about MondayFlow's phase machine. */
function computeMondaySummary(state, startingCash, errandAccepted) {
    const { finance, energy, goals } = state;
    const firstFinancialGoal = goals.active.find((g) => g.kind === 'financial');
    const goal = firstFinancialGoal
        ? {
            id: firstFinancialGoal.id,
            name: firstFinancialGoal.name,
            target: firstFinancialGoal.target,
            progress: Math.max(0, Math.min(firstFinancialGoal.target, finance.totals.totalEarned - finance.totals.totalSpent)),
        }
        : null;
    return {
        day: 'Monday',
        startingCash,
        spentToday: finance.totals.totalSpent,
        earnedToday: finance.totals.totalEarned,
        remainingCash: finance.accounts.cash,
        energyRemaining: energy.current,
        energyMax: energy.max,
        transactionsToday: finance.transactions.recent.length,
        errandAccepted,
        goal,
    };
}
class MondayFlow {
    constructor(state) {
        this.state = state;
        this._phase = 'morning_transport';
        this._errandAccepted = null;
        this.clock = new clockSystem_1.ClockSystem(state.time);
        this.player = new playerSystem_1.PlayerSystem(state.player);
        this.energy = new energySystem_1.EnergySystem(state.energy);
        this.finance = new financeSystem_1.FinanceSystem(state.finance);
        this.activity = new activitySystem_1.ActivitySystem(this.clock, this.player, this.energy, this.finance);
        // Captured once, at the moment the day begins — before any Monday activity can run — so the
        // summary's "Starting cash" is always the true pre-Monday balance, not a hardcoded $20.
        this.startingCash = state.finance.accounts.cash;
    }
    get phase() {
        return this._phase;
    }
    assertPhase(expected) {
        if (this._phase !== expected) {
            throw new Error(`MondayFlow: cannot do this during phase "${this._phase}" (expected "${expected}").`);
        }
    }
    /** MORNING TRANSPORT — the first real choice of the day. */
    chooseTransport(choice) {
        this.assertPhase('morning_transport');
        const def = choice === 'walk' ? mondayActivities_1.WALK_TO_SCHOOL : mondayActivities_1.TAKE_BUS;
        const result = this.activity.execute(def);
        if (result.success)
            this._phase = 'school';
        return result;
    }
    /** SCHOOL ACTIVITY — establishes not everything costs money. */
    attendClass() {
        this.assertPhase('school');
        const result = this.activity.execute(mondayActivities_1.ATTEND_CLASS);
        if (result.success)
            this._phase = 'lunch';
        return result;
    }
    /** LUNCH DECISION — the bring-vs-buy opportunity-cost moment. */
    chooseLunch(choice) {
        this.assertPhase('lunch');
        const def = choice === 'bring' ? mondayActivities_1.BRING_LUNCH : mondayActivities_1.BUY_LUNCH;
        const result = this.activity.execute(def);
        if (result.success)
            this._phase = 'after_school';
        return result;
    }
    /** AFTER-SCHOOL DECISION. HANG_OUT_WITH_FRIEND has no RelationshipSystem call yet (none exists
     *  in Step 3) — the branch exists so a future RelationshipSystem.adjustStanding() call can be
     *  added here later without touching ActivitySystem or this method's signature. */
    chooseAfterSchool(choice) {
        this.assertPhase('after_school');
        const def = choice === 'friend' ? mondayActivities_1.HANG_OUT_WITH_FRIEND : mondayActivities_1.GO_STRAIGHT_HOME;
        const result = this.activity.execute(def);
        if (result.success)
            this._phase = 'errand';
        return result;
    }
    /** PARENT ERRAND — world-driven, not player-initiated: MondayFlow itself is what raises this
     *  once the player gets home, standing in for a full MissionSystem (not built in Step 3/4) while
     *  preserving the Activity-vs-Mission distinction the blueprint calls for. Declining is a
     *  legitimate, zero-mutation choice, not a failure. */
    resolveErrand(accepted) {
        this.assertPhase('errand');
        this._errandAccepted = accepted;
        if (!accepted) {
            this._phase = 'complete';
            return null;
        }
        const result = this.activity.execute(mondayActivities_1.GET_MILK_FOR_MUM);
        if (result.success)
            this._phase = 'complete';
        else
            this._errandAccepted = null; // failed attempt: don't record a false "accepted" outcome
        return result;
    }
    /** END OF MONDAY — only reachable once every phase above has resolved. */
    endDay() {
        this.assertPhase('complete');
        return computeMondaySummary(this.state, this.startingCash, this._errandAccepted);
    }
}
exports.MondayFlow = MondayFlow;
