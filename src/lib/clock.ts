/**
 * MoniMate — central simulation clock (pure functions, no React).
 *
 * The ONE source of time is `GameState.minutes`: total in-game minutes since
 * Monday 00:00 of week 1. Everything else (day, hour, lighting, shop hours,
 * NPC positions, bus arrivals, mission windows) is derived from that number.
 * Nothing in the game may keep its own timer.
 */

export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 24 * 60;
export const MIN_PER_WEEK = 7 * MIN_PER_DAY;

/** Real seconds -> game minutes. 1 = one game minute per real second (a 15h waking day ≈ 15 real min). */
export const TIME_SCALE = 1;

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type DayName = (typeof DAY_NAMES)[number];

/** Build an absolute minute stamp. day 0 = Monday week 1. */
export const at = (day: number, hour: number, minute = 0) => day * MIN_PER_DAY + hour * 60 + minute;

export interface ClockParts {
  day: number;        // absolute day index, 0 = Monday week 1
  dayOfWeek: number;  // 0..6
  week: number;       // 1-based
  hour: number;       // 0..23
  minute: number;     // 0..59
  minuteOfDay: number;
}

export function parts(minutes: number): ClockParts {
  const m = Math.floor(minutes);
  const day = Math.floor(m / MIN_PER_DAY);
  const minuteOfDay = m - day * MIN_PER_DAY;
  return {
    day,
    dayOfWeek: day % 7,
    week: Math.floor(day / 7) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    minuteOfDay,
  };
}

export function formatTime(minutes: number): string {
  const p = parts(minutes);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour >= 12 ? 'PM' : 'AM'}`;
}

export const formatDay = (minutes: number) => DAY_NAMES[parts(minutes).dayOfWeek].toUpperCase();

/** "1h 05m" style duration */
export function formatDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
}

// ── Windows ────────────────────────────────────────────────────────────────

export interface DailyWindow {
  open: number;   // minute of day
  close: number;  // minute of day (exclusive)
  days?: number[]; // dayOfWeek filter; omit = every day
}

const hm = (h: number, m = 0) => h * 60 + m;
export { hm };

export function inDailyWindows(minutes: number, windows: DailyWindow[]): boolean {
  const p = parts(minutes);
  return windows.some(w => (!w.days || w.days.includes(p.dayOfWeek)) && p.minuteOfDay >= w.open && p.minuteOfDay < w.close);
}

// ── Day/night ──────────────────────────────────────────────────────────────

export type DayPhase = 'night' | 'dawn' | 'morning' | 'day' | 'evening' | 'sunset' | 'dusk' | 'late_night';

interface LightKey { t: number; r: number; g: number; b: number; a: number; phase: DayPhase }

/** Overlay tint keyframes across the day. Linear-interpolated, so no sudden switches. */
const LIGHT_KEYS: LightKey[] = [
  { t: hm(0),      r: 10,  g: 14,  b: 46,  a: 0.62, phase: 'late_night' },
  { t: hm(5, 30),  r: 12,  g: 16,  b: 50,  a: 0.55, phase: 'night' },
  { t: hm(6, 0),   r: 255, g: 170, b: 120, a: 0.28, phase: 'dawn' },
  { t: hm(7, 30),  r: 255, g: 220, b: 170, a: 0.10, phase: 'morning' },
  { t: hm(8, 0),   r: 255, g: 240, b: 210, a: 0.00, phase: 'morning' },
  { t: hm(12, 0),  r: 255, g: 255, b: 255, a: 0.00, phase: 'day' },
  { t: hm(16, 0),  r: 255, g: 235, b: 190, a: 0.04, phase: 'day' },
  { t: hm(17, 0),  r: 255, g: 200, b: 140, a: 0.14, phase: 'evening' },
  { t: hm(19, 0),  r: 255, g: 120, b: 80,  a: 0.30, phase: 'sunset' },
  { t: hm(20, 0),  r: 90,  g: 60,  b: 120, a: 0.42, phase: 'dusk' },
  { t: hm(21, 0),  r: 18,  g: 22,  b: 64,  a: 0.55, phase: 'night' },
  { t: hm(23, 0),  r: 10,  g: 14,  b: 46,  a: 0.62, phase: 'late_night' },
  { t: hm(24, 0),  r: 10,  g: 14,  b: 46,  a: 0.62, phase: 'late_night' },
];

export interface Lighting { r: number; g: number; b: number; a: number; phase: DayPhase; /** 0 = bright day, 1 = darkest night */ darkness: number }

export function lightingAt(minutes: number): Lighting {
  const t = parts(minutes).minuteOfDay;
  let i = 0;
  while (i < LIGHT_KEYS.length - 2 && t >= LIGHT_KEYS[i + 1].t) i++;
  const a = LIGHT_KEYS[i], b = LIGHT_KEYS[i + 1];
  const k = (t - a.t) / Math.max(1, b.t - a.t);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const alpha = lerp(a.a, b.a);
  return { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b), a: alpha, phase: k < 0.5 ? a.phase : b.phase, darkness: Math.min(1, alpha / 0.62) };
}

/** Street lamps / lit windows should be on when it's this dark. */
export const lampsOn = (minutes: number) => lightingAt(minutes).darkness > 0.45;
