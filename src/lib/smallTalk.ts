/**
 * MoniMate — small talk. What people say when they have nothing mission-related to say: lines that
 * fit the day, the time, your money and your goal; a line about what YOU did today if there's
 * something to say; and never the same line twice in a day (spoken lines are remembered as daily
 * marks, so a reload doesn't reset them). When someone has run out of new things to say, they sign
 * off — differently each time.
 */
import { parts } from './clock';
import type { GameStore } from './store';

/** Small talk when an NPC has nothing mission-related to say. Lines depend on the day, the time,
 *  your money, your goal and how things stand with them — so chatting never feels canned. */
export function idlePoolFor(npcId: string, store: GameStore): string[] {
  const s = store.state, p = parts(s.minutes), cash = store.cash;
  const flags = s.world.flags, rel = s.world.relationships;
  const goal = store.weekGoalId();
  const morning = p.hour < 12, evening = p.hour >= 17, weekend = p.dayOfWeek >= 5;
  const lines: string[] = [];
  const add = (cond: boolean, ...l: string[]) => { if (cond) lines.push(...l); };
  switch (npcId) {
    case 'mum':
      add(morning && !weekend, 'Have a good day, love. Got everything?', "Don't forget — lunch doesn't buy itself.");
      add(evening, 'How was school?', "Dinner's at seven.");
      add(cash < 3, "Running low? There's paid work on the jobs board.", 'Money tight this week? Happens to everyone.');
      add(cash > 15, "Look at you, still with money left. I'm impressed.");
      add(goal === 'save_event', "How's the fair fund going?");
      add(goal === 'buy_headphones', 'Those headphones… are they worth a whole week of lunches?');
      add(s.finance.accounts.savings > 0, `$${s.finance.accounts.savings.toFixed(0)} in the piggy bank? That's my kid.`);
      add(weekend, 'No school today — enjoy it.');
      add(true, "Love you, kiddo.", 'Let me know if you need to talk about money — no judgment.');
      add(s.player.place === 'home' && store.homeJobs().some(j => j.status === 'open'), "The jobs board on the fridge has a few new ones today, if you want to earn a bit.");
      break;
    case 'jordan':
      add(p.dayOfWeek === 3, 'Arcade later?? You in?');
      add(p.dayOfWeek === 4, 'Weekend plans? The fair is Saturday!');
      add(weekend, "Fair's actually good this year.");
      add(cash < 3, "Broke too? Same. Payday can't come fast enough.");
      add((rel.Jordan ?? 0) <= 0, '…hey.', 'Oh. Hi.');
      add((rel.Jordan ?? 0) >= 4, "You're a legend, you know that?");
      add(flags.includes('shared_game'), 'Pixel Racer is SO good. Your turn Saturday!');
      add(true, "I'm saving up for new headphones — slow going.", 'You seen Riley today?');
      break;
    case 'riley':
      add(p.dayOfWeek <= 3 && !flags.includes('birthday_resolved'), "My birthday's this week 👀", "You're still coming to my birthday thing?");
      add(flags.includes('birthday_contributed'), 'Thanks again for chipping in for my birthday!');
      add(flags.includes('birthday_declined'), 'Oh. Hi.');
      add(goal === 'save_event', "Are you coming to the fair? I've saved $6 so far.");
      add(weekend, 'The market has the best dumplings.');
      add(true, "School's been a lot lately, honestly.", 'Have you done the maths homework?');
      break;
    case 'teacher':
      add(!weekend && !store.hasDoneToday('at_school') && p.hour < 12, "Class is starting — find a seat.");
      add(!weekend && store.hasDoneToday('at_school'), 'Good work today.');
      add(!flags.includes('school_project_done') && p.dayOfWeek <= 2, 'Have you got your project supplies yet?');
      add(weekend, 'Enjoying the fair? The raffle draws at one.');
      add(true, 'Let me know if you are stuck on anything.');
      break;
    // ── University cast ──
    case 'sam':
      add(morning && !weekend, "Lecture at 10? I'm going back to sleep.", 'Did you take my milk? …Fine, it was old anyway.');
      add(evening, "What's for dinner? Please say it's not noodles again.", 'Flat meeting on Sunday about the dishes 😤');
      add(flags.includes('wk_rent_late') || flags.includes('wk_rent_owed'), 'So… about that rent.', "Not to be weird, but I'm still out of pocket for your rent.");
      add(flags.includes('wk_rent_paid'), 'Cheers for paying rent on time. Honestly rare.');
      add(flags.includes('wk_sky_yes'), 'Sky Sport was the best decision this flat has ever made 🏉');
      add(flags.includes('wk_power_owed'), "Power's still $45 short, just saying.");
      add(cash < 30, "Broke? The Psych department pays $20 for studies. Easy money.");
      add(weekend, "Raglan's the best. Or the park. Anywhere but here.");
      add(true, 'Flatting is just paying bills with friends.', "I'm cooking pasta again. It's always pasta.");
      break;
    case 'mei':
      add(!weekend && p.hour < 12, "Did you do the reading? I did the reading. Twice.");
      add(!flags.includes('wk_textbook_told') && p.dayOfWeek <= 1, 'Dr Hughes talks about the textbook after the first lecture — stay till the end!');
      add(flags.includes('wk_club_joined'), 'See you at the club this week!');
      add(flags.includes('wk_textbook_used'), "Second-hand textbook? Smart. I paid full price like a fool.");
      add((rel.Mei ?? 0) >= 3, "Honestly, you're the best part of ECON101.");
      add(weekend, 'The market has the best dumplings. Trust me.');
      add(true, 'Supply and demand is just vibes with graphs.', 'The library is open till 8 if you need a quiet spot.');
      break;
    case 'lecturer':
      add(!weekend && !store.hasDoneToday('at_school') && p.hour < 11, 'Lecture starts at ten — the Lecture Theatre, first door on the left.');
      add(!flags.includes('wk_quiz_done') && p.dayOfWeek === 4, "Don't forget, Quiz 1 closes at midnight.");
      add(true, 'Economics is really about choices: what you give up to get what you want.', 'Office hours are Thursdays. Nobody ever comes.');
      break;
    case 'leah':
      add(flags.includes('wk_job_offer'), "Good to have you on the team! Rosters go out Sunday.");
      add(flags.includes('wk_trial_offered') && !flags.includes('wk_job_offer'), 'See you Friday at 1 for your trial!');
      add(flags.includes('wk_applied') && !flags.includes('wk_trial_offered'), 'Interviews are Wednesday afternoon — come by between 1 and 4:30.');
      add(true, 'Flat white? $5.50. Staff get them free, just saying.', 'Busiest café near campus. We are always hiring.');
      break;
    case 'shopkeeper':
      add(p.dayOfWeek === 3, 'Delivery day. My back is already sore.');
      add(flags.includes('dairy_shift_done'), 'Best shelf-stocker I have had!');
      add(true, 'Fresh bread came in this morning.', "Let me know if you can't find something.");
      break;
  }
  return lines.length ? lines : ['Hey.'];
}

/** Lines that react to what you actually did today — your money decisions, jobs, spending. */
export function reactiveLinesFor(npcId: string, store: GameStore): string[] {
  const t = store.state.today, ds = t.decisions ?? [];
  const lastBad = [...ds].reverse().find(d => d.verdict === 'bad');
  const lastGood = [...ds].reverse().find(d => d.verdict === 'good' && !d.key.startsWith('job:'));
  const job = [...ds].reverse().find(d => d.key.startsWith('job:'));
  const what = (c: string) => c.replace(/^\P{L}+/u, '').replace(/\s*\(.*\)$/, '').toLowerCase();
  const out: string[] = [];
  switch (npcId) {
    case 'mum':
      if (job) out.push(`Thanks for doing the ${what(job.choice)}, love. It really helps.`);
      if (lastBad) out.push(`The bank app pinged — "${what(lastBad.choice)}"? Was it worth it?`);
      if (lastGood) out.push(`I heard about "${what(lastGood.choice)}". That's a sensible choice.`);
      if (t.earned >= 5) out.push(`$${t.earned.toFixed(0)} earned today? Look at you go.`);
      break;
    case 'jordan':
      if (t.spent >= 10) out.push(`$${t.spent.toFixed(0)} spent already today? You're worse than me 😂`);
      if (lastBad) out.push(`Okay "${what(lastBad.choice)}" was a bit of a splurge, not gonna lie.`);
      if (lastGood) out.push('You and your sensible choices… teach me your ways.');
      break;
    case 'riley':
      if (lastGood) out.push(`Saw you went with "${what(lastGood.choice)}" — honestly, smart.`);
      if (lastBad) out.push("Didn't you say you were saving? 👀");
      if (t.earned >= 5) out.push('You made money today? Respect.');
      break;
    case 'sam': case 'mei':
      if (lastBad) out.push(`"${what(lastBad.choice)}"? Bold move on a student budget.`);
      if (lastGood) out.push("You're actually good at this adulting thing.");
      break;
    case 'shopkeeper':
      if (t.spent === 0) out.push("Haven't spent a cent today? My till is crying.");
      break;
  }
  return out;
}

/** What someone says when you've already had today's chat — never the same one twice. */
const SIGN_OFFS: Record<string, string[]> = {
  mum: ["Back again? I'm right here if you need me, love.", "We'll catch up properly at dinner.", 'Go on, enjoy your day.'],
  default: ["We've caught up already — see you tomorrow!", 'Twice in one day? Can\'t get enough of me, huh.', 'Still here? Go enjoy your day!', 'Busy day — catch you later.'],
};

/** Small hash so a spoken line can be remembered for the day without storing the whole text. */
function lineKey(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** A short chat that never repeats within a day. It opens with something about YOUR day if there's
 *  anything to say (a smart move, a splurge, a job done), then two or so lines nobody has said to you
 *  yet today. Once someone has run out of new things to say, they sign off — differently each time. */
export function chatLinesFor(npcId: string, store: GameStore): string[] {
  const fresh = (l: string) => !store.hasDoneToday(`said:${npcId}:${lineKey(l)}`);
  const reactive = reactiveLinesFor(npcId, store).filter(fresh);
  const pool = [...new Set(idlePoolFor(npcId, store))].filter(l => fresh(l) && !reactive.includes(l));
  const lines: string[] = reactive.slice(0, 1);
  const want = Math.min(pool.length, Math.max(1, (pool.length >= 4 ? 3 : 2) - lines.length));
  const picked = new Set<number>();
  while (picked.size < want) picked.add(Math.floor(Math.random() * pool.length));
  lines.push(...[...picked].sort((a, b) => a - b).map(i => pool[i]));
  if (!lines.length) {
    const offs = (SIGN_OFFS[npcId] ?? SIGN_OFFS.default).filter(fresh);
    lines.push(offs[0] ?? '👋');
  }
  for (const l of lines) store.markDoneToday(`said:${npcId}:${lineKey(l)}`);
  return lines;
}


// ── Replying ────────────────────────────────────────────────────────────────────────────────────
// When someone asks you something, you get to answer — small talk is a conversation, not a
// monologue. Each question has two or three replies; each reply gets its own response (and the odd
// small nudge to how that person feels about you). Questions without a table entry stay rhetorical.

export interface ChatReply {
  /** What you say. */
  label: string;
  /** What they say back. */
  response: string;
  /** Small change in how they feel about you (-1…+1). */
  rel?: number;
}

const REPLIES: Record<string, ChatReply[]> = {
  // Mum
  'Have a good day, love. Got everything?': [
    { label: 'Yep — lunch, bus money, the lot.', response: 'Look at you, organised! Off you go.', rel: 1 },
    { label: 'Uh… I think so?', response: "Check your bag before the bus — buying lunch you forgot costs more than packing it." },
  ],
  'How was school?': [
    { label: 'Pretty good actually!', response: "Love to hear it. Tell me about it over dinner.", rel: 1 },
    { label: 'Long. Really long.', response: 'Those days happen. Put your feet up for a bit.' },
    { label: 'We talked about money stuff.', response: 'Ooh, tell me! Half of what I know about money I learned the hard way.', rel: 1 },
  ],
  "Running low? There's paid work on the jobs board.": [
    { label: "I'll take a look.", response: 'Good. Check which job pays best per hour, not just the biggest number.' },
    { label: "I'm fine for now.", response: "Okay — just don't wait until you're at $0 to plan." },
  ],
  'Money tight this week? Happens to everyone.': [
    { label: 'Yeah, a bit.', response: 'Write down where it went this week. Knowing is the first step to fixing it.' },
    { label: "Nah, I've got a plan.", response: "That's my kid. A plan beats luck every time.", rel: 1 },
  ],
  "How's the fair fund going?": [
    { label: 'Getting there!', response: 'Little bits each day add up. Keep going.', rel: 1 },
    { label: "Honestly… it's not.", response: 'Try putting a bit aside first thing, before you can spend it. Pay yourself first.' },
  ],
  'Those headphones… are they worth a whole week of lunches?': [
    { label: "Yes — I'll use them every day.", response: "Fair. If you'll use something a lot, it's worth more to you. Just be sure." },
    { label: "Hmm. Maybe not.", response: 'Sleep on it. If you still want them next week, that tells you something.' },
  ],
  // Jordan
  'Arcade later?? You in?': [
    { label: "I'm in!", response: "Yes!! Bring coins, the claw machine's calling.", rel: 1 },
    { label: "Can't — saving this week.", response: "Respect. I should probably do that too… probably won't 😂" },
  ],
  'Weekend plans? The fair is Saturday!': [
    { label: 'Going to the fair for sure.', response: "Same! Let's meet at the gate.", rel: 1 },
    { label: 'Depends what I can afford.', response: 'Smart. Entry is cheap, it is the rides and snacks that get you.' },
  ],
  "Broke too? Same. Payday can't come fast enough.": [
    { label: 'Same. Lesson learned.', response: 'Next week we budget. For real this time.' },
    { label: "Nah, I'm okay actually.", response: "Wait, how?? Teach me your ways." },
  ],
  'You seen Riley today?': [
    { label: 'Yeah, earlier.', response: 'Cool — tell them I said hi.' },
    { label: 'Not yet.', response: 'Probably at the library. Riley lives there.' },
  ],
  // Riley
  "You're still coming to my birthday thing?": [
    { label: "Wouldn't miss it!", response: "Yay! It's going to be fun.", rel: 1 },
    { label: "I'll try — money's tight.", response: "That's okay. Honestly, just come — you don't have to bring anything big." },
  ],
  "Are you coming to the fair? I've saved $6 so far.": [
    { label: "Yep, I'm saving too.", response: "Let's both hit our goal! Race you 😄", rel: 1 },
    { label: 'Not sure yet.', response: 'Even $1 a day gets you there by Saturday.' },
  ],
  'Have you done the maths homework?': [
    { label: 'Done it already.', response: 'Of course you have. Can I see question 4?', rel: 1 },
    { label: "Haven't started 😬", response: 'Same. Library after school?' },
  ],
  "Didn't you say you were saving? 👀": [
    { label: 'Yeah… that was a slip.', response: "We all do it. Just don't make it a habit." },
    { label: 'It was worth it, trust me.', response: "If it was planned, fair enough. If not… 👀" },
  ],
  // Teacher
  'Have you got your project supplies yet?': [
    { label: 'Getting them today.', response: 'Good. Compare prices — the dairy and the supermarket differ more than you think.' },
    { label: 'Not yet, sorry.', response: 'Due Thursday — leave yourself time to shop around.' },
  ],
  'Enjoying the fair? The raffle draws at one.': [
    { label: "It's great!", response: 'Glad to hear it. Enjoy your weekend.' },
    { label: 'Is the raffle worth it?', response: 'A raffle is a donation with a tiny prize chance. Buy a ticket for the cause, not the odds.' },
  ],
  // Sam
  "Lecture at 10? I'm going back to sleep.": [
    { label: "Come on, it's paid for!", response: "Ugh. You're right. That's like $40 a lecture in fees…", rel: 1 },
    { label: 'Same, honestly.', response: 'Kindred spirits. See you at lunch.' },
  ],
  'Did you take my milk? …Fine, it was old anyway.': [
    { label: "Sorry — I'll replace it.", response: 'Legend. Shared groceries only work if everyone pays in.', rel: 1 },
    { label: 'Not me!', response: 'Then the flat has a milk thief. Great.' },
  ],
  "What's for dinner? Please say it's not noodles again.": [
    { label: "Let's cook together.", response: 'Split the cost of a proper meal? Deal. Cheaper per person than takeaways.', rel: 1 },
    { label: "Noodles. It's always noodles.", response: 'The student diet. Our wallets thank us, our bodies do not.' },
  ],
  'So… about that rent.': [
    { label: "I'll sort it today.", response: 'Thanks. Late rent hurts the whole flat — and your reference for the next place.', rel: 1 },
    { label: 'Can you give me a few days?', response: "A few days. Any longer and I'm short on my own bills." },
  ],
  'Broke? The Psych department pays $20 for studies. Easy money.': [
    { label: "Ooh, I'll look into it.", response: 'Easiest $20 I ever made. Took half an hour.' },
    { label: "I'm alright for now.", response: 'Fair. Good to know it exists though.' },
  ],
  // Mei
  'Did you do the reading? I did the reading. Twice.': [
    { label: 'Yep, all of it.', response: 'Finally, someone to talk about opportunity cost with!', rel: 1 },
    { label: 'Skimmed it…', response: "Chapter 2's the important bit — what you give up is the real price." },
  ],
};

/** Mum reacting to a splurge she saw on the bank app ("…Was it worth it?"). */
const REACTIVE_REPLIES: [prefix: string, replies: ChatReply[]][] = [
  ['The bank app pinged', [
    { label: 'Honestly? Probably not.', response: "That's the lesson, love. Next time wait a day before you buy.", rel: 1 },
    { label: 'Yeah, it was worth it.', response: 'If you thought it through, fine. Just make sure it fits your plan.' },
  ]],
];

/** The replies you can give to this line, if it is a real question someone asked you. */
export function repliesFor(line: string): ChatReply[] | null {
  if (REPLIES[line]) return REPLIES[line];
  for (const [prefix, r] of REACTIVE_REPLIES) if (line.startsWith(prefix)) return r;
  return null;
}

/** Split a chat at its first question you can answer: the lines up to and including it, the replies,
 *  and whatever they were going to say after. No question → every line, no replies. */
export function splitAtQuestion(lines: string[]): { lines: string[]; replies: ChatReply[] | null; rest: string[] } {
  for (let i = 0; i < lines.length; i++) {
    const r = repliesFor(lines[i]);
    if (r) return { lines: lines.slice(0, i + 1), replies: r, rest: lines.slice(i + 1) };
  }
  return { lines, replies: null, rest: [] };
}
