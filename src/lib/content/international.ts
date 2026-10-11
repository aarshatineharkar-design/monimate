/**
 * MoniMate — International Student path, Level 1: "Setup & Arrival".
 *
 * First week in NZ. $3,000 arrives (international bank transfer from home). The week is:
 * currency conversion shock, buying a SIM card, opening a NZ bank account, orientation week,
 * grocery sticker shock, cooking vs takeaways, 20-hour work visa restriction, and a Sunday
 * video call home where Mum/Kuia reads back what you spent.
 *
 * Week-only flags start with `wk_` so they're cleared on the next pay cycle.
 */
import { hm } from '../clock';
import type { MissionDef } from '../missions';
import { doneThisWeek, hasFlag } from '../missionUtil';

const WK = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const INTL: MissionDef['paths'] = ['international'];

// ── The scripted week ────────────────────────────────────────────────────────
export const INTL_MISSIONS: MissionDef[] = [
  // MONDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'intl_arrival_money', kind: 'main', priority: 200, name: 'Money Arrives', emoji: '✈️',
    journalText: 'Your family transferred money from home. After conversion fees, $3,000 NZD lands.',
    storySetup: 'Monday, 8 AM. You just arrived last night. Your phone buzzes with a bank notification.',
    paths: INTL, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'ANZ Bank', remote: true,
      lines: [
        'International transfer received: NZD $3,000.00',
        'Note: your family sent the equivalent — the exchange rate and $35 wire fee reduced it.',
        'Exchange rate today: 1 NZD ≈ 0.57 USD / 0.52 EUR / 47 INR.',
      ],
      choices: [{
        id: 'take', label: '✈️ $3,000 landed!', sublabel: 'Rent $280 + setup costs ahead', category: 'income',
        cost: 3000, minutes: 1,
        consequence: '$3,000 in the account. Your whole semester is in this.',
        lesson: 'Exchange rates move daily. $3,000 NZD might cost your family more or less next time.',
        flags: ['week_started', 'wk_money_arrived'], finish: true,
      }],
    }],
    rewards: { xp: 20, message: '$3,000 to last the semester. The setup starts now.' },
  },
  {
    id: 'intl_pick_goal', kind: 'main', priority: 199, name: "This Week's Goal", emoji: '🎯',
    journalText: "First week in NZ — pick what matters most. Your family asks on Sunday.",
    storySetup: 'Your phone shows a checklist. So much to set up.',
    paths: INTL, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'intl_arrival_money'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Set your goal', speaker: 'Goals', remote: true,
      lines: ['$3,000 in. Rent is $280, a SIM card, setup costs — what do you want to nail this week?'],
      choices: [
        { id: 'budget', label: '📊 Track every cent this week', sublabel: 'Know where the $3,000 goes', cost: 0, minutes: 0, setsGoal: 'intl_budget', consequence: 'Goal: track all spending.', finish: true },
        { id: 'setup', label: '🏦 Get fully set up (bank + SIM)', sublabel: 'Bank account + NZ phone number', cost: 0, minutes: 0, setsGoal: 'intl_setup', consequence: 'Goal: get set up properly.', finish: true },
        { id: 'cook', label: '🍳 Cook at home 4 days', sublabel: 'Make $3,000 stretch further', cost: 0, minutes: 0, setsGoal: 'intl_cook', consequence: 'Goal: cook 4 days to save money.', finish: true },
        { id: 'social', label: '🤝 Meet 3 new people at orientation', sublabel: 'Build your support network', cost: 0, minutes: 0, setsGoal: 'intl_social', consequence: 'Goal: meet people this week.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Goal set. One week at a time.' },
  },
  {
    id: 'intl_rent', kind: 'main', priority: 185, name: 'Rent & Bond', emoji: '🏠',
    journalText: 'Rent $280/week plus one week bond ($280) on arrival. Your landlord messages you.',
    storySetup: 'Your landlord sends a message on Monday morning.',
    paths: INTL, repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(21), spanDays: 1 },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'intl_arrival_money'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to landlord', speaker: 'Mr Tran', npcId: 'landlord', remote: true,
      lines: [
        "Hi — welcome to NZ! First week is rent $280 + bond $280 = $560 total.",
        "Bond goes to Tenancy Services (you get it back when you leave, if no damage).",
        "BSB and account number in your tenancy agreement.",
      ],
      choices: [
        { id: 'pay_full', label: '🏠 Pay $560 now', sublabel: 'Rent + bond · done', category: 'housing', cost: -560, minutes: 3, relationship: 1,
          consequence: 'Paid. Mr Tran sends a receipt. Your bond is registered with Tenancy Services.',
          lesson: 'Bond in NZ is held by a government agency (Tenancy Services) — your landlord cannot keep it without a reason.', flags: ['wk_rent_paid', 'bond_paid'], finish: true },
        { id: 'pay_rent', label: '🪙 Rent now, bond Friday', sublabel: '$280 now · $280 Friday', category: 'housing', cost: -280, minutes: 2,
          consequence: 'Mr Tran agrees to wait on the bond.', flags: ['wk_rent_paid'], finish: true },
        { id: 'ask', label: '❓ Ask about bond rules', sublabel: 'Learn before paying', cost: 0, minutes: 5,
          consequence: 'Mr Tran explains bond — you pay $560 anyway, but now you know what it means.',
          lesson: 'Bond is a deposit. In NZ it must be lodged with Tenancy Services — it\'s protected money.', flags: ['wk_rent_paid', 'bond_paid'], finish: true },
      ],
    }],
    rewards: { xp: 30, flag: 'wk_rent_paid', message: 'First NZ rent done.' },
  },
  {
    id: 'intl_sim', kind: 'main', priority: 160, name: 'Get a NZ SIM', emoji: '📱',
    journalText: 'Your home SIM roaming costs $8/day. A NZ prepay SIM with data is around $30/month.',
    storySetup: 'Monday afternoon. You need a working NZ number for everything — your bank, your uni account.',
    paths: INTL,
    repeat: 'once',
    window: { days: [0, 1], from: hm(10), until: hm(17) },
    trigger: { type: 'location', place: 'mall' },
    requires: s => doneThisWeek(s, 'intl_arrival_money'),
    steps: [{
      id: 's1', place: 'mall', waypoint: 'Phone shop', speaker: 'Shop assistant', npcId: 'shop_assistant',
      lines: [
        'Hey! Looking for a SIM? We have prepay — $30 gets you 30-day, 20 GB data, unlimited calls + texts.',
        'Or roaming from your home network — but that\'s usually $5–10 a day and data runs out fast.',
      ],
      choices: [
        { id: 'nz_sim', label: '📱 NZ prepay SIM ($30)', sublabel: '20 GB · 30 days · NZ number', category: 'other', cost: -30, minutes: 20, relationship: 1,
          consequence: 'Done — NZ number activated. You can now register your bank account and uni portal.',
          lesson: 'A local SIM pays for itself in days vs roaming charges. Always buy one on arrival.', flags: ['wk_sim_nz'], finish: true },
        { id: 'roam', label: '🌐 Keep roaming ($8/day)', sublabel: 'Familiar · expensive', cost: 0, minutes: 2,
          consequence: 'Seven days of roaming = $56. More than the SIM would cost for the whole month.',
          lesson: 'Roaming adds up invisibly. $8/day is $240/month — nearly a month\'s rent.', finish: true },
        { id: 'free_wifi', label: '📶 Just use university WiFi', sublabel: 'Free · limited to campus', cost: 0, minutes: 2,
          consequence: 'Fine until you leave campus. No signal on the bus, no authentication for your bank.',
          lesson: 'Many NZ services need a verified NZ number for 2-factor authentication.', finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Connected.' },
  },
  {
    id: 'intl_bank', kind: 'main', priority: 155, name: 'Open a NZ Bank Account', emoji: '🏦',
    journalText: 'You need a NZ account to receive work payments, pay rent by direct debit, and avoid international transfer fees.',
    storySetup: 'Monday or Tuesday — you need to walk into a branch with your passport and offer letter.',
    paths: INTL,
    repeat: 'once',
    window: { days: [0, 1], from: hm(9), until: hm(16) },
    trigger: { type: 'location', place: 'mall' },
    requires: s => doneThisWeek(s, 'intl_arrival_money'),
    steps: [{
      id: 's1', place: 'mall', waypoint: 'ANZ Branch', speaker: 'Bank teller', npcId: 'bank_teller',
      lines: [
        'Good morning! Opening a student account today?',
        'I\'ll need your passport, your student visa, and your enrolment letter.',
        'No fees on a student account — and you get a Visa debit card in 5 days.',
      ],
      choices: [
        { id: 'open', label: '🏦 Open the account', sublabel: 'Free student account · 5 days for card', cost: 0, minutes: 30,
          consequence: 'Account open. BSB and number land in your email in minutes. Card arrives Thursday.',
          lesson: 'A NZ bank account is essential. International transfers cost $25–$50 each way. Local payments are free.', flags: ['wk_bank_opened', 'nz_bank_account'], finish: true },
        { id: 'later', label: '⏳ Come back later', sublabel: 'Keep using home account for now', cost: 0, minutes: 2,
          consequence: 'Every transfer from home costs $35. And some NZ employers can\'t pay international accounts at all.',
          lesson: 'Opening a NZ account early saves money every time your family sends money.', finish: true },
      ],
    }],
    rewards: { xp: 25, flag: 'nz_bank_account', message: 'NZ banking sorted.' },
  },

  // TUESDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'intl_orientation', kind: 'main', priority: 170, name: 'Orientation Week', emoji: '🎓',
    journalText: 'Your university runs a full orientation for international students — visa rules, health cover, where to get help.',
    storySetup: 'Tuesday 9 AM. The international student coordinator waves you in.',
    paths: INTL,
    repeat: 'once',
    window: { days: [1], from: hm(8, 30), until: hm(17) },
    trigger: { type: 'location', place: 'school' },
    steps: [{
      id: 's1', place: 'school', waypoint: 'Orientation hall', speaker: 'Coordinator Anika', npcId: 'coordinator',
      lines: [
        'Welcome! A few things every international student must know:',
        '1. Your visa allows part-time work — up to 20 hours per week during semester.',
        '2. You must have health insurance. Your student levy covers basic ACC, but not GP visits.',
        '3. Student Services can help if you are struggling — financially or otherwise.',
      ],
      choices: [
        { id: 'attend', label: '🎓 Attend the full session', sublabel: '+30 XP · learn the rules', cost: 0, minutes: 180, effect: 'mark_attended',
          consequence: 'Three hours of info — the 20-hour rule, insurance, IRD registration, support services.',
          lesson: 'Working more than 20 hours on a student visa is a breach — it can affect your right to stay in NZ.', flags: ['wk_orientation_done', 'visa_rules_known'], finish: true },
        { id: 'half', label: '📋 Just the visa session', sublabel: 'Quick · miss the full picture', cost: 0, minutes: 60, effect: 'mark_attended',
          consequence: 'You get the 20-hour rule covered. Miss the insurance and support services info.',
          lesson: 'Your student levy covers ACC (accidents), not GP visits. International students often need private cover too.', flags: ['wk_orientation_done'], finish: true },
        { id: 'skip', label: '❌ Skip — I\'ll figure it out', sublabel: 'Risky · may miss key rules', cost: 0, minutes: 5,
          consequence: 'Orientation info is all on the website — but you don\'t know what you don\'t know yet.',
          lesson: 'The 20-hour work restriction applies during semester even if you have 40 hours available on your visa.', finish: true },
      ],
    }],
    rewards: { xp: 35, message: 'You know the rules. Now for groceries.' },
  },
  {
    id: 'intl_grocery_shock', kind: 'main', priority: 150, name: 'Supermarket Sticker Shock', emoji: '🛒',
    journalText: 'Your first NZ supermarket trip. Everything costs more than at home — or does it?',
    storySetup: 'Tuesday afternoon. You need food. You walk into Countdown.',
    paths: INTL,
    repeat: 'once',
    window: { days: [1], from: hm(14), until: hm(20) },
    trigger: { type: 'location', place: 'dairy' },
    steps: [{
      id: 's1', place: 'dairy', waypoint: 'Supermarket', speaker: 'Fellow student Priya', npcId: 'priya',
      lines: [
        'Oh, first NZ shop? It hurts. Chicken breast is like $14/kg.',
        'But a 2 kg bag of rice is $4, eggs $6 for 12. Cook from scratch and it\'s actually OK.',
        'Avoid the "meal deal" stuff — looks convenient, costs triple.',
      ],
      choices: [
        { id: 'smart_shop', label: '🛒 Smart basket (rice, eggs, veg, chicken)', sublabel: '$55 · 5 dinners sorted', category: 'food', cost: -55, minutes: 45,
          consequence: 'A full week of dinners for $55. That\'s $11 per meal — less than one takeaway.',
          lesson: 'Buying ingredients beats pre-made every time. Cooking once = 2–3 meals.', flags: ['wk_groceries_done', 'wk_grocery_smart'], finish: true },
        { id: 'comfort_food', label: '🏠 Familiar food from home aisle', sublabel: '$80 · some things just taste right', category: 'food', cost: -80, minutes: 30,
          consequence: 'The imported goods aisle has everything — at three times the price.',
          lesson: 'Homesick spending adds up. Budget a small comfort-food allowance separately so it doesn\'t blow the weekly food budget.', flags: ['wk_groceries_done'], finish: true },
        { id: 'takeaways', label: '🍜 Grab takeaways tonight', sublabel: '$18 · no cooking', category: 'food', cost: -18, minutes: 15,
          consequence: 'Fine tonight, but $18 × 7 nights = $126. More than a week of groceries.',
          lesson: 'One takeaway doesn\'t hurt. One every day is $1,260 over a semester.', finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'First shop done. Cooking is cheaper — fact.' },
  },

  // WEDNESDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'intl_lunch_wed', kind: 'side', priority: 100, name: 'Lunch on Campus', emoji: '🍱',
    journalText: 'The campus food court has everything — for a price.',
    storySetup: 'Wednesday, midday. Your stomach is reminding you that you exist.',
    paths: INTL,
    repeat: 'once',
    window: { days: [2], from: hm(11, 30), until: hm(14) },
    trigger: { type: 'location', place: 'school' },
    steps: [{
      id: 's1', place: 'school', waypoint: 'Food court', speaker: 'Priya', npcId: 'priya',
      lines: ['Food court or packed lunch? Campus food is honestly overpriced.'],
      choices: [
        { id: 'campus', label: '🍛 Campus food court (~$14)', sublabel: 'Hot meal · convenient', category: 'food', cost: -14, minutes: 30, energyRestore: 15,
          consequence: 'Decent food. But $14 a day × 5 days = $70/week on lunch alone.',
          lesson: 'Campus food courts are 30–50% more expensive than cooking at home.', finish: true },
        { id: 'packed', label: '🍱 Packed lunch from last night', sublabel: 'Free · if you cooked',
          cost: 0, minutes: 20, energyRestore: 12,
          consequence: 'Leftovers. Priya nods approvingly.',
          lesson: 'Cook extra at dinner. Lunch for free tomorrow.',
          hideIf: s => !hasFlag(s, 'wk_grocery_smart'), finish: true },
        { id: 'skip', label: '❌ Skip lunch', sublabel: 'Save money · -10 energy', cost: 0, minutes: 5, energyCost: 10,
          consequence: 'By 2 PM you can\'t focus.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Lunch sorted.' },
  },
  {
    id: 'intl_cooking_lesson', kind: 'main', priority: 130, name: 'Learn to Cook NZ Style', emoji: '🍳',
    journalText: 'Your flatmate Jae (Korean student) offers to show you a cheap NZ meal that works for everyone.',
    storySetup: 'Wednesday evening. Something smells amazing from the kitchen.',
    paths: INTL,
    repeat: 'once',
    window: { days: [2], from: hm(17), until: hm(21) },
    trigger: { type: 'location', place: 'home' },
    requires: s => doneThisWeek(s, 'intl_grocery_shock'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Jae', npcId: 'jae',
      lines: [
        'Hey — you want to cook together tonight? I\'m making rice, stir-fry veg, and some chicken.',
        'Costs like $6 per person. I can show you how to stretch groceries.',
      ],
      choices: [
        { id: 'join', label: '🍳 Cook together', sublabel: '$6 · saves money, makes a friend', category: 'food', cost: -6, minutes: 60, energyRestore: 18, relationship: 2,
          consequence: 'Jae shows you the trick: buy drumsticks, not breast. Double the protein at half the cost.',
          lesson: 'Chicken drumsticks: $6/kg. Chicken breast: $14/kg. Same nutrition. Choose the cheaper cut.', flags: ['wk_cooking_done'], finish: true },
        { id: 'takeaways_2', label: '🍜 Grab pad thai ($16)', sublabel: 'Tasty · skip the cooking', category: 'food', cost: -16, minutes: 20, energyRestore: 12,
          consequence: 'You grab takeaways. Jae eats for $6 to your $16.',
          lesson: 'Takeaways aren\'t wrong — but cooking the same meal yourself usually costs 60-70% less.', finish: true },
        { id: 'nothing', label: '😴 Not hungry — studying', sublabel: 'Save $6 · -8 energy', cost: 0, minutes: 10, energyCost: 8,
          consequence: 'You study. By 9 PM your brain stops working.', finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Cooking unlocked.' },
  },

  // THURSDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'intl_work_visa', kind: 'main', priority: 160, name: 'Job Search — 20 Hours', emoji: '💼',
    journalText: 'You can work up to 20 hours/week on your student visa. A café near campus is hiring.',
    storySetup: 'Thursday morning. The café has a "help wanted" sign.',
    paths: INTL,
    repeat: 'once',
    window: { days: [3], from: hm(9), until: hm(17) },
    trigger: { type: 'location', place: 'cafe' },
    steps: [{
      id: 's1', place: 'cafe', waypoint: 'Café counter', speaker: 'Café owner Leo', npcId: 'leo',
      lines: [
        'Hey! You a student? We\'re looking for someone — 15 hours a week, minimum wage, flexible.',
        'You need to bring your visa and passport. What does your visa let you do?',
      ],
      choices: [
        { id: 'apply_20', label: '✅ Apply — "20 hours/week allowed"', sublabel: 'Correct — 15hrs fits your visa', cost: 0, minutes: 30, relationship: 1,
          consequence: 'Leo takes your details. "Come in Saturday for a trial shift." 15 hrs = ~$330/week at minimum wage.',
          lesson: 'Student visas allow up to 20 hrs/week during semester. Over that is a breach — it can affect future visa applications.',
          flags: ['wk_job_applied', 'visa_rules_confirmed'], finish: true },
        { id: 'apply_40', label: '❌ "I can do 40 hours" (incorrect)', sublabel: 'Breaks your visa conditions', cost: 0, minutes: 10,
          consequence: 'Leo looks worried. "Are you sure? If you\'re on a student visa it\'s 20 hours max during semester."',
          lesson: 'Working more than 20 hours on a student visa is illegal. It can lead to visa cancellation.', flags: ['wk_job_applied'], finish: true },
        { id: 'check_first', label: '🔍 Check visa before answering', sublabel: 'Smart — confirm before committing', cost: 0, minutes: 15,
          consequence: 'You check — 20 hours it is. You apply with the right number. Leo appreciates the honesty.',
          lesson: 'Always check your visa conditions before accepting work. They vary by visa type and can change.', flags: ['wk_job_applied', 'visa_rules_confirmed'], finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Application in. Visa conditions confirmed.' },
  },
  {
    id: 'intl_ird', kind: 'main', priority: 140, name: 'Get an IRD Number', emoji: '🔢',
    journalText: 'You need an IRD (tax) number to work legally in NZ. You apply online with your visa details.',
    storySetup: 'Thursday afternoon — Leo said you\'ll need an IRD number before you can start work.',
    paths: INTL,
    repeat: 'once',
    window: { days: [3], from: hm(14), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'intl_work_visa') && hasFlag(s, 'wk_job_applied'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'IRD website', speaker: 'IRD (Online)', remote: true,
      lines: [
        'Every person who earns income in NZ needs an IRD number.',
        'Apply online at ird.govt.nz — you\'ll need your passport, visa, and a NZ address.',
        'Takes 10 working days. Can\'t start work without it.',
      ],
      choices: [
        { id: 'apply', label: '🔢 Apply for IRD number now', sublabel: '10 days to arrive · needed before work', cost: 0, minutes: 20,
          consequence: 'Application submitted. You\'ll get your IRD number by next week — perfect timing for the trial shift.',
          lesson: 'Without an IRD number, an employer must withhold tax at the highest rate (39%). Apply early.', flags: ['wk_ird_applied'], finish: true },
        { id: 'later', label: '⏳ Do it after the trial', sublabel: 'Risk being taxed at 39%', cost: 0, minutes: 2,
          consequence: 'Leo will pay you, but without an IRD number he has to use the "no-declaration" rate — 39% tax.',
          lesson: 'The no-declaration tax rate (39%) means you lose nearly 40 cents per dollar until your IRD number arrives.', finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'IRD application in. Tax sorted (eventually).' },
  },

  // FRIDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'intl_friday_recap', kind: 'main', priority: 140, name: 'End of Week Check', emoji: '📊',
    journalText: 'Friday: what did you actually spend? Was $3,000 enough to set up properly?',
    storySetup: 'Friday afternoon. You sit down with your phone and look at what\'s gone out.',
    paths: INTL,
    repeat: 'once',
    window: { days: [4], from: hm(15), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'intl_arrival_money'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Budget check', speaker: 'Your journal', remote: true,
      lines: [
        'Week 1 spending estimate:',
        '• Rent + bond: $560  • SIM card: $30  • Groceries: $55',
        '• Orientation snacks / misc: ~$20',
        'That\'s ~$665 gone in week one. $2,335 remaining.',
        'Did you stay on track?',
      ],
      choices: [
        { id: 'track', label: '✅ Yes — I tracked everything', sublabel: '+XP · know exactly where you stand', cost: 0, minutes: 15,
          consequence: 'You know your exact balance. This is how you make $3,000 last a semester.',
          lesson: 'Semester = 13 weeks. $3,000 ÷ 13 = $231/week for everything. Week 1 costs more (setup). Plan for that.',
          flags: ['wk_budget_checked'], finish: true },
        { id: 'rough', label: '🤔 Sort of — roughly', sublabel: 'Better than nothing', cost: 0, minutes: 10,
          consequence: 'You have a rough idea. Close enough for week one.',
          lesson: 'Tracking spending doesn\'t have to be perfect. Even a rough weekly total helps you see patterns.', flags: ['wk_budget_checked'], finish: true },
        { id: 'no_track', label: '❌ No — too busy this week', sublabel: 'Common · risky long-term', cost: 0, minutes: 5,
          consequence: 'Week 1 chaos is normal. But not knowing where $665 went means week 2 might be worse.',
          lesson: 'One week without tracking is fine. Two weeks becomes a habit. Start a simple weekly total in Notes.', finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Week one: complete. You made it.' },
  },

  // SUNDAY ────────────────────────────────────────────────────────────────────
  {
    id: 'intl_video_call', kind: 'main', priority: 120, name: 'Video Call Home', emoji: '📞',
    journalText: 'Sunday. Your family calls — Mum wants to hear everything. The question they always ask: "how are you managing the money?"',
    storySetup: 'Sunday, 7 PM. WhatsApp rings — it\'s home.',
    paths: INTL,
    repeat: 'once',
    window: { days: [6], from: hm(17), until: hm(22) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'intl_arrival_money'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Video call', speaker: 'Mum (from home)', npcId: 'mum', remote: true,
      lines: [
        'Oh look at you! How is the flat? Are you eating?',
        'We sent $3,000 — your uncle wants to know if it\'s enough.',
        'Tell me everything.',
      ],
      choices: [
        { id: 'honest', label: '💬 Be honest about costs', sublabel: 'Tell her about the setup expenses',
          cost: 0, minutes: 30, relationship: 3,
          consequence: 'Mum listens. She\'s glad you\'re managing. "Your uncle says you should keep tracking — he didn\'t at first and it was a problem."',
          lesson: 'Telling family early about costs prevents the "I didn\'t know you needed more" conversation later.', flags: ['wk_called_home'], finish: true },
        { id: 'optimistic', label: '😊 "Everything is great!"', sublabel: 'Don\'t worry them — keep it positive',
          cost: 0, minutes: 25, relationship: 1,
          consequence: 'Mum is happy. But if you hit a cash crunch next month, it\'ll be harder to explain.',
          lesson: 'Families want to help — but only if they know you need it. A heads-up early is better than a crisis call.', flags: ['wk_called_home'], finish: true },
        { id: 'skip_call', label: '📵 Busy — call next week', sublabel: 'They\'ll worry',
          cost: 0, minutes: 5, relationship: -2,
          consequence: 'Three "read" messages. Dad sends a voice note. Mum texts your cousin to check on you.',
          lesson: 'Regular contact with home isn\'t just emotional — it\'s your financial safety net. Keep them updated.', finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Week one done. The first week is always the hardest.' },
  },
];

export const INTL_DAILY: MissionDef[] = [];
