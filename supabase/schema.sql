-- MoniMate — Supabase schema (run once in the Supabase SQL editor).
-- Replaces the localStorage accounts (btoa "password hashing") with real Supabase Auth.
-- Every table has Row Level Security ON, so the public anon key in the browser can only
-- ever read/write the signed-in player's own rows.

-- ── 1. Profiles: one row per auth user ─────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null check (char_length(username) between 2 and 24),
  avatar      text not null default 'adam',          -- character sheet id (public/characters/<id>)
  life_path   text not null default 'school'
              check (life_path in ('school','university','international','working')),
  level       int  not null default 1,
  xp          int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- No insert policy: rows are created by the trigger below (security definer), never by the client.

-- Auto-create a profile when someone signs up. `username` comes from signUp(options.data.username).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Game saves: one save slot per (player, life path) ───────────────────
-- Mirrors the current localStorage key `monimate_save_<email>_<lifePath>`.
create table if not exists public.game_saves (
  user_id       uuid not null references auth.users (id) on delete cascade,
  life_path     text not null check (life_path in ('school','university','international','working')),
  save_version  int  not null,                 -- GameState.version, so old saves can be migrated
  game_minutes  int  not null default 0,        -- GameState.minutes, handy for "Week 2, Tue" in a Continue button
  state         jsonb not null,                 -- the whole GameState blob
  updated_at    timestamptz not null default now(),
  primary key (user_id, life_path)
);

alter table public.game_saves enable row level security;

create policy "saves: read own"   on public.game_saves for select using (auth.uid() = user_id);
create policy "saves: insert own" on public.game_saves for insert with check (auth.uid() = user_id);
create policy "saves: update own" on public.game_saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saves: delete own" on public.game_saves for delete using (auth.uid() = user_id);

-- ── 3. (Optional, later) weekly results for a leaderboard ──────────────────
-- Only add this once the School Week is fun. Scores should be computed server-side
-- (an Edge Function) — anything the browser submits directly can be faked.
-- create table public.week_results ( ... );
