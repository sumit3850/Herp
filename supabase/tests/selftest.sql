-- ═══════════════════════════════════════════════════════════════════════════
-- HerpWatch — end-to-end database self-test
--
-- Paste into Supabase → SQL Editor → Run (after setup.sql). It shows one row per
-- check with ok = true/false.
--
-- It creates temporary test accounts (field user, reviewer, admin, blocked user),
-- acts as each of them, as a signed-out visitor and as the payment server, through
-- every flow the apps use — and then ROLLS EVERYTHING BACK. Nothing it creates is
-- kept; your real data is never modified.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.hw_selftest()
returns table(area text, test text, ok boolean, detail text)
language plpgsql as $$
declare
  r jsonb := '[]';
  F  uuid := '00000000-0000-4000-8000-00000000f001';  -- field user
  RV uuid := '00000000-0000-4000-8000-00000000f002';  -- reviewer
  AD uuid := '00000000-0000-4000-8000-00000000f003';  -- admin
  BL uuid := '00000000-0000-4000-8000-00000000f004';  -- blocked
  DU uuid := '00000000-0000-4000-8000-00000000f005';  -- same username as F
  T1 uuid := '00000000-0000-4000-8000-0000000a0001';  -- field user's checklist
  T2 uuid := '00000000-0000-4000-8000-0000000a0002';  -- admin's checklist
  S1 uuid := '00000000-0000-4000-8000-0000000b0001';
  RS uuid := '00000000-0000-4000-8000-0000000c0001';
  g_pack text; g_region text; other_sp text; sens_sp text; any_sp text; extra_sp text;
  n bigint; v text; b boolean;
  claims_anon constant text := '{"role":"anon"}';
begin
  begin  -- everything below is undone by the exception at the end
    -- ── fixtures (as the database owner) ────────────────────────────────────
    perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
    select c.region_code, s.pack_id into g_region, g_pack
      from public.checklist c join public.species s on s.id = c.species_id
      where c.region_code like '%-%' group by 1, 2 order by count(*) desc limit 1;
    select id into other_sp from public.species where pack_id <> g_pack limit 1;
    select id into sens_sp from public.species where sensitive limit 1;
    select id into any_sp from public.species limit 1;
    select s.id into extra_sp from public.species s where not exists (select 1 from public.checklist c where c.region_code = g_region and c.species_id = s.id) limit 1;
    r := r || jsonb_build_object('a','0 setup','t','catalogue present (species, checklist, a region+pack to test with)','ok', any_sp is not null and g_region is not null,'d', format('testing with %s pack in %s', g_pack, g_region));

    insert into auth.users (id, email, raw_user_meta_data, aud, role) values
      (F,  'hwtest.field@example.invalid',  jsonb_build_object('username','hwtest_field','full_name','Test Field','home_region', g_region), 'authenticated','authenticated'),
      (RV, 'hwtest.review@example.invalid', '{"username":"hwtest_rev"}', 'authenticated','authenticated'),
      (AD, 'hwtest.admin@example.invalid',  '{"username":"hwtest_admin"}', 'authenticated','authenticated'),
      (BL, 'hwtest.block@example.invalid',  '{"username":"hwtest_block"}', 'authenticated','authenticated'),
      (DU, 'hwtest.dup@example.invalid',    '{"username":"hwtest_field"}', 'authenticated','authenticated');

    select count(*) into n from public.profiles where id in (F, RV, AD, BL, DU);
    r := r || jsonb_build_object('a','1 accounts','t','sign-up creates a profile for every account','ok', n = 5,'d', n || ' of 5');
    select username into v from public.profiles where id = DU;
    r := r || jsonb_build_object('a','1 accounts','t','taken username never blocks sign-up','ok', v is not null and v <> 'hwtest_field','d', 'second "hwtest_field" became ' || coalesce(v, 'NULL'));
    select home_region into v from public.profiles where id = F;
    r := r || jsonb_build_object('a','1 accounts','t','home state saved from sign-up','ok', v = g_region,'d', coalesce(v, 'NULL'));
    select email into v from public.profiles where id = F;
    r := r || jsonb_build_object('a','1 accounts','t','profile stores the login e-mail (one account for app + dashboard)','ok', v = 'hwtest.field@example.invalid','d', coalesce(v, 'NULL'));

    update public.profiles set role = 'reviewer' where id = RV;
    update public.profiles set role = 'admin' where id = AD;
    update public.profiles set status = 'blocked' where id = BL;
    select count(*) into n from public.audit_log where tbl = 'profiles' and row_key in (RV::text, AD::text, BL::text);
    r := r || jsonb_build_object('a','1 accounts','t','role/status changes are written to the audit log','ok', n >= 3,'d', n || ' entries');

    insert into public.trips (id, user_id, region_code, protocol, started_at) values (T2, AD, g_region, 'stationary', now() - interval '1 day');

    -- ── signed-out visitor ───────────────────────────────────────────────────
    perform set_config('request.jwt.claims', claims_anon, true); perform set_config('request.jwt.claim.sub', '', true);
    set local role anon;
    select count(*) into n from public.species_index;  r := r || jsonb_build_object('a','2 visitor','t','free species index is readable','ok', n > 0,'d', n || ' species');
    select count(*) into n from public.species;        r := r || jsonb_build_object('a','2 visitor','t','paid field-guide content is hidden','ok', n = 0,'d', n || ' rows visible');
    select count(*) into n from public.checklist;      r := r || jsonb_build_object('a','2 visitor','t','core checklists are readable','ok', n > 0,'d', n || ' entries');
    select count(*) into n from public.profiles;       r := r || jsonb_build_object('a','2 visitor','t','no user profiles are visible','ok', n = 0,'d', n || ' rows');
    select (public.public_stats() ? 'totals') into b;   r := r || jsonb_build_object('a','2 visitor','t','website report statistics work','ok', b,'d', '');
    begin
      insert into public.trips (id, user_id, started_at) values (gen_random_uuid(), F, now());
      r := r || jsonb_build_object('a','2 visitor','t','cannot submit records without signing in','ok', false,'d', 'insert succeeded');
    exception when others then r := r || jsonb_build_object('a','2 visitor','t','cannot submit records without signing in','ok', true,'d', sqlerrm); end;
    insert into public.feedback (name, r_overall, comment, page) values ('hwtest visitor', 5, 'great app', 'selftest');
    r := r || jsonb_build_object('a','2 visitor','t','can send feedback without an account','ok', true,'d', '');
    select count(*) into n from public.feedback;
    r := r || jsonb_build_object('a','2 visitor','t','cannot read anyone''s feedback','ok', n = 0,'d', n || ' visible');
    begin
      insert into public.feedback (name, r_overall) values ('x', 9);
      r := r || jsonb_build_object('a','2 visitor','t','invalid ratings are rejected','ok', false,'d', 'rating 9 accepted');
    exception when others then r := r || jsonb_build_object('a','2 visitor','t','invalid ratings are rejected','ok', true,'d', sqlerrm); end;
    reset role;

    -- ── field user ───────────────────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', F, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', F::text, true);
    set local role authenticated;
    select count(*) into n from public.profiles;
    r := r || jsonb_build_object('a','3 field user','t','sees only their own profile','ok', n = 1,'d', n || ' visible');
    begin
      update public.profiles set role = 'admin' where id = F;
      r := r || jsonb_build_object('a','3 field user','t','cannot make themselves admin','ok', false,'d', 'role changed');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot make themselves admin','ok', true,'d', sqlerrm); end;
    update public.profiles set full_name = 'Test Field Renamed' where id = F;
    get diagnostics n = row_count;
    r := r || jsonb_build_object('a','3 field user','t','can edit their own name','ok', n = 1,'d', '');

    insert into public.trips (id, user_id, region_code, protocol, started_at, ended_at, duration_min, distance_km, observers, complete, track, lat, lng)
    values (T1, F, g_region, 'traveling', now() - interval '2 hours', now() - interval '1 hour', 60, 2.4, 1, true, '[[11.6,92.7],[11.61,92.71]]', 11.6, 92.7);
    insert into public.sightings (id, trip_id, user_id, species_id, count, lat, lng, region_code, review_status)
    values (S1, T1, F, any_sp, 2, 11.6012, 92.7034, g_region, 'accepted');
    select review_status into v from public.sightings where id = S1;
    r := r || jsonb_build_object('a','3 field user','t','can submit a checklist with sightings','ok', v is not null,'d', '');
    r := r || jsonb_build_object('a','3 field user','t','cannot self-accept: new sightings are always pending','ok', v = 'pending','d', 'stored as ' || coalesce(v, 'NULL'));
    begin
      insert into public.sightings (id, trip_id, user_id, species_id, count, region_code) values (gen_random_uuid(), null, AD, any_sp, 1, g_region);
      r := r || jsonb_build_object('a','3 field user','t','cannot submit records as someone else','ok', false,'d', 'insert succeeded');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot submit records as someone else','ok', true,'d', sqlerrm); end;
    begin
      insert into public.sightings (id, trip_id, user_id, species_id, count, region_code) values (gen_random_uuid(), T2, F, any_sp, 1, g_region);
      r := r || jsonb_build_object('a','3 field user','t','cannot add records to another person''s checklist','ok', false,'d', 'insert succeeded');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot add records to another person''s checklist','ok', true,'d', sqlerrm); end;
    begin
      insert into public.sightings (id, trip_id, user_id, species_id, count, lat, lng, region_code) values (gen_random_uuid(), T1, F, any_sp, 1, 123.4, 92.7, g_region);
      r := r || jsonb_build_object('a','3 field user','t','impossible coordinates are rejected','ok', false,'d', 'lat 123.4 accepted');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','impossible coordinates are rejected','ok', true,'d', sqlerrm); end;
    select count(*) into n from public.trips where user_id = AD;
    r := r || jsonb_build_object('a','3 field user','t','cannot see other people''s checklists','ok', n = 0,'d', n || ' visible');
    insert into public.roadkill_surveys (id, user_id, region_code, mode, road_name, road_type, started_at, ended_at, distance_km, track)
    values (RS, F, g_region, 'car', 'Test Road', 'highway', now() - interval '3 hours', now() - interval '2 hours', 12.5, '[[11.6,92.7],[11.7,92.75]]');
    insert into public.roadkill_records (id, survey_id, user_id, species_id, pack, count, lat, lng, region_code, condition)
    values (gen_random_uuid(), RS, F, any_sp, g_pack, 1, 11.65, 92.72, g_region, 'fresh');
    select count(*) into n from public.roadkill_records where survey_id = RS;
    r := r || jsonb_build_object('a','3 field user','t','can log a road-kill survey with records','ok', n = 1,'d', '');
    select count(*) into n from public.species_full;
    r := r || jsonb_build_object('a','3 field user','t','no paid content before buying a pack','ok', n = 0,'d', n || ' visible');
    begin
      insert into public.entitlements (user_id, pack_id, region_code) values (F, g_pack, 'IN');
      r := r || jsonb_build_object('a','3 field user','t','cannot give themselves a pack','ok', false,'d', 'insert succeeded');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot give themselves a pack','ok', true,'d', sqlerrm); end;
    begin
      perform public.grant_pack(F, g_pack, 'IN', 365);
      r := r || jsonb_build_object('a','3 field user','t','cannot call the admin grant function','ok', false,'d', 'granted');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot call the admin grant function','ok', true,'d', sqlerrm); end;
    begin
      insert into public.checklist (region_code, species_id) values (g_region, extra_sp);
      r := r || jsonb_build_object('a','3 field user','t','cannot edit core checklists','ok', false,'d', 'insert succeeded');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot edit core checklists','ok', true,'d', sqlerrm); end;
    begin
      perform public.claim_first_admin();
      r := r || jsonb_build_object('a','3 field user','t','cannot claim admin once an admin exists','ok', false,'d', 'claimed');
    exception when others then r := r || jsonb_build_object('a','3 field user','t','cannot claim admin once an admin exists','ok', true,'d', sqlerrm); end;
    perform public.request_access('reviewer', 'I run night walks in this state');
    select count(*) into n from public.access_requests where user_id = F and status = 'pending';
    r := r || jsonb_build_object('a','3 field user','t','can request reviewer access','ok', n = 1,'d', '');
    select count(*) into n from public.audit_log;
    r := r || jsonb_build_object('a','3 field user','t','cannot read the audit log','ok', n = 0,'d', n || ' visible');
    reset role;

    -- ── blocked user ─────────────────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', BL, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', BL::text, true);
    set local role authenticated;
    begin
      insert into public.trips (id, user_id, started_at) values (gen_random_uuid(), BL, now());
      r := r || jsonb_build_object('a','4 blocked user','t','blocked accounts cannot submit','ok', false,'d', 'insert succeeded');
    exception when others then r := r || jsonb_build_object('a','4 blocked user','t','blocked accounts cannot submit','ok', true,'d', sqlerrm); end;
    reset role;

    -- ── admin ────────────────────────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', AD, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', AD::text, true);
    set local role authenticated;
    select count(*) into n from public.profiles where id in (F, RV, AD, BL, DU);
    r := r || jsonb_build_object('a','5 admin','t','sees all users','ok', n = 5,'d', n || ' of 5 test users');
    perform public.grant_pack(F, g_pack, g_region, 365);
    r := r || jsonb_build_object('a','5 admin','t','can grant a pack','ok', true,'d', g_pack || ' @ ' || g_region);
    if extra_sp is not null then
      insert into public.checklist (region_code, species_id, status) values (g_region, extra_sp, 'vagrant');
      update public.checklist set status = 'introduced' where region_code = g_region and species_id = extra_sp;
      delete from public.checklist where region_code = g_region and species_id = extra_sp;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('a','5 admin','t','can add, re-status and remove checklist species','ok', n = 1,'d', extra_sp || ' in ' || g_region);
      select count(*) into n from public.audit_log where tbl = 'checklist' and actor = AD and row_key = g_region || ':' || extra_sp;
      r := r || jsonb_build_object('a','5 admin','t','checklist edits are audited (who/what/when)','ok', n = 3,'d', n || ' entries');
    end if;
    update public.species set common_name = common_name where id = any_sp;
    get diagnostics n = row_count;
    r := r || jsonb_build_object('a','5 admin','t','can edit species','ok', n = 1,'d', '');
    select count(*) into n from public.trips where id = T1;
    r := r || jsonb_build_object('a','5 admin','t','sees every submitted checklist','ok', n = 1,'d', '');
    perform public.decide_access((select id from public.access_requests where user_id = F and status = 'pending'), true);
    select role into v from public.profiles where id = F;
    r := r || jsonb_build_object('a','5 admin','t','approving a request grants the role','ok', v = 'reviewer','d', 'field user is now ' || coalesce(v, '?'));
    perform set_config('hw.role_change_ok', '', true);
    update public.profiles set role = 'user' where id = F;   -- back to a plain field user for the next tests
    select count(*) into n from public.feedback where page = 'selftest';
    r := r || jsonb_build_object('a','5 admin','t','can read feedback','ok', n = 1,'d', n || ' test feedback');
    select count(*) into n from public.audit_log;
    r := r || jsonb_build_object('a','5 admin','t','can read the audit log','ok', n > 0,'d', n || ' entries');
    reset role;

    -- ── field user again: pack unlocked ──────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', F, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', F::text, true);
    set local role authenticated;
    select count(*), bool_and(pack_id = g_pack) into n, b from public.species_full;
    r := r || jsonb_build_object('a','6 purchase','t','granted pack unlocks exactly that pack in that region','ok', n > 0 and b,'d', n || ' species unlocked');
    select count(*) into n from public.species_full where id = other_sp;
    r := r || jsonb_build_object('a','6 purchase','t','other packs stay locked','ok', n = 0,'d', '');
    reset role;

    -- ── reviewer ─────────────────────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', RV, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', RV::text, true);
    set local role authenticated;
    select count(*) into n from public.sightings where id = S1;
    r := r || jsonb_build_object('a','7 reviewer','t','sees submissions from every observer','ok', n = 1,'d', '');
    update public.sightings set review_status = 'accepted' where id = S1;
    select reviewed_by = RV and reviewed_at is not null into b from public.sightings where id = S1;
    r := r || jsonb_build_object('a','7 reviewer','t','accepting a record stores who reviewed it and when','ok', coalesce(b, false),'d', '');
    update public.species set common_name = 'x' where id = any_sp;
    get diagnostics n = row_count;
    r := r || jsonb_build_object('a','7 reviewer','t','cannot edit species (admin only)','ok', n = 0,'d', n || ' rows changed');
    begin
      update public.profiles set role = 'admin' where id = F;
      get diagnostics n = row_count;
      r := r || jsonb_build_object('a','7 reviewer','t','cannot change user roles','ok', n = 0,'d', n || ' rows changed');
    exception when others then r := r || jsonb_build_object('a','7 reviewer','t','cannot change user roles','ok', true,'d', sqlerrm); end;
    reset role;

    -- ── field user edits an accepted record → back to review ─────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', F, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', F::text, true);
    set local role authenticated;
    update public.sightings set count = 3 where id = S1;
    select review_status into v from public.sightings where id = S1;
    r := r || jsonb_build_object('a','7 reviewer','t','an edited record goes back to pending review','ok', v = 'pending','d', v);
    reset role;

    -- ── payment server (Edge Function with the service-role key) ─────────────
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true); perform set_config('request.jwt.claim.sub', '', true);
    set local role service_role;
    insert into public.orders (id, user_id, items, amount_paise, status) values ('order_hwtest_1', F, jsonb_build_array(jsonb_build_object('pack', g_pack, 'region', 'IN', 'paise', 100, 'days', 365)), 100, 'paid');
    insert into public.entitlements (user_id, pack_id, region_code, source, order_id, payment_ref, valid_until)
    values (F, g_pack, 'IN', 'razorpay', 'order_hwtest_1', 'pay_hwtest_1', now() + interval '365 days');
    r := r || jsonb_build_object('a','8 payments','t','payment webhook can record orders and grant packs','ok', true,'d', '');
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', F, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', F::text, true);
    set local role authenticated;
    select count(*) into n from public.entitlements where user_id = F;
    r := r || jsonb_build_object('a','8 payments','t','buyer sees their packs (grant + purchase)','ok', n = 2,'d', n || ' packs');
    select count(*) into n from public.orders;
    r := r || jsonb_build_object('a','8 payments','t','buyer sees only their own orders','ok', n = 1,'d', n || ' visible');
    reset role;

    -- ── public map privacy ───────────────────────────────────────────────────
    perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
    if sens_sp is not null then
      insert into public.sightings (id, trip_id, user_id, species_id, count, lat, lng, region_code) values (gen_random_uuid(), T1, F, sens_sp, 1, 11.6789, 92.7123, g_region);
      perform set_config('request.jwt.claims', claims_anon, true);
      set local role anon;
      select count(*) into n from public.public_points() p where p.species_id = sens_sp and p.lat = 11.7 and p.lng = 92.7;
      r := r || jsonb_build_object('a','9 privacy','t','sensitive species are blurred to ~10 km on public maps','ok', n >= 1,'d', '11.6789, 92.7123 → 11.7, 92.7');
      select count(*) into n from public.public_points() p where p.lat = 11.6789;
      r := r || jsonb_build_object('a','9 privacy','t','exact coordinates never reach the public','ok', n = 0,'d', '');
      reset role;
    end if;

    -- ── self-repair + live updates ───────────────────────────────────────────
    perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
    delete from public.profiles where id = DU;
    perform set_config('request.jwt.claims', json_build_object('sub', DU, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', DU::text, true);
    set local role authenticated;
    select (public.ensure_profile()).id = DU into b;
    r := r || jsonb_build_object('a','10 platform','t','missing profile is repaired on sign-in','ok', coalesce(b, false),'d', '');
    reset role;
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('checklist', 'species', 'pack_prices');
      r := r || jsonb_build_object('a','10 platform','t','checklist/species/price edits stream live to the app','ok', n = 3,'d', n || ' of 3 tables in realtime');
    end if;
    select count(*) into n from storage.buckets where id in ('photos', 'species');
    r := r || jsonb_build_object('a','10 platform','t','photo storage buckets exist','ok', n = 2,'d', n || ' of 2');

    raise exception 'HW_SELFTEST_DONE';
  exception when others then
    if sqlerrm <> 'HW_SELFTEST_DONE' then
      r := r || jsonb_build_object('a','!! error','t','test run stopped unexpectedly','ok', false,'d', sqlerrm);
    end if;
  end;
  return query select x->>'a', x->>'t', (x->>'ok')::boolean, x->>'d' from jsonb_array_elements(r) x;
end $$;
revoke all on function public.hw_selftest() from public, anon, authenticated;

select * from public.hw_selftest();
