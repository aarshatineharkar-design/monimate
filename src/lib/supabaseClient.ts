// lib/supabaseClient.ts
// Single shared Supabase client for the whole app (auth, cloud saves, leaderboard).
//
// Setup (one-time):
// 1. npm install @supabase/supabase-js --save
// 2. In your Supabase project: Settings > API — copy the "Project URL" and
//    the "anon public" key.
// 3. Add to .env.local (create it if it doesn't exist, and make sure it's
//    in .gitignore — never commit real keys):
//      NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
//      NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
// 4. Run supabase-schema.sql in the Supabase SQL editor once, before using
//    any of the auth/save/leaderboard code that depends on it.
// 5. Restart `npm run dev` after adding the env vars (Next.js only reads
//    .env.local at startup).
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud in dev so a missing .env.local doesn't fail silently later.
  console.warn(
    '⚠️ Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and ' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ===== Types matching the tables in supabase-schema.sql =====
export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

export interface GameSaveRow {
  id: string;
  user_id: string;
  game_mode: 'school' | 'uni';
  day: number;
  week: number;
  state: unknown; // your PlayerState, stored as JSON
  updated_at: string;
}

export interface LeaderboardRow {
  id: string;
  user_id: string;
  game_mode: 'school' | 'uni';
  final_score: number;
  piggy_bank: number;
  playstyle: string;
  best_streak: number;
  completed_at: string;
  profiles?: { username: string }; // populated when joined with profiles
}

// ===== Auth helpers =====
export async function signUp(email: string, password: string, username: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }, // picked up by the handle_new_user() trigger
  });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// ===== Cloud save helpers (replace the localStorage save/resume system) =====
export async function loadCloudSave(userId: string, gameMode: 'school' | 'uni') {
  const { data, error } = await supabase
    .from('game_saves')
    .select('*')
    .eq('user_id', userId)
    .eq('game_mode', gameMode)
    .maybeSingle();
  if (error) { console.error('loadCloudSave failed:', error.message); return null; }
  return data as GameSaveRow | null;
}

export async function writeCloudSave(
  userId: string,
  gameMode: 'school' | 'uni',
  day: number,
  week: number,
  state: unknown
) {
  const { error } = await supabase
    .from('game_saves')
    .upsert(
      { user_id: userId, game_mode: gameMode, day, week, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,game_mode' }
    );
  if (error) console.error('writeCloudSave failed:', error.message);
}

export async function clearCloudSave(userId: string, gameMode: 'school' | 'uni') {
  const { error } = await supabase
    .from('game_saves')
    .delete()
    .eq('user_id', userId)
    .eq('game_mode', gameMode);
  if (error) console.error('clearCloudSave failed:', error.message);
}

// ===== Leaderboard helpers =====
export async function submitScore(
  userId: string,
  gameMode: 'school' | 'uni',
  finalScore: number,
  piggyBank: number,
  playstyle: string,
  bestStreak: number
) {
  // upsert keeps each player's BEST completed run per mode (only overwrite if
  // the new score beats their existing one — done client-side by comparing
  // against the existing row first, since Postgres upsert can't easily do
  // "only if greater" without a trigger).
  const { data: existing } = await supabase
    .from('leaderboard')
    .select('final_score')
    .eq('user_id', userId)
    .eq('game_mode', gameMode)
    .maybeSingle();

  if (existing && existing.final_score >= finalScore) return; // keep their existing best

  const { error } = await supabase
    .from('leaderboard')
    .upsert(
      {
        user_id: userId, game_mode: gameMode, final_score: finalScore,
        piggy_bank: piggyBank, playstyle, best_streak: bestStreak,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,game_mode' }
    );
  if (error) console.error('submitScore failed:', error.message);
}

export async function getLeaderboard(gameMode: 'school' | 'uni', limit = 20) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*, profiles(username)')
    .eq('game_mode', gameMode)
    .order('final_score', { ascending: false })
    .limit(limit);
  if (error) { console.error('getLeaderboard failed:', error.message); return []; }
  return data as LeaderboardRow[];
}