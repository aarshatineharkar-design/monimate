/**
 * MoniMate — the daily task pool. Each day GameStore.rollDailyPool() picks a few of these (seeded
 * per save + day), so no two days — and no two playthroughs — offer the same things. Every one is
 * built around a real money decision: opportunity cost, earning, subscriptions, honesty, impulse.
 *
 * Pattern for errands elsewhere: step 1 is a phone message you can accept or decline anywhere;
 * step 2 happens when you walk into the place.
 */
import { hm } from './clock';
import type { MissionDef } from './missions';
import type { GameState } from './types';

const WK = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const busPassActive = (s: GameState) => !!s.world.busPass && s.world.busPass.validUntil > s.minutes;

/** How many of each pool a day offers: [count, chance each slot is filled]. */
export const DAILY_POOLS: Record<NonNullable<MissionDef['pool']>, { count: number; chance: number }> = {
  morning: { count: 1, chance: 1 },
  after_school: { count: 2, chance: 1 },
  evening: { count: 2, chance: 1 },
  weekend: { count: 2, chance: 1 },
};
const hasFlag = (s: GameState, f: string) => s.world.flags.includes(f);

export const DAILY_MISSIONS: MissionDef[] = [
  // ── MORNING (7:00–8:10, a message while you get ready) ─────────────────────
  {
    id: 'mum_pancakes', pool: 'morning', kind: 'side', priority: 40, name: 'Pancake Morning', emoji: '🥞',
    journalText: 'Mum made pancakes. Stay for breakfast, or grab one and go?',
    storySetup: 'The kitchen smells amazing.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ["Pancakes! Sit down for a bit — you've got time."],
      choices: [
        { id: 'stay', label: '🥞 Sit down and eat', sublabel: '20 min · +15 energy · Mum +1', cost: 0, minutes: 20, energyRestore: 15, relationship: 1, consequence: 'Warm pancakes and a proper chat. Great start.', finish: true },
        { id: 'grab', label: '🏃 Grab one and go', sublabel: '+5 energy', cost: 0, minutes: 2, energyRestore: 5, consequence: 'Pancake in hand, out the door.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Breakfast sorted.' },
  },
  {
    id: 'lunch_money', pool: 'morning', kind: 'side', priority: 40, name: 'No Packed Lunch', emoji: '🥪',
    journalText: "Mum ran out of time to pack lunch. Take $3 for the canteen, or make your own?",
    storySetup: 'Mum is rushing out the door.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ["Sorry love, no time to pack your lunch.", "Here's $3 for the canteen — or make yourself something?"],
      choices: [
        { id: 'take', label: '💵 Take the $3', sublabel: "You'll buy lunch today", category: 'income', cost: 3, minutes: 1, consequence: 'Three dollars for lunch.', effect: 'no_packed_lunch_today', finish: true },
        { id: 'make', label: '🥪 Make my own', sublabel: '10 min · free lunch later', cost: 0, minutes: 10, energyCost: 3, consequence: 'A slightly squashed sandwich, but it counts.', lesson: "Ten minutes of effort is worth $3 — that's $18 an hour.", finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Lunch plan sorted.' },
  },
  {
    id: 'bus_pass_offer', pool: 'morning', kind: 'side', priority: 45, name: 'Weekly Bus Pass', emoji: '🎫',
    journalText: 'Route 1 weekly passes are $7 today: unlimited rides until Sunday.',
    storySetup: 'A notification from Route 1.',
    paths: ['school'], repeat: 'daily',
    window: { days: [0, 1], from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    requires: s => !busPassActive(s),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Phone', speaker: 'Route 1', remote: true,
      lines: ['This week only: unlimited Route 1 rides until Sunday for $7.', 'Single fares are $2.'],
      choices: [
        { id: 'buy', label: '🎫 Buy the pass ($7)', sublabel: 'Pays off from the 4th ride', category: 'transport', cost: -7, minutes: 1, effect: 'bus_pass_week', consequence: 'Pass loaded. Every ride is free until Sunday.', lesson: '$7 vs $2 a ride: worth it only if you ride 4+ times.', finish: true },
        { id: 'skip', label: '👋 No thanks', sublabel: "I'll walk or pay per ride", cost: 0, minutes: 0, consequence: 'You swipe it away.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Decision made.' },
  },

  {
    id: 'phone_data', pool: 'morning', kind: 'side', priority: 40, name: 'Out of Data', emoji: '📶',
    journalText: "You've used all your phone data. Top up $5 for the week, or live on Wi-Fi?",
    storySetup: 'A text from your mobile provider.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Phone', speaker: 'Mobile', remote: true,
      lines: ["You've used 100% of your data.", 'Add 2GB for $5? Otherwise you are Wi-Fi only until Monday.'],
      choices: [
        { id: 'topup', label: '📶 Top up ($5)', sublabel: 'Data all week', category: 'subscription', cost: -5, minutes: 1, consequence: 'Bars are back.', finish: true },
        { id: 'wifi', label: '📡 Wi-Fi only', sublabel: 'Home, class and the library have it', cost: 0, minutes: 0, consequence: "You'll survive. Probably.", lesson: 'A need or a want? Knowing the difference is most of budgeting.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Data sorted.' },
  },
  {
    id: 'jordan_loan', pool: 'morning', kind: 'side', priority: 42, name: 'Can I Borrow $4?', emoji: '🤝',
    journalText: 'Jordan forgot lunch money and wants to borrow $4 until Friday.',
    storySetup: 'Jordan texts in a panic.',
    paths: ['school'], repeat: 'daily', levels: [1],
    window: { days: [0, 1, 2], from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    requires: s => !hasFlag(s, 'lent_jordan'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
      lines: ['left my lunch money at home 😭', "can u lend me $4?? I'll pay u back friday, promise"],
      choices: [
        { id: 'lend', label: '🤝 Lend $4', sublabel: 'Back on Friday… maybe', category: 'other', cost: -4, minutes: 1, relationship: 1, consequence: 'Jordan: "LEGEND. Friday, I swear."', lesson: 'Only lend what you could cope with not getting back.', flags: ['lent_jordan'], finish: true },
        { id: 'no', label: '🙅 Sorry, tight week', sublabel: 'Keep your $4', cost: 0, minutes: 1, consequence: 'Jordan: "all good, I\'ll ask Riley"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Jordan answered.' },
  },
  {
    id: 'hot_choc_riley', pool: 'morning', kind: 'side', priority: 38, name: 'Café Before School', emoji: '☕',
    journalText: 'Riley is grabbing a hot chocolate before school. Join her for $4.50?',
    storySetup: 'Riley texts early.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
      lines: ['Café before school? ☕ I need sugar to survive maths'],
      choices: [
        { id: 'yes', label: '☕ Meet her ($4.50)', sublabel: '15 min · +8 energy · Riley +1', category: 'food', cost: -4.5, minutes: 15, energyRestore: 8, relationship: 1, social: true, consequence: 'Hot chocolate and gossip. Worth it?', lesson: '$4.50 a day is $22.50 a week — more than your whole allowance.', finish: true },
        { id: 'no', label: '🏃 See you at school', sublabel: 'Free', cost: 0, minutes: 0, consequence: 'Riley: "saving money, respect 🫡"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Morning plans made.' },
  },
  {
    id: 'forgot_pe_kit', pool: 'morning', kind: 'side', priority: 40, name: 'Forgot PE Kit', emoji: '🩳',
    journalText: 'PE today and your kit is in the wash. Buy a school PE shirt, or raid lost property?',
    storySetup: 'You open your drawer. No PE kit.',
    paths: ['school'], repeat: 'daily',
    window: { days: [1, 3], from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Sort your PE kit', speaker: 'You', remote: true,
      lines: ['PE is period 2. Your kit is wet in the washing machine.', 'The school office sells PE shirts for $8. Lost property is free…'],
      choices: [
        { id: 'buy', label: '👕 Buy a PE shirt ($8)', sublabel: 'Brand new', category: 'shopping', cost: -8, minutes: 5, consequence: 'Crisp, clean, $8 poorer.', finish: true },
        { id: 'borrow', label: '🧦 Lost property', sublabel: 'Free · slightly mysterious', cost: 0, minutes: 5, consequence: 'It fits. Mostly. It smells of someone else\'s deodorant.', lesson: "Not every problem needs money — some just need a bit of pride swallowed.", finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'PE sorted.' },
  },

  {
    id: 'rainy_morning', pool: 'morning', kind: 'side', priority: 39, name: 'Pouring Rain', emoji: '🌧️',
    journalText: "It's bucketing down and your umbrella broke last week.",
    storySetup: 'Rain hammers on the window.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(7), until: hm(8, 10) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Front door', speaker: 'You', remote: true,
      lines: ["It's pouring. Your old umbrella is in the bin.", 'The Dairy on the corner sells umbrellas for $6.'],
      choices: [
        { id: 'umbrella', label: '☂️ Buy an umbrella ($6)', sublabel: 'Stay dry this week', category: 'shopping', cost: -6, minutes: 5, consequence: 'Dry and smug.', finish: true },
        { id: 'hood', label: '🧥 Hood up and run', sublabel: 'Free · -5 energy', cost: 0, minutes: 0, energyCost: 5, consequence: 'You arrive looking like you swam there.', lesson: 'Cheap and free sometimes cost comfort instead of money.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Rain dealt with.' },
  },
  // ── AFTER SCHOOL (15:40–18:00) ────────────────────────────────────────────
  {
    id: 'dog_walk', pool: 'after_school', kind: 'side', priority: 35, name: 'Walk Biscuit', emoji: '🐕',
    journalText: 'Mrs Kaur will pay $4 to walk her dog Biscuit at the park for 30 minutes.',
    storySetup: 'Your neighbour texts you.',
    destination: 'park', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'park', waypoint: 'Reply to Mrs Kaur', speaker: 'Mrs Kaur', remote: true,
        lines: ["Hi dear! Could you walk Biscuit around the park? I'll pay $4."],
        choices: [
          { id: 'accept', label: "🐕 Sure, I'll meet you at the park", sublabel: 'Before 6 PM', cost: 0, minutes: 0, consequence: 'Biscuit will be waiting at the park.' },
          { id: 'decline', label: '🙅 Not today', sublabel: '', cost: 0, minutes: 0, consequence: 'Mrs Kaur: "Another time!"', finish: true },
        ],
      },
      {
        id: 's2', place: 'park', waypoint: 'Park', speaker: 'Mrs Kaur',
        lines: ["Here's Biscuit! He loves the pond."],
        choices: [{ id: 'walk', label: '🐕 Walk Biscuit (+$4)', sublabel: '30 min · 8 energy', category: 'income', cost: 4, minutes: 30, energyCost: 8, consequence: 'Biscuit is thrilled. Mrs Kaur hands you $4.', flags: ['walked_dog'], finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'Easy money, happy dog.' },
  },
  {
    id: 'library_fine', pool: 'after_school', kind: 'side', priority: 35, name: 'Overdue Book', emoji: '📕',
    journalText: 'Your library book is overdue. Return it at the Library by 6 PM, or pay a $2 fine.',
    storySetup: 'An email from the Library.',
    destination: 'library', paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'library', waypoint: 'Library', speaker: 'Library', remote: true,
        lines: ['Your book is overdue. Return it today, or a $2 fine will be charged.'],
        choices: [
          { id: 'return', label: "📕 I'll drop it off", sublabel: 'Walk to the Library before 6', cost: 0, minutes: 0, consequence: "You'd better head over." },
          { id: 'pay', label: '💳 Just pay the $2', sublabel: 'Saves the trip', category: 'other', cost: -2, minutes: 1, consequence: 'Paid. Convenience has a price.', lesson: 'Small fees for convenience add up the same way purchases do.', finish: true },
        ],
      },
      {
        id: 's2', place: 'library', waypoint: 'Library', speaker: 'Librarian',
        lines: ["Thanks for bringing it back! No fine today."],
        choices: [{ id: 'done', label: '📕 Hand it over', sublabel: 'Free', cost: 0, minutes: 5, consequence: 'Returned. $2 saved.', finish: true }],
      },
    ],
    rewards: { xp: 10, message: 'Library sorted.' },
    onExpire: { message: "You forgot the book. The Library charged a $2 fine.", fine: 2 },
  },
  {
    id: 'game_sale', pool: 'after_school', kind: 'side', priority: 35, name: 'Go Halves?', emoji: '🎮',
    journalText: 'Jordan wants to split Pixel Racer ($12) at the Mall, $6 each.',
    storySetup: 'Jordan is excited about a game sale.',
    destination: 'mall', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'mall', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
        lines: ['PIXEL RACER IS $12 AT THE MALL', 'Go halves? $6 each, we share it'],
        choices: [
          { id: 'yes', label: "🎮 I'm in — meet at the Mall", sublabel: '$6 when you get there', cost: 0, minutes: 0, consequence: 'Jordan: "LEGEND"' },
          { id: 'no', label: "💸 Can't this week", sublabel: 'Keep your $6', cost: 0, minutes: 0, relationship: -1, consequence: 'Jordan: "all good 👍"', lesson: "Wanting something isn't a reason to buy it — but sharing costs is a smart way to afford things.", finish: true },
        ],
      },
      {
        id: 's2', place: 'mall', waypoint: 'Mall', speaker: 'Jordan', npcId: 'jordan',
        lines: ['Got it! Your turn Saturdays, mine Sundays?'],
        choices: [{ id: 'pay', label: '🎮 Pay your half ($6)', sublabel: 'Shared game', category: 'entertainment', cost: -6, minutes: 20, relationship: 1, social: true, consequence: 'Half a game, all the fun.', flags: ['shared_game'], finish: true }],
      },
    ],
    rewards: { xp: 10, message: 'Game night sorted.' },
  },
  {
    id: 'cafe_study', pool: 'after_school', kind: 'side', priority: 35, name: 'Study at the Café', emoji: '☕',
    journalText: 'Riley wants to study together at the Café. Hot chocolates are $4.50.',
    storySetup: 'Riley texts about homework.',
    destination: 'cafe', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(16, 45) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'cafe', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
        lines: ['Study session at the Café? I need help with maths 😩'],
        choices: [
          { id: 'yes', label: "📚 See you there", sublabel: 'Café, before 4:45', cost: 0, minutes: 0, consequence: 'Riley sends five thank-you emojis.' },
          { id: 'no', label: '🙅 Studying at home today', sublabel: '', cost: 0, minutes: 0, consequence: 'Riley: "ok next time!"', finish: true },
        ],
      },
      {
        id: 's2', place: 'cafe', waypoint: 'Café', speaker: 'Riley', npcId: 'riley',
        lines: ['You came! Want a hot chocolate? They are $4.50.'],
        choices: [
          { id: 'choc', label: '☕ Hot chocolate ($4.50)', sublabel: '1 hour · +10 energy · Riley +1', category: 'food', cost: -4.5, minutes: 60, energyRestore: 10, relationship: 1, social: true, consequence: 'Maths makes more sense with hot chocolate.', finish: true },
          { id: 'water', label: '💧 Just water', sublabel: '1 hour · free · Riley +1', cost: 0, minutes: 60, relationship: 1, social: true, consequence: "Riley doesn't mind at all. Homework: done.", lesson: 'You can say yes to friends without saying yes to spending.', flags: ['did_homework'], finish: true },
        ],
      },
    ],
    rewards: { xp: 15, message: 'Study session done.' },
  },
  {
    id: 'found_wallet', pool: 'after_school', kind: 'side', priority: 45, name: 'Found Wallet', emoji: '👛',
    journalText: 'You found a wallet with $10 and a student ID. Hand it in at Services?',
    storySetup: 'Something is lying on the footpath.',
    destination: 'police', paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(17, 30) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'police', waypoint: 'Decide', remote: true, speaker: 'You',
        lines: ['A wallet on the footpath: $10 inside, and a student ID from another school.'],
        choices: [
          { id: 'hand_in', label: '🏛️ Hand it in at Services', sublabel: 'Before 5:30', cost: 0, minutes: 0, consequence: 'You tuck it safely into your bag.' },
          { id: 'keep', label: '💵 Keep the $10', sublabel: 'Nobody saw', category: 'other', cost: 10, minutes: 1, consequence: "$10 richer. It doesn't feel great.", lesson: "Money that isn't yours costs someone else — and it costs you trust.", flags: ['kept_wallet'], finish: true },
        ],
      },
      {
        id: 's2', place: 'police', waypoint: 'Services', speaker: 'Officer Tane',
        lines: ["Someone's been looking everywhere for this. Thank you!", 'The owner left a $3 reward for whoever found it.'],
        choices: [{ id: 'thanks', label: '🙂 Take the reward (+$3)', sublabel: 'Honest money', category: 'income', cost: 3, minutes: 10, consequence: 'You did the right thing, and got $3 for it.', flags: ['honest_finder'], finish: true }],
      },
    ],
    rewards: { xp: 20, message: 'Wallet sorted.' },
  },
  {
    id: 'car_wash', pool: 'after_school', kind: 'side', priority: 35, name: 'Car Wash Fundraiser', emoji: '🧽',
    journalText: "Jordan's sports team is running a car wash at the Mall. Help out, or donate $2?",
    storySetup: 'Jordan needs volunteers.',
    destination: 'mall', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'mall', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
        lines: ['Car wash fundraiser at the Mall! Come help? Or chuck in $2 😅'],
        choices: [
          { id: 'help', label: "🧽 I'll come help", sublabel: 'At the Mall', cost: 0, minutes: 0, consequence: 'Jordan: "YES"' },
          { id: 'donate', label: '💸 Donate $2', sublabel: 'Stay home', category: 'gift', cost: -2, minutes: 1, consequence: 'Jordan: "thank you!!"', finish: true },
          { id: 'no', label: '🙅 Not today', sublabel: '', cost: 0, minutes: 0, consequence: 'Jordan: "no stress"', finish: true },
        ],
      },
      {
        id: 's2', place: 'mall', waypoint: 'Mall', speaker: 'Jordan', npcId: 'jordan',
        lines: ['Grab a sponge! We need $80 for new jerseys.'],
        choices: [{ id: 'wash', label: '🧽 Wash cars for 45 min', sublabel: '10 energy · Jordan +2', cost: 0, minutes: 45, energyCost: 10, relationship: 2, social: true, consequence: 'Soaked, but the team hits its target.', lesson: 'Time is something you can give instead of money.', finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'Fundraiser done.' },
  },

  {
    id: 'tutoring', pool: 'after_school', kind: 'side', priority: 36, name: 'Maths Tutor', emoji: '📐',
    journalText: "Mrs Kaur's grandson Arjun needs maths help at the Library — $6 for an hour.",
    storySetup: 'Mrs Kaur has a job for you.',
    destination: 'library', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'library', waypoint: 'Reply to Mrs Kaur', speaker: 'Mrs Kaur', remote: true,
        lines: ['Arjun is stuck on fractions. Could you help him at the Library? $6 for the hour.'],
        choices: [
          { id: 'yes', label: "📐 I'll meet him there", sublabel: 'Library, before 6', cost: 0, minutes: 0, consequence: 'Mrs Kaur: "You are a treasure."' },
          { id: 'no', label: '🙅 Not today', sublabel: '', cost: 0, minutes: 0, consequence: 'Mrs Kaur: "Another day!"', finish: true },
        ],
      },
      {
        id: 's2', place: 'library', waypoint: 'Library', speaker: 'Arjun',
        lines: ['Hi… so what even IS a denominator?'],
        choices: [{ id: 'teach', label: '📐 Tutor for an hour (+$6)', sublabel: '1 hour · 8 energy', category: 'income', cost: 6, minutes: 60, energyCost: 8, consequence: 'Arjun finally gets it. Mrs Kaur pays you $6.', lesson: 'What you know is worth money — tutoring is a real job.', flags: ['did_homework'], finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'You taught someone something.' },
  },
  {
    id: 'can_recycling', pool: 'after_school', kind: 'side', priority: 34, name: 'Cans for Cash', emoji: '♻️',
    journalText: 'The council pays 10c a can. There are heaps in the Park after the weekend.',
    storySetup: 'A poster on the bus shelter.',
    destination: 'park', paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'park', waypoint: 'Decide', speaker: 'Council', remote: true,
        lines: ['Park clean-up week: 10c for every can you bring in.'],
        choices: [
          { id: 'yes', label: '♻️ Grab a bag and go', sublabel: 'Head to the Park', cost: 0, minutes: 0, consequence: 'You find an old shopping bag.' },
          { id: 'no', label: '🙅 Skip it', sublabel: '', cost: 0, minutes: 0, consequence: 'Someone else gets the cans.', finish: true },
        ],
      },
      {
        id: 's2', place: 'park', waypoint: 'Park', speaker: 'Council',
        lines: ['The bins by the pond are overflowing.'],
        choices: [{ id: 'collect', label: '♻️ Collect for 45 min (+$3.40)', sublabel: '34 cans · 10 energy', category: 'income', cost: 3.4, minutes: 45, energyCost: 10, consequence: '34 cans, $3.40, and a cleaner park.', lesson: 'Small amounts add up: 34 × 10c is $3.40.', finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'Park cleaner, pocket fuller.' },
  },
  {
    id: 'bake_sale', pool: 'after_school', kind: 'side', priority: 36, name: 'Bake Sale', emoji: '🧁',
    journalText: "The class bake sale is tomorrow. Bake something, or buy a box of cookies?",
    storySetup: 'The class chat needs volunteers.',
    destination: 'supermarket', paths: ['school'], repeat: 'daily',
    window: { days: [0, 1, 2, 3], from: hm(15, 40), until: hm(19) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'supermarket', waypoint: 'Reply to class chat', speaker: 'Class chat', remote: true,
        lines: ['Bake sale tomorrow for the class trip 🧁 Everyone bring something!'],
        choices: [
          { id: 'bake', label: "🧁 I'll bake", sublabel: 'Get ingredients at the Supermarket', cost: 0, minutes: 0, consequence: 'Time to find flour.' },
          { id: 'buy', label: '🍪 Buy a box of cookies ($6)', sublabel: 'No effort', category: 'food', cost: -6, minutes: 5, consequence: 'Shop-bought. Nobody will know. (They will.)', finish: true },
          { id: 'skip', label: '🙅 Bring nothing', sublabel: '', cost: 0, minutes: 0, consequence: 'You keep your head down in the chat.', finish: true },
        ],
      },
      {
        id: 's2', place: 'supermarket', waypoint: 'Supermarket', speaker: 'You',
        lines: ['Flour, sugar, choc chips and butter.', 'Enough for 24 cookies.'],
        choices: [{ id: 'ingredients', label: '🧁 Buy ingredients & bake ($3)', sublabel: '1 hour · 6 energy', category: 'food', cost: -3, minutes: 60, energyCost: 6, consequence: '24 cookies for $3. The kitchen is a disaster.', lesson: 'Making it yourself costs time; buying it costs money. $6 vs $3 + an hour.', flags: ['baked_cookies'], finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'Bake sale covered.' },
  },
  {
    id: 'charity_run', pool: 'after_school', kind: 'side', priority: 33, name: 'Sponsor Riley', emoji: '🏃',
    journalText: "Riley is running 5km for the animal shelter. Sponsor her?",
    storySetup: 'Riley sends a sponsorship link.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
      lines: ["I'm running 5k for the animal shelter on Saturday 🐶", 'Any amount helps!'],
      choices: [
        { id: 'three', label: '🐶 Sponsor $3', sublabel: 'Riley +1', category: 'gift', cost: -3, minutes: 1, relationship: 1, consequence: 'Riley: "THANK YOU 🧡"', finish: true },
        { id: 'one', label: '🪙 Sponsor $1', sublabel: 'Every bit counts', category: 'gift', cost: -1, minutes: 1, consequence: 'Riley: "every dollar helps!!"', finish: true },
        { id: 'cheer', label: '📣 Come and cheer instead', sublabel: 'Free', cost: 0, minutes: 1, relationship: 1, consequence: 'Riley: "best cheerleader 😂"', lesson: 'Giving has a budget line too — and time and support count.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Riley answered.' },
  },
  {
    id: 'bubble_tea', pool: 'after_school', kind: 'side', priority: 35, name: 'Bubble Tea Run', emoji: '🧋',
    journalText: 'Jordan and Riley are getting bubble tea at the Mall.',
    storySetup: 'The group chat is planning snacks.',
    destination: 'mall', paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(18) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'mall', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
        lines: ['bubble tea at the mall?? 🧋 riley is coming'],
        choices: [
          { id: 'yes', label: "🧋 On my way", sublabel: 'Meet at the Mall', cost: 0, minutes: 0, consequence: 'Jordan: "🧋🧋🧋"' },
          { id: 'no', label: '🙅 Next time', sublabel: '', cost: 0, minutes: 0, consequence: 'Jordan: "ur loss"', finish: true },
        ],
      },
      {
        id: 's2', place: 'mall', waypoint: 'Mall', speaker: 'Jordan', npcId: 'jordan',
        lines: ['Large is $6.50, small is $4. Or just hang out?'],
        choices: [
          { id: 'large', label: '🧋 Large ($6.50)', sublabel: '+6 energy · Jordan +1', category: 'food', cost: -6.5, minutes: 40, energyRestore: 6, relationship: 1, social: true, consequence: 'So many tapioca pearls.', finish: true },
          { id: 'small', label: '🥤 Small ($4)', sublabel: '+4 energy · Jordan +1', category: 'food', cost: -4, minutes: 40, energyRestore: 4, relationship: 1, social: true, consequence: 'Same fun, $2.50 cheaper.', finish: true },
          { id: 'hang', label: '💬 Just hang out', sublabel: 'Free · Jordan +1', cost: 0, minutes: 40, relationship: 1, social: true, consequence: 'Nobody cares that you skipped the drink.', lesson: 'Friends want your company, not your receipts.', finish: true },
        ],
      },
    ],
    rewards: { xp: 10, message: 'Good hang.' },
  },
  {
    id: 'online_sale', pool: 'after_school', kind: 'side', priority: 36, name: 'Sold Online!', emoji: '📦',
    journalText: 'Someone wants your old game for $10. Post it from the Post Office before 5 (postage $3).',
    storySetup: 'A buyer messages you.',
    destination: 'post_office', paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(15, 40), until: hm(17) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'post_office', waypoint: 'Reply to buyer', speaker: 'Buyer', remote: true,
        lines: ['Hi! Is your old copy of Pixel Quest still for sale? I can pay $10.', 'Can you post it today?'],
        choices: [
          { id: 'yes', label: "📦 Deal — I'll post it", sublabel: 'Post Office closes at 5', cost: 0, minutes: 1, consequence: 'You dig the game out from under your bed.' },
          { id: 'no', label: "🎮 I'll keep it", sublabel: '', cost: 0, minutes: 0, consequence: 'Maybe you will play it again. (You won\'t.)', finish: true },
        ],
      },
      {
        id: 's2', place: 'post_office', waypoint: 'Post Office', speaker: 'Post Office',
        lines: ['Small parcel? That is $3 postage.'],
        choices: [{ id: 'post', label: '📦 Post it (+$10 − $3)', sublabel: '$7 profit', category: 'income', cost: 7, minutes: 15, consequence: 'Sold for $10, postage $3: you keep $7.', lesson: 'Profit = price − costs. Selling things you do not use turns clutter into cash.', finish: true }],
      },
    ],
    rewards: { xp: 15, message: 'First online sale!' },
  },

  // ── EVENING (18:30–21:00, at home) ────────────────────────────────────────
  {
    id: 'streaming_trial', pool: 'evening', kind: 'side', priority: 30, name: 'Free Trial Ending', emoji: '📺',
    journalText: 'Your StreamBox free trial ends tonight. Keep it for $5 a month?',
    storySetup: 'A reminder email.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    requires: s => !s.finance.expenses.recurring.some(r => r.id === 'streambox') && !s.world.flags.includes('cancelled_streambox'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Email', speaker: 'StreamBox', remote: true,
      lines: ['Your free trial ends tonight!', 'Do nothing and we charge $5 a month, automatically.'],
      choices: [
        { id: 'keep', label: '📺 Keep watching ($5/month)', sublabel: 'Charged now, then every 30 days', category: 'subscription', cost: -5, minutes: 1, effect: 'subscribe_streambox', consequence: "Subscribed. It'll quietly charge you every month.", lesson: 'Subscriptions are small, automatic and easy to forget — check them regularly.', finish: true },
        { id: 'cancel', label: '✂️ Cancel before it charges', sublabel: 'Free', cost: 0, minutes: 2, consequence: 'Cancelled. $60 a year saved.', flags: ['cancelled_streambox'], finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Subscription decision made.' },
  },
  {
    id: 'sneaker_sale', pool: 'evening', kind: 'side', priority: 30, name: 'Flash Sale', emoji: '👟',
    journalText: 'Sneakers are 30% off tonight only: $21 (were $30).',
    storySetup: 'A pop-up ad.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Ad', speaker: 'ShopNow', remote: true,
      lines: ['⚡ FLASH SALE ⚡ These sneakers: $21 (were $30). Ends at midnight!'],
      choices: [
        { id: 'buy', label: '👟 Buy them ($21)', sublabel: 'You saved $9!', category: 'shopping', cost: -21, minutes: 2, consequence: 'They look great. Your wallet looks thinner.', flags: ['bought_sneakers'], finish: true },
        { id: 'close', label: '❌ Close the ad', sublabel: "You didn't need sneakers", cost: 0, minutes: 0, consequence: 'Gone.', lesson: '"Saving $9" on something you didn\'t plan to buy is spending $21.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Ad dealt with.' },
  },
  {
    id: 'grandma_call', pool: 'evening', kind: 'side', priority: 30, name: 'Grandma Calls', emoji: '👵',
    journalText: 'Grandma is calling!',
    storySetup: 'Your phone rings.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Phone', speaker: 'Grandma', remote: true,
      lines: ["Hello sweetheart! Your mum says you're doing your own budget this week.", "I've sent you $5. Put some away, won't you?"],
      choices: [
        { id: 'chat', label: '☎️ Chat for a while (+$5)', sublabel: '20 min', category: 'gift', cost: 5, minutes: 20, consequence: 'Twenty minutes of stories and one very proud grandma.', finish: true },
        { id: 'quick', label: '👋 Thank her and hang up (+$5)', sublabel: '2 min', category: 'gift', cost: 5, minutes: 2, consequence: 'Grandma: "Off you go then!"', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Lovely call.' },
  },
  {
    id: 'group_gift', pool: 'evening', kind: 'side', priority: 30, name: 'Group Chat', emoji: '💬',
    journalText: "The class is chipping in $2 each for the caretaker's retirement card.",
    storySetup: 'The class group chat lights up.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Group chat', speaker: 'Class chat', remote: true,
      lines: ["Mr Hemi retires Friday! Everyone putting in $2 for a card and a cake 🎂"],
      choices: [
        { id: 'chip', label: '🎂 Chip in $2', sublabel: 'Your name on the card', category: 'gift', cost: -2, minutes: 1, consequence: 'Your name goes on the card.', finish: true },
        { id: 'sign', label: '✍️ Just sign the card', sublabel: 'Free', cost: 0, minutes: 1, consequence: 'Your signature still counts.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Group chat answered.' },
  },

  {
    id: 'phone_scam', pool: 'evening', kind: 'side', priority: 32, name: 'You WON!', emoji: '🎁',
    journalText: 'A text says you won a $500 gift card. Just pay $2 shipping…',
    storySetup: 'An unknown number texts you.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(19, 15), until: hm(21, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Text', speaker: 'Unknown number', remote: true,
      lines: ['🎉 CONGRATULATIONS! You have WON a $500 gift card!', 'Pay $2 shipping in the next 10 minutes to claim: sh0p-prize.co'],
      choices: [
        { id: 'pay', label: '💳 Pay the $2', sublabel: '$500 for $2?!', category: 'other', cost: -2, minutes: 2, consequence: 'No gift card ever arrives. The number stops replying.', lesson: 'If you have to pay to receive a prize, it is not a prize. It is a scam.', flags: ['fell_for_scam'], finish: true },
        { id: 'block', label: '🚫 Block and delete', sublabel: 'Too good to be true', cost: 0, minutes: 1, consequence: 'Blocked. Good instincts.', lesson: 'Real prizes never ask for money up front.', flags: ['spotted_scam'], finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Scam handled.' },
  },
  {
    id: 'game_skin', pool: 'evening', kind: 'side', priority: 30, name: 'Limited Skin', emoji: '🏎️',
    journalText: 'Pixel Racer has a $4.99 skin bundle, "2 hours only".',
    storySetup: 'A pop-up in your game.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Game', speaker: 'Pixel Racer', remote: true,
      lines: ['🔥 LEGENDARY GOLD BUNDLE 🔥', 'Only 2 hours left! $4.99 — 80% of players already own it!'],
      choices: [
        { id: 'buy', label: '✨ Buy it ($4.99)', sublabel: 'Shiny', category: 'entertainment', cost: -4.99, minutes: 1, consequence: 'Your car is gold now. It is not any faster.', finish: true },
        { id: 'skip', label: '❌ Close it', sublabel: 'The car drives the same', cost: 0, minutes: 0, consequence: 'You close it. It will be back next week, "2 hours only" again.', lesson: 'Countdown timers and "everyone has it" are designed to rush you.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Game shop dodged — or not.' },
  },
  {
    id: 'bills_with_mum', pool: 'evening', kind: 'side', priority: 30, name: 'Bill Night', emoji: '🧾',
    journalText: "Mum is paying the power bill. Want to see how it works?",
    storySetup: 'Mum is at the kitchen table with her laptop.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen table', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ['The power bill is $186 this month — winter heater.', 'Want to see where our money goes each week?'],
      choices: [
        { id: 'sit', label: '🧾 Sit with Mum', sublabel: '20 min · Mum +1', cost: 0, minutes: 20, relationship: 1, consequence: 'Rent, power, food, petrol… your $20 suddenly feels generous.', lesson: 'Fixed costs (rent, power) get paid first. What is left is what you can choose about.', finish: true },
        { id: 'later', label: '📱 Maybe later', sublabel: '', cost: 0, minutes: 0, consequence: 'Mum: "Offer stands."', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Learned how bills work.' },
  },
  {
    id: 'movie_night', pool: 'evening', kind: 'side', priority: 34, name: 'Movie Night', emoji: '🎬',
    journalText: 'Friday movie night: the cinema ($12 with snacks) or streaming at yours?',
    storySetup: 'Jordan wants to celebrate the end of the week.',
    paths: ['school'], repeat: 'daily',
    window: { days: [4], from: hm(18, 30), until: hm(20, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
      lines: ['FRIDAY 🎉 movies?', 'cinema is $12 w/ popcorn, or we watch something at yours'],
      choices: [
        { id: 'cinema', label: '🍿 Cinema ($12)', sublabel: '2.5 hours · Jordan +1', category: 'entertainment', cost: -12, minutes: 150, relationship: 1, social: true, consequence: 'Big screen, loud sound, sticky floors. Great night.', finish: true },
        { id: 'home', label: '🛋️ Movie at mine', sublabel: 'Free · Jordan +1', cost: 0, minutes: 150, relationship: 1, social: true, consequence: 'Blankets, a free movie and microwave popcorn. Just as good.', lesson: 'Hosting is the cheapest way to go out.', finish: true },
        { id: 'no', label: '😴 Early night', sublabel: '+10 energy', cost: 0, minutes: 0, energyRestore: 10, consequence: 'Jordan: "boring 😂 have a good one"', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Friday night sorted.' },
  },

  {
    id: 'savings_match', pool: 'evening', kind: 'side', priority: 33, name: "Mum's Savings Deal", emoji: '🐷',
    journalText: 'Mum will add $1 for every $5 you put in your piggy bank tonight.',
    storySetup: 'Mum has an offer.',
    paths: ['school'], repeat: 'daily',
    window: { days: WK, from: hm(18, 30), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Talk to Mum', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ["Deal: put $5 in your piggy bank tonight and I'll add $1 on top.", "That's what a bank does with interest — just faster."],
      choices: [
        { id: 'save', label: '🐷 Save $5 (+$1 from Mum)', sublabel: '$6 in the piggy bank', cost: 0, minutes: 2, effect: 'save_5_matched', consequence: '$5 in, $1 bonus. Your savings grew 20% overnight.', lesson: 'Interest is money paid to you for saving. Real banks pay less than Mum — but it adds up.', finish: true,
          hideIf: s => s.finance.accounts.cash < 5 },
        { id: 'no', label: '💵 Keep my cash', sublabel: 'I might need it', cost: 0, minutes: 0, consequence: 'Mum: "Offer\'s there if you change your mind."', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Savings decision made.' },
  },
  {
    id: 'late_snack', pool: 'evening', kind: 'side', priority: 31, name: 'Midnight Munchies', emoji: '🍔',
    journalText: "You're starving. Delivery is $9 (with fees), or there's bread in the kitchen.",
    storySetup: 'Your stomach growls. A delivery app notification appears.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WK, from: hm(20, 15), until: hm(22) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'FoodNow', remote: true,
      lines: ['Hungry? 🍔 Burger + fries: $5.50', '+ delivery $2.50 + service fee $1.00'],
      choices: [
        { id: 'order', label: '🛵 Order it ($9)', sublabel: '+8 energy', category: 'food', cost: -9, minutes: 30, energyRestore: 8, consequence: 'Tasty. Also $3.50 of it was fees.', lesson: 'Delivery fees can add 60% to the price of the food.', finish: true },
        { id: 'toast', label: '🍞 Make toast', sublabel: 'Free · +5 energy', cost: 0, minutes: 10, energyRestore: 5, consequence: 'Toast with butter. Honestly elite.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Snack sorted.' },
  },

  // ── WEEKEND (9:00–13:00) ──────────────────────────────────────────────────
  {
    id: 'lawn_mowing', pool: 'weekend', kind: 'side', priority: 35, name: 'Mow the Lawn', emoji: '🌱',
    journalText: "Mrs Kaur will pay $7 to mow her lawn (next to your place).",
    storySetup: 'Your neighbour waves you over.',
    destination: 'home', paths: ['school', 'university'], repeat: 'daily',
    window: { days: WEEKEND, from: hm(9), until: hm(13) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Next door', speaker: 'Mrs Kaur', remote: true,
      lines: ["Morning! My lawn is a jungle. $7 if you mow it?"],
      choices: [
        { id: 'mow', label: '🌱 Mow it (+$7)', sublabel: '1.5 hours · 18 energy', category: 'income', cost: 7, minutes: 90, energyCost: 18, consequence: 'Stripes and everything. Mrs Kaur is delighted.', finish: true },
        { id: 'no', label: '🙅 Not today', sublabel: 'Enjoy your weekend', cost: 0, minutes: 0, consequence: 'Mrs Kaur: "Next week, maybe!"', finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Weekend earnings!' },
  },
  {
    id: 'market_stall', pool: 'weekend', kind: 'side', priority: 35, name: 'Sell Old Stuff', emoji: '🧺',
    journalText: 'Riley has a table at the Weekend Market. Sell your old games and books there?',
    storySetup: 'Riley has an idea.',
    destination: 'market', paths: ['school'], repeat: 'daily',
    window: { days: WEEKEND, from: hm(9), until: hm(13, 30) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'market', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
        lines: ["I've got a table at the market! Bring your old stuff — we'll split the table fee."],
        choices: [
          { id: 'yes', label: '🧺 Bring my old stuff', sublabel: 'Weekend Market', cost: 0, minutes: 0, consequence: 'You fill a bag with old games and books.' },
          { id: 'no', label: '🙅 Maybe next time', sublabel: '', cost: 0, minutes: 0, consequence: 'Riley: "ok!"', finish: true },
        ],
      },
      {
        id: 's2', place: 'market', waypoint: 'Weekend Market', speaker: 'Riley', npcId: 'riley',
        lines: ['Table fee is $2 each. Last week I made $9!'],
        choices: [{ id: 'sell', label: '🧺 Pay $2, sell for 2 hours', sublabel: 'Revenue − costs = profit', category: 'income', cost: 6, minutes: 120, energyCost: 10, relationship: 1, social: true, consequence: 'You sold $8 of old stuff and paid $2 for the table: $6 profit.', lesson: 'Profit is what is left after costs: $8 revenue − $2 fee = $6.', finish: true }],
      },
    ],
    rewards: { xp: 20, message: 'First business: profitable!' },
  },
  {
    id: 'babysit', pool: 'weekend', kind: 'side', priority: 36, name: 'Babysitting', emoji: '🧸',
    journalText: "The neighbours need someone to watch little Aroha for two hours — $12.",
    storySetup: 'A knock at the door.',
    paths: ['school', 'university'], repeat: 'daily',
    window: { days: WEEKEND, from: hm(9), until: hm(13) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Next door', speaker: 'Neighbour', remote: true,
      lines: ['We have a work thing — could you watch Aroha for two hours? $12.'],
      choices: [
        { id: 'yes', label: '🧸 Babysit (+$12)', sublabel: '2 hours · 15 energy', category: 'income', cost: 12, minutes: 120, energyCost: 15, consequence: 'Forty rounds of hide and seek. $12 well earned.', finish: true },
        { id: 'no', label: '🙅 Not today', sublabel: '', cost: 0, minutes: 0, consequence: '"No problem, thanks anyway!"', finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Babysitting done.' },
  },
  {
    id: 'vintage_jacket', pool: 'weekend', kind: 'side', priority: 35, name: 'Vintage Find', emoji: '🧥',
    journalText: 'Riley spotted jackets for $8 at the Weekend Market. The Mall has them for $25.',
    storySetup: 'Riley sends a photo from the market.',
    destination: 'market', paths: ['school'], repeat: 'daily',
    window: { days: WEEKEND, from: hm(9), until: hm(13, 30) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'market', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
        lines: ['VINTAGE STALL 😍 jackets for $8!! the mall ones are $25'],
        choices: [
          { id: 'go', label: '🧥 Coming to look', sublabel: 'Weekend Market', cost: 0, minutes: 0, consequence: 'Riley: "hurry before they go!"' },
          { id: 'no', label: '🙅 I have a jacket', sublabel: '', cost: 0, minutes: 0, consequence: 'Riley: "fair"', finish: true },
        ],
      },
      {
        id: 's2', place: 'market', waypoint: 'Weekend Market', speaker: 'Riley', npcId: 'riley',
        lines: ['This one! Barely worn. $8.'],
        choices: [
          { id: 'buy', label: '🧥 Buy it ($8)', sublabel: '$17 cheaper than the Mall', category: 'shopping', cost: -8, minutes: 30, social: true, consequence: 'It fits perfectly. Nobody will guess it was $8.', lesson: 'Second-hand is the same jacket for a third of the price.', finish: true },
          { id: 'browse', label: '👀 Just browse', sublabel: 'Free', cost: 0, minutes: 30, social: true, consequence: 'A nice wander around the stalls with Riley.', finish: true },
        ],
      },
    ],
    rewards: { xp: 10, message: 'Market trip done.' },
  },
  {
    id: 'family_brunch', pool: 'weekend', kind: 'side', priority: 34, name: 'Weekend Brunch', emoji: '🍳',
    journalText: 'Mum is making a big brunch and wants a walk after.',
    storySetup: 'The smell of bacon.',
    paths: ['school'], repeat: 'daily',
    window: { days: WEEKEND, from: hm(9), until: hm(11) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ['Big brunch, then a walk round the park?'],
      choices: [
        { id: 'yes', label: '🍳 Brunch and a walk', sublabel: '1.5 hours · +15 energy · Mum +1', cost: 0, minutes: 90, energyRestore: 15, relationship: 1, consequence: 'Full, happy, and a nice chat on the walk.', lesson: 'The best weekend plans are often free.', finish: true },
        { id: 'plate', label: '🍽️ Just a plate', sublabel: '+8 energy', cost: 0, minutes: 15, energyRestore: 8, consequence: 'You eat and head off.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Brunch done.' },
  },
];
