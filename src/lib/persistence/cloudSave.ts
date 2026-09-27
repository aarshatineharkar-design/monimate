/**
 * MoniMate — cloud saves with an offline backup.
 *
 * Replaces loadGameSave()/saveGame() from src/lib/auth.ts. Every save is written to localStorage
 * immediately (instant, survives a flaky connection) and to Supabase `game_saves` (survives a new
 * device). On load, whichever copy is newer wins.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../types';

export type LifePath = GameState['lifePath'];

interface LocalEnvelope { savedAt: number; state: GameState }

/** The bit of localStorage we use. Looked up at call time, so this module is safe to import on the
 *  server (no localStorage there) and easy to fake in tests. */
interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const device = (): KeyValueStore | null =>
  (globalThis as unknown as { localStorage?: KeyValueStore }).localStorage ?? null;

const localKey = (userId: string, lifePath: LifePath) => `monimate_save_v2_${userId}_${lifePath}`;

function readLocal(userId: string, lifePath: LifePath): LocalEnvelope | null {
  try {
    const raw = device()?.getItem(localKey(userId, lifePath));
    return raw ? (JSON.parse(raw) as LocalEnvelope) : null;
  } catch { return null; }
}

function writeLocal(userId: string, lifePath: LifePath, state: GameState, savedAt: number) {
  try { device()?.setItem(localKey(userId, lifePath), JSON.stringify({ savedAt, state } satisfies LocalEnvelope)); } catch { /* storage full or blocked */ }
}

/** Load the newest save for this player + life path, or null for a fresh game. */
export async function loadSave(supabase: SupabaseClient, userId: string, lifePath: LifePath): Promise<GameState | null> {
  const local = readLocal(userId, lifePath);
  const { data, error } = await supabase
    .from('game_saves')
    .select('state, updated_at')
    .eq('user_id', userId)
    .eq('life_path', lifePath)
    .maybeSingle();

  if (error || !data) return local?.state ?? null;             // offline or first run: fall back to local
  const cloudAt = new Date(data.updated_at as string).getTime();
  if (local && local.savedAt > cloudAt) return local.state;     // played offline since the last cloud sync
  return data.state as GameState;
}

/** Save now. Local write is synchronous; the cloud write is best-effort and never throws. */
export async function writeSave(supabase: SupabaseClient, userId: string, state: GameState): Promise<boolean> {
  const savedAt = Date.now();
  writeLocal(userId, state.lifePath, state, savedAt);
  const { error } = await supabase.from('game_saves').upsert(
    {
      user_id: userId,
      life_path: state.lifePath,
      save_version: state.version,
      game_minutes: Math.floor(state.minutes),
      state,
      updated_at: new Date(savedAt).toISOString(),
    },
    { onConflict: 'user_id,life_path' },
  );
  if (error) console.warn('[save] cloud save failed, kept local copy:', error.message);
  return !error;
}

/**
 * One-time import of a save made with the OLD localStorage login (keyed by email), so existing
 * testers don't lose their progress when you switch to Supabase Auth.
 */
export function takeLegacySave(email: string, lifePath: LifePath): GameState | null {
  try {
    const key = `monimate_save_${email.toLowerCase()}_${lifePath}`;
    const raw = device()?.getItem(key);
    if (!raw) return null;
    device()?.removeItem(key);
    return JSON.parse(raw) as GameState;
  } catch { return null; }
}

/** Where a saved game is up to, for the path-select screen. */
export interface SaveSummary {
  minutes: number; cash: number | null; savedAt: number;
  /** the level being played, how many are finished, and best stars per level */
  level: number; levelsCompleted: number; stars: Record<string, number>;
}
const ALL_PATHS: LifePath[] = ['school', 'university', 'international', 'working'];

/** Every life path this player has a save for (newest of this device and the cloud). Never throws. */
export async function listSaves(supabase: SupabaseClient, userId: string): Promise<Partial<Record<LifePath, SaveSummary>>> {
  const out: Partial<Record<LifePath, SaveSummary>> = {};
  for (const path of ALL_PATHS) {
    const local = readLocal(userId, path);
    if (local?.state) {
      const st = local.state;
      out[path] = {
        minutes: st.minutes, cash: st.finance?.accounts?.cash ?? null, savedAt: local.savedAt,
        level: st.level ?? 1, levelsCompleted: st.levelsCompleted ?? (st.world?.flags?.includes('level1_complete') ? 1 : 0), stars: st.levelStars ?? {},
      };
    }
  }
  try {
    const { data, error } = await supabase
      .from('game_saves')
      .select('life_path, game_minutes, updated_at, cash:state->finance->accounts->cash, level:state->level, done:state->levelsCompleted, stars:state->levelStars')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) {
      type Row = { life_path: LifePath; game_minutes: number; updated_at: string; cash?: number | null; level?: number | null; done?: number | null; stars?: Record<string, number> | null };
      for (const row of data as Row[]) {
        const at = new Date(row.updated_at).getTime();
        const mine = out[row.life_path];
        if (!mine || at > mine.savedAt) {
          out[row.life_path] = {
            minutes: row.game_minutes, cash: typeof row.cash === 'number' ? row.cash : mine?.cash ?? null, savedAt: at,
            level: row.level ?? mine?.level ?? 1, levelsCompleted: row.done ?? mine?.levelsCompleted ?? 0, stars: row.stars ?? mine?.stars ?? {},
          };
        }
      }
    }
  } catch { /* offline: this device's saves are still listed */ }
  return out;
}

/** Start a life path over: forget this device's copy and the cloud copy. */
export async function deleteSave(supabase: SupabaseClient, userId: string, lifePath: LifePath): Promise<void> {
  try { device()?.removeItem(localKey(userId, lifePath)); } catch { /* blocked storage */ }
  try { await supabase.from('game_saves').delete().eq('user_id', userId).eq('life_path', lifePath); } catch { /* offline */ }
}
