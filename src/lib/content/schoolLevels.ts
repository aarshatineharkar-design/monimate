/**
 * MoniMate — School path, Levels 2 and 3. Each level is one week on the same engine as Level 1
 * (same routine: pocket money, school, lunch, homework, Sunday night with Mum), with its own story
 * and its own side tasks added to the pool. Each level asks a little more of the player:
 *
 *   Level 2 — "Saving Up": a real bank account (interest + a no-withdrawal bonus), waiting for a
 *     bigger reward, repair vs replace, a chore contract, a too-good-to-be-true "investment",
 *     compound interest, and Mum's birthday on Sunday.
 *   Level 3 — "Budgeting": $30, but lunches, bus and phone are now the player's to pay. A budget
 *     plan on Monday that the recap checks against reality, lunch prep, a fare rise, a tuck-shop tab,
 *     splitting a bill, a school trip to pay for, and a free trial that turns into a weekly charge.
 *
 * Week-only flags start with `wk_` (cleared when the next week's pocket money arrives).
 */
import { hm } from '../clock';
import type { MissionDef } from '../missions';
import { attendedToday, doneThisWeek, hasFlag, fromLevel } from '../missionUtil';

const WK = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const SCHOOL: MissionDef['paths'] = ['school'];

// ═══ LEVEL 2 — SAVING UP ═══════════════════════════════════════════════════
export const SCHOOL_L2: MissionDef[] = [
  {
    id: 'l2_bank_account', kind: 'main', priority: 160, name: 'Kids Saver', emoji: '🏦',
    journalText: 'The Bank does a Kids Saver: 4% interest a year plus a $1 bonus every week you don\'t withdraw. Open one after school (Mon–Tue, till 4:30).',
    storySetup: 'Mum mentioned the Bank this morning.',
    destination: 'bank', paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [0], from: hm(15, 35), until: hm(16, 25), spanDays: 1 },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'pocket_money') && !hasFlag(s, 'bank_account_open'),
    steps: [
      {
        id: 's1', place: 'bank', waypoint: 'Reply to Mum', speaker: 'Mum', npcId: 'mum', remote: true,
        lines: ["The Bank's open till 4:30. The Kids Saver pays interest — a piggy bank pays nothing.", 'Want to go and open one?'],
        choices: [
          { id: 'go', label: "🏦 I'll go now", sublabel: 'The Bank, before 4:30', cost: 0, minutes: 0, consequence: 'Mum: "Take your school ID!"' },
          { id: 'piggy', label: '🐷 My piggy bank is fine', sublabel: '0% interest', cost: 0, minutes: 0, consequence: 'The pig stays on the shelf.', lesson: 'Money in a piggy bank never grows. Money in a savings account does — slowly.', finish: true },
        ],
      },
      {
        id: 's2', place: 'bank', waypoint: 'Bank', speaker: 'Bank teller',
        lines: [
          "Welcome! The Kids Saver needs $5 to open. It pays 4% a year, plus a $1 bonus every week you don't take money out.",
          'Your savings will live here from now on — you can see and move them in your banking app.',
        ],
        choices: [
          { id: 'open', label: '🏦 Open it ($5 first deposit)', sublabel: 'Interest paid every Sunday', cost: 0, minutes: 15, effect: 'open_kids_saver', consequence: 'Account open! Your first $5 is in. Interest lands every Sunday.', lesson: 'Interest is the bank paying you to keep your money with them.', flags: ['wk_opened_bank'], finish: true },
          { id: 'not_now', label: '🤔 Maybe another time', sublabel: '', cost: 0, minutes: 5, consequence: 'You take a brochure and leave.', finish: true },
        ],
      },
    ],
    rewards: { xp: 30, message: 'Your first bank account!' },
  },
  {
    id: 'l2_patience', kind: 'main', priority: 150, name: 'The Patience Test', emoji: '🍫',
    journalText: "Money Week at school: Ms Patel's chocolate experiment.",
    storySetup: 'Ms Patel puts a chocolate on every desk.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [1], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Ms Patel (School)', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ['Money Week! A small experiment.', "Eat the chocolate now — or leave it, and on Friday I'll give you two."],
      choices: [
        { id: 'now', label: '🍫 Eat it now', sublabel: '+5 energy', cost: 0, minutes: 5, energyRestore: 5, consequence: 'Delicious. Gone in four seconds.', flags: ['wk_ate_now'], finish: true },
        { id: 'wait', label: '⏳ Wait for Friday', sublabel: 'Two instead of one', cost: 0, minutes: 5, consequence: 'You slide it back. Jordan eats his instantly.', lesson: 'Waiting for a bigger reward is exactly what saving is.', flags: ['wk_waited'], finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Experiment done.' },
  },
  {
    id: 'l2_school_bag', kind: 'side', priority: 120, name: 'Broken Bag', emoji: '🎒',
    journalText: 'Your school bag strap snapped. New at the Mall ($28), the Weekend Market on Saturday ($12), or fix it.',
    storySetup: 'Walking home, your bag strap snaps.',
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [1], from: hm(15, 35), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ['Your school bag strap just snapped.', 'The Mall has a new one for $28. The Weekend Market sells good ones for $12 — on Saturday. Or you could stitch it.'],
      choices: [
        { id: 'mall', label: '🛍️ New one at the Mall ($28)', sublabel: 'Today', category: 'shopping', cost: -28, minutes: 40, consequence: 'Shiny. Also $28.', flags: ['wk_bag_mall'], finish: true },
        { id: 'market', label: '🧺 Wait for the market ($12)', sublabel: 'Tape it till Saturday', cost: 0, minutes: 5, consequence: 'Tape now, market on Saturday.', lesson: 'Waiting a few days can cost a lot less.', flags: ['wk_bag_market_plan'], finish: true },
        { id: 'fix', label: '🧵 Stitch it with Mum', sublabel: 'Free · 45 min', cost: 0, minutes: 45, energyCost: 4, consequence: 'Mum shows you a strong stitch. Good as new.', lesson: 'Repair before you replace.', flags: ['wk_bag_fixed'], finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Bag sorted.' },
  },
  {
    id: 'l2_chore_contract', kind: 'side', priority: 130, name: 'The Dishes Deal', emoji: '🍽️',
    journalText: 'Mum offers $2 a night for the dishes, Wednesday to Saturday. Miss a night and the deal is off.',
    storySetup: 'Mum has a proposal over breakfast.',
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [2], from: hm(7), until: hm(8, 20) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ['A deal: dishes every night, Wednesday to Saturday — $2 a night.', "Skip one and the deal's off. Shake on it?"],
      choices: [
        { id: 'deal', label: '🤝 Deal ($8 if I keep it)', sublabel: 'Dishes 6:30–9:30 PM, four nights', cost: 0, minutes: 1, relationship: 1, consequence: 'You shake on it. Mum looks impressed.', lesson: 'A deal is a promise with money attached.', flags: ['wk_chore_contract'], finish: true },
        { id: 'no', label: '🙅 Not this week', sublabel: '', cost: 0, minutes: 1, consequence: 'Mum: "Offer stands next week."', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Deal decided.' },
  },
  {
    id: 'l2_dishes', kind: 'daily', priority: 55, name: 'Dishes Night', emoji: '🧽',
    journalText: 'Your side of the deal: dishes tonight for $2.',
    storySetup: 'The sink is full.',
    destination: 'home', paths: SCHOOL, repeat: 'daily', levels: [2],
    window: { days: [2, 3, 4, 5], from: hm(18, 30), until: hm(21, 30) },
    trigger: { type: 'location', place: 'home' },
    requires: s => hasFlag(s, 'wk_chore_contract') && !hasFlag(s, 'wk_contract_broken'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Mum', npcId: 'mum',
      lines: ['Dishes time! The deal stands.'],
      variants: [
        { lines: ['Dishes time! The deal stands.'] },
        { lines: ['Lasagne night. The dish is… a challenge.'] },
        { lines: ['Just a few plates tonight — easy $2.'] },
      ],
      choices: [
        { id: 'do', label: '🧽 Do the dishes (+$2)', sublabel: '25 min · 4 energy', category: 'income', cost: 2, minutes: 25, energyCost: 4, consequence: 'Sparkling. Mum hands you $2.', finish: true },
        { id: 'skip', label: "😩 Can't be bothered", sublabel: 'Breaks the deal · Mum -1', cost: 0, minutes: 0, relationship: -1, consequence: 'Mum: "Right. Deal\'s off, then."', lesson: 'A contract only works if both sides keep it.', flags: ['wk_contract_broken'], finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Dishes done.' },
    onExpire: { message: "No dishes tonight — Mum calls the deal off.", flags: ['wk_contract_broken'], relationship: { npc: 'Mum', delta: -1 } },
  },
  {
    id: 'l2_lost_cash', kind: 'side', priority: 125, name: 'Hole in Your Pocket', emoji: '🕳️',
    journalText: 'Some of your cash fell out of a hole in your pocket.',
    storySetup: 'You reach into your pocket. Something is missing.',
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [2], from: hm(15, 40), until: hm(19) },
    trigger: { type: 'time' },
    // Only bites if you're carrying real cash — money already in savings is safe.
    requires: s => s.finance.accounts.cash >= 8,
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ["Your $5 note is gone — there's a hole in your pocket lining.", 'Retrace your steps, or let it go?'],
      choices: [
        { id: 'retrace', label: '🔎 Retrace your steps', sublabel: '45 min · you might find some', category: 'other', cost: -2, minutes: 45, energyCost: 5, consequence: 'You find $3 of it by the school gate. $2 is gone for good.', lesson: 'Carry only what you need — money in savings can\'t fall out of a pocket.', finish: true },
        { id: 'let_go', label: '🤷 Let it go', sublabel: '-$5', category: 'other', cost: -5, minutes: 0, consequence: 'Gone. You check your other pockets twice.', lesson: 'Carry only what you need — money in savings can\'t fall out of a pocket.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Lesson learned.' },
  },
  {
    id: 'l2_interest_lesson', kind: 'main', priority: 145, name: 'Money Week Quiz', emoji: '📈',
    journalText: 'Ms Patel has a compound-interest question for the class.',
    storySetup: 'Ms Patel writes "$10 a week" on the whiteboard.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [3], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Ms Patel (School)', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ['Save $10 every week for 10 years in an account paying 5% interest.', "That's $5,200 of your own money. Roughly how much do you end up with?"],
      choices: [
        { id: 'a', label: '💵 About $5,200', sublabel: 'What you put in', cost: 0, minutes: 5, consequence: "That's just your deposits — you forgot the interest!", finish: true },
        { id: 'b', label: '📈 About $6,700', sublabel: 'Deposits plus interest', cost: 0, minutes: 5, consequence: 'Spot on! About $1,500 of that is interest — and some of it is interest on interest.', lesson: 'Compound interest: your interest earns interest too. Starting early is the whole trick.', flags: ['wk_interest_right'], finish: true },
        { id: 'c', label: '🤑 About $52,000', sublabel: 'Interest is magic', cost: 0, minutes: 5, consequence: "Way too high — interest helps, but it isn't magic.", finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Maths with money in it.' },
  },
  {
    id: 'l2_mystery_boxes', kind: 'side', priority: 115, name: "Jordan's Big Idea", emoji: '📦',
    journalText: 'Jordan wants $10 to buy mystery boxes and "flip" them. Guaranteed double, apparently.',
    storySetup: 'Jordan has a business plan.',
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [3], from: hm(15, 40), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
      lines: ['BUSINESS IDEA 🤑 give me $10, I buy mystery boxes, we sell what\'s inside online', 'double ur money by sunday GUARANTEED'],
      choices: [
        { id: 'invest', label: "📦 I'm in ($10)", sublabel: 'Double or…?', category: 'other', cost: -10, minutes: 2, relationship: 1, consequence: 'Jordan: "PARTNERS 🤝"', flags: ['wk_mystery'], finish: true },
        { id: 'no', label: "🙅 I'll keep my $10", sublabel: '', cost: 0, minutes: 1, consequence: 'Jordan: "ur gonna regret this"', lesson: '"Guaranteed" returns are the biggest red flag in money.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Business decision made.' },
  },
  {
    id: 'l2_mystery_result', kind: 'side', priority: 100, name: 'Mystery Box Results', emoji: '📦',
    journalText: 'Jordan has news about the mystery boxes.',
    storySetup: 'Jordan texts.',
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [6], from: hm(10), until: hm(20) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_mystery'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true, lines: [],
      variants: [
        {
          lines: ['ok so… the boxes had a keyring and some stickers 😬', 'sold them for $6 total. here\'s your $3'],
          choices: [{ id: 'lose', label: '😐 +$3 back', sublabel: '$7 down', category: 'refund', cost: 3, minutes: 1, consequence: "You're $7 down. Jordan buys you a drink to say sorry.", lesson: 'Mystery boxes are built so most buyers lose — it works like gambling.', finish: true }],
        },
        {
          lines: ['BRO one box had a rare figure!!', 'sold it — here\'s $12 🤑'],
          choices: [{ id: 'win', label: '🎉 +$12 back', sublabel: '$2 up', category: 'refund', cost: 12, minutes: 1, consequence: 'You made $2. Pure luck — most boxes lose.', lesson: 'One lucky win makes risky bets feel smart. They still aren\'t.', finish: true }],
        },
        {
          lines: ["so bad news. the boxes were empty-ish", "can't sell any of it. sorry 😭"],
          choices: [{ id: 'lose', label: '😑 Great.', sublabel: '$10 gone', cost: 0, minutes: 1, relationship: -1, consequence: 'Your $10 is a pile of stickers now.', lesson: 'Only risk money you can afford to lose.', finish: true }],
        },
      ],
    }],
    rewards: { xp: 5, message: 'Investment settled.' },
  },
  {
    id: 'l2_patience_payout', kind: 'side', priority: 110, name: 'Two Chocolates', emoji: '🍫',
    journalText: 'You waited — Ms Patel owes you two chocolates.',
    storySetup: 'Ms Patel remembers.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [4], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_waited') && attendedToday(s),
    steps: [{
      id: 's1', place: 'university', waypoint: 'Ms Patel (School)', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ['You waited! As promised — two chocolates.', 'Only four of you managed it.'],
      choices: [{ id: 'take', label: '🍫🍫 Take them', sublabel: '+10 energy', cost: 0, minutes: 2, energyRestore: 10, relationship: 1, consequence: 'Twice the chocolate for being patient.', flags: ['wk_patience_paid'], finish: true }],
    }],
    rewards: { xp: 10, message: 'Patience paid.' },
  },
  {
    id: 'l2_bike_sale', kind: 'side', priority: 120, name: 'Bike for Sale', emoji: '🚲',
    journalText: 'A second-hand bike is for sale online: $30, first to pay.',
    storySetup: 'A listing pops up.',
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [4], from: hm(15, 40), until: hm(20, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Marketplace', speaker: 'Marketplace', remote: true,
      lines: ["For sale: kids' bike, good condition, $30. First to pay gets it."],
      choices: [
        { id: 'buy', label: '🚲 Buy it ($30)', sublabel: 'Needs $30 in cash — take savings out first', category: 'shopping', cost: -30, minutes: 30, effect: 'buy_bike', consequence: 'The bike is yours. Paid for with money you saved.', lesson: 'Saving up first means it is actually yours — no debt attached.', flags: ['wk_bought_bike'], finish: true },
        { id: 'pass', label: '🙅 Not this time', sublabel: '', cost: 0, minutes: 0, consequence: 'Someone else snaps it up.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Listing dealt with.' },
  },
  {
    id: 'l2_market_bag', kind: 'side', priority: 110, name: 'Market Bag', emoji: '🎒',
    journalText: 'The $12 bags at the Weekend Market — you planned to get one.',
    storySetup: 'The market is busy.',
    destination: 'market', paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [5], from: hm(8, 30), until: hm(13, 30) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_bag_market_plan'),
    steps: [{
      id: 's1', place: 'market', waypoint: 'Weekend Market', speaker: 'Stallholder',
      lines: ['Good sturdy school bags — $12.'],
      choices: [
        { id: 'buy', label: '🎒 Buy one ($12)', sublabel: '$16 less than the Mall', category: 'shopping', cost: -12, minutes: 15, consequence: 'Same bag, less than half the price.', flags: ['wk_bag_market'], finish: true },
        { id: 'no', label: '🙅 Actually, the tape is holding', sublabel: '', cost: 0, minutes: 2, consequence: 'You keep the tape. Bold.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Bag sorted.' },
  },
  {
    id: 'l2_gift_shopping', kind: 'main', priority: 120, name: "Mum's Present", emoji: '🎁',
    journalText: "Mum's birthday is tomorrow: flowers ($8), a candle ($15) — or make something.",
    storySetup: "It's Saturday. Mum's birthday is tomorrow.",
    paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [5], from: hm(9), until: hm(17) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ["Mum's birthday is tomorrow!", 'Flowers at the market are $8, the Mall has a nice candle for $15 — or make a card and breakfast in bed.'],
      choices: [
        { id: 'flowers', label: '💐 Flowers ($8)', sublabel: 'From the market', category: 'gift', cost: -8, minutes: 40, consequence: 'Bright and cheerful. Hidden in your room.', flags: ['wk_gift_bought'], finish: true },
        { id: 'candle', label: '🕯️ Candle ($15)', sublabel: 'From the Mall', category: 'gift', cost: -15, minutes: 50, consequence: 'It smells like vanilla and expensive decisions.', flags: ['wk_gift_bought'], finish: true },
        { id: 'homemade', label: '💌 Card + breakfast in bed', sublabel: 'Free · 1 hour', cost: 0, minutes: 60, energyCost: 3, consequence: 'Glitter everywhere. Worth it.', lesson: 'Thoughtful beats expensive.', flags: ['wk_gift_homemade'], finish: true },
      ],
    }],
    rewards: { xp: 15, message: 'Present sorted.' },
    onExpire: { message: "Saturday's gone and there's nothing for Mum's birthday…" },
  },
  {
    id: 'l2_mum_birthday', kind: 'main', priority: 135, name: "Mum's Birthday", emoji: '🎂',
    journalText: "It's Mum's birthday!",
    storySetup: 'Sunday morning. Mum is making coffee.',
    destination: 'home', paths: SCHOOL, repeat: 'weekly', levels: [2],
    window: { days: [6], from: hm(7, 30), until: hm(12) },
    trigger: { type: 'location', place: 'home' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Mum', speaker: 'Mum', npcId: 'mum',
      lines: ["It's my birthday! 🎂"],
      choices: [
        { id: 'give', label: '🎁 Give her your present', sublabel: 'Bought with your own money · Mum +2', cost: 0, minutes: 20, relationship: 2, consequence: 'Mum: "You bought this yourself? I\'m keeping it forever."', flags: ['wk_gift_given'], finish: true,
          hideIf: s => !hasFlag(s, 'wk_gift_bought') },
        { id: 'breakfast', label: '🥞 Breakfast in bed + your card', sublabel: 'Mum +2', cost: 0, minutes: 40, relationship: 2, consequence: 'Mum cries a little at the card. Happy tears.', flags: ['wk_gift_given'], finish: true,
          hideIf: s => !hasFlag(s, 'wk_gift_homemade') },
        { id: 'hug', label: '🤗 Happy birthday, Mum!', sublabel: '', cost: 0, minutes: 5, consequence: 'Mum: "Thanks, love." She seems a little quiet.', finish: true,
          hideIf: s => hasFlag(s, 'wk_gift_bought') || hasFlag(s, 'wk_gift_homemade') },
      ],
    }],
    rewards: { xp: 20, message: 'Happy birthday, Mum.' },
  },
];

/** Level 2+ side tasks (they stay in the rotation for later levels too). */
export const SCHOOL_L2_POOL: MissionDef[] = [
  {
    id: 'l2p_vending', pool: 'after_school', kind: 'side', priority: 34, name: 'Vending Machine', emoji: '🥤',
    journalText: 'A $3.50 fizzy drink, or the water bottle in your bag.',
    storySetup: 'The vending machine hums at you.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: WK, from: hm(15, 35), until: hm(18) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ['Thirsty. The vending machine wants $3.50 for a fizzy drink.', 'Your water bottle is in your bag.'],
      choices: [
        { id: 'buy', label: '🥤 Fizzy drink ($3.50)', sublabel: '+3 energy', category: 'food', cost: -3.5, minutes: 2, energyRestore: 3, consequence: 'Cold and sweet, gone in a minute.', lesson: '$3.50 a day is $17.50 a week.', flags: ['wk_impulse'], finish: true },
        { id: 'water', label: '💧 Water from your bag', sublabel: 'Free', cost: 0, minutes: 1, consequence: 'Water. Still wet.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Thirst handled.' },
  },
  {
    id: 'l2p_trading_cards', pool: 'after_school', kind: 'side', priority: 35, name: 'Card Packs', emoji: '🃏',
    journalText: 'New Pixel Monsters card packs: $5 each, random rares inside.',
    storySetup: 'Jordan is waving a shiny card.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: WK, from: hm(15, 40), until: hm(18) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
      lines: ['NEW PIXEL MONSTERS PACKS 🃏 $5, I pulled a holo!!', 'buy one, you might get the dragon'],
      choices: [
        { id: 'buy', label: '🃏 Buy a pack ($5)', sublabel: 'Probably not the dragon', category: 'entertainment', cost: -5, minutes: 10, consequence: 'Three commons and a card you already have.', lesson: 'Random packs are designed like slot machines — the rare pulls keep you buying.', flags: ['wk_impulse'], finish: true },
        { id: 'no', label: '🙅 Not for me', sublabel: '', cost: 0, minutes: 0, consequence: 'Jordan: "ur loss" (it is not)', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Cards resisted (or not).' },
  },
  {
    id: 'l2p_book_fair', pool: 'after_school', kind: 'side', priority: 36, name: 'Book Fair', emoji: '📚',
    journalText: 'The school book fair: $8 paperbacks. The library has most of them free.',
    storySetup: 'Tables of books in the hall.', destination: 'university', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: [1, 2, 3], from: hm(12, 30), until: hm(15, 20) }, trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'School hall', speaker: 'Book fair',
      lines: ['Book fair! Paperbacks $8.', 'The library down the hall has most of these to borrow — free.'],
      choices: [
        { id: 'buy', label: '📘 Buy one ($8)', sublabel: 'Yours to keep', category: 'shopping', cost: -8, minutes: 15, consequence: 'New-book smell. Worth something.', finish: true },
        { id: 'library', label: '🏫 Borrow it from the library', sublabel: 'Free', cost: 0, minutes: 10, consequence: 'Same story, $0.', lesson: 'Libraries are the original "free trial" — with no catch.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Book sorted.' },
  },
  {
    id: 'l2p_grandad_money', pool: 'evening', kind: 'side', priority: 33, name: "Grandad's $10", emoji: '👴',
    journalText: 'Grandad has sent you $10.',
    storySetup: 'A message from Grandad.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: WK, from: hm(18, 30), until: hm(21) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Phone', speaker: 'Grandad', remote: true,
      lines: ["Here's $10 for being a good egg. Don't spend it all at once!"],
      choices: [
        { id: 'save', label: '🐷 Straight into savings', sublabel: 'You won\'t even miss it', category: 'gift', cost: 10, minutes: 1, effect: 'save_gift_10', consequence: 'Saved before you could spend it.', lesson: 'Save unexpected money first — you never budgeted for it anyway.', finish: true },
        { id: 'spend', label: '💵 Keep it as cash', sublabel: '+$10 to spend', category: 'gift', cost: 10, minutes: 1, consequence: '$10 burning a hole in your pocket.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Thanks, Grandad!' },
  },
  {
    id: 'l2p_coin_jar', pool: 'evening', kind: 'side', priority: 32, name: 'Old Coin Jar', emoji: '🫙',
    journalText: 'You found an old coin jar: $6.40 in coins.',
    storySetup: 'Something rattles at the back of your wardrobe.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: WK, from: hm(19), until: hm(21, 30) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Your room', speaker: 'You', remote: true,
      lines: ['An old coin jar! You count it out: $6.40.'],
      choices: [
        { id: 'save', label: '🐷 Put it in savings', sublabel: '+$6.40 saved', category: 'other', cost: 6.4, minutes: 15, effect: 'save_coins', consequence: 'Forgotten money, now working for you.', finish: true },
        { id: 'spend', label: '💵 Spending money!', sublabel: '+$6.40 cash', category: 'other', cost: 6.4, minutes: 15, consequence: 'Pockets full of coins.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Coins counted.' },
  },
  {
    id: 'l2p_car_wash', pool: 'weekend', kind: 'side', priority: 35, name: 'Wash the Car', emoji: '🚗',
    journalText: 'Mr Tipene next door will pay $6 to wash his car.',
    storySetup: 'Mr Tipene is holding a bucket hopefully.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: WEEKEND, from: hm(9), until: hm(13) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Next door', speaker: 'Mr Tipene', remote: true,
      lines: ['Kia ora! $6 to give the car a wash?'],
      choices: [
        { id: 'wash', label: '🚗 Wash it (+$6)', sublabel: '45 min · 6 energy', category: 'income', cost: 6, minutes: 45, energyCost: 6, consequence: 'Gleaming. Mr Tipene is delighted.', finish: true },
        { id: 'no', label: '🙅 Not today', sublabel: '', cost: 0, minutes: 0, consequence: '"Next weekend, maybe!"', finish: true },
      ],
    }],
    rewards: { xp: 8, message: 'Weekend earnings!' },
  },
  {
    id: 'l2p_uniform', pool: 'morning', kind: 'side', priority: 40, name: 'Jumper Too Small', emoji: '🧥',
    journalText: 'Your school jumper is too small: new ($35) or second-hand ($8).',
    storySetup: 'Your sleeves end at your elbows.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(2),
    window: { days: WK, from: hm(7), until: hm(8, 10) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Kitchen', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ["That jumper's too small! A new one is $35. The second-hand uniform shop has them for $8.", "I'll cover the $8. If you want new, you chip in $15."],
      choices: [
        { id: 'secondhand', label: '♻️ Second-hand is fine', sublabel: 'Mum pays', cost: 0, minutes: 2, consequence: 'Nobody can tell. Nobody ever can.', lesson: 'Second-hand uniforms: same jumper, a quarter of the price.', finish: true },
        { id: 'new', label: '✨ New one (you pay $15)', sublabel: 'Crisp', category: 'shopping', cost: -15, minutes: 2, consequence: 'Very crisp. Very $15.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Jumper sorted.' },
  },
];

// ═══ LEVEL 3 — BUDGETING ═══════════════════════════════════════════════════
export const SCHOOL_L3: MissionDef[] = [
  {
    id: 'l3_budget_plan', kind: 'main', priority: 195, name: 'Make a Budget', emoji: '📊',
    journalText: '$30 in, $5 of it for your phone: plan the other $25 into food, bus, fun and savings.',
    storySetup: 'The Budget app opens itself.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [0], from: hm(7), until: hm(23, 59) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'pick_goal'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Budget app', speaker: 'Budget app', remote: true,
      lines: ['$30 in. Your phone top-up is $5, so there is $25 to plan.', 'Pick a plan — the app tracks each envelope all week (see the Bank app).'],
      choices: [
        { id: 'balanced', label: '⚖️ Balanced', sublabel: 'Food $12 · Bus $6 · Fun $4 · Save $3', cost: 0, minutes: 2, consequence: 'Plan set. Balanced, sensible, very adult.', lesson: 'A budget is just deciding in advance, so you don\'t decide in the moment.', flags: ['wk_budget:12:6:4:3'], finish: true },
        { id: 'saver', label: '🐷 Saver', sublabel: 'Food $10 · Bus $4 · Fun $2 · Save $9', cost: 0, minutes: 2, consequence: 'Plan set. Tight — you\'ll need packed lunches and walking.', flags: ['wk_budget:10:4:2:9'], finish: true },
        { id: 'social', label: '🎉 Social', sublabel: 'Food $9 · Bus $6 · Fun $8 · Save $2', cost: 0, minutes: 2, consequence: 'Plan set. Fun first — food will be tight.', flags: ['wk_budget:9:6:8:2'], finish: true },
        { id: 'none', label: "🤷 No plan, I'll wing it", sublabel: 'No envelopes', cost: 0, minutes: 0, consequence: 'The app sighs. (Apps can sigh.)', lesson: "Without a plan you can't tell whether a spend is fine or a problem.", flags: ['wk_budget_none'], finish: true },
      ],
    }],
    rewards: { xp: 20, message: 'Budget decided.' },
  },
  {
    id: 'l3_phone_topup', kind: 'main', priority: 190, name: 'Phone Top-Up', emoji: '📱',
    journalText: 'Your phone top-up is yours to pay now: $5 for the week.',
    storySetup: 'Your data runs out at 7:02 AM.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [0], from: hm(7), until: hm(22) },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'pocket_money'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Phone', speaker: 'Mobile', remote: true,
      lines: ['Your prepay balance is $0.', 'Top up $5 for a week of data and texts?'],
      choices: [
        { id: 'topup', label: '📱 Top up ($5)', sublabel: 'A week of data', category: 'other', cost: -5, minutes: 1, consequence: 'Connected. $25 left to plan.', finish: true },
        { id: 'wifi', label: '📡 Wi-Fi only this week', sublabel: 'Save $5', cost: 0, minutes: 0, consequence: "You'll miss group-chat plans when you're out.", lesson: 'Needs vs wants — but a phone can be both.', flags: ['wk_no_data'], finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Phone sorted.' },
  },
  {
    id: 'l3_meal_prep', kind: 'timed', priority: 170, name: 'Lunch Supplies', emoji: '🥪',
    journalText: 'Bread and eggs from the Supermarket (~$5) = four days of packed lunches. The canteen is $5+ a day.',
    storySetup: "Mum isn't packing lunches any more.",
    destination: 'supermarket', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [0], from: hm(15, 35), until: hm(20), spanDays: 1 },
    trigger: { type: 'time' },
    requires: s => doneThisWeek(s, 'pocket_money'),
    steps: [
      {
        id: 's1', place: 'supermarket', waypoint: 'Reply to Mum', speaker: 'Mum', npcId: 'mum', remote: true,
        lines: ['Want packed lunches this week? Bread and eggs is about $5 — four days of egg sandwiches.', 'The canteen is $5 or more a day.'],
        choices: [
          { id: 'go', label: "🥪 I'll get the supplies", sublabel: 'Supermarket · bread + eggs', cost: 0, minutes: 0, consequence: 'List: bread, eggs.' },
          { id: 'skip', label: "🍟 I'll buy lunch at school", sublabel: 'Canteen every day', cost: 0, minutes: 0, consequence: 'Mum raises an eyebrow.', lesson: '$5 of groceries vs $25 of canteen lunches.', finish: true },
        ],
      },
      {
        id: 's2', place: 'supermarket', waypoint: 'Supermarket', speaker: 'Your list',
        lines: ['Bread and eggs — about $5 for the week.'],
        awaitsPurchase: true,
        purchaseNeeds: ['bread_', 'eggs_'],
        purchaseBudget: 5.5,
      },
    ],
    rewards: { xp: 20, message: 'Lunches sorted for the week.' },
    onExpire: { message: "No lunch supplies — it's the canteen every day this week." },
  },
  {
    id: 'l3_trip_notice', kind: 'main', priority: 150, name: 'Museum Trip', emoji: '🏛️',
    journalText: 'Friday: museum trip! $12, paid at the school office by Thursday 3 PM.',
    storySetup: 'Ms Patel has a stack of permission slips.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [1], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Ms Patel (School)', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ["Friday's museum trip! It's $12 — pay at the school office by Thursday 3 PM.", 'Bring your own lunch.'],
      choices: [{ id: 'noted', label: '📝 Noted', sublabel: '$12 by Thursday', cost: 0, minutes: 1, consequence: 'Another thing your $30 has to cover.', flags: ['wk_trip_told'], finish: true }],
    }],
    rewards: { xp: 5, message: 'Trip noted.' },
  },
  {
    id: 'l3_free_trial', kind: 'side', priority: 105, name: 'Free Trial', emoji: '🎮',
    journalText: 'Pixel Racer Premium: 7 days free, then $6.99 a week.',
    storySetup: 'A pop-up in your game.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [1], from: hm(19), until: hm(21, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Game', speaker: 'Pixel Racer', remote: true,
      lines: ['PREMIUM: 7 days FREE! 🏎️', 'Then just $6.99 a week. Cancel anytime.'],
      choices: [
        { id: 'trial', label: '🎮 Start the free trial', sublabel: 'Charges $6.99 weekly unless cancelled', cost: 0, minutes: 2, effect: 'premium_trial', consequence: "Premium unlocked. It'll charge $6.99 next Tuesday unless you cancel (Bank app).", lesson: "Free trials count on you forgetting to cancel.", flags: ['wk_trial_started'], finish: true },
        { id: 'no', label: '❌ No thanks', sublabel: '', cost: 0, minutes: 0, consequence: 'You close it.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Pop-up dealt with.' },
  },
  {
    id: 'l3_fare_rise', kind: 'side', priority: 140, name: 'Fare Rise', emoji: '🚌',
    journalText: 'Route 1 fares go from $2 to $2.50 on Thursday. Today only: 10 rides for $18.',
    storySetup: 'A notice from Route 1.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [2], from: hm(7), until: hm(21) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Route 1', speaker: 'Route 1', remote: true,
      lines: ['From Thursday, fares go up from $2.00 to $2.50.', 'Today only: a 10-trip card for $18 — $1.80 a ride.'],
      choices: [
        { id: 'buy', label: '🎫 Buy the 10-trip card ($18)', sublabel: '$1.80 a ride, forever', category: 'transport', cost: -18, minutes: 2, effect: 'ten_trip_card', consequence: '10 rides loaded. The price rise can\'t touch them.', lesson: 'Buying before a price rise locks in the old price — if you really will use it.', flags: ['wk_ten_trip'], finish: true },
        { id: 'no', label: '🚶 I mostly walk', sublabel: 'Keep the $18', cost: 0, minutes: 0, consequence: "You'll pay $2.50 when you do ride.", finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Fare decision made.' },
  },
  {
    id: 'l3_tuck_tab', kind: 'side', priority: 125, name: 'Tuck Shop Tab', emoji: '🥧',
    journalText: 'The tuck shop now runs tabs: eat now, pay Friday.',
    storySetup: 'A new sign at the tuck shop: "TABS NOW AVAILABLE".',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [2], from: hm(12, 30), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: attendedToday,
    steps: [{
      id: 's1', place: 'university', waypoint: 'Tuck shop', speaker: 'Tuck shop',
      lines: ['New! Put it on your tab — pay on Friday.', 'Hot pie, $4?'],
      choices: [
        { id: 'tab', label: '🥧 Pie on my tab', sublabel: 'Pay $4 Friday · +12 energy', cost: 0, minutes: 10, energyRestore: 12, effect: 'tuck_tab_4', consequence: 'Pie now, pay Friday. What could go wrong?', lesson: 'A tab is borrowing — it\'s still your money, just spent before you have it.', flags: ['wk_tab'], finish: true },
        { id: 'cash', label: '💵 Pay cash ($4)', sublabel: '+12 energy', category: 'food', cost: -4, minutes: 10, energyRestore: 12, consequence: 'Pie, paid for. Done.', finish: true },
        { id: 'skip', label: '🙅 Not hungry', sublabel: '', cost: 0, minutes: 0, consequence: 'You walk on by.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Tuck shop visited.' },
  },
  {
    id: 'l3_split_bill', kind: 'side', priority: 130, name: 'Pizza After School', emoji: '🍕',
    journalText: 'Pizza with Jordan and Riley at the Restaurant — and a bill to split.',
    storySetup: 'Jordan is starving. As always.',
    destination: 'restaurant', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [2], from: hm(15, 40), until: hm(19, 30) },
    trigger: { type: 'time' },
    steps: [
      {
        id: 's1', place: 'restaurant', waypoint: 'Reply to Jordan', speaker: 'Jordan', npcId: 'jordan', remote: true,
        lines: ['pizza at the Restaurant?? 🍕 riley and sam are coming'],
        choices: [
          { id: 'go', label: '🍕 On my way', sublabel: 'The Restaurant', cost: 0, minutes: 0, consequence: 'Jordan: "🍕🍕🍕"' },
          { id: 'no', label: '🙅 Saving my money', sublabel: '', cost: 0, minutes: 0, consequence: 'Jordan: "fair"', finish: true },
        ],
      },
      {
        id: 's2', place: 'restaurant', waypoint: 'Restaurant', speaker: 'Jordan', npcId: 'jordan',
        lines: ["Bill's $36 for four of us. Easy — $9 each?", '(You had one slice and a water. About $5 worth.)'],
        choices: [
          { id: 'even', label: '➗ $9 each, sure', sublabel: 'Easy · Jordan +1', category: 'food', cost: -9, minutes: 60, relationship: 1, social: true, consequence: 'Easy. You paid $4 of someone else\'s pizza.', flags: ['wk_split_even'], finish: true },
          { id: 'fair', label: '🧾 "I just had one slice — $5?"', sublabel: 'Pay for what you had', category: 'food', cost: -5, minutes: 60, social: true, consequence: 'Riley does the same. Jordan grumbles, then agrees.', lesson: "It's fine to pay for what you had — say it early, not after the bill comes.", flags: ['wk_split_fair'], finish: true },
          { id: 'cover', label: '💛 Cover Riley too ($12)', sublabel: "She's a bit short", category: 'food', cost: -12, minutes: 60, social: true, consequence: 'Riley hugs you. Your food budget does not.', finish: true },
        ],
      },
    ],
    rewards: { xp: 10, message: 'Bill split.' },
  },
  {
    id: 'l3_trip_payment', kind: 'main', priority: 145, name: 'Pay for the Trip', emoji: '💳',
    journalText: 'Museum trip: $12 at the school office before 3 PM Thursday.',
    storySetup: 'The school office has a queue.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [3], from: hm(8), until: hm(15) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_trip_told'),
    steps: [{
      id: 's1', place: 'university', waypoint: 'School office', speaker: 'School office',
      lines: ['Museum trip payment? $12, please.'],
      choices: [
        { id: 'pay', label: '💳 Pay $12', sublabel: "You're going", category: 'entertainment', cost: -12, minutes: 5, consequence: "You're on the list for Friday.", flags: ['wk_trip_paid'], finish: true },
        { id: 'skip', label: "😬 I'll stay at school", sublabel: 'Keep $12', cost: 0, minutes: 2, consequence: "You'll be in the library while everyone's at the museum.", flags: ['wk_trip_no'], finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Trip sorted.' },
    onExpire: { message: "You didn't pay for the museum trip in time.", flags: ['wk_trip_no'] },
  },
  {
    id: 'l3_museum_trip', kind: 'main', priority: 150, name: 'Museum Trip', emoji: '🦕',
    journalText: 'Friday: the class museum trip (if you paid).',
    storySetup: 'A bus is waiting outside school.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [4], from: hm(8, 15), until: hm(11) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_trip_paid'),
    steps: [{
      id: 's1', place: 'university', waypoint: 'School', speaker: 'Ms Patel', npcId: 'teacher',
      lines: ['Bus is here — everyone on!', '(Three hours later, at the museum gift shop…) Dinosaur keyring $8, postcards $2.'],
      choices: [
        { id: 'keyring', label: '🦖 Dinosaur keyring ($8)', sublabel: 'Souvenir', category: 'shopping', cost: -8, minutes: 210, energyCost: 8, social: true, effect: 'mark_attended', consequence: 'A great day — and a very cool keyring.', flags: ['wk_trip_went'], finish: true },
        { id: 'postcard', label: '🖼️ A postcard ($2)', sublabel: 'Small souvenir', category: 'shopping', cost: -2, minutes: 210, energyCost: 8, social: true, effect: 'mark_attended', consequence: 'A great day, and a postcard for your wall.', flags: ['wk_trip_went'], finish: true },
        { id: 'nothing', label: '👀 Just look', sublabel: 'Free', cost: 0, minutes: 210, energyCost: 8, social: true, effect: 'mark_attended', consequence: 'A great day. The memories were free.', lesson: 'Gift shops are placed at the exit for a reason.', flags: ['wk_trip_went'], finish: true },
      ],
    }],
    rewards: { xp: 25, message: 'Museum trip done!' },
  },
  {
    id: 'l3_tab_due', kind: 'main', priority: 135, name: 'Tab Day', emoji: '🥧',
    journalText: 'The tuck shop wants its $4.',
    storySetup: 'The tuck shop lady has a list.',
    destination: 'university', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [4], from: hm(11), until: hm(15, 25) },
    trigger: { type: 'time' },
    requires: s => hasFlag(s, 'wk_tab') && s.finance.debt.loans.some(l => l.id === 'tuck_tab'),
    steps: [{
      id: 's1', place: 'university', waypoint: 'Tuck shop', speaker: 'Tuck shop',
      lines: ["Friday! Your tab is $4."],
      choices: [
        { id: 'pay', label: '💵 Pay the $4', sublabel: 'All square', category: 'food', cost: -4, minutes: 2, effect: 'pay_tab', consequence: 'Paid. Clean slate.', flags: ['wk_tab_paid'], finish: true },
        { id: 'later', label: '😬 Next week?', sublabel: '+$1 late fee', cost: 0, minutes: 1, effect: 'tab_late_fee', consequence: '"Next week, then — plus a $1 late fee."', lesson: 'Paying late costs extra. That\'s how debt grows.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Tab settled (or not).' },
    onExpire: { message: "You dodged the tuck shop — your tab is still open." },
  },
  {
    id: 'l3_budget_checkin', kind: 'side', priority: 110, name: 'Budget Check-In', emoji: '📊',
    journalText: 'Friday check-in: how are your envelopes looking? (Bank app)',
    storySetup: 'The Budget app pings.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [4], from: hm(17, 30), until: hm(22) },
    trigger: { type: 'time' },
    requires: s => s.world.flags.some(f => f.startsWith('wk_budget:')),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Budget app', speaker: 'Budget app', remote: true,
      lines: ['Friday check-in! Open the Bank app to see every envelope.', 'Over on food? You can move $2 across from fun.'],
      choices: [
        { id: 'shift', label: '🔁 Move $2 from fun to food', sublabel: 'Adjust the plan', cost: 0, minutes: 2, effect: 'budget_shift_food', consequence: 'Plan adjusted. Less fun money, fewer surprises.', lesson: 'Budgets are allowed to change — as long as the total doesn\'t.', finish: true },
        { id: 'fine', label: '👍 Looks fine', sublabel: '', cost: 0, minutes: 1, consequence: 'You close the app. Confidently.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Budget checked.' },
  },
  {
    id: 'l3_trial_reminder', kind: 'side', priority: 100, name: 'Trial Ending', emoji: '⏰',
    journalText: 'Pixel Racer Premium starts charging $6.99 a week on Tuesday.',
    storySetup: 'A reminder you set? No — the game sent it. Rare.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [5], from: hm(10), until: hm(20) },
    trigger: { type: 'time' },
    requires: s => s.finance.expenses.recurring.some(r => r.id === 'game_premium'),
    steps: [{
      id: 's1', place: 'home', waypoint: 'Game', speaker: 'Pixel Racer', remote: true,
      lines: ['Your free trial ends soon. From Tuesday: $6.99 a week.', "That's $363 a year."],
      choices: [
        { id: 'cancel', label: '✂️ Cancel it', sublabel: 'Free till it ends', cost: 0, minutes: 2, effect: 'cancel_premium', consequence: 'Cancelled. You keep Premium till Tuesday, then it stops. For free.', flags: ['wk_trial_cancelled'], finish: true },
        { id: 'keep', label: '🏎️ Keep it', sublabel: '$6.99 every week', cost: 0, minutes: 0, consequence: "It'll quietly take $6.99 every Tuesday.", finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Subscription decided.' },
  },
  {
    id: 'l3_party_gift', kind: 'side', priority: 115, name: "Jordan's Present", emoji: '🎁',
    journalText: "Jordan's party is at 2 PM at the Park. Group gift ($4) or your own ($12)?",
    storySetup: 'Riley is organising.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [5], from: hm(8, 30), until: hm(13, 30) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
      lines: ["Jordan's party at the park, 2 PM! 🎉", "Group gift — $4 each for a speaker? Or get your own thing."],
      choices: [
        { id: 'group', label: '🎁 Chip in $4', sublabel: 'Group gift · Riley +1', category: 'gift', cost: -4, minutes: 1, relationship: 1, consequence: 'Your name on the card, $4 well spent.', lesson: 'Group gifts: a better present for less each.', finish: true },
        { id: 'own', label: '🛍️ My own gift ($12)', sublabel: 'Something special', category: 'gift', cost: -12, minutes: 40, consequence: 'You find him a cool cap.', finish: true },
        { id: 'card', label: '💌 Just a card', sublabel: 'Free', cost: 0, minutes: 15, consequence: 'A funny card. He\'ll love it.', finish: true },
      ],
    }],
    rewards: { xp: 5, message: 'Gift sorted.' },
  },
  {
    id: 'l3_jordan_party', kind: 'side', priority: 100, name: "Jordan's Party", emoji: '🎉',
    journalText: "Jordan's birthday party at the Park, from 2 PM.",
    storySetup: 'Balloons are tied to the park bench.',
    destination: 'park', paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [5], from: hm(14), until: hm(17) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'park', waypoint: 'Park', speaker: 'Jordan', npcId: 'jordan',
      lines: ['YOU CAME! 🎉', "Sausages are on Dad, games are on me."],
      choices: [
        { id: 'party', label: '🎉 Party! (2 hrs)', sublabel: 'Free food · Jordan +2', cost: 0, minutes: 120, energyCost: 6, energyRestore: 10, relationship: 2, social: true, consequence: 'Best party of the year. Free sausages.', finish: true },
        { id: 'early', label: '👋 Say happy birthday, head off', sublabel: 'Jordan +1', cost: 0, minutes: 20, relationship: 1, social: true, consequence: 'Quick hello, big hug, off you go.', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Party done!' },
  },
  {
    id: 'l3_market_job', kind: 'side', priority: 105, name: 'Market Stall Job', emoji: '🧺',
    journalText: "Riley's family needs help at their market stall: $10 for the morning.",
    storySetup: 'Riley texts early.',
    paths: SCHOOL, repeat: 'weekly', levels: [3],
    window: { days: [6], from: hm(8), until: hm(11) },
    trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'market', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
      lines: ["Mum's short-staffed at the stall — help till 12? She'll pay $10!"],
      choices: [
        { id: 'work', label: '🧺 Help out (+$10)', sublabel: '3 hours · 12 energy · Riley +1', category: 'income', cost: 10, minutes: 180, energyCost: 12, relationship: 1, consequence: 'You sell 40 dumplings and earn $10.', finish: true },
        { id: 'no', label: '😴 Sunday sleep-in', sublabel: '+10 energy', cost: 0, minutes: 0, energyRestore: 10, consequence: 'Riley: "no stress!"', finish: true },
      ],
    }],
    rewards: { xp: 10, message: 'Sunday sorted.' },
  },
];

/** Level 3+ side tasks. */
export const SCHOOL_L3_POOL: MissionDef[] = [
  {
    id: 'l3p_snack', pool: 'after_school', kind: 'side', priority: 34, name: 'Just a Snack', emoji: '🥔',
    journalText: 'Chips from the Dairy: $2.50.',
    storySetup: 'The Dairy is right there.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: WK, from: hm(15, 35), until: hm(18) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'You', remote: true,
      lines: ["You walk past the Dairy. Chips are $2.50.", "It's only $2.50…"],
      choices: [
        { id: 'buy', label: '🥔 Chips ($2.50)', sublabel: '+4 energy', category: 'food', cost: -2.5, minutes: 5, energyRestore: 4, consequence: 'Salty and gone.', lesson: '"Only $2.50" five times is $12.50 — a whole envelope.', flags: ['wk_impulse'], finish: true },
        { id: 'no', label: '🚶 Keep walking', sublabel: '', cost: 0, minutes: 0, consequence: 'Your budget thanks you.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Snack decision.' },
  },
  {
    id: 'l3p_bogof', pool: 'after_school', kind: 'side', priority: 33, name: 'Buy One Get One', emoji: '🥫',
    journalText: 'Energy drinks: buy one get one free, $4.',
    storySetup: 'A bright sign at the Dairy.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: WK, from: hm(15, 35), until: hm(18) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'Dairy', remote: true,
      lines: ['BUY ONE GET ONE FREE ⚡ Energy drinks, 2 for $4!'],
      choices: [
        { id: 'buy', label: '🥫 Two for $4', sublabel: '+6 energy · a sugar crash later', category: 'food', cost: -4, minutes: 2, energyRestore: 6, energyCost: 3, consequence: 'Buzzing. Then not.', lesson: "A deal is only a deal if you wanted the thing in the first place.", flags: ['wk_impulse'], finish: true },
        { id: 'no', label: '🙅 Not for me', sublabel: '', cost: 0, minutes: 0, consequence: 'You keep your $4 and your heart rate.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Deal dodged (or not).' },
  },
  {
    id: 'l3p_group_order', pool: 'evening', kind: 'side', priority: 33, name: 'Group Order', emoji: '🧋',
    journalText: 'Riley is doing a bubble tea delivery group order: $9 each with fees.',
    storySetup: 'The group chat is ordering.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: WK, from: hm(18, 30), until: hm(21) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Group chat', speaker: 'Riley', npcId: 'riley', remote: true,
      lines: ['bubble tea group order 🧋 $6 each + $3 delivery & fees. in?'],
      choices: [
        { id: 'in', label: "🧋 I'm in ($9)", sublabel: '$3 is just fees', category: 'food', cost: -9, minutes: 30, energyRestore: 5, social: true, consequence: 'Arrives in 40 minutes, slightly melted.', lesson: 'Delivery fees can be half the price of the drink.', finish: true },
        { id: 'out', label: '🙅 Sitting this one out', sublabel: '', cost: 0, minutes: 0, consequence: 'Riley: "next time!"', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Order answered.' },
  },
  {
    id: 'l3p_cousin_phone', pool: 'evening', kind: 'side', priority: 34, name: "Cousin's Old Phone", emoji: '📱',
    journalText: 'Cousin Mere is selling her old phone: $60, or $10 a week.',
    storySetup: 'Mere messages.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: [1, 2, 3], from: hm(18, 30), until: hm(21) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Mere', speaker: 'Mere', remote: true,
      lines: ["Selling my old phone — way better than yours! $60.", "Can't afford it? Pay me $10 a week, I don't mind."],
      choices: [
        { id: 'weekly', label: '📱 $10 now, $10 a week', sublabel: '$50 still owed to Mere', category: 'shopping', cost: -10, minutes: 5, effect: 'cousin_loan', consequence: "New phone! And six weeks of $10 payments.", lesson: 'Paying in instalments is still borrowing — six weeks of your fun money, gone.', flags: ['wk_impulse'], finish: true },
        { id: 'no', label: '🙅 My phone works fine', sublabel: '', cost: 0, minutes: 0, consequence: 'Mere: "your loss!"', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Phone deal decided.' },
  },
  {
    id: 'l3p_breakfast', pool: 'morning', kind: 'side', priority: 39, name: 'Bakery Breakfast', emoji: '🥐',
    journalText: 'Riley is getting a $4.50 bakery breakfast before school.',
    storySetup: 'Riley texts.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: WK, from: hm(7), until: hm(8, 10) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Reply to Riley', speaker: 'Riley', npcId: 'riley', remote: true,
      lines: ['bakery before school? 🥐 $4.50 for a pastry and a juice'],
      choices: [
        { id: 'yes', label: '🥐 Meet her ($4.50)', sublabel: '+8 energy · Riley +1', category: 'food', cost: -4.5, minutes: 15, energyRestore: 8, relationship: 1, social: true, consequence: 'Flaky, buttery, $4.50.', finish: true },
        { id: 'cereal', label: '🥣 Cereal at home', sublabel: 'Free · +6 energy', cost: 0, minutes: 10, energyRestore: 6, consequence: 'Cereal. Reliable. Free.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Breakfast sorted.' },
  },
  {
    id: 'l3p_mufti', pool: 'morning', kind: 'side', priority: 38, name: 'Mufti Day', emoji: '👕',
    journalText: 'Mufti day: wear your own clothes for a $2 gold coin donation.',
    storySetup: 'A school notice.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: [1, 2, 3, 4], from: hm(7), until: hm(8, 10) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'School notice', speaker: 'School', remote: true,
      lines: ['MUFTI DAY! Wear your own clothes for a gold coin donation to the food bank.'],
      choices: [
        { id: 'donate', label: '🪙 Mufti ($2)', sublabel: 'For the food bank', category: 'gift', cost: -2, minutes: 5, consequence: 'Comfy clothes, good cause.', lesson: 'Giving can be part of a budget too.', finish: true },
        { id: 'uniform', label: '👔 Uniform', sublabel: 'Free', cost: 0, minutes: 0, consequence: 'You and three others in uniform. Solidarity.', finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Outfit chosen.' },
  },
  {
    id: 'l3p_haircut', pool: 'weekend', kind: 'side', priority: 35, name: 'Haircut', emoji: '💇',
    journalText: 'You need a haircut: barber $25, student barber $12, or Mum ($0, risky).',
    storySetup: 'Your fringe is in your eyes.', paths: SCHOOL, repeat: 'daily', levels: fromLevel(3),
    window: { days: WEEKEND, from: hm(9), until: hm(13) }, trigger: { type: 'time' },
    steps: [{
      id: 's1', place: 'home', waypoint: 'Decide', speaker: 'Mum', npcId: 'mum', remote: true,
      lines: ["You need a haircut! The barber is $25, the training school does them for $12…", "…or I could do it. For free. How hard can it be?"],
      choices: [
        { id: 'barber', label: '💈 Barber ($25)', sublabel: 'Guaranteed good', category: 'shopping', cost: -25, minutes: 45, consequence: 'Sharp. Expensive, but sharp.', finish: true },
        { id: 'student', label: '✂️ Student barber ($12)', sublabel: 'Supervised', category: 'shopping', cost: -12, minutes: 60, consequence: 'Honestly great. Half the price.', lesson: 'Training schools: good work for less, if you have time.', finish: true },
        { id: 'mum', label: '😬 Mum does it', sublabel: 'Free · Mum +1', cost: 0, minutes: 30, relationship: 1, consequence: "It's… fine. It'll grow back.", finish: true },
      ],
    }],
    rewards: { xp: 3, message: 'Haircut sorted.' },
  },
];
