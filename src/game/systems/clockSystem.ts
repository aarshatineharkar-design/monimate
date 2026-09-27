/**
 * MoniMate 2.0 — ClockSystem (Step 3 implementation).
 *
 * Owns TimeState. The only way TimeState.minutes changes is through `advance()`. Day/week/hour/
 * minute/dayOfWeek/lighting-phase are all DERIVED from `minutes` on every call to
 * `getDerivedTime()` — never stored — so day rollover isn't a special case this system has to
 * detect and handle, it falls out of plain arithmetic exactly like the existing lib/clock.ts.
 *
 * This is independent of lib/clock.ts on purpose (see src/game/README.md) — the constants/logic
 * below are intentionally small reimplementations of the same well-understood arithmetic, not a
 * reference to the existing game's clock.
 */
import type { TimeState, DerivedTime } from '../types/time';

const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 24 * MIN_PER_HOUR;

/** Simplified day-phase boundaries (minute-of-day thresholds only — no colour/interpolation,
 *  since DerivedTime only needs the phase itself). Boundaries mirror the existing game's
 *  lib/clock.ts LIGHT_KEYS phases so the two clocks would agree if ever compared side by side. */
function lightingPhaseFor(minuteOfDay: number): DerivedTime['lightingPhase'] {
  if (minuteOfDay < 5 * MIN_PER_HOUR + 30) return 'late_night';
  if (minuteOfDay < 6 * MIN_PER_HOUR) return 'night';
  if (minuteOfDay < 7 * MIN_PER_HOUR + 30) return 'dawn';
  if (minuteOfDay < 12 * MIN_PER_HOUR) return 'morning';
  if (minuteOfDay < 17 * MIN_PER_HOUR) return 'day';
  if (minuteOfDay < 19 * MIN_PER_HOUR) return 'evening';
  if (minuteOfDay < 20 * MIN_PER_HOUR) return 'sunset';
  if (minuteOfDay < 21 * MIN_PER_HOUR) return 'dusk';
  return 'night';
}

export class ClockSystem {
  constructor(private readonly time: TimeState) {}

  getTime(): TimeState {
    return this.time;
  }

  getDerivedTime(): DerivedTime {
    const totalMinutes = Math.floor(this.time.minutes);
    const day = Math.floor(totalMinutes / MIN_PER_DAY);
    const minuteOfDay = totalMinutes - day * MIN_PER_DAY;
    return {
      day,
      dayOfWeek: day % 7,
      week: Math.floor(day / 7) + 1,
      hour: Math.floor(minuteOfDay / MIN_PER_HOUR),
      minute: minuteOfDay % MIN_PER_HOUR,
      minuteOfDay,
      lightingPhase: lightingPhaseFor(minuteOfDay),
    };
  }

  /** The only way TimeState.minutes moves forward. Rejects negative/non-finite input rather than
   *  silently doing nothing or going backwards — a caller passing a bad value is a bug, not a
   *  no-op. */
  advance(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new Error(`ClockSystem.advance: minutes must be a non-negative finite number, got ${minutes}`);
    }
    if (minutes === 0) return;
    this.time.minutes += minutes;
  }

  /** True if `this.time.minutes` is now on a later calendar day than `previousMinutes` was —
   *  useful for callers that advanced time and want to know whether a day boundary was crossed,
   *  without duplicating the day-index math themselves. */
  hasNewDayStarted(previousMinutes: number): boolean {
    return Math.floor(this.time.minutes / MIN_PER_DAY) > Math.floor(previousMinutes / MIN_PER_DAY);
  }
}
