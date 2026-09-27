// lib/rivalData.ts
// A lightweight "rival" character — Riley — who's doing the same challenge as
// the player. Deliberately NOT another real player or a live multiplayer
// sync (that's what the Supabase leaderboard is for — comparing against real
// people once they've finished a run). This is a simple, deterministic pace
// so it's reliable to test and never breaks if the network/backend is down.
export const RIVAL_NAME = 'Riley';
export const RIVAL_EMOJI = '🎒';

// A believable but not-too-perfect savings curve: starts slow, builds up,
// occasionally has a flat day (Riley has bad days too). Deterministic per
// day number so it's the same every playthrough — easy to balance and test.
const DAILY_PACE = [0, 0.12, 0.3, 0.55, 0.8, 0.9, 1.0]; // fraction of the goal reached by end of each day (index = day)

/** Riley's piggy bank balance at the END of a given day, scaled to this playthrough's goal. */
export function rivalProgressOnDay(day: number, goal: number): number {
  const idx = Math.min(day, DAILY_PACE.length - 1);
  return Math.round(DAILY_PACE[idx] * goal);
}

/** A short line comparing the player's current savings to Riley's pace today. */
export function rivalComparisonText(playerPiggyBank: number, day: number, goal: number): string {
  const rival = rivalProgressOnDay(day, goal);
  const diff = playerPiggyBank - rival;
  if (Math.abs(diff) < 2) return `You're neck and neck with ${RIVAL_NAME} right now.`;
  if (diff > 0) return `You're $${diff.toFixed(0)} ahead of ${RIVAL_NAME} — keep it up!`;
  return `${RIVAL_NAME}'s $${Math.abs(diff).toFixed(0)} ahead of you right now.`;
}