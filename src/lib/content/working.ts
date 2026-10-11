/**
 * MoniMate — Working Person path, Level 1: "Income Management".
 *
 * First week as a working adult in Auckland. $800 pay lands on Monday; rent $350 and a car loan
 * payment come out immediately. The week is: fixed vs discretionary spending, a warrant-of-fitness
 * surprise, KiwiSaver employer match, gross vs net pay, and a Friday check on whether anything
 * was saved.
 *
 * Starting balance: $2,500. Starting job: office admin at $28/hr, 40 hrs/week.
 * Student loan: $25,000 (deductions automatic via payroll).
 * Week-only flags start with `wk_` so they're cleared on the next pay cycle.
 */
import { hm } from '../clock';
import type { MissionDef } from '../missions';
import { doneThisWeek, hasFlag } from '../missionUtil';

const WK = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const WORK: MissionDef['paths'] = ['working'];

// ── The scripted week ────────────────────────────────────────────────────────
export const WORK_MISSIONS: MissionDef[] = [
  // MONDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'work_payday', kind: 'main', priority: 200, name: 'Payday', emoji: '💰',
    journalText: 'Pay lands every Monday — $800 after tax and KiwiSaver. Your student loan is also repaid automatically via payroll.',
    storySetup: 'Monday morning. Phone buzzes with a bank notification.',
    paths: WORK, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'ANZ Bank', remote: true,
      lines: [
        'Salary deposit received: $800.00',
        'This is your net (after-tax) pay. Your gross was $1,120 for the week.',
        'Deductions: PAYE tax $168 · KiwiSaver 3% $33.60 · Student loan 12% $118.40',
        'Total deductions: $320. Take-home: $800.',
      ],
      choices: [{
        id: 'take', label: '💰 $800 landed', sublabel: 'Rent $350 + car loan $120 due today', category: 'income',
        cost: 800, minutes: 1,
        consequence: '$800 in. $470 is already spoken for by fixed bills.',
        lesson: 'Gross pay vs net pay: your gross is what your employer pays. Your net is what you receive after IRD, KiwiSaver, and student loan deductions.',
        flags: ['week_started', 'wk_paid'], finish: true,
      }],
    }],
    rewards: { xp: 20, message: 'Payday. Now watch where it goes.' },
  },
  {
    id: 'work_pick_goal', kind: 'main', priority: 199, name: "This Week's Goal", emoji: '🎯',
    journalText: 'After fixed bills, $330 is left for everything else. What do you want from this week?',
    storySetup: 'Your phone asks what you\'re working toward.',
    paths: WORK, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Set your goal', speaker: 'Goals', remote: true,
      lines: ['$800 in, $470 in bills. $330 left. What\'s the priority this week?'],
      choices: [
        { id: 'save', label: '🏦 Save $100 this week', sublabel: 'Emergency fund — $330 left to work with', cost: 0, minutes: 0, setsGoal: 'work_save', consequence: 'Goal: save $100 before Sunday.', finish: true },
        { id: 'debt', label: '💳 Extra $50 on student loan', sublabel: 'Pay it down faster', cost: 0, minutes: 0, setsGoal: 'work_debt', consequence: 'Goal: reduce debt faster.', finish: true },
        { id: 'budget', label: '📊 Track all spending this week', sublabel: 'Know where the $330 actually goes', cost: 0, minutes: 0, setsGoal: 'work_budget', consequence: 'Goal: track every dollar.', finish: true },
        { id: 'kiwisaver', label: '🥝 Boost KiwiSaver this week', sublabel: 'Add an extra $50 contribution', cost: 0, minutes: 0, setsGoal: 'work_ks', consequence: 'Goal: put more into KiwiSaver.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    id: 'work_fixed_bills', kind: 'main', priority: 185, name: 'Rent + Car Loan', emoji: '🏠',
    journalText: 'Monday: rent $350 and car loan $120 due. These go out before anything else.',
    storySetup: 'Two direct debits pending. Your phone shows them both.',
    paths: WORK, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(20) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Pay bills', speaker: 'Your banking app', remote: true,
      lines: [
        'Upcoming direct debits today:',
        '• Rent: $350 (landlord)',
        '• Car loan: $120 (South Auckland Finance — you have $25k on a 2019 Corolla)',
        'That\'s $470 out of $800.',
      ],
      choices: [
        { id: 'pay_both', label: '✅ Let both go through', sublabel: 'On time · $330 left', category: 'housing', cost: -470, minutes: 2,
          consequence: '$330 left for food, petrol, social — and savings if you can manage it.',
          lesson: 'Fixed bills first. The $330 that\'s left is your actual "spending money" for the week.', flags: ['wk_rent_paid', 'wk_car_loan_paid'], finish: true },
        { id: 'delay_loan', label: '⚠️ Delay car loan — just rent today', sublabel: 'Short-term relief · penalty risk', category: 'housing', cost: -350, minutes: 5,
          consequence: 'The lender charges a $25 late fee and notes the missed payment. Avoiding it is always cheaper.',
          lesson: 'Most loan agreements have a missed payment fee. One week\'s interest saved is often less than the penalty.', flags: ['wk_rent_paid'], finish: true },
        { id: 'transfer', label: '💸 Make sure the account has enough', sublabel: 'Move from savings just in case', cost: 0, minutes: 3,
          consequence: 'Already $800 in. No need to move anything. Bills go through.',
          lesson: 'Keep fixed bills and spending money in the same account — just know what\'s "reserved". Or use a separate bills account.', flags: ['wk_rent_paid', 'wk_car_loan_paid'], finish: true },
      ],
    }],
    rewards: { xp: 30, flag: 'wk_rent_paid', message: 'Bills paid. $330 to last the week.' },
  },

  // TUESDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'work_budget_map', kind: 'main', priority: 160, name: "What's Left?", emoji: '📊',
    journalText: '$330 for food, petrol, social, and anything unexpected. Work out how it splits.',
    storySetup: 'Tuesday morning at your desk. You open your phone banking to see where you stand.',
    paths: WORK,
    repeat: 'once',
    window: { days: [1], from: hm(8), until: hm(18) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_fixed_bills'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Budget breakdown', speaker: 'Your notes app', remote: true,
      lines: [
        '$330 for the week. Likely needs:',
        '• Petrol: ~$60 (2 tanks at ~$30 each)',
        '• Groceries: ~$80',
        '• Lunches if you buy: ~$70 (5 × $14)',
        '• "Free money": ~$120 (social, fun, emergencies)',
        'That\'s $330 exactly. Anything you skip stays in your account.',
      ],
      choices: [
        { id: 'write_budget', label: '📝 Write it down, track as you go', sublabel: 'Know when you\'ve hit each limit', cost: 0, minutes: 15,
          consequence: 'Budget written. You\'ll know exactly where you are each day.',
          lesson: 'A weekly spending plan takes 10 minutes. It prevents the "where did my pay go?" moment on Thursday.', flags: ['wk_budget_set'], finish: true },
        { id: 'mental_note', label: '🧠 Keep it in my head', sublabel: 'Simpler · easy to drift', cost: 0, minutes: 5,
          consequence: 'Most people think they can track in their head. Most people also run out of money on Thursday.',
          lesson: 'Spending categories let you see trade-offs. Mental accounting misses the petrol you forgot.', finish: true },
        { id: 'app', label: '📱 Use a budget app', sublabel: 'Set up takes 20 min · worth it', cost: 0, minutes: 20,
          consequence: 'You set up spending categories. Transactions auto-populate from your bank.',
          lesson: 'Free apps like PocketSmith (NZ-made) or Mint connect directly to your bank and categorise spending automatically.', flags: ['wk_budget_set'], finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Budget mapped. Now live by it.' },
  },
  {
    id: 'work_lunch_tue', kind: 'side', priority: 100, name: 'Lunch Decision', emoji: '🍱',
    journalText: 'Office lunch: buy or bring?',
    storySetup: 'Tuesday, midday. The lunch crowd heads to the food court.',
    paths: WORK,
    repeat: 'once',
    window: { days: [1], from: hm(12), until: hm(13, 30) },
    trigger: { type: 'location', place: 'cafe' },
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'Lunch spot', speaker: 'Colleague Dan', npcId: 'dan',
      lines: ['Lunch run? Thai place across the road is good, $14 bowl.'],
      choices: [
        { id: 'buy', label: '🍜 Thai bowl ($14)', sublabel: 'Tasty · eats your "free money" fast', category: 'food', cost: -14, minutes: 45, energyRestore: 15,
          consequence: '$14 lunch × 5 days = $70 a week. $280/month on lunches alone.',
          lesson: 'Bought lunch 5 days/week = $70/week. Pack 3 days and buy 2: $28/week. Save $42 a week = $2,184/year.', finish: true },
        { id: 'packed', label: '🥪 Packed lunch from home', sublabel: 'Free · if you did groceries',
          cost: 0, minutes: 20, energyRestore: 12,
          consequence: 'Sandwich and an apple. Dan looks vaguely envious when you mention it saved $14.',
          hideIf: s => !hasFlag(s, 'wk_budget_set'), finish: true },
        { id: 'skip', label: '❌ Skip — eating at my desk', sublabel: 'Save $14 · -8 energy', cost: 0, minutes: 5, energyCost: 8,
          consequence: 'You eat some crackers. By 3 PM you\'re eyeing the vending machine.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Lunch call made.' },
  },

  // WEDNESDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'work_wof', kind: 'main', priority: 170, name: 'Warrant of Fitness', emoji: '🚗',
    journalText: 'Your WoF (Warrant of Fitness) expired last week. You need one to drive legally in NZ.',
    storySetup: 'Wednesday morning — a reminder on your phone. WoF expired 3 days ago.',
    paths: WORK,
    repeat: 'once',
    window: { days: [2], from: hm(7), until: hm(18) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'WoF check', speaker: 'NZ Transport Agency', remote: true,
      lines: [
        'Your Warrant of Fitness expired on [date]. Driving with an expired WoF:',
        '• Fine: $200',
        '• WoF inspection: ~$50–$80',
        '• If repairs needed: extra on top',
        'A WoF checks your lights, brakes, tyres and more. Essential for road safety.',
      ],
      choices: [
        { id: 'book_now', label: '🔧 Book WoF today ($60)', sublabel: 'Avoid the $200 fine', category: 'transport', cost: -60, minutes: 90,
          consequence: 'Inspection done: pass. $60 well spent — $140 cheaper than the fine.',
          lesson: 'WoF = $60. Fine for expired WoF = $200. Emergency fund prevents an unplanned $60 ruining your week.', flags: ['wk_wof_done'], finish: true },
        { id: 'drive_risk', label: '🎲 Drive without it — probably fine', sublabel: 'Risk $200 fine', cost: 0, minutes: 2,
          consequence: 'You take the risk. Maybe fine. But one police stop = $200 fine AND still need the WoF.',
          lesson: 'An expired WoF fine is $200 — triple the inspection cost. The math only works one way.', finish: true },
        { id: 'ask_advance', label: '💬 Ask boss for a $60 advance', sublabel: 'Sorted — but costs goodwill', cost: 0, minutes: 15, relationship: -1,
          consequence: 'Boss agrees, slightly reluctantly. The $60 comes out of next Monday\'s pay.',
          lesson: 'Unexpected costs like this are why a $200–$500 emergency fund matters. One week\'s savings prevents this conversation.', flags: ['wk_wof_done'], finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'WoF sorted. Car\'s legal.' },
  },
  {
    id: 'work_emergency_fund', kind: 'main', priority: 130, name: 'Start an Emergency Fund', emoji: '🛟',
    journalText: 'The WoF was a wake-up call. An emergency fund prevents a $60 surprise from becoming a crisis.',
    storySetup: 'Wednesday evening. You\'re thinking about what just happened with the WoF.',
    paths: WORK,
    repeat: 'once',
    window: { days: [2], from: hm(17), until: hm(22) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_wof'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Emergency fund plan', speaker: 'Your notes', remote: true,
      lines: [
        'That WoF almost derailed your week. $60 unexpected = panic.',
        'Recommendation: build a $500 emergency fund first — before anything else.',
        'At $50/week, that\'s 10 weeks. Then stop adding and let it sit.',
      ],
      choices: [
        { id: 'start', label: '🛟 Transfer $50 to savings now', sublabel: 'Start the emergency fund', category: 'transfer', cost: -50, minutes: 5,
          consequence: '$50 in a separate savings account. It\'s called a buffer — it\'s not for spending, just for emergencies.',
          lesson: 'Emergency fund rule: 3–6 months expenses. Start with $500. It stops small surprises becoming debt.',
          effect: 'emergency_buffer_set', flags: ['wk_emergency_started'], finish: true },
        { id: 'soon', label: '📆 Plan to start next week', sublabel: 'Good intention · often doesn\'t happen', cost: 0, minutes: 2,
          consequence: '"Next week" is when most emergency funds don\'t start.',
          lesson: 'The best time to start an emergency fund is before you need it. The second best time is now.', finish: true },
        { id: 'later', label: '😅 I\'ll be fine', sublabel: 'Until you\'re not', cost: 0, minutes: 2,
          consequence: 'Statistically, 1 in 3 New Zealanders can\'t cover a $500 emergency without borrowing.',
          lesson: '37% of NZers can\'t cover an unexpected $500 cost without going into debt. An emergency fund changes that.', finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Emergency fund started. One crisis averted.' },
  },

  // THURSDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'work_kiwisaver', kind: 'main', priority: 160, name: 'KiwiSaver Match', emoji: '🥝',
    journalText: 'Your employer matches your 3% KiwiSaver contribution. That\'s free money you might not know you\'re getting.',
    storySetup: 'Thursday. HR sends a "your KiwiSaver summary" email.',
    paths: WORK,
    repeat: 'once',
    window: { days: [3], from: hm(9), until: hm(17) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'KiwiSaver email', speaker: 'HR — People & Culture', remote: true,
      lines: [
        'Your KiwiSaver contribution this week: $33.60 (3% of gross $1,120).',
        'Employer contribution: $33.60 (they must match at least 3%).',
        'Government tax credit: up to $521/year if you contribute at least $1,042/year.',
        'Your total KiwiSaver balance grew by $67.20 this week (your share + employer match).',
      ],
      choices: [
        { id: 'understand', label: '🥝 Got it — free employer money', sublabel: 'Employer match = 100% return on your 3%', cost: 0, minutes: 10,
          consequence: 'Your 3% gets matched 100% by your employer. That\'s a guaranteed 100% return before any investment growth.',
          lesson: 'KiwiSaver employer match is free money. Never opt out — you\'re giving up 3% of your gross salary.',
          flags: ['wk_ks_understood', 'kiwisaver_joined'], finish: true },
        { id: 'increase', label: '📈 Boost to 6% contribution', sublabel: '+$33.60/week to KiwiSaver · less take-home', cost: -33, minutes: 10,
          consequence: 'You log in and change to 6%. $33 less per week in hand, $67 more going to retirement.',
          lesson: 'Increasing KiwiSaver from 3% to 6%: you contribute an extra $33.60/week but get only $16.80 less in hand (tax benefit means it costs less than you think).', flags: ['wk_ks_understood', 'kiwisaver_joined'], finish: true },
        { id: 'no_touch', label: '🤷 Leave it as is', sublabel: 'Default 3% — still getting match', cost: 0, minutes: 2,
          consequence: 'Default is fine. You\'re getting the employer match. Just know what it is.',
          lesson: 'The default 3% is fine to start. You can change your rate anytime through myKiwiSaver.', flags: ['wk_ks_understood'], finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'KiwiSaver: employer match understood.' },
  },
  {
    id: 'work_student_loan', kind: 'main', priority: 130, name: 'Student Loan Deductions', emoji: '🎓',
    journalText: '$118.40 came out for your student loan. At this rate, how long until it\'s gone?',
    storySetup: 'Thursday afternoon. You\'re doing the math on your $25k debt.',
    paths: WORK,
    repeat: 'once',
    window: { days: [3], from: hm(14), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Loan calculator', speaker: 'Your notes', remote: true,
      lines: [
        'Student loan balance: $25,000',
        'Weekly deduction: $118.40 (12% of gross over $25,000/yr threshold)',
        'At this rate: $118.40 × 52 = $6,157/year',
        '$25,000 ÷ $6,157 = 4.06 years to pay off (no interest while living in NZ!)',
      ],
      choices: [
        { id: 'understand', label: '🎓 Got it — 4 years', sublabel: 'No interest in NZ is the key fact', cost: 0, minutes: 10,
          consequence: 'Student loans in NZ are interest-free while you live here. IRD just takes 12% of what you earn over the threshold.',
          lesson: 'NZ student loans: interest-free in NZ. The 12% deduction is automatic. Pay extra voluntarily to clear it faster.', flags: ['wk_loan_understood'], finish: true },
        { id: 'extra', label: '💳 Pay $50 extra this week', sublabel: 'Clears it ~3 months faster', category: 'debt_payment', cost: -50, minutes: 5,
          consequence: 'Extra $50 goes straight off the principal. No interest to worry about — every extra dollar reduces the balance directly.',
          lesson: 'With no interest, extra student loan payments are just bringing forward the payoff date. No cost, pure benefit.', flags: ['wk_loan_understood'], finish: true },
        { id: 'ignore', label: '🤷 It comes out automatically — I\'ll ignore it', sublabel: 'Fine short-term', cost: 0, minutes: 2,
          consequence: 'The auto-deduction handles it. Just know: if you leave NZ, interest starts.',
          lesson: 'NZ student loan = interest-free if you live in NZ. If you move overseas, interest applies immediately (6.8% as of 2025).', flags: ['wk_loan_understood'], finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Student loan: understood.' },
  },

  // FRIDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'work_friday_recap', kind: 'main', priority: 140, name: 'End of Week Review', emoji: '📊',
    journalText: 'Friday: $800 in, $470 bills. What happened to the $330 that was left?',
    storySetup: 'Friday afternoon. End of week — time to tally up.',
    paths: WORK,
    repeat: 'once',
    window: { days: [4], from: hm(16), until: hm(22) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Weekly review', speaker: 'Your banking app', remote: true,
      lines: [
        'Week summary:',
        '• Pay: +$800',
        '• Rent + car loan: -$470',
        '• Groceries: ~-$80  • Petrol: ~-$60  • Lunch (if bought): ~-$70',
        'Remaining: check your actual balance.',
      ],
      choices: [
        { id: 'saved', label: '✅ I saved something this week', sublabel: 'Even $20 counts', cost: 0, minutes: 10,
          consequence: 'You saved. The discipline of paying yourself first is the hardest habit to build — and the most valuable.',
          lesson: 'Even $20 saved every week = $1,040/year. Compounded in KiwiSaver or a savings account, it grows further.',
          flags: ['wk_saved', 'wk_recap_done'], finish: true },
        { id: 'broke_even', label: '🤔 Spent exactly what I had', sublabel: 'Common — and a pattern to break', cost: 0, minutes: 10,
          consequence: 'Lifestyle inflation: spending rising to meet income is the most common reason people feel broke on a good salary.',
          lesson: 'If you spend everything you earn, a pay rise just lifts your spending — it doesn\'t build wealth. Pay yourself first.', flags: ['wk_recap_done'], finish: true },
        { id: 'overspent', label: '😬 I went over — less than $0 left', sublabel: 'Happened to half of us this week', cost: 0, minutes: 10,
          consequence: 'Overspending in week one is common — especially with the WoF. Track it next week.',
          lesson: 'Overspending once isn\'t failure. Not knowing WHY you overspent is what leads to debt. Check your categories.', flags: ['wk_recap_done'], finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Week one done. Next week: try to save before you spend.' },
  },

  // SUNDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'work_gross_net', kind: 'main', priority: 120, name: 'Gross vs Net', emoji: '💡',
    journalText: 'Sunday. A mate asks "what do you earn?" — and you realize gross and net are very different numbers.',
    storySetup: 'Sunday BBQ. Your mate Tyler asks the question.',
    paths: WORK,
    repeat: 'once',
    window: { days: [6], from: hm(13), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'work_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'BBQ conversation', speaker: 'Tyler', npcId: 'tyler',
      lines: [
        '"What\'s the pay like at your new job?"',
        'You think: $28/hr × 40 hours = $1,120 a week. That\'s $58,240 a year.',
        'But your take-home is $800 a week. That\'s $41,600 a year.',
        '"Depends whether you mean gross or net."',
      ],
      choices: [
        { id: 'explain', label: '💡 Explain gross vs net', sublabel: 'Tyler: "oh right, tax..."', cost: 0, minutes: 20, relationship: 1,
          consequence: 'Tyler: "so you earn like $1,100 gross but take home $800? That\'s wild." You nod.',
          lesson: 'Gross = before tax. Net = after tax + KiwiSaver + student loan. Always know your NET — that\'s what you actually live on.', flags: ['wk_gross_net_known'], finish: true },
        { id: 'gross', label: '"About $58k a year"', sublabel: 'Technically true · practically misleading', cost: 0, minutes: 5,
          consequence: 'Tyler whistles. You feel slightly dishonest — that\'s not what lands in your account.',
          lesson: 'Quoting gross pay when budgeting leads to confusion. Always budget from net pay.', flags: ['wk_gross_net_known'], finish: true },
        { id: 'net', label: '"Take-home is about $800 a week"', sublabel: 'Honest and practical', cost: 0, minutes: 5, relationship: 1,
          consequence: 'Tyler: "solid — what are you doing with it?" The real question.',
          lesson: 'Net pay is what you can actually budget with. Gross is for negotiating your salary.', flags: ['wk_gross_net_known'], finish: true },
      ],
    }],
    rewards: { xp: 25, flag: 'wk_gross_net_known', message: 'Gross vs net: understood. Week one done.' },
  },
];

export const WORK_DAILY: MissionDef[] = [];
