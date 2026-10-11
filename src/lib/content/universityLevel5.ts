/**
 * MoniMate — University path, Level 5: "Graduate Year".
 *
 * The semester is over. You've landed a graduate job offer, moved flats,
 * and now the real financial world kicks in: student loan repayments above
 * the threshold, KiwiSaver with employer match, budgeting on a real salary,
 * possibly buying a car, and the first steps toward a house deposit.
 *
 * Week-only flags start with `wk_` (cleared when the next payday arrives).
 */
import { hm } from '../clock';
import type { MissionDef } from '../missions';
import { doneThisWeek, hasFlag } from '../missionUtil';

const UNI: MissionDef['paths'] = ['university'];

// ═══ LEVEL 5 — GRADUATE YEAR ═════════════════════════════════════════════════

export const UNI_L5: MissionDef[] = [
  // MONDAY — First real payday, student loan repayments kick in
  {
    id: 'l5_payday', kind: 'main', priority: 200, name: 'First Graduate Pay', emoji: '💼',
    journalText: "Your first real paycheque lands — $1,120 after tax. But student loan repayments and rent eat into it fast.",
    storySetup: 'Monday morning. First real job payday.',
    paths: UNI, repeat: 'weekly', levels: [5],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'Bank', remote: true,
      lines: [
        'Your salary payment of $1,120.00 has been credited to your account.',
        "That's $28/hr, 40 hrs, after PAYE and student loan repayment. Welcome to the real world.",
      ],
      choices: [{
        id: 'take', label: '💼 First real pay (+$1,120)', sublabel: 'Student loan repayment already deducted · rent, KiwiSaver ahead',
        cost: 1120, minutes: 1, category: 'income',
        consequence: '$1,120 in. The student loan repayment already came out — IRD handles it automatically.', finish: true,
      }],
    }],
    rewards: { xp: 20, message: 'First real paycheque. The loan clock is ticking.' },
  },
  {
    id: 'l5_pick_goal', kind: 'main', priority: 199, name: 'Graduate Year Goal', emoji: '🎯',
    journalText: 'Pick your goal for graduate year.',
    storySetup: 'What do you want to achieve this week?',
    paths: UNI, repeat: 'weekly', levels: [5],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l5_payday'),
    steps: [{
      id: 's1', place: 'home', remote: true, waypoint: 'Set a goal',
      lines: ["First real pay. What matters most this week?"],
      choices: [
        { id: 'loan', label: '🎓 Make an extra loan repayment', sublabel: 'Pay it off faster', cost: 0, minutes: 0, setsGoal: 'l5_uni_loan', consequence: 'Goal set: extra loan payment this week.', finish: true },
        { id: 'deposit', label: '🏠 Start a house deposit fund', sublabel: 'First $200 into a dedicated account', cost: 0, minutes: 0, setsGoal: 'l5_uni_deposit', consequence: 'Goal set: $200 into house deposit savings.', finish: true },
        { id: 'car', label: '🚗 Research buying a car', sublabel: 'Budget and compare options', cost: 0, minutes: 0, setsGoal: 'l5_uni_car', consequence: 'Goal set: car research done by Friday.', finish: true },
        { id: 'budget', label: '📊 Build a proper monthly budget', sublabel: 'Real income, real expenses', cost: 0, minutes: 0, setsGoal: 'l5_uni_budget', consequence: 'Goal set: full monthly budget drafted.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    id: 'l5_loan_repayment', kind: 'main', priority: 190, name: 'Student Loan Repayments', emoji: '🎓',
    journalText: "IRD automatically deducts 12c per dollar above $22,828/year from your pay. You can make voluntary extras to pay it off faster.",
    storySetup: 'You notice the student loan deduction on your payslip.',
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [0], from: hm(10), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l5_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Review your payslip', speaker: 'You (thoughts)', remote: true,
      lines: [
        "Gross: $1,400. PAYE tax: $224. Student loan repayment: $56. Net: $1,120.",
        "IRD takes 12c per $1 above the repayment threshold automatically — you can't avoid it. But you can pay extra to clear it faster.",
        "At this rate: ~8 years to clear $16,300. Extra $100/month cuts that to ~5 years.",
      ],
      choices: [
        { id: 'extra', label: '💸 Set up $100/month voluntary repayment', sublabel: 'Clears ~3 years earlier', cost: -100, minutes: 15, flags: ['wk_loan_extra'], consequence: 'Extra repayment set up via myIR. $100/month off the principal.', lesson: 'Voluntary repayments on a student loan are penalty-free and save years of payments.', finish: true },
        { id: 'minimum', label: '✅ Let IRD handle the minimum', sublabel: '$56 auto-deducted already', cost: 0, minutes: 5, flags: ['wk_loan_minimum'], consequence: "The minimum keeps going out automatically. ~8 years at this rate.", finish: true },
        { id: 'check', label: '🔍 Log into myIR to see the full balance', sublabel: 'Know your number', cost: 0, minutes: 10, flags: ['wk_loan_checked'], consequence: '$16,300 remaining. The interest is 0% — but the principal is real.', lesson: 'NZ student loans are 0% interest — but they still need to be repaid from your income.', finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Loan repayment sorted.' },
  },
  {
    id: 'l5_job_offer_negotiation', kind: 'main', priority: 185, name: 'Salary Negotiation', emoji: '💼',
    journalText: "Your employer offers you $55,000. The market rate is $58,000–$62,000. Negotiate — or accept.",
    storySetup: "Your manager calls to confirm the offer.",
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [0], from: hm(14), until: hm(18) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Salary call', speaker: 'Manager', npcId: 'sam', remote: true,
      lines: [
        "Manager: 'We'd like to offer you the role at $55,000. Start Monday?'",
        "You did your research: Seek.co.nz shows graduates with your skills earn $58–62k. You have one other offer at $57k.",
      ],
      choices: [
        { id: 'negotiate', label: '💬 Counter with $60,000', sublabel: 'Backed by market research', cost: 0, minutes: 20, flags: ['wk_negotiated'], consequence: "Manager pauses. 'Let me check with HR — I think we can do $58,500.' Done.", lesson: 'Negotiating salary with market data is not rude — it is expected. Most offers have room.', finish: true },
        { id: 'accept', label: '✅ Accept $55,000', sublabel: 'No negotiation', cost: 0, minutes: 5, consequence: "Accepted. $55k is below market — and starting low makes future raises harder.", lesson: 'The salary you accept becomes the baseline for every raise you ever get at that company.', finish: true },
        { id: 'ask_time', label: '⏰ Ask for 24 hours to consider', sublabel: 'Reasonable and professional', cost: 0, minutes: 5, flags: ['wk_salary_time'], consequence: "Manager: 'Of course — let me know by Tuesday.' Good move.", lesson: "Asking for 24 hours to consider a job offer is always professional — it's expected.", finish: true },
      ],
    }],
    rewards: { xp: 35, message: 'Salary negotiation done.' },
  },
  {
    id: 'l5_kiwisaver_employer', kind: 'main', priority: 175, name: 'KiwiSaver Employer Match', emoji: '🌿',
    journalText: "Your employer contributes 3% to KiwiSaver if you do. At $55k, that's $1,650/year in free money.",
    storySetup: "HR sends through your KiwiSaver enrolment form.",
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [1], from: hm(9), until: hm(20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'KiwiSaver form', speaker: 'HR', remote: true,
      lines: [
        "HR: 'You're being auto-enrolled in KiwiSaver at 3%. Your employer matches 3%.'",
        "On $55k: you contribute $1,650/year, employer adds $1,650, government adds up to $521. That's $3,821/year compounding.",
      ],
      choices: [
        { id: 'three', label: '🌿 Stay at 3%', sublabel: 'Employer matches — free $1,650/year', cost: 0, minutes: 5, flags: ['wk_ks_three', 'ks_employer_match'], consequence: '3% enrolled. Employer matches. Government adds $521.', lesson: "At 3%, your employer's match doubles your contribution for free — it's the best return you'll ever get.", finish: true },
        { id: 'four', label: '💪 Bump to 4%', sublabel: 'Slightly more now, much more later', cost: 0, minutes: 10, flags: ['wk_ks_four', 'ks_employer_match'], consequence: '4% enrolled. Employer still matches 3%.', finish: true },
        { id: 'eight', label: '🚀 Go to 8%', sublabel: 'Aggressive saving for house deposit', cost: 0, minutes: 10, flags: ['wk_ks_eight', 'ks_employer_match'], consequence: '8% enrolled. House deposit via KiwiSaver withdrawal in 3 years.', lesson: 'KiwiSaver can be withdrawn for a first home after 3 years — higher contributions now means more deposit.', finish: true },
      ],
    }],
    rewards: { xp: 35, message: 'KiwiSaver employer match locked in.' },
  },
  {
    id: 'l5_flat_move', kind: 'main', priority: 170, name: 'Moving Flats', emoji: '📦',
    journalText: "Your student flat lease ends. Move back home (save $200/week), find a new flat ($280/week), or stay on ($200/week with new flatmates).",
    storySetup: "Sam calls — the lease is up at the end of the month.",
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [1], from: hm(12), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Flat decision', speaker: 'Sam', npcId: 'sam', remote: true,
      lines: [
        "Sam: 'Lease is up next month. I'm moving to Auckland for work. What are you doing?'",
        "Option A: Move home with parents — save $200/week, zero social life. Option B: New flat in the city — $280/week, 30 min from work. Option C: Stay in this flat with new flatmates — $200/week, familiarity.",
      ],
      choices: [
        { id: 'home', label: '🏡 Move back home', sublabel: 'Save $200/week · 45 min commute', cost: 0, minutes: 20, flags: ['wk_move_home'], consequence: 'Moving home. $200/week saved — $10,400/year toward a deposit.', lesson: 'Moving home for 1–2 years after graduation is one of the fastest ways to build a deposit.', finish: true },
        { id: 'new_flat', label: '🏙️ New city flat ($280/week)', sublabel: '30 min from work · independence', cost: -280, minutes: 30, flags: ['wk_new_flat'], consequence: 'New flat found. $280/week — more than your student rent, but closer to work.', finish: true },
        { id: 'stay', label: '🤝 Stay on with new flatmates ($200/week)', sublabel: 'Familiar area · unknown flatmates', cost: -200, minutes: 15, flags: ['wk_stay_flat'], consequence: "You stay. New flatmates arrive Saturday — hope for the best.", finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Flat situation sorted.' },
  },
  {
    id: 'l5_car_decision', kind: 'main', priority: 165, name: 'Car or No Car?', emoji: '🚗',
    journalText: "Your job is 30 min away by bus or 10 min by car. A second-hand car is $8,000 — you'd need a loan.",
    storySetup: 'Wednesday. The bus commute is getting old.',
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [2], from: hm(9), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Car research', speaker: 'You (thoughts)', remote: true,
      lines: [
        "Bus: 30 min each way, $45/week, no parking costs. Car: $8,000 second-hand, $200/month loan, $30/week fuel, $600/year WOF+rego.",
        "Total car cost: ~$340/month. Total bus: ~$195/month. Difference: $145/month.",
        "But the bus is unreliable, and there's a carpool group at work.",
      ],
      choices: [
        { id: 'bus', label: '🚌 Stick with the bus', sublabel: 'Save $145/month, use the time', cost: 0, minutes: 10, flags: ['wk_stays_bus'], consequence: 'No car. $145/month saved. You start a podcast habit on the commute.', lesson: 'Delayed car purchase is one of the biggest financial advantages of a graduate year.', finish: true },
        { id: 'carpool', label: '🤝 Join the work carpool', sublabel: '$20/week, someone else drives', cost: -20, minutes: 15, flags: ['wk_carpool'], consequence: "Carpool sorted. $20/week, 15 min door-to-door.", lesson: 'Carpooling halves the cost and environmental impact of commuting.', finish: true },
        { id: 'car_loan', label: '🚗 Get the car ($8k loan)', sublabel: '$340/month all in', cost: 0, minutes: 60, flags: ['wk_car_bought'], consequence: "Car bought. $340/month total. Faster commute — but that's a big chunk of your take-home.", lesson: 'A car loan on a graduate salary is often 15–20% of take-home pay. Run the numbers first.', finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Transport sorted.' },
  },
  {
    id: 'l5_monthly_budget', kind: 'main', priority: 160, name: 'Monthly Budget', emoji: '📊',
    journalText: "Build your first proper monthly budget: income vs rent, food, transport, loan, KiwiSaver, savings, fun.",
    storySetup: 'Thursday. Time to face the numbers properly.',
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [3], from: hm(12), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'l5_payday'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Budget time', speaker: 'You (thoughts)', remote: true,
      lines: [
        "Net pay: $1,120/week = $4,853/month. Now the bills:",
        "Rent: $800–$1,120 | Food: $200 | Transport: $45–$340 | Phone: $25 | KiwiSaver: $138 | Loan extra: $0–$100 | Savings: ? | Fun: ?",
        "What's your approach?",
      ],
      choices: [
        { id: 'strict', label: '📉 Strict: max savings, minimal fun', sublabel: '50% savings, 10% fun', cost: 0, minutes: 30, flags: ['wk_budget_strict'], consequence: "Strict budget set. $2,400/month to savings. Not sustainable — but good for a deposit.", lesson: 'A strict budget for 12–24 months can get you a house deposit 5 years ahead of schedule.', finish: true },
        { id: 'balanced', label: '⚖️ Balanced: save 20%, live a little', sublabel: '$970/month saved', cost: 0, minutes: 20, flags: ['wk_budget_balanced'], consequence: 'Balanced budget set. $970/month saved. Room for a restaurant, a weekend trip.', lesson: "The budget you can stick to beats the perfect budget you abandon in month two.", finish: true },
        { id: 'loose', label: '🤷 Loose: pay bills, see what\'s left', sublabel: 'No plan', cost: 0, minutes: 5, consequence: "No budget. You'll see what's left on Sunday — hopefully something.", finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Budget drafted.' },
  },
  {
    id: 'l5_house_deposit', kind: 'side', priority: 150, name: 'House Deposit Research', emoji: '🏠',
    journalText: "First home in Hamilton needs ~$80,000 deposit (20% of $400k). At $970/month saved: ~7 years. KiwiSaver withdrawal helps.",
    storySetup: 'A colleague mentions they bought their first home at 26.',
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [3], from: hm(17), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'House research', speaker: 'You (thoughts)', remote: true,
      lines: [
        "A colleague bought at 26. You're 22. Is it even possible?",
        "Hamilton median: $650k. 20% deposit: $130k. KiwiSaver after 5 years (8%): ~$30k. Still need $100k from savings.",
        "First Home Grant from Kāinga Ora: up to $10,000. Reduces it to $90k.",
      ],
      choices: [
        { id: 'plan', label: '🏠 Make a 5-year deposit plan', sublabel: 'Know the number, work toward it', cost: 0, minutes: 30, flags: ['wk_deposit_plan'], consequence: "Plan made: save $1,500/month for 5 years + KiwiSaver = $120k. Close.", lesson: 'The First Home Grant and KiwiSaver withdrawal make a first home more achievable than it looks.', finish: true },
        { id: 'later', label: '⏳ Think about it in a few years', sublabel: 'Not the priority right now', cost: 0, minutes: 5, consequence: "You close the browser. It's a lot.", finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'House deposit researched.' },
  },
  {
    id: 'l5_recap', kind: 'main', priority: 100, name: 'Final Call with Mum', emoji: '📹',
    journalText: "Sunday video call. A full semester at uni, and now a graduate job. Mum wants to know what comes next.",
    storySetup: "Sunday. The biggest week of your life, financially.",
    paths: UNI, repeat: 'weekly', levels: [5],
    window: { days: [6], from: hm(15), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Call Mum', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: [
        "Mum: 'Graduate year! First pay, KiwiSaver, loan repayments — you know more about money than I ever did.'",
        "'What's the plan from here?'",
      ],
      choices: [
        { id: 'reflect', label: '📹 Tell her the plan', sublabel: 'Deposit, loan, KiwiSaver', cost: 0, minutes: 40, consequence: "Mum: 'You're going to be okay. You really are.' She means it.", finish: true },
      ],
    }],
    rewards: { xp: 50, message: 'Graduate year begins. You have a plan.' },
  },
];

export const UNI_L5_POOL: MissionDef[] = [
  {
    id: 'l5_work_lunch', kind: 'side', priority: 115, name: 'Work Lunch Culture', emoji: '🥗',
    journalText: "The team goes out for lunch every Friday — $18 a head. Join in or bring your own?",
    storySetup: "Your team starts talking about Friday lunch at 10 AM.",
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [4], from: hm(10), until: hm(14) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Lunch decision', speaker: 'Colleague', npcId: 'sam', remote: true,
      lines: [
        "Colleague: 'Team Friday lunch — we go to the Thai place around the corner. $18 usually.'",
        "Every week: $18 × 52 = $936/year. You could bring your own for $3.",
      ],
      choices: [
        { id: 'join', label: '🥗 Join the team lunch ($18)', sublabel: 'Relationship investment', cost: -18, minutes: 60, flags: ['wk_team_lunch'], relationship: 2, social: true, consequence: 'Great lunch. You hear about a project opening that nobody posted yet.', lesson: 'Work lunches cost money — but relationships with colleagues have career value too.', finish: true },
        { id: 'bring', label: '🥪 Bring your own', sublabel: '$3, eat at your desk', cost: -3, minutes: 30, consequence: "You eat at your desk. The team comes back chattering about the new project.", finish: true },
        { id: 'rotate', label: '📅 Join every second Friday', sublabel: '$18 every other week', cost: -9, minutes: 30, flags: ['wk_team_lunch_alt'], consequence: "Alternate Fridays. Balance between connection and cost.", lesson: 'Compromise beats extremes — joining sometimes keeps relationships without blowing the budget.', finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Work lunch sorted.' },
  },
  {
    id: 'l5_insurance_review', kind: 'side', priority: 110, name: 'Income Protection Insurance', emoji: '🛡️',
    journalText: "Now you earn a real income, losing it to illness or injury would be catastrophic. Income protection insurance covers 75% of your salary.",
    storySetup: "An insurance company emails you about income protection.",
    paths: UNI, levels: [5],
    repeat: 'once',
    window: { days: [2, 3], from: hm(10), until: hm(18) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Insurance research', speaker: 'You (thoughts)', remote: true,
      lines: [
        "Income protection: if you're too ill or injured to work, you get 75% of your salary paid until you recover.",
        "Cost: ~$25–40/month. If you're off work for 3 months: covers $8,250 of income.",
        "ACC covers accidents. This covers illness — and illness is more common.",
      ],
      choices: [
        { id: 'get', label: '🛡️ Get income protection ($30/month)', sublabel: 'Covers illness + injury beyond ACC', cost: -30, minutes: 20, flags: ['wk_income_protection'], consequence: 'Policy active. $30/month for peace of mind on a $55k income.', lesson: 'ACC covers accidents — but illness like depression, cancer or surgery is not covered. Income protection fills that gap.', finish: true },
        { id: 'later', label: '⏳ Think about it later', sublabel: "You're young, it's probably fine", cost: 0, minutes: 5, consequence: "You close the email. Most people wait until after their first big health scare.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Insurance decision made.' },
  },
];
