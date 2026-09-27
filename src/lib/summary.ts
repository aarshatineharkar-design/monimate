/**
 * MoniMate — formats DayRecord/WeekRecord into the plain strings the summary screens show.
 * No JSX here (engine stays framework-free); GamePage renders these into its summary component.
 */
import { formatDuration } from './clock';
import type { DayRecord, WeekRecord } from './types';
import { DAY_NAMES } from './clock';
import type { MissionDef } from './missions';

export interface DaySummaryView {
  title: string;
  moneyLine: string;
  spentLine: string;
  schoolLine: string | null;
  missionsLine: string;
  timeLine: string;
}

export function dayToSummaryView(rec: DayRecord, defs: MissionDef[]): DaySummaryView {
  const dayName = DAY_NAMES[rec.day % 7].toUpperCase();
  const missionNames = (ids: string[]) => ids.map(id => defs.find(d => d.id === id)?.name ?? id);
  const bedtimeGood = rec.bedtimeMinuteOfDay !== null && rec.bedtimeMinuteOfDay <= 22 * 60 + 30;
  return {
    title: `${dayName} COMPLETE`,
    moneyLine: `$${rec.startBalance.toFixed(2)} → $${rec.endBalance.toFixed(2)}`,
    spentLine: `Spent $${rec.spent.toFixed(2)} · Earned $${rec.earned.toFixed(2)}`,
    schoolLine: rec.schoolAttended === null ? null : rec.schoolAttended ? (rec.lateToSchool ? '⚠ Attended (late)' : '✓ Attended') : '✗ Missed',
    missionsLine: rec.missionsCompleted.length
      ? `✓ ${rec.missionsCompleted.length} completed — ${missionNames(rec.missionsCompleted).join(', ')}`
      : 'No missions completed',
    timeLine: bedtimeGood ? 'Good bedtime' : rec.bedtimeMinuteOfDay === null ? 'Still up' : 'Stayed up late',
  };
}

export interface WeekSummaryView {
  title: string;
  income: string;
  spending: string;
  savings: string;
  missions: string;
  social: string;
  school: string;
  decisions: string[];
  goals: { name: string; pct: number }[];
}

const DECISION_LABELS: Record<string, string> = {
  errand_impulse_buy: 'Bought the checkout-line treat during an errand',
  errand_under_budget: 'Came in under budget on an errand',
  arcade_visit: 'Spent on the arcade with friends',
  park_alternative: 'Suggested a free activity instead of spending',
  ate_home_lunch: 'Brought lunch from home',
  bought_canteen: 'Bought canteen lunch most days',
};

export function weekToSummaryView(rec: WeekRecord): WeekSummaryView {
  return {
    title: `WEEK ${rec.week} SUMMARY`,
    income: `Income: $${rec.income.toFixed(2)}`,
    spending: `Spending: $${rec.spending.toFixed(2)}`,
    savings: `Savings: $${rec.savings.toFixed(2)}`,
    missions: `Missions completed: ${rec.missionsCompleted}`,
    social: `Social activities: ${rec.socialActivities}`,
    school: rec.schoolDaysTotal ? `School: ${rec.schoolDaysAttended}/${rec.schoolDaysTotal} days attended` : 'No school days this week',
    decisions: rec.majorDecisions.map(d => DECISION_LABELS[d] ?? d),
    goals: rec.goalsProgress.map(g => ({ name: g.name, pct: g.pct })),
  };
}

export const formatMinutesSpent = formatDuration;
