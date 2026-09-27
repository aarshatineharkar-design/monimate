/**
 * MoniMate — GameStore: the single authoritative simulation.
 *
 *   GAME STATE ─ CLOCK ─ PLAYER ─ WORLD ─ MISSIONS ─ FINANCE ─ NPCs ─ EVENTS ─ PROGRESSION
 *
 * React never owns game state. The canvas loop calls `store.tick()` once per frame; React reads
 * snapshots through `subscribe()` at a throttled rate for HUD/panels. All systems advance ONLY by
 * calling `advance(minutes)`, so a bus ride, a lunch break, a sleep and a walk all move the same clock.
 */
import { MIN_PER_DAY, TIME_SCALE, at, hm, parts } from './clock';
import type { FinancialState } from '../game/types/finance';
import type { GoalState } from '../game/types/goal';
import type { Transaction, TransactionCategory } from '../game/types/transaction';
import type { ActivityDef } from '../game/types/activity';
import { FinanceSystem } from '../game/systems/financeSystem';
import { EnergySystem } from '../game/systems/energySystem';
import { ActivitySystem, type ActivityClock, type ActivityPlayer } from '../game/systems/activitySystem';
import { HELP_PARENTS } from '../game/content/schoolActivities';
import { migrateSave } from './saveMigration';
import { getWeekGoal, type LifePath, type WeekGoalDef } from './gameData';
import { pathRules, type PathRules } from './pathRules';
import { didWeeklyShop } from './content/university';

/** Small deterministic RNG (mulberry32), so a given save + day always rolls the same tasks. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
import {
  Emit, MissionChoice, MissionDef, getDef, initialMissionRuntime, markKey, hasMark,
  missionDefs, missionsOnDayStart, missionsOnEvent, missionsOnMinute, missionWindowOpen, offeredToday,
} from './missions';
import type { MissionStep } from './missions';
import { DAILY_POOLS } from './dailyMissions';
import type {
  ActivityTag, DayRecord, GameEvent, GameState, MissionRuntime, NpcRuntime, PlaceId, SceneId, WeekRecord,
} from './types';
import { ACHIEVEMENTS, checkAchievements } from './achievements';
import { LIFE_EVENTS, rollLifeEvent } from './lifeEvents';
import {
  BIKE_MIN_PER_TILE, BUS_ROUTE, BUS_STOPS, NPCS, TILE_PX, WALK_MIN_PER_TILE, busAtStop, distanceTiles,
  doorTile, getPlace, isOpen, closedReason, npcPlaceAt, rideMinutes, routeTiles, stopById, tileToPx,
  getInterior, INTERIOR_TILE_PX, PLACE_INTERIOR_SCENE, npcRoomAt, interiorBlocked,
} from './world';
import type { ShopItemDef } from './world';

export const BASE_MINUTES_PER_SECOND = TIME_SCALE;
const RIDE_REAL_SECONDS = 6;          // a bus trip plays out over ~6 real seconds
const SCHOOL_END = hm(15, 30);         // anyone who never made it to class/lectures is absent from here
const PASS_OUT_AT = hm(2, 0);         // stay up past 2 AM and you fall asleep where you are
const WAKE_AT = hm(7, 0);

const emptyDay = (day: number, balance: number): DayRecord => ({
  day, startBalance: balance, endBalance: balance, spent: 0, earned: 0, schoolAttended: null,
  missionsCompleted: [], missionsMissed: [], socialActivities: 0, travel: [], lateToSchool: false, bedtimeMinuteOfDay: null,
});

export function createInitialState(
  lifePath: GameState['lifePath'], finance: FinancialState, goals: GoalState = { active: [], completed: [] },
): GameState {
  const defs = missionDefs(lifePath);
  const start = at(0, 7, 0); // Monday 7:00 AM, at home, sun rising
  const home = tileToPx(doorTile('home')); // outdoor px — used only for lastDoor (where we pop back out to)
  // The game STARTS inside the house interior, which renders on its own grid (INTERIOR_TILE_PX),
  // not the outdoor one — spawning at outdoor coordinates put the player outside the room's walls,
  // pinned against collision on every axis (arrows "worked" but velocity was zeroed every frame).
  const homeInterior = getInterior('interior_home');
  const spawnPx = homeInterior
    ? { x: homeInterior.spawn.x * INTERIOR_TILE_PX, y: homeInterior.spawn.y * INTERIOR_TILE_PX }
    : { x: home.x, y: home.y };
  return {
    version: 3, minutes: start, paused: false, timeMultiplier: 1,
    player: { x: spawnPx.x, y: spawnPx.y, vx: 0, vy: 0, facing: Math.PI / 2, scene: 'interior_home', place: 'home', status: 'idle', lastDoor: { placeId: 'home', x: home.x, y: home.y, facing: Math.PI / 2 } },
    finance,
    goals,
    energy: { current: 100, max: 100, recoveryPerHourAsleep: 12.5 },
    world: { flags: [`seed:${Math.floor(Math.random() * 1e9)}`], relationships: { ...pathRules(lifePath).relationships }, dailyMarks: [], busPass: null, hasBike: false },
    missions: initialMissionRuntime(defs),
    npcs: {},
    today: emptyDay(0, finance.accounts.cash),
    currentActivity: null,
    weekDays: [], weeks: [], lifePath, xp: 0, ride: null, sleeping: false,
  };
}

export type Listener = () => void;
export type EventListener = (e: GameEvent) => void;

/** Real numbers pulled from state the moment "Make It to Friday" resolves — see completeMission's
 *  friday_recap special-case below. Nothing here is written ahead of time; it's all computed live. */
export interface LevelSummary {
  startBalance: number;
  endBalance: number;
  daysAttended: number;
  daysTotal: number;
  schoolProjectDone: boolean;
  birthdayOutcome: 'full' | 'partial' | 'declined';
  unexpectedOutcome: 'paid' | 'walked' | 'none';
  wentToArcade: boolean;
  /** Real bus use this week, straight from the travel log and the ledger. */
  busRides: number;
  busSpent: number;
  /** The goal picked on Monday, and whether it happened. */
  goal: { id: string; emoji: string; name: string; achieved: boolean; detail: string } | null;
  unexpectedKind: 'bus' | 'shoe' | null;
  fairAttended: boolean;
  dairyShift: boolean;
  savings: number;
  earned: number;
  spent: number;
  /** which path's week this was, and that path's own story beats (University etc.) as ready-made
   *  lines — the School recap keeps its dedicated fields above. */
  path: LifePath;
  highlights: RecapLine[];
}
export interface RecapLine { icon: string; text: string; tone: 'good' | 'bad' | 'neutral' }

/** Live status of this week's goal, for the HUD bar and the Sunday recap. */
export interface GoalStatus {
  def: WeekGoalDef;
  achieved: boolean;
  /** 0..1 for the HUD bar */
  progress: number;
  detail: string;
}

/** Flags that describe one week. Cleared when the next week's pocket money arrives, so last
 *  week's arcade trip can't count toward this week's goal. */
const WEEK_FLAG_PREFIXES = [
  'wk_', // every path's newer content marks its week-only flags with this prefix
  'goal:', 'friends_base:', 'birthday_', 'unexpected_', 'school_project_', 'school_fair_', 'dairy_shift_',
  'errand_', 'arcade_visit', 'park_alternative', 'bought_', 'late_to_school', 'ate_home_lunch', 'skipped_lunch',
  'did_homework', 'got_pocket_money', 'week_started', 'on_time', 'pocket_money_done', 'birthday_resolved',
  'team_', 'lent_jordan', 'jordan_owes_', 'project_day_', 'baked_cookies', 'fell_for_scam', 'spotted_scam',
];
/** Energy lost per game-hour of free play (activities like class carry their own costs). */
const ENERGY_DRAIN_PER_HOUR = 3;
const LOW_ENERGY = 15;

/** Result of running an ActivityDef against the live game (Attend Class, Help Parents, …). */
export interface ActivityOutcome {
  ok: boolean;
  reason?: string;
  message?: string;
  minutesAdvanced: number;
  energyConsumed: number;
  amountEarned: number;
}

/** Status of today's lesson for the Attend Class prompt. */
export type ClassStatus = 'ready' | 'go_to_classroom' | 'too_late' | 'done';

export class GameStore {
  state: GameState;
  defs: MissionDef[];
  /** newly available missions waiting for the UI to offer them */
  offerQueue: string[] = [];
  /** achievements unlocked since the UI last asked — consumed by takeAchievementToasts() */
  toastQueue: { id: string; name: string; emoji: string }[] = [];
  /** summaries waiting to be shown */
  pendingDaySummary: DayRecord | null = null;
  pendingWeekSummary: WeekRecord | null = null;
  /** Set once, when "Made It to Friday" completes — real numbers pulled from state at that moment,
   *  not scripted text, so the recap reflects whatever the player actually decided all week. */
  pendingLevelSummary: LevelSummary | null = null;

  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private version = 0;
  private lastNotify = 0;
  private dirty = false;
  /** Real purchases made toward an active mission's shopping-list step (missionId -> items bought
   *  while that step has been current). Session-only — not part of the persisted GameState, since
   *  it's fully rebuilt from real purchases as they happen and never needs to survive a reload mid-step. */
  private missionPurchaseLog = new Map<string, { id: string; name: string; price: number }[]>();
  /** Balance snapshot taken the instant this week's pocket money is granted — the reference point
   *  for the Friday recap, since leftover balance from a previous week means "start of week" isn't
   *  simply the weekly income figure once you're past week one. */
  private weekStartBalance = 0;
  /** The one engine: every balance change goes through `money`, every energy change through
   *  `energySys`, every timed activity through `activities`. They operate on this.state directly. */
  private money!: FinanceSystem;
  private energySys!: EnergySystem;
  private activities!: ActivitySystem;
  /** One-line notices for the HUD (e.g. "Closed — opens at 7:30 AM"), drained by takeNotices(). */
  private noticeQueue: string[] = [];

  /** This path's rules (goals, cast, timetable, week start/recap) — see pathRules.ts. */
  readonly rules: PathRules;
  /** The NPCs who exist on this path. */
  private cast: typeof NPCS;

  constructor(state: GameState) {
    this.state = state;
    this.rules = pathRules(state.lifePath);
    this.cast = NPCS.filter(n => this.rules.cast.includes(n.id));
    // A save can be written while a menu had the clock paused (e.g. the "switch life path?" prompt);
    // a freshly loaded game always starts running.
    state.paused = false;
    if (state.currentActivity === undefined) state.currentActivity = null;
    this.money = new FinanceSystem(state.finance, tx => this.onTransaction(tx));
    this.energySys = new EnergySystem(state.energy);
    const clock: ActivityClock = { advance: m => this.advance(m), getTime: () => ({ minutes: this.state.minutes }) };
    const player: ActivityPlayer = {
      getLocation: () => this.state.player.place,
      changeLocation: placeId => { if (placeId && placeId !== this.state.player.place) { this.exitPlace(); this.enterPlace(placeId); } },
      setCurrentActivity: tag => this.setCurrentActivity(tag),
    };
    this.activities = new ActivitySystem(clock, player, this.energySys, this.money);
    // Self-heal saves made while the interior spawn-point bug was live: if the player is "inside"
    // a room but their x/y sit outside that room's own tile grid, they'd be wedged against a wall
    // with movement permanently zeroed. Snap them back to that interior's spawn tile instead.
    if (state.player.scene !== 'outdoor' && state.player.scene !== 'bus') {
      const interior = getInterior(state.player.scene);
      if (interior) {
        const tx = state.player.x / INTERIOR_TILE_PX, ty = state.player.y / INTERIOR_TILE_PX;
        if (tx < 0.3 || ty < 0.3 || tx > interior.widthTiles - 0.3 || ty > interior.heightTiles - 0.3) {
          state.player.x = interior.spawn.x * INTERIOR_TILE_PX;
          state.player.y = interior.spawn.y * INTERIOR_TILE_PX;
          state.player.vx = 0; state.player.vy = 0;
        }
      }
    }
    this.defs = missionDefs(state.lifePath);
    // Saves from before a mission existed get a fresh runtime for it.
    for (const def of this.defs) {
      if (!state.missions.some(m => m.id === def.id)) state.missions.push({ id: def.id, state: 'locked', stepIndex: 0 });
    }
    if (!state.world.flags.some(f => f.startsWith('seed:'))) state.world.flags.push(`seed:${Math.floor(Math.random() * 1e9)}`);
    this.rollDailyPool();
    // A save made while a mission had more steps than it does now points past its last step;
    // clamp it so the mission can still finish instead of silently hanging until it expires.
    for (const rt of state.missions) {
      const def = this.def(rt.id);
      if (def && rt.stepIndex >= def.steps.length) rt.stepIndex = def.steps.length - 1;
    }
    this.initNpcs(true);
    // Missions that should already be open at the start time get evaluated immediately
    this.evaluateMissions();
    this.evaluateAchievements();
  }

  // ── subscription (React) ──────────────────────────────────────────────────
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  onEvent(fn: EventListener) { this.eventListeners.add(fn); return () => { this.eventListeners.delete(fn); }; }

  /** mark state changed; notifies React at most ~5×/s so the canvas never fights re-renders */
  private touch(force = false) {
    this.dirty = true;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (force || now - this.lastNotify > 200) this.flush(now);
  }
  private flush(now = performance.now()) {
    if (!this.dirty) return;
    this.dirty = false; this.lastNotify = now; this.version++;
    this.listeners.forEach(l => l());
  }

  private emit: Emit = (e) => {
    if (e.type === 'mission_available') this.offerQueue.push(e.missionId);
    missionsOnEvent(this.state, this.defs, e, (rt, def, outcome) => this.completeMission(rt, def, outcome));
    this.eventListeners.forEach(l => l(e));
  };

  // ══ CLOCK ════════════════════════════════════════════════════════════════
  /**
   * Called once per frame by the game loop.
   * `movedTiles` = distance the player actually walked this frame. While outdoors, walking
   * consumes game time in proportion to distance (so walking to school really costs ~22 min);
   * standing still runs at the base rate. Bus rides fast-forward over their true duration.
   */
  tick(dtSec: number, movedTiles: number, mode: 'walk' | 'bike' = 'walk') {
    const s = this.state;
    if (s.paused || s.sleeping) return;
    let minutes: number;
    if (s.ride) {
      const total = s.ride.endsAt - s.ride.startedAt;
      minutes = Math.min(s.ride.endsAt - s.minutes, (total / RIDE_REAL_SECONDS) * dtSec);
    } else if (s.player.scene === 'outdoor' && movedTiles > 0) {
      minutes = movedTiles * (mode === 'bike' ? BIKE_MIN_PER_TILE : WALK_MIN_PER_TILE);
    } else {
      minutes = dtSec * BASE_MINUTES_PER_SECOND * s.timeMultiplier;
    }
    this.advance(Math.min(minutes, 5), true);
    if (!s.ride) this.drainEnergy(Math.min(minutes, 5) * ENERGY_DRAIN_PER_HOUR / 60);
    this.stepNpcs(minutes);
    if (s.ride && s.minutes >= s.ride.endsAt - 1e-6) this.finishRide();
    this.touch();
  }

  /** The ONLY way time moves forward. Steps minute-by-minute so nothing is ever skipped. */
  advance(deltaMinutes: number, fromTick = false) {
    if (deltaMinutes <= 0) return;
    const s = this.state;
    const target = s.minutes + deltaMinutes;
    const big = deltaMinutes > 20;
    while (Math.floor(s.minutes) < Math.floor(target)) {
      s.minutes = Math.floor(s.minutes) + 1;
      this.onMinute();
    }
    s.minutes = target;
    if (big && !fromTick) { this.initNpcs(true); }
    this.touch(!fromTick);
  }

  private onMinute() {
    const s = this.state;
    const p = parts(s.minutes);
    this.emit({ type: 'minute', minutes: s.minutes });
    if (p.minute === 0) this.emit({ type: 'hour', minutes: s.minutes });

    if (p.minuteOfDay === 0) {
      this.emit({ type: 'day_start', day: p.day, minutes: s.minutes });
      s.world.dailyMarks = s.world.dailyMarks.filter(m => Number(m.split(':').pop()) >= p.day - 1);
      missionsOnDayStart(s, this.defs, p.day);
      this.rollDailyPool();
      // one small optional life event may land today, on top of the scripted mission schedule
      if (!s.pendingLifeEvent) {
        const ev = rollLifeEvent(s);
        if (ev) { s.pendingLifeEvent = { id: ev.id, emoji: ev.emoji, text: ev.text, choiceIds: ev.choices.map(c => c.id) }; this.emit({ type: 'life_event', id: ev.id }); }
      }
    }

    // school ends: anyone who never arrived is marked absent
    if (this.rules.study && p.dayOfWeek < 5 && p.minuteOfDay === SCHOOL_END && s.today.schoolAttended === null) {
      s.today.schoolAttended = false;
      this.emit({ type: 'school_missed', day: p.day });
    }

    // bus events for the world (arrivals at each stop)
    for (const stop of BUS_ROUTE.stops) {
      const b = busAtStop(stop.stopId, s.minutes);
      if (b && Math.floor(s.minutes) === Math.floor(b.arrivesAt)) this.emit({ type: 'bus_arrived', stopId: stop.stopId, routeId: BUS_ROUTE.id, minutes: s.minutes });
    }

    this.evaluateMissions();
    this.updateNpcTargets();
    this.economyOnMinute(p);

    if (p.minuteOfDay === PASS_OUT_AT && !s.sleeping) this.sleep(true);
  }

  private evaluateMissions() {
    missionsOnMinute(this.state, this.defs, this.emit, (def, rt) => this.onMissionExpired(def, rt));
  }

  // ══ ECONOMY ══════════════════════════════════════════════════════════════
  /** 9 AM each day: weekly pay on Thursday, then any recurring expense that has come due (rent,
   *  phone bill…). A bill you can't cover isn't silently skipped — it becomes arrears you owe. */
  private economyOnMinute(p: ReturnType<typeof parts>) {
    const s = this.state, f = s.finance;
    if (p.minuteOfDay !== hm(9)) return;
    if (p.dayOfWeek === 5 && this.weekGoalId() === 'save_event' && f.accounts.savings > 0 && f.accounts.cash < 10) {
      this.pushNotice('Fair day! Take your savings out of the piggy bank before you head to school.');
    }
    const job = f.income.job;
    if (p.dayOfWeek === 3 && job) {
      this.earn(job.payPerHour * job.hoursPerWeek, 'income', `${job.name} pay`, job.location);
    }
    for (const bill of f.expenses.recurring) {
      if (bill.nextDueAt > s.minutes) continue;
      bill.nextDueAt += bill.periodDays * MIN_PER_DAY;
      const category: TransactionCategory = bill.category === 'food' || bill.category === 'other' ? 'other' : bill.category;
      if (this.spend(bill.amount, category, bill.name, 'system')) continue;
      const arrears = f.debt.loans.find(l => l.id === 'arrears');
      if (arrears) arrears.principal += bill.amount;
      else f.debt.loans.push({ id: 'arrears', kind: 'other', principal: bill.amount, apr: 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: s.minutes + 30 * MIN_PER_DAY });
      this.pushNotice(`Couldn't pay ${bill.name} ($${bill.amount.toFixed(2)}) — it's been added to what you owe.`);
    }
  }

  // ══ MONEY ════════════════════════════════════════════════════════════════
  /** Cash in hand — what the HUD shows and what purchases are checked against. */
  get cash(): number { return this.state.finance.accounts.cash; }
  canAfford(amount: number): boolean { return this.money.canAfford('cash', amount); }

  /** Pay `amount` from cash. Returns false (and changes nothing) if the player can't afford it —
   *  money never goes negative. `label` is the reason shown in the ledger; `source` is who/where. */
  spend(amount: number, category: TransactionCategory, label: string, source?: string): boolean {
    if (!(amount > 0)) return true;
    if (!this.money.canAfford('cash', amount)) return false;
    this.money.recordTransaction({ account: 'cash', amount: -amount, category, type: 'expense', description: label, source }, this.state.minutes);
    return true;
  }
  earn(amount: number, category: TransactionCategory, label: string, source?: string) {
    if (!(amount > 0)) return;
    this.money.recordTransaction({ account: 'cash', amount, category, type: 'income', description: label, source }, this.state.minutes);
  }
  /** Piggy bank: move cash into savings (and back). Recorded as a linked pair of transfers. */
  moveToSavings(amount: number): boolean {
    if (!(amount > 0) || !this.money.canAfford('cash', amount)) return false;
    this.money.transfer('cash', 'savings', amount, this.state.minutes, this.rules.savings.atHome ? 'Into the piggy bank' : 'Into savings');
    return true;
  }
  takeFromSavings(amount: number): boolean {
    if (!(amount > 0) || !this.money.canAfford('savings', amount)) return false;
    this.money.transfer('savings', 'cash', amount, this.state.minutes, this.rules.savings.atHome ? 'Out of the piggy bank' : 'Out of savings');
    return true;
  }
  /** Transactions since a game minute (e.g. this week), newest last. */
  transactionsSince(minute: number): Transaction[] {
    return this.state.finance.transactions.recent.filter(t => t.timestamp >= minute);
  }
  /** Keeps the day record, events and achievements in step with every transaction, whatever made it. */
  private onTransaction(tx: Transaction) {
    const s = this.state;
    if (tx.type !== 'transfer') {
      if (tx.amount < 0) s.today.spent += -tx.amount;
      else s.today.earned += tx.amount;
    }
    if (tx.amount < 0 && tx.type === 'expense') this.emit({ type: 'purchase', amount: -tx.amount, category: tx.category, label: tx.description });
    this.syncGoals();
    this.touch();
  }

  // ══ ENERGY (Step 6) ═══════════════════════════════════════════════════════
  /** Read-only snapshot — callers get the current {current,max}, never a mutable reference they
   *  could edit outside these methods. */
  getEnergy(): { current: number; max: number } { return { current: this.state.energy.current, max: this.state.energy.max }; }
  /** Energy spent by a choice or action. Clamped at 0: tiredness is a consequence, not a lock. */
  consumeEnergy(amount: number) {
    if (!(amount > 0)) return;
    this.energySys.consume(Math.min(amount, this.state.energy.current));
    this.touch();
  }
  restoreEnergy(amount: number) {
    if (!(amount > 0)) return;
    this.energySys.restore(amount);
    this.touch();
  }

  /** Being awake and on the move slowly tires you out. Warns once when you get low. */
  private drainEnergy(amount: number) {
    if (!(amount > 0)) return;
    const before = this.state.energy.current;
    this.energySys.consume(Math.min(amount, before));
    if (before >= LOW_ENERGY && this.state.energy.current < LOW_ENERGY) {
      this.pushNotice("You're exhausted — you'll move slower until you eat or sleep.");
    }
  }
  get exhausted(): boolean { return this.state.energy.current < LOW_ENERGY; }

  // ══ DAILY VARIETY ════════════════════════════════════════════════════════
  get seed(): number {
    return Number(this.state.world.flags.find(f => f.startsWith('seed:'))?.slice(5) ?? 1);
  }
  /** A number in [0,1) that's the same every time for this save + day + key, and different otherwise. */
  private dayRandom(key: string): () => number {
    return seededRandom(hashString(`${this.seed}|${parts(this.state.minutes).day}|${key}`));
  }
  /** Pick today's side tasks from each pool (once per day). */
  rollDailyPool() {
    const s = this.state, p = parts(s.minutes);
    if (hasMark(s, 'pool_rolled')) return;
    s.world.dailyMarks.push(markKey('pool_rolled', p.day));
    // Nothing repeats within a week: every task offered this week is remembered (seen:<week>:<id>)
    // and only comes back once its pool has run out of fresh ones.
    const week = Math.floor(p.day / 7);
    s.world.flags = s.world.flags.filter(f => !f.startsWith('seen:') || f.startsWith(`seen:${week}:`));
    const seen = new Set(s.world.flags.filter(f => f.startsWith(`seen:${week}:`)).map(f => f.split(':')[2]));
    for (const [pool, cfg] of Object.entries(DAILY_POOLS)) {
      const rnd = this.dayRandom(`pool:${pool}`);
      const candidates = this.defs.filter(d => d.pool === pool && d.paths.includes(s.lifePath)
        && d.window.days.includes(p.dayOfWeek) && (!d.requires || d.requires(s)));
      const fresh = candidates.filter(d => !seen.has(d.id)), repeats = candidates.filter(d => seen.has(d.id));
      for (let i = 0; i < cfg.count; i++) {
        const bag = fresh.length ? fresh : repeats;
        if (!bag.length) break;
        const pick = bag.splice(Math.floor(rnd() * bag.length), 1)[0];
        if (rnd() < cfg.chance) {
          s.world.dailyMarks.push(markKey(`pool:${pick.id}`, p.day));
          s.world.flags.push(`seen:${week}:${pick.id}`);
        }
      }
    }
  }
  /** The ids of today's rolled side tasks. */
  todaysPool(): string[] {
    const day = parts(this.state.minutes).day;
    return this.state.world.dailyMarks.filter(m => m.startsWith('pool:') && m.endsWith(`:${day}`)).map(m => m.split(':')[1]);
  }
  /** The step as the player sees it today: the day's variant (if any), minus options hidden right now. */
  stepFor(def: MissionDef, rt: MissionRuntime): MissionStep | undefined {
    const base = def.steps[rt.stepIndex];
    if (!base) return undefined;
    let step: MissionStep = base;
    if (base.variants?.length) {
      const v = base.variants[Math.floor(this.dayRandom(`variant:${def.id}:${base.id}`)() * base.variants.length)];
      step = { ...base, ...v, speaker: v.speaker ?? base.speaker, npcId: v.npcId ?? base.npcId, choices: v.choices ?? base.choices };
    }
    if (step.choices?.some(c => c.hideIf)) step = { ...step, choices: step.choices.filter(c => !c.hideIf || !c.hideIf(this.state)) };
    return step;
  }
  private applyEffect(effect: NonNullable<MissionChoice['effect']>) {
    const s = this.state, p = parts(s.minutes);
    if (effect === 'bus_pass_week') s.world.busPass = { validUntil: at(p.day - p.dayOfWeek + 7, 0, 0) };
    if (effect === 'subscribe_streambox' && !s.finance.expenses.recurring.some(r => r.id === 'streambox')) {
      s.finance.expenses.recurring.push({ id: 'streambox', category: 'subscription', name: 'StreamBox', amount: 5, periodDays: 30, nextDueAt: s.minutes + 30 * MIN_PER_DAY });
    }
    if (effect === 'no_packed_lunch_today') s.world.dailyMarks.push(markKey('no_packed_lunch', p.day));
    if (effect === 'student_loan_draw') {
      // StudyLink living costs are borrowed: the payment adds to what you owe on your student loan.
      const loan = s.finance.debt.loans.find(l => l.kind === 'student');
      if (loan) loan.principal += 316;
    }
    if (effect === 'subscribe_sky' && !s.finance.expenses.recurring.some(r => r.id === 'sky_split')) {
      s.finance.expenses.recurring.push({ id: 'sky_split', category: 'subscription', name: 'Sky Sport (flat split)', amount: 8, periodDays: 30, nextDueAt: s.minutes + 30 * MIN_PER_DAY });
    }
    if (effect === 'bnpl_headphones') {
      // Three more $35 instalments still to pay: shown as money owed in the Bank app.
      s.finance.debt.loans.push({ id: `paylater_${s.minutes}`, kind: 'other', principal: 105, apr: 0, paymentPerPeriod: 35, periodDays: 14, nextDueAt: s.minutes + 14 * MIN_PER_DAY });
    }
    if (effect === 'save_5_matched' && this.moveToSavings(5)) {
      // Mum's "interest": $1 on top of every $5 saved, straight into the piggy bank.
      this.earn(1, 'interest', 'Mum\'s savings bonus');
      this.moveToSavings(1);
    }
  }

  // ══ END OF DAY ═══════════════════════════════════════════════════════════
  /** Missions that are still to come or still open today (so the day isn't "done" yet). */
  pendingToday(): MissionDef[] {
    const s = this.state, p = parts(s.minutes);
    const out: MissionDef[] = [];
    for (const rt of s.missions) {
      const def = this.def(rt.id);
      if (!def || !def.paths.includes(s.lifePath)) continue;
      if (rt.state === 'available' || rt.state === 'active') { out.push(def); continue; }
      if (rt.state !== 'locked' || !offeredToday(s, def)) continue;
      if (def.requires && !def.requires(s)) continue;
      // Will its window still be open at some point later today?
      for (let m = p.minuteOfDay; m < MIN_PER_DAY; m += 10) {
        if (missionWindowOpen(def, at(p.day, 0, m))) { out.push(def); break; }
      }
    }
    return out;
  }
  /** True once today's school day is over and nothing is left to do or still coming today. */
  dayComplete(): boolean {
    const s = this.state, p = parts(s.minutes);
    if (s.sleeping || s.ride || hasMark(s, 'day_done')) return false;
    if (p.minuteOfDay < (p.dayOfWeek < 5 ? hm(15, 45) : hm(13))) return false;
    return this.pendingToday().length === 0;
  }
  markDayDoneShown() { this.markDoneToday('day_done'); }
  /** What happened today, for the "all done" card. */
  todaySummary() {
    const s = this.state, name = (id: string) => this.def(id)?.name ?? id, emoji = (id: string) => this.def(id)?.emoji ?? '•';
    return {
      done: s.today.missionsCompleted.map(id => ({ id, name: name(id), emoji: emoji(id) })),
      // Only real misses: obligations, main/timed story beats, or side tasks you said yes to and then
      // didn't do. An offer you simply ignored (an ad, a text) isn't a failure.
      missed: s.today.missionsMissed
        .filter(id => { const d = this.def(id); return !!d?.onExpire || d?.kind === 'main' || d?.kind === 'timed' || (!!d?.pool && (this.runtime(id)?.stepIndex ?? 0) > 0); })
        .map(id => ({ id, name: name(id), emoji: emoji(id) })),
      earned: s.today.earned, spent: s.today.spent,
    };
  }
  /** Walk home (the clock runs for the walk) and step inside. Returns the minutes it took. */
  goHome(): number {
    const s = this.state;
    if (s.player.place === 'home') return 0;
    if (s.player.scene !== 'outdoor') this.exitPlace();
    const from = { x: s.player.x / TILE_PX, y: s.player.y / TILE_PX };
    const minutes = Math.max(3, Math.round(distanceTiles(from, doorTile('home')) * WALK_MIN_PER_TILE));
    this.advance(minutes);
    this.enterPlace('home');
    return minutes;
  }

  // ══ WEEK GOAL ════════════════════════════════════════════════════════════
  weekGoalId(): string | null {
    const f = this.state.world.flags.find(x => x.startsWith('goal:'));
    return f ? f.slice(5) : null;
  }
  /** Set this week's goal (from the Monday phone prompt). */
  setWeekGoal(id: string) {
    const def = getWeekGoal(id);
    if (!def) return;
    const s = this.state;
    s.goals.completed.push(...s.goals.active);
    s.goals.active = [def.target
      ? { id: def.id, kind: 'financial', name: def.name, target: def.target, saved: 0 }
      : { id: def.id, kind: 'personal', description: def.name, completed: false }];
    s.world.flags = s.world.flags.filter(f => !f.startsWith('goal:') && !f.startsWith('friends_base:'));
    s.world.flags.push(`goal:${id}`);
    if (id === 'friends') {
      const r = s.world.relationships;
      s.world.flags.push(`friends_base:${r.Jordan ?? 0}:${r.Riley ?? 0}`);
    }
    if (id === 'uni_social') {
      const r = s.world.relationships;
      s.world.flags.push(`friends_base:${r.Sam ?? 0}:${r.Mei ?? 0}`);
    }
    this.syncGoals();
    this.touch(true);
  }
  goalStatus(): GoalStatus | null {
    const id = this.weekGoalId();
    const def = id ? getWeekGoal(id) : undefined;
    if (!def) return null;
    const s = this.state, flags = s.world.flags;
    const cash = s.finance.accounts.cash, saved = s.finance.accounts.savings;
    const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
    switch (def.id) {
      case 'save_event': {
        const achieved = flags.includes('school_fair_attended');
        return { def, achieved, progress: achieved ? 1 : Math.min(1, saved / 10),
          detail: achieved ? 'Went to the fair' : `🐷 ${money(saved)} / $10 saved for Saturday` };
      }
      case 'arcade': {
        const achieved = flags.includes('arcade_visit');
        return { def, achieved, progress: achieved ? 1 : 0,
          detail: achieved ? 'Went to the arcade' : `Thursday after school · $8 · you have ${money(cash + saved)}` };
      }
      case 'buy_headphones': {
        // Progress = what's been put aside in the piggy bank, not what happens to be in your pocket.
        const achieved = flags.includes('bought_headphones');
        return { def, achieved, progress: achieved ? 1 : Math.min(1, saved / 15),
          detail: achieved ? 'Bought them!' : `🐷 ${money(Math.min(saved, 15))} / $15 saved · Mall` };
      }
      case 'friends': {
        // Judged on Sunday; until then it shows whether you're still on track.
        const base = flags.find(f => f.startsWith('friends_base:'))?.split(':').map(Number) ?? [0, 0, 0];
        const j = s.world.relationships.Jordan ?? 0, r = s.world.relationships.Riley ?? 0;
        const onTrack = j >= base[1] && r >= base[2] && !flags.includes('birthday_declined');
        const judged = !!this.pendingLevelSummary || this.runtime(this.rules.recap)?.state === 'completed';
        return { def, achieved: judged && onTrack, progress: onTrack ? (judged ? 1 : 0.5) : 0,
          detail: `${onTrack ? 'On track' : 'Someone feels let down'} · Jordan ❤${j} · Riley ❤${r}` };
      }
      // ── University ──
      case 'uni_buffer': {
        const achieved = saved >= 150;
        return { def, achieved, progress: Math.min(1, saved / 150),
          detail: achieved ? `${money(saved)} tucked away` : `🏦 ${money(saved)} / $150 in savings` };
      }
      case 'uni_job': {
        const achieved = flags.includes('wk_job_offer');
        const stage = achieved ? 1 : flags.includes('wk_trial_offered') ? 0.66 : flags.includes('wk_applied') ? 0.33 : 0;
        return { def, achieved, progress: stage,
          detail: achieved ? 'Hired at the Café!' : stage >= 0.66 ? 'Trial shift Friday at the Café' : stage > 0 ? 'Applied — interview Wednesday' : 'Job ads go up on Tuesday' };
      }
      case 'uni_ready': {
        const book = ['wk_textbook_new', 'wk_textbook_used', 'wk_textbook_library'].some(f => flags.includes(f));
        const achieved = book && flags.includes('wk_quiz_done');
        return { def, achieved, progress: achieved ? 1 : book ? 0.5 : 0,
          detail: achieved ? 'Quiz done, textbook sorted' : book ? "Textbook sorted · Friday's quiz to go" : 'Sort the textbook by Wednesday' };
      }
      case 'uni_social': {
        const base = flags.find(f => f.startsWith('friends_base:'))?.split(':').map(Number) ?? [0, 0, 0];
        const sam = s.world.relationships.Sam ?? 0, mei = s.world.relationships.Mei ?? 0;
        const club = flags.includes('wk_club_joined');
        const onTrack = sam >= base[1] && mei >= 1 && club;
        const judged = !!this.pendingLevelSummary || this.runtime(this.rules.recap)?.state === 'completed';
        const progress = (club ? 0.5 : 0) + (mei >= 1 ? 0.25 : 0) + (sam >= base[1] ? 0.25 : 0);
        return { def, achieved: judged && onTrack, progress: judged && onTrack ? 1 : Math.min(0.9, progress),
          detail: `${club ? 'In a club' : 'No club yet'} · Sam ❤${sam} · Mei ❤${mei}` };
      }
    }
    return null;
  }
  /** Mirror goal progress into GoalState, so the saved state and the phone agree. */
  private syncGoals() {
    const st = this.goalStatus();
    for (const g of this.state.goals.active) {
      if (!st || g.id !== st.def.id) continue;
      if (g.kind === 'financial') g.saved = Math.round(st.progress * g.target * 100) / 100;
      else g.completed = st.achieved;
    }
  }

  // ══ ACTIVITIES ═══════════════════════════════════════════════════════════
  /** Run a timed activity (class, chores, …) through ActivitySystem against the live game: it
   *  checks place/energy/money first, then moves the real clock, energy and ledger. */
  runActivity(def: ActivityDef): ActivityOutcome {
    const r = this.activities.execute(def);
    if (!r.success) return { ok: false, reason: r.reason, message: r.message, minutesAdvanced: 0, energyConsumed: 0, amountEarned: 0 };
    this.touch(true);
    return {
      ok: true, minutesAdvanced: r.timeAdvancedMinutes, energyConsumed: r.energyConsumed,
      amountEarned: r.transaction && r.transaction.amount > 0 ? r.transaction.amount : 0,
    };
  }
  /** Sit through a lesson. Attendance is recorded only if the lesson actually happened. */
  attendClass(): ActivityOutcome {
    const study = this.rules.study;
    if (!study) return { ok: false, reason: 'no_class', message: 'No classes on this path.', minutesAdvanced: 0, energyConsumed: 0, amountEarned: 0 };
    const out = this.runActivity({
      id: 'attend_class', name: `Attend ${study.noun}`, category: 'study',
      timeCostMinutes: study.minutes, energyCost: study.energy, requirement: { place: 'university' },
    });
    if (out.ok) this.markSchoolAttended();
    return out;
  }
  helpParents(): ActivityOutcome {
    return this.runActivity(HELP_PARENTS);
  }

  // ══ ACTIVITY STATE (Step 18) ═════════════════════════════════════════════
  /** The one public write path for `currentActivity` — a synchronized copy of whatever Core
   *  Simulation's ActivitySystem computed for a successful activity (see runActivity()). Mirrors consumeEnergy()/restoreEnergy()'s shape
   *  exactly: mutate the one authoritative field, notify subscribers, touch nothing else. */
  setCurrentActivity(tag: ActivityTag | null) {
    this.state.currentActivity = tag;
    this.touch();
  }

  /** This step: `s.paused` already existed and `tick()` already fully respected it ("if (s.paused ||
   *  s.sleeping) return;"), but nothing ever wrote to it — it was a dead field. That's what let the
   *  bus destination-picker race: opening it doesn't stop the clock, and `BUS_ROUTE.dwellMin` is only
   *  1 game-minute (== 1 real second at the default time scale), so simply reading the two-choice
   *  panel could run the clock past `departsAt` before the player picks a destination, making
   *  `boardBus()` correctly (per Step 16's own validate-first rule) refuse with "the bus has not
   *  arrived yet" — silently, with the panel just closing and no ride ever starting. Exposing the
   *  existing pause flag, rather than inventing a new one, lets page.tsx freeze the clock for exactly
   *  the span of that one time-sensitive menu without touching boardBus()/finishRide()/fare/energy at
   *  all. */
  setPaused(v: boolean) {
    this.state.paused = v;
    this.touch();
  }

  // ══ NOTICES ══════════════════════════════════════════════════════════════
  pushNotice(text: string) { this.noticeQueue.push(text); }
  takeNotices(): string[] { const n = this.noticeQueue; this.noticeQueue = []; return n; }

  // ══ DAILY MARKS ══════════════════════════════════════════════════════════
  /** Once-per-day facts ("helped Mum today") live in the saved GameState, so a page reload can't
   *  reset them the way the old React-state flags could. Cleared automatically after a day. */
  hasDoneToday(name: string) { return hasMark(this.state, name); }
  markDoneToday(name: string) {
    const key = markKey(name, parts(this.state.minutes).day);
    if (!this.state.world.dailyMarks.includes(key)) this.state.world.dailyMarks.push(key);
    this.touch(true);
  }

  // ══ SCHOOL DAY ═══════════════════════════════════════════════════════════
  /** What the Attend Class prompt should say right now, or null when school isn't relevant. */
  classStatus(): ClassStatus | null {
    const s = this.state, p = parts(s.minutes);
    const study = this.rules.study;
    if (!study || p.dayOfWeek > 4 || s.player.place !== 'university') return null;
    if (hasMark(s, 'at_school')) return 'done';
    if (p.minuteOfDay > study.lastStart) return 'too_late';
    if (s.player.scene !== 'interior_school_classroom') return 'go_to_classroom';
    return 'ready';
  }
  /** Arrived early? Sit down and wait for the 8:30 bell (the clock really moves). */
  waitForBell() {
    const p = parts(this.state.minutes), bell = this.rules.study?.bell;
    if (bell !== undefined && p.minuteOfDay < bell) this.advance(bell - p.minuteOfDay);
  }

  // ══ RELATIONSHIPS (Step 27) ══════════════════════════════════════════════
  /** Public write path for a relationship delta outside the mission-choice engine — e.g. an
   *  ad hoc Core-Sim activity (Help Parents) declined by the player. Mirrors the exact clamp
   *  logic `applyChoice()` already uses inline for `choice.relationship` (Math.max(-5, Math.min(5,
   *  cur + delta))) rather than introducing a second relationship rule — this is the same
   *  computation, just reachable from outside a MissionChoice. */
  adjustRelationship(npc: string, delta: number) {
    if (delta === 0) return;
    const s = this.state;
    const cur = s.world.relationships[npc] ?? 0;
    s.world.relationships[npc] = Math.max(-5, Math.min(5, cur + delta));
    this.touch();
  }

  // ══ SHOP INTERIORS (Phase 10) ═══════════════════════════════════════════════
  /** The product nearest the player right now, if close enough to interact with — real walk-up-and-
   *  interact shopping (Rule 27), not a dropdown. Null outside a shop interior or too far from any item. */
  nearbyShopItem(): (ShopItemDef & { affordable: boolean }) | null {
    const s = this.state;
    const interior = getInterior(s.player.scene);
    if (!interior?.shopItems) return null;
    const px = s.player.x / INTERIOR_TILE_PX, py = s.player.y / INTERIOR_TILE_PX;
    let best: ShopItemDef | null = null, bestD = 1.1; // interaction radius, in tiles
    for (const item of interior.shopItems) {
      const d = Math.hypot(item.tx - px, item.ty - py);
      if (d < bestD) { bestD = d; best = item; }
    }
    return best ? { ...best, affordable: this.canAfford(best.price) } : null;
  }
  /** Buy whatever's currently in reach. Money updates immediately (Rule 21); the game never picks
   *  for the player between e.g. the $3.50 and $6.00 milk (Rule 28). */
  buyNearbyShopItem(): { ok: boolean; reason?: string; item?: ShopItemDef } {
    const item = this.nearbyShopItem();
    if (!item) return { ok: false, reason: 'Nothing in reach.' };
    if (!item.affordable) return { ok: false, reason: "You can't afford that." };
    const s = this.state;
    // Step 28: if this item is the physical pickup for a grocery-list need this mission has already
    // covered, refuse the second pickup — the same physical item (e.g. the milk) can't be collected
    // twice. Only applies while an active awaitsPurchase step for this place has that need; ordinary
    // shopping (no active grocery-list mission here) is unaffected.
    for (const rt of s.missions) {
      if (rt.state !== 'active') continue;
      const def = this.def(rt.id)!;
      const step = def.steps[rt.stepIndex];
      if (!step?.awaitsPurchase || step.place !== s.player.place) continue;
      const log = this.missionPurchaseLog.get(rt.id) ?? [];
      const need = step.purchaseNeeds ?? [];
      const prefix = need.find(p => item.id.startsWith(p));
      if (prefix && log.some(b => b.id.startsWith(prefix))) {
        return { ok: false, reason: 'You already picked that up.' };
      }
    }
    const isFood = s.player.place === 'supermarket' || s.player.place === 'dairy';
    if (!this.spend(item.price, isFood ? 'food' : 'shopping', `${item.brand ? item.brand + ' ' : ''}${item.name}`, s.player.place ?? undefined)) {
      return { ok: false, reason: "You can't afford that." };
    }
    if (item.flag && !s.world.flags.includes(item.flag)) s.world.flags.push(item.flag);
    // Credit this purchase toward any active mission whose current step is a shopping list for
    // the place you're standing in (Phase: mission <-> real-purchase integration).
    for (const rt of s.missions) {
      if (rt.state !== 'active') continue;
      const def = this.def(rt.id)!;
      const step = def.steps[rt.stepIndex];
      if (step?.awaitsPurchase && step.place === s.player.place) {
        const log = this.missionPurchaseLog.get(rt.id) ?? [];
        log.push({ id: item.id, name: item.name, price: item.price });
        this.missionPurchaseLog.set(rt.id, log);
      }
    }
    this.evaluateAchievements();
    this.touch(true);
    return { ok: true, item };
  }

  /** For the HUD: the active shopping-list mission step for wherever the player currently is, plus
   *  which needs are already covered by real purchases — so the checklist reads off what actually
   *  happened, not a script. */
  shoppingProgress(): { def: MissionDef; need: string[]; covered: boolean[]; total: number } | null {
    const s = this.state;
    for (const rt of s.missions) {
      if (rt.state !== 'active') continue;
      const def = this.def(rt.id)!;
      const step = def.steps[rt.stepIndex];
      if (!step?.awaitsPurchase || step.place !== s.player.place) continue;
      const log = this.missionPurchaseLog.get(rt.id) ?? [];
      const need = step.purchaseNeeds ?? [];
      return {
        def,
        need,
        covered: need.map(prefix => log.some(b => b.id.startsWith(prefix))),
        total: log.reduce((sum, b) => sum + b.price, 0),
      };
    }
    return null;
  }

  /** Called when leaving a place: resolves any shopping-list mission step for it once every need
   *  has been covered by a real purchase, grading the outcome (under/on/over the reference budget)
   *  from what was actually bought — the game never picks the "correct" item for the player (Rule 28). */
  private evaluatePurchaseMission(placeId: PlaceId) {
    const s = this.state;
    for (const rt of s.missions) {
      if (rt.state !== 'active') continue;
      const def = this.def(rt.id)!;
      const step = def.steps[rt.stepIndex];
      if (!step?.awaitsPurchase || step.place !== placeId) continue;
      const log = this.missionPurchaseLog.get(rt.id) ?? [];
      const need = step.purchaseNeeds ?? [];
      if (!need.every(prefix => log.some(b => b.id.startsWith(prefix)))) continue; // still missing items — leave active
      const total = log.reduce((sum, b) => sum + b.price, 0);
      const budget = step.purchaseBudget ?? total;
      let outcome: string, relDelta: number, flag: string;
      if (total <= budget - 1) { outcome = 'under_budget'; relDelta = 2; flag = 'errand_under_budget'; }
      else if (total <= budget + 1) { outcome = 'on_budget'; relDelta = 1; flag = 'errand_on_budget'; }
      else { outcome = 'impulse_buy'; relDelta = 0; flag = 'errand_impulse_buy'; }
      if (!s.world.flags.includes('errand_completed')) s.world.flags.push('errand_completed');
      if (!s.world.flags.includes(flag)) s.world.flags.push(flag);
      if (step.speaker && relDelta) {
        const cur = s.world.relationships[step.speaker] ?? 0;
        s.world.relationships[step.speaker] = Math.max(-5, Math.min(5, cur + relDelta));
      }
      this.completeMission(rt, def, outcome);
      this.missionPurchaseLog.delete(rt.id);
    }
  }
  // ══ PLACES / SCENES ══════════════════════════════════════════════════════
  isOpenNow(placeId: string) { return isOpen(placeId, this.state.minutes); }
  closedMessage(placeId: string) { return closedReason(placeId, this.state.minutes); }

  /** Walk through a door. Position/direction/time/mission state are preserved for the way back out. */
  enterPlace(placeId: PlaceId): { ok: boolean; reason?: string } {
    const s = this.state;
    if (!this.isOpenNow(placeId)) return { ok: false, reason: this.closedMessage(placeId) };
    const place = getPlace(placeId);
    const door = tileToPx(doorTile(placeId));
    s.player.lastDoor = { placeId, x: s.player.x || door.x, y: s.player.y || door.y, facing: s.player.facing };
    s.player.place = placeId;
    const isGrocery = placeId === 'supermarket' || placeId === 'dairy';
    const dedicatedScene = PLACE_INTERIOR_SCENE[placeId] as SceneId | undefined;
    s.player.scene = place?.interior === 'home' ? 'interior_home'
      : place?.interior === 'school' ? 'interior_school_hall'
      : place?.interior === 'shop' ? (isGrocery ? 'interior_supermarket' : dedicatedScene ?? 'interior_shop')
      : 'outdoor';
    if (s.player.scene !== 'outdoor') this.warpToInteriorSpawn(s.player.scene);
    s.player.vx = s.player.vy = 0;
    this.emit({ type: 'entered_place', placeId });
    this.evaluateMissions(); // a mission waiting on "walk in here" starts the moment you do
    this.touch(true);
    return { ok: true };
  }

  /** Move to a different room inside the SAME building (e.g. school hallway -> classroom).
   *  Unlike enterPlace/exitPlace, this doesn't touch player.place/lastDoor — you're still "inside". */
  goToInteriorScene(sceneId: SceneId) {
    const s = this.state;
    s.player.scene = sceneId;
    this.warpToInteriorSpawn(sceneId);
    s.player.vx = s.player.vy = 0;
    this.touch(true);
  }

  private warpToInteriorSpawn(sceneId: SceneId) {
    const s = this.state;
    const interior = getInterior(sceneId);
    if (!interior) return;
    s.player.x = interior.spawn.x * INTERIOR_TILE_PX;
    s.player.y = interior.spawn.y * INTERIOR_TILE_PX;
    s.player.facing = -Math.PI / 2; // face up, into the room
  }

  /** Step back outside at the SAME door (never a random position), facing away from the building. */
  exitPlace() {
    const s = this.state, d = s.player.lastDoor;
    if (!d) return;
    const left = s.player.place;
    if (left) this.evaluatePurchaseMission(left);
    s.player.scene = 'outdoor';
    s.player.x = d.x; s.player.y = d.y + TILE_PX * 0.6; // one step below the door, on the sidewalk
    s.player.facing = Math.PI / 2;
    s.player.place = null;
    if (left) this.emit({ type: 'left_place', placeId: left });
    this.touch(true);
  }

  /** Open ground (the park) has no interior; the loop reports when the player crosses its edge. */
  setOutdoorZone(placeId: PlaceId | null) {
    const s = this.state;
    if (s.player.scene !== 'outdoor' || s.player.place === placeId) return;
    s.player.place = placeId;
    if (placeId) { this.emit({ type: 'entered_place', placeId }); this.evaluateMissions(); }
    this.touch();
  }

  // ══ NPCs ═════════════════════════════════════════════════════════════════
  private initNpcs(snap: boolean) {
    const s = this.state;
    for (const def of this.cast) {
      const placeId = npcPlaceAt(def, s.minutes);
      const t = tileToPx(this.npcSpot(def.id, placeId));
      const cur = s.npcs[def.id];
      if (!cur || snap) {
        s.npcs[def.id] = { id: def.id, x: t.x, y: t.y, place: placeId, targetX: t.x, targetY: t.y, facing: Math.PI / 2, moving: false, visible: this.npcOutside(def.id, placeId, false), path: [] };
      }
    }
  }
  /** slight per-NPC offset so nobody stacks on the same door tile */
  private npcSpot(npcId: string, placeId: string) {
    const d = doorTile(placeId);
    const i = this.cast.findIndex(n => n.id === npcId);
    return { x: d.x + ((i % 3) - 1) * 0.7, y: d.y + (placeId === 'park' ? (i % 2) * 1.2 : 0.2) };
  }
  private npcOutside(npcId: string, placeId: string, moving: boolean): boolean {
    const m = parts(this.state.minutes).minuteOfDay;
    if (moving) return !(m >= hm(23) || m < hm(5));
    if (placeId === 'park' || placeId === 'market') return m >= hm(6) && m < hm(22);
    if (placeId === 'university') return (m >= hm(7, 50) && m < hm(8, 30)) || (m >= hm(15, 30) && m < hm(16));
    return false; // inside a building
  }

  private updateNpcTargets() {
    const s = this.state;
    for (const def of this.cast) {
      const npc = s.npcs[def.id];
      const placeId = npcPlaceAt(def, s.minutes);
      if (placeId === npc.place) continue;
      npc.place = placeId;
      const to = tileToPx(this.npcSpot(def.id, placeId));
      npc.targetX = to.x; npc.targetY = to.y;
      const route = routeTiles({ x: npc.x / TILE_PX, y: npc.y / TILE_PX }, { x: to.x / TILE_PX, y: to.y / TILE_PX });
      npc.path = route.slice(1).map(t => ({ x: t.x * TILE_PX, y: t.y * TILE_PX }));
      npc.moving = npc.path.length > 0;
    }
  }

  private stepNpcs(gameMinutes: number) {
    const s = this.state;
    for (const def of this.cast) {
      const npc: NpcRuntime = s.npcs[def.id];
      if (npc.moving && npc.path.length) {
        let budget = def.speedTilesPerMin * gameMinutes * TILE_PX;
        while (budget > 0 && npc.path.length) {
          const wp = npc.path[0];
          const dx = wp.x - npc.x, dy = wp.y - npc.y, dist = Math.hypot(dx, dy);
          if (dist <= budget) { npc.x = wp.x; npc.y = wp.y; budget -= dist; npc.path.shift(); }
          else { npc.x += (dx / dist) * budget; npc.y += (dy / dist) * budget; npc.facing = Math.atan2(dy, dx); budget = 0; }
        }
        if (!npc.path.length) npc.moving = false;
      }
      npc.visible = this.npcOutside(def.id, npc.place, npc.moving);
    }
  }

  /** NPCs standing in the room the player is in, with where they stand (interior pixels). The
   *  renderer draws them here and proximity is measured from here, so what you see is what you can
   *  talk to. School NPCs are spread across rooms by npcRoomAt(). */
  interiorNpcs(): { npc: NpcRuntime; x: number; y: number }[] {
    const s = this.state, pl = s.player;
    const interior = getInterior(pl.scene);
    if (!interior || !pl.place) return [];
    const here = (Object.values(s.npcs) as NpcRuntime[]).filter(n => {
      if (n.place !== pl.place || n.moving) return false;
      const room = npcRoomAt(n.id, n.place, s.minutes);
      return !room || room === pl.scene;
    });
    const T = INTERIOR_TILE_PX;
    return here.map((npc, i) => {
      const tx = interior.widthTiles / 2 + (i - (here.length - 1) / 2) * 1.4;
      // Stand in the first clear spot down from the back wall — never inside (or hidden behind) a
      // desk or shelf, so the lecturer stands in front of their desk rather than behind it.
      let ty = Math.min(interior.heightTiles - 1.5, 1.4);
      for (const cand of [1.4, 2.6, 3.8, 5.0]) {
        if (cand > interior.heightTiles - 1) break;
        if (!interiorBlocked(interior, tx, cand) && !interiorBlocked(interior, tx, cand - 0.5)) { ty = cand; break; }
      }
      return { npc, x: tx * T, y: ty * T };
    });
  }

  /** The closest NPC in talking range: outdoors a visible NPC within ~1.4 tiles, indoors within ~1.8. */
  npcNearPlayer(): NpcRuntime | null {
    const s = this.state, pl = s.player;
    let best: NpcRuntime | null = null, bestD = Infinity;
    if (pl.scene === 'outdoor') {
      for (const npc of Object.values(s.npcs)) {
        const d = Math.hypot(npc.x - pl.x, npc.y - pl.y);
        if (npc.visible && d < TILE_PX * 1.4 && d < bestD) { best = npc; bestD = d; }
      }
    } else {
      for (const { npc, x, y } of this.interiorNpcs()) {
        const d = Math.hypot(x - pl.x, y - pl.y);
        if (d < INTERIOR_TILE_PX * 1.8 && d < bestD) { best = npc; bestD = d; }
      }
    }
    return best;
  }

  /** Is this NPC with the player right now (same room indoors, a few steps away outdoors)? */
  npcPresent(npcId: string): boolean {
    const s = this.state, pl = s.player;
    if (pl.scene === 'outdoor') {
      const npc = s.npcs[npcId];
      return !!npc && npc.visible && Math.hypot(npc.x - pl.x, npc.y - pl.y) < TILE_PX * 3;
    }
    return this.interiorNpcs().some(e => e.npc.id === npcId);
  }

  /** NPCs who have something to say to the player right now (a mission waiting on a chat with
   *  them). The renderer puts a speech bubble over their head so the player knows who to talk to. */
  npcsWantingToTalk(): Set<string> {
    const s = this.state, out = new Set<string>();
    for (const rt of s.missions) {
      const def = this.def(rt.id);
      if (!def) continue;
      if (rt.state === 'locked' && def.trigger.type === 'interaction' && !rt.triggered
        && missionWindowOpen(def, s.minutes) && (!def.requires || def.requires(s))) {
        out.add(def.trigger.npcId);
      }
      const step = def.steps[rt.stepIndex];
      if ((rt.state === 'active' || rt.state === 'available') && step?.withNpc && step.npcId) out.add(step.npcId);
    }
    return out;
  }

  talkTo(npcId: string) {
    this.emit({ type: 'talked_to', npcId });
    this.evaluateMissions();
    this.touch(true);
  }

  // ══ MISSIONS ═════════════════════════════════════════════════════════════
  runtime(id: string): MissionRuntime | undefined { return this.state.missions.find(m => m.id === id); }
  def(id: string) { return getDef(this.defs, id); }

  /** Missions the UI should show as "New" right now (consumes the queue).
   *
   * This-step fix: used to require the runtime to still be 'available' at the moment this drains —
   * that was safe back when nothing ever left 'available' on its own, but actionableStep() now
   * auto-starts a mission the instant it's reachable (see its own comment), so by the time the
   * animation-frame loop calls this (a separate tick from the render that may have just called
   * actionableStep()), the same mission can already legitimately be 'active'. The toast is "a new
   * mission just appeared," not "and is still literally unaccepted" — so only exclude an id that
   * reset all the way back to 'locked' or vanished (e.g. expired) before ever being read. */
  takeOffers(): MissionDef[] {
    const ids = [...new Set(this.offerQueue)]; this.offerQueue = [];
    return ids.map(id => this.def(id)!).filter(d => d && this.runtime(d.id) && this.runtime(d.id)!.state !== 'locked');
  }

  // ══ ACHIEVEMENTS ═════════════════════════════════════════════════════════
  /** Re-checks every achievement definition and unlocks any that are now newly true. Called after
   *  anything that could move the needle (a purchase, a mission finishing, a day/week ending) —
   *  each check is a cheap read of already-tracked state, so running it a few extra times costs
   *  nothing, but it never needs to run on every single game-minute tick either. */
  private evaluateAchievements() {
    const s = this.state;
    if (s.finance.debt.loans.some(l => l.principal > 0) && !s.world.flags.includes('ever_in_debt')) s.world.flags.push('ever_in_debt');
    for (const id of checkAchievements(s)) {
      s.world.flags.push(`ach:${id}`);
      const def = ACHIEVEMENTS.find(a => a.id === id)!;
      this.toastQueue.push({ id, name: def.name, emoji: def.emoji });
    }
  }

  /** Achievements unlocked since the UI last asked (consumes the queue, like takeOffers()). */
  takeAchievementToasts() {
    const t = this.toastQueue; this.toastQueue = [];
    return t;
  }

  // ══ LIFE EVENTS ══════════════════════════════════════════════════════════
  /** Resolve the currently-pending life event with the player's chosen option. */
  resolveLifeEvent(choiceId: string) {
    const s = this.state, pending = s.pendingLifeEvent;
    if (!pending) return;
    const def = LIFE_EVENTS.find(e => e.id === pending.id);
    const choice = def?.choices.find(c => c.id === choiceId);
    if (choice) {
      if (choice.amount < 0 && !this.spend(-choice.amount, 'life_event', def!.text.slice(0, 40))) {
        this.pushNotice("You can't afford that right now.");
        return;
      }
      if (choice.amount > 0) this.earn(choice.amount, 'life_event', def!.text.slice(0, 40));
      if (choice.relationship) {
        const cur = s.world.relationships[choice.relationship.npc] ?? 0;
        s.world.relationships[choice.relationship.npc] = Math.max(-5, Math.min(5, cur + choice.relationship.delta));
      }
    }
    s.pendingLifeEvent = undefined;
    this.touch(true);
  }

  startMission(id: string) {
    const rt = this.runtime(id);
    if (!rt || (rt.state !== 'available')) return;
    rt.state = 'active'; rt.startedAt = this.state.minutes; rt.stepIndex = 0;
    this.emit({ type: 'mission_started', missionId: id });
    this.touch(true);
  }

  currentStep(id: string) {
    const rt = this.runtime(id), def = this.def(id);
    return rt && def ? def.steps[rt.stepIndex] : undefined;
  }

  /** The step the player can act on right now, given where they are (or remote steps anywhere).
   *
   * This-step fix: an 'available' mission used to sit there forever in the live game — nothing in
   * page.tsx ever called startMission() (only test fixtures did), so every scheduled mission
   * (pocket_money, lunch_break, pickup_groceries, etc.) became available and then simply never
   * played out; only the Core-Sim adapter-driven activities (Attend Class/Help Parents), which
   * bypass this engine entirely, were ever actually reachable. 'available' remains a real, distinct
   * state (still what the mission-toast/Journal show) — but the instant its step is somewhere the
   * player can act on it (remote, or they're already standing at step.place, which is only possible
   * once the mission's own trigger — an interaction or a location — already fired), that itself
   * *is* the natural "accept" gesture: the player just walked up to the NPC or the place the mission
   * was waiting on. Auto-starting it here — one single call site, not a change to the trigger/window
   * logic in missions.ts — is what makes an NPC-triggered moment begin talking the instant the
   * player is in front of them, instead of requiring a separate, nonexistent "accept mission" UI. */
  actionableStep(mode: 'all' | 'inPerson' = 'all'): { def: MissionDef; rt: MissionRuntime; step: MissionStep } | null {
    const s = this.state;
    // Highest priority first, so e.g. a story beat beats a daily lunch prompt in the same room.
    const live = s.missions
      .filter(rt => rt.state === 'active' || rt.state === 'available')
      .sort((a, b) => (this.def(b.id)?.priority ?? 0) - (this.def(a.id)?.priority ?? 0));
    for (const rt of live) {
      const def = this.def(rt.id)!, step = this.stepFor(def, rt);
      if (!step || step.completeOnArrival || step.awaitsPurchase) continue;
      if (mode === 'inPerson' && step.remote) continue; // phone messages live in the Messages app
      const reachable = step.remote
        || (step.withNpc && step.npcId ? this.npcPresent(step.npcId) : s.player.place === step.place);
      if (reachable) {
        if (rt.state === 'available') this.startMission(rt.id);
        return { def, rt, step };
      }
    }
    return null;
  }

  /** Messages waiting for a reply on the phone (remote steps), highest priority first. */
  phoneInbox(): { def: MissionDef; rt: MissionRuntime; step: MissionStep }[] {
    const out: { def: MissionDef; rt: MissionRuntime; step: MissionStep }[] = [];
    for (const rt of this.state.missions) {
      if (rt.state !== 'active' && rt.state !== 'available') continue;
      const def = this.def(rt.id);
      const step = def && this.stepFor(def, rt);
      if (def && step?.remote && step.choices?.length) out.push({ def, rt, step });
    }
    return out.sort((a, b) => b.def.priority - a.def.priority);
  }
  /** Today's answered phone messages, newest first: who wrote, what they said, what you replied. */
  messageHistory(): { id: string; from: string; emoji: string; text: string; reply: string; result: string; at: number }[] {
    const s = this.state, today = parts(s.minutes).day;
    const out: { id: string; from: string; emoji: string; text: string; reply: string; result: string; at: number }[] = [];
    for (const rt of s.missions) {
      const def = this.def(rt.id);
      if (!def || rt.finishedAt === undefined || parts(rt.finishedAt).day !== today) continue;
      const step = def.steps.find(st => st.remote);
      if (!step) continue;
      const choice = step.choices?.find(c => c.id === rt.outcome) ?? def.steps.flatMap(st => st.choices ?? []).find(c => c.id === rt.outcome);
      out.push({
        id: def.id, from: step.speaker ?? def.name, emoji: def.emoji, text: step.lines[0] ?? def.journalText,
        reply: choice?.label ?? (rt.state === 'expired' ? 'No reply' : ''), result: choice?.consequence ?? (rt.state === 'expired' ? def.onExpire?.message ?? 'Missed.' : ''),
        at: rt.finishedAt,
      });
    }
    return out.sort((a, b) => b.at - a.at);
  }
  /** Cancel a subscription (removes the recurring charge). */
  cancelSubscription(id: string): boolean {
    const f = this.state.finance, before = f.expenses.recurring.length;
    f.expenses.recurring = f.expenses.recurring.filter(r => !(r.id === id && r.category === 'subscription'));
    if (f.expenses.recurring.length === before) return false;
    if (id === 'streambox' && !this.state.world.flags.includes('cancelled_streambox')) this.state.world.flags.push('cancelled_streambox');
    this.touch(true);
    return true;
  }

  /** Apply a dialogue choice. Returns false (changing nothing) if the player can't afford it. */
  applyChoice(missionId: string, choice: MissionChoice): boolean {
    const s = this.state;
    const rt = this.runtime(missionId), def = this.def(missionId);
    if (!rt || !def) return false;
    const step = this.stepFor(def, rt) ?? def.steps[rt.stepIndex];
    const label = choice.label.replace(/^\P{L}+/u, '').replace(/\s*\(.*\)$/, '') || def.name;
    const source = step?.npcId ?? step?.place;

    if (choice.cost < 0 && !this.spend(-choice.cost, choice.category ?? 'other', label, source)) {
      this.pushNotice("You can't afford that.");
      return false;
    }
    if (choice.cost > 0) this.earn(choice.cost, choice.category ?? 'income', label, source);

    // Step 22: Energy is a consequence of the choice, not a precondition — consumeEnergy() already
    // clamps at 0 and no-ops for amount <= 0, so a choice with no/zero energyCost, or one whose cost
    // exceeds current Energy, still applies normally with no new failure path.
    this.consumeEnergy(choice.energyCost ?? 0);
    this.restoreEnergy(choice.energyRestore ?? 0);
    if (choice.setsGoal) this.setWeekGoal(choice.setsGoal);
    if (choice.effect) this.applyEffect(choice.effect);

    for (const f of choice.flags ?? []) if (!s.world.flags.includes(f)) s.world.flags.push(f);
    if (choice.relationship && step.speaker) {
      const cur = s.world.relationships[step.speaker] ?? 0;
      s.world.relationships[step.speaker] = Math.max(-5, Math.min(5, cur + choice.relationship));
    }
    if (choice.social) s.today.socialActivities += 1;
    rt.outcome = choice.id;

    // Started in time = can't expire underneath you: a 3-hour trial shift begun at 1:20 must not be
    // marked "missed" at 3:30 halfway through it. Leave a little time for a follow-up step, too.
    if (choice.minutes > 0 && rt.expiresAt !== undefined) {
      const busyUntil = s.minutes + choice.minutes + (choice.finish ? 1 : 30);
      if (rt.expiresAt < busyUntil) rt.expiresAt = busyUntil;
    }
    if (choice.minutes > 0) this.advance(choice.minutes);

    if (choice.finish) this.completeMission(rt, def, choice.id);
    else { rt.stepIndex = Math.min(rt.stepIndex + 1, def.steps.length - 1); this.touch(true); }
    this.syncGoals();
    return true;
  }

  completeMission(rt: MissionRuntime, def: MissionDef, outcome: string) {
    if (rt.state === 'completed') return;
    const s = this.state;
    rt.state = 'completed'; rt.finishedAt = s.minutes; rt.outcome = outcome;
    s.xp += def.rewards.xp;
    if (def.rewards.money) this.earn(def.rewards.money, 'mission_reward', def.name, def.id);
    if (def.rewards.flag && !s.world.flags.includes(def.rewards.flag)) s.world.flags.push(def.rewards.flag);
    s.today.missionsCompleted.push(def.id);
    this.emit({ type: 'mission_completed', missionId: def.id });

    // "Make It to Friday" story hooks — real numbers, not scripted ones.
    if (def.id === this.rules.weekStart) {
      // A new week: last week's story flags and goal no longer count.
      s.world.flags = s.world.flags.filter(f => f === 'got_pocket_money' || f === 'week_started' || f === 'pocket_money_done'
        || !WEEK_FLAG_PREFIXES.some(p => f.startsWith(p)));
      if (!s.world.flags.includes('pocket_money_done')) s.world.flags.push('pocket_money_done');
      this.weekStartBalance = s.finance.accounts.cash;
      // survives a reload mid-week, since the instance field above doesn't persist with the save
      s.world.flags = s.world.flags.filter(f => !f.startsWith('wk_start_balance:'));
      s.world.flags.push(`wk_start_balance:${s.finance.accounts.cash}`);
    }
    if (def.id === this.rules.recap) {
      this.buildLevelSummary(s);
      if (this.pendingLevelSummary?.goal?.achieved && !s.world.flags.includes('week_goal_met')) s.world.flags.push('week_goal_met');
    }

    // story triggers: anything waiting on this mission can now open
    this.evaluateMissions();
    this.evaluateAchievements();
    this.touch(true);
  }

  private buildLevelSummary(s: GameState) {
    if (this.weekStartBalance === 0) {
      const flag = s.world.flags.find(f => f.startsWith('wk_start_balance:'));
      if (flag) this.weekStartBalance = Number(flag.split(':')[1]) || 0;
    }
    const daysAttended = s.weekDays.filter(d => d.schoolAttended).length + (s.today.schoolAttended ? 1 : 0);
    const daysTotal = s.weekDays.filter(d => d.schoolAttended !== null).length + (s.today.schoolAttended !== null ? 1 : 0);
    const birthdayOutcome: LevelSummary['birthdayOutcome'] =
      s.world.flags.includes('birthday_contributed') ? 'full'
      : s.world.flags.includes('birthday_partial') ? 'partial'
      : 'declined';
    const unexpectedOutcome: LevelSummary['unexpectedOutcome'] =
      s.world.flags.includes('unexpected_paid') ? 'paid'
      : s.world.flags.includes('unexpected_walked') ? 'walked'
      : 'none';
    this.pendingLevelSummary = {
      startBalance: this.weekStartBalance,
      endBalance: s.finance.accounts.cash,
      daysAttended, daysTotal,
      schoolProjectDone: s.world.flags.includes('school_project_done'),
      birthdayOutcome, unexpectedOutcome,
      wentToArcade: s.world.flags.includes('arcade_visit'),
      goal: (() => {
        const g = this.goalStatus();
        return g ? { id: g.def.id, emoji: g.def.emoji, name: g.def.name, achieved: g.achieved, detail: g.detail } : null;
      })(),
      unexpectedKind: this.runtime('unexpected_event')?.state === 'completed' ? 'bus'
        : this.runtime('unexpected_shoe')?.state === 'completed' ? 'shoe' : null,
      fairAttended: s.world.flags.includes('school_fair_attended'),
      dairyShift: s.world.flags.includes('dairy_shift_done'),
      savings: s.finance.accounts.savings,
      earned: [...s.weekDays, s.today].reduce((n, d) => n + d.earned, 0),
      spent: [...s.weekDays, s.today].reduce((n, d) => n + d.spent, 0),
      busRides: [...s.weekDays, s.today].reduce((n, d) => n + d.travel.filter(t => t === 'bus').length, 0),
      busSpent: this.transactionsSince(at(parts(s.minutes).day - parts(s.minutes).dayOfWeek, 0, 0))
        .filter(t => t.category === 'transport' && t.amount < 0).reduce((sum, t) => sum - t.amount, 0),
      path: s.lifePath,
      highlights: s.lifePath === 'university' ? this.universityHighlights(daysAttended, daysTotal) : [],
    };
  }

  /** The University week's story, read back off what actually happened. */
  private universityHighlights(daysAttended: number, daysTotal: number): RecapLine[] {
    const f = this.state.world.flags, has = (x: string) => f.includes(x);
    const out: RecapLine[] = [];
    const line = (icon: string, text: string, tone: RecapLine['tone']) => out.push({ icon, text, tone });
    if (has('wk_rent_paid')) line('🏠', 'Paid the $200 rent on time', 'good');
    else if (has('wk_rent_rest_paid')) line('🏠', 'Paid rent in two halves — sorted by Friday', 'neutral');
    else line('🏠', "Rent wasn't paid in full — Sam had to cover you", 'bad');
    line('🎓', `Lectures: ${daysAttended}/${Math.max(daysTotal, 5)} attended`, daysAttended >= 4 ? 'good' : daysAttended >= 2 ? 'neutral' : 'bad');
    if (has('wk_textbook_used')) line('📕', 'Second-hand textbook for $45 (saved $75)', 'good');
    else if (has('wk_textbook_library')) line('📕', 'Used the library copy — free', 'good');
    else if (has('wk_textbook_new')) line('📕', 'Bought the textbook new for $120', 'neutral');
    else line('📕', 'Never got the textbook', 'bad');
    if (didWeeklyShop(this.state)) line('🛒', 'Did a proper weekly shop', 'good');
    else line('🛒', 'Skipped the weekly shop — lived on takeaways and noodles', 'bad');
    if (has('wk_job_offer')) {
      line('💼', 'Landed the part-time job at the Café', 'good');
      if (has('wk_taxcode_msl')) line('🧾', 'Picked the right tax code (M SL)', 'good');
      else if (has('wk_taxcode_nd')) line('🧾', 'No tax code given — 45% taken in tax until it\'s fixed', 'bad');
      else if (has('wk_taxcode_m')) line('🧾', 'Picked M instead of M SL — you may owe student loan later', 'bad');
    } else if (has('wk_applied')) line('💼', "Applied for the Café job, but it didn't work out", 'neutral');
    else line('💼', "Didn't look for work this week", 'neutral');
    if (has('wk_club_tramping')) line('🥾', 'Joined the Tramping Club', 'good');
    else if (has('wk_club_boardgames')) line('🎲', 'Joined the Board Games Club', 'good');
    if (has('wk_power_owed')) line('⚡', 'Still owe the flat $45 for power', 'bad');
    else if (has('wk_power_paid')) line('⚡', has('wk_sky_yes') ? 'Paid your power share — and split Sky Sport ($8/month)' : 'Paid your $45 power share', has('wk_sky_yes') ? 'neutral' : 'good');
    if (has('wk_charger_official')) line('🔌', 'Bought the official charger ($89)', 'neutral');
    else if (has('wk_charger_generic')) line('🔌', 'Generic charger for $25 and borrowed Mei\'s meanwhile', 'good');
    else if (has('wk_charger_library')) line('🔌', 'Used the library computers instead of buying a charger', 'good');
    if (has('wk_quiz_done')) line('💻', 'Handed in the ECON101 quiz', 'good');
    else line('💻', 'Missed the ECON101 quiz', 'bad');
    if (has('wk_raglan')) line('🏖️', 'Raglan beach day with the flat', 'good');
    return out;
  }

  dismissLevelSummary() { this.pendingLevelSummary = null; this.touch(true); }

  private onMissionExpired(def: MissionDef, rt: MissionRuntime) {
    const s = this.state;
    s.today.missionsMissed.push(def.id);
    const ex = def.onExpire;
    if (ex) {
      for (const f of ex.flags ?? []) if (!s.world.flags.includes(f)) s.world.flags.push(f);
      if (ex.relationship) {
        const cur = s.world.relationships[ex.relationship.npc] ?? 0;
        s.world.relationships[ex.relationship.npc] = Math.max(-5, Math.min(5, cur + ex.relationship.delta));
      }
      if (def.id === 'get_to_school') s.today.lateToSchool = true;
      if (ex.fine && !this.spend(ex.fine, 'fee', `${def.name} fine`, def.id)) {
        const owed = s.finance.debt.loans.find(l => l.id === 'arrears');
        if (owed) owed.principal += ex.fine;
        else s.finance.debt.loans.push({ id: 'arrears', kind: 'other', principal: ex.fine, apr: 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: s.minutes + 30 * MIN_PER_DAY });
      }
      if (!s.sleeping) this.pushNotice(ex.message);
    }
  }

  // ══ SCHOOL ═══════════════════════════════════════════════════════════════
  /** The one write path for "attended school today": called by attendClass() only after the lesson
   *  actually happened (never on merely walking in). */
  markSchoolAttended() {
    const s = this.state, p = parts(s.minutes);
    if (!this.rules.study) return;
    const key = markKey('at_school', p.day);
    if (!s.world.dailyMarks.includes(key)) {
      s.world.dailyMarks.push(key);
      s.today.schoolAttended = true;
      this.emit({ type: 'school_attended', day: p.day });
      this.evaluateMissions(); // anything waiting on "attended today" can open right now
      this.touch(true);
    }
  }

  // ══ TRAVEL ═══════════════════════════════════════════════════════════════
  travelTo(mode: 'walk' | 'bike') { /* movement itself is real-time; this just records the choice */
    this.state.today.travel.push(mode);
  }

  busHere(): { stopId: string } | null {
    const s = this.state;
    if (s.player.scene !== 'outdoor') return null;
    for (const stop of Object.values(BUS_STOPS)) {
      const t = tileToPx(stop.tile);
      if (Math.hypot(t.x - s.player.x, t.y - s.player.y) < TILE_PX * 2 && busAtStop(stop.id, s.minutes)) return { stopId: stop.id };
    }
    return null;
  }

  playerNearBusStop(): string | null {
    const s = this.state;
    for (const stop of Object.values(BUS_STOPS)) {
      const t = tileToPx(stop.tile);
      if (Math.hypot(t.x - s.player.x, t.y - s.player.y) < TILE_PX * 2) return stop.id;
    }
    return null;
  }

  /** Flat energy cost of boarding a bus (a low-effort trip compared with class at 15 or chores at 5). */
  private static readonly BUS_BOARD_ENERGY_COST = 1;

  /** Board the bus at `fromStop` and ride to `toStop`. The clock runs through the trip.
   *
   * Step 16: validates BOTH the fare and the energy cost before any mutation, so a failure on
   * either leaves money, energy, ledger, player location, and any existing `s.ride` completely
   * untouched — same "validate everything first, mutate only after every check passes" rule
   * `ActivitySystem.canExecute()`/`execute()` already use, applied here without routing through
   * ActivitySystem itself (this is real, asynchronous, variable-fare/duration live travel — see the
   * Step 16 audit for why `TAKE_BUS`/`ActivitySystem` don't fit it). */
  boardBus(fromStop: string, toStop: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const bus = busAtStop(fromStop, s.minutes);
    if (!bus) return { ok: false, reason: 'The bus has not arrived yet.' };
    const pass = s.world.busPass && s.world.busPass.validUntil > s.minutes;
    const fare = pass ? 0 : BUS_ROUTE.fare;
    if (!this.canAfford(fare)) return { ok: false, reason: `You need $${fare.toFixed(2)} for the fare.` };
    const energyCost = GameStore.BUS_BOARD_ENERGY_COST;
    if (s.energy.current < energyCost) {
      return { ok: false, reason: `You're too tired to catch the bus right now.` };
    }
    if (fare > 0) this.spend(fare, 'transport', 'Bus fare', BUS_ROUTE.id);
    this.consumeEnergy(energyCost);
    const ride = rideMinutes(fromStop, toStop);
    s.ride = { fromStop, toStop, startedAt: s.minutes, endsAt: s.minutes + Math.max(2, ride), fare };
    s.player.scene = 'bus'; s.player.status = 'on_bus'; s.player.place = null;
    s.today.travel.push('bus');
    this.emit({ type: 'bus_departed', stopId: fromStop, routeId: BUS_ROUTE.id, minutes: s.minutes });
    this.touch(true);
    return { ok: true };
  }

  private finishRide() {
    const s = this.state;
    if (!s.ride) return;
    const stop = stopById(s.ride.toStop);
    const px = tileToPx(stop.tile);
    s.player.scene = 'outdoor'; s.player.status = 'idle';
    s.player.x = px.x; s.player.y = px.y + TILE_PX * 0.3; s.player.facing = Math.PI / 2;
    s.ride = null;
    this.emit({ type: 'bus_arrived', stopId: stop.id, routeId: BUS_ROUTE.id, minutes: s.minutes });
    this.touch(true);
  }

  // ══ DAY / WEEK ═══════════════════════════════════════════════════════════
  /** Go to bed. Clock runs to the morning through the normal minute loop (missions expire, NPCs go home). */
  sleep(passedOut = false) {
    const s = this.state;
    if (s.sleeping) return;
    const p = parts(s.minutes);
    s.today.bedtimeMinuteOfDay = passedOut ? PASS_OUT_AT : p.minuteOfDay;
    s.today.endBalance = s.finance.accounts.cash;
    if (this.rules.study && p.dayOfWeek < 5 && s.today.schoolAttended === null) s.today.schoolAttended = false;
    const record: DayRecord = { ...s.today, missionsCompleted: [...s.today.missionsCompleted], missionsMissed: [...s.today.missionsMissed], travel: [...s.today.travel] };
    s.weekDays.push(record);
    this.emit({ type: 'day_end', day: record.day, minutes: s.minutes });

    // fast-forward to 7:00 AM through the same minute loop
    const wake = p.minuteOfDay < WAKE_AT ? at(p.day, 0, WAKE_AT) : at(p.day + 1, 0, WAKE_AT);
    s.sleeping = true;
    this.advance(wake - s.minutes);
    s.sleeping = false;

    // wake up at home
    const home = tileToPx(doorTile('home'));
    s.player.scene = 'interior_home'; s.player.place = 'home'; s.player.status = 'idle';
    s.player.lastDoor = { placeId: 'home', x: home.x, y: home.y, facing: Math.PI / 2 };
    this.initNpcs(true);

    // Step 6: sleep always fast-forwards to a full night at WAKE_AT (see the advance() call
    // above), matching the Core Simulation's own EnergyState.recoveryPerHourAsleep default
    // ("full recovery over an 8-hour sleep") — so a full restore on waking is the correct
    // behavior here, not an arbitrary shortcut. restoreEnergy() itself clamps at max.
    this.restoreEnergy(s.energy.max);

    const newP = parts(s.minutes);
    if (newP.dayOfWeek === 0 && s.weekDays.length >= 1) this.finalizeWeek();
    s.today = emptyDay(newP.day, s.finance.accounts.cash);
    this.pendingDaySummary = record;
    this.emit({ type: 'day_start', day: newP.day, minutes: s.minutes });
    this.evaluateMissions();
    this.evaluateAchievements();
    this.touch(true);
  }

  private finalizeWeek() {
    const s = this.state, days = s.weekDays.splice(0);
    const schoolDays = days.filter(d => d.schoolAttended !== null);
    const week: WeekRecord = {
      week: parts(s.minutes).week - 1,
      income: days.reduce((a, d) => a + d.earned, 0),
      spending: days.reduce((a, d) => a + d.spent, 0),
      savings: s.finance.accounts.savings,
      missionsCompleted: days.reduce((a, d) => a + d.missionsCompleted.length, 0),
      socialActivities: days.reduce((a, d) => a + d.socialActivities, 0),
      schoolDaysAttended: schoolDays.filter(d => d.schoolAttended).length,
      schoolDaysTotal: schoolDays.length,
      majorDecisions: s.world.flags.filter(f => ['errand_impulse_buy', 'errand_under_budget', 'arcade_visit', 'park_alternative', 'ate_home_lunch', 'bought_canteen'].includes(f)),
      goalsProgress: s.goals.active.flatMap(g => g.kind === 'financial'
        ? [{ id: g.id, name: g.name, pct: Math.min(100, Math.round((g.saved / Math.max(1, g.target)) * 100)) }]
        : [{ id: g.id, name: g.description, pct: g.completed ? 100 : 0 }]),
      days,
    };
    s.weeks.push(week);
    this.pendingWeekSummary = week;
    this.emit({ type: 'week_end', week: week.week, minutes: s.minutes });
  }

  dismissDaySummary() { this.pendingDaySummary = null; this.touch(true); }
  dismissWeekSummary() { this.pendingWeekSummary = null; this.touch(true); }

  // ══ PERSISTENCE ══════════════════════════════════════════════════════════
  serialize(): string { return JSON.stringify(this.state); }
  static hydrate(json: string): GameStore | null {
    try {
      const st = migrateSave(JSON.parse(json));
      return st ? new GameStore(st) : null;
    } catch { return null; }
  }
}
