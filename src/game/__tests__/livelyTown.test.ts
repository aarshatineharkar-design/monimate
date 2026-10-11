/**
 * MoniMate — polish pass 2: side tasks arrive one at a time; the person who asked is actually
 * there when you arrive (Mrs Kaur and Biscuit at the park, the librarian at her desk, Jordan at the
 * Mall); walking Biscuit and picking up litter are things you DO; and home has a jobs board instead
 * of the same "help with the housework?" every morning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at, parts } from '../../lib/clock';
import { DOG_WALK_ROUTE, ERRAND_HOSTS, LITTER_SPOTS, TILE_PX, INTERIOR_TILE_PX, doorTile, tileToPx } from '../../lib/world';
import { HOME_JOBS } from '../../lib/content/homeJobs';
import { chatLinesFor } from '../../lib/smallTalk';

const SCHOOL = getLifePath('school');
function game(seed = 7): GameStore {
  const st = createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL));
  st.world.flags = st.world.flags.filter(f => !f.startsWith('seed:'));
  st.world.flags.push(`seed:${seed}`);
  const store = new GameStore(st);
  store.state.finance.accounts.cash = 20;
  return store;
}
/** Today's side tasks are exactly these, in this order. */
function menu(store: GameStore, ...ids: string[]) {
  const day = parts(store.state.minutes).day;
  store.state.world.dailyMarks = store.state.world.dailyMarks.filter(m => !(m.startsWith('pool:') && m.endsWith(`:${day}`)));
  for (const rt of store.state.missions) if (store.def(rt.id)?.pool && rt.state !== 'locked') rt.state = 'expired';
  for (const id of ids) store.state.world.dailyMarks.push(`pool:${id}:${day}`);
}
function choose(store: GameStore, missionId: string, choiceId: string) {
  const def = store.def(missionId)!, rt = store.runtime(missionId)!;
  const c = store.stepFor(def, rt)!.choices!.find(x => x.id === choiceId)!;
  assert.ok(c, `${missionId} has no choice ${choiceId} on step ${rt.stepIndex}`);
  assert.equal(store.applyChoice(missionId, c), true, `${missionId}/${choiceId} refused`);
}
/** Stand in the park at a tile. */
function inParkAt(store: GameStore, x: number, y: number) {
  const s = store.state;
  if (s.player.scene !== 'outdoor') store.exitPlace();
  s.player.x = x * TILE_PX; s.player.y = y * TILE_PX;
  store.setOutdoorZone('park');
}

// ── One at a time ────────────────────────────────────────────────────────────────────────────────

test('Side tasks: two rolled after-school tasks arrive one at a time, not together', () => {
  const store = game();
  menu(store, 'library_fine', 'tutoring');
  store.advance(at(0, 15, 41) - store.state.minutes);
  assert.equal(store.runtime('library_fine')!.state, 'available', 'the first arrives when school is out');
  assert.equal(store.runtime('tutoring')!.state, 'locked', 'the second waits its turn');
  choose(store, 'library_fine', 'pay');                       // dealt with
  store.advance(5);
  assert.equal(store.runtime('tutoring')!.state, 'locked', 'not straight away — it is not its time yet');
  store.advance(at(0, 16, 51) - store.state.minutes);         // 70 minutes after the first one
  assert.equal(store.runtime('tutoring')!.state, 'available');
});

test('Side tasks: an accepted errand holds the next one back until it is done', () => {
  const store = game();
  menu(store, 'dog_walk', 'library_fine');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'dog_walk', 'accept');
  store.advance(at(0, 17, 0) - store.state.minutes);
  assert.equal(store.runtime('library_fine')!.state, 'locked', 'still walking the dog (well, should be)');
});

test('Side tasks: never more than one waiting at once, all week', () => {
  const store = game(11);
  for (let m = store.state.minutes; m < at(6, 22, 0); m += 10) {
    store.advance(10);
    const open = store.state.missions.filter(rt => store.def(rt.id)?.pool && (rt.state === 'available' || rt.state === 'active'));
    assert.ok(open.length <= 1, `at ${m}: ${open.map(o => o.id).join(', ')}`);
    // answer anything that arrived, so the next can come
    for (const rt of open) {
      const def = store.def(rt.id)!, step = store.stepFor(def, rt);
      const c = step?.choices?.find(x => x.finish && x.cost >= 0) ?? step?.choices?.find(x => x.finish);
      if (step?.remote && c) store.applyChoice(rt.id, c);
      else { rt.state = 'expired'; rt.finishedAt = store.state.minutes; }
    }
    if (parts(store.state.minutes).minuteOfDay >= 23 * 60) store.sleep();
  }
});

// ── Mrs Kaur and Biscuit ──────────────────────────────────────────────────────────────────────────

test('Dog walk: Mrs Kaur and Biscuit are waiting at the park, and you have to walk up to them', () => {
  const store = game();
  menu(store, 'dog_walk');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'dog_walk', 'accept');
  inParkAt(store, 20, 36);                                     // far side of the park
  assert.ok(store.hostsHere().some(h => h.hostId === 'kaur'), 'Mrs Kaur is in the park');
  assert.equal(store.actionableStep('inPerson')?.def.id === 'dog_walk', false, 'nothing happens from across the park');
  const k = ERRAND_HOSTS.kaur.spot;
  inParkAt(store, k.x + 0.6, k.y + 0.4);
  const a = store.actionableStep('inPerson');
  assert.equal(a?.def.id, 'dog_walk');
  assert.equal(a?.step.host, 'kaur');
});

test('Dog walk: you really walk Biscuit to the pond, the end of the path and the little pond, then get paid', () => {
  const store = game();
  menu(store, 'dog_walk');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'dog_walk', 'accept');
  const k = ERRAND_HOSTS.kaur.spot;
  inParkAt(store, k.x + 0.6, k.y + 0.4);
  choose(store, 'dog_walk', 'lead');
  assert.ok(store.state.errand && store.state.errand.follower, 'Biscuit is on the lead');
  assert.equal(store.actionableStep('inPerson'), null, "can't hand him straight back");
  const cash = store.cash;
  // out of order doesn't count: the last stop first
  inParkAt(store, DOG_WALK_ROUTE[2].x, DOG_WALK_ROUTE[2].y); store.tick(0.1, 0.1);
  assert.deepEqual(store.state.errand!.done, [false, false, false]);
  for (const p of DOG_WALK_ROUTE) { inParkAt(store, p.x, p.y); store.tick(0.1, 0.1); }
  assert.ok(store.errandDone('dog_walk'));
  inParkAt(store, k.x + 0.6, k.y + 0.4);
  const a = store.actionableStep('inPerson');
  assert.equal(a?.step.id, 's3');
  choose(store, 'dog_walk', 'walk');
  assert.equal(store.cash, cash + 4);
  assert.equal(store.runtime('dog_walk')!.state, 'completed');
  assert.equal(store.state.errand, undefined, 'Biscuit is home');
});

test('Dog walk: Biscuit follows you around', () => {
  const store = game();
  menu(store, 'dog_walk');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'dog_walk', 'accept');
  const k = ERRAND_HOSTS.kaur.spot;
  inParkAt(store, k.x + 0.6, k.y + 0.4);
  choose(store, 'dog_walk', 'lead');
  inParkAt(store, 12, 38.4);
  for (let i = 0; i < 40; i++) store.tick(0.05, 0.05);
  const f = store.state.errand!.follower!;
  assert.ok(Math.hypot(f.x - 12 * TILE_PX, f.y - 38.4 * TILE_PX) < TILE_PX * 1.5, 'he caught up');
});

test('Dog walk: if the time runs out, Mrs Kaur takes Biscuit home', () => {
  const store = game();
  menu(store, 'dog_walk');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'dog_walk', 'accept');
  const k = ERRAND_HOSTS.kaur.spot;
  inParkAt(store, k.x + 0.6, k.y + 0.4);
  choose(store, 'dog_walk', 'lead');
  store.advance(at(0, 18, 1) - store.state.minutes);
  assert.equal(store.runtime('dog_walk')!.state, 'expired');
  assert.equal(store.state.errand, undefined);
});

// ── Litter pick ───────────────────────────────────────────────────────────────────────────────────

test('Litter pick: six spots in any order, then the council worker pays $3.40', () => {
  const store = game();
  menu(store, 'can_recycling');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'can_recycling', 'yes');
  const c = ERRAND_HOSTS.council.spot;
  inParkAt(store, c.x + 0.5, c.y + 0.3);
  choose(store, 'can_recycling', 'bag');
  for (const p of [...LITTER_SPOTS].reverse()) { inParkAt(store, p.x, p.y); store.tick(0.1, 0.1); }
  assert.ok(store.errandDone('can_recycling'));
  inParkAt(store, c.x + 0.5, c.y + 0.3);
  const cash = store.cash;
  choose(store, 'can_recycling', 'collect');
  assert.equal(Math.round((store.cash - cash) * 100), 340);
});

// ── Hosts indoors, friends who turn up ────────────────────────────────────────────────────────────

test('Library: the librarian is at her desk — the fine is sorted when you walk up to her', () => {
  const store = game();
  menu(store, 'library_fine');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'library_fine', 'return');
  store.exitPlace();
  const door = tileToPx(doorTile('library'));
  store.state.player.x = door.x; store.state.player.y = door.y;
  assert.equal(store.enterPlace('library').ok, true);
  assert.ok(store.hostsHere().some(h => h.hostId === 'librarian'), 'Mrs Ngata is there');
  assert.equal(store.actionableStep('inPerson'), null, 'not from the doorway');
  const sp = ERRAND_HOSTS.librarian.spot;
  store.state.player.x = sp.x * INTERIOR_TILE_PX; store.state.player.y = (sp.y + 1) * INTERIOR_TILE_PX;
  assert.equal(store.actionableStep('inPerson')?.def.id, 'library_fine');
});

test('Game sale: Jordan actually heads to the Mall once you say yes', () => {
  const store = game();
  menu(store, 'game_sale');
  store.advance(at(0, 15, 41) - store.state.minutes);
  choose(store, 'game_sale', 'yes');
  store.advance(30);
  assert.equal(store.state.npcs.jordan.place, 'mall');
});

// ── Jobs board ────────────────────────────────────────────────────────────────────────────────────

test('Jobs board: three different jobs, and not the same three every day', () => {
  const store = game();
  const days: string[] = [];
  for (let d = 0; d < 5; d++) {
    store.advance(at(d, 18, 30) - store.state.minutes);
    const jobs = store.homeJobs();
    assert.equal(jobs.length, 3);
    assert.equal(new Set(jobs.map(j => j.job.id)).size, 3);
    days.push(jobs.map(j => j.job.id).sort().join(','));
  }
  assert.ok(new Set(days).size >= 3, `boards: ${days.join(' | ')}`);
});

test('Jobs board: doing a job takes time and energy, pays, and can only be done once a day', () => {
  const store = game();
  store.advance(at(5, 10, 0) - store.state.minutes);            // Saturday morning, at home
  const job = store.homeJobs().find(j => j.status === 'open')!;
  assert.ok(job, 'something to do');
  const cash = store.cash, t = store.state.minutes;
  const out = store.doHomeJob(job.job.id);
  assert.equal(out.ok, true, out.message);
  assert.equal(Math.round((store.cash - cash) * 100), Math.round(job.job.pay * 100));
  assert.equal(Math.round(store.state.minutes - t), job.job.minutes);
  assert.equal(store.homeJobs().find(j => j.job.id === job.job.id)!.status, 'done');
  assert.equal(store.doHomeJob(job.job.id).ok, false);
  assert.ok(store.takeDecisions().some(d => d.key === `job:${job.job.id}` && d.verdict === 'good' && !!d.lesson));
});

test('Jobs board: three different jobs in a week earn the reliability bonus — once', () => {
  const store = game();
  for (const id of ['laundry', 'recycling']) store.state.world.flags.push(`wk_job:${id}`);
  store.advance(at(5, 10, 0) - store.state.minutes);
  const job = store.homeJobs().find(j => j.status === 'open' && !['laundry', 'recycling'].includes(j.job.id))!;
  const cash = store.cash;
  const out = store.doHomeJob(job.job.id);
  assert.equal(out.bonus, 3);
  assert.equal(Math.round((store.cash - cash) * 100), Math.round((job.job.pay + 3) * 100));
  assert.ok(store.state.world.flags.includes('wk_job_bonus'));
});

test('Jobs board: jobs that need Mum wait until she is home; daytime jobs have hours', () => {
  const cook = HOME_JOBS.find(j => j.id === 'cook')!;
  assert.ok(cook.needsMum && cook.from !== undefined);
  const store = game();
  store.advance(at(0, 12, 0) - store.state.minutes);
  for (const e of store.homeJobs()) {
    if (e.job.needsMum) assert.notEqual(e.status, 'open', 'Mum is at work at noon');
  }
});

// ── Small talk ────────────────────────────────────────────────────────────────────────────────────

test('Small talk: meeting someone again the same day never repeats a line', () => {
  const store = game();
  store.advance(at(0, 18, 0) - store.state.minutes);
  const said: string[] = [];
  for (let i = 0; i < 8; i++) said.push(...chatLinesFor('mum', store));
  assert.equal(new Set(said).size, said.filter(l => l !== '👋').length + (said.includes('👋') ? 1 : 0), `repeated: ${said.join(' / ')}`);
  const last = chatLinesFor('mum', store);
  assert.equal(last.length, 1, 'once she has run out, it is a short sign-off');
});

test('Small talk: a new day brings the lines back', () => {
  const store = game();
  store.advance(at(0, 18, 0) - store.state.minutes);
  const monday = new Set<string>();
  for (let i = 0; i < 6; i++) chatLinesFor('jordan', store).forEach(l => monday.add(l));
  store.advance(at(1, 18, 0) - store.state.minutes);
  const tuesday = chatLinesFor('jordan', store);
  assert.ok(tuesday.length >= 2, 'a proper chat again');
});

test('Small talk: people notice what you did today', () => {
  const store = game();
  store.advance(at(0, 18, 0) - store.state.minutes);
  store.noteDecision('game_skin:buy', 'Limited Skin', '✨ Buy it ($4.99)', 'Your car is gold now.', -4.99, undefined, 'bad');
  const lines = chatLinesFor('mum', store);
  assert.ok(lines[0].includes('buy it'), `Mum should mention the purchase first: ${lines[0]}`);
});
