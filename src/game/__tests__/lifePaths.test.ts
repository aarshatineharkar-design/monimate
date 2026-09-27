/**
 * MoniMate — switching life paths: each path keeps its own save, the path picker can see where
 * every path is up to, and starting one over leaves the others alone.
 */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSave, writeSave, listSaves, deleteSave } from '../../lib/persistence/cloudSave';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath, type LifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: object }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};
/** A fake Supabase `game_saves` table: select/eq/maybeSingle, a list query, upsert and delete. */
function fakeSupabase() {
  const rows = new Map<string, { user_id: string; life_path: string; game_minutes: number; state: { finance: { accounts: { cash: number } } }; updated_at: string }>();
  const client = {
    rows,
    from() {
      const filters: Record<string, string> = {};
      let deleting = false;
      const matching = () => [...rows.values()].filter(r => Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v));
      const q = {
        select() { return q; },
        delete() { deleting = true; return q; },
        eq(col: string, v: string) { filters[col] = v; return q; },
        async maybeSingle() { return { data: matching()[0] ?? null, error: null }; },
        async upsert(row: { user_id: string; life_path: string; game_minutes: number; state: never; updated_at: string }) {
          rows.set(`${row.user_id}|${row.life_path}`, row); return { error: null };
        },
        then(resolve: (r: unknown) => void) {
          if (deleting) { for (const r of matching()) rows.delete(`${r.user_id}|${r.life_path}`); resolve({ error: null }); return; }
          resolve({ data: matching().map(r => ({ life_path: r.life_path, game_minutes: r.game_minutes, updated_at: r.updated_at, cash: r.state.finance.accounts.cash })), error: null });
        },
      };
      return q;
    },
  };
  return client as unknown as SupabaseClient & { rows: typeof rows };
}
const newStore = (path: LifePath) => {
  const cfg = getLifePath(path);
  return new GameStore(createInitialState(path, makeInitialFinance(cfg), makeInitialGoals(cfg)));
};
beforeEach(() => mem.clear());

test('Switching: School and University keep separate saves, each resumes where it was left', async () => {
  const sb = fakeSupabase();
  const school = newStore('school');
  school.advance(at(2, 16, 0) - school.state.minutes);          // Wednesday afternoon
  school.state.finance.accounts.cash = 7.5;
  await writeSave(sb, 'u1', school.state);
  const uni = newStore('university');
  uni.advance(at(0, 11, 0) - uni.state.minutes);                // Monday morning
  await writeSave(sb, 'u1', uni.state);

  const backToSchool = await loadSave(sb, 'u1', 'school');
  assert.equal(backToSchool!.lifePath, 'school');
  assert.equal(backToSchool!.finance.accounts.cash, 7.5);
  assert.equal(Math.floor(backToSchool!.minutes), at(2, 16, 0));
  const backToUni = await loadSave(sb, 'u1', 'university');
  assert.equal(backToUni!.lifePath, 'university');
  assert.equal(Math.floor(backToUni!.minutes), at(0, 11, 0));
  assert.equal(GameStore.hydrate(JSON.stringify(backToUni))!.rules.weekStart, 'uni_payday');
});

test('Switching: the path picker lists every saved path with its day and money', async () => {
  const sb = fakeSupabase();
  const school = newStore('school');
  school.state.finance.accounts.cash = 12;
  await writeSave(sb, 'u1', school.state);
  await writeSave(sb, 'u1', newStore('university').state);
  const saves = await listSaves(sb, 'u1');
  assert.deepEqual(Object.keys(saves).sort(), ['school', 'university']);
  assert.equal(saves.school!.cash, 12);
  assert.equal(saves.university!.cash, 180);
  assert.equal(saves.working, undefined);
});

test('Switching: starting one path over deletes only that path', async () => {
  const sb = fakeSupabase();
  await writeSave(sb, 'u1', newStore('school').state);
  await writeSave(sb, 'u1', newStore('university').state);
  await deleteSave(sb, 'u1', 'university');
  assert.equal(await loadSave(sb, 'u1', 'university'), null);
  assert.ok(await loadSave(sb, 'u1', 'school'));
  assert.deepEqual(Object.keys(await listSaves(sb, 'u1')), ['school']);
});

test('Switching: a game saved while a menu had the clock paused loads running', () => {
  const store = newStore('university');
  store.setPaused(true);
  const reloaded = GameStore.hydrate(store.serialize())!;
  assert.equal(reloaded.state.paused, false);
});
