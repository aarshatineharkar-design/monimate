/**
 * MoniMate — small read-only helpers shared by every path's mission content (School, University…).
 * Kept apart from missions.ts so content files can import them without an import cycle.
 */
import { parts } from './clock';
import type { GameState } from './types';

export const markKey = (name: string, day: number) => `${name}:${day}`;
export const hasMark = (s: GameState, name: string, day = parts(s.minutes).day) => s.world.dailyMarks.includes(markKey(name, day));
export const hasFlag = (s: GameState, f: string) => s.world.flags.includes(f);
/** Sat through today's class or lecture (see GameStore.markSchoolAttended). */
export const attendedToday = (s: GameState) => hasMark(s, 'at_school');
/** THIS WEEK's completion — a mission's runtime resets to 'locked' every Monday. */
export const doneThisWeek = (s: GameState, id: string) => s.missions.find(m => m.id === id)?.state === 'completed';
/** Completed OR missed this week, so a missed moment never soft-locks what comes after it. */
export const resolvedThisWeek = (s: GameState, id: string) => {
  const st = s.missions.find(m => m.id === id)?.state;
  return st === 'completed' || st === 'expired';
};
