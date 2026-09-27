import type { FinancialState } from './financeTypes';

export type PlaceId = string; // matches LOCATIONS ids in the map ('home','university','bus_stop',...)
export type SceneId =
  | 'outdoor' | 'interior_home' | 'interior_shop' | 'interior_supermarket' | 'bus'
  // School has real separate rooms (Phase 9) — Hall is the entry room, the rest branch off it.
  | 'interior_school_hall' | 'interior_school_classroom' | 'interior_school_cafeteria'
  | 'interior_school_library' | 'interior_school_gym'
  // Real furnished interiors for the other MVP-adjacent buildings (previously all shared the one
  // empty 'interior_shop' placeholder room).
  | 'interior_cafe' | 'interior_bank' | 'interior_mall' | 'interior_restaurant' | 'interior_bookshop';

// ── Player ──────────────────────────────────────────────────────────────────
export interface PlayerWorld {
  x: number; y: number;          // world px (float, never grid-snapped)
  vx: number; vy: number;        // px / second
  facing: number;                // radians, 0 = east, used by minimap arrow + sprite direction
  scene: SceneId;
  /** place the player is inside or standing at the entrance of (null = out on the street) */
  place: PlaceId | null;
  /** where the player re-appears when they leave an interior */
  lastDoor?: { placeId: PlaceId; x: number; y: number; facing: number };
  /** simple "state of the body" flags the rest of the sim can read */
  status: 'idle' | 'walking' | 'waiting' | 'on_bus' | 'in_conversation' | 'sleeping';
}

// ── Time-driven events emitted by the store ────────────────────────────────
export type GameEvent =
  | { type: 'minute'; minutes: number }
  | { type: 'hour'; minutes: number }
  | { type: 'day_start'; day: number; minutes: number }
  | { type: 'day_end'; day: number; minutes: number }
  | { type: 'week_end'; week: number; minutes: number }
  | { type: 'bus_arrived'; stopId: string; routeId: string; minutes: number }
  | { type: 'bus_departed'; stopId: string; routeId: string; minutes: number }
  | { type: 'entered_place'; placeId: PlaceId }
  | { type: 'left_place'; placeId: PlaceId }
  | { type: 'talked_to'; npcId: string }
  | { type: 'mission_available'; missionId: string }
  | { type: 'mission_started'; missionId: string }
  | { type: 'mission_completed'; missionId: string }
  | { type: 'mission_expired'; missionId: string }
  | { type: 'school_attended'; day: number }
  | { type: 'school_missed'; day: number }
  | { type: 'purchase'; amount: number; category: string; label: string }
  | { type: 'achievement_unlocked'; id: string }
  | { type: 'life_event'; id: string };

// ── Ledger for day/week summaries ──────────────────────────────────────────
export interface LedgerEntry { minutes: number; amount: number; category: string; label: string }

export interface DayRecord {
  day: number;
  startBalance: number;
  endBalance: number;
  spent: number;
  earned: number;
  schoolAttended: boolean | null; // null = not a school day
  missionsCompleted: string[];
  missionsMissed: string[];
  socialActivities: number;
  travel: ('walk' | 'bike' | 'bus')[];
  lateToSchool: boolean;
  bedtimeMinuteOfDay: number | null;
}

export interface WeekRecord {
  week: number;
  income: number;
  spending: number;
  savings: number;
  missionsCompleted: number;
  socialActivities: number;
  schoolDaysAttended: number;
  schoolDaysTotal: number;
  majorDecisions: string[];
  goalsProgress: { id: string; name: string; pct: number }[];
  days: DayRecord[];
}

// ── NPC runtime ────────────────────────────────────────────────────────────
export interface NpcRuntime {
  id: string;
  x: number; y: number;          // world px
  place: PlaceId | 'street';     // where the schedule says they should be
  targetX: number; targetY: number;
  facing: number;
  moving: boolean;
  /** drawn on the street this minute (false = inside a building) */
  visible: boolean;
  /** remaining waypoints (world px) to walk along */
  path: { x: number; y: number }[];
}

// ── Mission runtime ────────────────────────────────────────────────────────
export type MissionKind = 'main' | 'side' | 'timed' | 'daily' | 'dynamic';
export type MissionState = 'locked' | 'available' | 'active' | 'completed' | 'expired' | 'failed';

export interface MissionRuntime {
  id: string;
  state: MissionState;
  stepIndex: number;
  becameAvailableAt?: number;
  startedAt?: number;
  finishedAt?: number;
  /** set once the mission's trigger event (location / NPC / world / completion) has fired inside its window */
  triggered?: boolean;
  /** absolute clock minute after which an available/active mission expires */
  expiresAt?: number;
  /** id of the choice made on the last step, for summaries */
  outcome?: string;
}

// ── World flags ────────────────────────────────────────────────────────────
export interface WorldFlags {
  flags: string[];
  relationships: Record<string, number>;     // -5..+5
  /** per-day one-shot markers such as "morning_routine_done:3" */
  dailyMarks: string[];
  busPass: { validUntil: number } | null;
  hasBike: boolean;
}

/**
 * Step 18: mirrors src/game/types/player.ts's `ActivityTag` exactly (same literal values),
 * declared independently rather than imported — for the same reason ClockSystem is independent of
 * lib/clock.ts (see clockSystem.ts's own module comment): nothing in src/lib/ imports from
 * src/game/, and src/game/integration/mondayAdapter.ts is the one deliberate seam that's allowed
 * to know about both sides. Importing Core Simulation's own `ActivityTag` type here would make
 * this foundational lib file depend on src/game/ existing at all, which would hold even for a
 * type-only import (TypeScript still resolves the module graph), breaking that invariant for the
 * first time outside the adapter. Keeping the two unions structurally identical means a Core
 * Simulation value assigns straight into this type at the adapter's one bridging call site with no
 * cast — if the two ever drift, TypeScript itself will flag the mismatch right there instead of
 * silently coercing it.
 */
export type ActivityTag =
  | 'walking' | 'in_conversation' | 'shopping' | 'studying' | 'working'
  | 'socializing' | 'resting' | 'sleeping' | 'chore' | 'exercising' | 'exploring';

// ── Whole simulation state ─────────────────────────────────────────────────
export interface GameState {
  version: 2;
  minutes: number;               // THE clock
  paused: boolean;
  timeMultiplier: 1 | 2 | 4;     // fast-forward when waiting / sleeping
  player: PlayerWorld;
  finance: FinancialState;
  /** Step 6: the third live resource alongside time (`minutes`) and money (`finance`). Mirrors
   *  the Core Simulation's EnergyState shape (src/game/types/energy.ts) on purpose, so the two
   *  stay conceptually interchangeable — see GameStore's consumeEnergy()/restoreEnergy() and
   *  src/game/integration/mondayAdapter.ts for how a Core Simulation activity's energy cost gets
   *  synchronized into this one authoritative value. */
  energy: { current: number; max: number };
  /** Step 18: a synchronized copy of whatever Core Simulation's ActivitySystem last computed for
   *  the player's activity tag on a SUCCESSFUL adapter-driven activity (see GameStore's
   *  setCurrentActivity() and src/game/integration/mondayAdapter.ts) — never written to directly,
   *  never derived independently. `null` until the first such activity succeeds (older saves,
   *  which won't have this key at all, self-heal to `null` in GameStore's constructor, same
   *  pattern used for `energy` in Step 6). Nothing currently reads this value; it exists purely to
   *  stop discarding a real Core Simulation result that used to be computed and thrown away. */
  currentActivity: ActivityTag | null;
  world: WorldFlags;
  missions: MissionRuntime[];
  npcs: Record<string, NpcRuntime>;
  ledger: LedgerEntry[];         // current week
  today: DayRecord;
  weekDays: DayRecord[];
  weeks: WeekRecord[];
  lifePath: 'school' | 'university' | 'international' | 'working';
  xp: number;
  /** active bus ride, if any. The clock fast-forwards through it, so travel time is real time on the same clock */
  ride: null | { fromStop: string; toStop: string; startedAt: number; endsAt: number; fare: number };
  /** true between "go to bed" and the morning summary being dismissed */
  sleeping: boolean;
  /** a rolled life event waiting on a player response, if any (optional — older saves simply won't have one) */
  pendingLifeEvent?: { id: string; emoji: string; text: string; choiceIds: string[] };
}
