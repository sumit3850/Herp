/* HerpWatch — shared data layer for app.html, admin.html and index.html.
 *
 * HW.api exposes ONE interface with two back-ends:
 *   • Supabase  (config.js has SUPABASE_URL)  — production; RLS enforces access
 *   • Demo      (no URL)                     — localStorage, seed catalogue, instant "purchases"
 * Pages never talk to Supabase directly, so both modes behave the same.
 */
(function () {
  const C = window.HW_CONFIG || {};
  const SEED = window.HW_SEED;
  const DEMO = !C.SUPABASE_URL;
  // navigator.onLine lies on many phones, so connectivity = the outcome of the last real request.
  // Every request is capped (no endless "Saving…" with a weak signal).
  const net = { ok: true, at: 0 };
  const setNet = (okNow) => { if (net.ok !== okNow) { net.ok = okNow; dispatchEvent(new CustomEvent('hw-net', { detail: okNow })); } net.at = Date.now(); };
  const timedFetch = async (url, opts = {}) => {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), /\/functions\/v1\//.test(String(url)) ? 30000 : 15000);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); setNet(true); return r; }
    catch (e) { setNet(false); throw new Error(e.name === 'AbortError' ? 'No connection (request timed out)' : 'No connection'); }
    finally { clearTimeout(t); }
  };
  // e-mail links (confirm / reset password) arrive as #access_token=…&type=recovery or #error=…
  const _linkParams = new URLSearchParams((location.hash || '').replace(/^#/, '') + '&' + (location.search || '').replace(/^\?/, ''));
  let _recovery = _linkParams.get('type') === 'recovery';
  const _linkError = _linkParams.get('error_description') || _linkParams.get('error') || '';
  const sb = !DEMO && window.supabase ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { global: { fetch: timedFetch } }) : null;
  const authListeners = new Set();
  if (sb) sb.auth.onAuthStateChange((evt, session) => { if (evt === 'PASSWORD_RECOVERY') _recovery = true; authListeners.forEach((f) => { try { f(evt, session); } catch {} }); });
  // Plain-language versions of Supabase Auth errors, incl. the built-in mailer limits
  function authError(error, email) {
    const m = String(error?.message || error || ''), code = error?.code || error?.error_code || '';
    if (/rate limit/i.test(m) || code === 'over_email_send_rate_limit' || error?.status === 429)
      return codedError('email_rate_limit', 'Too many e-mails were sent in a short time. Supabase’s built-in mailer allows only a few per hour, so please wait a while and try again (the admin can add their own e-mail server in Supabase to remove this limit).');
    if (/not authorized/i.test(m) || code === 'email_address_not_authorized')
      return codedError('email_not_authorized', `Supabase’s built-in mailer can only send to the project team’s addresses, so ${email || 'this address'} was refused. The admin needs to set up an e-mail server (SMTP) in Supabase, or turn off "Confirm email".`);
    if (/error sending|sending.*email|smtp/i.test(m))
      return codedError('email_send_failed', 'Supabase could not send the e-mail. The admin needs to check the e-mail (SMTP) settings in Supabase, or turn off "Confirm email" for sign-ups.');
    if (/signups? not allowed|signup.*disabled/i.test(m) || code === 'signup_disabled') return codedError('signup_disabled', 'New sign-ups are switched off for this project.');
    if (/expired|invalid.*(link|token)|otp/i.test(m)) return codedError('link_expired', 'This e-mail link has expired or was already used. Request a new one.');
    return Object.assign(new Error(m), { code });
  }
  const isNetError = (e) => /no connection|failed to fetch|network|load failed|timed out|offline/i.test(String(e?.message || e));

  // ───────── constants ─────────
  const IUCN = {
    CR: { name: 'Critically Endangered', color: '#c53030' },
    EN: { name: 'Endangered', color: '#dd6b20' },
    VU: { name: 'Vulnerable', color: '#d69e2e' },
    NT: { name: 'Near Threatened', color: '#68a14a' },
    LC: { name: 'Least Concern', color: '#2f855a' },
    DD: { name: 'Data Deficient', color: '#718096' },
    NE: { name: 'Not Evaluated', color: '#a0aec0' },
  };
  const VENOM = {
    venomous: { label: 'Venomous', short: 'Venomous', color: '#c53030', icon: '⚠' },
    mild: { label: 'Mildly venomous (not medically significant)', short: 'Mildly venomous', color: '#d69e2e', icon: '!' },
    non: { label: 'Non-venomous', short: 'Non-venomous', color: '#2f855a', icon: '✓' },
  };
  const TOXIC = {
    poisonous: { label: 'Poisonous (toxic skin/secretions)', short: 'Poisonous', color: '#9b2c2c' },
    non: { label: 'Non-poisonous', short: 'Non-poisonous', color: '#4a5568' },
  };
  // approximate centroids [lat,lng] used for demo data and region auto-detect
  const CENTROIDS = {
    'IN-AN': [11.7, 92.7], 'IN-AP': [15.9, 79.7], 'IN-AR': [28.2, 94.7], 'IN-AS': [26.2, 92.9], 'IN-BR': [25.9, 85.3],
    'IN-CH': [30.73, 76.78], 'IN-CT': [21.3, 81.9], 'IN-DH': [20.4, 73.0], 'IN-DL': [28.6, 77.2], 'IN-GA': [15.4, 74.0],
    'IN-GJ': [22.3, 71.2], 'IN-HR': [29.1, 76.1], 'IN-HP': [31.9, 77.2], 'IN-JK': [33.8, 75.0], 'IN-JH': [23.6, 85.3],
    'IN-KA': [14.6, 75.9], 'IN-KL': [10.3, 76.4], 'IN-LA': [34.2, 77.6], 'IN-LD': [10.6, 72.6], 'IN-MP': [23.5, 78.6],
    'IN-MH': [19.5, 75.7], 'IN-MN': [24.7, 93.9], 'IN-ML': [25.5, 91.3], 'IN-MZ': [23.2, 92.9], 'IN-NL': [26.1, 94.5],
    'IN-OR': [20.5, 84.4], 'IN-PY': [11.94, 79.8], 'IN-PB': [31.1, 75.3], 'IN-RJ': [26.9, 73.8], 'IN-SK': [27.5, 88.5],
    'IN-TN': [11.1, 78.6], 'IN-TG': [17.9, 79.1], 'IN-TR': [23.9, 91.7], 'IN-UP': [27.0, 80.9], 'IN-UT': [30.1, 79.0],
    'IN-WB': [23.0, 87.9], 'LK': [7.9, 80.7], 'NP': [28.4, 84.1], 'BD': [23.7, 90.4], 'BT': [27.5, 90.4], 'IN': [22.5, 79.0],
  };

  // ───────── small utils ─────────
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('storage', e); } };
  function haversineKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const trackKm = (pts) => pts.reduce((s, p, i) => (i ? s + haversineKm(pts[i - 1], p) : 0), 0);
  function nearestRegion(lat, lng) {
    let best = null, bd = 1e9;
    for (const [code, c] of Object.entries(CENTROIDS)) {
      if (code === 'IN') continue;
      const d = haversineKm([lat, lng], c);
      if (d < bd) { bd = d; best = code; }
    }
    return best;
  }
  // ── durable storage (pattern from the Island Explorer driver app) ──
  // Field data is written to localStorage + IndexedDB + the Cache API. Some mobile
  // browsers clear localStorage between sessions; whichever store survived is used
  // to restore the others, so an unsynced checklist is never lost.
  function idb() {
    return new Promise((res) => {
      try { const r = indexedDB.open('hw_durable', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch { res(null); }
    });
  }
  const idbSet = async (k, v) => { const db = await idb(); if (!db) return; try { const tx = db.transaction('kv', 'readwrite'); v == null ? tx.objectStore('kv').delete(k) : tx.objectStore('kv').put(v, k); } catch {} };
  const idbGet = async (k) => { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const g = db.transaction('kv').objectStore('kv').get(k); g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null); } catch { res(null); } }); };
  const cacheSet = async (k, v) => { try { const c = await caches.open('hw_durable'); const u = '/__hw_durable/' + encodeURIComponent(k); v == null ? await c.delete(u) : await c.put(u, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })); } catch {} };
  const cacheGet = async (k) => { try { const r = await (await caches.open('hw_durable')).match('/__hw_durable/' + encodeURIComponent(k)); return r ? r.json() : null; } catch { return null; } };
  function durSet(k, v) { v == null ? (() => { try { localStorage.removeItem(k); } catch {} })() : lsSet(k, v); idbSet(k, v); cacheSet(k, v); }
  async function durGet(k) {
    let v = lsGet(k, null); if (v != null) return v;
    v = await idbGet(k); if (v != null) { lsSet(k, v); return v; }
    v = await cacheGet(k); if (v != null) { lsSet(k, v); idbSet(k, v); return v; }
    return null;
  }
  const storageWorks = () => { try { localStorage.setItem('hw_ck', '1'); const ok = localStorage.getItem('hw_ck') === '1'; localStorage.removeItem('hw_ck'); return ok; } catch { return false; } };
  try { navigator.storage?.persist?.(); } catch {}
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isInAppBrowser = () => /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Telegram|Snapchat/i.test(navigator.userAgent || '');

  // Errors with a machine-readable code so the UI can offer the right next step
  const codedError = (code, message) => Object.assign(new Error(message), { code });
  // Public maps never show exact points: ~1 km normally, ~10 km for sensitive species
  const coarsen = (v, sensitive) => Math.round(v * (sensitive ? 10 : 100)) / (sensitive ? 10 : 100);

  // ───────── shared stats (demo computes in JS; Supabase returns the same shape from public_stats()) ─────────
  function computeStats(species, sightings, roadkill, surveys) {
    const sp = Object.fromEntries(species.map((s) => [s.id, s]));
    const count = (arr, key) => { const m = {}; arr.forEach((x) => { const k = key(x); if (k != null) m[k] = (m[k] || 0) + (x.count || 1); }); return m; };
    const month = (d) => String(d).slice(0, 7);
    const months = {};
    sightings.forEach((s) => { const m = month(s.observed_at); (months[m] ||= { month: m, sightings: 0, roadkill: 0 }).sightings += s.count || 1; });
    roadkill.forEach((s) => { const m = month(s.observed_at); (months[m] ||= { month: m, sightings: 0, roadkill: 0 }).roadkill += s.count || 1; });
    const toArr = (m, k) => Object.entries(m).map(([key, n]) => ({ [k]: key, n })).sort((a, b) => b.n - a.n);
    const topSp = (arr) => toArr(count(arr, (x) => x.species_id), 'species_id').slice(0, 12)
      .map((r) => ({ ...r, common: sp[r.species_id]?.common || r.species_id, sci: sp[r.species_id]?.sci || '' }));
    const surveyKm = surveys.reduce((s, x) => s + (x.distance_km || 0), 0);
    return {
      totals: {
        sightings: sightings.reduce((s, x) => s + (x.count || 1), 0),
        records: sightings.length,
        species: new Set(sightings.map((s) => s.species_id).filter(Boolean)).size,
        observers: new Set([...sightings, ...roadkill].map((s) => s.user_id)).size,
        roadkill: roadkill.reduce((s, x) => s + (x.count || 1), 0),
        roadkill_surveys: surveys.length,
        roadkill_km: Math.round(surveyKm * 10) / 10,
        roadkill_per_100km: surveyKm ? Math.round((roadkill.reduce((s, x) => s + (x.count || 1), 0) / surveyKm) * 1000) / 10 : 0,
      },
      by_pack: toArr(count(sightings, (x) => sp[x.species_id]?.pack || x.pack), 'pack'),
      roadkill_by_pack: toArr(count(roadkill, (x) => sp[x.species_id]?.pack || x.pack), 'pack'),
      by_iucn: toArr(count(sightings, (x) => sp[x.species_id]?.iucn), 'iucn'),
      by_venom: toArr(count(sightings.filter((x) => sp[x.species_id]?.pack === 'snakes'), (x) => sp[x.species_id]?.venom), 'venom'),
      by_region: toArr(count(sightings, (x) => x.region_code), 'region'),
      by_month: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)),
      top_species: topSp(sightings),
      roadkill_species: topSp(roadkill),
    };
  }

  // ════════════════════════════════════════════════════════════════════
  //  DEMO BACK-END (localStorage)
  // ════════════════════════════════════════════════════════════════════
  const DKEY = 'hw_demo_db_v3';
  function demoDb() {
    let db = lsGet(DKEY, null);
    if (db) return db;
    db = {
      packs: SEED.PACKS, regions: SEED.REGIONS, prices: SEED.PRICES.map((p) => ({ id: uid(), ...p })),
      species: SEED.SPECIES, checklists: Object.fromEntries(SEED.CHECKLISTS.map((c) => [c.region, c.species])),
      users: [
        { id: 'u-admin', email: 'admin@demo', password: 'admin', username: 'admin', full_name: 'Demo Admin', role: 'admin', status: 'approved', home_region: 'IN-AN' },
        { id: 'u-field', email: 'field@demo', password: 'field', username: 'fielder', full_name: 'Demo Field User', role: 'user', status: 'approved', home_region: 'IN-KL' },
        { id: 'u-anu', email: 'anu@demo', password: 'anu', username: 'anu.k', full_name: 'Anu K (sample)', role: 'reviewer', status: 'approved', home_region: 'IN-KL' },
        { id: 'u-ravi', email: 'ravi@demo', password: 'ravi', username: 'ravi.s', full_name: 'Ravi S (sample)', role: 'user', status: 'pending', home_region: 'IN-AN' },
      ],
      entitlements: [{ id: uid(), user_id: 'u-field', pack: 'frogs', region: 'IN-KL', valid_until: new Date(Date.now() + 300 * 864e5).toISOString(), source: 'manual' }],
      trips: [], sightings: [], surveys: [], roadkill: [], session: null,
    };
    seedDemoRecords(db);
    lsSet(DKEY, db);
    return db;
  }
  const saveDemo = (db) => lsSet(DKEY, db);
  // deterministic sample observations so the website & dashboard have something to show
  function seedDemoRecords(db) {
    let x = 42; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    const today = new Date();
    const observers = ['u-field', 'u-admin', 'u-anu', 'u-ravi'];
    const protos = ['traveling', 'stationary', 'night_walk', 'incidental', 'area'];
    for (let k = 0; k < 60; k++) {
      // one checklist (trip) in a random state, with 2–7 species from that state's checklist
      const regs = Object.keys(CENTROIDS).filter((r) => r.startsWith('IN-') && (db.checklists[r] || []).length > 3);
      const r = regs[Math.floor(rnd() * regs.length)], c = CENTROIDS[r];
      const start = new Date(today.getTime() - rnd() * 365 * 864e5), dur = 20 + Math.floor(rnd() * 160);
      const lat = c[0] + (rnd() - .5) * 1.2, lng = c[1] + (rnd() - .5) * 1.2, proto = protos[Math.floor(rnd() * protos.length)];
      const track = proto === 'traveling' || proto === 'night_walk' ? Array.from({ length: 12 }, (_, t) => [lat + t * .002 + (rnd() - .5) * .001, lng + t * .0015]) : [];
      const trip = { id: uid(), user_id: observers[Math.floor(rnd() * observers.length)], region_code: r, protocol: proto, started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + dur * 6e4).toISOString(), duration_min: dur, distance_km: Math.round(trackKm(track) * 100) / 100, observers: 1 + Math.floor(rnd() * 3),
        complete: proto !== 'incidental' && rnd() > .3, track, lat, lng, notes: '' };
      db.trips.push(trip);
      const pool = db.checklists[r]; const n = 2 + Math.floor(rnd() * 6), used = new Set();
      for (let j = 0; j < n; j++) {
        // ~7% of records are species NOT on the state's core checklist (range extensions / misIDs to review)
        const offPool = db.species.filter((x) => !pool.includes(x.id));
        const sid = rnd() < 0.07 && offPool.length ? offPool[Math.floor(rnd() * offPool.length)].id : pool[Math.floor(rnd() * pool.length)];
        if (used.has(sid)) continue; used.add(sid);
        const age = (today - start) / 864e5;
        db.sightings.push({ id: uid(), user_id: trip.user_id, trip_id: trip.id, species_id: sid, species_text: '', count: 1 + Math.floor(rnd() * 4),
          lat: lat + (rnd() - .5) * .01, lng: lng + (rnd() - .5) * .01, observed_at: new Date(start.getTime() + j * 5 * 6e4).toISOString(), region_code: r,
          life_stage: ['adult', 'juvenile', ''][j % 3], sex: '', notes: '', photos: [],
          review_status: age < 60 ? 'pending' : rnd() > .08 ? 'accepted' : 'rejected' });
      }
    }
    // three road-kill surveys with tracks along a road near Port Blair / Kerala / Odisha
    [['IN-AN', [11.62, 92.72], [11.85, 92.68]], ['IN-KL', [10.0, 76.3], [10.5, 76.9]], ['IN-OR', [20.3, 85.8], [20.9, 86.5]]].forEach(([reg, a, b], k) => {
      const track = []; for (let t = 0; t <= 40; t++) track.push([a[0] + (b[0] - a[0]) * t / 40 + Math.sin(t / 4) * .01, a[1] + (b[1] - a[1]) * t / 40]);
      const start = new Date(today.getTime() - (20 + k * 40) * 864e5);
      const sv = { id: uid(), user_id: 'u-field', region_code: reg, mode: 'car', road_name: ['Andaman Trunk Road', 'NH 544', 'NH 16'][k], road_type: 'highway',
        started_at: start.toISOString(), ended_at: new Date(start.getTime() + 90 * 6e4).toISOString(), track, distance_km: Math.round(trackKm(track) * 10) / 10, notes: '' };
      db.surveys.push(sv);
      const pool = db.species.filter((s) => s.regions.includes(reg));
      for (let j = 0; j < 6 + k * 2; j++) {
        const p = track[Math.floor(rnd() * track.length)], s = pool[Math.floor(rnd() * pool.length)];
        db.roadkill.push({ id: uid(), survey_id: sv.id, user_id: 'u-field', species_id: s.id, pack: s.pack, count: 1, lat: p[0], lng: p[1],
          observed_at: new Date(start.getTime() + j * 6e5).toISOString(), condition: ['fresh', 'flattened', 'decomposed'][j % 3], region_code: reg, notes: '' });
      }
    });
  }
  const demoMe = (db) => db.users.find((u) => u.id === db.session) || null;
  const valid = (e) => !e.valid_until || new Date(e.valid_until) > new Date();
  function demoCanSee(db, me, s) {
    if (!me) return false;
    if (me.role === 'admin') return true;
    return db.entitlements.some((e) => e.user_id === me.id && e.pack === s.pack && valid(e) && (e.region === 'IN' ? s.regions.includes('IN') : s.regions.includes(e.region)));
  }
  const basic = (s) => ({ id: s.id, pack: s.pack, common: s.common, sci: s.sci, family: s.family, venom: s.venom, toxic: s.toxic, iucn: s.iucn, endemic: s.endemic, sensitive: s.sensitive, regions: s.regions });
  const needAdmin = (db) => { const me = demoMe(db); if (!me || me.role !== 'admin') throw new Error('Admins only'); return me; };

  const demoApi = {
    mode: 'demo',
    async session() { const db = demoDb(); return demoMe(db); },
    async signIn(email, password) {
      const db = demoDb();
      const u = db.users.find((x) => (x.email.toLowerCase() === email.toLowerCase() || x.username === email) && x.password === password);
      if (!u) throw new Error('Wrong email/username or password (demo: field@demo / field, admin@demo / admin)');
      if (u.status === 'blocked') throw new Error('This account is blocked. Contact the administrator.');
      db.session = u.id; saveDemo(db); return u;
    },
    async signUp(f) {
      const db = demoDb();
      if (db.users.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) throw codedError('already_registered', `${f.email} already has an account (one account works for the app and the dashboard). Sign in instead.`);
      const u = { id: uid(), email: f.email, password: f.password, username: f.username, full_name: f.full_name, phone: f.phone || '', home_region: f.home_region, role: 'user', status: 'approved' };
      db.users.push(u);
      if (['reviewer', 'admin'].includes(f.requested_role)) (db.access ||= []).push({ id: uid(), user_id: u.id, requested_role: f.requested_role, note: 'Requested at sign-up', status: 'pending', created_at: new Date().toISOString() }); db.session = u.id; saveDemo(db); return u;
    },
    async resetPassword() { throw new Error('Password reset needs the Supabase back-end (demo mode).'); },
    async resendConfirmation() {},
    isRecovery: () => false, linkError: () => '', onAuth: () => () => {},
    async hasAdmin() { return demoDb().users.some((u) => u.role === 'admin'); },
    async claimFirstAdmin() { const db = demoDb(), me = demoMe(db); if (db.users.some((u) => u.role === 'admin')) throw new Error('This project already has an admin. Ask them to give you access.'); me.role = 'admin'; saveDemo(db); return me; },
    async requestAccess(role, note = '') {
      const db = demoDb(), me = demoMe(db); db.access ||= [];
      let r = db.access.find((x) => x.user_id === me.id && x.status === 'pending');
      if (r) Object.assign(r, { requested_role: role, note, created_at: new Date().toISOString() });
      else db.access.push((r = { id: uid(), user_id: me.id, requested_role: role, note, status: 'pending', created_at: new Date().toISOString() }));
      saveDemo(db); return r;
    },
    async myAccessRequest() { const db = demoDb(), me = demoMe(db); return (db.access || []).filter((x) => x.user_id === me?.id).slice(-1)[0] || null; },
    async updatePassword() {},
    async submitFeedback(f) {
      if (!f.r_overall || f.r_overall < 1 || f.r_overall > 5) throw new Error('Please rate your overall experience.');
      const db = demoDb(); (db.feedback ||= []).push({ id: uid(), created_at: new Date().toISOString(), user_id: db.session, status: 'new', ...f }); saveDemo(db);
    },
    async checklistEntries(region) {
      const db = demoDb(); const st = (db.clStatus || {})[region] || {}; const sp = Object.fromEntries(db.species.map((s) => [s.id, s]));
      return (db.checklists[region] || []).map((id) => ({ species_id: id, status: st[id] || (sp[id]?.endemic && region !== 'IN' ? 'endemic' : 'native') }));
    },
    /** Demo mode: the dashboard and app share localStorage, so edits in one tab reach the other. */
    onCatalogChange(cb) {
      const on = (e) => { if (e.key === DKEY) cb('demo', e); };
      addEventListener('storage', on);
      return () => removeEventListener('storage', on);
    },
    async signOut() { const db = demoDb(); db.session = null; saveDemo(db); },
    async signInWithGoogle() { throw new Error('Google sign-in needs the Supabase back-end (you are in demo mode).'); },
    async updateProfile(p) { const db = demoDb(); const me = demoMe(db); Object.assign(me, p); saveDemo(db); return me; },
    async packs() { return demoDb().packs; },
    async regions() { return demoDb().regions; },
    async prices() { return demoDb().prices; },
    async speciesIndex() { return demoDb().species.map(basic); },
    async speciesFull(id) {
      const db = demoDb(), s = db.species.find((x) => x.id === id);
      return s && demoCanSee(db, demoMe(db), s) ? s : null;
    },
    async unlockedSpecies() { const db = demoDb(), me = demoMe(db); return db.species.filter((s) => demoCanSee(db, me, s)); },
    async checklist(region) { return demoDb().checklists[region] || []; },
    async myEntitlements() { const db = demoDb(), me = demoMe(db); return me ? db.entitlements.filter((e) => e.user_id === me.id && valid(e)) : []; },
    async quote(items) { return quoteFrom(demoDb().prices, items); },
    async checkout(items) {
      const db = demoDb(), me = demoMe(db); if (!me) throw new Error('Sign in first');
      const q = quoteFrom(db.prices, items);
      q.lines.forEach((l) => db.entitlements.push({ id: uid(), user_id: me.id, pack: l.pack, region: l.region, source: 'demo',
        valid_until: new Date(Date.now() + l.days * 864e5).toISOString(), payment_ref: 'demo-' + Date.now() }));
      saveDemo(db); return { ok: true, demo: true, amount: q.total };
    },
    // eBird-style checklist (trip) with its sightings, idempotent on client ids
    async saveTrip(trip) {
      const db = demoDb(), me = demoMe(db); if (!me) throw new Error('Sign in first');
      db.trips = db.trips.filter((t) => t.id !== trip.id);
      db.sightings = db.sightings.filter((s) => s.trip_id !== trip.id);
      const { sightings, ...t } = trip;
      db.trips.push({ ...t, user_id: me.id });
      sightings.forEach((s) => db.sightings.push({ ...s, trip_id: trip.id, user_id: me.id, review_status: 'pending' }));
      saveDemo(db); return true;
    },
    async saveRoadkill(survey) {
      const db = demoDb(), me = demoMe(db); if (!me) throw new Error('Sign in first');
      db.surveys = db.surveys.filter((t) => t.id !== survey.id);
      db.roadkill = db.roadkill.filter((s) => s.survey_id !== survey.id);
      const { records, ...sv } = survey;
      db.surveys.push({ ...sv, user_id: me.id });
      records.forEach((r) => db.roadkill.push({ ...r, survey_id: survey.id, user_id: me.id }));
      saveDemo(db); return true;
    },
    async myTrips() { const db = demoDb(), me = demoMe(db); return db.trips.filter((t) => t.user_id === me?.id).sort((a, b) => String(b.started_at).localeCompare(a.started_at)).map((t) => ({ ...t, sightings: db.sightings.filter((s) => s.trip_id === t.id) })); },
    async mySurveys() { const db = demoDb(), me = demoMe(db); return db.surveys.filter((t) => t.user_id === me?.id).sort((a, b) => String(b.started_at).localeCompare(a.started_at)).map((t) => ({ ...t, records: db.roadkill.filter((s) => s.survey_id === t.id) })); },
    async publicStats() { const db = demoDb(); return computeStats(db.species, db.sightings.filter((s) => s.review_status !== 'rejected'), db.roadkill, db.surveys); },
    async publicPoints() {
      const db = demoDb(), sp = Object.fromEntries(db.species.map((s) => [s.id, s]));
      return [
        ...db.sightings.filter((s) => s.review_status !== 'rejected' && s.lat != null).map((s) => ({ kind: 'sighting', species_id: s.species_id, pack: sp[s.species_id]?.pack, iucn: sp[s.species_id]?.iucn, lat: coarsen(s.lat, sp[s.species_id]?.sensitive), lng: coarsen(s.lng, sp[s.species_id]?.sensitive), month: String(s.observed_at).slice(0, 7) })),
        ...db.roadkill.filter((s) => s.lat != null).map((s) => ({ kind: 'roadkill', species_id: s.species_id, pack: sp[s.species_id]?.pack || s.pack, iucn: sp[s.species_id]?.iucn, lat: coarsen(s.lat, sp[s.species_id]?.sensitive), lng: coarsen(s.lng, sp[s.species_id]?.sensitive), month: String(s.observed_at).slice(0, 7) })),
      ];
    },
    publicTracks: async () => demoDb().surveys.map((s) => ({ id: s.id, road_name: s.road_name, distance_km: s.distance_km, track: s.track.map(([a, b]) => [coarsen(a), coarsen(b)]) })),
    admin: {
      async upsertSpecies(s) { const db = demoDb(); needAdmin(db); const i = db.species.findIndex((x) => x.id === s.id); i >= 0 ? (db.species[i] = s) : db.species.push(s); saveDemo(db); return s; },
      async deleteSpecies(id) { const db = demoDb(); needAdmin(db); db.species = db.species.filter((x) => x.id !== id); Object.keys(db.checklists).forEach((r) => (db.checklists[r] = db.checklists[r].filter((x) => x !== id))); saveDemo(db); },
      async allSpecies() { const db = demoDb(); needAdmin(db); return db.species; },
      async setChecklist(region, ids) {
        const db = demoDb(); needAdmin(db); db.checklists[region] = ids;
        db.species.forEach((s) => { const has = ids.includes(s.id), had = s.regions.includes(region); if (has && !had) s.regions.push(region); if (!has && had) s.regions = s.regions.filter((r) => r !== region); });
        saveDemo(db);
      },
      async upsertPrice(p) { const db = demoDb(); needAdmin(db); p.id ||= uid(); const i = db.prices.findIndex((x) => x.id === p.id); i >= 0 ? (db.prices[i] = p) : db.prices.push(p); saveDemo(db); },
      async deletePrice(id) { const db = demoDb(); needAdmin(db); db.prices = db.prices.filter((x) => x.id !== id); saveDemo(db); },
      async users() { const db = demoDb(); needAdmin(db); return db.users.map(({ password, ...u }) => ({ ...u, packs: db.entitlements.filter((e) => e.user_id === u.id && valid(e)) })); },
      async setUser(id, patch) { const db = demoDb(); needAdmin(db); Object.assign(db.users.find((u) => u.id === id), patch); saveDemo(db); },
      async grant(user_id, pack, region, days) { const db = demoDb(); const me = needAdmin(db); db.entitlements.push({ id: uid(), user_id, pack, region, source: 'manual', granted_by: me.username, valid_until: days ? new Date(Date.now() + days * 864e5).toISOString() : null }); saveDemo(db); },
      async revoke(entId) { const db = demoDb(); needAdmin(db); const e = db.entitlements.find((x) => x.id === entId); if (e) e.valid_until = new Date().toISOString(); saveDemo(db); },
      async sightings() { const db = demoDb(); needAdmin(db); const un = Object.fromEntries(db.users.map((u) => [u.id, u.username])); return db.sightings.map((s) => ({ ...s, username: un[s.user_id] })).sort((a, b) => String(b.observed_at).localeCompare(a.observed_at)); },
      async review(id, status, note = '') { const db = demoDb(); const me = needAdmin(db); Object.assign(db.sightings.find((s) => s.id === id), { review_status: status, review_note: note, reviewed_by: me.id, reviewed_at: new Date().toISOString() }); saveDemo(db); },
      async deleteSighting(id) { const db = demoDb(); needAdmin(db); db.sightings = db.sightings.filter((s) => s.id !== id); saveDemo(db); },
      async trips() {
        const db = demoDb(); needAdmin(db); const un = Object.fromEntries(db.users.map((u) => [u.id, u]));
        return db.trips.map((t) => ({ ...t, username: un[t.user_id]?.username, full_name: un[t.user_id]?.full_name, sightings: db.sightings.filter((s) => s.trip_id === t.id) }))
          .sort((a, b) => String(b.started_at).localeCompare(a.started_at));
      },
      async reviewTrip(tripId, status, note = '') { const db = demoDb(); const me = needAdmin(db); db.sightings.filter((s) => s.trip_id === tripId).forEach((s) => Object.assign(s, { review_status: status, review_note: note, reviewed_by: me.id, reviewed_at: new Date().toISOString() })); saveDemo(db); },
      async accessRequests() { const db = demoDb(); needAdmin(db); const un = Object.fromEntries(db.users.map((u) => [u.id, u])); return (db.access || []).map((r) => ({ ...r, username: un[r.user_id]?.username, full_name: un[r.user_id]?.full_name })).reverse(); },
      async decideAccess(id, approve) { const db = demoDb(); const me = needAdmin(db); const r = db.access.find((x) => x.id === id); Object.assign(r, { status: approve ? 'approved' : 'declined', decided_by: me.id, decided_at: new Date().toISOString() }); if (approve) db.users.find((u) => u.id === r.user_id).role = r.requested_role; saveDemo(db); },
      async feedback() { const db = demoDb(); needAdmin(db); return (db.feedback || []).slice().reverse(); },
      async setFeedbackStatus(id, status) { const db = demoDb(); needAdmin(db); const f = (db.feedback || []).find((x) => x.id === id); if (f) f.status = status; saveDemo(db); },
      async deleteTrip(id) { const db = demoDb(); needAdmin(db); db.trips = db.trips.filter((t) => t.id !== id); db.sightings = db.sightings.filter((s) => s.trip_id !== id); saveDemo(db); },
      async auditLog() { const db = demoDb(); needAdmin(db); return (db.audit || []).slice().reverse(); },
      async checklistEntries(region) {
        const db = demoDb(); const st = (db.clStatus || {})[region] || {}; const sp = Object.fromEntries(db.species.map((s) => [s.id, s]));
        return (db.checklists[region] || []).map((id) => ({ species_id: id, status: st[id] || (sp[id]?.endemic && region !== 'IN' ? 'endemic' : 'native') }));
      },
      async setChecklistEntry(region, speciesId, status) {
        const db = demoDb(); needAdmin(db); db.clStatus ||= {}; db.clStatus[region] ||= {};
        const list = new Set(db.checklists[region] || []); const s = db.species.find((x) => x.id === speciesId);
        if (status) { list.add(speciesId); db.clStatus[region][speciesId] = status; if (s && !s.regions.includes(region)) s.regions.push(region); }
        else { list.delete(speciesId); delete db.clStatus[region][speciesId]; if (s) s.regions = s.regions.filter((r) => r !== region); }
        db.checklists[region] = [...list];
        const me = demoMe(db); (db.audit ||= []).push({ id: Date.now(), at: new Date().toISOString(), actor: me?.id, actor_name: me?.username, tbl: 'checklist', action: status ? 'UPSERT' : 'DELETE', row_key: region + ':' + speciesId, new_row: status ? { status } : null, old_row: null });
        saveDemo(db);
      },
      async copyChecklist(from, to) {
        const entries = await this.checklistEntries(from);
        for (const e of entries) await this.setChecklistEntry(to, e.species_id, e.status);
        return entries.length;
      },
      async roadkill() { const db = demoDb(); needAdmin(db); const un = Object.fromEntries(db.users.map((u) => [u.id, u.username])); return { surveys: db.surveys.map((s) => ({ ...s, username: un[s.user_id] })), records: db.roadkill.map((s) => ({ ...s, username: un[s.user_id] })) }; },
      async deleteRoadkill(id) { const db = demoDb(); needAdmin(db); db.roadkill = db.roadkill.filter((s) => s.id !== id); saveDemo(db); },
      async deleteSurvey(id) { const db = demoDb(); needAdmin(db); db.surveys = db.surveys.filter((s) => s.id !== id); db.roadkill = db.roadkill.filter((s) => s.survey_id !== id); saveDemo(db); },
    },
    resetDemo() { localStorage.removeItem(DKEY); },
  };

  // pricing rule shared by both back-ends (the server repeats it in create-order):
  //   exact (pack, region) price wins; a state falls back to the "*state" price.
  function quoteFrom(prices, items) {
    const lines = items.map(({ pack, region }) => {
      const isState = region.includes('-');
      const p = prices.find((x) => x.pack === pack && x.region === region && x.active !== false)
        || (isState && prices.find((x) => x.pack === pack && x.region === '*state' && x.active !== false));
      if (!p) throw new Error(`No price set for ${pack} in ${region}`);
      return { pack, region, paise: p.paise, days: p.days || 365 };
    });
    return { lines, total: lines.reduce((s, l) => s + l.paise, 0) };
  }

  // ════════════════════════════════════════════════════════════════════
  //  SUPABASE BACK-END
  // ════════════════════════════════════════════════════════════════════
  // PGRST202 = function missing, PGRST205/42P01 = table missing: the database is older than the app
  const DB_UPDATE_MSG = 'The database needs the latest update: an admin should paste supabase/setup.sql into Supabase → SQL Editor and Run it (safe to re-run, keeps all data).';
  const isDbBehind = (error) => ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code) || /schema cache|does not exist/i.test(error?.message || '');
  const ok = ({ data, error }) => {
    if (error) throw isDbBehind(error) ? Object.assign(new Error(DB_UPDATE_MSG), { code: 'db_update_needed' }) : new Error(error.message);
    return data;
  };
  // DB rows use snake_case column names; the UI uses the seed's short names.
  const fromRow = (r) => r && ({
    id: r.id, pack: r.pack_id, common: r.common_name, sci: r.scientific_name, family: r.family, venom: r.venom, toxic: r.toxic,
    iucn: r.iucn, endemic: r.endemic, sensitive: r.sensitive, size: r.size, habitat: r.habitat, distribution: r.distribution,
    id_notes: r.id_notes, behaviour: r.behaviour, similar: r.similar_species, images: r.images || [], traits: r.traits || {}, regions: r.regions || [],
  });
  const toRow = (s) => ({
    id: s.id, pack_id: s.pack, common_name: s.common, scientific_name: s.sci, family: s.family, venom: s.venom, toxic: s.toxic,
    iucn: s.iucn, endemic: !!s.endemic, sensitive: !!s.sensitive, size: s.size, habitat: s.habitat, distribution: s.distribution,
    id_notes: s.id_notes, behaviour: s.behaviour, similar_species: s.similar, images: s.images || [], traits: s.traits || {},
  });
  let _profile = null;
  // field-record tables reference auth.users, so usernames are joined client-side from profiles
  async function withUsernames(rows) {
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    if (!ids.length) return rows;
    const profs = ok(await sb.from('profiles').select('id,username,full_name').in('id', ids));
    const by = Object.fromEntries(profs.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, username: by[r.user_id]?.username || '', full_name: by[r.user_id]?.full_name || '' }));
  }
  async function loadProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (_profile = null);
    let p;
    try { p = ok(await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()); }
    catch (e) {
      // offline: keep working with the last profile saved on this device
      const cached = isNetError(e) ? await durGet('hw_profile_' + session.user.id) : null;
      if (cached) return (_profile = { ...cached, offline: true });
      throw e;
    }
    // one account for app + dashboard: if the profile row is missing (e.g. the user signed up
    // before the database was set up), the server creates it from the sign-up details
    if (!p) { const { data } = await sb.rpc('ensure_profile'); p = data && data.id ? data : null; }
    _profile = p ? { ...p, email: session.user.email } : { id: session.user.id, email: session.user.email, username: (session.user.email || '').split('@')[0], role: 'user', status: 'approved' };
    durSet('hw_profile_' + session.user.id, _profile);
    return _profile;
  }
  const sbApi = {
    mode: 'supabase',
    session: loadProfile,
    async signIn(email, password) {
      if (!email.includes('@')) throw codedError('use_email', 'Sign in with your e-mail address (the same one for the app and the dashboard).');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (/not confirmed/i.test(error.message)) throw codedError('email_not_confirmed', `Please confirm your e-mail first: open the link we sent to ${email}.`);
        if (/invalid login credentials/i.test(error.message)) throw codedError('bad_credentials', 'Wrong e-mail or password. The same account works in the app and the dashboard; use "Reset password" if you forgot it.');
        throw authError(error, email);
      }
      const p = await loadProfile();
      if (p?.status === 'blocked') { await sb.auth.signOut(); throw new Error('This account is blocked. Contact the administrator.'); }
      return p;
    },
    async signUp(f) {
      const { data, error } = await sb.auth.signUp({ email: f.email, password: f.password,
        options: { emailRedirectTo: location.href.split('#')[0].split('?')[0], data: { username: f.username, full_name: f.full_name, phone: f.phone || '', home_region: f.home_region, requested_role: f.requested_role || '' } } });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) throw codedError('already_registered', `${f.email} already has a ${C.APP_NAME} account (one account works for the app and the dashboard). Sign in instead.`);
        throw authError(error, f.email);
      }
      // Supabase hides existing e-mails by returning a user with no identities
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
        throw codedError('already_registered', `${f.email} already has a ${C.APP_NAME} account (one account works for the app and the dashboard). Sign in instead.`);
      return loadProfile();   // null when e-mail confirmation is required
    },
    // ── dashboard access ──
    async hasAdmin() { const { data, error } = await sb.rpc('has_admin'); if (error) return isDbBehind(error) ? null : true; return !!data; },   // null = database not updated yet
    async claimFirstAdmin() { ok(await sb.rpc('claim_first_admin')); return loadProfile(); },
    async requestAccess(role, note = '') { return ok(await sb.rpc('request_access', { p_role: role, p_note: note })); },
    async myAccessRequest() { const me = _profile || (await loadProfile()); const { data, error } = await sb.from('access_requests').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (error) return null; return data; },
    async submitFeedback(f) {
      const { data: { session } } = await sb.auth.getSession();
      ok(await sb.from('feedback').insert({ ...f, user_id: session?.user?.id || null }));
    },
    async resendConfirmation(email) { const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] } }); if (error) throw authError(error, email); },
    async checklistEntries(region) { return ok(await sb.from('checklist').select('species_id,status').eq('region_code', region)); },
    /** Live catalogue updates (admin edits a checklist / species / price) via Supabase Realtime. */
    onCatalogChange(cb) {
      const ch = sb.channel('hw-catalog')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, (e) => cb('checklist', e))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'species' }, (e) => cb('species', e))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pack_prices' }, (e) => cb('prices', e))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    async resetPassword(email) {
      if (!String(email).includes('@')) throw codedError('use_email', 'Enter the e-mail address of your account.');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0].split('?')[0] });
      if (error) throw authError(error, email);
    },
    /** true when the page was opened from a "reset password" e-mail */
    isRecovery: () => _recovery,
    /** message when an e-mail link was expired/invalid ('' otherwise) */
    linkError: () => (_linkError ? authError({ message: _linkError }).message : ''),
    async updatePassword(password) {
      if (!password || password.length < 6) throw codedError('weak_password', 'Use at least 6 characters.');
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw authError(error);
      _recovery = false;
      try { history.replaceState(null, '', location.pathname); } catch {}
      return loadProfile();
    },
    onAuth(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    async signOut() { await sb.auth.signOut(); _profile = null; },
    async signInWithGoogle(redirectTo) { ok(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo || location.href.split('#')[0] } })); },
    async updateProfile(p) { const me = await loadProfile(); ok(await sb.from('profiles').update(p).eq('id', me.id)); return loadProfile(); },
    async packs() { return ok(await sb.from('packs').select('*').order('sort')); },
    async regions() { return ok(await sb.from('regions').select('*').order('code')); },
    async prices() { return ok(await sb.from('pack_prices').select('id,pack:pack_id,region:region_code,paise,days,active').eq('active', true)); },
    async speciesIndex() { return ok(await sb.from('species_index').select('*')).map(fromRow); },
    async speciesFull(id) { return fromRow(ok(await sb.from('species_full').select('*').eq('id', id).maybeSingle())); },  // RLS: null if not entitled
    async unlockedSpecies() { return ok(await sb.from('species_full').select('*')).map(fromRow); },
    async checklist(region) { return ok(await sb.from('checklist').select('species_id').eq('region_code', region)).map((r) => r.species_id); },
    async myEntitlements() { return ok(await sb.from('entitlements').select('id,pack:pack_id,region:region_code,valid_until,source').or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())); },
    async quote(items) { return quoteFrom(await sbApi.prices(), items); },
    async checkout(items) {
      const { data, error } = await sb.functions.invoke('create-order', { body: { items } });
      if (error) throw new Error(error.message);
      if (!window.Razorpay) throw new Error('Payment library not loaded — check your connection.');
      const me = _profile || (await loadProfile());
      return new Promise((resolve, reject) => {
        const rz = new window.Razorpay({
          key: data.key_id || C.RAZORPAY_KEY_ID, order_id: data.order_id, amount: data.amount, currency: 'INR',
          name: C.APP_NAME, description: data.description, prefill: { email: me.email, contact: me.phone || '' },
          notes: { user_id: me.id }, theme: { color: '#2f7d4f' },
          // the licence is written by the webhook, so poll briefly for it to land
          handler: async () => { for (let i = 0; i < 10; i++) { const e = await sbApi.myEntitlements(); if (e.length) break; await new Promise((r) => setTimeout(r, 1500)); } resolve({ ok: true }); },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        });
        rz.open();
      });
    },
    async saveTrip(trip) {
      const { sightings, ...t } = trip; const me = _profile || (await loadProfile());
      ok(await sb.from('trips').upsert({ ...t, user_id: me.id }));
      ok(await sb.from('sightings').delete().eq('trip_id', t.id));
      if (sightings.length) ok(await sb.from('sightings').insert(sightings.map((s) => ({ ...s, trip_id: t.id, user_id: me.id }))));
      return true;
    },
    async saveRoadkill(survey) {
      const { records, ...sv } = survey; const me = _profile || (await loadProfile());
      ok(await sb.from('roadkill_surveys').upsert({ ...sv, user_id: me.id }));
      ok(await sb.from('roadkill_records').delete().eq('survey_id', sv.id));
      if (records.length) ok(await sb.from('roadkill_records').insert(records.map((r) => ({ ...r, survey_id: sv.id, user_id: me.id }))));
      return true;
    },
    async myTrips() { const me = _profile || (await loadProfile()); return ok(await sb.from('trips').select('*, sightings(*)').eq('user_id', me.id).order('started_at', { ascending: false })); },
    async mySurveys() { const me = _profile || (await loadProfile()); return ok(await sb.from('roadkill_surveys').select('*, records:roadkill_records(*)').eq('user_id', me.id).order('started_at', { ascending: false })); },
    async publicStats() { return ok(await sb.rpc('public_stats')); },
    async publicPoints() { return ok(await sb.rpc('public_points')); },
    async publicTracks() { return ok(await sb.rpc('public_tracks')); },
    admin: {
      async allSpecies() { return ok(await sb.from('species_full').select('*').order('pack_id')).map(fromRow); },
      async upsertSpecies(s) { ok(await sb.from('species').upsert(toRow(s))); return s; },
      async deleteSpecies(id) { ok(await sb.from('species').delete().eq('id', id)); },
      async setChecklist(region, ids) { ok(await sb.rpc('set_checklist', { p_region: region, p_species: ids })); },
      async upsertPrice(p) { ok(await sb.from('pack_prices').upsert({ ...(p.id ? { id: p.id } : {}), pack_id: p.pack, region_code: p.region, paise: p.paise, days: p.days, active: p.active !== false })); },
      async deletePrice(id) { ok(await sb.from('pack_prices').delete().eq('id', id)); },
      async users() {
        const users = ok(await sb.from('profiles').select('*').order('created_at', { ascending: false }));
        const ents = ok(await sb.from('entitlements').select('id,user_id,pack:pack_id,region:region_code,valid_until,source').or('valid_until.is.null,valid_until.gt.' + new Date().toISOString()));
        return users.map((u) => ({ ...u, packs: ents.filter((e) => e.user_id === u.id) }));
      },
      async setUser(id, patch) { ok(await sb.from('profiles').update(patch).eq('id', id)); },
      async grant(user_id, pack, region, days) { ok(await sb.rpc('grant_pack', { p_user: user_id, p_pack: pack, p_region: region, p_days: days || null })); },
      async revoke(entId) { ok(await sb.from('entitlements').update({ valid_until: new Date().toISOString() }).eq('id', entId)); },
      async sightings() { return withUsernames(ok(await sb.from('sightings').select('*').order('observed_at', { ascending: false }).limit(5000))); },
      async review(id, status, note = '') { ok(await sb.from('sightings').update({ review_status: status, review_note: note || '' }).eq('id', id)); },
      async reviewTrip(tripId, status, note = '') { ok(await sb.from('sightings').update({ review_status: status, review_note: note || '' }).eq('trip_id', tripId)); },
      async accessRequests() { return withUsernames(ok(await sb.from('access_requests').select('*').order('created_at', { ascending: false }).limit(200))); },
      async decideAccess(id, approve) { ok(await sb.rpc('decide_access', { p_id: id, p_approve: !!approve })); },
      async feedback() { return ok(await sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(1000)); },
      async setFeedbackStatus(id, status) { ok(await sb.from('feedback').update({ status }).eq('id', id)); },
      async deleteSighting(id) { ok(await sb.from('sightings').delete().eq('id', id)); },
      async deleteTrip(id) { ok(await sb.from('trips').delete().eq('id', id)); },
      async trips() { return withUsernames(ok(await sb.from('trips').select('*, sightings(*)').order('started_at', { ascending: false }).limit(2000))); },
      async roadkill() {
        const surveys = ok(await sb.from('roadkill_surveys').select('*').order('started_at', { ascending: false }));
        const records = ok(await sb.from('roadkill_records').select('*').order('observed_at', { ascending: false }));
        return { surveys: await withUsernames(surveys), records: await withUsernames(records) };
      },
      async checklistEntries(region) { return ok(await sb.from('checklist').select('species_id,status').eq('region_code', region)); },
      async auditLog(limit = 300) { return ok(await sb.from('audit_log').select('*').order('at', { ascending: false }).limit(limit)); },
      async setChecklistEntry(region, speciesId, status) {
        if (!status) ok(await sb.from('checklist').delete().eq('region_code', region).eq('species_id', speciesId));
        else ok(await sb.from('checklist').upsert({ region_code: region, species_id: speciesId, status }));
      },
      async copyChecklist(from, to) {
        const rows = ok(await sb.from('checklist').select('species_id,status').eq('region_code', from));
        if (rows.length) ok(await sb.from('checklist').upsert(rows.map((r) => ({ ...r, region_code: to }))));
        return rows.length;
      },
      async deleteRoadkill(id) { ok(await sb.from('roadkill_records').delete().eq('id', id)); },
      async deleteSurvey(id) { ok(await sb.from('roadkill_surveys').delete().eq('id', id)); },
    },
  };

  // ───────── photo helper: shrink to ≤1280px JPEG data URL (demo) / upload to storage (supabase) ─────────
  async function processPhoto(file) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.8);
    if (DEMO) return dataUrl;
    const blob = await (await fetch(dataUrl)).blob();
    const me = _profile || (await loadProfile());
    const path = `${me.id}/${uid()}.jpg`;
    ok(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }));
    return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => typeof rows.find((r) => r[k] != null)?.[k] !== 'object');
    const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
  }
  function download(name, text, type = 'text/csv') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Small inline-SVG silhouette used when a species has no photo yet
  function silhouette(pack, color = '#2f7d4f') {
    const paths = {
      snakes: 'M10 60 C25 30 40 85 55 55 S80 25 90 45 l6 -3 -2 7 -6 -1 C78 35 62 80 50 70 S25 45 10 60z',
      lizards: 'M12 52 l22 -6 6 -10 4 8 18 -2 6 -9 3 9 14 2 10 -4 -8 8 -16 2 -6 8 -3 -8 -18 1 -5 9 -3 -9 -24 4z',
      frogs: 'M50 30 c14 0 24 10 24 22 0 6 4 8 10 12 l-8 4 -8 -6 c-4 4 -10 6 -18 6 s-14 -2 -18 -6 l-8 6 -8 -4 c6 -4 10 -6 10 -12 0 -12 10 -22 24 -22z',
      turtles: 'M50 34 c18 0 30 10 30 22 l8 2 -8 4 -4 8 -6 -6 H40 l-6 6 -4 -8 -10 -2 8 -4 c0 -12 4 -22 22 -22z',
    };
    return `<svg viewBox="0 0 100 100" role="img" aria-label="${esc(pack)} silhouette"><path d="${paths[pack] || paths.snakes}" fill="${color}" opacity=".85"/></svg>`;
  }

  window.HW = {
    C, SEED, DEMO, sb, IUCN, VENOM, TOXIC, CENTROIDS,
    api: DEMO ? demoApi : sbApi,
    net, isNetError,
    util: { durSet, durGet, storageWorks, isStandalone, isInAppBrowser, uid, esc, rupees, lsGet, lsSet, haversineKm, trackKm, nearestRegion, coarsen, computeStats, quoteFrom, processPhoto, toCSV, download, silhouette },
  };
})();
