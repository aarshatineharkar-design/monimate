/**
 * MoniMate — the family jobs board on the fridge (School path).
 *
 * Instead of Mum asking the same "help with the housework?" every morning, home has a jobs board:
 * each day it lists three different paid jobs, each with its own pay, time, effort and hours. The
 * player decides if and when to do one — like picking up shifts — and sees the hourly rate, so
 * "is this worth my time?" becomes a real comparison. Doing three different jobs in a week earns a
 * reliability bonus from Mum: employers pay more for people they can count on.
 */
import { hm } from '../clock';

export interface HomeJob {
  id: string;
  name: string;
  emoji: string;
  /** Game minutes it takes. */
  minutes: number;
  energy: number;
  /** What Mum pays (0 for jobs that pay off another way). */
  pay: number;
  /** What it is, in a line. */
  blurb: string;
  /** What Mum says when she mentions it. */
  pitch: string;
  /** The money lesson on the decision card. */
  lesson: string;
  /** Needs Mum at home (cooking together, sorting receipts). */
  needsMum?: boolean;
  /** Only between these minutes of the day. */
  from?: number;
  until?: number;
  /** Only on these days (0 = Monday). */
  days?: number[];
  /** Perks besides money. */
  energyRestore?: number;
  mumBonus?: number;
}

export const WEEKEND = [5, 6];
export const WEEKDAYS = [0, 1, 2, 3, 4];

export const HOME_JOBS: HomeJob[] = [
  {
    id: 'laundry', name: 'Fold the laundry', emoji: '🧺', minutes: 20, energy: 4, pay: 2,
    blurb: 'A mountain of clean washing on the couch.',
    pitch: "The washing's dry — $2 if you fold it. It's on the jobs board.",
    lesson: '$2 for 20 minutes is $6 an hour. Small jobs pay small — but they still pay.',
  },
  {
    id: 'dishes', name: 'Do the dinner dishes', emoji: '🍽️', minutes: 25, energy: 4, pay: 2.5,
    blurb: 'Pots, pans and a lasagne dish that needs a soak.', from: hm(18), until: hm(21, 30),
    pitch: "Dishes tonight? $2.50 on the jobs board if you're keen.",
    lesson: 'Evening jobs fit around school — finding time you would otherwise waste is how side income starts.',
  },
  {
    id: 'car', name: "Wash Mum's car", emoji: '🚗', minutes: 45, energy: 9, pay: 6,
    blurb: 'Bucket, sponge, hose. The car is genuinely filthy.', from: hm(8), until: hm(18, 30),
    pitch: "The car's filthy. $6 on the jobs board if you wash it 🚗",
    lesson: '$6 for 45 minutes is $8 an hour — the best rate on the board today. Compare pay per hour, not just pay.',
  },
  {
    id: 'weeds', name: 'Weed the vege garden', emoji: '🌿', minutes: 40, energy: 10, pay: 5,
    blurb: 'The tomatoes are losing to the weeds.', from: hm(8), until: hm(19),
    pitch: "The garden's a jungle — $5 for weeding, it's on the board.",
    lesson: 'Harder work usually pays more — but check the hourly rate: $5 for 40 minutes is $7.50 an hour.',
  },
  {
    id: 'recycling', name: 'Sort the recycling', emoji: '♻️', minutes: 15, energy: 3, pay: 1.5,
    blurb: 'Glass, plastics, paper — and one mystery item.',
    pitch: '$1.50 to sort the recycling. Quick one!',
    lesson: 'Quick jobs add up: three 15-minute jobs a week is $4.50 you did not have.',
  },
  {
    id: 'vacuum', name: 'Vacuum the lounge', emoji: '🧹', minutes: 30, energy: 6, pay: 3.5,
    blurb: 'Crumbs. Everywhere. Who eats crackers on a couch?',
    pitch: 'Lounge needs a vacuum — $3.50 on the jobs board.',
    lesson: '$3.50 for half an hour is $7 an hour. Would you pay $7 to skip an hour of chores? That is the real question.',
  },
  {
    id: 'cook', name: 'Cook dinner with Mum', emoji: '🍝', minutes: 45, energy: 5, pay: 0,
    blurb: 'Spaghetti bolognese for the two of you. No pay — but a full stomach.',
    from: hm(17, 30), until: hm(19, 30), needsMum: true, energyRestore: 15, mumBonus: 1,
    pitch: "I'm making spag bol tonight — come cook with me?",
    lesson: 'Dinner for two cost about $9 to cook. The same from a takeaway is about $30 — learning to cook saves money every week.',
  },
  {
    id: 'windows', name: 'Clean the windows', emoji: '🪟', minutes: 35, energy: 7, pay: 4,
    blurb: 'Streak-free is harder than it sounds.', from: hm(8), until: hm(18),
    pitch: 'Windows need a clean — $4 on the jobs board.',
    lesson: 'Doing a job well is what gets you asked back — and the next job is how income grows.',
  },
  {
    id: 'groceries', name: 'Unpack the groceries', emoji: '🛒', minutes: 10, energy: 2, pay: 1,
    blurb: 'Wednesday shop is in. Fridge Tetris time.', days: [2], from: hm(17, 45), until: hm(21),
    pitch: 'Shopping is in — $1 to unpack it all.',
    lesson: 'Look at the receipt while you unpack: knowing what food really costs is half of budgeting.',
  },
  {
    id: 'receipts', name: 'Sort receipts with Mum', emoji: '🧾', minutes: 20, energy: 3, pay: 2,
    blurb: "Mum's tracking the week's spending. You read, she types.", from: hm(17, 30), until: hm(21), needsMum: true, mumBonus: 1,
    pitch: 'Help me with the receipts tonight? $2 and I will show you where our money goes.',
    lesson: 'Tracking spending is how families find money they did not know they were wasting.',
  },
  {
    id: 'garage', name: 'Clear out the garage', emoji: '📦', minutes: 90, energy: 15, pay: 10, days: WEEKEND, from: hm(9), until: hm(17),
    blurb: 'A whole Saturday job. Boxes, bikes and a broken lamp.',
    pitch: "Big job: the garage. $10 if you sort it today — it's on the board.",
    lesson: 'Big jobs pay more in total — but $10 for 90 minutes is under $7 an hour. Bigger is not always better per hour.',
  },
  {
    id: 'lawn', name: 'Mow the back lawn', emoji: '🌱', minutes: 50, energy: 12, pay: 6, days: WEEKEND, from: hm(9), until: hm(18),
    blurb: 'The grass is officially ankle-deep.',
    pitch: 'Back lawn needs a mow — $6 on the board.',
    lesson: 'Neighbours pay for this too. A skill you already have at home can become a little business.',
  },
];

/** The weekly reliability bonus: three different jobs in a week. */
export const JOB_BONUS = { distinctJobs: 3, amount: 3 };
