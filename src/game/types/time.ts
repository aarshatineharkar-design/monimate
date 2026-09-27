/**
 * MoniMate 2.0 — TimeState: the contract for the authoritative simulation clock.
 *
 * This is a CONTRACT, not a replacement clock. The existing clock (src/lib/clock.ts) remains
 * authoritative for the live game and is not touched by this step. `TimeState` only says what
 * the future ClockSystem will persist; the derived values below (day/week/month/year/dayOfWeek/
 * time-of-day/lighting period) are NOT stored fields — they must stay pure functions of
 * `minutes`, exactly like today's `parts()`/`lightingAt()` in clock.ts, so there is never a
 * second source of truth for what day it is.
 */

export interface TimeState {
  /** Total in-game minutes since Monday 00:00 of week 1 — THE single authoritative clock value.
   *  Everything temporal in the simulation derives from this one number. */
  minutes: number;
  paused: boolean;
  /** Fast-forward multiplier (e.g. while waiting or sleeping). */
  timeMultiplier: 1 | 2 | 4;
}

/**
 * Everything a UI or system needs to know "what time is it" — computed on demand from
 * `TimeState.minutes` by pure functions, never stored. Shape mirrors what src/lib/clock.ts's
 * `parts()` + `lightingAt()` already produce, plus month/year slots for the longer campaign
 * horizons (University/Working Life) that don't exist yet — present here only so a future
 * calendar layer is a new pure function, not a GameState shape change.
 */
export interface DerivedTime {
  day: number;
  dayOfWeek: number;
  week: number;
  /** Not implemented by the current clock (week-only horizon). Present for future campaigns
   *  that need a longer calendar; a School-life derivation can simply omit/ignore it. */
  month?: number;
  year?: number;
  hour: number;
  minute: number;
  minuteOfDay: number;
  lightingPhase: 'night' | 'dawn' | 'morning' | 'day' | 'evening' | 'sunset' | 'dusk' | 'late_night';
}
