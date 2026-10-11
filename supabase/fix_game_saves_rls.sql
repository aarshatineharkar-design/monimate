-- MoniMate — fix for: new row violates row-level security policy for table "game_saves"
-- Run this once in Supabase → SQL Editor. It is safe to run more than once.
--
-- Row-level security lets a signed-in player read and write ONLY their own save rows
-- (auth.uid() = user_id). This re-creates exactly those rules, and the table grants the
-- `authenticated` role needs, in case the table was created without them.

alter table public.game_saves enable row level security;

grant select, insert, update, delete on public.game_saves to authenticated;

drop policy if exists "saves: read own"   on public.game_saves;
drop policy if exists "saves: insert own" on public.game_saves;
drop policy if exists "saves: update own" on public.game_saves;
drop policy if exists "saves: delete own" on public.game_saves;

create policy "saves: read own"   on public.game_saves for select to authenticated using (auth.uid() = user_id);
create policy "saves: insert own" on public.game_saves for insert to authenticated with check (auth.uid() = user_id);
create policy "saves: update own" on public.game_saves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saves: delete own" on public.game_saves for delete to authenticated using (auth.uid() = user_id);

-- Check: this should list the four policies above.
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'game_saves';
