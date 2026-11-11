-- Mycelink database setup.
-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It is safe to run again.
--
-- The rules in plain words:
--   * A member can only read and change their own rows.
--   * An admin can read everyone's rows, and cannot change them.
--   * Nobody can make themselves an admin from the website.

-- ---------- members ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 60),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table public.profiles enable row level security;

-- True when the signed-in person is an admin.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Make a profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, left(new.raw_user_meta_data ->> 'display_name', 60))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may only change their name and "last seen". Never is_admin.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, last_seen_at) on public.profiles to authenticated;

drop policy if exists "read own profile or admin reads all" on public.profiles;
create policy "read own profile or admin reads all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------- trading journal ----------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tool text not null check (tool in ('tradingview', 'dexscreener', 'coinmarketcap', 'checkonchain')),
  symbol text check (char_length(symbol) <= 160),
  chart_url text check (char_length(chart_url) <= 500),
  note text check (char_length(note) <= 5000),
  side text check (side in ('buy', 'sell')),
  entry_price numeric check (entry_price >= 0),
  exit_price numeric check (exit_price >= 0),
  outcome text check (outcome in ('open', 'win', 'loss', 'breakeven'))
);
alter table public.journal_entries enable row level security;
create index if not exists journal_entries_user_created on public.journal_entries (user_id, created_at desc);

revoke all on public.journal_entries from anon, authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;

drop policy if exists "read own journal or admin reads all" on public.journal_entries;
create policy "read own journal or admin reads all" on public.journal_entries
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "add to own journal" on public.journal_entries;
create policy "add to own journal" on public.journal_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "change own journal" on public.journal_entries;
create policy "change own journal" on public.journal_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "delete from own journal" on public.journal_entries;
create policy "delete from own journal" on public.journal_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- what members open (for the admin view) ----------
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  tool text not null check (tool in ('tradingview', 'dexscreener', 'coinmarketcap', 'checkonchain')),
  detail text check (char_length(detail) <= 160)
);
alter table public.activity enable row level security;
create index if not exists activity_user_created on public.activity (user_id, created_at desc);

revoke all on public.activity from anon, authenticated;
grant select, insert on public.activity to authenticated;

drop policy if exists "read own activity or admin reads all" on public.activity;
create policy "read own activity or admin reads all" on public.activity
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "record own activity" on public.activity;
create policy "record own activity" on public.activity
  for insert to authenticated
  with check (user_id = (select auth.uid()));
