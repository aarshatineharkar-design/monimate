/**
 * MoniMate — what changes between life paths. Blueprint section 26: "SAME ENGINE… only the content
 * and rules change." Everything the engine and the UI used to hard-code for the School path (the
 * week's goals, who lives in the world, what the school building is called, when class starts, what
 * the calendar says, which mission pays the week's money and which one wraps it up) lives here, one
 * entry per path. The store, the HUD and the phone read these rules instead of checking
 * `lifePath === 'school'`.
 */
import { hm } from './clock';
import { UNI_WEEK_GOALS, UNI_L2_WEEK_GOALS, UNI_L3_WEEK_GOALS, UNI_L4_WEEK_GOALS, UNI_L5_WEEK_GOALS, WEEK_GOALS, L2_WEEK_GOALS, L3_WEEK_GOALS, L4_WEEK_GOALS, L5_WEEK_GOALS, L6_WEEK_GOALS, INTL_WEEK_GOALS, WORK_WEEK_GOALS, type LifePath, type WeekGoalDef } from './gameData';

export interface StudyRules {
  /** when the lesson starts (minute of day) — arrive early and you can wait for it */
  bell: number;
  /** the last minute you can still sit down for it */
  lastStart: number;
  /** how long it takes and what it costs */
  minutes: number;
  energy: number;
  noun: string;            // 'class' | 'lecture'
  teacher: string;         // who says "take your seat"
  roomName: string;        // where it happens
  roomHint: string;        // how to find it from the entrance
}

export interface CalendarEntry { day: number; icon: string; text: string; missionId?: string }
/** One level = one week of that path's story. */
export interface LevelMeta { name: string; blurb: string; calendar: CalendarEntry[] }

export interface PathRules {
  id: LifePath;
  goals: WeekGoalDef[];
  goalTips: Record<string, string>;
  /** NPC ids that exist in this path's world (Mr Lee at the Dairy is in every path) */
  cast: string[];
  relationships: Record<string, number>;
  contacts: { key: string; id?: string; note: string }[];
  /** The levels that exist so far, in order. The last one repeats until more are added. */
  levels: LevelMeta[];
  study: StudyRules | null;
  /** building names that differ on this path (the 'university' place is "School" for a kid) */
  placeNames: Record<string, string>;
  /** word swaps for room, door and bus-stop labels ("Leave school" → "Leave campus") */
  swaps: [string, string][];
  /** the mission that starts the week (hands over the week's money) and the one that ends it.
   *  Can be a single ID or an array of IDs (one per level, matched by mission's levels[0]). */
  weekStart: string | string[];
  recap: string | string[];
  savings: { name: string; emoji: string; atHome: boolean };
  /** who says hello in the idle-chat fallback, and the default "Free time" hint */
  freeTimeHint: string;
}

const SCHOOL: PathRules = {
  id: 'school',
  goals: [...WEEK_GOALS, ...L2_WEEK_GOALS, ...L3_WEEK_GOALS, ...L4_WEEK_GOALS, ...L5_WEEK_GOALS, ...L6_WEEK_GOALS],
  goalTips: {
    save_event: "Tip: put money in the piggy bank at home so you don't spend it by accident. Take it out on Saturday morning.",
    arcade: "Tip: Jordan's arcade run is Thursday after school at the Mall. It's $8 — keep it free.",
    buy_headphones: 'Tip: $15 is a lot of lunches. Walk, pack lunch, and say yes to paid jobs.',
    friends: "Tip: Riley's birthday is Wednesday–Thursday. Show up for people — it doesn't always cost money.",
    l2_bike: 'Tip: a second-hand bike comes up on Friday. Money in the Kids Saver counts — withdraw it when you buy.',
    l2_bank: 'Tip: open a Kids Saver at the Bank after school (Mon–Tue). Every week you don\'t withdraw earns a $1 bonus.',
    l2_patience: "Tip: say no to the flashy stuff (mystery boxes, flash sales, trading cards) and wait for Friday's reward.",
    l2_gift: "Tip: Mum's birthday is Sunday. Shop on Saturday — a gift you paid for, or made, counts.",
    l3_on_budget: 'Tip: pick a plan on Monday, then watch the budget bars in the Bank app all week.',
    l3_save: 'Tip: $8 into savings this week. Packed lunches ($5 of bread and eggs) beat $5 a day at the canteen.',
    l3_trip: 'Tip: pay for Friday\'s museum trip by Thursday 3 PM — and don\'t run a tab at the tuck shop.',
    l3_packed: 'Tip: buy lunch supplies Monday or Tuesday, then choose your packed lunch four days out of five.',
    l4_save_wages: 'Tip: right after you get your payslip, move half to savings before you can spend it.',
    l4_right_tax: 'Tip: most first jobs use tax code M. Ask Mr Lee if you\'re unsure.',
    l4_extra_shift: 'Tip: say yes to the Wednesday cover request — the shift is Thursday 4–6 PM.',
    l4_myir: 'Tip: you can set up myIR online in 10 minutes at ird.govt.nz. It\'s free.',
    l5_phone: 'Tip: write down $120 on paper and put it somewhere you\'ll see it. Savings goals work better when they\'re visible.',
    l5_kiwisaver: 'Tip: sign up on Monday after Mum\'s suggestion. The government puts in $521 a year for free.',
    l5_trip: 'Tip: check how much you need and work backwards — $150 divided by 5 days = $30 a day in earnings.',
    l5_auto: 'Tip: say yes when Mr Lee mentions the auto-transfer. Set it to at least $10 per payslip.',
    l6_compound: 'Tip: pay attention in class on Monday — the compound interest demo is the most important thing Ms Patel has ever taught.',
    l6_kiwisaver: 'Tip: if you\'re already in KiwiSaver, ask Mum about making a voluntary contribution.',
    l6_emergency: 'Tip: keep $50 in your piggy bank and treat it as untouchable. That\'s your airbag.',
    l6_no_scam: 'Tip: if you see the suspicious email, don\'t click — report it at netsafe.org.nz.',
  },
  cast: ['mum', 'jordan', 'riley', 'teacher', 'shopkeeper'],
  relationships: { Mum: 3, Jordan: 2, Riley: 1 },
  contacts: [
    { key: 'Mum', id: 'mum', note: 'Pays for chores. Home before 8 and after 5:30.' },
    { key: 'Jordan', id: 'jordan', note: 'Loves the arcade. Impulsive spender.' },
    { key: 'Riley', id: 'riley', note: 'Social but careful with money.' },
    { key: 'Ms Patel', id: 'teacher', note: 'Your teacher. Classroom, weekdays.' },
  ],
  levels: [{
    name: 'Money Basics', blurb: '$20 for the week. Make it to Friday.',
    calendar: [
    { day: 0, icon: '💵', text: 'Pocket money · pick your goal', missionId: 'pocket_money' },
    { day: 0, icon: '🛒', text: "Mum's grocery errand", missionId: 'pickup_groceries' },
    { day: 1, icon: '🏀', text: 'Basketball sign-up at lunch ($6)', missionId: 'sports_signup' },
    { day: 2, icon: '📐', text: 'Project supplies due (5:30 PM)', missionId: 'school_project' },
    { day: 2, icon: '🎂', text: "Riley's birthday (Wed–Thu)", missionId: 'friend_birthday' },
    { day: 3, icon: '🕹️', text: 'Arcade with Jordan · Dairy shift', missionId: 'arcade_invite' },
    { day: 4, icon: '🖼️', text: 'Project presentations after class', missionId: 'project_day' },
    { day: 4, icon: '🏀', text: 'Basketball game 4 PM (if you signed up)', missionId: 'team_game' },
    { day: 5, icon: '🎟️', text: 'School fair 10–2 ($10)', missionId: 'school_fair' },
    { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'friday_recap' },
  ] },
  {
    name: 'Saving Up', blurb: 'Open a bank account, wait for the good stuff, and plan a birthday present.',
    calendar: [
      { day: 0, icon: '💵', text: 'Pocket money · pick your goal', missionId: 'pocket_money' },
      { day: 0, icon: '🏦', text: 'Open a Kids Saver at the Bank (Mon–Tue)', missionId: 'l2_bank_account' },
      { day: 1, icon: '🍫', text: "Ms Patel's patience test", missionId: 'l2_patience' },
      { day: 1, icon: '🎒', text: 'Your school bag breaks', missionId: 'l2_school_bag' },
      { day: 2, icon: '🍽️', text: "Mum's dishes deal: $2 a night (Wed–Sat)", missionId: 'l2_chore_contract' },
      { day: 3, icon: '📈', text: 'Money Week: compound interest', missionId: 'l2_interest_lesson' },
      { day: 3, icon: '📦', text: "Jordan's mystery-box plan", missionId: 'l2_mystery_boxes' },
      { day: 4, icon: '🚲', text: 'A bike for sale online', missionId: 'l2_bike_sale' },
      { day: 5, icon: '🎁', text: "Shop for Mum's birthday", missionId: 'l2_gift_shopping' },
      { day: 6, icon: '🎂', text: "Mum's birthday · Kids Saver interest paid", missionId: 'l2_mum_birthday' },
      { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'friday_recap' },
    ],
  },
  {
    name: 'Budgeting', blurb: '$30 — and now your lunches, bus and phone are on you. Plan it, then stick to it.',
    calendar: [
      { day: 0, icon: '💵', text: '$30 pocket money · pick your goal', missionId: 'pocket_money' },
      { day: 0, icon: '📊', text: 'Make a budget plan', missionId: 'l3_budget_plan' },
      { day: 0, icon: '🥪', text: 'Buy lunch supplies (Mon–Tue)', missionId: 'l3_meal_prep' },
      { day: 1, icon: '🏛️', text: 'Museum trip announced ($12, due Thu)', missionId: 'l3_trip_notice' },
      { day: 2, icon: '🚌', text: 'Bus fares rise on Thursday', missionId: 'l3_fare_rise' },
      { day: 2, icon: '🍕', text: 'Pizza with friends — who pays what?', missionId: 'l3_split_bill' },
      { day: 2, icon: '🥧', text: 'Tuck shop starts running tabs', missionId: 'l3_tuck_tab' },
      { day: 3, icon: '💳', text: 'Pay for the museum trip by 3 PM', missionId: 'l3_trip_payment' },
      { day: 4, icon: '🦕', text: 'Museum trip (if paid) · tab due', missionId: 'l3_museum_trip' },
      { day: 4, icon: '📊', text: 'Budget check-in', missionId: 'l3_budget_checkin' },
      { day: 5, icon: '🎉', text: "Jordan's birthday party", missionId: 'l3_jordan_party' },
      { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'friday_recap' },
    ],
  },
  {
    name: 'Earning Money', blurb: 'First payslip, PAYE, tax codes, and the temptation to spend it all.',
    calendar: [
      { day: 0, icon: '💵', text: '$30 pocket money · pick your goal', missionId: 'pocket_money' },
      { day: 0, icon: '💼', text: 'First shift at the Dairy (4–6 PM)', missionId: 'l4_job_starts' },
      { day: 1, icon: '📬', text: 'IRD letter (if wrong tax code)', missionId: 'l4_ird_letter' },
      { day: 2, icon: '⏰', text: 'Cover shift offer from Mr Lee', missionId: 'l4_extra_shift' },
      { day: 3, icon: '🏪', text: 'Cover shift at the Dairy (4–6 PM)', missionId: 'l4_extra_shift_work' },
      { day: 4, icon: '💰', text: 'Payday — collect your payslip', missionId: 'uni_payday' },
      { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'uni_recap' },
    ],
  },
  {
    name: 'Bigger Goals', blurb: 'Phone, KiwiSaver, or the Rotorua trip — pick a big target and protect it from temptation.',
    calendar: [
      { day: 0, icon: '💵', text: '$30 pocket money · pick your goal', missionId: 'pocket_money' },
      { day: 0, icon: '🎯', text: 'Pick your big goal for the week', missionId: 'l5_big_goal' },
      { day: 1, icon: '🌿', text: 'KiwiSaver explained at school', missionId: 'l5_kiwisaver' },
      { day: 2, icon: '👟', text: 'Limited-edition drop — test your willpower', missionId: 'l5_temptation' },
      { day: 3, icon: '⚙️', text: 'Payday · auto-save conversation', missionId: 'l5_auto_save' },
      { day: 4, icon: '🏆', text: 'Goal day — did you make it?', missionId: 'l5_goal_day' },
      { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'l5_recap' },
    ],
  },
  {
    name: 'Smart Money', blurb: 'Compound interest, index funds, insurance and a letter to your 30-year-old self.',
    calendar: [
      { day: 0, icon: '💵', text: '$30 pocket money · pick your goal', missionId: 'pocket_money' },
      { day: 0, icon: '📈', text: 'The compound effect — Ms Patel\'s demo', missionId: 'l6_compound' },
      { day: 1, icon: '📊', text: 'What\'s an index fund? Riley explains', missionId: 'l6_index_fund' },
      { day: 2, icon: '🔒', text: "Jordan's bike gets stolen — no insurance", missionId: 'l6_insurance' },
      { day: 3, icon: '✉️', text: 'Letter to future you (homework)', missionId: 'l6_future_me' },
      { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'l6_recap' },
    ],
  }],
  study: {
    bell: hm(8, 30), lastStart: hm(11, 30), minutes: 240, energy: 15,
    noun: 'class', teacher: 'Ms Patel', roomName: 'Classroom',
    roomHint: 'Class is in the Classroom — first door on the left of the hallway',
  },
  placeNames: { university: 'School' },
  swaps: [],
  weekStart: 'pocket_money',
  recap: 'friday_recap',
  savings: { name: 'Piggy bank', emoji: '🐷', atHome: true },
  freeTimeHint: 'Free time — explore',
};

const UNIVERSITY: PathRules = {
  id: 'university',
  goals: [...UNI_WEEK_GOALS, ...UNI_L2_WEEK_GOALS, ...UNI_L3_WEEK_GOALS, ...UNI_L4_WEEK_GOALS, ...UNI_L5_WEEK_GOALS],
  goalTips: {
    uni_buffer: 'Tip: move money into Savings from the Bank app the moment StudyLink lands — what you can\'t see, you don\'t spend.',
    uni_job: 'Tip: Student Job Search posts jobs on Tuesday. Apply, nail Wednesday\'s interview at the Café and turn up Friday.',
    uni_ready: "Tip: get the textbook sorted by Wednesday (new, second-hand or the library) and do Friday's quiz.",
    uni_social: 'Tip: join a club on Tuesday and keep things good with Sam and Mei. Saying yes doesn\'t always cost money.',
  },
  cast: ['sam', 'mei', 'lecturer', 'leah', 'shopkeeper'],
  relationships: { Mum: 3, Sam: 2, Mei: 0, Leah: 0 },
  contacts: [
    { key: 'Sam', id: 'sam', note: 'Your flatmate. Collects the rent, loves Sky Sport.' },
    { key: 'Mei', id: 'mei', note: 'In your ECON101 lectures. Organised, always in the library.' },
    { key: 'Leah', id: 'leah', note: 'Runs the Café. Hiring part-time staff.' },
    { key: 'Mum', note: 'Back home. Video calls on Sunday.' },
  ],
  levels: [{
    name: 'First Week', blurb: 'StudyLink, rent, a $120 textbook and a job to find.',
    calendar: [
    { day: 0, icon: '🎓', text: 'StudyLink pays $316 · pick your goal', missionId: 'uni_payday' },
    { day: 0, icon: '🏠', text: 'Rent due — $200 to Sam', missionId: 'uni_rent' },
    { day: 0, icon: '📕', text: 'First ECON101 lecture (10 AM)', missionId: 'uni_first_lecture' },
    { day: 1, icon: '🎪', text: 'Clubs Day in the campus hub', missionId: 'uni_clubs_day' },
    { day: 1, icon: '💼', text: 'Job ads go up (Student Job Search)', missionId: 'uni_job_hunt' },
    { day: 2, icon: '☕', text: 'Café interview (if you applied)', missionId: 'uni_interview' },
    { day: 2, icon: '📕', text: 'Textbook sorted by 5:30 PM', missionId: 'uni_textbook' },
    { day: 3, icon: '⚡', text: 'Flat power bill · phone bill ($40, automatic)', missionId: 'uni_power_bill' },
    { day: 4, icon: '💻', text: 'ECON101 quiz due tonight', missionId: 'uni_quiz' },
    { day: 4, icon: '☕', text: 'Trial shift at the Café (if offered)', missionId: 'uni_trial_shift' },
    { day: 5, icon: '🏖️', text: 'Flat trip to Raglan?', missionId: 'uni_raglan' },
    { day: 6, icon: '📹', text: 'Sunday video call with Mum', missionId: 'uni_recap' },
  ] }, {
    name: 'Student Budget', blurb: 'Flatmate drama, your first paycheque, IRD number and a weekly budget.',
    calendar: [
    { day: 0, icon: '🎓', text: 'StudyLink pays $316', missionId: 'l2_payday' },
    { day: 0, icon: '🏠', text: 'Rent due — $200 to Sam', missionId: 'l2_rent' },
    { day: 0, icon: '😤', text: 'Flatmate drama — deal with it tonight', missionId: 'l2_flatmate_drama' },
    { day: 0, icon: '📊', text: 'Make a weekly budget after paying rent', missionId: 'l2_budget_plan' },
    { day: 1, icon: '🪪', text: 'Apply for your IRD number (10 min online)', missionId: 'l2_ird_number' },
    { day: 1, icon: '🛒', text: 'Flat shared grocery shop', missionId: 'l2_shared_groceries' },
    { day: 2, icon: '☕', text: 'First official shift at the Café (4 hrs)', missionId: 'l2_cafe_first_shift' },
    { day: 6, icon: '📹', text: 'Sunday call with Mum', missionId: 'l2_recap' },
  ] }, {
    name: 'Independence', blurb: 'KiwiSaver, first tax return, bond dispute and switching your power plan.',
    calendar: [
    { day: 0, icon: '🎓', text: 'StudyLink pays $316', missionId: 'l3_payday' },
    { day: 0, icon: '🧾', text: 'Lodge your first tax return at myIR', missionId: 'l3_tax_return' },
    { day: 1, icon: '🌿', text: 'KiwiSaver enrolment from the Café', missionId: 'l3_kiwisaver' },
    { day: 1, icon: '💻', text: 'Laptop insurance decision', missionId: 'l3_laptop_insurance' },
    { day: 2, icon: '🏘️', text: 'Challenge the flat bond deduction', missionId: 'l3_bond_dispute' },
    { day: 2, icon: '💰', text: 'Check your student loan balance', missionId: 'l3_student_loan_check' },
    { day: 3, icon: '⚡', text: 'Flat power company switch', missionId: 'l3_power_switch' },
    { day: 6, icon: '📹', text: 'Sunday call with Mum', missionId: 'l3_recap' },
  ] }, {
    name: 'Financial Challenges', blurb: 'Credit cards, first investment, graduation costs and loan repayment strategy.',
    calendar: [
    { day: 0, icon: '🎓', text: 'Final semester StudyLink pays $316', missionId: 'l4_payday' },
    { day: 0, icon: '💳', text: 'Credit card offer arrives in the post', missionId: 'l4_credit_card' },
    { day: 1, icon: '📈', text: 'First investment with Mei at the Café', missionId: 'l4_sharesies' },
    { day: 2, icon: '🎓', text: 'Budget for graduation (gown, tickets, dinner)', missionId: 'l4_graduation_costs' },
    { day: 3, icon: '💰', text: 'Make a student loan repayment plan', missionId: 'l4_loan_plan' },
    { day: 4, icon: '🎉', text: 'Flat farewell dinner', missionId: 'l4_flat_farewell' },
    { day: 6, icon: '📹', text: 'Final call with Mum — semester done', missionId: 'l4_recap' },
  ] }, {
    name: 'Graduate Year', blurb: 'First real job, loan repayments kick in, moving flats, KiwiSaver with employer match, and planning a house deposit.',
    calendar: [
    { day: 0, icon: '💼', text: 'First graduate paycheque · pick your goal', missionId: 'l5_payday' },
    { day: 0, icon: '🎓', text: 'Student loan repayment starts', missionId: 'l5_loan_repayment' },
    { day: 0, icon: '🏠', text: 'Flat move decision', missionId: 'l5_flat_move' },
    { day: 1, icon: '💰', text: 'Salary negotiation offer', missionId: 'l5_job_offer_negotiation' },
    { day: 2, icon: '🥝', text: 'KiwiSaver — employer match on real wages', missionId: 'l5_kiwisaver_employer' },
    { day: 3, icon: '🚗', text: 'Car purchase decision', missionId: 'l5_car_decision' },
    { day: 4, icon: '📊', text: 'Build a monthly budget', missionId: 'l5_monthly_budget' },
    { day: 5, icon: '🏡', text: 'House deposit planning', missionId: 'l5_house_deposit' },
    { day: 6, icon: '📹', text: 'Final call with Mum — how\'s the real world?', missionId: 'l5_recap' },
  ] }],
  study: {
    bell: hm(10), lastStart: hm(11), minutes: 120, energy: 10,
    noun: 'lecture', teacher: 'Dr Hughes', roomName: 'Lecture Theatre',
    roomHint: 'ECON101 is in the Lecture Theatre — first door on the left of the hub',
  },
  placeNames: { university: 'University', shop_small: 'Bookshop' },
  swaps: [
    ['School Hallway', 'Campus Hub'], ['Classroom', 'Lecture Theatre'], ['classroom', 'lecture theatre'],
    ['Cafeteria', 'Student Café'], ['cafeteria', 'student café'], ['Gym', 'Rec Centre'], ['gym', 'rec centre'],
    ['School Gate', 'Campus Gate'], ['Leave school', 'Leave campus'], ['Back to hallway', 'Back to the hub'],
    ['Your Room', 'Your Flat'],
  ],
  weekStart: ['uni_payday', 'l2_payday', 'l3_payday', 'l4_payday', 'l5_payday'],
  recap: ['uni_recap', 'l2_recap', 'l3_recap', 'l4_recap', 'l5_recap'],
  savings: { name: 'Savings account', emoji: '🏦', atHome: false },
  freeTimeHint: 'Free time — explore the city',
};

const INTERNATIONAL: PathRules = {
  id: 'international',
  goals: INTL_WEEK_GOALS,
  goalTips: {
    intl_budget: 'Tip: check your bank balance every night this week — just look at the number.',
    intl_setup: 'Tip: bank account needs passport + visa + enrolment letter. Mall branch is open Mon–Fri 9–5.',
    intl_cook: 'Tip: rice, eggs and drumsticks are the cheapest proteins. Shop Tuesday after orientation.',
    intl_social: 'Tip: sit next to someone new at orientation — most students there don\'t know anyone either.',
  },
  // Mum is back home overseas — she only calls (remote messages), so she is not in the town itself.
  cast: ['priya', 'jae', 'coordinator', 'leo', 'landlord', 'bank_teller'],
  relationships: { Mum: 3, Priya: 0, Jae: 0, Leo: 0 },
  contacts: [
    { key: 'Mum', id: 'mum', note: 'Back home. Video calls Sunday.' },
    { key: 'Priya', id: 'priya', note: 'Fellow international student. Arrived 2 weeks earlier.' },
    { key: 'Jae', id: 'jae', note: 'Korean flatmate. Knows how to stretch a grocery budget.' },
    { key: 'Leo', id: 'leo', note: 'Café owner near campus. Hiring part-time.' },
  ],
  levels: [{
    name: 'Setup & Arrival', blurb: '$3,000 from home. SIM, bank account, rent and orientation week.',
    calendar: [
      { day: 0, icon: '✈️', text: '$3,000 arrives · pick your goal', missionId: 'intl_arrival_money' },
      { day: 0, icon: '🏠', text: 'Rent + bond — $560 due', missionId: 'intl_rent' },
      { day: 0, icon: '📱', text: 'Get a NZ SIM card (Mall)', missionId: 'intl_sim' },
      { day: 0, icon: '🏦', text: 'Open a NZ bank account', missionId: 'intl_bank' },
      { day: 1, icon: '🎓', text: 'Orientation for international students', missionId: 'intl_orientation' },
      { day: 1, icon: '🛒', text: 'First NZ supermarket shop', missionId: 'intl_grocery_shock' },
      { day: 2, icon: '🍳', text: 'Cook with Jae tonight', missionId: 'intl_cooking_lesson' },
      { day: 3, icon: '💼', text: 'Job hunting — café near campus', missionId: 'intl_work_visa' },
      { day: 3, icon: '🔢', text: 'Apply for IRD number', missionId: 'intl_ird' },
      { day: 4, icon: '📊', text: 'End-of-week budget check', missionId: 'intl_friday_recap' },
      { day: 6, icon: '📞', text: 'Video call home', missionId: 'intl_video_call' },
    ],
  }],
  study: {
    bell: hm(9), lastStart: hm(11), minutes: 180, energy: 12,
    noun: 'lecture', teacher: 'Coordinator Anika', roomName: 'Orientation Hall',
    roomHint: 'International Student Centre — ground floor, Building A',
  },
  placeNames: { university: 'University', school: 'University' },
  swaps: [
    ['School Hallway', 'Campus Hub'], ['Classroom', 'Lecture Hall'], ['classroom', 'lecture hall'],
    ['Cafeteria', 'Food Court'], ['cafeteria', 'food court'],
    ['School Gate', 'Campus Gate'], ['Leave school', 'Leave campus'],
    ['Your Room', 'Your Room (flat)'],
  ],
  weekStart: 'intl_arrival_money',
  recap: 'intl_video_call',
  savings: { name: 'Savings account', emoji: '🏦', atHome: false },
  freeTimeHint: 'Free time — explore your new city',
};

const WORKING: PathRules = {
  id: 'working',
  goals: WORK_WEEK_GOALS,
  goalTips: {
    work_save: 'Tip: transfer $100 to savings the moment $800 lands — before any spending.',
    work_debt: 'Tip: your student loan auto-deducted $118 already. Extra payments go straight off the principal.',
    work_budget: 'Tip: check your bank balance every night — just look. Five minutes a day prevents Sunday surprises.',
    work_ks: 'Tip: log in to myKiwiSaver.co.nz and bump to 4% — the tax savings mean it costs less than you think.',
  },
  cast: ['dan', 'tyler', 'leo', 'landlord'],
  relationships: { Dan: 1, Tyler: 2 },
  contacts: [
    { key: 'Dan', id: 'dan', note: 'Colleague. Lunch-run organiser.' },
    { key: 'Tyler', id: 'tyler', note: 'Old school friend. Earns less but saves more.' },
  ],
  levels: [{
    name: 'Income Management', blurb: '$800 pay, $470 in fixed bills, and a $60 WoF surprise.',
    calendar: [
      { day: 0, icon: '💰', text: 'Payday $800 · pick your goal', missionId: 'work_payday' },
      { day: 0, icon: '🏠', text: 'Rent $350 + car loan $120 due', missionId: 'work_fixed_bills' },
      { day: 1, icon: '📊', text: 'Map the $330 that\'s left', missionId: 'work_budget_map' },
      { day: 2, icon: '🚗', text: 'WoF expired — book it today', missionId: 'work_wof' },
      { day: 2, icon: '🛟', text: 'Emergency fund conversation', missionId: 'work_emergency_fund' },
      { day: 3, icon: '🥝', text: 'KiwiSaver match explained', missionId: 'work_kiwisaver' },
      { day: 3, icon: '🎓', text: 'Student loan deductions — the maths', missionId: 'work_student_loan' },
      { day: 4, icon: '📊', text: 'End-of-week review', missionId: 'work_friday_recap' },
      { day: 6, icon: '💡', text: 'Gross vs net — Sunday BBQ', missionId: 'work_gross_net' },
    ],
  }],
  study: null,
  placeNames: { university: 'Office', school: 'Office' },
  swaps: [
    ['School Hallway', 'Office'], ['Classroom', 'Meeting room'], ['classroom', 'meeting room'],
    ['Cafeteria', 'Staff kitchen'], ['cafeteria', 'staff kitchen'],
    ['School Gate', 'Office entrance'], ['Leave school', 'Leave the office'],
    ['Your Room', 'Your flat'],
  ],
  weekStart: 'work_payday',
  recap: 'work_friday_recap',
  savings: { name: 'Savings account', emoji: '🏦', atHome: false },
  freeTimeHint: 'After work — your time',
};

const RULES: Record<LifePath, PathRules> = {
  school: SCHOOL,
  university: UNIVERSITY,
  international: INTERNATIONAL,
  working: WORKING,
};

export const pathRules = (path: LifePath): PathRules => RULES[path] ?? SCHOOL;

/** The level's name, blurb and calendar (the last built level stands in for any later ones). */
export function levelMeta(path: LifePath, level: number): LevelMeta {
  const lv = pathRules(path).levels;
  return lv[Math.min(Math.max(1, level), lv.length) - 1];
}
/** How many levels a path has so far. */
export const maxLevel = (path: LifePath) => pathRules(path).levels.length;

/** Levels you need to finish on School AND University before International and Working unlock. */
export const LEVELS_TO_UNLOCK = 5;
/** Is this path open to play? School and University always are; the rest need 5 finished levels
 *  on both. `done` = levels completed per path, from the saves. */
export function pathUnlocked(path: LifePath, done: Partial<Record<LifePath, number>>): boolean {
  if (path === 'school' || path === 'university') return true;
  return (done.school ?? 0) >= LEVELS_TO_UNLOCK && (done.university ?? 0) >= LEVELS_TO_UNLOCK;
}

/** A building's name on this path (the 'university' building is "School" for a school kid). */
export function placeName(path: LifePath, placeId: string, fallback?: string): string {
  return pathRules(path).placeNames[placeId] ?? fallback ?? placeId;
}

/** Room names, door labels and stop names, reworded for this path. */
export function pathText(path: LifePath, text: string): string {
  let out = text;
  for (const [from, to] of pathRules(path).swaps) out = out.split(from).join(to);
  return out;
}