/**
 * MoniMate — achievements. Pure, stateless checks against the current GameState; the store just
 * asks "which of these are newly true that weren't before" after anything relevant happens (a
 * purchase, a mission finishing, a day ending) and unlocks them. Persisted the same way everything
 * else is: as flags in state.world.flags (prefixed `ach:`), so no save-schema change was needed.
 */
import type { GameState } from './types';

export interface AchievementDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** true once this achievement's condition has ever been met. Checked cheaply and often, so keep
   *  these simple reads of already-tracked state — no scanning the whole ledger every tick. */
  check: (s: GameState) => boolean;
}

/** Total times a repeating mission has ever been recorded as completed, across the current day,
 *  the days already closed out this week, and every past week's saved days. */
function countMissionCompletions(s: GameState, missionId: string): number {
  const inDay = (d: { missionsCompleted: string[] }) => d.missionsCompleted.filter(id => id === missionId).length;
  let total = inDay(s.today) + s.weekDays.reduce((sum, d) => sum + inDay(d), 0);
  for (const w of s.weeks) total += w.days.reduce((sum, d) => sum + inDay(d), 0);
  return total;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_paycheck', name: 'First Paycheck', emoji: '💵',
    description: 'Earn money for the first time.',
    check: s => s.finance.totals.totalEarned > 0,
  },
  {
    id: 'saver_100', name: 'Saver', emoji: '🐷',
    description: 'Get your savings to $100.',
    check: s => s.finance.accounts.savings >= 100,
  },
  {
    id: 'goal_reached', name: 'Goal Getter', emoji: '🎯',
    description: "Achieve the goal you picked for the week.",
    check: s => s.world.flags.includes('week_goal_met'),
  },
  {
    id: 'debt_free', name: 'Debt Free', emoji: '🧾',
    description: 'Clear all debt after having owed money.',
    check: s => s.world.flags.includes('ever_in_debt') && s.finance.debt.loans.every(l => l.principal <= 0),
  },
  {
    id: 'first_mission', name: 'Getting Started', emoji: '📋',
    description: 'Complete your first mission.',
    check: s => s.missions.some(m => m.state === 'completed'),
  },
  {
    id: 'errand_pro', name: 'Errand Pro', emoji: '🛒',
    description: 'Finish 5 shopping-list missions.',
    check: s => countMissionCompletions(s, 'pickup_groceries') >= 5,
  },
  {
    id: 'budgeter', name: 'Budgeter', emoji: '🏷️',
    description: 'Come in under budget on a shopping errand.',
    check: s => s.world.flags.includes('errand_under_budget'),
  },
  {
    id: 'perfect_attendance', name: 'Perfect Attendance', emoji: '🏫',
    description: 'Attend school every day in a week.',
    check: s => s.weeks.some(w => w.schoolDaysTotal > 0 && w.schoolDaysAttended === w.schoolDaysTotal),
  },
  {
    id: 'social_butterfly', name: 'Social Butterfly', emoji: '🦋',
    description: 'Do 10 social activities in total.',
    check: s => s.weekDays.reduce((sum, d) => sum + d.socialActivities, 0) + s.today.socialActivities >= 10,
  },
  {
    id: 'commuter', name: 'Regular Commuter', emoji: '🚌',
    description: 'Ride the bus 5 times.',
    check: s => s.today.travel.filter(t => t === 'bus').length
      + s.weekDays.reduce((sum, d) => sum + d.travel.filter(t => t === 'bus').length, 0) >= 5,
  },
  {
    id: 'week_one_done', name: 'One Week Down', emoji: '🗓️',
    description: 'Complete your first full week.',
    check: s => s.weeks.length >= 1,
  },
];

/** Returns the ids of achievements that are true right now but not yet flagged unlocked. Call
 *  after anything that could move the needle (purchase, mission complete, day/week end) — cheap
 *  enough to run on every one of those, no need to run it every single game-minute. */
export function checkAchievements(s: GameState): string[] {
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    const flag = `ach:${a.id}`;
    if (s.world.flags.includes(flag)) continue;
    if (a.check(s)) unlocked.push(a.id);
  }
  return unlocked;
}

export const isUnlocked = (s: GameState, id: string) => s.world.flags.includes(`ach:${id}`);
