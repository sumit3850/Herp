-- ═══════════════════════════════════════════════════════════════════════════
-- HerpWatch — ONE account for app + dashboard, and live checklist updates.
-- Safe to re-run. Run AFTER schema.sql and seed.sql (setup.sql already includes it).
--
--  • Every auth user gets exactly one profile, whichever screen they signed up on
--    (field app or dashboard: same Supabase Auth, same e-mail, same password).
--  • Sign-up can never fail because a username is taken: a suffix is added.
--  • Accounts created before the database existed are backfilled, and
--    ensure_profile() lets the apps repair a missing profile on sign-in.
--  • Checklist / species / price edits are broadcast over Supabase Realtime so
--    the field app refreshes as soon as an admin saves a change.
-- ═══════════════════════════════════════════════════════════════════════════

-- build a free username from the requested one (or the e-mail) ------------------
create or replace function public.free_username(p_wanted text, p_email text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare base text; cand text; i int := 0;
begin
  base := lower(regexp_replace(coalesce(nullif(p_wanted, ''), split_part(coalesce(p_email, ''), '@', 1), 'user'), '[^a-z0-9_.-]+', '', 'gi'));
  if length(base) < 3 then base := base || substr(md5(p_id::text), 1, 4); end if;
  base := left(base, 26);
  cand := base;
  while exists (select 1 from public.profiles where lower(username) = cand and id <> p_id) loop
    i := i + 1;
    cand := base || '-' || substr(md5(p_id::text || i), 1, 3);
  end loop;
  return cand;
end $$;

-- create (or complete) the profile for one auth user ----------------------------
create or replace function public.create_profile_for(p_id uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare u auth.users; md jsonb; reg text; r public.profiles;
begin
  select * into u from auth.users where id = p_id;
  if u.id is null then return null; end if;
  md := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  reg := nullif(md->>'home_region', '');
  if reg is not null and not exists (select 1 from public.regions where code = reg) then reg := null; end if;
  insert into public.profiles (id, email, username, full_name, phone, home_region)
  values (u.id, coalesce(u.email, ''),
          public.free_username(md->>'username', u.email, u.id),
          coalesce(nullif(md->>'full_name', ''), nullif(md->>'name', ''), ''),   -- 'name' = Google sign-in
          coalesce(md->>'phone', ''), reg)
  on conflict (id) do update set email = excluded.email
  returning * into r;
  return r;
end $$;

-- trigger: runs for EVERY new account (app, dashboard, Google) ------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.create_profile_for(new.id);
  exception when others then
    -- never block sign-up; the app repairs the profile on first sign-in
    raise warning 'profile for % not created: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep profile e-mail in step when a user changes it ---------------------------
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();

-- called by the apps right after sign-in: repairs a missing profile -------------
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then return null; end if;
  select * into r from public.profiles where id = auth.uid();
  if r.id is null then r := public.create_profile_for(auth.uid()); end if;
  return r;
end $$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
revoke all on function public.create_profile_for(uuid) from public, anon, authenticated;
revoke all on function public.free_username(text, text, uuid) from public, anon, authenticated;

-- backfill: accounts created before this script (e.g. signed up before setup) --
do $$ begin
  perform public.create_profile_for(u.id) from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id);
  -- fill a home state that could not be resolved when the profile was first made
  update public.profiles p set home_region = u.raw_user_meta_data->>'home_region'
  from auth.users u
  where u.id = p.id and p.home_region is null
    and exists (select 1 from public.regions r where r.code = u.raw_user_meta_data->>'home_region');
end $$;

-- public checklist status per region (native / endemic / introduced / vagrant / uncertain)
-- already readable via the "read all" policy on public.checklist.

-- aggregate health numbers for the read-only backend check (no personal data) --
create or replace function public.backend_status() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'profiles', (select count(*) from public.profiles),
    'users_without_profile', (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)),
    'admins', (select count(*) from public.profiles where role = 'admin'),
    'unconfirmed_emails', (select count(*) from auth.users where email_confirmed_at is null and confirmed_at is null),
    'realtime_tables', (select coalesce(jsonb_agg(tablename order by tablename), '[]') from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'));
$$;
grant execute on function public.backend_status() to anon, authenticated;

-- realtime: broadcast catalogue edits so the field app updates live --------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found (not a Supabase database?) — skipping';
    return;
  end if;
  foreach t in array array['checklist', 'species', 'pack_prices'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
