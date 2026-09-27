"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUnlocked = exports.ACHIEVEMENTS = void 0;
exports.checkAchievements = checkAchievements;
/** Total times a repeating mission has ever been recorded as completed, across the current day,
 *  the days already closed out this week, and every past week's saved days. */
function countMissionCompletions(s, missionId) {
    const inDay = (d) => d.missionsCompleted.filter(id => id === missionId).length;
    let total = inDay(s.today) + s.weekDays.reduce((sum, d) => sum + inDay(d), 0);
    for (const w of s.weeks)
        total += w.days.reduce((sum, d) => sum + inDay(d), 0);
    return total;
}
exports.ACHIEVEMENTS = [
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
        description: 'Fully fund one of your savings goals.',
        check: s => s.goals.active.some(g => g.kind === 'financial' && g.target > 0 && g.saved >= g.target),
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
function checkAchievements(s) {
    const unlocked = [];
    for (const a of exports.ACHIEVEMENTS) {
        const flag = `ach:${a.id}`;
        if (s.world.flags.includes(flag))
            continue;
        if (a.check(s))
            unlocked.push(a.id);
    }
    return unlocked;
}
const isUnlocked = (s, id) => s.world.flags.includes(`ach:${id}`);
exports.isUnlocked = isUnlocked;
