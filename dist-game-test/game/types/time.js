"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
