"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_PER_DAY = exports.getDef = exports.SCHOOL_MISSIONS = exports.hasMark = exports.markKey = void 0;
exports.missionDefs = missionDefs;
exports.initialMissionRuntime = initialMissionRuntime;
exports.missionWindowOpen = missionWindowOpen;
exports.makeAvailable = makeAvailable;
exports.missionsOnMinute = missionsOnMinute;
exports.missionsOnEvent = missionsOnEvent;
exports.missionsOnDayStart = missionsOnDayStart;
exports.buildJournal = buildJournal;
exports.trackedMission = trackedMission;
/**
 * MoniMate — scheduled mission engine.
 *
 * Missions never "pop up". Each one has: an availability window (day + time), an expiry, a trigger
 * (time / location / NPC interaction / world event / another mission), prerequisites, a priority and a
 * completion condition. The engine only ever reads the central clock (`state.minutes`) and the events
 * the store emits — it has no timers of its own.
 */
const clock_1 = require("./clock");
Object.defineProperty(exports, "MIN_PER_DAY", { enumerable: true, get: function () { return clock_1.MIN_PER_DAY; } });
const WK = [0, 1, 2, 3, 4];
const attendedToday = (s) => (0, exports.hasMark)(s, 'at_school');
/** THIS WEEK's completion — unlike a flag in world.flags (which never clears), a mission's own
 *  runtime resets to 'locked' every Monday (see missionsOnDayStart), so this correctly re-gates
 *  each step of a weekly chain instead of staying permanently unlocked after its first-ever week. */
const doneThisWeek = (s, id) => s.missions.find(m => m.id === id)?.state === 'completed';
/** Completed OR missed this week. Story beats later in the week wait on this, never on
 *  `doneThisWeek`, so one missed moment can't soft-lock the rest of the week (the consequence of
 *  missing it lives in flags/relationships instead). */
const resolvedThisWeek = (s, id) => {
    const st = s.missions.find(m => m.id === id)?.state;
    return st === 'completed' || st === 'expired';
};
/** Rode a bus at least once this week (today or an earlier day). */
const rodeBusThisWeek = (s) => s.today.travel.includes('bus') || s.weekDays.some(d => d.travel.includes('bus'));
const markKey = (name, day) => `${name}:${day}`;
exports.markKey = markKey;
const hasMark = (s, name, day = (0, clock_1.parts)(s.minutes).day) => s.world.dailyMarks.includes((0, exports.markKey)(name, day));
exports.hasMark = hasMark;
// ── School-student week ────────────────────────────────────────────────────
exports.SCHOOL_MISSIONS = [
    {
        // MISSION 1 of "Make It to Friday" — the week's whole budget is handed over right here, on
        // screen, so the player knows exactly what they're working with before anything else happens.
        id: 'pocket_money', kind: 'main', priority: 200, name: 'Make It to Friday', emoji: '🌅',
        journalText: "Mum has sent your $35 for the week — it has to last until Friday. You already promised Riley $5 for her birthday.",
        storySetup: "It's Monday morning. Your phone buzzes on the bedside table.",
        paths: ['school'], repeat: 'weekly',
        // A phone message, not a face-to-face talk: it arrives the moment the week starts and waits for
        // you wherever you are, so a player who heads straight outside can't miss the week's budget.
        window: { days: [0], from: (0, clock_1.hm)(7), until: (0, clock_1.hm)(23, 59) },
        trigger: { type: 'time' },
        steps: [{
                id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'Mum', npcId: 'mum', remote: true,
                lines: [
                    "Morning! I've sent you $35 — it needs to last you until Friday.",
                    "You're covering your own bus fares and lunches this week, and Ms Patel mentioned a project needing supplies.",
                    "Oh — and don't forget, you told Riley you'd chip in $5 for her birthday.",
                ],
                choices: [{ id: 'take', label: '💵 Thanks Mum! (+$35)', sublabel: 'Five days, a project and a birthday to plan around', cost: 35, minutes: 1, relationship: 1, consequence: 'The $35 lands in your account.', flags: ['got_pocket_money', 'week_started'], finish: true }],
            }],
        rewards: { xp: 20, message: 'Pocket money in hand. The week begins — make it to Friday.', flag: 'pocket_money_done' },
    },
    {
        // MISSION 2 — locked (via `requires`) until pocket_money is actually done on Monday, so the
        // player can never end up choosing how to get to school before they know what they have to
        // spend. Tue–Fri the gate is a no-op (it only checks Monday), so the daily commute keeps working.
        id: 'get_to_school', kind: 'timed', priority: 190, name: 'Get to School', emoji: '🏫',
        journalText: 'Be at school before the 8:30 AM bell. Walking is free but takes ~25 min; Route 1 from Home St takes ~13 min and costs $2.',
        storySetup: 'School starts at 8:30. How you get there costs either time or money — your call.',
        destination: 'university', paths: ['school'], repeat: 'daily',
        window: { days: WK, from: (0, clock_1.hm)(7), until: (0, clock_1.hm)(8, 30) },
        trigger: { type: 'time' },
        requires: s => (0, clock_1.parts)(s.minutes).dayOfWeek !== 0 || doneThisWeek(s, 'pocket_money'),
        // No menu here on purpose. Walking really costs walking time on the clock; the bus really
        // costs the $2 fare at the stop. The choice is made with your feet, not a dialogue box, and the
        // Friday recap totals up what the bus actually cost you this week.
        steps: [
            { id: 's1', place: 'university', waypoint: 'School', lines: [], completeOnArrival: true },
        ],
        rewards: { xp: 15, message: 'Made it to school on time.', flag: 'on_time' },
        onExpire: { message: "You're late — the bell has gone.", flags: ['late_to_school'] },
    },
    {
        id: 'lunch_break', kind: 'daily', priority: 60, name: 'Lunch Break', emoji: '🍟',
        journalText: "Lunch is 12:30–1:30. Jordan is heading to the canteen.",
        storySetup: 'The lunch bell rings. Jordan waves you over to the canteen.',
        destination: 'university', paths: ['school'], repeat: 'daily',
        window: { days: WK, from: (0, clock_1.hm)(12, 30), until: (0, clock_1.hm)(13, 30) },
        trigger: { type: 'location', place: 'university' },
        requires: attendedToday,
        steps: [{
                id: 's1', place: 'university', waypoint: 'Canteen', speaker: 'Jordan', npcId: 'jordan',
                lines: ['Oi, come get lunch with me!', "I'm getting chips and a drink. You in?"],
                choices: [
                    { id: 'meal', label: '🍟 Chips & drink ($6)', sublabel: 'Go with Jordan', category: 'food', cost: -6, minutes: 30, relationship: 1, social: true, consequence: 'You and Jordan grab lunch together. Good fun.', lesson: 'Canteen meals add up — $6 a day is $30 a week.', flags: ['bought_canteen'], finish: true },
                    { id: 'snack', label: '🍎 Just a snack ($3)', sublabel: 'Small bite, save some', category: 'food', cost: -3, minutes: 30, consequence: "A snack bar. Jordan doesn't mind — you still chat.", flags: ['bought_snack'], finish: true },
                    { id: 'packed', label: '🥪 Eat what I brought', sublabel: 'Free — you planned ahead', cost: 0, minutes: 30, relationship: -1, consequence: 'Packed lunch. Jordan teases you, all good.', lesson: 'Bringing lunch can save $30+ a week.', flags: ['ate_home_lunch'], finish: true },
                    { id: 'skip', label: '❌ Skip lunch', sublabel: 'Save the money', cost: 0, minutes: 10, relationship: -1, consequence: "You save the cash, but by 2pm you can't focus.", lesson: "Skipping meals to save money isn't always worth it.", flags: ['skipped_lunch'], finish: true },
                ],
            }],
        rewards: { xp: 15, message: "Lunch sorted. How's the budget looking?" },
    },
    {
        id: 'after_school_snack', kind: 'dynamic', priority: 40, name: 'After-School Temptation', emoji: '🥡',
        journalText: 'Riley is hanging out by the food truck in the park after school.',
        storySetup: 'A noodle truck is parked at the park and Riley is standing right in front of it.',
        destination: 'park', paths: ['school'], repeat: 'daily',
        window: { days: WK, from: (0, clock_1.hm)(15, 40), until: (0, clock_1.hm)(17, 0) },
        trigger: { type: 'interaction', npcId: 'riley' },
        steps: [{
                id: 's1', place: 'park', waypoint: 'Food truck', speaker: 'Riley', npcId: 'riley',
                lines: ['Hey! That noodle truck smells amazing.', "I've got $5. Noodle cups are $4."],
                choices: [
                    { id: 'noodles', label: '🍜 Noodles ($4)', sublabel: 'Sounds good', category: 'food', cost: -4, minutes: 20, relationship: 1, social: true, consequence: 'You and Riley eat noodles on the walk home.', flags: ['bought_stall'], finish: true },
                    { id: 'decline', label: '👋 Decline — I\'m good', sublabel: 'Save your money', cost: 0, minutes: 2, consequence: 'You head home. Riley waves.', lesson: 'Saying no to impulse food is the easiest way to save.', finish: true },
                    { id: 'home', label: '🏠 Suggest food at home', sublabel: 'Free and better', cost: 0, minutes: 10, relationship: 1, social: true, consequence: 'Riley loves the idea. Toast at yours. Easy win.', lesson: 'Suggesting a free alternative saves money without hurting friendships.', finish: true },
                ],
            }],
        rewards: { xp: 15, message: 'Snack decision made.' },
    },
    {
        id: 'pickup_groceries', kind: 'timed', priority: 80, name: 'Pick Up Groceries', emoji: '🛒',
        journalText: 'Mum needs milk, bread and eggs ($11.80). She gave you $15. Supermarket closes at 9 PM, but Mum wants it by 7.',
        storySetup: 'Mum messages you as you get home from school.',
        destination: 'supermarket', paths: ['school'], repeat: 'weekly',
        // Step 13 fix: this was `days: [1]` (Tuesday, per this codebase's day%7 convention — see
        // clock.ts's ClockParts.day doc "0 = Monday week 1" and DAY_NAMES[0]='Monday'), which
        // contradicted this mission's own storySetup ("Mum messages you as you get home from school",
        // i.e. the same day the player attends class) and the blueprint's Monday vertical slice, which
        // lists the parent errand as part of Monday's chain. Every other weekly Monday-scheduled
        // mission in this file (pocket_money, school_project — see its own "Announced Monday, due
        // Wednesday" comment) already uses `days: [0]`. No other code or comment anywhere references
        // Tuesday for this mission (confirmed by a full-repo search) — `days: [1]` was an authoring
        // off-by-one, not an intentional design choice.
        window: { days: [0], from: (0, clock_1.hm)(15, 30), until: (0, clock_1.hm)(19, 0) },
        trigger: { type: 'location', place: 'home' },
        requires: attendedToday,
        steps: [
            {
                id: 's1', place: 'home', waypoint: 'Read Mum\'s message', speaker: 'Mum', npcId: 'mum', remote: true,
                lines: ['Can you pick up some milk and bread on your way?', 'Milk $3.50, bread $2.80, eggs $5.50 — $11.80 total.', "I'm sending $15. Keep the change if you're under budget."],
                choices: [{ id: 'ok', label: '👍 On it', sublabel: 'Head to the supermarket', cost: 15, minutes: 1, consequence: 'You pocket the $15 and grab your keys.', flags: ['errand_accepted'] }],
            },
            {
                // Real shopping, not a scripted choice: walk up to any milk, any bread and any eggs on the
                // shelf and buy them (E), in whichever brand/tier you want — then walk back out the door.
                id: 's2', place: 'supermarket', waypoint: 'Supermarket', speaker: 'Mum',
                lines: ["Mum's list: milk, bread and eggs — about $11.80 all up.", 'Grab one of each from the shelves, then head back out.'],
                awaitsPurchase: true,
                purchaseNeeds: ['milk_', 'bread_', 'eggs_'],
                purchaseBudget: 11.8,
            },
        ],
        rewards: { xp: 40, money: 2, message: 'Errand done! Mum gives you $2 for helping.', flag: 'errand_done' },
        onExpire: { message: "You didn't make it to the supermarket. Mum had to go herself.", flags: ['errand_missed'], relationship: { npc: 'Mum', delta: -1 } },
    },
    {
        // MISSION 4 — a real shopping-list objective (Rule 27/28, same engine as the grocery errand):
        // three specific items, real prices, the player picks brand/tier, and being late costs a
        // relationship hit rather than blocking anything. Announced Monday, due Wednesday — the player
        // decides whether to get it done straight away or leave it and risk a Wednesday-night scramble.
        id: 'school_project', kind: 'main', priority: 170, name: 'School Project Supplies', emoji: '📐',
        journalText: 'Ms Patel needs poster board ($4), markers ($5) and glue ($2) for Friday\'s project — about $11 total. Get them from the Bookshop by Wednesday 5:30 PM.',
        storySetup: "Ms Patel reminds the class: Friday's project needs real supplies, bought yourselves.",
        destination: 'shop_small', paths: ['school'], repeat: 'weekly',
        // Announced in class: it opens once you've attended a lesson (Monday, or Tuesday if you skipped
        // Monday). If you never make it to class before Wednesday, you never hear about it — and the
        // recap shows it.
        window: { days: [0], from: (0, clock_1.hm)(12), until: (0, clock_1.hm)(17, 30), spanDays: 2 },
        trigger: { type: 'time' },
        requires: s => doneThisWeek(s, 'pocket_money') && attendedToday(s),
        steps: [
            {
                id: 's1', place: 'university', waypoint: 'Ms Patel (Classroom)', speaker: 'Ms Patel', npcId: 'teacher', withNpc: true,
                lines: ["Before you go — Friday's project needs poster board, markers and glue. About $11 all up.", 'The Bookshop has them. Get them by Wednesday, please.'],
                choices: [{ id: 'noted', label: '📝 Got it', sublabel: 'Bookshop, by Wednesday', cost: 0, minutes: 1, consequence: 'You add it to your list.' }],
            },
            {
                id: 's2', place: 'shop_small', waypoint: 'Bookshop', speaker: 'Ms Patel',
                lines: ['You need poster board, markers and glue — about $11 all up.'],
                awaitsPurchase: true,
                purchaseNeeds: ['poster_', 'markers_', 'glue_'],
                purchaseBudget: 11,
            },
        ],
        rewards: { xp: 30, message: 'Project supplies sorted — Friday is covered.', flag: 'school_project_done' },
        onExpire: { message: "You never got the supplies. Ms Patel isn't impressed — you'll have to improvise Friday.", flags: ['school_project_missed'] },
    },
    {
        id: 'homework', kind: 'daily', priority: 35, name: 'Homework', emoji: '📚',
        journalText: 'Homework and free time between 7 PM and bed.',
        storySetup: 'Dinner is done. You have a couple of hours before bed.',
        destination: 'home', paths: ['school'], repeat: 'daily',
        window: { days: WK, from: (0, clock_1.hm)(19), until: (0, clock_1.hm)(21, 30) },
        trigger: { type: 'location', place: 'home' },
        steps: [{
                id: 's1', place: 'home', waypoint: 'Desk',
                lines: ['You have some time before bed. How do you spend it?'],
                choices: [
                    { id: 'study', label: '📚 Do homework', sublabel: 'About 1 hour', cost: 0, minutes: 60, consequence: 'Homework finished. You feel ready for tomorrow.', flags: ['did_homework'], finish: true },
                    { id: 'free', label: '🎮 Free time', sublabel: 'Homework can wait', cost: 0, minutes: 60, consequence: 'Fun, but the homework is still there.', finish: true },
                ],
            }],
        rewards: { xp: 10, message: 'Evening sorted.' },
    },
    {
        // MISSION 5 — the birthday promise made in Mum's very first message comes due. This is where
        // earlier decisions actually bite: the choice offered is the same for everyone, but what it
        // COSTS you (relative to what you have left) depends entirely on how you spent Monday–Wednesday.
        id: 'friend_birthday', kind: 'main', priority: 160, name: "Riley's Birthday", emoji: '🎂',
        journalText: "You promised Riley $5 for her birthday. She's collecting before Friday.",
        storySetup: "Riley catches you between classes: \"Don't forget my birthday thing — still good for the $5?\"",
        destination: 'university', paths: ['school'], repeat: 'weekly',
        // Wednesday and Thursday, anywhere you run into Riley (school, the park after school). Talking
        // to her is the trigger; the conversation happens right there.
        window: { days: [2], from: (0, clock_1.hm)(8), until: (0, clock_1.hm)(17), spanDays: 1 },
        trigger: { type: 'interaction', npcId: 'riley' },
        steps: [{
                id: 's1', place: 'university', waypoint: 'Find Riley', speaker: 'Riley', npcId: 'riley', withNpc: true,
                lines: ["Don't forget my birthday thing Friday!", "You said you'd chip in $5 — still good for it?"],
                choices: [
                    { id: 'full', label: '🎁 Give the full $5', sublabel: 'A promise is a promise', category: 'gift', cost: -5, minutes: 10, relationship: 2, consequence: 'Riley grins. "Knew I could count on you."', flags: ['birthday_contributed'], finish: true },
                    { id: 'partial', label: '🪙 Give $2, explain the rest', sublabel: "Money's tight this week", category: 'gift', cost: -2, minutes: 10, relationship: 0, consequence: 'Riley shrugs. "All good, it\'s the thought that counts."', lesson: 'Being upfront about a tight budget usually goes fine.', flags: ['birthday_partial'], finish: true },
                    { id: 'decline', label: "😬 I can't this time", sublabel: 'Keep every dollar', cost: 0, minutes: 5, relationship: -2, consequence: 'Riley looks a bit hurt but says nothing more.', lesson: 'Breaking a money promise to a friend has a real social cost.', flags: ['birthday_declined'], finish: true },
                ],
            }],
        rewards: { xp: 25, message: "Riley's birthday sorted, one way or another.", flag: 'birthday_resolved' },
        onExpire: { message: "You never caught up with Riley about the birthday money. She noticed.", flags: ['birthday_declined'], relationship: { npc: 'Riley', delta: -2 } },
    },
    {
        // MISSION 6 (OPTIONAL) — deliberately gated behind the birthday being resolved first, so the
        // fun spending decision comes AFTER the obligation, not before it (Rule 13: competing priorities
        // should actually compete, in the right order).
        id: 'arcade_invite', kind: 'side', priority: 60, name: 'Arcade Invite', emoji: '🕹️',
        journalText: 'Jordan wants everyone at the Mall arcade after school — $8 in, or skip it and keep the cash.',
        storySetup: 'Thursday afternoon. Jordan is hyping up a trip to the arcade.',
        destination: 'mall', paths: ['school'], repeat: 'weekly',
        // Jordan texts the invite at 3:35; the decision happens when you walk into the Mall (he's there).
        // Not going at all just lets it expire — a real (small) social cost, see onExpire.
        window: { days: [3], from: (0, clock_1.hm)(15, 35), until: (0, clock_1.hm)(19, 0) },
        trigger: { type: 'time' },
        requires: s => resolvedThisWeek(s, 'friend_birthday'),
        steps: [{
                id: 's1', place: 'mall', waypoint: 'Arcade', speaker: 'Jordan', npcId: 'jordan',
                lines: ['Arcade run after school — you in?', 'Tokens are about $8. Riley and Sam are already coming.'],
                choices: [
                    { id: 'arcade', label: '🕹️ Go all in ($8, 2 hrs)', sublabel: 'Full arcade session', category: 'entertainment', cost: -8, minutes: 120, relationship: 2, social: true, consequence: 'Great afternoon. You feel part of the crew.', flags: ['arcade_visit'], finish: true, energyCost: 8 },
                    { id: 'spend_less', label: '🪙 Go, but spend less ($5, 1.5 hrs)', sublabel: 'A couple of games, then watch', category: 'entertainment', cost: -5, minutes: 90, relationship: 1, social: true, consequence: 'You play a bit, then hang out. Still fun, still $3 saved.', finish: true, energyCost: 5 },
                    { id: 'park', label: '🌳 Suggest the park instead', sublabel: 'Free alternative', cost: 0, minutes: 90, relationship: 1, social: true, consequence: 'Everyone agrees. A genuinely great time, for free.', lesson: 'Free activities can be just as fun — suggesting them is its own skill.', flags: ['park_alternative'], finish: true, energyCost: 5 },
                    { id: 'home', label: '🏠 Head home', sublabel: 'Keep the whole $8', cost: 0, minutes: 5, relationship: -1, consequence: 'Jordan sends a "next time?" text.', finish: true },
                ],
            }],
        rewards: { xp: 20, message: 'Thursday afternoon sorted.' },
        onExpire: { message: 'You never showed at the arcade. Jordan sends a "next time?" text.', relationship: { npc: 'Jordan', delta: -1 } },
    },
    {
        // MISSION 7 — a controlled (not random) curveball: a small transport hiccup that trades money
        // against time, the same axis every choice in this chain has used, so it reads as one more of
        // the week's real decisions rather than a gimmick.
        id: 'unexpected_event', kind: 'main', priority: 150, name: 'Unexpected Expense', emoji: '⚡',
        journalText: "Your bus card's come up short on the way home — pay the gap or walk it off.",
        storySetup: 'Thursday evening. The bus reader beeps red — you\'re short by a few dollars.',
        destination: 'home', paths: ['school'], repeat: 'weekly',
        window: { days: [3], from: (0, clock_1.hm)(16), until: (0, clock_1.hm)(21) },
        trigger: { type: 'time' },
        // A bus-card top-up only makes sense if you've actually been riding the bus this week.
        requires: s => resolvedThisWeek(s, 'friend_birthday') && rodeBusThisWeek(s),
        steps: [{
                id: 's1', place: 'home', waypoint: 'Sort out the fare', remote: true,
                lines: ["The bus card reader beeps — you're $3 short.", 'Top it up now, or hop off and walk the rest of the way.'],
                choices: [
                    { id: 'pay', label: '💳 Top up ($3, 10 min)', sublabel: 'Stay on the bus', category: 'transport', cost: -3, minutes: 10, consequence: 'Sorted in seconds. Home before dark.', flags: ['unexpected_paid'], finish: true },
                    { id: 'walk', label: '🚶 Get off and walk (free, +25 min)', sublabel: 'Save the $3', cost: 0, minutes: 25, consequence: "You walk the rest of the way. Tired, but $3 richer than you'd have been.", lesson: 'Time can substitute for money — but not always, and not for everyone.', flags: ['unexpected_walked'], energyCost: 5, finish: true },
                ],
            }],
        rewards: { xp: 15, message: 'That could have gone worse.', flag: 'unexpected_handled' },
    },
    {
        // MISSION 8 — Friday. Nothing here is scripted moralising: the actual numbers (what's left,
        // what got done, what didn't) come from real state, computed and shown by the store the moment
        // this completes (see GameStore.completeMission's friday_recap special-case).
        id: 'friday_recap', kind: 'main', priority: 140, name: 'Made It to Friday', emoji: '📅',
        journalText: 'Friday, after school: find Mum and see how the week actually went.',
        storySetup: "It's Friday. The week you budgeted for Monday morning is almost over.",
        destination: 'home', paths: ['school'], repeat: 'weekly',
        // Always reachable: Friday after school through Sunday night, whenever you're home. Whatever
        // happened (or didn't) this week, the recap reports it — it never waits on another mission.
        window: { days: [4], from: (0, clock_1.hm)(15, 30), until: (0, clock_1.hm)(23), spanDays: 2 },
        trigger: { type: 'location', place: 'home' },
        steps: [{
                id: 's1', place: 'home', waypoint: 'Talk to Mum', speaker: 'Mum', npcId: 'mum',
                lines: ["Well — you made it to Friday.", 'How did the money go?'],
                choices: [{ id: 'reflect', label: '💬 Look back on the week', sublabel: 'See how it went', cost: 0, minutes: 20, relationship: 2, consequence: 'Mum listens, and you both look at how the week actually went.', flags: ['level1_complete'], finish: true }],
            }],
        rewards: { xp: 100, message: 'Week one down. Monday, the $35 starts again — see if you do anything differently.', flag: 'level1_complete' },
    },
];
function missionDefs(path) {
    return path === 'school' ? exports.SCHOOL_MISSIONS : [];
}
const getDef = (defs, id) => defs.find(d => d.id === id);
exports.getDef = getDef;
function initialMissionRuntime(defs) {
    return defs.map(d => ({ id: d.id, state: 'locked', stepIndex: 0 }));
}
/** Is this mission's availability window open at `minutes`? */
function missionWindowOpen(def, minutes) { return windowOpen(def, minutes); }
function windowOpen(def, minutes) {
    const p = (0, clock_1.parts)(minutes);
    const w = def.window;
    const span = w.spanDays ?? 0;
    for (let back = 0; back <= span; back++) {
        const openDay = p.day - back;
        if (openDay < 0)
            continue;
        if (!w.days.includes(openDay % 7))
            continue;
        if (back === 0 && p.minuteOfDay >= w.from && (span > 0 || p.minuteOfDay < w.until))
            return true;
        if (back > 0 && (back < span || p.minuteOfDay < w.until))
            return true;
    }
    return false;
}
function expiryFor(def, minutes) {
    const p = (0, clock_1.parts)(minutes);
    const span = def.window.spanDays ?? 0;
    // find the opening day this window belongs to
    for (let back = 0; back <= span; back++) {
        const openDay = p.day - back;
        if (openDay >= 0 && def.window.days.includes(openDay % 7))
            return (0, clock_1.at)(openDay + span, 0, def.window.until);
    }
    return (0, clock_1.at)(p.day, 0, def.window.until);
}
function makeAvailable(s, rt, def, emit) {
    rt.state = 'available';
    rt.becameAvailableAt = s.minutes;
    rt.expiresAt = expiryFor(def, s.minutes);
    emit({ type: 'mission_available', missionId: rt.id });
}
/** Called once per game minute. Handles time triggers, expiry and daily/weekly resets. */
function missionsOnMinute(s, defs, emit, onExpired) {
    for (const rt of s.missions) {
        const def = (0, exports.getDef)(defs, rt.id);
        if (!def)
            continue;
        if (rt.state === 'available' || rt.state === 'active') {
            if (rt.expiresAt !== undefined && s.minutes >= rt.expiresAt) {
                rt.state = 'expired';
                rt.finishedAt = s.minutes;
                emit({ type: 'mission_expired', missionId: rt.id });
                onExpired(def, rt);
            }
            continue;
        }
        if (rt.state !== 'locked')
            continue;
        if (!def.paths.includes(s.lifePath))
            continue;
        // An obligation (a mission with `onExpire`) whose window came and went without the player ever
        // triggering it counts as missed, exactly like one they started and abandoned. Without this, a
        // never-triggered mission stayed 'locked' forever and anything waiting on it could never open.
        if (def.onExpire && rt.expiresAt !== undefined && s.minutes >= rt.expiresAt) {
            rt.state = 'expired';
            rt.finishedAt = s.minutes;
            emit({ type: 'mission_expired', missionId: rt.id });
            onExpired(def, rt);
            continue;
        }
        if (!windowOpen(def, s.minutes))
            continue;
        if (def.requires && !def.requires(s))
            continue;
        // Remember when this window's occurrence ends, so the missed-obligation check above can fire.
        if (rt.expiresAt === undefined)
            rt.expiresAt = expiryFor(def, s.minutes);
        const t = def.trigger;
        if (t.type === 'time')
            makeAvailable(s, rt, def, emit);
        else if (t.type === 'completion' && s.missions.find(m => m.id === t.missionId)?.state === 'completed')
            makeAvailable(s, rt, def, emit);
        else if (t.type === 'location' && s.player.place === t.place)
            makeAvailable(s, rt, def, emit); // already there when the window opens
        else if (rt.triggered)
            makeAvailable(s, rt, def, emit);
    }
}
/** Feed store events in; event-driven triggers flip `triggered`, and arrival completes 'arrive' steps. */
function missionsOnEvent(s, defs, ev, complete) {
    for (const rt of s.missions) {
        const def = (0, exports.getDef)(defs, rt.id);
        if (!def || !def.paths.includes(s.lifePath))
            continue;
        if (rt.state === 'locked' && windowOpen(def, s.minutes) && (!def.requires || def.requires(s))) {
            const t = def.trigger;
            if (t.type === 'location' && ev.type === 'entered_place' && ev.placeId === t.place)
                rt.triggered = true;
            if (t.type === 'interaction' && ev.type === 'talked_to' && ev.npcId === t.npcId)
                rt.triggered = true;
            if (t.type === 'world' && ev.type === 'bus_arrived' && ev.stopId === t.stopId)
                rt.triggered = true;
        }
        // arrive-style completion (e.g. Get to School): reaching the place while the mission is available/active
        if ((rt.state === 'available' || rt.state === 'active') && ev.type === 'entered_place') {
            const step = def.steps[rt.stepIndex];
            if (step?.completeOnArrival && ev.placeId === step.place)
                complete(rt, def, 'arrived');
        }
    }
}
/** Reset repeating missions at the start of each day / week. */
function missionsOnDayStart(s, defs, newDay) {
    const newWeek = newDay % 7 === 0;
    for (const rt of s.missions) {
        const def = (0, exports.getDef)(defs, rt.id);
        if (!def)
            continue;
        const reset = def.repeat === 'daily' || (def.repeat === 'weekly' && newWeek);
        if (reset && rt.state !== 'active') {
            rt.state = 'locked';
            rt.stepIndex = 0;
            rt.triggered = false;
            rt.becameAvailableAt = undefined;
            rt.expiresAt = undefined;
            rt.outcome = undefined;
            rt.finishedAt = undefined;
        }
    }
}
function buildJournal(s, defs) {
    const today = (0, clock_1.parts)(s.minutes).day;
    const j = { active: [], optional: [], completed: [], missed: [], upcoming: [] };
    for (const rt of s.missions) {
        const def = (0, exports.getDef)(defs, rt.id);
        if (!def)
            continue;
        const step = def.steps[Math.min(rt.stepIndex, def.steps.length - 1)];
        const entry = {
            id: def.id, name: def.name, emoji: def.emoji, kind: def.kind, text: def.journalText, state: rt.state,
            deadline: rt.expiresAt, destination: def.destination ?? step?.place, priority: def.priority,
        };
        if (rt.state === 'available' || rt.state === 'active') {
            const mandatory = def.kind === 'main' || def.kind === 'timed';
            (mandatory ? j.active : j.optional).push(entry);
        }
        else if (rt.state === 'completed' && rt.finishedAt !== undefined && (0, clock_1.parts)(rt.finishedAt).day === today)
            j.completed.push(entry);
        else if (rt.state === 'expired' && rt.finishedAt !== undefined && (0, clock_1.parts)(rt.finishedAt).day === today)
            j.missed.push(entry);
        // Known future commitments (Rule 32): the rest of THIS week's main story chain, even before it
        // unlocks, so the player always knows what's still coming — never a surprise popup out of nowhere.
        else if (rt.state === 'locked' && def.kind === 'main')
            j.upcoming.push(entry);
    }
    const byPri = (a, b) => b.priority - a.priority;
    j.active.sort(byPri);
    j.optional.sort(byPri);
    j.upcoming.sort(byPri);
    return j;
}
/** The mission whose destination the minimap should highlight (highest priority active, then available timed/main). */
function trackedMission(s, defs) {
    const live = s.missions
        .map(rt => ({ rt, def: (0, exports.getDef)(defs, rt.id) }))
        .filter(x => x.def && (x.rt.state === 'active' || x.rt.state === 'available'))
        .sort((a, b) => (b.rt.state === 'active' ? 1000 : 0) + b.def.priority - ((a.rt.state === 'active' ? 1000 : 0) + a.def.priority));
    const top = live[0];
    if (!top)
        return null;
    const step = top.def.steps[Math.min(top.rt.stepIndex, top.def.steps.length - 1)];
    return { def: top.def, rt: top.rt, placeId: top.rt.state === 'active' ? step.place : (top.def.destination ?? step.place) };
}
