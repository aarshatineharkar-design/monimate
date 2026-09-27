/**
 * MoniMate — scheduled mission engine.
 *
 * Missions never "pop up". Each one has: an availability window (day + time), an expiry, a trigger
 * (time / location / NPC interaction / world event / another mission), prerequisites, a priority and a
 * completion condition. The engine only ever reads the central clock (`state.minutes`) and the events
 * the store emits — it has no timers of its own.
 */
import { MIN_PER_DAY, at, hm, parts } from './clock';
import type { GameEvent, GameState, MissionKind, MissionRuntime } from './types';
import type { TransactionCategory } from '../game/types/transaction';
import { DAILY_MISSIONS } from './dailyMissions';
import { UNI_MISSIONS, UNI_DAILY } from './content/university';
import { SCHOOL_L2, SCHOOL_L2_POOL, SCHOOL_L3, SCHOOL_L3_POOL } from './content/schoolLevels';
import { markKey, hasMark, attendedToday, doneThisWeek, resolvedThisWeek, fromLevel } from './missionUtil';
export { markKey, hasMark, fromLevel };

// ── Definition types ───────────────────────────────────────────────────────
export type Trigger =
  | { type: 'time' }                                   // offered as soon as the window opens
  | { type: 'location'; place: string }                // offered when the player enters `place` inside the window
  | { type: 'interaction'; npcId: string }             // offered when the player talks to the NPC inside the window
  | { type: 'world'; event: 'bus_arrived'; stopId: string }
  | { type: 'completion'; missionId: string };         // story: previous mission completed

export interface MissionWindow {
  /** days of week (0=Mon) the window opens on */
  days: number[];
  from: number;            // minute of day it becomes available
  until: number;           // minute of day it expires
  spanDays?: number;       // expires `spanDays` days after it opened (default 0 = same day)
}

export interface MissionChoice {
  id: string; label: string; sublabel: string;
  cost: number;            // negative = spend, positive = earn
  /** what the money is for, in the ledger (default: 'other' for spending, 'income' for earning) */
  category?: TransactionCategory;
  minutes: number;         // game minutes this consumes on the central clock
  relationship?: number;   // delta with the step's NPC
  consequence: string;
  lesson?: string;
  flags?: string[];
  social?: boolean;
  finish?: boolean;        // resolves the mission
  /** Picks this week's goal (see WEEK_GOALS in gameData.ts). */
  setsGoal?: string;
  /** A special world effect this choice has (bus pass, subscription…), applied by GameStore. */
  effect?: 'bus_pass_week' | 'subscribe_streambox' | 'no_packed_lunch_today' | 'save_5_matched'
    | 'student_loan_draw' | 'subscribe_sky' | 'bnpl_headphones'
    | 'open_kids_saver' | 'save_gift_10' | 'ten_trip_card' | 'tuck_tab_4' | 'pay_tab' | 'tab_late_fee'
    | 'premium_trial' | 'mark_attended' | 'packed_lunch_day' | 'buy_bike'
    | 'save_coins' | 'budget_shift_food' | 'cancel_premium' | 'cousin_loan';
  /** Hide this option when it doesn't make sense right now (e.g. packed lunch when you have none). */
  hideIf?: (s: GameState) => boolean;
  /** Energy this choice gives back (food, rest). */
  energyRestore?: number;
  /** Step 22: optional Energy consumed via GameStore.consumeEnergy() when this choice is applied.
   *  Hand-authored per choice — never derived from cost/minutes/text/mission type. Omitted or 0 means
   *  no Energy effect. Non-blocking: consumeEnergy()'s own clamp-at-0 semantics apply, so a choice
   *  never fails or is rejected for insufficient Energy. */
  energyCost?: number;
}

export interface MissionStep {
  id: string;
  place: string;           // where this step happens (minimap waypoint + prompt)
  waypoint: string;        // short label
  speaker?: string;        // NPC display name
  npcId?: string;
  lines: string[];
  choices?: MissionChoice[];
  /** arrive-style completion: no dialogue, finishing = reaching `place` before the deadline */
  completeOnArrival?: boolean;
  /** how the step may be reached: text message steps happen wherever the player is */
  remote?: boolean;
  /** face-to-face step: happens wherever the player is with `npcId` (same room indoors, a few steps
   *  away outdoors), instead of at a fixed `place`. */
  withNpc?: boolean;
  /**
   * Shopping-list completion: instead of a scripted dialogue choice, the player does real walk-up-
   * and-buy shopping (Rule 27) inside `place`, and the step resolves itself the moment they walk back
   * out having covered every need. `purchaseNeeds` are id PREFIXES — one purchased item per prefix
   * satisfies that need, so the player picks whichever brand/tier they want (Rule 28: the game never
   * chooses for them). `purchaseBudget` is the "the list cost this much" reference used only to grade
   * the outcome (under/on/over budget) — never to block or auto-pick anything.
   */
  awaitsPurchase?: boolean;
  purchaseNeeds?: string[];
  purchaseBudget?: number;
  /** Alternative versions of this step. One is picked per day (seeded), so the same mission
   *  reads and costs differently on different days. Each variant replaces lines/choices/speaker. */
  variants?: { speaker?: string; npcId?: string; lines: string[]; choices?: MissionChoice[] }[];
  /** A different script for this step on a given level (Level 2's pocket-money talk, Level 3's goal
   *  list…). Applied before `variants`. */
  byLevel?: Record<number, { speaker?: string; lines?: string[]; choices?: MissionChoice[] }>;
}

export interface MissionDef {
  id: string;
  kind: MissionKind;
  priority: number;        // higher = shown first
  name: string;
  emoji: string;
  journalText: string;     // what the journal says (so the player never has to remember a popup)
  storySetup: string;
  destination?: string;    // place id for minimap waypoint (defaults to first step's place)
  paths: ('school' | 'university' | 'international' | 'working')[];
  repeat: 'once' | 'daily' | 'weekly';
  window: MissionWindow;
  trigger: Trigger;
  requires?: (s: GameState) => boolean;
  steps: MissionStep[];
  rewards: { xp: number; money?: number; message: string; flag?: string };
  /** what happens if it expires or is failed. `fine` is charged (or owed) when it expires. */
  onExpire?: { message: string; flags?: string[]; relationship?: { npc: string; delta: number }; fine?: number };
  /** Daily-pool missions only happen on days the pool picks them (see DAILY_POOLS in dailyMissions.ts). */
  pool?: 'morning' | 'after_school' | 'evening' | 'weekend';
  /** Which levels (weeks) of the path this mission belongs to. Omitted = every level. */
  levels?: number[];
}

/** Is this mission part of the level the player is on? */
export const inLevel = (s: GameState, def: MissionDef) => !def.levels || def.levels.includes(s.level ?? 1);

/** Is this mission on today's menu? Always true for scripted missions; pool missions only on days
 *  the daily roll picked them. */
export function offeredToday(s: GameState, def: MissionDef): boolean {
  return inLevel(s, def) && (!def.pool || hasMark(s, `pool:${def.id}`));
}

const WK = [0, 1, 2, 3, 4];

/** Rode a bus at least once this week (today or an earlier day). */
const rodeBusThisWeek = (s: GameState) => s.today.travel.includes('bus') || s.weekDays.some(d => d.travel.includes('bus'));

function homeworkChoices(study: string, free: string): MissionChoice[] {
  return [
    { id: 'study', label: study, sublabel: 'About 1 hour', cost: 0, minutes: 60, energyCost: 5, consequence: 'Done. You feel ready for tomorrow.', flags: ['did_homework'], finish: true },
    { id: 'free', label: free, sublabel: 'Homework can wait', cost: 0, minutes: 60, energyRestore: 5, consequence: 'Fun, but the homework is still there.', finish: true },
  ];
}

/** Level 3: bought bread and eggs for the week's sandwiches (see l3_meal_prep). */
const boughtLunchSupplies = (s: GameState) => {
  const rt = s.missions.find(m => m.id === 'l3_meal_prep');
  return rt?.state === 'completed' && rt.outcome !== 'skip';
};

/** The four lunch options every lunch variant offers, with that day's menu and prices. */
function lunchChoices(menu: { meal: [string, number, number]; snack: [string, number, number, boolean?] }): MissionChoice[] {
  const [mLabel, mCost, mEnergy] = menu.meal, [sLabel, sCost, sEnergy, sSocial] = menu.snack;
  return [
    { id: 'meal', label: `${mLabel} ($${mCost.toFixed(2).replace('.00', '')})`, sublabel: `With friends · +${mEnergy} energy`, category: 'food', cost: -mCost, minutes: 30, energyRestore: mEnergy, relationship: 1, social: true, consequence: 'Lunch with friends. Good fun.', lesson: `$${mCost.toFixed(2)} a day is $${(mCost * 5).toFixed(2)} a week.`, flags: ['bought_canteen'], finish: true },
    { id: 'snack', label: `${sLabel} ($${sCost.toFixed(2).replace('.00', '')})`, sublabel: `+${sEnergy} energy`, category: 'food', cost: -sCost, minutes: 30, energyRestore: sEnergy, social: !!sSocial, relationship: sSocial ? 1 : 0, consequence: 'Cheaper, still tasty.', flags: ['bought_snack'], finish: true },
    { id: 'packed', label: '🥪 Eat what I brought', sublabel: 'Free — you planned ahead · +12 energy', cost: 0, minutes: 30, energyRestore: 12, consequence: 'Packed lunch. Nobody minds.', lesson: 'Bringing lunch can save $15–35 a week.', flags: ['ate_home_lunch'], effect: 'packed_lunch_day', finish: true,
      // From Level 3 Mum stops packing lunch: you can only bring one if you bought the supplies.
      hideIf: s => hasMark(s, 'no_packed_lunch') || ((s.level ?? 1) >= 3 && !boughtLunchSupplies(s)) },
    { id: 'skip', label: '❌ Skip lunch', sublabel: 'Save the money · -10 energy', cost: 0, minutes: 10, energyCost: 10, relationship: -1, consequence: "You save the cash, but by 2pm you can't focus.", lesson: "Skipping meals to save money isn't always worth it.", flags: ['skipped_lunch'], finish: true },
  ];
}

// ── School-student week ────────────────────────────────────────────────────
export const SCHOOL_MISSIONS: MissionDef[] = [
  {
    // MISSION 1 of "Make It to Friday" — the week's whole budget is handed over right here, on
    // screen, so the player knows exactly what they're working with before anything else happens.
    id: 'pocket_money', kind: 'main', priority: 200, name: 'Make It to Friday', emoji: '🌅',
    journalText: "Mum has sent your $20 for the week. Saturday is the school fair ($10 a ticket), and you promised Riley $5 for her birthday.",
    storySetup: "It's Monday morning. Your phone buzzes on the bedside table.",
    paths: ['school'], repeat: 'weekly',
    // A phone message, not a face-to-face talk: it arrives the moment the week starts and waits for
    // you wherever you are, so a player who heads straight outside can't miss the week's budget.
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Check your phone', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: [
        "Morning! I've sent you $20 pocket money for the week.",
        "It covers your bus fares and lunches. Ms Patel mentioned a project needing supplies, too.",
        "Saturday's the school fair — tickets are $10. And don't forget you promised Riley $5 for her birthday.",
        "If you want extra, I always need help around the house.",
      ],
      choices: [{ id: 'take', label: '💵 Thanks Mum! (+$20)', sublabel: 'A project, a birthday and a fair to plan around', category: 'income', cost: 20, minutes: 1, relationship: 1, consequence: 'The $20 lands in your account.', flags: ['got_pocket_money', 'week_started'], finish: true }],
      byLevel: {
        2: {
          lines: [
            'Morning! Your $20 for the week is in.',
            "Last week you learned where money goes. This week: making it grow.",
            'The Bank does a Kids Saver account — it pays you interest. Pop in after school and have a look?',
            "And don't forget — my birthday's on Sunday. 😉",
          ],
          choices: [{ id: 'take', label: '💵 Thanks Mum! (+$20)', sublabel: 'Save, wait, and plan a present', category: 'income', cost: 20, minutes: 1, relationship: 1, consequence: 'The $20 lands in your account.', flags: ['got_pocket_money', 'week_started'], finish: true }],
        },
        3: {
          lines: [
            "Big week. You're getting $30 now — but it has to cover everything.",
            "I'm not packing lunches any more, your phone top-up is on you, and so is the bus.",
            'Make a plan in the Budget app before you spend a cent. Sunday we compare the plan to what really happened.',
          ],
          choices: [{ id: 'take', label: '💵 Deal (+$30)', sublabel: 'Lunches, bus, phone and fun — all yours to plan', category: 'income', cost: 30, minutes: 1, relationship: 1, consequence: '$30 lands. It feels like a lot. It is not.', flags: ['got_pocket_money', 'week_started'], finish: true }],
        },
      },
    }],
    rewards: { xp: 20, message: 'Pocket money in hand. The week begins — make it to Friday.', flag: 'pocket_money_done' },
  },
  {
    // Blueprint section 24: the player chooses what "a good week" means. The Sunday recap judges it.
    id: 'pick_goal', kind: 'main', priority: 199, name: "This Week's Goal", emoji: '🎯',
    journalText: 'Pick one goal for the week. Sunday night, Mum asks how it went.',
    storySetup: 'Your phone asks what you want out of this week.',
    paths: ['school'], repeat: 'weekly',
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'pocket_money'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Pick a goal', speaker: 'Goals', remote: true,
      lines: ['$20 has to cover the whole week.', 'What matters most to you this week?'],
      choices: [
        { id: 'save_event', label: '🎟️ Go to the school fair', sublabel: 'Have $10 for a ticket on Saturday', cost: 0, minutes: 0, setsGoal: 'save_event', consequence: 'Goal set: the fair. $10 by Saturday.', finish: true },
        { id: 'arcade', label: '🕹️ Hit the arcade with Jordan', sublabel: "Thursday's arcade run costs $8", cost: 0, minutes: 0, setsGoal: 'arcade', consequence: 'Goal set: the arcade on Thursday.', finish: true },
        { id: 'buy_headphones', label: '🎧 Buy the $15 headphones', sublabel: 'They are at the Mall', cost: 0, minutes: 0, setsGoal: 'buy_headphones', consequence: 'Goal set: headphones from the Mall.', finish: true },
        { id: 'friends', label: '🤝 Be there for your friends', sublabel: "Don't let Jordan or Riley down", cost: 0, minutes: 0, setsGoal: 'friends', consequence: 'Goal set: keep your friendships strong.', finish: true },
      ],
      byLevel: {
        2: {
          lines: ['Level 2: Saving Up.', 'What are you saving for this week?'],
          choices: [
            { id: 'bike', label: '🚲 Save $30 for a bike', sublabel: 'A second-hand one comes up Friday', cost: 0, minutes: 0, setsGoal: 'l2_bike', consequence: 'Goal set: $30 saved.', finish: true },
            { id: 'bank', label: '🏦 Open a Kids Saver, keep $15 in it', sublabel: 'Interest + a weekly bonus', cost: 0, minutes: 0, setsGoal: 'l2_bank', consequence: 'Goal set: your first bank account.', finish: true },
            { id: 'patience', label: '⏳ No impulse buys all week', sublabel: 'Every "limited time" offer is a test', cost: 0, minutes: 0, setsGoal: 'l2_patience', consequence: 'Goal set: nothing on impulse.', finish: true },
            { id: 'gift', label: "🎁 A birthday gift for Mum", sublabel: 'Her birthday is Sunday', cost: 0, minutes: 0, setsGoal: 'l2_gift', consequence: "Goal set: Mum's birthday.", finish: true },
          ],
        },
        3: {
          lines: ['Level 3: Budgeting.', '$30, and every cost is yours. What does a good week look like?'],
          choices: [
            { id: 'budget', label: '📊 Stick to your budget plan', sublabel: 'No envelope over by Sunday', cost: 0, minutes: 0, setsGoal: 'l3_on_budget', consequence: 'Goal set: plan it, then do it.', finish: true },
            { id: 'save', label: '🐷 Save $8 of your $30', sublabel: 'Into savings by Sunday', cost: 0, minutes: 0, setsGoal: 'l3_save', consequence: 'Goal set: $8 saved.', finish: true },
            { id: 'trip', label: '🏛️ Go on the trip, owe nobody', sublabel: 'Museum Friday, no tabs', cost: 0, minutes: 0, setsGoal: 'l3_trip', consequence: 'Goal set: the trip, debt-free.', finish: true },
            { id: 'packed', label: '🥪 Pack your lunch 4 days', sublabel: 'Buy supplies Mon–Tue', cost: 0, minutes: 0, setsGoal: 'l3_packed', consequence: 'Goal set: four packed lunches.', finish: true },
          ],
        },
      },
    }],
    rewards: { xp: 10, message: 'Goal set.' },
  },
  {
    // MISSION 2 — locked (via `requires`) until pocket_money is actually done on Monday, so the
    // player can never end up choosing how to get to school before they know what they have to
    // spend. Tue–Fri the gate is a no-op (it only checks Monday), so the daily commute keeps working.
    id: 'get_to_school', kind: 'timed', priority: 190, name: 'Get to School', emoji: '🏫',
    journalText: 'Be at school before the 8:30 AM bell. Walking is free but takes ~25 min; Route 1 from Home St takes ~13 min and costs $2.',
    storySetup: 'School starts at 8:30. How you get there costs either time or money — your call.',
    destination: 'university', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8, 30) },
    trigger: { type: 'time' },
    requires: s => parts(s.minutes).dayOfWeek !== 0 || doneThisWeek(s, 'pocket_money'),
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
    window: { days: WK, from: hm(12, 30), until: hm(13, 30) },
    trigger: { type: 'location', place: 'university' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Canteen', speaker: 'Jordan', npcId: 'jordan',
      lines: ['Oi, come get lunch with me!', "I'm getting chips and a drink. You in?"],
      choices: lunchChoices({ meal: ['🍟 Chips & drink', 6, 15], snack: ['🍎 Just a snack', 3, 8] }),
      // A different menu (and price) each day — the same "buy vs bring" decision never costs the same twice.
      variants: [
        { speaker: 'Jordan', npcId: 'jordan', lines: ['Oi, come get lunch with me!', "I'm getting chips and a drink. You in?"],
          choices: lunchChoices({ meal: ['🍟 Chips & drink', 6, 15], snack: ['🍎 Just a snack', 3, 8] }) },
        { speaker: 'Riley', npcId: 'riley', lines: ["It's taco day!! They're $5.", 'Or there are fruit cups for $2.50.'],
          choices: lunchChoices({ meal: ['🌮 Tacos', 5, 15], snack: ['🍉 Fruit cup', 2.5, 8] }) },
        { speaker: 'Jordan', npcId: 'jordan', lines: ['PIZZA DAY. Slices are $3.50.', "Or we get a whole one with Riley — $5 each, it's huge."],
          choices: lunchChoices({ meal: ['🍕 A slice', 3.5, 12], snack: ['🍕 Share a whole pizza', 5, 20, true] }) },
        { speaker: 'Riley', npcId: 'riley', lines: ['The sushi van is here! Rolls are $7…', 'Pricey. Miso soup is $2 though.'],
          choices: lunchChoices({ meal: ['🍣 Sushi roll', 7, 15], snack: ['🍜 Miso soup', 2, 6] }) },
        { speaker: 'Ms Patel', npcId: 'teacher', lines: ['The Year 13 bake sale is on: muffins are $2.', 'All money goes to the camp fund.'],
          choices: lunchChoices({ meal: ['🍔 Canteen burger', 6, 15], snack: ['🧁 Bake sale muffin', 2, 8] }) },
      ],
    }],
    rewards: { xp: 15, message: "Lunch sorted. How's the budget looking?" },
  },
  {
    id: 'after_school_snack', kind: 'dynamic', priority: 40, name: 'After-School Temptation', emoji: '🥡',
    journalText: 'Riley is hanging out by the food truck in the park after school.',
    storySetup: 'A noodle truck is parked at the park and Riley is standing right in front of it.',
    destination: 'park', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(17, 0) },
    trigger: { type: 'interaction', npcId: 'riley' },
    steps: [{
      id: 's1', place: 'park', waypoint: 'Food truck', speaker: 'Riley', npcId: 'riley',
      lines: ['Hey! That noodle truck smells amazing.', "I've got $5. Noodle cups are $4."],
      choices: [
        { id: 'noodles', label: '🍜 Noodles ($4)', sublabel: 'Sounds good · +8 energy', category: 'food', cost: -4, minutes: 20, energyRestore: 8, relationship: 1, social: true, consequence: 'You and Riley eat noodles on the walk home.', flags: ['bought_stall'], finish: true },
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
    destination: 'supermarket', paths: ['school'], repeat: 'weekly', levels: [1],
    // Step 13 fix: this was `days: [1]` (Tuesday, per this codebase's day%7 convention — see
    // clock.ts's ClockParts.day doc "0 = Monday week 1" and DAY_NAMES[0]='Monday'), which
    // contradicted this mission's own storySetup ("Mum messages you as you get home from school",
    // i.e. the same day the player attends class) and the blueprint's Monday vertical slice, which
    // lists the parent errand as part of Monday's chain. Every other weekly Monday-scheduled
    // mission in this file (pocket_money, school_project — see its own "Announced Monday, due
    // Wednesday" comment) already uses `days: [0]`. No other code or comment anywhere references
    // Tuesday for this mission (confirmed by a full-repo search) — `days: [1]` was an authoring
    // off-by-one, not an intentional design choice.
    window: { days: [0], from: hm(15, 30), until: hm(19, 0) },
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
    destination: 'shop_small', paths: ['school'], repeat: 'weekly', levels: [1],
    // Announced in class: it opens once you've attended a lesson (Monday, or Tuesday if you skipped
    // Monday). If you never make it to class before Wednesday, you never hear about it — and the
    // recap shows it.
    window: { days: [0], from: hm(12), until: hm(17, 30), spanDays: 2 },
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
    window: { days: WK, from: hm(19), until: hm(21, 30) },
    trigger: { type: 'location', place: 'home' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Desk',
      lines: ['You have some time before bed. How do you spend it?'],
      choices: [
        { id: 'study', label: '📚 Do homework', sublabel: 'About 1 hour', cost: 0, minutes: 60, consequence: 'Homework finished. You feel ready for tomorrow.', flags: ['did_homework'], finish: true },
        { id: 'free', label: '🎮 Free time', sublabel: 'Homework can wait', cost: 0, minutes: 60, consequence: 'Fun, but the homework is still there.', finish: true },
      ],
      variants: [
        { lines: ['Maths worksheet due tomorrow. Ugh.'], choices: homeworkChoices('📐 Do the worksheet', '🎮 Game with Jordan online') },
        { lines: ['Science: label a diagram of the water cycle.'], choices: homeworkChoices('🔬 Do the diagram', '📺 Watch videos instead') },
        { lines: ['Reading log: 20 pages of your novel.'], choices: homeworkChoices('📖 Read 20 pages', '📱 Scroll your phone') },
        { lines: ['No homework tonight! A free evening.'], choices: [{ id: 'free', label: '😌 Relax', sublabel: '+10 energy', cost: 0, minutes: 60, energyRestore: 10, consequence: 'A calm evening. You feel recharged.', finish: true }] },
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
    destination: 'university', paths: ['school'], repeat: 'weekly', levels: [1],
    // Wednesday and Thursday, anywhere you run into Riley (school, the park after school). Talking
    // to her is the trigger; the conversation happens right there.
    window: { days: [2], from: hm(8), until: hm(17), spanDays: 1 },
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
    destination: 'mall', paths: ['school'], repeat: 'weekly', levels: [1],
    // Jordan texts the invite at 3:35; the decision happens when you walk into the Mall (he's there).
    // Not going at all just lets it expire — a real (small) social cost, see onExpire.
    window: { days: [3], from: hm(15, 35), until: hm(19, 0) },
    trigger: { type: 'time' },
    requires: s => resolvedThisWeek(s, 'friend_birthday'),
    steps: [{
      id: 's1', place: 'mall', waypoint: 'Arcade', speaker: 'Jordan', npcId: 'jordan',
      lines: ['Arcade run after school — you in?', 'Tokens are about $8. Riley and Sam are already coming.'],
      choices: [
        { id: 'arcade', label: '🕹️ Go all in ($8, 2 hrs)', sublabel: 'Full arcade session', category: 'entertainment', cost: -8, minutes: 120, relationship: 2, social: true, consequence: 'Great afternoon. You feel part of the crew.', flags: ['arcade_visit'], finish: true, energyCost: 8 },
        { id: 'spend_less', label: '🪙 Go, but spend less ($5, 1.5 hrs)', sublabel: 'A couple of games, then watch', category: 'entertainment', cost: -5, minutes: 90, relationship: 1, social: true, consequence: 'You play a bit, then hang out. Still fun, still $3 saved.', flags: ['arcade_visit'], finish: true, energyCost: 5 },
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
    destination: 'home', paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [3], from: hm(16), until: hm(21) },
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
    // Blueprint Thursday: "opportunity to earn". It lands on the same afternoon as Jordan's arcade
    // run on purpose — two good things, one afternoon (opportunity cost, felt rather than taught).
    id: 'dairy_shift', kind: 'side', priority: 70, name: 'Shift at the Dairy', emoji: '📦',
    journalText: 'Mr Lee will pay $8 to help stock shelves at the Dairy, 4–6 PM Thursday.',
    storySetup: 'Mr Lee from the Dairy texts you after school.',
    destination: 'dairy', paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [3], from: hm(15, 40), until: hm(17, 30) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'dairy', waypoint: 'Reply to Mr Lee', speaker: 'Mr Lee', npcId: 'shopkeeper', remote: true,
        lines: ['Hi! Delivery day. Can you help stock shelves till 6? I pay $8.'],
        choices: [
          { id: 'accept', label: "👍 I'll come by", sublabel: 'Head to the Dairy before 5:30', cost: 0, minutes: 1, consequence: 'Mr Lee sends a thumbs up.' },
          { id: 'decline', label: '🙅 Busy today', sublabel: 'Keep the afternoon free', cost: 0, minutes: 1, consequence: 'Mr Lee: "No worries, next time!"', flags: ['dairy_shift_declined'], finish: true },
        ],
      },
      {
        id: 's2', place: 'dairy', waypoint: 'Dairy', speaker: 'Mr Lee', npcId: 'shopkeeper',
        lines: ['Great timing — the boxes are out back.'],
        choices: [
          { id: 'work', label: '📦 Stock the shelves (+$8)', sublabel: '1.5 hours · 15 energy', category: 'income', cost: 8, minutes: 90, energyCost: 15, consequence: 'Hard work, but Mr Lee hands you $8 cash.', flags: ['dairy_shift_done'], finish: true },
        ],
      },
    ],
    rewards: { xp: 25, message: 'Earned $8 at the Dairy.' },
  },
  {
    // Walkers get their own Thursday surprise (bus riders get the bus-card one): a split shoe.
    id: 'unexpected_shoe', kind: 'main', priority: 150, name: 'Unexpected Expense', emoji: '👟',
    journalText: 'Your shoe sole has split from all the walking — fix it or make do.',
    storySetup: 'Thursday afternoon. Your shoe starts flapping with every step.',
    destination: 'home', paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [3], from: hm(16), until: hm(21) },
    trigger: { type: 'time' },
    // Only for players who actually walked to school this week and never took the bus.
    requires: s => resolvedThisWeek(s, 'friend_birthday') && !rodeBusThisWeek(s)
      && (s.today.schoolAttended === true || s.weekDays.some(d => d.schoolAttended === true)),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Sort out your shoe', remote: true,
      lines: ['All that walking has split your shoe sole.', 'The Bookshop sells shoe glue for $4. Or you could tape it.'],
      choices: [
        { id: 'pay', label: '🧴 Buy shoe glue ($4)', sublabel: 'Fixed properly', category: 'shopping', cost: -4, minutes: 15, consequence: 'Good as new.', flags: ['unexpected_paid'], finish: true },
        { id: 'walk', label: '🩹 Tape it (free)', sublabel: 'It squeaks, but it holds', cost: 0, minutes: 5, consequence: 'It squeaks all Friday, but it holds.', lesson: 'Walking saves money — but it wears things out. Hidden costs are still costs.', flags: ['unexpected_walked'], finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Sorted.', flag: 'unexpected_handled' },
  },
  {
    // Tuesday's story beat: a small commitment now that pays off (or doesn't) on Friday.
    id: 'sports_signup', kind: 'main', priority: 155, name: 'Basketball Sign-Up', emoji: '🏀',
    journalText: "Coach Rangi is signing people up for the Friday basketball team — $6 for the term.",
    storySetup: 'Tuesday lunchtime. Coach Rangi is at the gym door with a sign-up sheet.',
    destination: 'university', paths: ['school'], repeat: 'weekly', levels: [1],
    // Lunchtime onwards: class runs 8:30–12:30, so a morning window would expire mid-lesson.
    window: { days: [1], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Coach (School)', speaker: 'Coach Rangi',
      lines: ['Friday team is short a player!', "It's $6 for the term, first game this Friday, 4 PM at the Community Gym."],
      choices: [
        { id: 'join', label: '🏀 Sign up ($6)', sublabel: 'First game Friday 4 PM', category: 'entertainment', cost: -6, minutes: 5, consequence: 'Your name goes on the sheet. Friday, 4 PM, Community Gym.', flags: ['team_joined'], finish: true },
        { id: 'pass', label: '🙅 Not this term', sublabel: 'Keep the $6', cost: 0, minutes: 2, consequence: 'Coach: "Door\'s always open."', lesson: 'Saying no to one thing keeps money free for another.', flags: ['team_passed'], finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Decision made on the team.' },
  },
  {
    // Friday morning: Monday's project supplies come due. What you did Mon–Wed decides the options.
    id: 'project_day', kind: 'main', priority: 165, name: 'Project Day', emoji: '🖼️',
    journalText: 'Friday: present your project in class. Did you get the supplies?',
    storySetup: "Friday after class. Everyone is pinning up their posters.",
    destination: 'university', paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [4], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Ms Patel (Classroom)', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ['Projects up on the wall, please!', "Let's see what you've made."],
      choices: [
        { id: 'present', label: '🖼️ Present your poster', sublabel: 'You bought the supplies', cost: 0, minutes: 30, relationship: 1, consequence: 'Ms Patel gives you a merit. Planning ahead paid off.', flags: ['project_day_merit'], finish: true,
          hideIf: s => !s.world.flags.includes('school_project_done') },
        { id: 'rush', label: '🏫 Buy supplies at the school shop ($8)', sublabel: 'Twice the Bookshop price', category: 'shopping', cost: -8, minutes: 30, consequence: 'You scramble, pay double, and just about finish.', lesson: 'Last-minute buying almost always costs more.', flags: ['project_day_rushed'], finish: true,
          hideIf: s => s.world.flags.includes('school_project_done') },
        { id: 'borrow', label: '🤝 Borrow bits from Riley', sublabel: 'Free · but you owe her', cost: 0, minutes: 30, relationship: -1, consequence: "Riley helps, but it's clear you didn't plan. Ms Patel notices.", lesson: 'Not planning ahead costs you — in money, or in favours.', flags: ['project_day_borrowed'], finish: true,
          hideIf: s => s.world.flags.includes('school_project_done') },
      ],
    }],
    rewards: { xp: 20, message: 'Project presented.' },
  },
  {
    // Friday after school: only if you paid on Tuesday. Paying for something and not using it is
    // its own lesson.
    id: 'team_game', kind: 'side', priority: 90, name: 'First Basketball Game', emoji: '🏀',
    journalText: "Your first game is at the Community Gym, 4 PM. You paid $6 to be on the team.",
    storySetup: 'Friday afternoon. Game day.',
    destination: 'gym', paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [4], from: hm(15, 30), until: hm(17, 30) },
    trigger: { type: 'time' },
    requires: s => s.world.flags.includes('team_joined'),
    steps: [{
      id: 's1', place: 'gym', waypoint: 'Community Gym', speaker: 'Coach Rangi',
      lines: ['There you are! Warm up, you start on the bench.', 'Team pizza after — $5 each if you want in.'],
      choices: [
        { id: 'pizza', label: '🍕 Play, then team pizza ($5)', sublabel: '2 hours · +10 energy back', category: 'food', cost: -5, minutes: 120, energyCost: 12, energyRestore: 10, social: true, consequence: 'You score twice, lose by one, and argue about it over pizza. Brilliant.', flags: ['team_played'], finish: true },
        { id: 'play', label: '🏀 Play the game', sublabel: '1.5 hours · 12 energy', cost: 0, minutes: 90, energyCost: 12, social: true, consequence: 'You score twice. Coach says see you next week.', flags: ['team_played'], finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Game played!' },
    onExpire: { message: "You missed the game you paid $6 to play in.", flags: ['team_skipped'] },
  },
  {
    // The other end of Jordan's loan (see jordan_loan in dailyMissions.ts). Whether he pays it all
    // back is decided per save, so the same choice doesn't always turn out the same way.
    id: 'jordan_payback', kind: 'side', priority: 60, name: 'Payback Day', emoji: '💸',
    journalText: 'Jordan promised to pay back your $4 today.',
    storySetup: 'Friday. Jordan owes you $4.',
    paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [4], from: hm(17, 30), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => s.world.flags.includes('lent_jordan'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true, lines: [],
      variants: [
        {
          lines: ["told u I'd pay u back 😎", 'sent $4 + I owe u a chocolate'],
          choices: [{ id: 'thanks', label: '👍 Thanks!', sublabel: '+$4 back', category: 'refund', cost: 4, minutes: 1, relationship: 1, consequence: 'All $4 back, right on time.', lesson: 'A friend who pays back on time is a friend you can lend to again.', finish: true }],
        },
        {
          lines: ['ok so… can I give u $2 now and $2 next week? 😬'],
          choices: [
            { id: 'ok', label: '🙂 Sure, $2 now', sublabel: '+$2, $2 still owed', category: 'refund', cost: 2, minutes: 1, consequence: 'Half back. The other half is a promise.', lesson: 'Lending to friends can mean waiting — or never seeing it again.', flags: ['jordan_owes_2'], finish: true },
            { id: 'all', label: '😐 I kind of need it all', sublabel: '+$4 · a bit awkward', category: 'refund', cost: 4, minutes: 1, relationship: -1, consequence: 'Jordan sends it all. "my bad 😅"', lesson: "It's OK to ask for what you're owed.", finish: true },
          ],
        },
      ],
    }],
    rewards: { xp: 10, message: 'Loan settled.' },
  },
  {
    // Blueprint Saturday: the school fair — the goal Mum mentioned on Monday.
    id: 'school_fair', kind: 'main', priority: 130, name: 'School Fair', emoji: '🎟️',
    journalText: 'Saturday 10 AM – 2 PM at school. Tickets are $10.',
    storySetup: "It's fair day. Music is coming from the school field.",
    destination: 'university', paths: ['school'], repeat: 'weekly', levels: [1],
    window: { days: [5], from: hm(10), until: hm(14) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'university', waypoint: 'School fair', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ['Welcome to the fair!', "Tickets are $10 — that gets you into everything. Jordan and Riley are already inside."],
      choices: [
        { id: 'ticket', label: '🎟️ Buy a ticket ($10)', sublabel: 'Rides, games and friends', category: 'entertainment', cost: -10, minutes: 150, social: true, consequence: 'A brilliant day. You, Jordan and Riley end up at every stall.', flags: ['school_fair_attended'], finish: true, energyCost: 10 },
        { id: 'skip', label: '🚶 Just look around', sublabel: 'Keep your money', cost: 0, minutes: 20, consequence: 'You watch from the gate for a while, then head off.', flags: ['school_fair_skipped'], finish: true },
      ],
    }],
    rewards: { xp: 30, message: 'Fair day done.' },
  },
  {
    // MISSION 8 — Friday. Nothing here is scripted moralising: the actual numbers (what's left,
    // what got done, what didn't) come from real state, computed and shown by the store the moment
    // this completes (see GameStore.completeMission's friday_recap special-case).
    id: 'friday_recap', kind: 'main', priority: 140, name: 'Sunday Night', emoji: '📅',
    journalText: 'Sunday evening at home: sit down with Mum and see how the week actually went.',
    storySetup: "It's Sunday. The week you budgeted on Monday morning is over.",
    destination: 'home', paths: ['school'], repeat: 'weekly',
    // Sunday from 3 PM, whenever you're home. Whatever happened (or didn't) this week, the recap
    // reports it — it never waits on another mission.
    window: { days: [6], from: hm(15), until: hm(23, 59) },
    trigger: { type: 'location', place: 'home' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Talk to Mum', speaker: 'Mum', npcId: 'mum',
      lines: ['Well — that was a big week.', 'Did you manage what you set out to do?'],
      byLevel: {
        2: { lines: ['So — did your money grow this week?', "Show me what's in your savings. And thank you for my birthday."] },
        3: { lines: ["Let's see the budget app, then.", 'Plan versus reality — how close did you get?'] },
      },
      choices: [{ id: 'reflect', label: '💬 Look back on the week', sublabel: 'See how it went', cost: 0, minutes: 20, relationship: 2, consequence: 'Mum listens, and you both look at how the week actually went.', flags: ['level1_complete'], finish: true }],
    }],
    rewards: { xp: 100, message: 'Week done. Monday brings a new $20 and a new goal — see if you do anything differently.', flag: 'level1_complete' },
  },
];

export function missionDefs(path: GameState['lifePath']): MissionDef[] {
  return [
    ...SCHOOL_MISSIONS, ...SCHOOL_L2, ...SCHOOL_L3, ...UNI_MISSIONS,
    ...DAILY_MISSIONS, ...SCHOOL_L2_POOL, ...SCHOOL_L3_POOL, ...UNI_DAILY,
  ].filter(d => d.paths.includes(path));
}
export const getDef = (defs: MissionDef[], id: string) => defs.find(d => d.id === id);

export function initialMissionRuntime(defs: MissionDef[]): MissionRuntime[] {
  return defs.map(d => ({ id: d.id, state: 'locked', stepIndex: 0 }));
}

// ── Engine ─────────────────────────────────────────────────────────────────
export type Emit = (e: GameEvent) => void;

/** Is this mission's availability window open at `minutes`? */
export function missionWindowOpen(def: MissionDef, minutes: number): boolean { return windowOpen(def, minutes); }

function windowOpen(def: MissionDef, minutes: number): boolean {
  const p = parts(minutes);
  const w = def.window;
  const span = w.spanDays ?? 0;
  for (let back = 0; back <= span; back++) {
    const openDay = p.day - back;
    if (openDay < 0) continue;
    if (!w.days.includes(openDay % 7)) continue;
    if (back === 0 && p.minuteOfDay >= w.from && (span > 0 || p.minuteOfDay < w.until)) return true;
    if (back > 0 && (back < span || p.minuteOfDay < w.until)) return true;
  }
  return false;
}

function expiryFor(def: MissionDef, minutes: number): number {
  const p = parts(minutes);
  const span = def.window.spanDays ?? 0;
  // find the opening day this window belongs to
  for (let back = 0; back <= span; back++) {
    const openDay = p.day - back;
    if (openDay >= 0 && def.window.days.includes(openDay % 7)) return at(openDay + span, 0, def.window.until);
  }
  return at(p.day, 0, def.window.until);
}

export function makeAvailable(s: GameState, rt: MissionRuntime, def: MissionDef, emit: Emit) {
  rt.state = 'available';
  rt.becameAvailableAt = s.minutes;
  rt.expiresAt = expiryFor(def, s.minutes);
  emit({ type: 'mission_available', missionId: rt.id });
}

/** Called once per game minute. Handles time triggers, expiry and daily/weekly resets. */
export function missionsOnMinute(s: GameState, defs: MissionDef[], emit: Emit, onExpired: (def: MissionDef, rt: MissionRuntime) => void) {
  for (const rt of s.missions) {
    const def = getDef(defs, rt.id);
    if (!def) continue;

    if (rt.state === 'available' || rt.state === 'active') {
      if (rt.expiresAt !== undefined && s.minutes >= rt.expiresAt) {
        rt.state = 'expired';
        rt.finishedAt = s.minutes;
        emit({ type: 'mission_expired', missionId: rt.id });
        onExpired(def, rt);
      }
      continue;
    }

    if (rt.state !== 'locked') continue;
    if (!def.paths.includes(s.lifePath)) continue;
    if (!offeredToday(s, def)) continue;

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

    if (!windowOpen(def, s.minutes)) continue;
    if (def.requires && !def.requires(s)) continue;
    // Remember when this window's occurrence ends, so the missed-obligation check above can fire.
    if (rt.expiresAt === undefined) rt.expiresAt = expiryFor(def, s.minutes);

    const t = def.trigger;
    if (t.type === 'time') makeAvailable(s, rt, def, emit);
    else if (t.type === 'completion' && s.missions.find(m => m.id === t.missionId)?.state === 'completed') makeAvailable(s, rt, def, emit);
    else if (t.type === 'location' && s.player.place === t.place) makeAvailable(s, rt, def, emit); // already there when the window opens
    else if (rt.triggered) makeAvailable(s, rt, def, emit);
  }
}

/** Feed store events in; event-driven triggers flip `triggered`, and arrival completes 'arrive' steps. */
export function missionsOnEvent(s: GameState, defs: MissionDef[], ev: GameEvent, complete: (rt: MissionRuntime, def: MissionDef, outcome: string) => void) {
  for (const rt of s.missions) {
    const def = getDef(defs, rt.id);
    if (!def || !def.paths.includes(s.lifePath)) continue;

    if (rt.state === 'locked' && offeredToday(s, def) && windowOpen(def, s.minutes) && (!def.requires || def.requires(s))) {
      const t = def.trigger;
      if (t.type === 'location' && ev.type === 'entered_place' && ev.placeId === t.place) rt.triggered = true;
      if (t.type === 'interaction' && ev.type === 'talked_to' && ev.npcId === t.npcId) rt.triggered = true;
      if (t.type === 'world' && ev.type === 'bus_arrived' && ev.stopId === t.stopId) rt.triggered = true;
    }
    // arrive-style completion (e.g. Get to School): reaching the place while the mission is available/active
    if ((rt.state === 'available' || rt.state === 'active') && ev.type === 'entered_place') {
      const step = def.steps[rt.stepIndex];
      if (step?.completeOnArrival && ev.placeId === step.place) complete(rt, def, 'arrived');
    }
  }
}

/** Reset repeating missions at the start of each day / week. */
export function missionsOnDayStart(s: GameState, defs: MissionDef[], newDay: number) {
  const newWeek = newDay % 7 === 0;
  for (const rt of s.missions) {
    const def = getDef(defs, rt.id);
    if (!def) continue;
    const reset = def.repeat === 'daily' || (def.repeat === 'weekly' && newWeek);
    if (reset && rt.state !== 'active') {
      rt.state = 'locked'; rt.stepIndex = 0; rt.triggered = false;
      rt.becameAvailableAt = undefined; rt.expiresAt = undefined; rt.outcome = undefined; rt.finishedAt = undefined;
    }
  }
}

// ── Journal ────────────────────────────────────────────────────────────────
export interface JournalEntry {
  id: string; name: string; emoji: string; kind: MissionKind; text: string;
  state: MissionRuntime['state']; deadline?: number; destination?: string; priority: number;
}
export interface Journal { active: JournalEntry[]; optional: JournalEntry[]; completed: JournalEntry[]; missed: JournalEntry[]; upcoming: JournalEntry[] }

export function buildJournal(s: GameState, defs: MissionDef[]): Journal {
  const today = parts(s.minutes).day;
  const j: Journal = { active: [], optional: [], completed: [], missed: [], upcoming: [] };
  for (const rt of s.missions) {
    const def = getDef(defs, rt.id);
    if (!def) continue;
    const step = def.steps[Math.min(rt.stepIndex, def.steps.length - 1)];
    const entry: JournalEntry = {
      id: def.id, name: def.name, emoji: def.emoji, kind: def.kind, text: def.journalText, state: rt.state,
      deadline: rt.expiresAt, destination: def.destination ?? step?.place, priority: def.priority,
    };
    if (rt.state === 'available' || rt.state === 'active') {
      const mandatory = def.kind === 'main' || def.kind === 'timed';
      (mandatory ? j.active : j.optional).push(entry);
    } else if (rt.state === 'completed' && rt.finishedAt !== undefined && parts(rt.finishedAt).day === today) j.completed.push(entry);
    else if (rt.state === 'expired' && rt.finishedAt !== undefined && parts(rt.finishedAt).day === today) j.missed.push(entry);
    // Known future commitments (Rule 32): the rest of THIS week's main story chain, even before it
    // unlocks, so the player always knows what's still coming — never a surprise popup out of nowhere.
    else if (rt.state === 'locked' && def.kind === 'main' && inLevel(s, def)) j.upcoming.push(entry);
  }
  const byPri = (a: JournalEntry, b: JournalEntry) => b.priority - a.priority;
  j.active.sort(byPri); j.optional.sort(byPri); j.upcoming.sort(byPri);
  return j;
}

/** The mission whose destination the minimap should highlight (highest priority active, then available timed/main). */
/**
 * The one task the map arrow, minimap line and "NEXT" card point at.
 *  - Only steps you have to WALK to count. Phone messages (remote steps) are answered from the phone
 *    wherever you are, so an unanswered text ("found a wallet — hand it in at Services?") can no
 *    longer drag the arrow away from the errand you actually accepted.
 *  - Something you've already started (active) beats something merely on offer (available).
 *  - Among started tasks: the one you're standing in right now, then the one due SOONEST. (Monday
 *    used to point at Wednesday's Bookshop project while Mum's 7 PM grocery run was the urgent one.)
 *  - Among offers: higher priority, then whichever runs out soonest.
 *  - A face-to-face step follows the person: if Riley is at the Park, that's where it points.
 */
export function trackedMission(s: GameState, defs: MissionDef[]): { def: MissionDef; rt: MissionRuntime; placeId: string } | null {
  const due = (x: { rt: MissionRuntime }) => x.rt.expiresAt ?? Infinity;
  const live = s.missions
    .map(rt => ({ rt, def: getDef(defs, rt.id)! }))
    .filter(x => x.def && (x.rt.state === 'active' || x.rt.state === 'available'))
    .map(x => ({ ...x, step: x.def.steps[Math.min(x.rt.stepIndex, x.def.steps.length - 1)] }))
    .filter(x => x.step && !x.step.remote)
    .sort((a, b) => {
      const aActive = a.rt.state === 'active', bActive = b.rt.state === 'active';
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (aActive) {
        const aHere = a.step.place === s.player.place, bHere = b.step.place === s.player.place;
        if (aHere !== bHere) return aHere ? -1 : 1;
        return due(a) - due(b) || b.def.priority - a.def.priority;
      }
      return b.def.priority - a.def.priority || due(a) - due(b);
    });
  const top = live[0];
  if (!top) return null;
  let placeId = top.step.place;
  if (top.step.withNpc && top.step.npcId) {
    const npcPlace = s.npcs[top.step.npcId]?.place;
    if (npcPlace && npcPlace !== 'street') placeId = npcPlace;
  }
  return { def: top.def, rt: top.rt, placeId };
}

export { MIN_PER_DAY };
