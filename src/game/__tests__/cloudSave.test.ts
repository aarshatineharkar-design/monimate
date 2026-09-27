/**
 * MoniMate — cloud saves: this device first (instant), Supabase second; the newer copy wins on
 * load; old pre-Supabase saves are imported once. Uses a fake Supabase client and localStorage.
 */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSave, writeSave, takeLegacySave } from '../../lib/persistence/cloudSave';
import { GameStore, createInitialState } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath } from '../../lib/gameData';

// ── tiny fakes ───────────────────────────────────────────────────────────────
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: object }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};
function fakeSupabase(opts: { offline?: boolean } = {}) {
  const rows = new Map<string, { state: unknown; updated_at: string }>();
  const client = {
    rows,
    from() {
      const filters: Record<string, string> = {};
      const q = {
        select() { return q; },
        eq(col: string, v: string) { filters[col] = v; return q; },
        async maybeSingle() {
          if (opts.offline) return { data: null, error: { message: 'offline' } };
          return { data: rows.get(`${filters.user_id}|${filters.life_path}`) ?? null, error: null };
        },
        async upsert(row: { user_id: string; life_path: string; state: unknown; updated_at: string }) {
          if (opts.offline) return { error: { message: 'offline' } };
          rows.set(`${row.user_id}|${row.life_path}`, { state: row.state, updated_at: row.updated_at });
          return { error: null };
        },
      };
      return q;
    },
  };
  return client as unknown as SupabaseClient & { rows: typeof rows };
}
const SCHOOL = getLifePath('school');
const freshState = (cash = 0) => {
  const st = createInitialState('school', makeInitialFinance(SCHOOL), makeInitialGoals(SCHOOL));
  st.finance.accounts.cash = cash;
  return st;
};
beforeEach(() => mem.clear());

test('Cloud save: a save round-trips through Supabase and loads back into a GameStore', async () => {
  const sb = fakeSupabase();
  assert.equal(await writeSave(sb, 'u1', freshState(12.5)), true);
  const loaded = await loadSave(sb, 'u1', 'school');
  assert.equal(loaded?.finance.accounts.cash, 12.5);
  assert.equal(GameStore.hydrate(JSON.stringify(loaded))?.cash, 12.5);
});

test('Cloud save: offline still saves on this device, and loads it back', async () => {
  const sb = fakeSupabase({ offline: true });
  assert.equal(await writeSave(sb, 'u1', freshState(7)), false, 'cloud write failed…');
  assert.equal((await loadSave(sb, 'u1', 'school'))?.finance.accounts.cash, 7, '…but nothing was lost');
});

test('Cloud save: when this device has newer progress than the cloud (played offline), the device wins', async () => {
  const sb = fakeSupabase();
  await writeSave(sb, 'u1', freshState(5));
  const row = sb.rows.get('u1|school')!;
  row.updated_at = new Date(Date.now() - 60_000).toISOString(); // cloud copy is a minute older
  mem.set('monimate_save_v2_u1_school', JSON.stringify({ savedAt: Date.now(), state: freshState(9) }));
  assert.equal((await loadSave(sb, 'u1', 'school'))?.finance.accounts.cash, 9);
});

test('Cloud save: on a new device the cloud copy is used', async () => {
  const sb = fakeSupabase();
  await writeSave(sb, 'u1', freshState(11));
  mem.clear(); // new laptop
  assert.equal((await loadSave(sb, 'u1', 'school'))?.finance.accounts.cash, 11);
});

test('Cloud save: saves are per player — another account never sees yours', async () => {
  const sb = fakeSupabase();
  await writeSave(sb, 'u1', freshState(3));
  mem.clear();
  assert.equal(await loadSave(sb, 'u2', 'school'), null);
});

test('Legacy import: a save from the old email-based login is picked up once, then removed', () => {
  mem.set('monimate_save_aarsh@test.nz_school', JSON.stringify(freshState(4)));
  assert.equal(takeLegacySave('Aarsh@Test.nz', 'school')?.finance.accounts.cash, 4);
  assert.equal(takeLegacySave('aarsh@test.nz', 'school'), null);
});
