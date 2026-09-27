import type { FinancialState } from '../game/types/finance';
import type { EnergyState } from '../game/types/energy';
import type { GoalState } from '../game/types/goal';
import type { ActivityTag } from '../game/types/player';
export type { ActivityTag };

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

// ── Whole simulation state ─────────────────────────────────────────────────
export interface GameState {
  /** 3 = one engine: money, energy and goals use the src/game model. Older saves are upgraded on
   *  load by migrateSave() in src/lib/saveMigration.ts. */
  version: 3;
  minutes: number;               // THE clock
  paused: boolean;
  timeMultiplier: 1 | 2 | 4;     // fast-forward when waiting / sleeping
  player: PlayerWorld;
  /** Accounts (cash, savings…), income, recurring expenses, debt and the full transaction ledger.
   *  Changed only through FinanceSystem (GameStore.spend/earn/transfer), never edited directly. */
  finance: FinancialState;
  /** The player's goals (Pack 2 adds the Monday goal picker). */
  goals: GoalState;
  energy: EnergyState;
  /** What the player is doing right now, as computed by ActivitySystem. */
  currentActivity: ActivityTag | null;
  world: WorldFlags;
  missions: MissionRuntime[];
  npcs: Record<string, NpcRuntime>;
  today: DayRecord;
  weekDays: DayRecord[];
  weeks: WeekRecord[];
  lifePath: 'school' | 'university' | 'international' | 'working';
  xp: number;
  /** active bus ride, if any. The clock fast-forwards through it, so travel time is real time on the same clock */
  ride: null | { fromStop: string; toStop: string; startedAt: number; endsAt: number; fare: number };
  /** true between "go to bed" and the morning summary being dismissed */
  sleeping: boolean;
  /** a rolled life event waiting on a player response, if any */
  pendingLifeEvent?: { id: string; emoji: string; text: string; choiceIds: string[] };
}
