/**
 * MoniMate — University path, Level 1: "First Week".
 *
 * First week flatting in Hamilton. StudyLink's living-costs payment lands on Monday; the week is
 * rent, a textbook you can't really afford, a weekly shop, Clubs Day, a job to find (and the tax
 * code that comes with it), a flat power bill, one thing that breaks, and a Sunday video call with
 * Mum that reads back what you actually did.
 *
 * Same engine as the School week (blueprint section 26): these are ordinary MissionDefs — windows,
 * triggers, phone messages, walk-in steps, shelf shopping, consequences — with University content.
 * Week-only flags start with `wk_` so they're cleared when the next StudyLink payment arrives.
 */
import { hm } from '../clock';
import type { MissionChoice, MissionDef } from '../missions';
import type { GameState } from '../types';
import { attendedToday, doneThisWeek, hasFlag } from '../missionUtil';

const WK = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const UNI: MissionDef['paths'] = ['university'];
const hasTextbook = (s: GameState) => ['wk_textbook_new', 'wk_textbook_used', 'wk_textbook_library'].some(f => hasFlag(s, f));
/** Did the weekly shop this week — judged by how the errand actually ended, not merely by it being
 *  closed ("I'll wing it" also closes it). */
export const didWeeklyShop = (s: GameState) => {
  const rt = s.missions.find(m => m.id === 'uni_big_shop');
  return rt?.state === 'completed' && rt.outcome !== 'skip';
};

/** Lunch on campus: that day's hot food, cup noodles, leftovers if you did a shop, or nothing. */
function uniLunch(hot: [string, number, number]): MissionChoice[] {
  const [label, price, energy] = hot;
  return [
    { id: 'hot', label: `${label} ($${price.toFixed(2)})`, sublabel: `With Mei · +${energy} energy`, category: 'food', cost: -price, minutes: 40, energyRestore: energy, social: true, consequence: 'Good food, good company.', lesson: `$${price.toFixed(2)} a day is $${(price * 5).toFixed(2)} a week — a third of the rent.`, finish: true },
    { id: 'noodles', label: '🍜 Cup noodles ($1.20)', sublabel: '+5 energy', category: 'food', cost: -1.2, minutes: 15, energyRestore: 5, consequence: 'Salty, cheap, done.', finish: true },
    { id: 'leftovers', label: '🍝 Last night\'s pasta', sublabel: 'Free — you did a shop · +12 energy', cost: 0, minutes: 20, energyRestore: 12, consequence: 'Microwaved leftovers. Honestly great.', lesson: 'Cooking extra at dinner is a free lunch tomorrow.', finish: true,
      hideIf: s => !didWeeklyShop(s) },
    { id: 'skip', label: '❌ Skip lunch', sublabel: 'Save money · -10 energy', cost: 0, minutes: 5, energyCost: 10, consequence: 'By 3 PM you are reading the same line over and over.', finish: true },
  ];
}

// ── The scripted week ────────────────────────────────────────────────────────
export const UNI_MISSIONS: MissionDef[] = [
  // MONDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'uni_payday', kind: 'main', priority: 200, name: 'StudyLink Day', emoji: '🎓',
    journalText: 'StudyLink pays your $316 living-costs loan every Monday. $200 of it is rent.',
    storySetup: 'Monday morning in your new flat. Your phone buzzes.',
    paths: UNI, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'StudyLink', remote: true,
      lines: [
        'Your living costs payment of $316.00 has been paid into your account.',
        'Reminder: living costs are part of your student loan. You repay it once you earn over the threshold.',
      ],
      choices: [{
        id: 'take', label: '🎓 Paid! (+$316)', sublabel: 'Rent $200 · food, books and power to come', category: 'income', cost: 316, minutes: 1,
        effect: 'student_loan_draw', consequence: '$316 lands. $200 of it already belongs to your landlord.',
        lesson: 'Living-costs payments are borrowed money — they add to your student loan.', flags: ['week_started'], finish: true,
      }],
    }],
    rewards: { xp: 20, message: 'The week begins. $316 has to last until next Monday.' },
  },
  {
    id: 'uni_pick_goal', kind: 'main', priority: 199, name: "This Week's Goal", emoji: '🎯',
    journalText: 'Pick one goal for your first week. Mum asks how it went on Sunday.',
    storySetup: 'Your phone asks what matters most this week.',
    paths: UNI, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'uni_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Pick a goal', speaker: 'Goals', remote: true,
      lines: ['$316 in, $200 rent out. What do you want from week one?'],
      choices: [
        { id: 'buffer', label: '🛟 Save a $150 safety buffer', sublabel: 'Money in Savings by Sunday', cost: 0, minutes: 0, setsGoal: 'uni_buffer', consequence: 'Goal set: $150 in savings.', finish: true },
        { id: 'job', label: '💼 Land a part-time job', sublabel: 'Apply Tuesday, interview Wednesday', cost: 0, minutes: 0, setsGoal: 'uni_job', consequence: 'Goal set: get hired.', finish: true },
        { id: 'ready', label: '📚 Nail your first assignment', sublabel: "Textbook sorted + Friday's quiz done", cost: 0, minutes: 0, setsGoal: 'uni_ready', consequence: 'Goal set: be ready for ECON101.', finish: true },
        { id: 'social', label: '🤝 Make friends in week one', sublabel: 'Join a club, stay tight with the flat', cost: 0, minutes: 0, setsGoal: 'uni_social', consequence: 'Goal set: find your people.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    id: 'uni_rent', kind: 'main', priority: 185, name: 'Rent Day', emoji: '🏠',
    journalText: 'Rent is $200 a week. Sam collects it for the landlord — due by Tuesday night.',
    storySetup: 'The flat chat pings.',
    paths: UNI, repeat: 'weekly',
    window: { days: [0], from: hm(9), until: hm(21), spanDays: 1 },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'uni_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ["Rent day 🏠 $200 into the landlord's account by tomorrow night.", "I'll post the screenshot in the flat chat."],
      choices: [
        { id: 'pay', label: '🏠 Pay $200 now', sublabel: 'On time · Sam +1', category: 'housing', cost: -200, minutes: 2, relationship: 1, consequence: 'Paid. Sam sends a 👍 to the flat chat.', lesson: 'Pay the big fixed bill the day the money lands — before it gets spent.', flags: ['wk_rent_paid'], finish: true },
        { id: 'half', label: '🪙 $100 now, $100 Friday', sublabel: "Sam's not thrilled", category: 'housing', cost: -100, minutes: 2, consequence: 'Sam: "ok but Friday for real 😬"', flags: ['wk_rent_half'], finish: true },
        { id: 'later', label: '😬 Can you cover me till Friday?', sublabel: 'Keep $200 for now · Sam -1', cost: 0, minutes: 1, relationship: -1, consequence: 'Sam covers it from his savings. He is not happy.', lesson: 'Asking flatmates to float your rent burns trust fast.', flags: ['wk_rent_late'], finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Rent sorted, one way or another.' },
    onExpire: { message: 'You never paid rent. Sam had to cover you — you owe him $200.', flags: ['wk_rent_late'], relationship: { npc: 'Sam', delta: -2 } },
  },
  {
    // Daily: be on campus for the 10 AM lecture. Arriving completes it; sitting through it happens in
    // the Lecture Theatre (the Attend prompt), exactly like School's class.
    id: 'uni_lecture', kind: 'daily', priority: 100, name: 'ECON101 Lecture', emoji: '🏛️',
    journalText: 'ECON101 is at 10 AM in the Lecture Theatre. Nobody takes attendance — but the quiz is on it.',
    storySetup: 'Your timetable says ECON101, 10 AM.',
    destination: 'university', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(8, 30), until: hm(10, 50) },
    trigger: { type: 'time' },
    steps: [{ id: 's1', place: 'university', waypoint: 'University', lines: [], completeOnArrival: true }],
    rewards: { xp: 5, message: 'Made it to campus.' },
  },
  {
    id: 'uni_first_lecture', kind: 'main', priority: 175, name: 'The Course Outline', emoji: '📋',
    journalText: 'Dr Hughes has something to say about the ECON101 textbook.',
    storySetup: 'The lecture ends. Dr Hughes waves the class back.',
    destination: 'university', paths: UNI, repeat: 'weekly',
    // Straight after your first lecture (Monday, or Tuesday if you skipped Monday).
    window: { days: [0], from: hm(11, 55), until: hm(15, 25), spanDays: 1 },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Dr Hughes (Lecture Theatre)', speaker: 'Dr Hughes', npcId: 'lecturer',
      lines: [
        "One more thing — ECON101 uses 'Principles of Economics'. The first reading is due Thursday.",
        'The Bookshop has it new. Second-hand copies float around, and the library keeps a short-loan copy.',
      ],
      choices: [{ id: 'noted', label: '📝 Noted', sublabel: 'Sort it by Wednesday', cost: 0, minutes: 1, consequence: 'You add "textbook???" to your notes.', flags: ['wk_textbook_told'], finish: true }],
    }],
    rewards: { xp: 10, message: 'Now you know what the course needs.' },
  },
  {
    id: 'uni_textbook', kind: 'main', priority: 170, name: 'The $120 Textbook', emoji: '📕',
    journalText: "ECON101 needs 'Principles of Economics' by Wednesday: $120 new, $45 second-hand, or the library's copy.",
    storySetup: 'You look up the textbook price. You look again.',
    destination: 'shop_small', paths: UNI, repeat: 'weekly',
    window: { days: [0], from: hm(11, 55), until: hm(17, 30), spanDays: 2 },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_textbook_told'),
    steps: [
      {
        id: 's1', place: 'shop_small', waypoint: 'Decide', speaker: 'You', remote: true,
        lines: ["'Principles of Economics' — $120 new at the Bookshop.", 'Jess (2nd year) is selling hers for $45. The library has one short-loan copy.'],
        choices: [
          { id: 'have', label: '✅ Already bought it', sublabel: 'From the Bookshop', cost: 0, minutes: 0, consequence: 'Sorted.', finish: true,
            hideIf: s => !hasFlag(s, 'wk_textbook_new') },
          { id: 'new', label: '📕 Buy it new ($120)', sublabel: 'Head to the Bookshop', cost: 0, minutes: 0, consequence: 'Off to the Bookshop.',
            hideIf: s => hasFlag(s, 'wk_textbook_new') },
          { id: 'used', label: "🤝 Buy Jess's copy ($45)", sublabel: 'A few highlights inside', category: 'shopping', cost: -45, minutes: 20, consequence: 'Jess meets you outside the library. The highlighting is actually helpful.', lesson: 'Second-hand textbooks: the same words for a third of the price.', flags: ['wk_textbook_used'], finish: true,
            hideIf: s => hasFlag(s, 'wk_textbook_new') },
          { id: 'library', label: '🏛️ Use the library copy', sublabel: 'Free · 2-hour loans', cost: 0, minutes: 0, energyCost: 5, consequence: "Free — but you'll be reading it in the library, two hours at a time.", lesson: 'Free options often cost time instead of money.', flags: ['wk_textbook_library'], finish: true,
            hideIf: s => hasFlag(s, 'wk_textbook_new') },
        ],
      },
      {
        id: 's2', place: 'shop_small', waypoint: 'Bookshop', speaker: 'Bookshop',
        lines: ["It's on the shelf by the counter — $120."],
        awaitsPurchase: true,
        purchaseNeeds: ['textbook_'],
        purchaseBudget: 120,
      },
    ],
    rewards: { xp: 25, message: 'Textbook sorted.' },
    onExpire: { message: "No textbook by Wednesday night — Thursday's reading is going to hurt.", flags: ['wk_textbook_none'] },
  },
  {
    id: 'uni_big_shop', kind: 'timed', priority: 160, name: 'Weekly Shop', emoji: '🛒',
    journalText: 'Pasta, rice, milk and eggs — about $12 feeds you most of the week.',
    storySetup: 'The fridge has half a lemon and some mustard.',
    destination: 'supermarket', paths: UNI, repeat: 'weekly',
    window: { days: [0], from: hm(15), until: hm(20, 30), spanDays: 1 },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'uni_payday'),
    steps: [
      {
        id: 's1', place: 'supermarket', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
        lines: ['Flat shop tonight? Everyone buys their own basics.', 'Pasta, rice, milk, eggs — ~$12 does a week of dinners.'],
        choices: [
          { id: 'go', label: "🛒 I'll do my shop", sublabel: 'Supermarket · about $12', cost: 0, minutes: 0, consequence: 'List: pasta, rice, milk, eggs.' },
          { id: 'skip', label: "🍜 I'll wing it", sublabel: 'Takeaways it is', cost: 0, minutes: 0, consequence: 'Sam: "your wallet will not thank you"', lesson: 'A $12 shop is four or five dinners. One takeaway is $15.', flags: ['wk_no_groceries'], finish: true },
        ],
      },
      {
        id: 's2', place: 'supermarket', waypoint: 'Supermarket', speaker: 'Your list',
        lines: ['Pasta, rice, milk and eggs — about $12.', 'Compare brands: the cheapest of each is under $11.'],
        awaitsPurchase: true,
        purchaseNeeds: ['pasta_', 'rice_', 'milk_', 'eggs_'],
        purchaseBudget: 12,
      },
    ],
    rewards: { xp: 30, message: 'Cupboards stocked for the week.' },
    onExpire: { message: 'No food shop this week — the cupboard is bare.', flags: ['wk_no_groceries'] },
  },
  {
    id: 'uni_lunch', kind: 'daily', priority: 60, name: 'Lunch on Campus', emoji: '🍱',
    journalText: 'Lunch between lectures: the student café, cup noodles, or whatever you brought.',
    storySetup: 'Lecture is over and you are starving.',
    paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(12), until: hm(14) },
    trigger: { type: 'location', place: 'university' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Student Café', speaker: 'Student Café', lines: [],
      variants: [
        { lines: ["Today: sushi — $9.50 for the big box."], choices: uniLunch(['🍣 Sushi box', 9.5, 15]) },
        { lines: ['Today: butter chicken and rice, $11.'], choices: uniLunch(['🍛 Butter chicken', 11, 18]) },
        { lines: ['Burrito day! $12.50, huge.'], choices: uniLunch(['🌯 Burrito', 12.5, 20]) },
        { lines: ['Today: pie and a drink, $7.'], choices: uniLunch(['🥧 Pie and a drink', 7, 12]) },
      ],
    }],
    rewards: { xp: 5, message: 'Lunch sorted.' },
  },

  // TUESDAY ───────────────────────────────────────────────────────────────────
  {
    id: 'uni_clubs_day', kind: 'main', priority: 150, name: 'Clubs Day', emoji: '🎪',
    journalText: 'Clubs Day in the campus hub: stalls, free pizza, and sign-up fees.',
    storySetup: 'The campus hub is packed with stalls.',
    destination: 'university', paths: UNI, repeat: 'weekly',
    window: { days: [1], from: hm(11, 55), until: hm(15, 20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Clubs Day (Campus)', speaker: 'Mei', npcId: 'mei',
      lines: ['Clubs Day! Free pizza everywhere 🍕', 'Tramping Club is $30 for the year, Board Games is $5. Or we just eat the pizza.'],
      choices: [
        { id: 'tramping', label: '🥾 Join Tramping Club ($30)', sublabel: 'Weekend trips · gear hire free · Mei +1', category: 'entertainment', cost: -30, minutes: 30, relationship: 1, social: true, consequence: 'You sign up. First trip is in two weeks.', flags: ['wk_club_joined', 'wk_club_tramping'], finish: true },
        { id: 'boardgames', label: '🎲 Join Board Games ($5)', sublabel: 'Thursday nights · Mei +1', category: 'entertainment', cost: -5, minutes: 30, relationship: 1, social: true, consequence: 'Thursday nights, free snacks, $5 for the year.', lesson: 'Cheap clubs are the best-value friendships on campus.', flags: ['wk_club_joined', 'wk_club_boardgames'], finish: true },
        { id: 'pizza', label: '🍕 Just the free pizza', sublabel: '+8 energy', cost: 0, minutes: 20, energyRestore: 8, consequence: 'Three slices, zero commitments.', finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Clubs Day done.' },
  },
  {
    id: 'uni_job_hunt', kind: 'side', priority: 140, name: 'Café Job Ad', emoji: '💼',
    journalText: 'A café job on Student Job Search: 12 hours a week at $23.50/hr.',
    storySetup: 'A job alert.',
    paths: UNI, repeat: 'weekly',
    window: { days: [1], from: hm(15), until: hm(23) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'Student Job Search', speaker: 'Student Job Search', remote: true,
      lines: ['NEW: Café Assistant — 12 hrs/week, $23.50/hr (minimum wage).', 'Apply by tonight. Interviews Wednesday afternoon at the Café.'],
      choices: [
        { id: 'apply', label: '📨 Apply (30 min)', sublabel: 'Polish your CV · 5 energy', cost: 0, minutes: 30, energyCost: 5, consequence: 'CV sent. Interview: Wednesday, 1–4:30 PM at the Café.', lesson: '12 hrs × $23.50 = $282 a week before tax — almost a whole StudyLink payment.', flags: ['wk_applied'], finish: true },
        { id: 'skip', label: '📚 Focus on study for now', sublabel: '', cost: 0, minutes: 0, consequence: 'Maybe next trimester.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Job search done.' },
  },

  // WEDNESDAY ─────────────────────────────────────────────────────────────────
  {
    id: 'uni_interview', kind: 'main', priority: 145, name: 'Café Interview', emoji: '☕',
    journalText: 'Your interview with Leah at the Café: Wednesday, 1–4:30 PM.',
    storySetup: "Leah waves you over to a corner table.",
    destination: 'cafe', paths: UNI, repeat: 'weekly',
    window: { days: [2], from: hm(13), until: hm(16, 30) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_applied'),
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'Café', speaker: 'Leah', npcId: 'leah',
      lines: ['Thanks for coming in!', 'So — any café experience?'],
      choices: [
        { id: 'honest', label: "🙂 \"Not yet — but I learn fast, and I'm free Fridays\"", sublabel: 'Leah +1', cost: 0, minutes: 20, relationship: 1, consequence: 'Leah: "Honest — I like that. Paid trial shift, Friday 1 PM?"', lesson: 'Employers hire attitude. Being upfront beats bluffing.', flags: ['wk_trial_offered'], finish: true },
        { id: 'bluff', label: '😎 "Loads. Basically a barista."', sublabel: 'Sound impressive', cost: 0, minutes: 20, relationship: -1, consequence: 'Leah asks you to make a flat white. You… cannot. "We\'ll be in touch."', lesson: 'Overclaiming gets found out — usually in the first five minutes.', flags: ['wk_interview_bluffed'], finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Interview done.' },
    onExpire: { message: "You missed your interview at the Café. Leah moved on to the next applicant.", flags: ['wk_interview_missed'], relationship: { npc: 'Leah', delta: -1 } },
  },

  // THURSDAY ──────────────────────────────────────────────────────────────────
  {
    id: 'uni_power_bill', kind: 'main', priority: 140, name: 'Flat Power Bill', emoji: '⚡',
    journalText: 'The flat power bill is $180 — $45 each. And Sam wants Sky Sport.',
    storySetup: 'The flat chat lights up.',
    paths: UNI, repeat: 'weekly',
    window: { days: [3], from: hm(18), until: hm(22, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Flat chat', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ['(flat chat) Power bill is in: $180 ⚡ = $45 each.', 'Also… Sky Sport? $32 a month split 4 ways = $8 each 🏉'],
      choices: [
        { id: 'pay', label: '⚡ Pay $45, no to Sky', sublabel: 'Keep bills lean', category: 'housing', cost: -45, minutes: 2, consequence: 'Paid. Sam sulks about the rugby for roughly one minute.', lesson: 'A "small" $8 a month is $96 a year.', flags: ['wk_power_paid', 'wk_sky_no'], finish: true },
        { id: 'sky', label: '🏉 Pay $45 + yes to Sky', sublabel: '+$8 every month · Sam +1', category: 'housing', cost: -45, minutes: 2, relationship: 1, effect: 'subscribe_sky', consequence: 'Paid — and Sky is on. $8 will now leave your account every month.', flags: ['wk_power_paid', 'wk_sky_yes'], finish: true },
        { id: 'later', label: '😬 Pay my share next week', sublabel: 'Sam -1', cost: 0, minutes: 1, relationship: -1, consequence: 'Sam: "…ok." The flat chat goes quiet.', flags: ['wk_power_owed'], finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Bills sorted.' },
    onExpire: { message: "You left the flat hanging on the power bill.", flags: ['wk_power_owed'], relationship: { npc: 'Sam', delta: -1 } },
  },
  {
    id: 'uni_charger', kind: 'main', priority: 135, name: 'Unexpected Expense', emoji: '🔌',
    journalText: "Your laptop charger died — and Friday's quiz is online.",
    storySetup: 'Your laptop screen goes black. The charger light is off.',
    paths: UNI, repeat: 'weekly',
    window: { days: [3], from: hm(12, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Sort out the charger', speaker: 'You', remote: true,
      lines: ["Your laptop charger just died. Friday's quiz is online.", 'Official charger: $89 at the Mall. A generic one online is $25 but takes until Monday.'],
      choices: [
        { id: 'official', label: '🔌 Official charger ($89)', sublabel: 'Fixed today', category: 'shopping', cost: -89, minutes: 40, consequence: 'Works perfectly. That stung.', flags: ['wk_charger_official'], finish: true },
        { id: 'generic', label: "📦 Generic ($25) + borrow Mei's", sublabel: 'Cheap, if Mei says yes', category: 'shopping', cost: -25, minutes: 10, consequence: 'Mei lends you hers till Monday. Legend.', flags: ['wk_charger_generic'], finish: true },
        { id: 'library', label: '🏛️ Use the library computers', sublabel: 'Free · slower · 6 energy', cost: 0, minutes: 0, energyCost: 6, consequence: 'Free, if you don\'t mind the walk and the queue.', lesson: 'An emergency fund turns a crisis like this into an inconvenience.', flags: ['wk_charger_library'], finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Sorted.' },
  },

  // FRIDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'uni_trial_shift', kind: 'main', priority: 150, name: 'Trial Shift', emoji: '☕',
    journalText: 'Paid trial shift at the Café, Friday from 1 PM. Bring your IRD number.',
    storySetup: 'Leah hands you an apron.',
    destination: 'cafe', paths: UNI, repeat: 'weekly',
    window: { days: [4], from: hm(12, 30), until: hm(15, 30) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_trial_offered'),
    steps: [
      {
        id: 's1', place: 'cafe', waypoint: 'Café', speaker: 'Leah', npcId: 'leah',
        lines: ["Great, you're here! Three hours — coffee machine, tables, till."],
        choices: [{ id: 'work', label: '☕ Work the trial (+$70.50)', sublabel: '3 hours × $23.50 · 15 energy', category: 'income', cost: 70.5, minutes: 180, energyCost: 15, relationship: 1, consequence: 'Leah pays you for all three hours — and offers you 12 hours a week!', lesson: 'In New Zealand, trial shifts must be paid. Unpaid "trials" are illegal.', flags: ['wk_job_offer'] }],
      },
      {
        id: 's2', place: 'cafe', waypoint: 'Café', speaker: 'Leah', npcId: 'leah',
        lines: ['Last thing — I need your IRD number and tax code for payroll.', 'This is your main job, and you have a student loan…'],
        choices: [
          { id: 'msl', label: '🧾 M SL', sublabel: 'Main job + student loan', cost: 0, minutes: 5, consequence: 'Correct. Loan repayments kick in automatically if you ever earn over the threshold.', lesson: 'Main job + student loan = tax code M SL.', flags: ['wk_taxcode_msl'], finish: true },
          { id: 'm', label: '🧾 M', sublabel: 'Main job', cost: 0, minutes: 5, consequence: 'Close — with a student loan it should be M SL. Inland Revenue may chase you later.', flags: ['wk_taxcode_m'], finish: true },
          { id: 'nd', label: "🤷 I'll sort it later", sublabel: 'No declaration', cost: 0, minutes: 5, consequence: 'No tax code means "ND": 45% tax on every pay until you fix it.', lesson: 'Always give your employer a tax code — ND is the most expensive one.', flags: ['wk_taxcode_nd'], finish: true },
        ],
      },
    ],
    rewards: { xp: 40, message: "You're hired!" },
    onExpire: { message: 'You never showed up for the trial shift. Leah gave the job to someone else.', flags: ['wk_trial_missed'], relationship: { npc: 'Leah', delta: -2 } },
  },
  {
    id: 'uni_rent_rest', kind: 'main', priority: 138, name: 'The Rest of the Rent', emoji: '🏠',
    journalText: 'Sam is waiting on the rest of your rent.',
    storySetup: 'Friday morning. Sam has "a quick question".',
    paths: UNI, repeat: 'weekly',
    window: { days: [4], from: hm(8), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_rent_half') || hasFlag(s, 'wk_rent_late'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ["Friday! Still need the rest of the rent from you 🙏"],
      choices: [
        { id: 'pay100', label: '🏠 Send the other $100', sublabel: 'All square · Sam +1', category: 'housing', cost: -100, minutes: 1, relationship: 1, consequence: 'Sam: "legend, thanks"', flags: ['wk_rent_rest_paid'], finish: true,
          hideIf: s => !hasFlag(s, 'wk_rent_half') },
        { id: 'pay200', label: '🏠 Send the $200', sublabel: 'All square · Sam +1', category: 'housing', cost: -200, minutes: 1, relationship: 1, consequence: 'Sam: "phew. thanks"', flags: ['wk_rent_rest_paid'], finish: true,
          hideIf: s => !hasFlag(s, 'wk_rent_late') || hasFlag(s, 'wk_rent_half') },
        { id: 'stall', label: '😬 Next week, promise', sublabel: 'Sam -2', cost: 0, minutes: 1, relationship: -2, consequence: 'Sam doesn\'t reply. That\'s worse than a reply.', lesson: 'Rent debt to a friend is still debt — and it costs the friendship interest.', flags: ['wk_rent_owed'], finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Rent conversation done.' },
    onExpire: { message: "You ghosted Sam about the rent.", flags: ['wk_rent_owed'], relationship: { npc: 'Sam', delta: -2 } },
  },
  {
    id: 'uni_quiz', kind: 'main', priority: 130, name: 'ECON101 Quiz', emoji: '💻',
    journalText: 'ECON101 Quiz 1 closes at 11:59 PM Friday. It covers chapter 1.',
    storySetup: 'A Moodle reminder.',
    paths: UNI, repeat: 'weekly',
    window: { days: [4], from: hm(12), until: hm(23, 55) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Moodle', speaker: 'Moodle', remote: true,
      lines: ['ECON101 Quiz 1 closes tonight at 11:59 PM.', 'It covers chapter 1 of the textbook.'],
      choices: [
        { id: 'do', label: '💻 Do the quiz (1 hr)', sublabel: 'You have the textbook · 6 energy', cost: 0, minutes: 60, energyCost: 6, consequence: 'Chapter 1 made sense. 8/10!', flags: ['wk_quiz_done'], finish: true,
          hideIf: s => !hasTextbook(s) },
        { id: 'cram', label: '😰 Cram from lecture slides (2 hrs)', sublabel: 'No textbook · 12 energy', cost: 0, minutes: 120, energyCost: 12, consequence: 'Slides and half-remembered lectures get you a 6/10.', lesson: 'Skipping the textbook saved money but cost you hours.', flags: ['wk_quiz_done'], finish: true,
          hideIf: s => hasTextbook(s) },
        { id: 'skip', label: '🙈 Skip it', sublabel: "It's only 5%", cost: 0, minutes: 0, consequence: 'Zero. Only 5%… this time.', flags: ['wk_quiz_skipped'], finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Quiz done.' },
    onExpire: { message: 'The ECON101 quiz closed without you.', flags: ['wk_quiz_skipped'] },
  },

  // SATURDAY / SUNDAY ─────────────────────────────────────────────────────────
  {
    id: 'uni_raglan', kind: 'side', priority: 90, name: 'Raglan Beach Day', emoji: '🏖️',
    journalText: "The flat's going to Raglan: $12 petrol each, fish and chips about $11.",
    storySetup: 'Saturday. Sam is loading boogie boards into his car.',
    paths: UNI, repeat: 'weekly',
    window: { days: [5], from: hm(8, 30), until: hm(11, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ['Beach day at Raglan! 🏄', "Petrol's $12 each, fish and chips about $11."],
      choices: [
        { id: 'go', label: '🏖️ In! ($23)', sublabel: 'All day · Sam +2', category: 'entertainment', cost: -23, minutes: 360, energyCost: 10, relationship: 2, social: true, consequence: 'Sun, surf, chips on the sand. The best day of the week.', flags: ['wk_raglan'], finish: true },
        { id: 'cheap', label: "🥪 In, but I'll bring lunch ($12)", sublabel: 'Petrol only · Sam +2', category: 'transport', cost: -12, minutes: 360, energyCost: 10, relationship: 2, social: true, consequence: 'Same beach, same laughs, $11 cheaper.', lesson: 'You can say yes to the plan and no to the extras.', flags: ['wk_raglan'], finish: true },
        { id: 'stay', label: '📚 Stay and catch up', sublabel: '+10 energy', cost: 0, minutes: 0, energyRestore: 10, consequence: 'A quiet flat and a clear head.', finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Saturday sorted.' },
  },
  {
    id: 'uni_recap', kind: 'main', priority: 140, name: 'Sunday Video Call', emoji: '📹',
    journalText: 'Sunday afternoon at the flat: video-call Mum and look back at your first week.',
    storySetup: "It's Sunday. Your first week on your own is done.",
    destination: 'home', paths: UNI, repeat: 'weekly',
    window: { days: [6], from: hm(15), until: hm(23, 59) },
    trigger: { type: 'location', place: 'home' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Call Mum', speaker: 'Mum',
      lines: ['(video call) There you are! First week on your own — how did it go?', 'Tell me everything. Especially the money bits.'],
      choices: [{ id: 'reflect', label: '💬 Talk her through the week', sublabel: 'See how it went', cost: 0, minutes: 30, relationship: 1, consequence: 'Mum listens to all of it. Then asks if you are eating vegetables.', flags: ['level1_complete'], finish: true }],
    }],
    rewards: { xp: 100, message: 'First week done. Monday brings StudyLink again — see what you do differently.', flag: 'level1_complete' },
  },
];

// ── The University daily pool ────────────────────────────────────────────────
// Same pools as School (morning / after class / evening / weekend). A few School tasks that fit any
// adult (the scam text, the flash sale, found wallet…) are shared via their own `paths`.
export const UNI_DAILY: MissionDef[] = [
  // MORNING (7:00–9:30)
  {
    id: 'uni_coffee', pool: 'morning', kind: 'side', priority: 40, name: 'Campus Coffee', emoji: '☕',
    journalText: 'Mei is grabbing a $5.50 flat white before the lecture.',
    storySetup: 'Mei texts.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(9, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Mei', speaker: 'Mei', npcId: 'mei', remote: true,
      lines: ['coffee before ECON? ☕ the campus cart does $5.50 flat whites'],
      choices: [
        { id: 'yes', label: '☕ Meet her ($5.50)', sublabel: '+8 energy · Mei +1', category: 'food', cost: -5.5, minutes: 15, energyRestore: 8, relationship: 1, social: true, consequence: 'Good coffee, better gossip.', lesson: '$5.50 a weekday is $27.50 a week — or $1,300 a year.', finish: true },
        { id: 'instant', label: '🥄 Instant at home', sublabel: 'Free · +4 energy', cost: 0, minutes: 5, energyRestore: 4, consequence: 'Tastes like… coffee. Technically.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Caffeinated.' },
  },
  {
    id: 'uni_breakfast', pool: 'morning', kind: 'side', priority: 40, name: 'Flat Breakfast', emoji: '🍳',
    journalText: 'Sam made a mountain of eggs. $2 towards the carton and you are in.',
    storySetup: 'Something smells good in the kitchen.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(9) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ['made way too many scrambled eggs 🍳 chuck in $2 for the carton and grab a plate'],
      choices: [
        { id: 'yes', label: '🍳 $2 and a plate', sublabel: '+12 energy · Sam +1', category: 'food', cost: -2, minutes: 15, energyRestore: 12, relationship: 1, social: true, consequence: 'Hot breakfast for $2. Flatting wins.', lesson: 'Cooking together is the cheapest way to eat well.', finish: true },
        { id: 'no', label: '🏃 Running late', sublabel: '', cost: 0, minutes: 0, consequence: 'Sam: "more for me"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Breakfast sorted.' },
  },
  {
    id: 'uni_notes', pool: 'morning', kind: 'side', priority: 38, name: 'Notes for Sale', emoji: '🗒️',
    journalText: "A second-year is selling last year's ECON101 notes for $15.",
    storySetup: 'A post in the class group.', paths: UNI, repeat: 'daily',
    window: { days: [0, 1, 2, 3], from: hm(7), until: hm(9, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Class group', speaker: 'Class group', remote: true,
      lines: ["Selling my ECON101 notes from last year — every lecture, colour-coded. $15."],
      choices: [
        { id: 'buy', label: '🗒️ Buy them ($15)', sublabel: 'Shortcut?', category: 'shopping', cost: -15, minutes: 5, consequence: 'Beautiful notes. Half the slides have changed since last year.', lesson: "Notes don't replace turning up — the course changes every year.", finish: true },
        { id: 'no', label: "✍️ I'll take my own", sublabel: 'Free', cost: 0, minutes: 0, consequence: 'Your own notes stick better anyway.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Decision made.' },
  },
  {
    id: 'uni_snooze', pool: 'morning', kind: 'side', priority: 36, name: 'Snooze?', emoji: '⏰',
    journalText: 'Your alarm is going. So is your will to live.',
    storySetup: 'BEEP BEEP BEEP.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Alarm', speaker: 'Alarm', remote: true,
      lines: ['7:00 AM. Lecture at 10.'],
      choices: [
        { id: 'snooze', label: '😴 Snooze for an hour', sublabel: '+12 energy · lose an hour', cost: 0, minutes: 60, energyRestore: 12, consequence: 'Glorious. Also: it is now 8 AM.', lesson: 'Sometimes rest is the best use of a morning.', finish: true },
        { id: 'up', label: '🌅 Get up', sublabel: 'Make the most of the day', cost: 0, minutes: 0, consequence: 'Up and at it.', finish: true },
      ],
    }],
    rewards: { xp: 2, message: 'Morning started.' },
  },

  // AFTER CLASS (12:30–18:00)
  {
    id: 'uni_free_food', pool: 'after_school', kind: 'side', priority: 36, name: 'Free Sausage Sizzle', emoji: '🌭',
    journalText: 'Free sausage sizzle outside the Rec Centre — while stocks last.',
    storySetup: 'A club is feeding everyone for free.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(12, 20), until: hm(14) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Campus', speaker: 'Clubs Council', remote: true,
      lines: ['FREE sausage sizzle outside the Rec Centre until they run out 🌭'],
      choices: [
        { id: 'go', label: '🌭 Get in line', sublabel: 'Free · +10 energy', cost: 0, minutes: 20, energyRestore: 10, consequence: 'Sausage, bread, onions, sauce. Free. Perfect.', lesson: 'Free campus food is a legitimate budget strategy.', finish: true },
        { id: 'no', label: '🙅 Not hungry', sublabel: '', cost: 0, minutes: 0, consequence: 'More for everyone else.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Free lunch!' },
  },
  {
    id: 'uni_research_study', pool: 'after_school', kind: 'side', priority: 37, name: 'Paid Research Study', emoji: '🧪',
    journalText: 'The Psychology department pays $20 in vouchers for a 1-hour study on campus.',
    storySetup: 'A flyer on the noticeboard.', destination: 'university', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(12, 20), until: hm(15, 15) }, trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'university', waypoint: 'Reply', speaker: 'Psych Dept', remote: true,
        lines: ['Participants wanted: 1-hour memory study, $20 supermarket voucher. On campus today.'],
        choices: [
          { id: 'yes', label: "🧪 I'll do it", sublabel: 'On campus before 3:15', cost: 0, minutes: 0, consequence: 'Booked in.' },
          { id: 'no', label: '🙅 Pass', sublabel: '', cost: 0, minutes: 0, consequence: 'Maybe next time.', finish: true },
        ],
      },
      {
        id: 's2', place: 'university', waypoint: 'Campus', speaker: 'Psych Dept',
        lines: ['Welcome! Just remember these 20 words…'],
        choices: [{ id: 'do', label: '🧪 Take part (+$20)', sublabel: '1 hour · 5 energy', category: 'income', cost: 20, minutes: 60, energyCost: 5, consequence: 'You remember 14 words and earn $20 of groceries.', finish: true }],
      },
    ],
    rewards: { xp: 10, message: 'Science thanks you.' },
  },
  {
    id: 'uni_study_group', pool: 'after_school', kind: 'side', priority: 35, name: 'Study Group', emoji: '📖',
    journalText: 'Mei wants help with ECON101 in the Library.',
    storySetup: 'Mei texts, panicking slightly.', destination: 'library', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(13), until: hm(17, 30) }, trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'library', waypoint: 'Reply to Mei', speaker: 'Mei', npcId: 'mei', remote: true,
        lines: ['help. supply and demand curves. library? 😭'],
        choices: [
          { id: 'yes', label: '📖 On my way', sublabel: 'Library', cost: 0, minutes: 0, consequence: 'Mei: "you are my hero"' },
          { id: 'no', label: '🙅 Swamped, sorry', sublabel: '', cost: 0, minutes: 0, consequence: 'Mei: "all good!"', finish: true },
        ],
      },
      {
        id: 's2', place: 'library', waypoint: 'Library', speaker: 'Mei', npcId: 'mei',
        lines: ['Okay so why does the curve go DOWN?'],
        choices: [{ id: 'study', label: '📖 Study together (1 hr)', sublabel: 'Free · Mei +2', cost: 0, minutes: 60, energyCost: 6, relationship: 2, social: true, consequence: 'You explain it; you both finally get it.', lesson: 'Teaching something is the fastest way to learn it.', finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'Study session done.' },
  },
  {
    id: 'uni_gym_trial', pool: 'after_school', kind: 'side', priority: 34, name: 'Rec Centre Trial', emoji: '🏋️',
    journalText: 'Rec Centre membership is $10 a week. Sam runs in the park for free.',
    storySetup: 'Sam is lacing up his shoes.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(14), until: hm(17, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ['Rec Centre is $10 a week… or run with me round the park for free?'],
      choices: [
        { id: 'gym', label: '🏋️ Sign up ($10/week)', sublabel: 'Weights, pool, classes', category: 'entertainment', cost: -10, minutes: 60, energyCost: 8, consequence: 'You feel great. Your bank balance feels $10 lighter.', finish: true },
        { id: 'run', label: '🏃 Run with Sam', sublabel: 'Free · Sam +1', cost: 0, minutes: 45, energyCost: 8, relationship: 1, social: true, consequence: 'Two laps, one stitch, lots of laughing.', lesson: 'The free version of a habit is the one you keep.', finish: true },
        { id: 'no', label: '🛋️ Not today', sublabel: '', cost: 0, minutes: 0, consequence: 'Sam: "tomorrow then"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Moved your body (or didn\'t).' },
  },
  {
    id: 'uni_bulk_buy', pool: 'after_school', kind: 'side', priority: 34, name: 'Bulk Buy', emoji: '📦',
    journalText: 'Sam wants to split a bulk box of toilet paper, dish soap and rice: $12 each.',
    storySetup: 'Sam has done Maths.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(13), until: hm(18) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ['Bulk box: loo paper, dish soap, 5kg rice. $48 split 4 ways = $12.', 'Buying it separately is like $18 each.'],
      choices: [
        { id: 'yes', label: "📦 I'm in ($12)", sublabel: 'Saves about $6 · Sam +1', category: 'shopping', cost: -12, minutes: 2, relationship: 1, consequence: 'The flat is stocked for a month.', lesson: 'Buying in bulk with flatmates beats buying small, alone.', finish: true },
        { id: 'no', label: "🙅 I'll buy my own", sublabel: '', cost: 0, minutes: 0, consequence: 'Sam: "suit yourself"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Flat admin done.' },
  },
  {
    id: 'uni_market_research', pool: 'after_school', kind: 'side', priority: 33, name: 'Price Check', emoji: '🏷️',
    journalText: 'The Dairy sells milk for $4.20. The supermarket has it for $3.50.',
    storySetup: 'You are out of milk.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(15), until: hm(19) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ['Out of milk. The Dairy is 1 minute away ($4.20).', 'The supermarket is a 10-minute walk ($3.50).'],
      choices: [
        { id: 'dairy', label: '🥛 Dairy ($4.20)', sublabel: 'Quick', category: 'food', cost: -4.2, minutes: 5, consequence: 'Milk acquired. Convenience tax paid.', finish: true },
        { id: 'walk', label: '🚶 Walk to the supermarket ($3.50)', sublabel: '20 min round trip', category: 'food', cost: -3.5, minutes: 20, energyCost: 3, consequence: '70c saved, 20 minutes spent.', lesson: 'Is your time worth more than $2.10 an hour? Sometimes yes, sometimes no.', finish: true },
        { id: 'black', label: '☕ Black coffee it is', sublabel: 'Free', cost: 0, minutes: 0, consequence: 'Bold choice.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Milk situation resolved.' },
  },

  // EVENING (18:30–22:00)
  {
    id: 'uni_flat_dinner', pool: 'evening', kind: 'side', priority: 34, name: 'Flat Dinner Rota', emoji: '🍲',
    journalText: "It's your night on the flat dinner rota: cook for four.",
    storySetup: 'The rota on the fridge has your name on it.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(17, 30), until: hm(19, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ['Your turn on the rota tonight! 🍲 Four hungry flatmates.'],
      choices: [
        { id: 'cook', label: '🍲 Cook a big curry ($18)', sublabel: '$4.50 a head · +12 energy · Sam +2', category: 'food', cost: -18, minutes: 60, energyRestore: 12, relationship: 2, social: true, consequence: 'Everyone has seconds. You are a flat legend.', lesson: 'Cooking for four costs about the same as one takeaway for one.', finish: true },
        { id: 'pizza', label: '🍕 Order pizzas ($32)', sublabel: 'No effort · Sam +1', category: 'food', cost: -32, minutes: 30, energyRestore: 10, relationship: 1, social: true, consequence: 'Nobody complains. Your bank account does.', finish: true },
        { id: 'skip', label: '😬 Skip my turn', sublabel: 'Sam -2', cost: 0, minutes: 0, relationship: -2, consequence: 'The flat eats toast. Pointedly.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Dinner done.' },
  },
  {
    id: 'uni_bnpl', pool: 'evening', kind: 'side', priority: 32, name: 'Pay Later?', emoji: '🎧',
    journalText: 'Headphones for $140 — "just 4 payments of $35!"',
    storySetup: 'An ad in your feed.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(22) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Ad', speaker: 'PayLater', remote: true,
      lines: ['Noise-cancelling headphones: $140 — or 4 easy payments of $35! 🎧', 'Pay nothing extra if you pay on time.'],
      choices: [
        { id: 'buy', label: '🎧 Buy now, pay later ($35 today)', sublabel: '$105 still owed', category: 'shopping', cost: -35, minutes: 2, effect: 'bnpl_headphones', consequence: 'They arrive Wednesday. So do three more bills.', lesson: 'Buy-now-pay-later is still debt — miss a payment and the late fees start.', finish: true },
        { id: 'no', label: '❌ Scroll past', sublabel: 'Your old ones work', cost: 0, minutes: 0, consequence: 'Gone.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Ad dealt with.' },
  },
  {
    id: 'uni_credit_card', pool: 'evening', kind: 'side', priority: 31, name: 'Pre-Approved!', emoji: '💳',
    journalText: 'Your bank offers a student credit card: $1,000 limit at 20.95% interest.',
    storySetup: 'An email from your bank.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(22) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Email', speaker: 'Your bank', remote: true,
      lines: ["Good news! You're pre-approved for a Student Visa card.", '$1,000 limit · 20.95% p.a. interest · no annual fee in year one.'],
      choices: [
        { id: 'apply', label: '💳 Apply', sublabel: 'Just for emergencies…', cost: 0, minutes: 5, consequence: 'Approved. It sits in your wallet, feeling like $1,000 of free money. It is not.', lesson: '$1,000 unpaid at 20.95% costs about $210 a year in interest.', flags: ['wk_credit_card'], finish: true },
        { id: 'no', label: '🗑️ Delete the email', sublabel: 'No debt', cost: 0, minutes: 0, consequence: 'Deleted.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Decision made.' },
  },
  {
    id: 'uni_mum_call', pool: 'evening', kind: 'side', priority: 33, name: 'Mum Calls', emoji: '👩',
    journalText: 'Mum is checking in — and offering $50.',
    storySetup: 'Your phone rings. It says "Mum ❤️".', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Phone', speaker: 'Mum', remote: true,
      lines: ['How is the money going, love? Honestly.', "I can send you $50 if things are tight."],
      choices: [
        { id: 'accept', label: '🙏 Yes please (+$50)', sublabel: 'Mum +0', category: 'gift', cost: 50, minutes: 15, consequence: 'Mum: "Just this once — make it last!"', lesson: 'Asking for help is fine. Needing it every week is a sign the budget needs work.', finish: true },
        { id: 'fine', label: "💪 I'm okay, thanks", sublabel: 'Mum +1', cost: 0, minutes: 15, relationship: 1, consequence: 'Mum sounds proud. And a bit relieved.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Talked to Mum.' },
  },
  {
    id: 'uni_gig', pool: 'evening', kind: 'side', priority: 32, name: 'Gig Tickets', emoji: '🎸',
    journalText: 'Kōwhai Riot are playing Hamilton next month — presale $89, tonight only.',
    storySetup: 'The group chat is losing its mind.', paths: UNI, repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(22) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Group chat', speaker: 'Mei', npcId: 'mei', remote: true,
      lines: ['KŌWHAI RIOT PRESALE 🎸 $89, tonight only!!', 'everyone is going'],
      choices: [
        { id: 'buy', label: '🎸 Buy a ticket ($89)', sublabel: 'Mei +1', category: 'entertainment', cost: -89, minutes: 10, relationship: 1, consequence: 'Ticket secured. That was a quarter of your StudyLink.', finish: true },
        { id: 'no', label: "😔 Can't this month", sublabel: 'Mei understands', cost: 0, minutes: 0, consequence: 'Mei: "next time!! I\'ll send you videos"', lesson: 'Presale urgency is designed to make you decide before you think.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Decision made.' },
  },
  {
    id: 'uni_party', pool: 'evening', kind: 'side', priority: 32, name: 'Flat Party', emoji: '🎉',
    journalText: "There's a party at Tama's flat tonight.",
    storySetup: 'Music is already coming from down the street.', paths: UNI, repeat: 'daily',
    window: { days: [3, 4], from: hm(19), until: hm(22) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ["Party at Tama's! 🎉 Bring snacks, or chip in $5 for pizza."],
      choices: [
        { id: 'snacks', label: '🍿 Go, bring snacks ($12)', sublabel: '3 hours · Sam +1', category: 'entertainment', cost: -12, minutes: 180, energyCost: 10, relationship: 1, social: true, consequence: 'Great night. You meet half your ECON101 class.', finish: true },
        { id: 'pizza', label: '🍕 Go, chip in $5', sublabel: '3 hours · Sam +1', category: 'entertainment', cost: -5, minutes: 180, energyCost: 10, relationship: 1, social: true, consequence: 'Same party, $7 cheaper.', finish: true },
        { id: 'stay', label: '🛏️ Early night', sublabel: '+10 energy', cost: 0, minutes: 0, energyRestore: 10, consequence: 'You hear the bass from bed. Sleep wins.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Night sorted.' },
  },

  // WEEKEND (8:30–13:30)
  {
    id: 'uni_farmers_market', pool: 'weekend', kind: 'side', priority: 35, name: 'Veggie Box', emoji: '🥦',
    journalText: 'A $10 veggie box at the Weekend Market would cost about $16 at the supermarket.',
    storySetup: 'Mei is at the market.', paths: UNI, repeat: 'daily',
    window: { days: WEEKEND, from: hm(8, 30), until: hm(13) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'market', waypoint: 'Reply to Mei', speaker: 'Mei', npcId: 'mei', remote: true,
      lines: ['veggie boxes at the market are $10!! same stuff is like $16 at the supermarket'],
      choices: [
        { id: 'buy', label: '🥦 Grab me one ($10)', sublabel: 'Mei brings it home · Mei +1', category: 'food', cost: -10, minutes: 2, relationship: 1, energyRestore: 5, consequence: 'A week of vegetables for $10.', lesson: 'Markets often beat supermarkets on fresh produce.', finish: true },
        { id: 'no', label: "🙅 I'm good", sublabel: '', cost: 0, minutes: 0, consequence: 'Mei: "your scurvy, your choice"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Veggies sorted.' },
  },
  {
    id: 'uni_op_shop', pool: 'weekend', kind: 'side', priority: 34, name: 'Winter Coat', emoji: '🧥',
    journalText: 'Winter is coming. Op shop coat $15, or a new one at the Mall for $90.',
    storySetup: 'It is cold. Your hoodie is not coping.', paths: UNI, repeat: 'daily',
    window: { days: WEEKEND, from: hm(9), until: hm(13, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ['The op shop has a wool coat for $15.', 'The Mall has a new puffer for $90.'],
      choices: [
        { id: 'op', label: '🧥 Op shop coat ($15)', sublabel: 'Vintage · warm', category: 'shopping', cost: -15, minutes: 45, consequence: 'Wool, slightly too big, extremely warm.', lesson: 'Second-hand clothes: same warmth, a sixth of the price.', finish: true },
        { id: 'new', label: '🛍️ New puffer ($90)', sublabel: 'Brand new', category: 'shopping', cost: -90, minutes: 60, consequence: 'Very warm. Very expensive.', finish: true },
        { id: 'layer', label: '🧣 Layer up', sublabel: 'Free', cost: 0, minutes: 0, consequence: 'Two hoodies and a scarf. Fashion.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Warm enough.' },
  },
  {
    id: 'uni_weekend_shift', pool: 'weekend', kind: 'side', priority: 38, name: 'Extra Shift', emoji: '☕',
    journalText: 'Leah needs someone for a 4-hour shift: $94.',
    storySetup: 'Leah texts.', paths: UNI, repeat: 'daily',
    window: { days: WEEKEND, from: hm(8, 30), until: hm(11) }, trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_job_offer'),
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'Reply to Leah', speaker: 'Leah', npcId: 'leah', remote: true,
      lines: ['Someone called in sick — can you do 9 till 1? 4 hours = $94.'],
      choices: [
        { id: 'work', label: '☕ Take the shift (+$94)', sublabel: '4 hours · 18 energy · Leah +1', category: 'income', cost: 94, minutes: 240, energyCost: 18, relationship: 1, consequence: 'Busy morning, $94 earned.', finish: true },
        { id: 'no', label: '🙅 Not this time', sublabel: '', cost: 0, minutes: 0, consequence: 'Leah: "No worries!"', finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Weekend earnings!' },
  },
  {
    id: 'uni_hike', pool: 'weekend', kind: 'side', priority: 34, name: 'Summit Walk', emoji: '⛰️',
    journalText: 'Mei is walking up Hakarimata. Free, if you can handle the stairs.',
    storySetup: 'Mei has a plan.', paths: UNI, repeat: 'daily',
    window: { days: WEEKEND, from: hm(8, 30), until: hm(12) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Mei', speaker: 'Mei', npcId: 'mei', remote: true,
      lines: ['Hakarimata summit this morning? ⛰️ Free, 1,349 stairs, great view.'],
      choices: [
        { id: 'go', label: '⛰️ Let\'s go', sublabel: '3 hours · free · Mei +2', cost: 0, minutes: 180, energyCost: 15, relationship: 2, social: true, consequence: 'Your legs hate you. The view was worth it.', lesson: 'The best weekends are often free.', finish: true },
        { id: 'no', label: '🛋️ My legs say no', sublabel: '', cost: 0, minutes: 0, consequence: 'Mei: "next weekend!"', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Summit (or sofa) reached.' },
  },
];
