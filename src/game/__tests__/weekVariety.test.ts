/**
 * MoniMate — the later days of the week are as full as Monday, and don't repeat themselves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';
import { missionDefs } from '../../lib/missions';
import { at } from '../../lib/clock';
import { isOpen } from '../../lib/world';

const SCHOOL = getLifePath('school');
function gameWithSeed(seed: number, path: 'school' | 'university' = 'school'): GameStore {
  const cfg = path === 'school' ? SCHOOL : getLifePath('university');
  const st = createInitialState(path, makeInitialFinance(cfg), makeInitialGoals(cfg));
  st.world.flags = st.world.flags.filter(f => !f.startsWith('seed:'));
  st.world.flags.push(`seed:${seed}`);
  return new GameStore(st);
}
function weekOfPools(store: GameStore): string[][] {
  const days: string[][] = [];
  for (let d = 0; d < 7; d++) {
    if (d > 0) store.advance(at(d, 6, 0) - store.state.minutes);
    days.push(store.todaysPool());
  }
  return days;
}

test('Variety: every weekday offers at least 5 side tasks, Friday as many as Monday', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const days = weekOfPools(gameWithSeed(seed));
    for (let d = 0; d < 5; d++) assert.ok(days[d].length >= 5, `seed ${seed} day ${d}: only ${days[d].join(', ')}`);
    assert.ok(days[4].length >= days[0].length, `seed ${seed}: Friday thinner than Monday`);
  }
});

test('Variety: no side task repeats within the same week', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const all = weekOfPools(gameWithSeed(seed)).flat();
    assert.equal(new Set(all).size, all.length, `seed ${seed} repeated: ${all.join(', ')}`);
  }
});

test("Savings deal: Mum's $1 bonus lands in the piggy bank", () => {
  const store = gameWithSeed(1);
  store.applyChoice('pocket_money', store.actionableStep()!.step.choices![0]);
  store.runtime('savings_match')!.state = 'available';
  const step = store.stepFor(store.def('savings_match')!, store.runtime('savings_match')!)!;
  store.applyChoice('savings_match', step.choices!.find(c => c.id === 'save')!);
  assert.equal(store.state.finance.accounts.savings, 6);
  assert.equal(store.cash, 15);
});

test('Variety: every day of the week has its own story moment, not just side tasks', () => {
  const story = missionDefs('school').filter(d => !d.pool && d.kind !== 'daily' && d.id !== 'get_to_school' && d.id !== 'after_school_snack');
  for (let day = 0; day < 7; day++) {
    const today = story.filter(d => d.window.days.includes(day)).map(d => d.id);
    assert.ok(today.length >= 1, `day ${day} has no story beat`);
  }
});

test('Every in-person step happens somewhere that is open during its window', () => {
  for (const def of missionDefs('school')) {
    for (const step of def.steps) {
      if (step.remote || step.withNpc || step.place === 'home') continue;
      for (const day of def.window.days) {
        let open = false;
        for (let m = def.window.from; m <= def.window.until && !open; m += 5) open = isOpen(step.place, at(day, 0, m));
        assert.ok(open, `${def.id}/${step.id}: ${step.place} is closed all through its window on day ${day}`);
      }
    }
  }
});

test("Loan chain: lend Jordan $4 early in the week and he pays some or all of it back on Friday", () => {
  const store = gameWithSeed(4);
  for (const id of ['pocket_money', 'pick_goal']) {
    const a = store.actionableStep()!;
    store.applyChoice(id, a.step.choices![0]);
  }
  store.runtime('jordan_loan')!.state = 'available';
  const loan = store.stepFor(store.def('jordan_loan')!, store.runtime('jordan_loan')!)!;
  store.applyChoice('jordan_loan', loan.choices!.find(c => c.id === 'lend')!);
  const afterLoan = store.cash;
  store.advance(at(4, 17, 35) - store.state.minutes);
  const msg = store.phoneInbox().find(m => m.def.id === 'jordan_payback');
  assert.ok(msg, 'Jordan messages on Friday');
  const before = store.cash;
  store.applyChoice('jordan_payback', msg!.step.choices![0]);
  assert.ok(store.cash >= before + 2, 'at least half comes back');
  assert.ok(afterLoan < 20);
});

test('Basketball: sign up on Tuesday, and missing Friday\'s game is noticed', () => {
  const store = gameWithSeed(2);
  store.state.world.flags.push('team_joined');
  store.advance(at(4, 17, 31) - store.state.minutes);
  assert.equal(store.runtime('team_game')!.state, 'expired');
  assert.ok(store.state.world.flags.includes('team_skipped'));
});

test('University variety: 5+ side tasks every weekday, nothing repeats within the week', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const days = weekOfPools(gameWithSeed(seed, 'university'));
    for (let d = 0; d < 5; d++) assert.ok(days[d].length >= 5, `seed ${seed} day ${d}: only ${days[d].join(', ')}`);
    const all = days.flat();
    assert.equal(new Set(all).size, all.length, `seed ${seed} repeated: ${all.join(', ')}`);
    const uniOnly = new Set(missionDefs('university').map(d => d.id));
    assert.ok(all.every(id => uniOnly.has(id)), 'only University-appropriate tasks');
    assert.ok(!all.some(id => ['mum_pancakes', 'jordan_loan', 'bake_sale'].includes(id)), 'no School-only tasks');
  }
});
