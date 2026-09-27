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
import type { FinancialState } from './financeTypes';
import {
  Emit, MissionChoice, MissionDef, getDef, initialMissionRuntime, markKey, hasMark,
  missionDefs, missionsOnDayStart, missionsOnEvent, missionsOnMinute,
} from './missions';
import type {
  ActivityTag, DayRecord, GameEvent, GameState, LedgerEntry, MissionRuntime, NpcRuntime, PlaceId, SceneId, WeekRecord,
} from './types';
import { ACHIEVEMENTS, checkAchievements } from './achievements';
import { LIFE_EVENTS, rollLifeEvent } from './lifeEvents';
import {
  BIKE_MIN_PER_TILE, BUS_ROUTE, BUS_STOPS, NPCS, TILE_PX, WALK_MIN_PER_TILE, busAtStop,
  doorTile, getPlace, isOpen, closedReason, npcPlaceAt, rideMinutes, routeTiles, stopById, tileToPx,
  getInterior, INTERIOR_TILE_PX, PLACE_INTERIOR_SCENE,
} from './world';
import type { ShopItemDef } from './world';

export const BASE_MINUTES_PER_SECOND = TIME_SCALE;
const RIDE_REAL_SECONDS = 6;          // a bus trip plays out over ~6 real seconds
const SCHOOL_START = hm(8, 30);
const SCHOOL_END = hm(15, 30);
const PASS_OUT_AT = hm(2, 0);         // stay up past 2 AM and you fall asleep where you are
const WAKE_AT = hm(7, 0);

const emptyDay = (day: number, balance: number): DayRecord => ({
  day, startBalance: balance, endBalance: balance, spent: 0, earned: 0, schoolAttended: null,
  missionsCompleted: [], missionsMissed: [], socialActivities: 0, travel: [], lateToSchool: false, bedtimeMinuteOfDay: null,
});

export function createInitialState(lifePath: GameState['lifePath'], finance: FinancialState): GameState {
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
    version: 2, minutes: start, paused: false, timeMultiplier: 1,
    player: { x: spawnPx.x, y: spawnPx.y, vx: 0, vy: 0, facing: Math.PI / 2, scene: 'interior_home', place: 'home', status: 'idle', lastDoor: { placeId: 'home', x: home.x, y: home.y, facing: Math.PI / 2 } },
    finance,
    // Step 6: matches the Core Simulation's own School-campaign default (createInitialGameState.ts).
    energy: { current: 100, max: 100 },
    world: { flags: [], relationships: { Mum: 3, Jordan: 2, Riley: 1 }, dailyMarks: [], busPass: null, hasBike: false },
    missions: initialMissionRuntime(defs),
    npcs: {},
    ledger: [],
    today: emptyDay(0, finance.balance),
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
}

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

  constructor(state: GameState) {
    this.state = state;
    // Step 6: self-heal saves made before Energy existed as a GameState field — old saves
    // (version 2, pre-Energy) simply won't have this key.
    if (!state.energy) state.energy = { current: 100, max: 100 };
    // Step 18: self-heal saves made before currentActivity existed — same pattern as Energy above.
    if (state.currentActivity === undefined) state.currentActivity = null;
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
      s.world.dailyMarks = s.world.dailyMarks.filter(m => Number(m.split(':')[1]) >= p.day - 1);
      missionsOnDayStart(s, this.defs, p.day);
      // one small optional life event may land today, on top of the scripted mission schedule
      if (!s.pendingLifeEvent) {
        const ev = rollLifeEvent(s);
        if (ev) { s.pendingLifeEvent = { id: ev.id, emoji: ev.emoji, text: ev.text, choiceIds: ev.choices.map(c => c.id) }; this.emit({ type: 'life_event', id: ev.id }); }
      }
    }

    // school ends: anyone who never arrived is marked absent
    if (s.lifePath === 'school' && p.dayOfWeek < 5 && p.minuteOfDay === SCHOOL_END && s.today.schoolAttended === null) {
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

  // ══ ECONOMY (ported from your processTimeEvents, now driven by the same clock) ═══════
  private economyOnMinute(p: ReturnType<typeof parts>) {
    const s = this.state, f = s.finance;
    if (p.minuteOfDay !== hm(9)) return;
    // Thursday payday
    if (p.dayOfWeek === 3 && f.job && f.job.id !== 'allowance') {
      const pay = f.job.payPerHour * f.job.hoursPerWeek;
      this.earn(pay, 'income', `${f.job.name} pay`);
    }
    // Monday rent
    if (p.dayOfWeek === 0 && f.rentAmount > 0 && p.day > 0) {
      if (f.balance >= f.rentAmount) this.spend(f.rentAmount, 'rent', 'Rent');
      else { f.debt += f.rentAmount; }
    }
    f.rentDueInDays = f.rentAmount > 0 ? (7 - p.dayOfWeek) % 7 || 7 : 999;
  }

  // ══ MONEY ════════════════════════════════════════════════════════════════
  spend(amount: number, category: string, label: string) {
    if (amount <= 0) return;
    const s = this.state;
    s.finance.balance -= amount; s.finance.totalSpent += amount;
    s.today.spent += amount;
    this.pushLedger({ minutes: s.minutes, amount: -amount, category, label });
    this.emit({ type: 'purchase', amount, category, label });
  }
  earn(amount: number, category: string, label: string) {
    if (amount <= 0) return;
    const s = this.state;
    s.finance.balance += amount; s.finance.totalEarned += amount;
    s.today.earned += amount;
    this.pushLedger({ minutes: s.minutes, amount, category, label });
  }
  private pushLedger(e: LedgerEntry) { this.state.ledger.push(e); if (this.state.ledger.length > 400) this.state.ledger.shift(); }

  // ══ ENERGY (Step 6) ═══════════════════════════════════════════════════════
  /** Read-only snapshot — callers get the current {current,max}, never a mutable reference they
   *  could edit outside these methods. */
  getEnergy(): { current: number; max: number } { return { ...this.state.energy }; }
  /** Mirrors spend()'s shape exactly (mutate the one authoritative field + touch()) — the same
   *  pattern every other live resource in GameStore already uses. Clamped at 0 rather than
   *  throwing: unlike FinanceSystem/EnergySystem (Core Simulation), which reject an over-budget
   *  call outright, the live game's own spend()/earn() never guarded against going out of range
   *  either — callers (the adapter) are expected to have already validated the amount via
   *  ActivitySystem.canExecute() before this is ever called. */
  consumeEnergy(amount: number) {
    if (amount <= 0) return;
    const s = this.state;
    s.energy.current = Math.max(0, s.energy.current - amount);
    this.touch();
  }
  restoreEnergy(amount: number) {
    if (amount <= 0) return;
    const s = this.state;
    s.energy.current = Math.min(s.energy.max, s.energy.current + amount);
    this.touch();
  }

  // ══ ACTIVITY STATE (Step 18) ═════════════════════════════════════════════
  /** The one public write path for `currentActivity` — a synchronized copy of whatever Core
   *  Simulation's ActivitySystem computed for a successful adapter-driven activity (see
   *  src/game/integration/mondayAdapter.ts). Mirrors consumeEnergy()/restoreEnergy()'s shape
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
    return best ? { ...best, affordable: this.state.finance.balance >= best.price } : null;
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
    this.spend(item.price, 'shop', `${item.brand ? item.brand + ' ' : ''}${item.name}`);
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
  /** legacy panels (bank, shops) that mutate finance directly can call this to keep the ledger/day record honest */
  recordFinanceDelta(before: FinancialState, label = 'Purchase') {
    const d = this.state.finance.balance - before.balance;
    if (d < 0) { this.state.today.spent += -d; this.pushLedger({ minutes: this.state.minutes, amount: d, category: 'shop', label }); }
    if (d > 0) { this.state.today.earned += d; this.pushLedger({ minutes: this.state.minutes, amount: d, category: 'income', label }); }
    this.touch(true);
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
    if (placeId) this.emit({ type: 'entered_place', placeId });
    s.player.place = placeId;
    this.touch();
  }

  // ══ NPCs ═════════════════════════════════════════════════════════════════
  private initNpcs(snap: boolean) {
    const s = this.state;
    for (const def of NPCS) {
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
    const i = NPCS.findIndex(n => n.id === npcId);
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
    for (const def of NPCS) {
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
    for (const def of NPCS) {
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

  /** NPC the player can talk to right now: outdoors near a visible NPC, or in the interior where the NPC is. */
  npcNearPlayer(): NpcRuntime | null {
    const s = this.state, pl = s.player;
    for (const npc of Object.values(s.npcs)) {
      if (pl.scene === 'outdoor') {
        if (npc.visible && Math.hypot(npc.x - pl.x, npc.y - pl.y) < TILE_PX * 1.4) return npc;
      } else if (pl.place && npc.place === pl.place && !npc.moving) {
        return npc;
      }
    }
    return null;
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
    if (s.finance.debt > 0 && !s.world.flags.includes('ever_in_debt')) s.world.flags.push('ever_in_debt');
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
      if (choice.amount < 0) this.spend(-choice.amount, 'life_event', def!.text.slice(0, 30));
      else if (choice.amount > 0) this.earn(choice.amount, 'life_event', def!.text.slice(0, 30));
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
  actionableStep(): { def: MissionDef; rt: MissionRuntime; step: NonNullable<ReturnType<GameStore['currentStep']>> } | null {
    const s = this.state;
    for (const rt of s.missions) {
      if (rt.state !== 'active' && rt.state !== 'available') continue;
      const def = this.def(rt.id)!, step = def.steps[rt.stepIndex];
      if (!step || step.completeOnArrival || step.awaitsPurchase) continue;
      if (step.remote || s.player.place === step.place) {
        if (rt.state === 'available') this.startMission(rt.id);
        return { def, rt, step };
      }
    }
    return null;
  }

  applyChoice(missionId: string, choice: MissionChoice) {
    const s = this.state;
    const rt = this.runtime(missionId), def = this.def(missionId);
    if (!rt || !def) return;
    const step = def.steps[rt.stepIndex];

    if (choice.cost < 0) this.spend(-choice.cost, 'mission', choice.label);
    else if (choice.cost > 0) this.earn(choice.cost, 'mission', choice.label);

    // Step 22: Energy is a consequence of the choice, not a precondition — consumeEnergy() already
    // clamps at 0 and no-ops for amount <= 0, so a choice with no/zero energyCost, or one whose cost
    // exceeds current Energy, still applies normally with no new failure path.
    this.consumeEnergy(choice.energyCost ?? 0);

    for (const f of choice.flags ?? []) if (!s.world.flags.includes(f)) s.world.flags.push(f);
    if (choice.relationship && step.speaker) {
      const cur = s.world.relationships[step.speaker] ?? 0;
      s.world.relationships[step.speaker] = Math.max(-5, Math.min(5, cur + choice.relationship));
    }
    if (choice.social) s.today.socialActivities += 1;
    rt.outcome = choice.id;

    if (choice.minutes > 0) this.advance(choice.minutes);

    if (choice.finish) this.completeMission(rt, def, choice.id);
    else { rt.stepIndex = Math.min(rt.stepIndex + 1, def.steps.length - 1); this.touch(true); }
  }

  completeMission(rt: MissionRuntime, def: MissionDef, outcome: string) {
    if (rt.state === 'completed') return;
    const s = this.state;
    rt.state = 'completed'; rt.finishedAt = s.minutes; rt.outcome = outcome;
    s.xp += def.rewards.xp;
    if (def.rewards.money) this.earn(def.rewards.money, 'reward', def.name);
    if (def.rewards.flag && !s.world.flags.includes(def.rewards.flag)) s.world.flags.push(def.rewards.flag);
    s.today.missionsCompleted.push(def.id);
    this.emit({ type: 'mission_completed', missionId: def.id });

    // "Make It to Friday" story hooks — real numbers, not scripted ones.
    if (def.id === 'pocket_money') {
      this.weekStartBalance = s.finance.balance;
      // survives a reload mid-week, since the instance field above doesn't persist with the save
      s.world.flags = s.world.flags.filter(f => !f.startsWith('wk_start_balance:'));
      s.world.flags.push(`wk_start_balance:${s.finance.balance}`);
    }
    if (def.id === 'friday_recap') this.buildLevelSummary(s);

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
      endBalance: s.finance.balance,
      daysAttended, daysTotal,
      schoolProjectDone: s.world.flags.includes('school_project_done'),
      birthdayOutcome, unexpectedOutcome,
      wentToArcade: s.world.flags.includes('arcade_visit'),
    };
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
    }
  }

  // ══ SCHOOL ═══════════════════════════════════════════════════════════════
  /** LEGACY / currently unused: this was written to be called on ENTERING the school building.
   *  It is never called from anywhere in the codebase today (confirmed by the Step 11 audit) — kept
   *  as-is rather than deleted, since deleting it isn't proven safer than leaving it dormant, and it
   *  still models a coherent (if currently unused) "arrival" notion of attendance. It is NOT the
   *  write path for attendance going forward: Step 12's design decision is that "attended school"
   *  means completed Attend Class, not merely walked in the door — see `markSchoolAttended()` below,
   *  which is the new, sole, authoritative write path. Do not wire this method into `enterPlace()`. */
  noteSchoolArrival() {
    const s = this.state, p = parts(s.minutes);
    if (s.lifePath !== 'school' || p.dayOfWeek > 4 || p.minuteOfDay >= SCHOOL_END) return;
    const key = markKey('at_school', p.day);
    if (!s.world.dailyMarks.includes(key)) {
      s.world.dailyMarks.push(key);
      s.today.schoolAttended = true;
      if (p.minuteOfDay >= SCHOOL_START) s.today.lateToSchool = true;
      this.emit({ type: 'school_attended', day: p.day });
    }
  }

  /**
   * Step 12 — the one authoritative write path for "the player attended school today," recorded
   * only once Attend Class (src/game/content/school/mondayActivities.ts's ATTEND_CLASS, run through
   * src/game/integration/mondayAdapter.ts's executeAttendClass()) has actually SUCCEEDED — never on
   * mere arrival at the building. Reuses the exact same existing attendance state
   * `noteSchoolArrival()` already wrote (the `at_school:<day>` entry in `world.dailyMarks`, which
   * `hasMark()`/`attendedToday()` in missions.ts already read, and `today.schoolAttended`, already
   * read by the SCHOOL_END absence sweep and the weekly recap) — there is exactly one attendance
   * flag, this is just a second, later, correctly-gated call site for it, not a new one. Deliberately
   * does NOT set `lateToSchool` (that is an arrival-timing concept `get_to_school`'s own mission
   * already owns) and does NOT touch anything else — time/energy/location are the adapter's job.
   */
  markSchoolAttended() {
    const s = this.state, p = parts(s.minutes);
    if (s.lifePath !== 'school') return;
    const key = markKey('at_school', p.day);
    if (!s.world.dailyMarks.includes(key)) {
      s.world.dailyMarks.push(key);
      s.today.schoolAttended = true;
      this.emit({ type: 'school_attended', day: p.day });
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

  /**
   * Step 16 — the flat live-world Energy cost of boarding any normal bus, independent of ride
   * distance. This is deliberately NOT copied from Core Simulation's `TAKE_BUS.energyCost` (1) —
   * that value belongs to a fixed, unrelated Monday-school ActivityDef with its own fixed
   * fare/duration that doesn't match the real, variable `BUS_ROUTE` system (see the Step 16 audit).
   * It happens to land on the same number, arrived at independently: nothing else in the live game
   * currently assigns any Energy cost to movement/travel at all (inspected `tick()`, `travelTo()`,
   * `boardBus()`'s prior form, and every mission choice in missions.ts — none consume energy), so
   * there is no existing live convention to defer to. On the current 0-100 scale, the two adapter-
   * driven activities cost 5 (a 30-minute chore) and 15 (a 4-hour class) energy; a single bus ride
   * is a much smaller, low-exertion action than either, so the smallest non-zero, clearly-intentional
   * cost (1) is used rather than 0 (indistinguishable from "still uncosted") or a value large enough
   * to compete with actual activities. This is a flat per-ride cost, not distance-based, per Step
   * 16's explicit instruction not to invent a distance-based energy model in this step.
   */
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
    if (s.finance.balance < fare) return { ok: false, reason: `You need $${fare.toFixed(2)} for the fare.` };
    const energyCost = GameStore.BUS_BOARD_ENERGY_COST;
    if (s.energy.current < energyCost) {
      return { ok: false, reason: `You're too tired to catch the bus right now.` };
    }
    if (fare > 0) this.spend(fare, 'transport', 'Bus fare');
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
    s.today.endBalance = s.finance.balance;
    if (s.lifePath === 'school' && p.dayOfWeek < 5 && s.today.schoolAttended === null) s.today.schoolAttended = false;
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
    s.today = emptyDay(newP.day, s.finance.balance);
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
      savings: s.finance.savings,
      missionsCompleted: days.reduce((a, d) => a + d.missionsCompleted.length, 0),
      socialActivities: days.reduce((a, d) => a + d.socialActivities, 0),
      schoolDaysAttended: schoolDays.filter(d => d.schoolAttended).length,
      schoolDaysTotal: schoolDays.length,
      majorDecisions: s.world.flags.filter(f => ['errand_impulse_buy', 'errand_under_budget', 'arcade_visit', 'park_alternative', 'ate_home_lunch', 'bought_canteen'].includes(f)),
      goalsProgress: s.finance.goals.map(g => ({ id: g.id, name: g.name, pct: Math.min(100, Math.round((g.saved / g.target) * 100)) })),
      days,
    };
    s.weeks.push(week);
    s.ledger = [];
    this.pendingWeekSummary = week;
    this.emit({ type: 'week_end', week: week.week, minutes: s.minutes });
  }

  dismissDaySummary() { this.pendingDaySummary = null; this.touch(true); }
  dismissWeekSummary() { this.pendingWeekSummary = null; this.touch(true); }

  // ══ PERSISTENCE ══════════════════════════════════════════════════════════
  serialize(): string { return JSON.stringify(this.state); }
  static hydrate(json: string): GameStore | null {
    try {
      const st = JSON.parse(json) as GameState;
      if (st.version !== 2) return null;
      return new GameStore(st);
    } catch { return null; }
  }
}
