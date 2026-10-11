/**
 * MoniMate — University path, Levels 2, 3, and 4.
 *
 *   Level 2 — "Student Budget": Flatmate drama, food budgeting under pressure, IRD number,
 *     second job application, grocery decisions, splitting shared costs.
 *
 *   Level 3 — "Independence": Power company switch, IRD tax return, KiwiSaver enrolment,
 *     managing the student loan, insurance for a laptop, flat bond dispute.
 *
 *   Level 4 — "Financial Challenges": Credit card temptation, investment intro (Sharesies),
 *     graduation costs, student loan repayment strategy, final recap with Mum.
 *
 * Week-only flags start with `wk_` (cleared when the next StudyLink payment arrives).
 */
import { hm } from '../clock';
import type { MissionDef } from '../missions';
import { doneThisWeek, hasFlag } from '../missionUtil';

const WK = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const UNI: MissionDef['paths'] = ['university'];

// ═══ LEVEL 2 — STUDENT BUDGET ════════════════════════════════════════════════

export const UNI_L2: MissionDef[] = [
  // MONDAY — StudyLink lands, flatmate drama, budget planning
  {
    id: 'l2_payday', kind: 'main', priority: 200, name: 'Week 2 StudyLink', emoji: '🎓',
    journalText: 'StudyLink pays your $316 living-costs loan. This week: the flat has a shared grocery crisis.',
    storySetup: 'Week 2. Your phone buzzes just after 7.',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'StudyLink', remote: true,
      lines: [
        'Your living costs payment of $316.00 has been paid into your account.',
        "Week 2! You're getting the hang of this.",
      ],
      choices: [{
        id: 'take', label: '🎓 Week 2 pay arrives (+$316)', sublabel: '$200 rent due · shared groceries this week', category: 'income',
        cost: 316, minutes: 1, effect: 'student_loan_draw',
        consequence: '$316 lands. The flat WhatsApp is already popping off about groceries.', finish: true,
      }],
    }],
    rewards: { xp: 20, message: 'Week 2. Flat life is real now.' },
  },
  {
    id: 'l2_pick_goal', kind: 'main', priority: 199, name: "Week 2 Goal", emoji: '🎯',
    journalText: 'Pick your goal for week 2.',
    storySetup: 'What do you want from week 2?',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l2_payday'),
    steps: [{
      id: 's1', place: 'home', remote: true, waypoint: 'Set a goal',
      lines: ["You've got $316. $200 is rent. What matters most this week?"],
      choices: [
        { id: 'budget', label: '📊 Spend less than $80 on food', sublabel: 'Track every purchase', cost: 0, minutes: 0, setsGoal: 'l2_frugal', consequence: 'Goal set: tight food budget.', finish: true },
        { id: 'ird', label: '🪪 Get your IRD number sorted', sublabel: 'You need it to work legally', cost: 0, minutes: 0, setsGoal: 'l2_ird', consequence: 'Goal set: IRD number by Friday.', finish: true },
        { id: 'savings', label: '💰 Save $100 this week', sublabel: 'Into Savings by Sunday', cost: 0, minutes: 0, setsGoal: 'l2_savings100', consequence: 'Goal set: $100 in savings.', finish: true },
        { id: 'social', label: '🤝 Resolve the flatmate drama', sublabel: 'Talk it through before Friday', cost: 0, minutes: 0, setsGoal: 'l2_flat_peace', consequence: 'Goal set: sort the flat tension.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    id: 'l2_rent', kind: 'main', priority: 195, name: 'Rent — Week 2', emoji: '🏠',
    journalText: "Sam's waiting on $200. Pay it before Thursday or the relationship sours.",
    storySetup: 'Sam messages about rent.',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [0], from: hm(9), until: hm(21), spanDays: 3 },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l2_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Sam', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: ["Hey — $200 rent whenever you're ready. No rush but before Thursday yeah?"],
      choices: [
        { id: 'pay', label: '💸 Transfer $200 now', sublabel: 'Rent paid for the week', cost: -200, minutes: 2, flags: ['wk_rent_paid'], consequence: 'Paid. Sam: "Cheers 👍"', finish: true },
        { id: 'later', label: '⏰ I\'ll do it later', sublabel: 'Risk of forgetting', cost: 0, minutes: 1, consequence: "Sam: 'No worries, just don't forget.'", flags: ['wk_rent_deferred'], finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Rent sorted.' },
  },
  {
    id: 'l2_flatmate_drama', kind: 'main', priority: 180, name: 'Flatmate Drama', emoji: '😤',
    journalText: "Marcus ate your food AGAIN. Decide whether to confront him, replace the food and say nothing, or set up a flat agreement.",
    storySetup: 'You come home to an empty fridge shelf.',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [0], from: hm(17), until: hm(22) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Deal with it', speaker: 'You (thoughts)', remote: true,
      lines: [
        "Your pasta is gone. Marcus left a text: 'soz bro was hungry'.",
        "Leah says this is the third time. Sam is staying out of it.",
      ],
      choices: [
        { id: 'confront', label: '💬 Talk to Marcus directly', sublabel: 'Set a boundary — might get awkward', cost: 0, minutes: 20, flags: ['wk_drama_confront'], consequence: "Marcus apologises and agrees to buy his own groceries. Tension drops.", lesson: 'Setting boundaries early is cheaper than repeated food theft.', finish: true },
        { id: 'rules', label: '📋 Propose a flat agreement', sublabel: 'Shared rules for food and chores', cost: 0, minutes: 40, flags: ['wk_drama_rules', 'wk_flat_agreement'], consequence: 'Everyone signs. The flat is calmer for it.', lesson: 'A written flat agreement avoids 90% of flatmate drama.', finish: true },
        { id: 'ignore', label: '🤐 Say nothing, replace the food', sublabel: '-$8, but no confrontation', cost: -8, minutes: 10, flags: ['wk_drama_ignore'], consequence: 'You replace the pasta. Marcus does it again on Wednesday.', finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Flat drama handled.' },
  },
  {
    id: 'l2_ird_number', kind: 'main', priority: 170, name: 'IRD Number', emoji: '🪪',
    journalText: "You need an IRD number to pay tax on the Café wages. Apply online — takes 10 minutes.",
    storySetup: 'The Café asks for your IRD number before the first pay.',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [1], from: hm(8), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Apply online', speaker: 'You', remote: true,
      lines: [
        "The Café manager says: 'We need your IRD number before we can put you on payroll.'",
        "Apply online at ird.govt.nz — you'll need your passport.",
      ],
      choices: [
        { id: 'apply', label: '🪪 Apply now (10 min)', sublabel: 'ird.govt.nz · need passport', cost: 0, minutes: 10, flags: ['wk_ird_applied'], consequence: 'Application sent. Number arrives by post in 5–10 working days.', lesson: 'You need an IRD number to legally earn in NZ — get it sorted early.', finish: true },
        { id: 'later', label: '⏳ Do it later', sublabel: 'Delays your first paycheque', cost: 0, minutes: 2, consequence: "The Café can't add you to payroll. First pay is delayed.", finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'IRD application sent.' },
  },
  {
    id: 'l2_budget_plan', kind: 'main', priority: 165, name: 'Weekly Budget', emoji: '📊',
    journalText: "After rent, you have $116. Plan where it goes — food, transport, uni costs.",
    storySetup: 'You sit down with a notepad after paying rent.',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [0], from: hm(10), until: hm(22) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l2_rent'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Make a budget', speaker: 'You', remote: true,
      lines: [
        "After rent: $116 left for the week. Food, transport, uni supplies — all on you.",
        "How do you want to divide it?",
      ],
      choices: [
        { id: 'tight', label: '📉 Tight: $60 food, $20 transport, $36 buffer', sublabel: 'Strict but survivable', cost: 0, minutes: 15, flags: ['wk_budget_tight'], consequence: 'Plan set. Ramen it is.', lesson: 'A budget is a plan — reality will test it.', finish: true },
        { id: 'balanced', label: '⚖️ Balanced: $70 food, $25 transport, $21 buffer', sublabel: 'More realistic', cost: 0, minutes: 15, flags: ['wk_budget_balanced'], consequence: 'Plan set. Tight but doable.', finish: true },
        { id: 'yolo', label: '🤷 Wing it', sublabel: 'No plan — check balance by Friday', cost: 0, minutes: 2, consequence: "You don't plan. You'll check the balance on Friday and hope.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Budget drafted.' },
  },
  {
    id: 'l2_shared_groceries', kind: 'main', priority: 155, name: 'Flat Grocery Split', emoji: '🛒',
    journalText: "The flat agrees to split groceries this week. $15 each for shared basics — bread, milk, eggs.",
    storySetup: 'Leah starts a WhatsApp poll about shared groceries.',
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [1], from: hm(15), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'supermarket', waypoint: 'Shop together', speaker: 'Leah', npcId: 'leah', remote: true,
      lines: [
        "Leah: 'Let's all chip in $15 for shared basics — bread, milk, eggs, butter.'",
        "Marcus says he's 'maybe in'. Sam is in. You?",
      ],
      choices: [
        { id: 'in', label: '✅ Chip in $15', sublabel: 'Shared basics covered for the week', cost: -15, minutes: 30, flags: ['wk_shared_groceries'], consequence: 'Flat shop done. Fridge has basics. Leah is pleased.', lesson: 'Splitting shared costs is cheaper per person than buying separately.', finish: true },
        { id: 'own', label: '🏪 Buy my own stuff separately', sublabel: 'More control, slightly more expensive', cost: 0, minutes: 45, consequence: 'You shop alone. You have what you want but spent $22.', finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Groceries sorted.' },
  },
  {
    id: 'l2_second_lecture', kind: 'side', priority: 140, name: 'ECON102 Add/Drop', emoji: '📚',
    journalText: "You can add a second paper — ECON102 — or drop to a lighter load. Deadline is Wednesday.",
    storySetup: 'The add/drop deadline is Wednesday.',
    paths: UNI, levels: [2],
    repeat: 'once',
    window: { days: [1], from: hm(9), until: hm(17), spanDays: 2 },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Course admin', speaker: 'Student Services', remote: true,
      lines: [
        "Add/drop closes Wednesday. ECON102 is 15 points — same lecturer, Tues/Thurs at 2 PM.",
        "More study, but your student allowance doesn't change either way.",
      ],
      choices: [
        { id: 'add', label: '📚 Add ECON102', sublabel: 'Heavier workload, same money', cost: 0, minutes: 10, flags: ['wk_econ102'], consequence: 'Added. Your timetable just got busier.', lesson: 'More papers means more loan — but also more credits toward your degree.', finish: true },
        { id: 'stay', label: '📖 Stay with ECON101 only', sublabel: 'Less stress, more time to work', cost: 0, minutes: 5, consequence: "You keep it light for week 2.", finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Course confirmed.' },
  },
  {
    id: 'l2_cafe_first_shift', kind: 'main', priority: 135, name: 'First Real Shift', emoji: '☕',
    journalText: "Your first official shift at the Café — 4 hours, $74. But wait until your IRD number is confirmed.",
    storySetup: "You're on the roster for Wednesday afternoon.",
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [2], from: hm(13), until: hm(18) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_ird_applied'),
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'First shift', speaker: 'Manager',
      lines: [
        "Manager: 'Right, four hours today. I'll show you the till first.'",
        "Four hours later: sore feet, $74 gross.",
      ],
      choices: [
        { id: 'work', label: '☕ Work the shift', sublabel: '+$74 gross (tax withheld)', cost: 74, minutes: 240, flags: ['wk_first_shift', 'wk_has_income'], consequence: "$74 hits your account. Tax was already deducted.", lesson: 'PAYE means tax comes out before you see the money — your employer handles it.', finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'First paycheque!' },
  },
  {
    id: 'l2_recap', kind: 'main', priority: 100, name: 'Call with Mum', emoji: '📹',
    journalText: "Sunday video call. Mum wants to know how week 2 went — the flat, the budget, the job.",
    storySetup: "Sunday evening. Mum's waiting on FaceTime.",
    paths: UNI, repeat: 'weekly', levels: [2],
    window: { days: [6], from: hm(15), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Call Mum', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: [
        "Mum: 'Week 2! How's the flat? Getting on with everyone?'",
        "She wants the real story — not the highlight reel.",
      ],
      choices: [
        { id: 'reflect', label: '📹 Tell her everything', sublabel: 'The good and the ugly', cost: 0, minutes: 30, consequence: 'Mum listens, nods, and says it sounds like you are figuring it out.', finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Week 2 done.' },
  },
];

export const UNI_L2_POOL: MissionDef[] = [
  {
    id: 'l2_cheap_eats', kind: 'side', priority: 110, name: 'Cheap Eats Hunt', emoji: '🍜',
    journalText: 'Mei knows all the cheap spots. Let her show you the $4 lunch options around campus.',
    storySetup: 'Mei sends a location pin.',
    paths: UNI, levels: [2],
    repeat: 'once',
    window: { days: [1, 2, 3], from: hm(12), until: hm(14) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Find cheap lunch with Mei', speaker: 'Mei', npcId: 'mei', remote: true,
      lines: ["Mei: 'You can eat for under $5 if you know where to look. Come with me.'"],
      choices: [
        { id: 'go', label: '🍜 Follow Mei ($4 lunch)', sublabel: '+energy, local knowledge', cost: -4, minutes: 45, consequence: 'Best $4 you ever spent. The noodle van is a revelation.', finish: true },
        { id: 'skip', label: '⏭️ I already ate', sublabel: '', cost: 0, minutes: 0, consequence: 'You save the tip for later.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Cheap food unlocked.' },
  },
  {
    id: 'l2_overdue_library', kind: 'side', priority: 100, name: 'Library Fine', emoji: '📚',
    journalText: "You have a $3 library fine. Pay it at the desk or risk losing borrowing rights.",
    storySetup: 'An email from the library arrives.',
    paths: UNI, levels: [2],
    repeat: 'once',
    window: { days: [2, 3], from: hm(10), until: hm(17) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Library desk', speaker: 'Librarian', remote: false,
      lines: [
        "Librarian: 'You have a $3.00 fine on your account from last week.'",
        "Your borrowing is suspended until it's paid.",
      ],
      choices: [
        { id: 'pay', label: '💳 Pay the $3 fine', sublabel: 'Borrowing restored instantly', cost: -3, minutes: 5, consequence: 'Paid. Borrowing rights restored.', lesson: "Library fines feel small — but they compound fast if you ignore them.", finish: true },
        { id: 'ignore', label: '🚶 Walk out', sublabel: 'No borrowing until paid', cost: 0, minutes: 2, consequence: "You walk out. The fine stays. So does the suspension.", finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Fine dealt with.' },
  },
];

// ═══ LEVEL 3 — INDEPENDENCE ════════════════════════════════════════════════════

export const UNI_L3: MissionDef[] = [
  {
    id: 'l3_payday', kind: 'main', priority: 200, name: 'Week 3 StudyLink', emoji: '🎓',
    journalText: 'Week 3 of university. StudyLink pays $316. This week: taxes, KiwiSaver, and a flat bond dispute.',
    storySetup: 'Week 3. Getting more independent.',
    paths: UNI, repeat: 'weekly', levels: [3],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'StudyLink', remote: true,
      lines: [
        'Your living costs payment of $316.00 has been paid into your account.',
        'Week 3! Things are getting real.',
      ],
      choices: [{
        id: 'take', label: '🎓 Week 3 pay (+$316)', sublabel: '$200 rent · taxes and KiwiSaver this week', cost: 316, minutes: 1, effect: 'student_loan_draw',
        category: 'income', consequence: '$316 in. Independent life costs money.', finish: true,
      }],
    }],
    rewards: { xp: 20, message: 'Week 3 begins.' },
  },
  {
    id: 'l3_pick_goal', kind: 'main', priority: 199, name: "Week 3 Goal", emoji: '🎯',
    journalText: 'Pick your goal for week 3.',
    storySetup: 'What do you want from independence week?',
    paths: UNI, repeat: 'weekly', levels: [3],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l3_payday'),
    steps: [{
      id: 's1', place: 'home', remote: true, waypoint: 'Set a goal',
      lines: ["Week 3. What matters?"],
      choices: [
        { id: 'kiwisaver', label: '🌿 Enrol in KiwiSaver', sublabel: "Employer matches from 3%", cost: 0, minutes: 0, setsGoal: 'l3_kiwisaver', consequence: 'Goal set: KiwiSaver enrolled.', finish: true },
        { id: 'taxreturn', label: '🧾 Lodge your first tax return', sublabel: 'May get a refund', cost: 0, minutes: 0, setsGoal: 'l3_taxreturn', consequence: 'Goal set: tax return by Friday.', finish: true },
        { id: 'bond', label: '🏘️ Resolve the bond dispute', sublabel: 'Get the full $200 back', cost: 0, minutes: 0, setsGoal: 'l3_bond', consequence: 'Goal set: bond in hand by Sunday.', finish: true },
        { id: 'laptop', label: '💻 Insure the laptop', sublabel: "$40/year covers theft & damage", cost: 0, minutes: 0, setsGoal: 'l3_insurance', consequence: 'Goal set: laptop insured.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    id: 'l3_tax_return', kind: 'main', priority: 185, name: 'First Tax Return', emoji: '🧾',
    journalText: "Lodge your tax return via myIR. You worked at the Café — you might get a refund.",
    storySetup: 'An email from IRD arrives about tax returns.',
    paths: UNI, repeat: 'weekly', levels: [3],
    window: { days: [0], from: hm(10), until: hm(20), spanDays: 2 },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_ird_applied'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Lodge via myIR', speaker: 'IRD', remote: true,
      lines: [
        "IRD: 'Your 2024 tax return is ready to file at myIR.govt.nz.'",
        "You earned $296 at the Café. IRD calculates the tax automatically.",
      ],
      choices: [
        { id: 'file', label: '🧾 File now (5 minutes)', sublabel: 'Might get a refund', cost: 0, minutes: 5, flags: ['wk_tax_filed'], consequence: 'Filed! IRD calculates a $42 refund — in your account in 5 days.', lesson: 'Filing your tax return is free and often gets money back.', finish: true },
        { id: 'later', label: '⏳ File next year', sublabel: 'Miss the refund window', cost: 0, minutes: 2, consequence: "You delay. The refund sits unclaimed.", finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Tax return lodged.' },
  },
  {
    id: 'l3_kiwisaver', kind: 'main', priority: 180, name: 'KiwiSaver Enrolment', emoji: '🌿',
    journalText: "The Café triggers automatic KiwiSaver enrolment. Choose your contribution rate.",
    storySetup: 'The Café payroll admin sends a KiwiSaver form.',
    paths: UNI, repeat: 'weekly', levels: [3],
    window: { days: [1], from: hm(9), until: hm(20) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_has_income'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'KiwiSaver form', speaker: 'Manager', npcId: 'sam', remote: true,
      lines: [
        "Manager: 'You're being automatically enrolled in KiwiSaver. You choose your contribution rate.'",
        "3% minimum — your employer also chips in 3%. Government adds $521/year if you put in $1,042.",
      ],
      choices: [
        { id: 'three', label: '🌿 3% (minimum)', sublabel: 'Less now, employer matches 3%', cost: 0, minutes: 10, flags: ['wk_kiwisaver_3', 'kiwisaver_enrolled'], consequence: '3% enrolled. Employer matches. Government adds $521/year.', lesson: 'Even 3% KiwiSaver from a student job compounds over 40 years.', finish: true },
        { id: 'four', label: '💪 4%', sublabel: 'Slightly more saved', cost: 0, minutes: 10, flags: ['wk_kiwisaver_4', 'kiwisaver_enrolled'], consequence: '4% enrolled.', finish: true },
        { id: 'opt_out', label: '❌ Opt out (within 56 days)', sublabel: 'Keep the 3% as cash', cost: 0, minutes: 5, consequence: 'Opted out. You keep the full pay — but lose the employer match.', lesson: "Opting out means losing free money from your employer — and the government's $521 match.", finish: true },
      ],
    }],
    rewards: { xp: 35, message: 'KiwiSaver sorted.' },
  },
  {
    id: 'l3_laptop_insurance', kind: 'main', priority: 170, name: 'Laptop Insurance', emoji: '💻',
    journalText: "Your $1,200 laptop has no insurance. A $40/year policy covers theft and accidental damage.",
    storySetup: 'Someone in your class has their laptop stolen from the library.',
    paths: UNI, levels: [3],
    repeat: 'once',
    window: { days: [1], from: hm(14), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Insurance decision', speaker: 'You (thoughts)', remote: true,
      lines: [
        "Someone in ECON101 had their laptop stolen from the library — $1,200 gone.",
        "You find a student policy: $40 a year, covers theft and accidental damage.",
      ],
      choices: [
        { id: 'insure', label: '🛡️ Get the $40/year policy', sublabel: 'Covers theft + accidental damage', cost: -40, minutes: 15, flags: ['wk_laptop_insured'], consequence: 'Policy active. $40 for a year of peace of mind on a $1,200 laptop.', lesson: "Insurance makes sense when the thing you're insuring costs much more than the premium.", finish: true },
        { id: 'skip', label: '🤞 Risk it (no insurance)', sublabel: 'Save $40, assume the risk', cost: 0, minutes: 2, consequence: "You don't insure it. Most people don't — until they need it.", finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Laptop protection decided.' },
  },
  {
    id: 'l3_bond_dispute', kind: 'main', priority: 165, name: 'Flat Bond Dispute', emoji: '🏘️',
    journalText: "The previous flatmate claims you damaged the bathroom — the landlord wants to keep $100 of the bond. Challenge it.",
    storySetup: 'A letter arrives about the flat bond.',
    paths: UNI, levels: [3],
    repeat: 'once',
    window: { days: [2], from: hm(10), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Bond dispute', speaker: 'Landlord', npcId: 'sam', remote: true,
      lines: [
        "Landlord: 'There's a $100 deduction for the bathroom tiles — they were damaged.'",
        "You have photos from move-in day showing the tiles were already cracked.",
      ],
      choices: [
        { id: 'challenge', label: '📸 Challenge with move-in photos', sublabel: 'Via Tenancy Tribunal', cost: 0, minutes: 30, flags: ['wk_bond_challenged'], consequence: 'You file via Tenancy Services. The landlord backs down — full bond returned.', lesson: 'Always take dated photos on move-in day. They protect you at the end.', finish: true },
        { id: 'accept', label: '😔 Accept the $100 deduction', sublabel: 'Lose $100 to avoid conflict', cost: -100, minutes: 5, consequence: "You accept it. $100 gone you didn't owe.", finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Bond dispute resolved.' },
  },
  {
    id: 'l3_power_switch', kind: 'side', priority: 150, name: 'Power Company Switch', emoji: '⚡',
    journalText: "Your flat's power contract is up for renewal. Switching to Flick Electric could save $15/month.",
    storySetup: 'Sam calls a flat meeting about the power bill.',
    paths: UNI, levels: [3],
    repeat: 'once',
    window: { days: [3], from: hm(18), until: hm(22) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Flat meeting', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: [
        "Sam: 'Our power contract is up. Flick Electric is $15 cheaper a month for a flat like ours.'",
        "Takes 20 minutes to switch online. Switch exit fee is $0.",
      ],
      choices: [
        { id: 'switch', label: '⚡ Switch to Flick Electric', sublabel: 'Save ~$15/month flat-wide', cost: 0, minutes: 20, flags: ['wk_power_switched'], consequence: 'Switched. First bill will show the saving.', lesson: 'Switching power companies takes 20 minutes and saves hundreds a year.', finish: true },
        { id: 'stay', label: '🤷 Stay with the current provider', sublabel: 'Easier, costs more', cost: 0, minutes: 2, consequence: "You stay. $15 a month extra — $180 a year.", finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Power sorted.' },
  },
  {
    id: 'l3_student_loan_check', kind: 'main', priority: 140, name: 'Loan Balance Check', emoji: '💰',
    journalText: "Log into myIR and check your student loan balance. Know the number.",
    storySetup: 'An ECON101 lecture on compound interest hits close to home.',
    paths: UNI, levels: [3],
    repeat: 'once',
    window: { days: [2], from: hm(12), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check myIR', speaker: 'You (thoughts)', remote: true,
      lines: [
        "The lecture today was about compound interest. Your loan came to mind.",
        "You can log in to myIR and see the exact balance — do you want to look?",
      ],
      choices: [
        { id: 'check', label: '💰 Check the balance', sublabel: 'myIR · no interest while studying', cost: 0, minutes: 10, flags: ['wk_loan_checked'], consequence: "$15,948 — more than you thought. But 0% interest while you're studying.", lesson: 'Student loans in NZ are 0% interest while you study full-time — but you still repay them.', finish: true },
        { id: 'avoid', label: "🙈 I'd rather not know", sublabel: "Ignorance isn't free", cost: 0, minutes: 2, consequence: "You don't check. The number doesn't change.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Loan balance known.' },
  },
  {
    id: 'l3_recap', kind: 'main', priority: 100, name: 'Call with Mum', emoji: '📹',
    journalText: "Sunday video call. Mum's proud — this week had real adult stuff: taxes, KiwiSaver, bond dispute.",
    storySetup: "Sunday evening. The week felt heavier than week 2.",
    paths: UNI, repeat: 'weekly', levels: [3],
    window: { days: [6], from: hm(15), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Call Mum', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: [
        "Mum: 'Tax returns? KiwiSaver? Bond dispute? You're more grown-up than me at your age.'",
        "She wants to hear about the bond thing.",
      ],
      choices: [
        { id: 'reflect', label: '📹 Tell her about the week', sublabel: '', cost: 0, minutes: 30, consequence: "Mum: 'That bond thing — I'm so glad you pushed back. Dad would've paid it.'", finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Week 3 done.' },
  },
];

export const UNI_L3_POOL: MissionDef[] = [
  {
    id: 'l3_bank_fee', kind: 'side', priority: 110, name: 'Hidden Bank Fee', emoji: '🏦',
    journalText: "Your bank charged a $5 'account maintenance fee'. You can switch to a free student account.",
    storySetup: 'You notice $5 missing from your account.',
    paths: UNI, levels: [3],
    repeat: 'once',
    window: { days: [1, 2, 3], from: hm(10), until: hm(17) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'bank', waypoint: 'Fix the fee', speaker: 'Bank teller', remote: true,
      lines: [
        "You spot a $5 'account maintenance fee' on your statement.",
        "The bank offers a free student account — zero fees with a student ID.",
      ],
      choices: [
        { id: 'switch', label: '🏦 Switch to free student account', sublabel: 'No more monthly fees', cost: 0, minutes: 20, flags: ['wk_free_account'], consequence: "Switched. $5/month saved — $60 a year.", lesson: 'Student bank accounts are usually free. Always ask.', finish: true },
        { id: 'ignore', label: '🤷 Leave it', sublabel: "$5/month = $60/year in fees", cost: 0, minutes: 2, consequence: "You leave it. $5 gone every month.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Bank sorted.' },
  },
  {
    id: 'l3_phone_plan', kind: 'side', priority: 100, name: 'Phone Plan Review', emoji: '📱',
    journalText: "You're paying $40/month. A $25 SIM-only plan gives the same data.",
    storySetup: "Leah shows you her $25 phone bill.",
    paths: UNI, levels: [3],
    repeat: 'once',
    window: { days: [3, 4], from: hm(15), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Review phone plan', speaker: 'Leah', npcId: 'leah', remote: true,
      lines: [
        "Leah: 'I'm on a $25 SIM-only — 30GB, unlimited calls. Why are you paying $40?'",
        "Switching takes 10 minutes online. Number ports over the same day.",
      ],
      choices: [
        { id: 'switch', label: '📱 Switch to $25 SIM-only', sublabel: 'Save $15/month = $180/year', cost: 0, minutes: 15, flags: ['wk_phone_cheaper'], consequence: 'Switched. Same coverage, $15 cheaper a month.', lesson: 'Loyalty to a phone plan costs real money — review it every year.', finish: true },
        { id: 'stay', label: '🤷 Keep current plan', sublabel: '', cost: 0, minutes: 2, consequence: "You keep it.", finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Phone plan reviewed.' },
  },
];

// ═══ LEVEL 4 — FINANCIAL CHALLENGES ═══════════════════════════════════════════

export const UNI_L4: MissionDef[] = [
  {
    id: 'l4_payday', kind: 'main', priority: 200, name: 'Final Week StudyLink', emoji: '🎓',
    journalText: "Last week of the semester. StudyLink pays $316. Credit card offer in the mail, graduation costs ahead.",
    storySetup: 'Final week. Things feel different.',
    paths: UNI, repeat: 'weekly', levels: [4],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'StudyLink', remote: true,
      lines: [
        'Your living costs payment of $316.00 has been paid into your account.',
        'Final semester week. Exam season is close.',
      ],
      choices: [{
        id: 'take', label: '🎓 Final week pay (+$316)', sublabel: 'Credit card, investment, graduation costs ahead', cost: 316, minutes: 1, effect: 'student_loan_draw',
        category: 'income', consequence: '$316 in. End-of-semester costs are real.', finish: true,
      }],
    }],
    rewards: { xp: 20, message: 'Final semester week begins.' },
  },
  {
    id: 'l4_pick_goal', kind: 'main', priority: 199, name: "Final Week Goal", emoji: '🎯',
    journalText: 'Pick your goal for the final week.',
    storySetup: 'What do you want out of the final week?',
    paths: UNI, repeat: 'weekly', levels: [4],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l4_payday'),
    steps: [{
      id: 's1', place: 'home', remote: true, waypoint: 'Set a goal',
      lines: ["Last week of semester. What matters most?"],
      choices: [
        { id: 'credit', label: '🚫 Avoid the credit card trap', sublabel: 'Return the offer, no debt', cost: 0, minutes: 0, setsGoal: 'l4_no_card', consequence: 'Goal set: resist the credit card.', finish: true },
        { id: 'invest', label: '📈 Make your first investment', sublabel: '$50 into Sharesies', cost: 0, minutes: 0, setsGoal: 'l4_invest', consequence: 'Goal set: first investment this week.', finish: true },
        { id: 'grad', label: '🎓 Budget for graduation costs', sublabel: 'Gown, tickets, dinner', cost: 0, minutes: 0, setsGoal: 'l4_grad', consequence: 'Goal set: graduation budget ready.', finish: true },
        { id: 'loanplan', label: '💳 Make a loan repayment plan', sublabel: 'Know when you\'ll be debt-free', cost: 0, minutes: 0, setsGoal: 'l4_debtfree', consequence: 'Goal set: repayment plan by Sunday.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    id: 'l4_credit_card', kind: 'main', priority: 190, name: 'Credit Card Offer', emoji: '💳',
    journalText: "A bank offers you a $1,000 credit card — 'interest-free for 55 days!' The catch is 19.95% after that.",
    storySetup: 'A bank letter arrives in the post.',
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [0], from: hm(11), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Credit card decision', speaker: 'Bank', remote: true,
      lines: [
        "Letter: 'Congratulations! You're pre-approved for a $1,000 credit card. Interest-free for 55 days!'",
        "The fine print: 19.95% p.a. after 55 days. $15/month fee if you carry a balance.",
      ],
      choices: [
        { id: 'decline', label: '🚫 Decline — not ready for credit', sublabel: 'No debt risk on student income', cost: 0, minutes: 5, flags: ['wk_card_declined'], consequence: "You decline. Smart call on a student income.", lesson: "A credit card at 19.95% eats into a budget that's already tight. Wait until income is stable.", finish: true },
        { id: 'accept_careful', label: '✅ Accept — pay it in full every month', sublabel: 'Builds credit, but needs discipline', cost: 0, minutes: 10, flags: ['wk_card_accepted', 'wk_card_careful'], consequence: "Accepted. You set a $100 limit and a direct debit. Discipline required.", lesson: 'A credit card paid in full every month costs $0 in interest and builds your credit score.', finish: true },
        { id: 'accept_yolo', label: '🛍️ Accept — treat yourself', sublabel: '19.95% interest will bite', cost: -200, minutes: 20, flags: ['wk_card_accepted', 'wk_card_debt'], consequence: "You spend $200. In 55 days: $200 + interest. The cycle starts.", lesson: "Credit card debt at 19.95% compounds fast. $200 becomes $239 in 12 months if unpaid.", finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Credit card decision made.' },
  },
  {
    id: 'l4_sharesies', kind: 'main', priority: 180, name: 'First Investment', emoji: '📈',
    journalText: "Mei uses Sharesies to invest in index funds. $50 is enough to start.",
    storySetup: 'Mei shows you her Sharesies returns over coffee.',
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [1], from: hm(12), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'Sharesies intro with Mei', speaker: 'Mei', npcId: 'mei',
      lines: [
        "Mei: 'I put $50 in an NZ index fund six months ago. It's up $4.20. Not life-changing — but it started.'",
        "'Sharesies lets you start from $1. Index funds are low-risk for long-term goals.'",
      ],
      choices: [
        { id: 'invest', label: '📈 Invest $50 in an NZ index fund', sublabel: 'Long-term, diversified, low fee', cost: -50, minutes: 30, flags: ['wk_invested'], consequence: "$50 in. You're an investor now.", lesson: 'Index funds spread your money across hundreds of companies — lower risk than single stocks.', finish: true },
        { id: 'research', label: '🔍 Research more before investing', sublabel: 'No risk, but no return either', cost: 0, minutes: 30, consequence: "You note the apps. The money stays in your account.", finish: true },
        { id: 'skip', label: '⏭️ Not right now', sublabel: 'Budget is too tight', cost: 0, minutes: 5, consequence: "Fair enough — an empty wallet isn't a good starting point.", finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'First investment made.' },
  },
  {
    id: 'l4_graduation_costs', kind: 'main', priority: 170, name: 'Graduation Budget', emoji: '🎓',
    journalText: "Graduation is in December. Gown hire $95, ceremony tickets $30 each (parents), dinner for three ~$150.",
    storySetup: "An email from the university about graduation arrives.",
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [2], from: hm(10), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Plan graduation', speaker: 'You', remote: true,
      lines: [
        "Graduation: gown hire $95, 2 parent tickets $60, family dinner ~$150. Total: ~$305.",
        "You have 4 months. That's $76/month to set aside.",
      ],
      choices: [
        { id: 'automate', label: '🏦 Set up $76/month auto-transfer to savings', sublabel: '4 months → graduation covered', cost: -76, minutes: 10, flags: ['wk_grad_saving'], consequence: "Auto-transfer set. $76/month, graduation covered without scrambling.", lesson: 'Automating savings for big events stops you from scrambling at the last minute.', finish: true },
        { id: 'manual', label: '📝 Plan to save manually each month', sublabel: 'Higher risk of forgetting', cost: 0, minutes: 5, flags: ['wk_grad_plan'], consequence: "You write it down. Manual transfers need willpower.", finish: true },
        { id: 'ignore', label: '🤷 Worry about it in December', sublabel: 'End-of-year scramble', cost: 0, minutes: 2, consequence: "You close the email. December-you will deal with it.", finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Graduation planned.' },
  },
  {
    id: 'l4_loan_plan', kind: 'main', priority: 160, name: 'Loan Repayment Plan', emoji: '💰',
    journalText: "Your student loan is $16,300. At the 12c threshold repayment rate, you'll pay it off in about 7 years — but there are ways to go faster.",
    storySetup: "ECON101 had a class on debt strategy today.",
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [3], from: hm(12), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Loan plan', speaker: 'You (thoughts)', remote: true,
      lines: [
        "$16,300 loan. At threshold repayment rates from a graduate salary, ~7 years to clear.",
        "Voluntary extra repayments reduce the principal — no penalty for paying faster.",
      ],
      choices: [
        { id: 'extra', label: '💸 Plan $50/month extra repayments', sublabel: 'Clears in ~5 years instead of 7', cost: 0, minutes: 15, flags: ['wk_loan_plan_extra'], consequence: 'Plan set. $50 extra per month cuts 2 years off your loan.', lesson: '$50/month extra repayment on a student loan saves you thousands in time.', finish: true },
        { id: 'minimum', label: '💳 Minimum repayments only', sublabel: 'IRD handles it automatically', cost: 0, minutes: 5, flags: ['wk_loan_minimum'], consequence: 'Minimum it is. 7 years — or more, depending on salary.', finish: true },
        { id: 'ignore', label: "🙈 It's future me's problem", sublabel: 'Avoidance is a strategy — a bad one', cost: 0, minutes: 2, consequence: "Fair. But the number doesn't get smaller while you're not looking.", finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Loan strategy set.' },
  },
  {
    id: 'l4_exam_prep', kind: 'side', priority: 150, name: 'Exam Prep Costs', emoji: '📚',
    journalText: "Past exam papers are $2 each from the library, or free online at the university site.",
    storySetup: 'Study week is coming up.',
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [2, 3], from: hm(14), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'Get study materials', speaker: 'You', remote: false,
      lines: [
        "Study week approaches. Past papers help — library charges $2 each to print, or free to download.",
        "You need 3 sets of past papers.",
      ],
      choices: [
        { id: 'free', label: '💻 Download free from uni website', sublabel: 'Zero cost', cost: 0, minutes: 20, flags: ['wk_exam_free'], consequence: 'Downloaded. Same papers, zero cost.', lesson: "Check the university's free resources before paying — most materials are available online.", finish: true },
        { id: 'print', label: '🖨️ Print from the library ($6)', sublabel: 'Physical copies to annotate', cost: -6, minutes: 15, consequence: 'Printed. $6 for physical copies.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Study materials sorted.' },
  },
  {
    id: 'l4_flat_farewell', kind: 'side', priority: 130, name: 'Flat Farewell Dinner', emoji: '🍕',
    journalText: "The flat wants a farewell dinner before semester ends. Split fairly or Dutch?",
    storySetup: "Leah starts a flat group chat about a farewell dinner.",
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [4, 5], from: hm(17), until: hm(22) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'restaurant', waypoint: 'Flat farewell dinner', speaker: 'Leah', npcId: 'leah',
      lines: [
        "Leah: 'Flat farewell! Who's organising the money?'",
        "The bill is $120 for four people — $30 each.",
      ],
      choices: [
        { id: 'split', label: '🍕 Split equally ($30)', sublabel: 'Fair for everyone', cost: -30, minutes: 90, flags: ['wk_flat_farewell'], consequence: 'Equal split. Everyone pays $30. Clean.', lesson: "Splitting equally is easier than itemising — and avoids awkward maths after wine.", finish: true },
        { id: 'organise', label: '📱 Organise via Splitwise', sublabel: 'Tracks who owes what', cost: 0, minutes: 10, consequence: 'You set up Splitwise. Sam pays you back instantly.', finish: true },
        { id: 'skip', label: '🏠 Stay home', sublabel: 'Save $30', cost: 0, minutes: 2, consequence: "You don't go. The flat eats without you.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Flat farewell done.' },
  },
  {
    id: 'l4_recap', kind: 'main', priority: 100, name: 'Final Call with Mum', emoji: '📹',
    journalText: "Final Sunday call. A whole semester of money lessons — Mum wants to hear what you learned.",
    storySetup: "Sunday. End of semester. Mum is waiting.",
    paths: UNI, repeat: 'weekly', levels: [4],
    window: { days: [6], from: hm(15), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Final call with Mum', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: [
        "Mum: 'A whole semester! What's the biggest money thing you learned?'",
        "She has a cup of tea. She has time.",
      ],
      choices: [
        { id: 'reflect', label: '📹 Tell her the whole semester story', sublabel: '', cost: 0, minutes: 40, consequence: "Mum: 'You know more about money at 18 than most people learn in their 30s.'", finish: true },
      ],
    }],
    rewards: { xp: 50, message: 'Semester complete. You did it.' },
  },
];

export const UNI_L4_POOL: MissionDef[] = [
  {
    id: 'l4_subscription_audit', kind: 'side', priority: 110, name: 'Subscription Audit', emoji: '📱',
    journalText: "You have three streaming subscriptions. Cancel the one you haven't used this month.",
    storySetup: "You realise you're paying for Netflix, Spotify and Disney+ — $42/month total.",
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [1, 2], from: hm(19), until: hm(22) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Cancel a subscription', speaker: 'You', remote: true,
      lines: [
        "Netflix $17, Spotify $12, Disney+ $13 = $42/month = $504/year.",
        "You haven't opened Disney+ in 6 weeks.",
      ],
      choices: [
        { id: 'cancel', label: '❌ Cancel Disney+ ($13 saved/month)', sublabel: '$156 saved per year', cost: 0, minutes: 10, flags: ['wk_sub_cancelled'], consequence: 'Cancelled. $13 back every month.', lesson: 'Subscriptions are invisible spending — audit them every few months.', finish: true },
        { id: 'keep', label: '🎬 Keep all three', sublabel: 'That\'s $504/year', cost: 0, minutes: 2, consequence: "You keep them all. $504/year is a lot for occasional watching.", finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Subscriptions audited.' },
  },
  {
    id: 'l4_scam_email', kind: 'side', priority: 105, name: 'Suspicious Email', emoji: '⚠️',
    journalText: "An email says your StudyLink payment was 'blocked' and you need to re-verify your bank account.",
    storySetup: 'An urgent email arrives about your StudyLink.',
    paths: UNI, levels: [4],
    repeat: 'once',
    window: { days: [2, 3], from: hm(9), until: hm(18) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Deal with the email', speaker: 'Fake StudyLink', remote: true,
      lines: [
        "Email: 'URGENT: Your StudyLink payment is blocked. Click here to verify your bank account NOW.'",
        "The link goes to studylink-verify.net — not studylink.govt.nz.",
      ],
      choices: [
        { id: 'report', label: '⚠️ Delete and report as phishing', sublabel: 'Forward to netsafe.org.nz', cost: 0, minutes: 5, flags: ['wk_scam_reported'], consequence: "Deleted and reported. Good catch — that domain was a phishing site.", lesson: 'Government agencies only email from .govt.nz — check the domain before clicking anything.', finish: true },
        { id: 'click', label: '😬 Click the link to check', sublabel: "Don't! It's a scam.", cost: 0, minutes: 10, flags: ['wk_scam_clicked'], consequence: "You click. The site looks real. You enter your details — they're now stolen. Call your bank.", lesson: "Phishing sites are convincing — always check the URL. When in doubt, go directly to the website.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Scam spotted.' },
  },
];
