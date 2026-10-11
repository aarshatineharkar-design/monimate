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

