/**
 * MoniMate — University Week 1 ("First Week") end-to-end, played the way a player would: phone
 * messages, walking to campus, sitting through lectures, shelf shopping, an interview at the Café.
 * Every route must reach Sunday's call with Mum, and the recap must report what that route did.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';
import { INTERIOR_TILE_PX, getInterior, isOpen } from '../../lib/world';
import { pathRules, placeName, pathText } from '../../lib/pathRules';
import { missionDefs } from '../../lib/missions';
import type { SceneId } from '../../lib/types';

const UNI = getLifePath('university');
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;

/** A University game on a "quiet" world (no random side tasks), so this checks the scripted week. */
function newGame(): GameStore {
  const store = new GameStore(createInitialState('university', makeInitialFinance(UNI), makeInitialGoals(UNI)));
  const w = store.state.world;
  w.dailyMarks = w.dailyMarks.filter(m => !m.startsWith('pool:'));
  for (let d = 0; d < 21; d++) if (!w.dailyMarks.includes(`pool_rolled:${d}`)) w.dailyMarks.push(`pool_rolled:${d}`);
  store.advance(0.001);
  return store;
}
function advanceTo(store: GameStore, day: number, h: number, m = 0) {
  const target = at(day, h, m);
  assert.ok(target >= store.state.minutes, `can't go back in time to day ${day} ${h}:${m}`);
  store.advance(target - store.state.minutes);
}
function goOutside(store: GameStore) { if (store.state.player.scene !== 'outdoor') store.exitPlace(); }
function enter(store: GameStore, place: string) {
  goOutside(store);
  const r = store.enterPlace(place);
  assert.ok(r.ok, `could not enter ${place}: ${r.reason}`);
}
function choose(store: GameStore, missionId: string, choiceId: string) {
  const a = store.actionableStep();
  assert.ok(a, `expected ${missionId} to be on screen`);
  assert.equal(a!.def.id, missionId);
  const c = a!.step.choices!.find(x => x.id === choiceId);
  assert.ok(c, `choice ${choiceId} missing on ${missionId} (have ${a!.step.choices!.map(x => x.id).join(', ')})`);
  assert.equal(store.applyChoice(missionId, c!), true, `${missionId}/${choiceId} was refused`);
}
function buy(store: GameStore, itemId: string) {
  const item = getInterior(store.state.player.scene)!.shopItems!.find(i => i.id === itemId)!;
  store.state.player.x = item.tx * INTERIOR_TILE_PX;
  store.state.player.y = item.ty * INTERIOR_TILE_PX;
  const r = store.buyNearbyShopItem();
  assert.ok(r.ok, `could not buy ${itemId}: ${r.reason}`);
}
/** Walk to campus (~25 min) and sit through the 10 AM lecture (to 12:00). */
function lecture(store: GameStore, day: number) {
  if (store.state.minutes < at(day, 9, 0)) advanceTo(store, day, 9, 0);
  goOutside(store);
  store.advance(25);
  enter(store, 'university');
  store.goToInteriorScene('interior_school_classroom' as SceneId);
  assert.equal(store.classStatus(), 'ready');
  store.waitForBell();
  assert.equal(store.attendClass().ok, true);
  assert.equal(store.classStatus(), 'done');
}
function sleep(store: GameStore) {
  enter(store, 'home');
  store.sleep();
  store.dismissDaySummary();
  store.dismissWeekSummary();
}
const cash = (store: GameStore) => Math.round(store.cash * 100) / 100;
const state = (store: GameStore, id: string) => store.state.missions.find(m => m.id === id)!.state;

test('University path: its own cast, names, rules and money', () => {
  const store = newGame();
  assert.deepEqual(Object.keys(store.state.npcs).sort(), ['leah', 'lecturer', 'mei', 'sam', 'shopkeeper']);
  assert.equal(store.state.world.relationships.Sam, 2);
  assert.equal(placeName('university', 'university'), 'University');
  assert.equal(placeName('school', 'university'), 'School');
  assert.equal(pathText('university', 'School Gate'), 'Campus Gate');
  assert.equal(pathText('university', 'Your Room'), 'Your Flat');
  assert.equal(cash(store), 180);
  // No School content leaks in, and no automatic rent (rent is a weekly decision).
  assert.ok(!store.defs.some(d => d.id === 'pocket_money' || d.id === 'lunch_break'));
  assert.ok(!store.state.finance.expenses.recurring.some(r => r.id === 'rent'));
  assert.equal(store.rules.weekStart, 'uni_payday');
});

// ── Route A: the organised student — goal: a $150 safety buffer ──────────────
test('University Week A: an organised student pays rent, lands the job and saves $150; Mum hears all of it', () => {
  const store = newGame();

  // MONDAY — StudyLink, goal, rent, first lecture, textbook, lunch, weekly shop, savings
  choose(store, 'uni_payday', 'take');
  assert.equal(cash(store), 496);
  assert.equal(store.state.finance.debt.loans.find(l => l.kind === 'student')!.principal, 15316, 'StudyLink adds to the loan');
  choose(store, 'uni_pick_goal', 'buffer');
  assert.equal(store.weekGoalId(), 'uni_buffer');
  advanceTo(store, MON, 9, 0);
  choose(store, 'uni_rent', 'pay');
  assert.equal(cash(store), 296);
  lecture(store, MON);
  assert.equal(state(store, 'uni_lecture'), 'completed');
  choose(store, 'uni_first_lecture', 'noted');
  choose(store, 'uni_textbook', 'used');            // $45 from Jess
  choose(store, 'uni_lunch', 'noodles');            // $1.20
  assert.equal(cash(store), 249.8);
  advanceTo(store, MON, 15, 5);
  choose(store, 'uni_big_shop', 'go');
  enter(store, 'supermarket');
  buy(store, 'pasta_basic'); buy(store, 'rice_basic'); buy(store, 'milk_basic'); buy(store, 'eggs_basic'); // $10.80
  goOutside(store);
  assert.equal(state(store, 'uni_big_shop'), 'completed');
  assert.equal(store.runtime('uni_big_shop')!.outcome, 'under_budget');
  assert.equal(store.moveToSavings(100), true);
  assert.equal(cash(store), 139);
  sleep(store);

  // TUESDAY — lecture, Clubs Day, leftovers for lunch, apply for the Café job
  lecture(store, TUE);
  choose(store, 'uni_clubs_day', 'boardgames');
  const lunch = store.actionableStep()!;
  assert.equal(lunch.def.id, 'uni_lunch');
  assert.ok(lunch.step.choices!.some(c => c.id === 'leftovers'), 'did a shop, so there are leftovers');
  choose(store, 'uni_lunch', 'leftovers');
  advanceTo(store, TUE, 15, 5);
  choose(store, 'uni_job_hunt', 'apply');
  assert.equal(cash(store), 134);
  sleep(store);

  // WEDNESDAY — lecture, lunch, the interview at the Café
  lecture(store, WED);
  choose(store, 'uni_lunch', 'leftovers');
  advanceTo(store, WED, 13, 5);
  enter(store, 'cafe');
  choose(store, 'uni_interview', 'honest');
  assert.ok(store.state.world.flags.includes('wk_trial_offered'));
  sleep(store);

  // THURSDAY — lecture, the charger dies, the power bill
  lecture(store, THU);
  choose(store, 'uni_lunch', 'leftovers');
  advanceTo(store, THU, 12, 35);
  choose(store, 'uni_charger', 'library');
  advanceTo(store, THU, 18, 5);
  choose(store, 'uni_power_bill', 'pay');
  assert.equal(cash(store), 89);
  sleep(store);

  // FRIDAY — the $40 phone bill goes out, lecture, quiz, trial shift + tax code
  lecture(store, FRI);
  assert.equal(cash(store), 49, 'phone bill paid automatically at 9 AM');
  choose(store, 'uni_quiz', 'do');                 // has the textbook: 1 hour
  choose(store, 'uni_lunch', 'leftovers');
  enter(store, 'cafe');                             // the trial runs 12:30–3:30; it's about 1:20 now
  choose(store, 'uni_trial_shift', 'work');        // +$70.50 for 3 hours
  choose(store, 'uni_trial_shift', 'msl');
  assert.equal(cash(store), 119.5);
  assert.equal(store.moveToSavings(50), true);
  assert.equal(store.goalStatus()!.achieved, true);
  sleep(store);

  // SATURDAY — Raglan, on the cheap
  advanceTo(store, SAT, 9, 0);
  choose(store, 'uni_raglan', 'cheap');
  sleep(store);

  // SUNDAY — the video call with Mum
  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'uni_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.ok(sm, 'the week recap should be showing');
  assert.equal(sm.path, 'university');
  assert.equal(sm.startBalance, 496);
  assert.equal(sm.endBalance, 57.5);
  assert.equal(sm.savings, 150);
  assert.equal(sm.daysAttended, 5);
  assert.deepEqual({ id: sm.goal!.id, achieved: sm.goal!.achieved }, { id: 'uni_buffer', achieved: true });
  const text = sm.highlights.map(h => h.text).join(' | ');
  for (const expected of ['Paid the $200 rent on time', 'Second-hand textbook', 'Did a proper weekly shop', 'Landed the part-time job',
    'right tax code (M SL)', 'Board Games', 'Paid your $45 power share', 'library computers', 'Handed in the ECON101 quiz', 'Raglan']) {
    assert.ok(text.includes(expected), `recap should mention "${expected}" — got: ${text}`);
  }
  assert.ok(sm.highlights.every(h => h.tone !== 'bad'), `organised week has no bad lines: ${text}`);
});

// ── Route B: the chaotic student ─────────────────────────────────────────────
test('University Week B: a chaotic student pays rent late, skips the shop and bluffs the interview — and hears about it', () => {
  const store = newGame();
  choose(store, 'uni_payday', 'take');
  choose(store, 'uni_pick_goal', 'job');
  advanceTo(store, MON, 9, 0);
  choose(store, 'uni_rent', 'later');
  assert.equal(store.state.world.relationships.Sam, 1);
  advanceTo(store, MON, 15, 5);
  choose(store, 'uni_big_shop', 'skip');
  sleep(store);

  // Tuesday: no lecture, but applies for the job
  advanceTo(store, TUE, 15, 5);
  choose(store, 'uni_job_hunt', 'apply');
  sleep(store);

  // Wednesday: bluffs the interview
  advanceTo(store, WED, 13, 5);
  enter(store, 'cafe');
  choose(store, 'uni_interview', 'bluff');
  sleep(store);

  // Friday: rent comes due again; stalls. Skips the quiz.
  advanceTo(store, FRI, 8, 5);
  const rent = store.actionableStep()!;
  assert.equal(rent.def.id, 'uni_rent_rest');
  assert.deepEqual(rent.step.choices!.map(c => c.id), ['pay200', 'stall']);
  choose(store, 'uni_rent_rest', 'stall');
  advanceTo(store, FRI, 12, 5);
  choose(store, 'uni_quiz', 'skip');
  assert.equal(store.runtime('uni_trial_shift')!.state, 'locked', 'no trial after a bluffed interview');
  sleep(store); sleep(store);

  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'uni_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.equal(sm.goal!.achieved, false);
  const bad = sm.highlights.filter(h => h.tone === 'bad').map(h => h.text).join(' | ');
  for (const expected of ["Rent wasn't paid in full", 'Skipped the weekly shop', 'Never got the textbook', 'Missed the ECON101 quiz']) {
    assert.ok(bad.includes(expected), `recap should flag "${expected}" — got: ${bad}`);
  }
  assert.ok(store.cash >= 0, 'money never goes negative');
});

// ── Route C: never leaves the flat ───────────────────────────────────────────
test('University Week C: a student who stays in all week still reaches Sunday, and the week closes cleanly', () => {
  const store = newGame();
  choose(store, 'uni_payday', 'take');
  choose(store, 'uni_pick_goal', 'ready');
  for (const day of [MON, TUE, WED, THU, FRI, SAT]) {
    advanceTo(store, day, 22, 0);
    store.sleep(); store.dismissDaySummary();
  }
  assert.equal(state(store, 'uni_rent'), 'expired');
  assert.ok(store.state.world.flags.includes('wk_rent_late'));
  advanceTo(store, SUN, 16, 0);
  enter(store, 'home');
  choose(store, 'uni_recap', 'reflect');
  const sm = store.pendingLevelSummary!;
  assert.equal(sm.daysAttended, 0);
  assert.equal(sm.goal!.achieved, false);
  // Next Monday: StudyLink pays again and last week's flags are gone.
  advanceTo(store, 7, 7, 1);
  choose(store, 'uni_payday', 'take');
  assert.ok(!store.state.world.flags.some(f => f.startsWith('wk_') && !f.startsWith('wk_start_balance:')), 'week flags cleared on payday');
});

test('University: Monday rent message waits until StudyLink has paid', () => {
  const store = newGame();
  advanceTo(store, MON, 9, 30);
  assert.equal(store.runtime('uni_rent')!.state, 'locked');
  choose(store, 'uni_payday', 'take');
  assert.equal(store.runtime('uni_rent')!.state, 'available');
});

test('University: every in-person step happens somewhere that is open during its window', () => {
  for (const def of missionDefs('university')) {
    for (const step of def.steps) {
      if (step.remote || step.withNpc || step.place === 'home') continue;
      for (const day of def.window.days) {
        let open = false;
        for (let m = def.window.from; m <= def.window.until && !open; m += 5) open = isOpen(step.place, at(day, 0, m));
        assert.ok(open, `${def.id}/${step.id}: ${step.place} is closed all through its window on day ${day}`);
      }
    }
  }
  assert.ok(pathRules('university').calendar.every(e => missionDefs('university').some(d => d.id === e.missionId)), 'calendar only lists real missions');
});

test('Bug fix: a shift started just before its window closes is not marked "missed" halfway through', () => {
  const store = newGame();
  choose(store, 'uni_payday', 'take');
  store.state.world.flags.push('wk_trial_offered');
  advanceTo(store, FRI, 15, 25);                     // five minutes before the trial window closes
  enter(store, 'cafe');
  choose(store, 'uni_trial_shift', 'work');          // three hours: runs to 6:25 PM
  assert.equal(store.runtime('uni_trial_shift')!.state, 'active');
  assert.ok(!store.state.world.flags.includes('wk_trial_missed'));
  choose(store, 'uni_trial_shift', 'msl');
  assert.equal(store.runtime('uni_trial_shift')!.state, 'completed');
});
