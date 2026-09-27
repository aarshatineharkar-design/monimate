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
import { ClockSystem } from '../../systems/clockSystem';
import { PlayerSystem } from '../../systems/playerSystem';
import { EnergySystem } from '../../systems/energySystem';
import { FinanceSystem } from '../../systems/financeSystem';
import { ActivitySystem } from '../../systems/activitySystem';
import type { GameState } from '../../types/gameState';
import type { ActivityResult } from '../../types/activity';
import {
  WALK_TO_SCHOOL,
  TAKE_BUS,
  BRING_LUNCH,
  BUY_LUNCH,
  ATTEND_CLASS,
  HANG_OUT_WITH_FRIEND,
  GO_STRAIGHT_HOME,
  GET_MILK_FOR_MUM,
} from './mondayActivities';

export type MondayPhase =
  | 'morning_transport'
  | 'school'
  | 'lunch'
  | 'after_school'
  | 'errand'
  | 'complete';

export type TransportChoice = 'walk' | 'bus';
export type LunchChoice = 'bring' | 'buy';
export type AfterSchoolChoice = 'friend' | 'home';

export interface MondaySummaryGoal {
  id: string;
  name: string;
  target: number;
  /** Money saved/spent so far today, clamped into [0, target] — NOT the same field as
   *  FinancialGoal.saved (nothing in Step 4 auto-writes back to GoalState; that wiring is a later
   *  step's job). This is a derived read for the end-of-day recap only. */
  progress: number;
}

export interface MondaySummary {
  day: 'Monday';
  startingCash: number;
  spentToday: number;
  earnedToday: number;
  remainingCash: number;
  energyRemaining: number;
  energyMax: number;
  transactionsToday: number;
  errandAccepted: boolean | null;
  goal: MondaySummaryGoal | null;
}

/** Pure function, independently testable: reads GameState + the cash balance captured at the
 *  start of the day and produces the recap. Does not know about MondayFlow's phase machine. */
export function computeMondaySummary(state: GameState, startingCash: number, errandAccepted: boolean | null): MondaySummary {
  const { finance, energy, goals } = state;
  const firstFinancialGoal = goals.active.find((g) => g.kind === 'financial');
  const goal: MondaySummaryGoal | null = firstFinancialGoal
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

export class MondayFlow {
  private readonly clock: ClockSystem;
  private readonly player: PlayerSystem;
  private readonly energy: EnergySystem;
  private readonly finance: FinanceSystem;
  private readonly activity: ActivitySystem;
  private readonly startingCash: number;

  private _phase: MondayPhase = 'morning_transport';
  private _errandAccepted: boolean | null = null;

  constructor(private readonly state: GameState) {
    this.clock = new ClockSystem(state.time);
    this.player = new PlayerSystem(state.player);
    this.energy = new EnergySystem(state.energy);
    this.finance = new FinanceSystem(state.finance);
    this.activity = new ActivitySystem(this.clock, this.player, this.energy, this.finance);
    // Captured once, at the moment the day begins — before any Monday activity can run — so the
    // summary's "Starting cash" is always the true pre-Monday balance, not a hardcoded $20.
    this.startingCash = state.finance.accounts.cash;
  }

  get phase(): MondayPhase {
    return this._phase;
  }

  private assertPhase(expected: MondayPhase): void {
    if (this._phase !== expected) {
      throw new Error(`MondayFlow: cannot do this during phase "${this._phase}" (expected "${expected}").`);
    }
  }

  /** MORNING TRANSPORT — the first real choice of the day. */
  chooseTransport(choice: TransportChoice): ActivityResult {
    this.assertPhase('morning_transport');
    const def = choice === 'walk' ? WALK_TO_SCHOOL : TAKE_BUS;
    const result = this.activity.execute(def);
    if (result.success) this._phase = 'school';
    return result;
  }

  /** SCHOOL ACTIVITY — establishes not everything costs money. */
  attendClass(): ActivityResult {
    this.assertPhase('school');
    const result = this.activity.execute(ATTEND_CLASS);
    if (result.success) this._phase = 'lunch';
    return result;
  }

  /** LUNCH DECISION — the bring-vs-buy opportunity-cost moment. */
  chooseLunch(choice: LunchChoice): ActivityResult {
    this.assertPhase('lunch');
    const def = choice === 'bring' ? BRING_LUNCH : BUY_LUNCH;
    const result = this.activity.execute(def);
    if (result.success) this._phase = 'after_school';
    return result;
  }

  /** AFTER-SCHOOL DECISION. HANG_OUT_WITH_FRIEND has no RelationshipSystem call yet (none exists
   *  in Step 3) — the branch exists so a future RelationshipSystem.adjustStanding() call can be
   *  added here later without touching ActivitySystem or this method's signature. */
  chooseAfterSchool(choice: AfterSchoolChoice): ActivityResult {
    this.assertPhase('after_school');
    const def = choice === 'friend' ? HANG_OUT_WITH_FRIEND : GO_STRAIGHT_HOME;
    const result = this.activity.execute(def);
    if (result.success) this._phase = 'errand';
    return result;
  }

  /** PARENT ERRAND — world-driven, not player-initiated: MondayFlow itself is what raises this
   *  once the player gets home, standing in for a full MissionSystem (not built in Step 3/4) while
   *  preserving the Activity-vs-Mission distinction the blueprint calls for. Declining is a
   *  legitimate, zero-mutation choice, not a failure. */
  resolveErrand(accepted: boolean): ActivityResult | null {
    this.assertPhase('errand');
    this._errandAccepted = accepted;
    if (!accepted) {
      this._phase = 'complete';
      return null;
    }
    const result = this.activity.execute(GET_MILK_FOR_MUM);
    if (result.success) this._phase = 'complete';
    else this._errandAccepted = null; // failed attempt: don't record a false "accepted" outcome
    return result;
  }

  /** END OF MONDAY — only reachable once every phase above has resolved. */
  endDay(): MondaySummary {
    this.assertPhase('complete');
    return computeMondaySummary(this.state, this.startingCash, this._errandAccepted);
  }
}
