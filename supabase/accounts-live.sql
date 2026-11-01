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

-- ═══════════════════════════════════════════════════════════════════════════
-- Dashboard access: first-admin bootstrap + role requests
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.access_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in ('reviewer','admin')),
  note           text not null default '' check (length(note) <= 500),
  status         text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at     timestamptz not null default now(),
  decided_by     uuid references auth.users(id) on delete set null,
  decided_at     timestamptz
);
create unique index if not exists access_requests_one_pending on public.access_requests(user_id) where status = 'pending';
alter table public.access_requests enable row level security;
drop policy if exists "access: own" on public.access_requests;
create policy "access: own" on public.access_requests for select using (user_id = auth.uid());
drop policy if exists "access: admin" on public.access_requests;
create policy "access: admin" on public.access_requests for all using (public.is_admin()) with check (public.is_admin());

-- role changes made by these trusted functions pass the profile guard
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('hw.role_change_ok', true), '') <> 'on'
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'only admins change role or status';
  end if;
  return new;
end $$;

-- is there an admin yet? (lets the dashboard offer "Become the first admin")
create or replace function public.has_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.profiles where role = 'admin');
$$;
grant execute on function public.has_admin() to anon, authenticated;

-- the first confirmed account may make itself admin — only while NO admin exists
create or replace function public.claim_first_admin() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext('hw_claim_first_admin'));
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'This project already has an admin. Ask them to give you access.';
  end if;
  if not exists (select 1 from auth.users where id = auth.uid() and (email_confirmed_at is not null or confirmed_at is not null)) then
    raise exception 'Confirm your e-mail address first.';
  end if;
  perform public.ensure_profile();
  perform set_config('hw.role_change_ok', 'on', true);
  update public.profiles set role = 'admin', status = 'approved' where id = auth.uid() returning * into r;
  perform set_config('hw.role_change_ok', '', true);
  return r;
end $$;
revoke all on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;

-- ask for reviewer / admin access (one pending request per person)
create or replace function public.request_access(p_role text, p_note text default '') returns public.access_requests
language plpgsql security definer set search_path = public as $$
declare r public.access_requests;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_role not in ('reviewer', 'admin') then raise exception 'unknown role %', p_role; end if;
  update public.access_requests set requested_role = p_role, note = left(coalesce(p_note, ''), 500), created_at = now()
   where user_id = auth.uid() and status = 'pending' returning * into r;
  if r.id is null then
    insert into public.access_requests (user_id, requested_role, note) values (auth.uid(), p_role, left(coalesce(p_note, ''), 500)) returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.request_access(text, text) from public, anon;
grant execute on function public.request_access(text, text) to authenticated;

-- admin approves / declines
create or replace function public.decide_access(p_id uuid, p_approve boolean) returns public.access_requests
language plpgsql security definer set search_path = public as $$
declare r public.access_requests;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.access_requests set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending' returning * into r;
  if r.id is null then raise exception 'request not found or already decided'; end if;
  if p_approve then update public.profiles set role = r.requested_role, status = 'approved' where id = r.user_id; end if;
  return r;
end $$;
revoke all on function public.decide_access(uuid, boolean) from public, anon;
grant execute on function public.decide_access(uuid, boolean) to authenticated;

-- a role chosen on the sign-up form becomes a pending request
create or replace function public.access_from_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare want text;
begin
  select raw_user_meta_data->>'requested_role' into want from auth.users where id = new.id;
  if want in ('reviewer', 'admin') then
    insert into public.access_requests (user_id, requested_role, note) values (new.id, want, 'Requested at sign-up') on conflict do nothing;
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists access_from_signup on public.profiles;
create trigger access_from_signup after insert on public.profiles for each row execute function public.access_from_signup();
