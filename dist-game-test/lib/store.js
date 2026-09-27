"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStore = exports.BASE_MINUTES_PER_SECOND = void 0;
exports.createInitialState = createInitialState;
/**
 * MoniMate — GameStore: the single authoritative simulation.
 *
 *   GAME STATE ─ CLOCK ─ PLAYER ─ WORLD ─ MISSIONS ─ FINANCE ─ NPCs ─ EVENTS ─ PROGRESSION
 *
 * React never owns game state. The canvas loop calls `store.tick()` once per frame; React reads
 * snapshots through `subscribe()` at a throttled rate for HUD/panels. All systems advance ONLY by
 * calling `advance(minutes)`, so a bus ride, a lunch break, a sleep and a walk all move the same clock.
 */
const clock_1 = require("./clock");
const financeSystem_1 = require("../game/systems/financeSystem");
const energySystem_1 = require("../game/systems/energySystem");
const activitySystem_1 = require("../game/systems/activitySystem");
const mondayActivities_1 = require("../game/content/school/mondayActivities");
const schoolActivities_1 = require("../game/content/schoolActivities");
const saveMigration_1 = require("./saveMigration");
const missions_1 = require("./missions");
const achievements_1 = require("./achievements");
const lifeEvents_1 = require("./lifeEvents");
const world_1 = require("./world");
exports.BASE_MINUTES_PER_SECOND = clock_1.TIME_SCALE;
const RIDE_REAL_SECONDS = 6; // a bus trip plays out over ~6 real seconds
const SCHOOL_END = (0, clock_1.hm)(15, 30);
const PASS_OUT_AT = (0, clock_1.hm)(2, 0); // stay up past 2 AM and you fall asleep where you are
const WAKE_AT = (0, clock_1.hm)(7, 0);
const emptyDay = (day, balance) => ({
    day, startBalance: balance, endBalance: balance, spent: 0, earned: 0, schoolAttended: null,
    missionsCompleted: [], missionsMissed: [], socialActivities: 0, travel: [], lateToSchool: false, bedtimeMinuteOfDay: null,
});
function createInitialState(lifePath, finance, goals = { active: [], completed: [] }) {
    const defs = (0, missions_1.missionDefs)(lifePath);
    const start = (0, clock_1.at)(0, 7, 0); // Monday 7:00 AM, at home, sun rising
    const home = (0, world_1.tileToPx)((0, world_1.doorTile)('home')); // outdoor px — used only for lastDoor (where we pop back out to)
    // The game STARTS inside the house interior, which renders on its own grid (INTERIOR_TILE_PX),
    // not the outdoor one — spawning at outdoor coordinates put the player outside the room's walls,
    // pinned against collision on every axis (arrows "worked" but velocity was zeroed every frame).
    const homeInterior = (0, world_1.getInterior)('interior_home');
    const spawnPx = homeInterior
        ? { x: homeInterior.spawn.x * world_1.INTERIOR_TILE_PX, y: homeInterior.spawn.y * world_1.INTERIOR_TILE_PX }
        : { x: home.x, y: home.y };
    return {
        version: 3, minutes: start, paused: false, timeMultiplier: 1,
        player: { x: spawnPx.x, y: spawnPx.y, vx: 0, vy: 0, facing: Math.PI / 2, scene: 'interior_home', place: 'home', status: 'idle', lastDoor: { placeId: 'home', x: home.x, y: home.y, facing: Math.PI / 2 } },
        finance,
        goals,
        energy: { current: 100, max: 100, recoveryPerHourAsleep: 12.5 },
        world: { flags: [], relationships: { Mum: 3, Jordan: 2, Riley: 1 }, dailyMarks: [], busPass: null, hasBike: false },
        missions: (0, missions_1.initialMissionRuntime)(defs),
        npcs: {},
        today: emptyDay(0, finance.accounts.cash),
        currentActivity: null,
        weekDays: [], weeks: [], lifePath, xp: 0, ride: null, sleeping: false,
    };
}
const CLASS_BELL = (0, clock_1.hm)(8, 30);
const LAST_CLASS_START = (0, clock_1.hm)(11, 30);
class GameStore {
    constructor(state) {
        /** newly available missions waiting for the UI to offer them */
        this.offerQueue = [];
        /** achievements unlocked since the UI last asked — consumed by takeAchievementToasts() */
        this.toastQueue = [];
        /** summaries waiting to be shown */
        this.pendingDaySummary = null;
        this.pendingWeekSummary = null;
        /** Set once, when "Made It to Friday" completes — real numbers pulled from state at that moment,
         *  not scripted text, so the recap reflects whatever the player actually decided all week. */
        this.pendingLevelSummary = null;
        this.listeners = new Set();
        this.eventListeners = new Set();
        this.version = 0;
        this.lastNotify = 0;
        this.dirty = false;
        /** Real purchases made toward an active mission's shopping-list step (missionId -> items bought
         *  while that step has been current). Session-only — not part of the persisted GameState, since
         *  it's fully rebuilt from real purchases as they happen and never needs to survive a reload mid-step. */
        this.missionPurchaseLog = new Map();
        /** Balance snapshot taken the instant this week's pocket money is granted — the reference point
         *  for the Friday recap, since leftover balance from a previous week means "start of week" isn't
         *  simply the weekly income figure once you're past week one. */
        this.weekStartBalance = 0;
        /** One-line notices for the HUD (e.g. "Closed — opens at 7:30 AM"), drained by takeNotices(). */
        this.noticeQueue = [];
        // ── subscription (React) ──────────────────────────────────────────────────
        this.subscribe = (fn) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
        this.getVersion = () => this.version;
        this.emit = (e) => {
            if (e.type === 'mission_available')
                this.offerQueue.push(e.missionId);
            (0, missions_1.missionsOnEvent)(this.state, this.defs, e, (rt, def, outcome) => this.completeMission(rt, def, outcome));
            this.eventListeners.forEach(l => l(e));
        };
        this.state = state;
        if (state.currentActivity === undefined)
            state.currentActivity = null;
        this.money = new financeSystem_1.FinanceSystem(state.finance, tx => this.onTransaction(tx));
        this.energySys = new energySystem_1.EnergySystem(state.energy);
        const clock = { advance: m => this.advance(m), getTime: () => ({ minutes: this.state.minutes }) };
        const player = {
            getLocation: () => this.state.player.place,
            changeLocation: placeId => { if (placeId && placeId !== this.state.player.place) {
                this.exitPlace();
                this.enterPlace(placeId);
            } },
            setCurrentActivity: tag => this.setCurrentActivity(tag),
        };
        this.activities = new activitySystem_1.ActivitySystem(clock, player, this.energySys, this.money);
        // Self-heal saves made while the interior spawn-point bug was live: if the player is "inside"
        // a room but their x/y sit outside that room's own tile grid, they'd be wedged against a wall
        // with movement permanently zeroed. Snap them back to that interior's spawn tile instead.
        if (state.player.scene !== 'outdoor' && state.player.scene !== 'bus') {
            const interior = (0, world_1.getInterior)(state.player.scene);
            if (interior) {
                const tx = state.player.x / world_1.INTERIOR_TILE_PX, ty = state.player.y / world_1.INTERIOR_TILE_PX;
                if (tx < 0.3 || ty < 0.3 || tx > interior.widthTiles - 0.3 || ty > interior.heightTiles - 0.3) {
                    state.player.x = interior.spawn.x * world_1.INTERIOR_TILE_PX;
                    state.player.y = interior.spawn.y * world_1.INTERIOR_TILE_PX;
                    state.player.vx = 0;
                    state.player.vy = 0;
                }
            }
        }
        this.defs = (0, missions_1.missionDefs)(state.lifePath);
        // A save made while a mission had more steps than it does now points past its last step;
        // clamp it so the mission can still finish instead of silently hanging until it expires.
        for (const rt of state.missions) {
            const def = this.def(rt.id);
            if (def && rt.stepIndex >= def.steps.length)
                rt.stepIndex = def.steps.length - 1;
        }
        this.initNpcs(true);
        // Missions that should already be open at the start time get evaluated immediately
        this.evaluateMissions();
        this.evaluateAchievements();
    }
    onEvent(fn) { this.eventListeners.add(fn); return () => { this.eventListeners.delete(fn); }; }
    /** mark state changed; notifies React at most ~5×/s so the canvas never fights re-renders */
    touch(force = false) {
        this.dirty = true;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (force || now - this.lastNotify > 200)
            this.flush(now);
    }
    flush(now = performance.now()) {
        if (!this.dirty)
            return;
        this.dirty = false;
        this.lastNotify = now;
        this.version++;
        this.listeners.forEach(l => l());
    }
    // ══ CLOCK ════════════════════════════════════════════════════════════════
    /**
     * Called once per frame by the game loop.
     * `movedTiles` = distance the player actually walked this frame. While outdoors, walking
     * consumes game time in proportion to distance (so walking to school really costs ~22 min);
     * standing still runs at the base rate. Bus rides fast-forward over their true duration.
     */
    tick(dtSec, movedTiles, mode = 'walk') {
        const s = this.state;
        if (s.paused || s.sleeping)
            return;
        let minutes;
        if (s.ride) {
            const total = s.ride.endsAt - s.ride.startedAt;
            minutes = Math.min(s.ride.endsAt - s.minutes, (total / RIDE_REAL_SECONDS) * dtSec);
        }
        else if (s.player.scene === 'outdoor' && movedTiles > 0) {
            minutes = movedTiles * (mode === 'bike' ? world_1.BIKE_MIN_PER_TILE : world_1.WALK_MIN_PER_TILE);
        }
        else {
            minutes = dtSec * exports.BASE_MINUTES_PER_SECOND * s.timeMultiplier;
        }
        this.advance(Math.min(minutes, 5), true);
        this.stepNpcs(minutes);
        if (s.ride && s.minutes >= s.ride.endsAt - 1e-6)
            this.finishRide();
        this.touch();
    }
    /** The ONLY way time moves forward. Steps minute-by-minute so nothing is ever skipped. */
    advance(deltaMinutes, fromTick = false) {
        if (deltaMinutes <= 0)
            return;
        const s = this.state;
        const target = s.minutes + deltaMinutes;
        const big = deltaMinutes > 20;
        while (Math.floor(s.minutes) < Math.floor(target)) {
            s.minutes = Math.floor(s.minutes) + 1;
            this.onMinute();
        }
        s.minutes = target;
        if (big && !fromTick) {
            this.initNpcs(true);
        }
        this.touch(!fromTick);
    }
    onMinute() {
        const s = this.state;
        const p = (0, clock_1.parts)(s.minutes);
        this.emit({ type: 'minute', minutes: s.minutes });
        if (p.minute === 0)
            this.emit({ type: 'hour', minutes: s.minutes });
        if (p.minuteOfDay === 0) {
            this.emit({ type: 'day_start', day: p.day, minutes: s.minutes });
            s.world.dailyMarks = s.world.dailyMarks.filter(m => Number(m.split(':')[1]) >= p.day - 1);
            (0, missions_1.missionsOnDayStart)(s, this.defs, p.day);
            // one small optional life event may land today, on top of the scripted mission schedule
            if (!s.pendingLifeEvent) {
                const ev = (0, lifeEvents_1.rollLifeEvent)(s);
                if (ev) {
                    s.pendingLifeEvent = { id: ev.id, emoji: ev.emoji, text: ev.text, choiceIds: ev.choices.map(c => c.id) };
                    this.emit({ type: 'life_event', id: ev.id });
                }
            }
        }
        // school ends: anyone who never arrived is marked absent
        if (s.lifePath === 'school' && p.dayOfWeek < 5 && p.minuteOfDay === SCHOOL_END && s.today.schoolAttended === null) {
            s.today.schoolAttended = false;
            this.emit({ type: 'school_missed', day: p.day });
        }
        // bus events for the world (arrivals at each stop)
        for (const stop of world_1.BUS_ROUTE.stops) {
            const b = (0, world_1.busAtStop)(stop.stopId, s.minutes);
            if (b && Math.floor(s.minutes) === Math.floor(b.arrivesAt))
                this.emit({ type: 'bus_arrived', stopId: stop.stopId, routeId: world_1.BUS_ROUTE.id, minutes: s.minutes });
        }
        this.evaluateMissions();
        this.updateNpcTargets();
        this.economyOnMinute(p);
        if (p.minuteOfDay === PASS_OUT_AT && !s.sleeping)
            this.sleep(true);
    }
    evaluateMissions() {
        (0, missions_1.missionsOnMinute)(this.state, this.defs, this.emit, (def, rt) => this.onMissionExpired(def, rt));
    }
    // ══ ECONOMY ══════════════════════════════════════════════════════════════
    /** 9 AM each day: weekly pay on Thursday, then any recurring expense that has come due (rent,
     *  phone bill…). A bill you can't cover isn't silently skipped — it becomes arrears you owe. */
    economyOnMinute(p) {
        const s = this.state, f = s.finance;
        if (p.minuteOfDay !== (0, clock_1.hm)(9))
            return;
        const job = f.income.job;
        if (p.dayOfWeek === 3 && job) {
            this.earn(job.payPerHour * job.hoursPerWeek, 'income', `${job.name} pay`, job.location);
        }
        for (const bill of f.expenses.recurring) {
            if (bill.nextDueAt > s.minutes)
                continue;
            bill.nextDueAt += bill.periodDays * clock_1.MIN_PER_DAY;
            const category = bill.category === 'food' || bill.category === 'other' ? 'other' : bill.category;
            if (this.spend(bill.amount, category, bill.name, 'system'))
                continue;
            const arrears = f.debt.loans.find(l => l.id === 'arrears');
            if (arrears)
                arrears.principal += bill.amount;
            else
                f.debt.loans.push({ id: 'arrears', kind: 'other', principal: bill.amount, apr: 0, paymentPerPeriod: 0, periodDays: 30, nextDueAt: s.minutes + 30 * clock_1.MIN_PER_DAY });
            this.pushNotice(`Couldn't pay ${bill.name} ($${bill.amount.toFixed(2)}) — it's been added to what you owe.`);
        }
    }
    // ══ MONEY ════════════════════════════════════════════════════════════════
    /** Cash in hand — what the HUD shows and what purchases are checked against. */
    get cash() { return this.state.finance.accounts.cash; }
    canAfford(amount) { return this.money.canAfford('cash', amount); }
    /** Pay `amount` from cash. Returns false (and changes nothing) if the player can't afford it —
     *  money never goes negative. `label` is the reason shown in the ledger; `source` is who/where. */
    spend(amount, category, label, source) {
        if (!(amount > 0))
            return true;
        if (!this.money.canAfford('cash', amount))
            return false;
        this.money.recordTransaction({ account: 'cash', amount: -amount, category, type: 'expense', description: label, source }, this.state.minutes);
        return true;
    }
    earn(amount, category, label, source) {
        if (!(amount > 0))
            return;
        this.money.recordTransaction({ account: 'cash', amount, category, type: 'income', description: label, source }, this.state.minutes);
    }
    /** Piggy bank: move cash into savings (and back). Recorded as a linked pair of transfers. */
    moveToSavings(amount) {
        if (!(amount > 0) || !this.money.canAfford('cash', amount))
            return false;
        this.money.transfer('cash', 'savings', amount, this.state.minutes, 'Into the piggy bank');
        return true;
    }
    takeFromSavings(amount) {
        if (!(amount > 0) || !this.money.canAfford('savings', amount))
            return false;
        this.money.transfer('savings', 'cash', amount, this.state.minutes, 'Out of the piggy bank');
        return true;
    }
    /** Transactions since a game minute (e.g. this week), newest last. */
    transactionsSince(minute) {
        return this.state.finance.transactions.recent.filter(t => t.timestamp >= minute);
    }
    /** Keeps the day record, events and achievements in step with every transaction, whatever made it. */
    onTransaction(tx) {
        const s = this.state;
        if (tx.type !== 'transfer') {
            if (tx.amount < 0)
                s.today.spent += -tx.amount;
            else
                s.today.earned += tx.amount;
        }
        if (tx.amount < 0 && tx.type === 'expense')
            this.emit({ type: 'purchase', amount: -tx.amount, category: tx.category, label: tx.description });
        this.touch();
    }
    // ══ ENERGY (Step 6) ═══════════════════════════════════════════════════════
    /** Read-only snapshot — callers get the current {current,max}, never a mutable reference they
     *  could edit outside these methods. */
    getEnergy() { return { current: this.state.energy.current, max: this.state.energy.max }; }
    /** Energy spent by a choice or action. Clamped at 0: tiredness is a consequence, not a lock. */
    consumeEnergy(amount) {
        if (!(amount > 0))
            return;
        this.energySys.consume(Math.min(amount, this.state.energy.current));
        this.touch();
    }
    restoreEnergy(amount) {
        if (!(amount > 0))
            return;
        this.energySys.restore(amount);
        this.touch();
    }
    // ══ ACTIVITIES ═══════════════════════════════════════════════════════════
    /** Run a timed activity (class, chores, …) through ActivitySystem against the live game: it
     *  checks place/energy/money first, then moves the real clock, energy and ledger. */
    runActivity(def) {
        const r = this.activities.execute(def);
        if (!r.success)
            return { ok: false, reason: r.reason, message: r.message, minutesAdvanced: 0, energyConsumed: 0, amountEarned: 0 };
        this.touch(true);
        return {
            ok: true, minutesAdvanced: r.timeAdvancedMinutes, energyConsumed: r.energyConsumed,
            amountEarned: r.transaction && r.transaction.amount > 0 ? r.transaction.amount : 0,
        };
    }
    /** Sit through a lesson. Attendance is recorded only if the lesson actually happened. */
    attendClass() {
        const out = this.runActivity(mondayActivities_1.ATTEND_CLASS);
        if (out.ok)
            this.markSchoolAttended();
        return out;
    }
    helpParents() {
        return this.runActivity(schoolActivities_1.HELP_PARENTS);
    }
    // ══ ACTIVITY STATE (Step 18) ═════════════════════════════════════════════
    /** The one public write path for `currentActivity` — a synchronized copy of whatever Core
     *  Simulation's ActivitySystem computed for a successful activity (see runActivity()). Mirrors consumeEnergy()/restoreEnergy()'s shape
     *  exactly: mutate the one authoritative field, notify subscribers, touch nothing else. */
    setCurrentActivity(tag) {
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
    setPaused(v) {
        this.state.paused = v;
        this.touch();
    }
    // ══ NOTICES ══════════════════════════════════════════════════════════════
    pushNotice(text) { this.noticeQueue.push(text); }
    takeNotices() { const n = this.noticeQueue; this.noticeQueue = []; return n; }
    // ══ DAILY MARKS ══════════════════════════════════════════════════════════
    /** Once-per-day facts ("helped Mum today") live in the saved GameState, so a page reload can't
     *  reset them the way the old React-state flags could. Cleared automatically after a day. */
    hasDoneToday(name) { return (0, missions_1.hasMark)(this.state, name); }
    markDoneToday(name) {
        const key = (0, missions_1.markKey)(name, (0, clock_1.parts)(this.state.minutes).day);
        if (!this.state.world.dailyMarks.includes(key))
            this.state.world.dailyMarks.push(key);
        this.touch(true);
    }
    // ══ SCHOOL DAY ═══════════════════════════════════════════════════════════
    /** What the Attend Class prompt should say right now, or null when school isn't relevant. */
    classStatus() {
        const s = this.state, p = (0, clock_1.parts)(s.minutes);
        if (s.lifePath !== 'school' || p.dayOfWeek > 4 || s.player.place !== 'university')
            return null;
        if ((0, missions_1.hasMark)(s, 'at_school'))
            return 'done';
        if (p.minuteOfDay > LAST_CLASS_START)
            return 'too_late';
        if (s.player.scene !== 'interior_school_classroom')
            return 'go_to_classroom';
        return 'ready';
    }
    /** Arrived early? Sit down and wait for the 8:30 bell (the clock really moves). */
    waitForBell() {
        const p = (0, clock_1.parts)(this.state.minutes);
        if (p.minuteOfDay < CLASS_BELL)
            this.advance(CLASS_BELL - p.minuteOfDay);
    }
    // ══ RELATIONSHIPS (Step 27) ══════════════════════════════════════════════
    /** Public write path for a relationship delta outside the mission-choice engine — e.g. an
     *  ad hoc Core-Sim activity (Help Parents) declined by the player. Mirrors the exact clamp
     *  logic `applyChoice()` already uses inline for `choice.relationship` (Math.max(-5, Math.min(5,
     *  cur + delta))) rather than introducing a second relationship rule — this is the same
     *  computation, just reachable from outside a MissionChoice. */
    adjustRelationship(npc, delta) {
        if (delta === 0)
            return;
        const s = this.state;
        const cur = s.world.relationships[npc] ?? 0;
        s.world.relationships[npc] = Math.max(-5, Math.min(5, cur + delta));
        this.touch();
    }
    // ══ SHOP INTERIORS (Phase 10) ═══════════════════════════════════════════════
    /** The product nearest the player right now, if close enough to interact with — real walk-up-and-
     *  interact shopping (Rule 27), not a dropdown. Null outside a shop interior or too far from any item. */
    nearbyShopItem() {
        const s = this.state;
        const interior = (0, world_1.getInterior)(s.player.scene);
        if (!interior?.shopItems)
            return null;
        const px = s.player.x / world_1.INTERIOR_TILE_PX, py = s.player.y / world_1.INTERIOR_TILE_PX;
        let best = null, bestD = 1.1; // interaction radius, in tiles
        for (const item of interior.shopItems) {
            const d = Math.hypot(item.tx - px, item.ty - py);
            if (d < bestD) {
                bestD = d;
                best = item;
            }
        }
        return best ? { ...best, affordable: this.canAfford(best.price) } : null;
    }
    /** Buy whatever's currently in reach. Money updates immediately (Rule 21); the game never picks
     *  for the player between e.g. the $3.50 and $6.00 milk (Rule 28). */
    buyNearbyShopItem() {
        const item = this.nearbyShopItem();
        if (!item)
            return { ok: false, reason: 'Nothing in reach.' };
        if (!item.affordable)
            return { ok: false, reason: "You can't afford that." };
        const s = this.state;
        // Step 28: if this item is the physical pickup for a grocery-list need this mission has already
        // covered, refuse the second pickup — the same physical item (e.g. the milk) can't be collected
        // twice. Only applies while an active awaitsPurchase step for this place has that need; ordinary
        // shopping (no active grocery-list mission here) is unaffected.
        for (const rt of s.missions) {
            if (rt.state !== 'active')
                continue;
            const def = this.def(rt.id);
            const step = def.steps[rt.stepIndex];
            if (!step?.awaitsPurchase || step.place !== s.player.place)
                continue;
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
        // Credit this purchase toward any active mission whose current step is a shopping list for
        // the place you're standing in (Phase: mission <-> real-purchase integration).
        for (const rt of s.missions) {
            if (rt.state !== 'active')
                continue;
            const def = this.def(rt.id);
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
    shoppingProgress() {
        const s = this.state;
        for (const rt of s.missions) {
            if (rt.state !== 'active')
                continue;
            const def = this.def(rt.id);
            const step = def.steps[rt.stepIndex];
            if (!step?.awaitsPurchase || step.place !== s.player.place)
                continue;
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
    evaluatePurchaseMission(placeId) {
        const s = this.state;
        for (const rt of s.missions) {
            if (rt.state !== 'active')
                continue;
            const def = this.def(rt.id);
            const step = def.steps[rt.stepIndex];
            if (!step?.awaitsPurchase || step.place !== placeId)
                continue;
            const log = this.missionPurchaseLog.get(rt.id) ?? [];
            const need = step.purchaseNeeds ?? [];
            if (!need.every(prefix => log.some(b => b.id.startsWith(prefix))))
                continue; // still missing items — leave active
            const total = log.reduce((sum, b) => sum + b.price, 0);
            const budget = step.purchaseBudget ?? total;
            let outcome, relDelta, flag;
            if (total <= budget - 1) {
                outcome = 'under_budget';
                relDelta = 2;
                flag = 'errand_under_budget';
            }
            else if (total <= budget + 1) {
                outcome = 'on_budget';
                relDelta = 1;
                flag = 'errand_on_budget';
            }
            else {
                outcome = 'impulse_buy';
                relDelta = 0;
                flag = 'errand_impulse_buy';
            }
            if (!s.world.flags.includes('errand_completed'))
                s.world.flags.push('errand_completed');
            if (!s.world.flags.includes(flag))
                s.world.flags.push(flag);
            if (step.speaker && relDelta) {
                const cur = s.world.relationships[step.speaker] ?? 0;
                s.world.relationships[step.speaker] = Math.max(-5, Math.min(5, cur + relDelta));
            }
            this.completeMission(rt, def, outcome);
            this.missionPurchaseLog.delete(rt.id);
        }
    }
    // ══ PLACES / SCENES ══════════════════════════════════════════════════════
    isOpenNow(placeId) { return (0, world_1.isOpen)(placeId, this.state.minutes); }
    closedMessage(placeId) { return (0, world_1.closedReason)(placeId, this.state.minutes); }
    /** Walk through a door. Position/direction/time/mission state are preserved for the way back out. */
    enterPlace(placeId) {
        const s = this.state;
        if (!this.isOpenNow(placeId))
            return { ok: false, reason: this.closedMessage(placeId) };
        const place = (0, world_1.getPlace)(placeId);
        const door = (0, world_1.tileToPx)((0, world_1.doorTile)(placeId));
        s.player.lastDoor = { placeId, x: s.player.x || door.x, y: s.player.y || door.y, facing: s.player.facing };
        s.player.place = placeId;
        const isGrocery = placeId === 'supermarket' || placeId === 'dairy';
        const dedicatedScene = world_1.PLACE_INTERIOR_SCENE[placeId];
        s.player.scene = place?.interior === 'home' ? 'interior_home'
            : place?.interior === 'school' ? 'interior_school_hall'
                : place?.interior === 'shop' ? (isGrocery ? 'interior_supermarket' : dedicatedScene ?? 'interior_shop')
                    : 'outdoor';
        if (s.player.scene !== 'outdoor')
            this.warpToInteriorSpawn(s.player.scene);
        s.player.vx = s.player.vy = 0;
        this.emit({ type: 'entered_place', placeId });
        this.evaluateMissions(); // a mission waiting on "walk in here" starts the moment you do
        this.touch(true);
        return { ok: true };
    }
    /** Move to a different room inside the SAME building (e.g. school hallway -> classroom).
     *  Unlike enterPlace/exitPlace, this doesn't touch player.place/lastDoor — you're still "inside". */
    goToInteriorScene(sceneId) {
        const s = this.state;
        s.player.scene = sceneId;
        this.warpToInteriorSpawn(sceneId);
        s.player.vx = s.player.vy = 0;
        this.touch(true);
    }
    warpToInteriorSpawn(sceneId) {
        const s = this.state;
        const interior = (0, world_1.getInterior)(sceneId);
        if (!interior)
            return;
        s.player.x = interior.spawn.x * world_1.INTERIOR_TILE_PX;
        s.player.y = interior.spawn.y * world_1.INTERIOR_TILE_PX;
        s.player.facing = -Math.PI / 2; // face up, into the room
    }
    /** Step back outside at the SAME door (never a random position), facing away from the building. */
    exitPlace() {
        const s = this.state, d = s.player.lastDoor;
        if (!d)
            return;
        const left = s.player.place;
        if (left)
            this.evaluatePurchaseMission(left);
        s.player.scene = 'outdoor';
        s.player.x = d.x;
        s.player.y = d.y + world_1.TILE_PX * 0.6; // one step below the door, on the sidewalk
        s.player.facing = Math.PI / 2;
        s.player.place = null;
        if (left)
            this.emit({ type: 'left_place', placeId: left });
        this.touch(true);
    }
    /** Open ground (the park) has no interior; the loop reports when the player crosses its edge. */
    setOutdoorZone(placeId) {
        const s = this.state;
        if (s.player.scene !== 'outdoor' || s.player.place === placeId)
            return;
        s.player.place = placeId;
        if (placeId) {
            this.emit({ type: 'entered_place', placeId });
            this.evaluateMissions();
        }
        this.touch();
    }
    // ══ NPCs ═════════════════════════════════════════════════════════════════
    initNpcs(snap) {
        const s = this.state;
        for (const def of world_1.NPCS) {
            const placeId = (0, world_1.npcPlaceAt)(def, s.minutes);
            const t = (0, world_1.tileToPx)(this.npcSpot(def.id, placeId));
            const cur = s.npcs[def.id];
            if (!cur || snap) {
                s.npcs[def.id] = { id: def.id, x: t.x, y: t.y, place: placeId, targetX: t.x, targetY: t.y, facing: Math.PI / 2, moving: false, visible: this.npcOutside(def.id, placeId, false), path: [] };
            }
        }
    }
    /** slight per-NPC offset so nobody stacks on the same door tile */
    npcSpot(npcId, placeId) {
        const d = (0, world_1.doorTile)(placeId);
        const i = world_1.NPCS.findIndex(n => n.id === npcId);
        return { x: d.x + ((i % 3) - 1) * 0.7, y: d.y + (placeId === 'park' ? (i % 2) * 1.2 : 0.2) };
    }
    npcOutside(npcId, placeId, moving) {
        const m = (0, clock_1.parts)(this.state.minutes).minuteOfDay;
        if (moving)
            return !(m >= (0, clock_1.hm)(23) || m < (0, clock_1.hm)(5));
        if (placeId === 'park' || placeId === 'market')
            return m >= (0, clock_1.hm)(6) && m < (0, clock_1.hm)(22);
        if (placeId === 'university')
            return (m >= (0, clock_1.hm)(7, 50) && m < (0, clock_1.hm)(8, 30)) || (m >= (0, clock_1.hm)(15, 30) && m < (0, clock_1.hm)(16));
        return false; // inside a building
    }
    updateNpcTargets() {
        const s = this.state;
        for (const def of world_1.NPCS) {
            const npc = s.npcs[def.id];
            const placeId = (0, world_1.npcPlaceAt)(def, s.minutes);
            if (placeId === npc.place)
                continue;
            npc.place = placeId;
            const to = (0, world_1.tileToPx)(this.npcSpot(def.id, placeId));
            npc.targetX = to.x;
            npc.targetY = to.y;
            const route = (0, world_1.routeTiles)({ x: npc.x / world_1.TILE_PX, y: npc.y / world_1.TILE_PX }, { x: to.x / world_1.TILE_PX, y: to.y / world_1.TILE_PX });
            npc.path = route.slice(1).map(t => ({ x: t.x * world_1.TILE_PX, y: t.y * world_1.TILE_PX }));
            npc.moving = npc.path.length > 0;
        }
    }
    stepNpcs(gameMinutes) {
        const s = this.state;
        for (const def of world_1.NPCS) {
            const npc = s.npcs[def.id];
            if (npc.moving && npc.path.length) {
                let budget = def.speedTilesPerMin * gameMinutes * world_1.TILE_PX;
                while (budget > 0 && npc.path.length) {
                    const wp = npc.path[0];
                    const dx = wp.x - npc.x, dy = wp.y - npc.y, dist = Math.hypot(dx, dy);
                    if (dist <= budget) {
                        npc.x = wp.x;
                        npc.y = wp.y;
                        budget -= dist;
                        npc.path.shift();
                    }
                    else {
                        npc.x += (dx / dist) * budget;
                        npc.y += (dy / dist) * budget;
                        npc.facing = Math.atan2(dy, dx);
                        budget = 0;
                    }
                }
                if (!npc.path.length)
                    npc.moving = false;
            }
            npc.visible = this.npcOutside(def.id, npc.place, npc.moving);
        }
    }
    /** NPCs standing in the room the player is in, with where they stand (interior pixels). The
     *  renderer draws them here and proximity is measured from here, so what you see is what you can
     *  talk to. School NPCs are spread across rooms by npcRoomAt(). */
    interiorNpcs() {
        const s = this.state, pl = s.player;
        const interior = (0, world_1.getInterior)(pl.scene);
        if (!interior || !pl.place)
            return [];
        const here = Object.values(s.npcs).filter(n => {
            if (n.place !== pl.place || n.moving)
                return false;
            const room = (0, world_1.npcRoomAt)(n.id, n.place, s.minutes);
            return !room || room === pl.scene;
        });
        const T = world_1.INTERIOR_TILE_PX;
        return here.map((npc, i) => ({
            npc,
            x: (interior.widthTiles / 2 + (i - (here.length - 1) / 2) * 1.4) * T,
            y: Math.min(interior.heightTiles - 1.5, 1.4) * T,
        }));
    }
    /** The closest NPC in talking range: outdoors a visible NPC within ~1.4 tiles, indoors within ~1.8. */
    npcNearPlayer() {
        const s = this.state, pl = s.player;
        let best = null, bestD = Infinity;
        if (pl.scene === 'outdoor') {
            for (const npc of Object.values(s.npcs)) {
                const d = Math.hypot(npc.x - pl.x, npc.y - pl.y);
                if (npc.visible && d < world_1.TILE_PX * 1.4 && d < bestD) {
                    best = npc;
                    bestD = d;
                }
            }
        }
        else {
            for (const { npc, x, y } of this.interiorNpcs()) {
                const d = Math.hypot(x - pl.x, y - pl.y);
                if (d < world_1.INTERIOR_TILE_PX * 1.8 && d < bestD) {
                    best = npc;
                    bestD = d;
                }
            }
        }
        return best;
    }
    /** Is this NPC with the player right now (same room indoors, a few steps away outdoors)? */
    npcPresent(npcId) {
        const s = this.state, pl = s.player;
        if (pl.scene === 'outdoor') {
            const npc = s.npcs[npcId];
            return !!npc && npc.visible && Math.hypot(npc.x - pl.x, npc.y - pl.y) < world_1.TILE_PX * 3;
        }
        return this.interiorNpcs().some(e => e.npc.id === npcId);
    }
    /** NPCs who have something to say to the player right now (a mission waiting on a chat with
     *  them). The renderer puts a speech bubble over their head so the player knows who to talk to. */
    npcsWantingToTalk() {
        const s = this.state, out = new Set();
        for (const rt of s.missions) {
            const def = this.def(rt.id);
            if (!def)
                continue;
            if (rt.state === 'locked' && def.trigger.type === 'interaction' && !rt.triggered
                && (0, missions_1.missionWindowOpen)(def, s.minutes) && (!def.requires || def.requires(s))) {
                out.add(def.trigger.npcId);
            }
            const step = def.steps[rt.stepIndex];
            if ((rt.state === 'active' || rt.state === 'available') && step?.withNpc && step.npcId)
                out.add(step.npcId);
        }
        return out;
    }
    talkTo(npcId) {
        this.emit({ type: 'talked_to', npcId });
        this.evaluateMissions();
        this.touch(true);
    }
    // ══ MISSIONS ═════════════════════════════════════════════════════════════
    runtime(id) { return this.state.missions.find(m => m.id === id); }
    def(id) { return (0, missions_1.getDef)(this.defs, id); }
    /** Missions the UI should show as "New" right now (consumes the queue).
     *
     * This-step fix: used to require the runtime to still be 'available' at the moment this drains —
     * that was safe back when nothing ever left 'available' on its own, but actionableStep() now
     * auto-starts a mission the instant it's reachable (see its own comment), so by the time the
     * animation-frame loop calls this (a separate tick from the render that may have just called
     * actionableStep()), the same mission can already legitimately be 'active'. The toast is "a new
     * mission just appeared," not "and is still literally unaccepted" — so only exclude an id that
     * reset all the way back to 'locked' or vanished (e.g. expired) before ever being read. */
    takeOffers() {
        const ids = [...new Set(this.offerQueue)];
        this.offerQueue = [];
        return ids.map(id => this.def(id)).filter(d => d && this.runtime(d.id) && this.runtime(d.id).state !== 'locked');
    }
    // ══ ACHIEVEMENTS ═════════════════════════════════════════════════════════
    /** Re-checks every achievement definition and unlocks any that are now newly true. Called after
     *  anything that could move the needle (a purchase, a mission finishing, a day/week ending) —
     *  each check is a cheap read of already-tracked state, so running it a few extra times costs
     *  nothing, but it never needs to run on every single game-minute tick either. */
    evaluateAchievements() {
        const s = this.state;
        if (s.finance.debt.loans.some(l => l.principal > 0) && !s.world.flags.includes('ever_in_debt'))
            s.world.flags.push('ever_in_debt');
        for (const id of (0, achievements_1.checkAchievements)(s)) {
            s.world.flags.push(`ach:${id}`);
            const def = achievements_1.ACHIEVEMENTS.find(a => a.id === id);
            this.toastQueue.push({ id, name: def.name, emoji: def.emoji });
        }
    }
    /** Achievements unlocked since the UI last asked (consumes the queue, like takeOffers()). */
    takeAchievementToasts() {
        const t = this.toastQueue;
        this.toastQueue = [];
        return t;
    }
    // ══ LIFE EVENTS ══════════════════════════════════════════════════════════
    /** Resolve the currently-pending life event with the player's chosen option. */
    resolveLifeEvent(choiceId) {
        const s = this.state, pending = s.pendingLifeEvent;
        if (!pending)
            return;
        const def = lifeEvents_1.LIFE_EVENTS.find(e => e.id === pending.id);
        const choice = def?.choices.find(c => c.id === choiceId);
        if (choice) {
            if (choice.amount < 0 && !this.spend(-choice.amount, 'life_event', def.text.slice(0, 40))) {
                this.pushNotice("You can't afford that right now.");
                return;
            }
            if (choice.amount > 0)
                this.earn(choice.amount, 'life_event', def.text.slice(0, 40));
            if (choice.relationship) {
                const cur = s.world.relationships[choice.relationship.npc] ?? 0;
                s.world.relationships[choice.relationship.npc] = Math.max(-5, Math.min(5, cur + choice.relationship.delta));
            }
        }
        s.pendingLifeEvent = undefined;
        this.touch(true);
    }
    startMission(id) {
        const rt = this.runtime(id);
        if (!rt || (rt.state !== 'available'))
            return;
        rt.state = 'active';
        rt.startedAt = this.state.minutes;
        rt.stepIndex = 0;
        this.emit({ type: 'mission_started', missionId: id });
        this.touch(true);
    }
    currentStep(id) {
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
    actionableStep() {
        const s = this.state;
        // Highest priority first, so e.g. a story beat beats a daily lunch prompt in the same room.
        const live = s.missions
            .filter(rt => rt.state === 'active' || rt.state === 'available')
            .sort((a, b) => (this.def(b.id)?.priority ?? 0) - (this.def(a.id)?.priority ?? 0));
        for (const rt of live) {
            const def = this.def(rt.id), step = def.steps[rt.stepIndex];
            if (!step || step.completeOnArrival || step.awaitsPurchase)
                continue;
            const reachable = step.remote
                || (step.withNpc && step.npcId ? this.npcPresent(step.npcId) : s.player.place === step.place);
            if (reachable) {
                if (rt.state === 'available')
                    this.startMission(rt.id);
                return { def, rt, step };
            }
        }
        return null;
    }
    /** Apply a dialogue choice. Returns false (changing nothing) if the player can't afford it. */
    applyChoice(missionId, choice) {
        const s = this.state;
        const rt = this.runtime(missionId), def = this.def(missionId);
        if (!rt || !def)
            return false;
        const step = def.steps[rt.stepIndex];
        const label = choice.label.replace(/^\P{L}+/u, '').replace(/\s*\(.*\)$/, '') || def.name;
        const source = step?.npcId ?? step?.place;
        if (choice.cost < 0 && !this.spend(-choice.cost, choice.category ?? 'other', label, source)) {
            this.pushNotice("You can't afford that.");
            return false;
        }
        if (choice.cost > 0)
            this.earn(choice.cost, choice.category ?? 'income', label, source);
        // Step 22: Energy is a consequence of the choice, not a precondition — consumeEnergy() already
        // clamps at 0 and no-ops for amount <= 0, so a choice with no/zero energyCost, or one whose cost
        // exceeds current Energy, still applies normally with no new failure path.
        this.consumeEnergy(choice.energyCost ?? 0);
        for (const f of choice.flags ?? [])
            if (!s.world.flags.includes(f))
                s.world.flags.push(f);
        if (choice.relationship && step.speaker) {
            const cur = s.world.relationships[step.speaker] ?? 0;
            s.world.relationships[step.speaker] = Math.max(-5, Math.min(5, cur + choice.relationship));
        }
        if (choice.social)
            s.today.socialActivities += 1;
        rt.outcome = choice.id;
        if (choice.minutes > 0)
            this.advance(choice.minutes);
        if (choice.finish)
            this.completeMission(rt, def, choice.id);
        else {
            rt.stepIndex = Math.min(rt.stepIndex + 1, def.steps.length - 1);
            this.touch(true);
        }
        return true;
    }
    completeMission(rt, def, outcome) {
        if (rt.state === 'completed')
            return;
        const s = this.state;
        rt.state = 'completed';
        rt.finishedAt = s.minutes;
        rt.outcome = outcome;
        s.xp += def.rewards.xp;
        if (def.rewards.money)
            this.earn(def.rewards.money, 'mission_reward', def.name, def.id);
        if (def.rewards.flag && !s.world.flags.includes(def.rewards.flag))
            s.world.flags.push(def.rewards.flag);
        s.today.missionsCompleted.push(def.id);
        this.emit({ type: 'mission_completed', missionId: def.id });
        // "Make It to Friday" story hooks — real numbers, not scripted ones.
        if (def.id === 'pocket_money') {
            this.weekStartBalance = s.finance.accounts.cash;
            // survives a reload mid-week, since the instance field above doesn't persist with the save
            s.world.flags = s.world.flags.filter(f => !f.startsWith('wk_start_balance:'));
            s.world.flags.push(`wk_start_balance:${s.finance.accounts.cash}`);
        }
        if (def.id === 'friday_recap')
            this.buildLevelSummary(s);
        // story triggers: anything waiting on this mission can now open
        this.evaluateMissions();
        this.evaluateAchievements();
        this.touch(true);
    }
    buildLevelSummary(s) {
        if (this.weekStartBalance === 0) {
            const flag = s.world.flags.find(f => f.startsWith('wk_start_balance:'));
            if (flag)
                this.weekStartBalance = Number(flag.split(':')[1]) || 0;
        }
        const daysAttended = s.weekDays.filter(d => d.schoolAttended).length + (s.today.schoolAttended ? 1 : 0);
        const daysTotal = s.weekDays.filter(d => d.schoolAttended !== null).length + (s.today.schoolAttended !== null ? 1 : 0);
        const birthdayOutcome = s.world.flags.includes('birthday_contributed') ? 'full'
            : s.world.flags.includes('birthday_partial') ? 'partial'
                : 'declined';
        const unexpectedOutcome = s.world.flags.includes('unexpected_paid') ? 'paid'
            : s.world.flags.includes('unexpected_walked') ? 'walked'
                : 'none';
        this.pendingLevelSummary = {
            startBalance: this.weekStartBalance,
            endBalance: s.finance.accounts.cash,
            daysAttended, daysTotal,
            schoolProjectDone: s.world.flags.includes('school_project_done'),
            birthdayOutcome, unexpectedOutcome,
            wentToArcade: s.world.flags.includes('arcade_visit'),
            busRides: [...s.weekDays, s.today].reduce((n, d) => n + d.travel.filter(t => t === 'bus').length, 0),
            busSpent: this.transactionsSince((0, clock_1.at)((0, clock_1.parts)(s.minutes).day - (0, clock_1.parts)(s.minutes).dayOfWeek, 0, 0))
                .filter(t => t.category === 'transport' && t.amount < 0).reduce((sum, t) => sum - t.amount, 0),
        };
    }
    dismissLevelSummary() { this.pendingLevelSummary = null; this.touch(true); }
    onMissionExpired(def, rt) {
        const s = this.state;
        s.today.missionsMissed.push(def.id);
        const ex = def.onExpire;
        if (ex) {
            for (const f of ex.flags ?? [])
                if (!s.world.flags.includes(f))
                    s.world.flags.push(f);
            if (ex.relationship) {
                const cur = s.world.relationships[ex.relationship.npc] ?? 0;
                s.world.relationships[ex.relationship.npc] = Math.max(-5, Math.min(5, cur + ex.relationship.delta));
            }
            if (def.id === 'get_to_school')
                s.today.lateToSchool = true;
        }
    }
    // ══ SCHOOL ═══════════════════════════════════════════════════════════════
    /** The one write path for "attended school today": called by attendClass() only after the lesson
     *  actually happened (never on merely walking in). */
    markSchoolAttended() {
        const s = this.state, p = (0, clock_1.parts)(s.minutes);
        if (s.lifePath !== 'school')
            return;
        const key = (0, missions_1.markKey)('at_school', p.day);
        if (!s.world.dailyMarks.includes(key)) {
            s.world.dailyMarks.push(key);
            s.today.schoolAttended = true;
            this.emit({ type: 'school_attended', day: p.day });
            this.evaluateMissions(); // anything waiting on "attended today" can open right now
            this.touch(true);
        }
    }
    // ══ TRAVEL ═══════════════════════════════════════════════════════════════
    travelTo(mode) {
        this.state.today.travel.push(mode);
    }
    busHere() {
        const s = this.state;
        if (s.player.scene !== 'outdoor')
            return null;
        for (const stop of Object.values(world_1.BUS_STOPS)) {
            const t = (0, world_1.tileToPx)(stop.tile);
            if (Math.hypot(t.x - s.player.x, t.y - s.player.y) < world_1.TILE_PX * 2 && (0, world_1.busAtStop)(stop.id, s.minutes))
                return { stopId: stop.id };
        }
        return null;
    }
    playerNearBusStop() {
        const s = this.state;
        for (const stop of Object.values(world_1.BUS_STOPS)) {
            const t = (0, world_1.tileToPx)(stop.tile);
            if (Math.hypot(t.x - s.player.x, t.y - s.player.y) < world_1.TILE_PX * 2)
                return stop.id;
        }
        return null;
    }
    /** Board the bus at `fromStop` and ride to `toStop`. The clock runs through the trip.
     *
     * Step 16: validates BOTH the fare and the energy cost before any mutation, so a failure on
     * either leaves money, energy, ledger, player location, and any existing `s.ride` completely
     * untouched — same "validate everything first, mutate only after every check passes" rule
     * `ActivitySystem.canExecute()`/`execute()` already use, applied here without routing through
     * ActivitySystem itself (this is real, asynchronous, variable-fare/duration live travel — see the
     * Step 16 audit for why `TAKE_BUS`/`ActivitySystem` don't fit it). */
    boardBus(fromStop, toStop) {
        const s = this.state;
        const bus = (0, world_1.busAtStop)(fromStop, s.minutes);
        if (!bus)
            return { ok: false, reason: 'The bus has not arrived yet.' };
        const pass = s.world.busPass && s.world.busPass.validUntil > s.minutes;
        const fare = pass ? 0 : world_1.BUS_ROUTE.fare;
        if (!this.canAfford(fare))
            return { ok: false, reason: `You need $${fare.toFixed(2)} for the fare.` };
        const energyCost = GameStore.BUS_BOARD_ENERGY_COST;
        if (s.energy.current < energyCost) {
            return { ok: false, reason: `You're too tired to catch the bus right now.` };
        }
        if (fare > 0)
            this.spend(fare, 'transport', 'Bus fare', world_1.BUS_ROUTE.id);
        this.consumeEnergy(energyCost);
        const ride = (0, world_1.rideMinutes)(fromStop, toStop);
        s.ride = { fromStop, toStop, startedAt: s.minutes, endsAt: s.minutes + Math.max(2, ride), fare };
        s.player.scene = 'bus';
        s.player.status = 'on_bus';
        s.player.place = null;
        s.today.travel.push('bus');
        this.emit({ type: 'bus_departed', stopId: fromStop, routeId: world_1.BUS_ROUTE.id, minutes: s.minutes });
        this.touch(true);
        return { ok: true };
    }
    finishRide() {
        const s = this.state;
        if (!s.ride)
            return;
        const stop = (0, world_1.stopById)(s.ride.toStop);
        const px = (0, world_1.tileToPx)(stop.tile);
        s.player.scene = 'outdoor';
        s.player.status = 'idle';
        s.player.x = px.x;
        s.player.y = px.y + world_1.TILE_PX * 0.3;
        s.player.facing = Math.PI / 2;
        s.ride = null;
        this.emit({ type: 'bus_arrived', stopId: stop.id, routeId: world_1.BUS_ROUTE.id, minutes: s.minutes });
        this.touch(true);
    }
    // ══ DAY / WEEK ═══════════════════════════════════════════════════════════
    /** Go to bed. Clock runs to the morning through the normal minute loop (missions expire, NPCs go home). */
    sleep(passedOut = false) {
        const s = this.state;
        if (s.sleeping)
            return;
        const p = (0, clock_1.parts)(s.minutes);
        s.today.bedtimeMinuteOfDay = passedOut ? PASS_OUT_AT : p.minuteOfDay;
        s.today.endBalance = s.finance.accounts.cash;
        if (s.lifePath === 'school' && p.dayOfWeek < 5 && s.today.schoolAttended === null)
            s.today.schoolAttended = false;
        const record = { ...s.today, missionsCompleted: [...s.today.missionsCompleted], missionsMissed: [...s.today.missionsMissed], travel: [...s.today.travel] };
        s.weekDays.push(record);
        this.emit({ type: 'day_end', day: record.day, minutes: s.minutes });
        // fast-forward to 7:00 AM through the same minute loop
        const wake = p.minuteOfDay < WAKE_AT ? (0, clock_1.at)(p.day, 0, WAKE_AT) : (0, clock_1.at)(p.day + 1, 0, WAKE_AT);
        s.sleeping = true;
        this.advance(wake - s.minutes);
        s.sleeping = false;
        // wake up at home
        const home = (0, world_1.tileToPx)((0, world_1.doorTile)('home'));
        s.player.scene = 'interior_home';
        s.player.place = 'home';
        s.player.status = 'idle';
        s.player.lastDoor = { placeId: 'home', x: home.x, y: home.y, facing: Math.PI / 2 };
        this.initNpcs(true);
        // Step 6: sleep always fast-forwards to a full night at WAKE_AT (see the advance() call
        // above), matching the Core Simulation's own EnergyState.recoveryPerHourAsleep default
        // ("full recovery over an 8-hour sleep") — so a full restore on waking is the correct
        // behavior here, not an arbitrary shortcut. restoreEnergy() itself clamps at max.
        this.restoreEnergy(s.energy.max);
        const newP = (0, clock_1.parts)(s.minutes);
        if (newP.dayOfWeek === 0 && s.weekDays.length >= 1)
            this.finalizeWeek();
        s.today = emptyDay(newP.day, s.finance.accounts.cash);
        this.pendingDaySummary = record;
        this.emit({ type: 'day_start', day: newP.day, minutes: s.minutes });
        this.evaluateMissions();
        this.evaluateAchievements();
        this.touch(true);
    }
    finalizeWeek() {
        const s = this.state, days = s.weekDays.splice(0);
        const schoolDays = days.filter(d => d.schoolAttended !== null);
        const week = {
            week: (0, clock_1.parts)(s.minutes).week - 1,
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
    serialize() { return JSON.stringify(this.state); }
    static hydrate(json) {
        try {
            const st = (0, saveMigration_1.migrateSave)(JSON.parse(json));
            return st ? new GameStore(st) : null;
        }
        catch {
            return null;
        }
    }
}
exports.GameStore = GameStore;
/** Flat energy cost of boarding a bus (a low-effort trip compared with class at 15 or chores at 5). */
GameStore.BUS_BOARD_ENERGY_COST = 1;
