import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, LIFE_PATHS } from '../../lib/gameData';
import { executeAttendClass, executeHelpParents } from '../integration/mondayAdapter';
import { hasMark } from '../../lib/missions';
import type { FinancialState } from '../../lib/financeTypes';

const SCHOOL_CONFIG = LIFE_PATHS.find((p) => p.id === 'school')!;

/** The live game's actual default Monday start (7:00 AM) — matches createInitialState()'s real
 *  behavior exactly, for tests that specifically exercise the open-hours mismatch. */
function freshDefaultStore(): GameStore {
  const finance = makeInitialFinance(SCHOOL_CONFIG);
  const state = createInitialState('school', finance);
  return new GameStore(state);
}

/** A store whose clock has already been advanced past the school's 8:00 AM opening, AND which
 *  has been handed pocket money — so the Attend Class fixture below can put the player at
 *  university without being blocked by two separate, already-documented mismatches this
 *  integration step deliberately does not fix:
 *    1. the open-hours mismatch (the live default Monday start, 7:00 AM, is before the school's
 *       8:00 AM opening — see world.ts's HOURS table);
 *    2. the School life path's real starting balance is $0, not $20/$35 — makeInitialFinance()
 *       gives startingBalance: 0 on purpose, because the live game hands the player $35 through
 *       the "Make It to Friday" mission's Monday dialogue (store.applyChoice()), which this
 *       isolated adapter test does not simulate. $20 is seeded directly here, via the store's own
 *       public earn() method (never a direct state write).
 *  Both are real, discovered mismatches between the blueprint's Monday narrative and the live
 *  game's current content — flagged in earlier step reports, not silently patched around. */
function storeAtSchoolOpenTime(): GameStore {
  const store = freshDefaultStore();
  store.advance(65); // 7:00 AM -> 8:05 AM, using the store's own public API
  store.earn(20, 'test', 'seed pocket money for test'); // using the store's own public API
  return store;
}

function freshFinance(): FinancialState {
  return makeInitialFinance(SCHOOL_CONFIG);
}

/** Step 8: a store already inside the school building during a valid class window (8:05 AM,
 *  Monday — within world.ts's university hours of 8:00-15:30). Reuses storeAtSchoolOpenTime()'s
 *  seeded $20 (not needed by ATTEND_CLASS, which has no financialEffect, but keeps the fixture
 *  consistent) and calls the store's own public enterPlace() to put the player at 'university' —
 *  Step 10: this used to be reached via executeMorningTransport(); Monday transport is now owned
 *  solely by the live 'get_to_school' mission (src/lib/missions.ts), so this fixture calls
 *  enterPlace() directly instead. */
function storeAtUniversity(): GameStore {
  const store = storeAtSchoolOpenTime();
  const entered = store.enterPlace('university');
  if (!entered.ok) throw new Error('test fixture: enterPlace(university) unexpectedly failed at 8:05 AM');
  return store;
}

// ══════════════════════════════════════════════════════════════════════════
// Step 6 — live Energy on GameStore (general, not transport/class-specific)
// ══════════════════════════════════════════════════════════════════════════

test('Energy 1 (Step 6): initial live energy has the expected current/max values', () => {
  const store = freshDefaultStore();
  assert.deepEqual(store.getEnergy(), { current: 100, max: 100 });
});

test('Energy 2 (Step 6): sleep() restores live energy to full', () => {
  const store = storeAtSchoolOpenTime();
  // Spend some energy first via the store's own public API.
  store.consumeEnergy(40);
  assert.equal(store.getEnergy().current, 60);
  store.sleep();
  assert.deepEqual(store.getEnergy(), { current: 100, max: 100 });
});

test('Energy 3 (Step 6): consumeEnergy/restoreEnergy never go outside [0, max]', () => {
  const store = freshDefaultStore();
  store.consumeEnergy(1000); // would go to -900
  assert.equal(store.getEnergy().current, 0);
  store.restoreEnergy(1000); // would go to 1000
  assert.equal(store.getEnergy().current, 100);
});

// ══════════════════════════════════════════════════════════════════════════
// Step 12 — School attendance is recorded on SUCCESSFUL Attend Class only
// ══════════════════════════════════════════════════════════════════════════

test('Attendance 1: successful Attend Class marks today.schoolAttended === true', () => {
  const store = storeAtUniversity();
  assert.equal(store.state.today.schoolAttended, null); // not yet decided
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.today.schoolAttended, true);
});

test('Attendance 2: successful Attend Class creates the at_school:<day> daily mark', () => {
  const store = storeAtUniversity();
  const day = store.state.today.day;
  assert.equal(store.state.world.dailyMarks.includes(`at_school:${day}`), false);
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.world.dailyMarks.includes(`at_school:${day}`), true);
});

test('Attendance 3: attendedToday() (hasMark) becomes true after successful Attend Class', () => {
  const store = storeAtUniversity();
  assert.equal(hasMark(store.state, 'at_school'), false);
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(hasMark(store.state, 'at_school'), true);
});

test('Attendance 4: failed Attend Class (insufficient energy) does NOT mark attendance', () => {
  const store = storeAtUniversity();
  store.consumeEnergy(store.getEnergy().current - 10); // leaves 10, less than the 15 class needs
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, false);
  assert.equal(store.state.today.schoolAttended, null);
  assert.equal(hasMark(store.state, 'at_school'), false);
});

test('Attendance 5: failed Attend Class (wrong location) does NOT mark attendance', () => {
  const store = storeAtSchoolOpenTime(); // never entered the building — place is 'home'
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'requirement_not_met');
  assert.equal(store.state.today.schoolAttended, null);
  assert.equal(hasMark(store.state, 'at_school'), false);
});

test('Attendance 6, 7, 8: failed Attend Class does not mutate time, energy, or finance (atomicity preserved after Step 12)', () => {
  const store = storeAtUniversity();
  store.consumeEnergy(store.getEnergy().current - 10); // force insufficient_energy
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;

  const outcome = executeAttendClass(store);

  assert.equal(outcome.ok, false);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.finance.balance, balanceBefore);
});

test('Attendance 9, 10, 11: successful Attend Class still advances 240 minutes, consumes 15 energy, and creates no transaction', () => {
  const store = storeAtUniversity();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;
  const ledgerLengthBefore = store.state.ledger.length;

  const outcome = executeAttendClass(store);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.minutesAdvanced, 240);
  assert.equal(store.state.minutes, minutesBefore + 240);
  assert.equal(outcome.energyConsumed, 15);
  assert.equal(store.getEnergy().current, energyBefore - 15);
  assert.equal(store.state.finance.balance, balanceBefore); // unchanged — no financialEffect
  assert.equal(store.state.ledger.length, ledgerLengthBefore); // no new ledger entry
});

test('Attendance 12: end-to-end — after Attend Class succeeds, the live \'lunch_break\' mission actually becomes eligible at its own trigger (location=university, 12:30-13:30) without any mission-file change', () => {
  const store = storeAtUniversity(); // 8:05 AM, at university
  const outcome = executeAttendClass(store); // advances to 12:05, marks attendance
  assert.equal(outcome.ok, true);
  assert.equal(store.state.minutes, 8 * 60 + 5 + 240); // 12:05

  const lunchBefore = store.state.missions.find(m => m.id === 'lunch_break')!;
  assert.equal(lunchBefore.state, 'locked'); // window hasn't opened yet (opens 12:30)

  // Advance the live clock (the store's own public API) into lunch_break's window while still at
  // university — evaluateMissions() runs every simulated minute inside advance().
  store.advance(30); // 12:05 -> 12:35

  const lunchAfter = store.state.missions.find(m => m.id === 'lunch_break')!;
  assert.equal(lunchAfter.state, 'available'); // now genuinely unlocked, no mission-file change needed
});

// ══════════════════════════════════════════════════════════════════════════
// Step 8 — Attend Class
// ══════════════════════════════════════════════════════════════════════════

test('Attend Class 1: succeeds at university during valid school hours', () => {
  const store = storeAtUniversity();
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
});

test('Attend Class 2: advances time by 240 minutes', () => {
  const store = storeAtUniversity();
  const minutesBefore = store.state.minutes;
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.minutesAdvanced, 240);
  assert.equal(store.state.minutes, minutesBefore + 240);
});

test('Attend Class 3: consumes 15 energy', () => {
  const store = storeAtUniversity();
  const energyBefore = store.getEnergy().current;
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.energyConsumed, 15);
  assert.equal(store.getEnergy().current, energyBefore - 15);
});

test('Attend Class 4: creates no financial transaction', () => {
  const store = storeAtUniversity();
  const balanceBefore = store.state.finance.balance;
  const ledgerLengthBefore = store.state.ledger.length;
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.finance.balance, balanceBefore); // unchanged — no financialEffect
  assert.equal(store.state.ledger.length, ledgerLengthBefore); // no new ledger entry
});

test('Attend Class 5 & 6: requires university — fails when the player is not there', () => {
  const store = storeAtSchoolOpenTime(); // same time/energy/finance, but never entered the building
  assert.equal(store.state.player.place, 'home');
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'requirement_not_met');
});

test('Attend Class 7 (documented, not duplicated here): outside valid school hours the player can never be "at university" in the first place, because store.enterPlace(university) itself is gated by world.ts\'s HOURS table — so ATTEND_CLASS\'s own place requirement is the only gate this adapter needs', () => {
  const store = freshDefaultStore(); // 7:00 AM — before the school opens
  const entered = store.enterPlace('university');
  assert.equal(entered.ok, false); // enterPlace itself rejects it — school-hours rule enforced upstream
  assert.equal(store.state.player.place, 'home'); // never arrived, so ATTEND_CLASS's place check would also fail
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'requirement_not_met');
});

test('Attend Class 8: insufficient energy rejects the activity', () => {
  const store = storeAtUniversity();
  // Drain energy below ATTEND_CLASS's cost (15) using the store's OWN public consumeEnergy().
  store.consumeEnergy(store.getEnergy().current - 10); // leaves 10, less than the 15 class needs
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'insufficient_energy');
});

test('Attend Class 9, 10, 11: failed attendance does not partially mutate time, energy, or money', () => {
  const store = storeAtUniversity();
  store.consumeEnergy(store.getEnergy().current - 10); // force insufficient_energy
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;
  const placeBefore = store.state.player.place;

  const outcome = executeAttendClass(store);

  assert.equal(outcome.ok, false);
  assert.equal(store.state.minutes, minutesBefore); // time unchanged
  assert.equal(store.getEnergy().current, energyBefore); // energy unchanged
  assert.equal(store.state.finance.balance, balanceBefore); // money unchanged
  assert.equal(store.state.player.place, placeBefore); // location unchanged
});

test('Attend Class 12, 13, 14: successful live integration updates GameStore time/energy and leaves player at university', () => {
  const store = storeAtUniversity();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;

  const outcome = executeAttendClass(store);

  assert.equal(outcome.ok, true);
  assert.equal(store.state.minutes, minutesBefore + 240); // time updated
  assert.equal(store.getEnergy().current, energyBefore - 15); // energy updated
  assert.equal(store.state.player.place, 'university'); // still at university — no movesPlayerTo
});

test('Attend Class 15: failed live integration leaves GameStore completely unchanged', () => {
  const store = storeAtSchoolOpenTime(); // not at university -> requirement_not_met
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;
  const placeBefore = store.state.player.place;
  const ledgerLengthBefore = store.state.ledger.length;

  const outcome = executeAttendClass(store);

  assert.equal(outcome.ok, false);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.finance.balance, balanceBefore);
  assert.equal(store.state.player.place, placeBefore);
  assert.equal(store.state.ledger.length, ledgerLengthBefore);
});

// ══════════════════════════════════════════════════════════════════════════
// Step 18 — currentActivity synchronization (Core Simulation -> live GameStore)
// ══════════════════════════════════════════════════════════════════════════

test('CurrentActivity 1: a fresh GameStore has currentActivity === null', () => {
  const store = freshDefaultStore();
  assert.equal(store.state.currentActivity, null);
});

test('CurrentActivity 2: successful Attend Class sets currentActivity to the exact tag ActivitySystem produces for ATTEND_CLASS (category "study" -> "studying")', () => {
  const store = storeAtUniversity();
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.currentActivity, 'studying');
});

test('CurrentActivity 3: successful Help Parents sets currentActivity to the exact tag ActivitySystem produces for HELP_PARENTS (category "chore" -> "chore")', () => {
  const store = storeAtSchoolOpenTime();
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.currentActivity, 'chore');
});

test('CurrentActivity 4: failed Attend Class leaves an existing currentActivity unchanged', () => {
  const store = storeAtUniversity();
  // Give it a prior value via a genuinely successful, unrelated activity first.
  const priorOutcome = executeHelpParents(store);
  assert.equal(priorOutcome.ok, true);
  assert.equal(store.state.currentActivity, 'chore');

  store.consumeEnergy(store.getEnergy().current - 10); // force insufficient_energy for Attend Class
  const outcome = executeAttendClass(store);
  assert.equal(outcome.ok, false);
  assert.equal(store.state.currentActivity, 'chore'); // unchanged by the failed attempt
});

test('CurrentActivity 5: failed Help Parents leaves an existing currentActivity unchanged', () => {
  const store = storeAtUniversity();
  const priorOutcome = executeAttendClass(store);
  assert.equal(priorOutcome.ok, true);
  assert.equal(store.state.currentActivity, 'studying');

  store.consumeEnergy(store.getEnergy().current); // drain to 0 -> insufficient_energy for Help Parents
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, false);
  assert.equal(store.state.currentActivity, 'studying'); // unchanged by the failed attempt
});

test('CurrentActivity 6: the synchronization change does not weaken existing time/energy/finance/attendance behavior', () => {
  const store = storeAtUniversity();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;

  const outcome = executeAttendClass(store);

  assert.equal(outcome.ok, true);
  assert.equal(store.state.minutes, minutesBefore + 240);
  assert.equal(store.getEnergy().current, energyBefore - 15);
  assert.equal(store.state.today.schoolAttended, true);
  assert.equal(hasMark(store.state, 'at_school'), true);
  assert.equal(store.state.currentActivity, 'studying');
});

test('CurrentActivity 7: the adapter does not expose or leak the ephemeral Core Simulation state — outcome objects stay plain', () => {
  const storeA = storeAtUniversity();
  const classOutcome = executeAttendClass(storeA);
  assert.deepEqual(
    Object.keys(classOutcome).sort(),
    ['energyConsumed', 'minutesAdvanced', 'ok'].sort(),
  );

  const storeB = storeAtSchoolOpenTime();
  const helpOutcome = executeHelpParents(storeB);
  assert.deepEqual(
    Object.keys(helpOutcome).sort(),
    ['amountEarned', 'energyConsumed', 'minutesAdvanced', 'ok'].sort(),
  );
});

test('CurrentActivity 8: GameStore.setCurrentActivity() only changes currentActivity, nothing else', () => {
  const store = storeAtUniversity();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;
  const placeBefore = store.state.player.place;
  const schoolAttendedBefore = store.state.today.schoolAttended;
  const ledgerLengthBefore = store.state.ledger.length;

  store.setCurrentActivity('exploring');

  assert.equal(store.state.currentActivity, 'exploring');
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.finance.balance, balanceBefore);
  assert.equal(store.state.player.place, placeBefore);
  assert.equal(store.state.today.schoolAttended, schoolAttendedBefore);
  assert.equal(store.state.ledger.length, ledgerLengthBefore);
});

// ══════════════════════════════════════════════════════════════════════════
// Step 15 — Help Parents
// ══════════════════════════════════════════════════════════════════════════
// HELP_PARENTS (src/game/content/schoolActivities.ts) has no `requirement` at all — no place, no
// minEnergy — so, unlike Attend Class, there is no location-requirement failure to test here at
// the adapter/Core-Simulation level; "at home" is a live UI-only eligibility rule (see page.tsx),
// out of scope for these adapter tests. storeAtSchoolOpenTime() is reused purely for its seeded
// $20 balance and advanced clock (8:05 AM) — HELP_PARENTS doesn't care about location or hour.

test('Help Parents 1: succeeds with the store\'s ordinary starting state', () => {
  const store = storeAtSchoolOpenTime();
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
});

test('Help Parents 2: advances time by 30 minutes (HELP_PARENTS.timeCostMinutes)', () => {
  const store = storeAtSchoolOpenTime();
  const minutesBefore = store.state.minutes;
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.minutesAdvanced, 30);
  assert.equal(store.state.minutes, minutesBefore + 30);
});

test('Help Parents 3: consumes 5 energy (HELP_PARENTS.energyCost)', () => {
  const store = storeAtSchoolOpenTime();
  const energyBefore = store.getEnergy().current;
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.energyConsumed, 5);
  assert.equal(store.getEnergy().current, energyBefore - 5);
});

test('Help Parents 4: earns $5 (HELP_PARENTS.financialEffect.amount) via store.earn(), not store.spend()', () => {
  const store = storeAtSchoolOpenTime();
  const balanceBefore = store.state.finance.balance;
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.amountEarned, 5);
  assert.equal(store.state.finance.balance, balanceBefore + 5); // went UP, confirming earn() not spend()
});

test('Help Parents 5: a real transaction is created on the live ledger, carrying the activity\'s own category/description', () => {
  const store = storeAtSchoolOpenTime();
  const ledgerLengthBefore = store.state.ledger.length;
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.ledger.length, ledgerLengthBefore + 1);
  const entry = store.state.ledger[store.state.ledger.length - 1];
  assert.equal(entry.amount, 5);
  assert.equal(entry.category, 'income'); // HELP_PARENTS.financialEffect.category
  assert.equal(entry.label, 'Chore payment'); // HELP_PARENTS.financialEffect.description
});

test('Help Parents 6: resulting balance is exactly balanceBefore + 5, with no other side effect on finance totals bookkeeping', () => {
  const store = storeAtSchoolOpenTime();
  const balanceBefore = store.state.finance.balance;
  const totalEarnedBefore = store.state.finance.totalEarned;
  const outcome = executeHelpParents(store);
  assert.equal(outcome.ok, true);
  assert.equal(store.state.finance.balance, balanceBefore + 5);
  assert.equal(store.state.finance.totalEarned, totalEarnedBefore + 5);
});

test('Help Parents 7: insufficient energy rejects the activity and leaves time/energy/money/ledger completely unchanged', () => {
  const store = storeAtSchoolOpenTime();
  store.consumeEnergy(store.getEnergy().current - 3); // leaves 3, less than the 5 chore needs
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;
  const ledgerLengthBefore = store.state.ledger.length;

  const outcome = executeHelpParents(store);

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'insufficient_energy');
  assert.equal(outcome.amountEarned, 0);
  assert.equal(store.state.minutes, minutesBefore);
  assert.equal(store.getEnergy().current, energyBefore);
  assert.equal(store.state.finance.balance, balanceBefore);
  assert.equal(store.state.ledger.length, ledgerLengthBefore);
});

// Item 8 (requirement failure): HELP_PARENTS has no requirement.place/minEnergy at all (confirmed
// by inspection of schoolActivities.ts), so there is no requirement-failure path to test beyond
// the insufficient-energy case already covered by Help Parents 7 — documented here rather than
// fabricating a requirement that doesn't exist in the ActivityDef.

test('Help Parents 9: the adapter does not leak or return any ephemeral Core Simulation state', () => {
  const store = storeAtSchoolOpenTime();
  const outcome = executeHelpParents(store);
  const keys = Object.keys(outcome).sort();
  assert.deepEqual(keys, ['amountEarned', 'energyConsumed', 'minutesAdvanced', 'ok'].sort());
  // Every field is a plain primitive — no nested ephemeral time/player/energy/finance objects.
  for (const v of Object.values(outcome)) {
    assert.ok(typeof v === 'boolean' || typeof v === 'number' || v === undefined);
  }
});

test('Help Parents 10: successful execution updates the live GameStore itself, not just the returned outcome', () => {
  const store = storeAtSchoolOpenTime();
  const minutesBefore = store.state.minutes;
  const energyBefore = store.getEnergy().current;
  const balanceBefore = store.state.finance.balance;

  const outcome = executeHelpParents(store);

  assert.equal(outcome.ok, true);
  assert.equal(store.state.minutes, minutesBefore + 30);
  assert.equal(store.getEnergy().current, energyBefore - 5);
  assert.equal(store.state.finance.balance, balanceBefore + 5);
});

// Item 11 (once-per-day/repeatability rule): the chosen behavior (Step 15 report, option A) is
// enforced entirely in page.tsx's local React state (`helpParentsCompletedDay`/`helpParentsEligible`),
// not in GameStore or the adapter — executeHelpParents() itself is intentionally repeatable on
// every call (Help Parents 1/10 above both call it successfully in isolation), exactly like
// executeAttendClass() imposes no repeat-limit of its own either (that's classCompletedDay's job).
// There is no React test infrastructure in this project (no @testing-library/react, no jsdom, no
// component test runner configured — only node:test against plain TypeScript/CommonJS output), so
// a once-per-day UI test is not fabricated here; this comment documents that gap explicitly rather
// than adding a fake test around store/adapter state that doesn't actually enforce the rule.
