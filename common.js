/* HerpWatch — shared data layer for the field app, dashboard, website and feedback page.
 *
 * One API (HW.api) on top of Supabase. All security lives in the database
 * (row-level security + triggers in supabase/setup.sql); this file only shapes data.
 *
 *   Roles: user · reviewer · admin (the platform owner, the only Admin; enforced in SQL)
 *   Field data: herping sessions (trips) → observations (sightings) → photos, GPS track points
 *   Offline: everything is queued on the device by the field app and synced with
 *            client-generated ids + upserts, so re-sending never duplicates a record.
 */
(function () {
  const C = window.HW_CONFIG || {};
  const SEED = window.HW_SEED || {};
  const CONFIGURED = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);

  // ───────── reference lists ─────────
  const IUCN = {
    EX: { name: 'Extinct', color: '#000000' }, EW: { name: 'Extinct in the Wild', color: '#542344' },
    CR: { name: 'Critically Endangered', color: '#c53030' }, EN: { name: 'Endangered', color: '#dd6b20' },
    VU: { name: 'Vulnerable', color: '#b7791f' }, NT: { name: 'Near Threatened', color: '#5a8f3c' },
    LC: { name: 'Least Concern', color: '#2f855a' }, DD: { name: 'Data Deficient', color: '#718096' }, NE: { name: 'Not Evaluated', color: '#a0aec0' },
  };
  const VENOM = {
    venomous: { label: 'Venomous', short: 'Venomous', color: '#c53030' },
    mild: { label: 'Mildly venomous (not medically significant)', short: 'Mildly venomous', color: '#b7791f' },
    non: { label: 'Non-venomous', short: 'Non-venomous', color: '#2f855a' },
  };
  const TOXIC = { poisonous: { label: 'Poisonous (toxic skin/secretions)', short: 'Poisonous' }, non: { label: 'Non-poisonous', short: 'Non-poisonous' } };
  const SURVEY_TYPES = {
    day: 'Day herping', night: 'Night herping', road: 'Road survey', transect: 'Transect survey', habitat: 'Habitat survey',
    opportunistic: 'Opportunistic observation', creek_mangrove: 'Creek & mangrove survey', stream_wetland: 'Stream & wetland survey',
  };
  const STATUSES = {
    pending: { label: 'Pending review', tone: 'pending' }, verified: { label: 'Verified', tone: 'ok' }, needs_id: { label: 'Needs identification', tone: 'warn' },
    more_info: { label: 'More information required', tone: 'warn' }, rejected: { label: 'Rejected', tone: 'bad' },
  };
  const EVIDENCE = { direct: 'Direct sighting', shed_skin: 'Shed skin', eggs: 'Eggs / egg shells', tracks: 'Tracks / trails', call: 'Call heard (frogs)', remains: 'Remains / skeleton', photo_only: 'Photo only (camera trap etc.)' };
  const LIFE_STAGES = ['Adult', 'Subadult', 'Juvenile', 'Hatchling', 'Egg', 'Tadpole', 'Metamorph', 'Unknown'];
  const SEXES = ['Unknown', 'Male', 'Female', 'Mixed'];
  const HABITATS = ['Evergreen forest', 'Semi-evergreen forest', 'Moist deciduous forest', 'Dry deciduous forest', 'Scrub', 'Grassland', 'Mangrove', 'Beach / coast', 'Littoral forest',
    'Stream / river', 'Pond / wetland', 'Paddy / farmland', 'Plantation', 'Village / urban', 'Rocky outcrop / cliff', 'Cave', 'Road / roadside', 'Other'];
  const MICROHABITATS = ['Leaf litter', 'Under log', 'Under rock', 'Tree trunk', 'Branch / shrub', 'Canopy', 'Tree hole', 'Burrow', 'Termite mound', 'In water', 'Water edge / bank',
    'Building wall', 'Inside building', 'Road surface', 'Open ground', 'Other'];
  const BEHAVIOURS = ['Basking', 'Resting', 'Moving', 'Foraging', 'Feeding', 'Calling', 'Mating / amplexus', 'Defensive display', 'Fleeing', 'Hiding', 'Shedding', 'Nesting', 'Dead'];
  const GROUPS = { snake: 'Snakes', lizard: 'Lizards', gecko: 'Geckos', skink: 'Skinks', agama: 'Agamas', monitor: 'Monitors', chameleon: 'Chameleons',
    turtle: 'Turtles', tortoise: 'Tortoises', crocodilian: 'Crocodilians', frog: 'Frogs', toad: 'Toads', caecilian: 'Caecilians' };
  const GROUP_CLASS = { snake: 'snake', lizard: 'lizard', gecko: 'lizard', skink: 'lizard', agama: 'lizard', monitor: 'lizard', chameleon: 'lizard',
    turtle: 'turtle_croc', tortoise: 'turtle_croc', crocodilian: 'turtle_croc', frog: 'amphibian', toad: 'amphibian', caecilian: 'amphibian' };

  // ───────── small utils ─────────
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('storage', e); } };
  function haversineKm(a, b) {
    const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const trackKm = (pts) => pts.reduce((s, p, i) => (i ? s + haversineKm(pts[i - 1], p) : 0), 0);
  const codedError = (code, message) => Object.assign(new Error(message), { code });
  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => typeof rows.find((r) => r[k] != null)?.[k] !== 'object');
    const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
  }
  function download(name, data, type = 'text/csv') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** Excel (.xlsx) via SheetJS, loaded on first use */
  async function downloadXlsx(name, sheets) {
    if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the Excel library (are you online?)')); document.head.appendChild(s); });
    const wb = XLSX.utils.book_new();
    for (const [title, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), title.slice(0, 31));
    XLSX.writeFile(wb, name);
  }
  /** "PDF": a clean printable report opened in a new window (Save as PDF from the print dialog) */
  function printReport(title, subtitle, columns, rows) {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Allow pop-ups to create the PDF');
    const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font:12px/1.4 system-ui,sans-serif;color:#16231c;margin:24px}h1{font-size:20px;margin:0}p{color:#56685d;margin:4px 0 14px}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e3e0d5;padding:5px 6px;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#56685d}
      tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  }

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
  /** Works offline: nearest state / district / island centre from the region list (lat/lng in the regions table).
   *  District and island are only suggested when they are close and inside the chosen state. */
  function locateRegions(regions, lat, lng) {
    const near = (list, maxKm) => { let best = null, bd = maxKm; for (const r of list) { if (r.lat == null) continue; const d = haversineKm([lat, lng], [+r.lat, +r.lng]); if (d < bd) { bd = d; best = r; } } return best; };
    const country = near(regions.filter((r) => r.kind === 'country'), 3000);
    const state = near(regions.filter((r) => r.kind === 'state' || r.kind === 'ut'), 700);
    const inState = (r) => { let x = r; for (let i = 0; i < 5 && x; i++) { if (x.parent === state?.code) return true; x = regions.find((y) => y.code === x.parent); } return false; };
    const district = state ? near(regions.filter((r) => r.kind === 'district' && inState(r)), 90) : null;
    const island = state ? near(regions.filter((r) => r.kind === 'island' && inState(r)), 30) : null;
    return { country: country?.code || null, state: state?.code || null, district: district?.code || null, island: island?.code || null };
  }
  /** Place name from OpenStreetMap (online only; never blocks recording) */
  async function placeName(lat, lng) {
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lng}`, { signal: ctrl.signal, headers: { 'Accept-Language': 'en' } });
      if (!r.ok) return '';
      const j = await r.json(), a = j.address || {};
      return [a.village || a.hamlet || a.suburb || a.town || a.city || a.locality || a.road, a.county || a.state_district].filter(Boolean).slice(0, 2).join(', ') || (j.display_name || '').split(',').slice(0, 2).join(',');
    } catch { return ''; }
  }

  // ───────── durable storage (localStorage + IndexedDB + Cache API) ─────────
  function idb(store = 'kv') {
    return new Promise((res) => {
      try { const r = indexedDB.open('hw_durable', 2); r.onupgradeneeded = () => { for (const s of ['kv', 'photos']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch { res(null); }
    });
  }
  const idbPut = async (store, k, v) => { const db = await idb(); if (!db) return; await new Promise((ok) => { try { const tx = db.transaction(store, 'readwrite'); v == null ? tx.objectStore(store).delete(k) : tx.objectStore(store).put(v, k); tx.oncomplete = ok; tx.onerror = ok; } catch { ok(); } }); };
  const idbGetv = async (store, k) => { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const g = db.transaction(store).objectStore(store).get(k); g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null); } catch { res(null); } }); };
  const cacheSet = async (k, v) => { try { const c = await caches.open('hw_durable'); const u = '/__hw_durable/' + encodeURIComponent(k); v == null ? await c.delete(u) : await c.put(u, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })); } catch {} };
  const cacheGet = async (k) => { try { const r = await (await caches.open('hw_durable')).match('/__hw_durable/' + encodeURIComponent(k)); return r ? r.json() : null; } catch { return null; } };
  function durSet(k, v) { v == null ? (() => { try { localStorage.removeItem(k); } catch {} })() : lsSet(k, v); idbPut('kv', k, v); cacheSet(k, v); }
  async function durGet(k) {
    let v = lsGet(k, null); if (v != null) return v;
    v = await idbGetv('kv', k); if (v != null) { lsSet(k, v); return v; }
    v = await cacheGet(k); if (v != null) { lsSet(k, v); idbPut('kv', k, v); return v; }
    return null;
  }
  // photos taken offline live in IndexedDB until they are uploaded
  const photoStore = { put: (id, blob) => idbPut('photos', id, blob), get: (id) => idbGetv('photos', id), del: (id) => idbPut('photos', id, null) };
  const storageWorks = () => { try { localStorage.setItem('hw_ck', '1'); const ok = localStorage.getItem('hw_ck') === '1'; localStorage.removeItem('hw_ck'); return ok; } catch { return false; } };
  try { navigator.storage?.persist?.(); } catch {}
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isInAppBrowser = () => /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Telegram|Snapchat/i.test(navigator.userAgent || '');

  /** Shrink a camera photo to ≤1600 px JPEG and keep basic metadata */
  async function processPhoto(file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Unsupported image')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
    return { blob, width: c.width, height: c.height, size_bytes: blob.size, taken_at: new Date(file.lastModified || Date.now()).toISOString(), original_name: file.name || '' };
  }

  // ───────── network truth + Supabase client ─────────
  const _linkParams = new URLSearchParams((location.hash || '').replace(/^#/, '') + '&' + (location.search || '').replace(/^\?/, ''));
  let _recovery = _linkParams.get('type') === 'recovery';
  const _linkError = _linkParams.get('error_description') || _linkParams.get('error') || '';
  const net = { ok: true, at: 0 };
  const setNet = (okNow) => { if (net.ok !== okNow) { net.ok = okNow; dispatchEvent(new CustomEvent('hw-net', { detail: okNow })); } net.at = Date.now(); };
  const timedFetch = async (url, opts = {}) => {
    const ctrl = new AbortController(), slow = /\/(functions|storage)\/v1\//.test(String(url)), t = setTimeout(() => ctrl.abort(), slow ? 45000 : 15000);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); setNet(true); return r; }
    catch (e) { setNet(false); throw new Error(e.name === 'AbortError' ? 'No connection (request timed out)' : 'No connection'); }
    finally { clearTimeout(t); }
  };
  const sb = CONFIGURED && window.supabase ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { global: { fetch: timedFetch } }) : null;
  const isNetError = (e) => /no connection|failed to fetch|network|load failed|timed out|offline/i.test(String(e?.message || e));
  const authListeners = new Set();
  if (sb) sb.auth.onAuthStateChange((evt, session) => { if (evt === 'PASSWORD_RECOVERY') _recovery = true; authListeners.forEach((f) => { try { f(evt, session); } catch {} }); });

  const DB_UPDATE_MSG = 'The database needs the latest update: the Admin should paste supabase/setup.sql into Supabase → SQL Editor and Run it (safe to re-run, keeps all data).';
  const isDbBehind = (error) => ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code) || /schema cache|does not exist/i.test(error?.message || '');
  const ok = ({ data, error }) => {
    if (error) throw isDbBehind(error) ? codedError('db_update_needed', DB_UPDATE_MSG) : Object.assign(new Error(error.message), { code: error.code });
    return data;
  };
  const need = () => { if (!sb) throw codedError('not_configured', 'This copy of HerpWatch is not connected to a database yet (config.js).'); };

  function authError(error, email) {
    const m = String(error?.message || error || ''), code = error?.code || error?.error_code || '';
    if (/rate limit/i.test(m) || code === 'over_email_send_rate_limit' || error?.status === 429)
      return codedError('email_rate_limit', 'Too many e-mails were sent in a short time. Supabase’s built-in mailer allows only a few per hour, so please wait and try again (the Admin can add an e-mail server in Supabase to remove this limit).');
    if (/not authorized/i.test(m) || code === 'email_address_not_authorized')
      return codedError('email_not_authorized', `Supabase’s built-in mailer only sends to the project team, so ${email || 'this address'} was refused. The Admin needs to set up SMTP in Supabase, or turn off "Confirm email".`);
    if (/error sending|sending.*email|smtp/i.test(m)) return codedError('email_send_failed', 'Supabase could not send the e-mail. The Admin should check the e-mail (SMTP) settings in Supabase, or turn off "Confirm email".');
    if (/signups? not allowed|signup.*disabled/i.test(m) || code === 'signup_disabled') return codedError('signup_disabled', 'New sign-ups are switched off.');
    if (/expired|invalid.*(link|token)|otp/i.test(m)) return codedError('link_expired', 'This e-mail link has expired or was already used. Request a new one.');
    if (/not confirmed/i.test(m)) return codedError('email_not_confirmed', `Please confirm your e-mail first: open the link we sent to ${email}.`);
    if (/invalid login credentials/i.test(m)) return codedError('bad_credentials', 'Wrong e-mail or password. The same account works in the app and the dashboard; use "Reset password" if you forgot it.');
    return Object.assign(new Error(m), { code });
  }

  // ───────── profile ─────────
  let _profile = null;
  const redirectBase = () => location.href.split('#')[0].split('?')[0];
  async function loadProfile() {
    need();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (_profile = null);
    let p;
    try { p = ok(await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()); }
    catch (e) {
      const cached = isNetError(e) ? await durGet('hw_profile_' + session.user.id) : null;
      if (cached) return (_profile = { ...cached, offline: true });
      throw e;
    }
    if (!p) { const { data } = await sb.rpc('ensure_profile'); p = data && data.id ? data : null; }
    _profile = p ? { ...p, email: session.user.email } : { id: session.user.id, email: session.user.email, username: (session.user.email || '').split('@')[0], role: 'user', status: 'approved' };
    durSet('hw_profile_' + session.user.id, _profile);
    return _profile;
  }
  const me = async () => _profile || (await loadProfile());
  async function withUsernames(rows) {
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    if (!ids.length) return rows;
    const profs = ok(await sb.from('profiles').select('id,username,full_name').in('id', ids));
    const by = Object.fromEntries(profs.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, username: by[r.user_id]?.username || '', full_name: by[r.user_id]?.full_name || '' }));
  }

  // DB rows ↔ UI species objects
  const fromRow = (r) => r && ({
    id: r.id, pack: r.pack_id, common: r.common_name, sci: r.scientific_name, family: r.family || '', genus: r.genus || '', order: r.order_name || '', group: r.taxon_group || '',
    authority: r.authority || '', refs: r.refs || '', venom: r.venom, toxic: r.toxic, iucn: r.iucn, endemic: r.endemic, sensitive: r.sensitive, size: r.size, habitat: r.habitat,
    distribution: r.distribution, id_notes: r.id_notes, behaviour: r.behaviour, similar: r.similar_species, images: r.images || [], traits: r.traits || {}, regions: r.regions || [],
  });
  const toRow = (s) => ({
    id: s.id, pack_id: s.pack, common_name: s.common, scientific_name: s.sci, family: s.family, genus: s.genus || (s.sci || '').split(' ')[0], order_name: s.order || '',
    taxon_group: s.group || '', authority: s.authority || '', refs: s.refs || '', venom: s.venom, toxic: s.toxic, iucn: s.iucn, endemic: !!s.endemic, sensitive: !!s.sensitive,
    size: s.size || '', habitat: s.habitat || '', distribution: s.distribution || '', id_notes: s.id_notes || '', behaviour: s.behaviour || '', similar_species: s.similar || '',
    images: s.images || [], traits: s.traits || {},
  });
  // the observation columns the field app may write (review fields are server-controlled)
  const OBS_COLS = ['id', 'trip_id', 'user_id', 'species_id', 'species_text', 'count', 'lat', 'lng', 'accuracy_m', 'elevation_m', 'observed_at', 'region_code', 'state_code',
    'district_code', 'island_code', 'location_name', 'life_stage', 'sex', 'notes', 'photos', 'id_confidence', 'evidence', 'mortality', 'origin', 'habitat', 'microhabitat',
    'behaviour', 'activity', 'weather', 'temperature_c', 'privacy'];
  const SESSION_COLS = ['id', 'user_id', 'region_code', 'protocol', 'survey_type', 'title', 'status', 'started_at', 'ended_at', 'duration_min', 'paused_min', 'distance_km', 'observers',
    'complete', 'track', 'lat', 'lng', 'start_accuracy_m', 'start_elevation_m', 'end_lat', 'end_lng', 'location_name', 'state_code', 'district_code', 'island_code', 'weather', 'notes'];
  const pick = (o, cols) => Object.fromEntries(cols.filter((k) => o[k] !== undefined).map((k) => [k, o[k] === '' && /_code$/.test(k) ? null : o[k]]));
  const PROTOCOL_OF = { night: 'night_walk', transect: 'traveling', road: 'traveling', habitat: 'area', creek_mangrove: 'traveling', stream_wetland: 'traveling', day: 'traveling', opportunistic: 'incidental' };

  const api = {
    configured: CONFIGURED,
    // ── auth ──
    session: loadProfile,
    async signIn(email, password) {
      need();
      if (!email.includes('@')) throw codedError('use_email', 'Sign in with your e-mail address (the same one for the app and the dashboard).');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw authError(error, email);
      const p = await loadProfile();
      if (p?.status === 'blocked') { await sb.auth.signOut(); throw new Error('This account is suspended. Contact the administrator.'); }
      return p;
    },
    async signUp(f) {
      need();
      const { data, error } = await sb.auth.signUp({ email: f.email, password: f.password,
        options: { emailRedirectTo: redirectBase(), data: { username: f.username, full_name: f.full_name, phone: f.phone || '', home_region: f.home_region, requested_role: f.requested_role === 'reviewer' ? 'reviewer' : '' } } });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) throw codedError('already_registered', `${f.email} already has a ${C.APP_NAME} account (one account works for the app and the dashboard). Sign in instead.`);
        throw authError(error, f.email);
      }
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
        throw codedError('already_registered', `${f.email} already has a ${C.APP_NAME} account (one account works for the app and the dashboard). Sign in instead.`);
      return loadProfile();
    },
    async signInWithGoogle(redirectTo) { need(); ok(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo || redirectBase() } })); },
    async resetPassword(email) {
      need();
      if (!String(email).includes('@')) throw codedError('use_email', 'Enter the e-mail address of your account.');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectBase() });
      if (error) throw authError(error, email);
    },
    async resendConfirmation(email) { need(); const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectBase() } }); if (error) throw authError(error, email); },
    isRecovery: () => _recovery,
    linkError: () => (_linkError ? authError({ message: _linkError }).message : ''),
    async updatePassword(password) {
      need();
      if (!password || password.length < 6) throw codedError('weak_password', 'Use at least 6 characters.');
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw authError(error);
      _recovery = false;
      try { history.replaceState(null, '', location.pathname); } catch {}
      return loadProfile();
    },
    onAuth(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    async signOut() { if (sb) await sb.auth.signOut(); _profile = null; },
    async updateProfile(patch) { const m = await me(); ok(await sb.from('profiles').update(pick(patch, ['full_name', 'phone', 'home_region'])).eq('id', m.id)); _profile = null; return loadProfile(); },

    // ── access (Admin = platform owner only) ──
    async hasAdmin() { need(); const { data, error } = await sb.rpc('has_admin'); if (error) return isDbBehind(error) ? null : true; return !!data; },
    async requestAccess(note = '') { need(); return ok(await sb.rpc('request_access', { p_role: 'reviewer', p_note: note })); },
    async myAccessRequest() { need(); const m = await me(); const { data, error } = await sb.from('access_requests').select('*').eq('user_id', m.id).order('created_at', { ascending: false }).limit(1).maybeSingle(); return error ? null : data; },

    // ── catalogue ──
    async packs() { need(); return ok(await sb.from('packs').select('*').order('sort')); },
    async regions() { need(); return ok(await sb.from('regions').select('*').order('sort').order('code')); },
    async prices() { need(); return ok(await sb.from('pack_prices').select('id,pack:pack_id,region:region_code,paise,days,active').eq('active', true)); },
    async settings() { need(); const rows = ok(await sb.from('platform_settings').select('key,value')); return Object.fromEntries(rows.map((r) => [r.key, r.value])); },
    async speciesIndex() { need(); return ok(await sb.from('species_index').select('*')).map(fromRow); },
    async speciesFull(id) { need(); return fromRow(ok(await sb.from('species_full').select('*').eq('id', id).maybeSingle())); },
    async unlockedSpecies() { need(); return ok(await sb.from('species_full').select('*')).map(fromRow); },
    async checklist(region) { need(); return ok(await sb.from('checklist').select('species_id').eq('region_code', region)).map((r) => r.species_id); },
    async checklistEntries(region) { need(); return ok(await sb.from('checklist').select('species_id,status').eq('region_code', region)); },
    async myEntitlements() { need(); return ok(await sb.from('entitlements').select('id,pack:pack_id,region:region_code,valid_until,source').or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())); },
    onCatalogChange(cb) {
      if (!sb) return () => {};
      const ch = sb.channel('hw-catalog')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist' }, (e) => cb('checklist', e))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'species' }, (e) => cb('species', e))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pack_prices' }, (e) => cb('prices', e))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    async checkout(items) {
      need();
      const { data, error } = await sb.functions.invoke('create-order', { body: { items } });
      if (error) throw new Error(/not found|404/i.test(error.message) ? 'Payments are not switched on yet.' : error.message);
      if (!window.Razorpay) throw new Error('Payment library not loaded — check your connection.');
      const m = await me();
      return new Promise((resolve, reject) => {
        new window.Razorpay({
          key: data.key_id || C.RAZORPAY_KEY_ID, order_id: data.order_id, amount: data.amount, currency: 'INR', name: C.APP_NAME, description: data.description,
          prefill: { email: m.email, contact: m.phone || '' }, notes: { user_id: m.id }, theme: { color: '#2f7d4f' },
          handler: async () => { for (let i = 0; i < 10; i++) { if ((await api.myEntitlements()).length) break; await new Promise((r) => setTimeout(r, 1500)); } resolve({ ok: true }); },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        }).open();
      });
    },

    // ── field data (the field app queues these and replays them when online) ──
    async uploadPhoto(blob, path) {
      need();
      const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);
      return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    },
    /** session + its observations + track points + photo rows; idempotent */
    async saveSession({ session, observations = [], removed = [], points = [], photos = [] }) {
      need(); const m = await me();
      const s = pick({ ...session, user_id: m.id, protocol: PROTOCOL_OF[session.survey_type] || 'incidental' }, SESSION_COLS);
      ok(await sb.from('trips').upsert(s));
      if (removed.length) ok(await sb.from('sightings').delete().in('id', removed).eq('user_id', m.id));
      if (observations.length) ok(await sb.from('sightings').upsert(observations.map((o) => pick({ ...o, trip_id: session.id, user_id: m.id }, OBS_COLS))));
      for (let i = 0; i < points.length; i += 500)
        ok(await sb.from('track_points').upsert(points.slice(i, i + 500).map((p) => ({ ...p, session_id: session.id, user_id: m.id })), { onConflict: 'session_id,t', ignoreDuplicates: true }));
      if (photos.length) ok(await sb.from('photos').upsert(photos.map((p) => ({ ...p, user_id: m.id }))));
      return true;
    },
    async saveObservation({ observation, photos = [] }) {
      need(); const m = await me();
      ok(await sb.from('sightings').upsert(pick({ ...observation, user_id: m.id }, OBS_COLS)));
      if (photos.length) ok(await sb.from('photos').upsert(photos.map((p) => ({ ...p, user_id: m.id }))));
      return true;
    },
    async deleteObservation(id) { need(); ok(await sb.from('sightings').delete().eq('id', id)); },
    async deleteSession(id) { need(); ok(await sb.from('trips').delete().eq('id', id)); },
    async mySessions() { need(); const m = await me(); return ok(await sb.from('trips').select('*').eq('user_id', m.id).order('started_at', { ascending: false }).limit(1000)); },
    async myObservations() {
      need(); const m = await me();
      return ok(await sb.from('sightings').select('*, photo_rows:photos(*), reviews:observation_reviews(*)').eq('user_id', m.id).order('observed_at', { ascending: false }).limit(10000));
    },
    async sessionTrack(id) { need(); return ok(await sb.from('track_points').select('t,lat,lng,accuracy_m,elevation_m').eq('session_id', id).order('t')); },
    async commentOnObservation(id, text) { need(); return ok(await sb.rpc('review_observation', { p_sighting: id, p_action: 'comment', p_species: null, p_comment: text, p_duplicate_of: null })); },
    async submitFeedback(f) { need(); const { data: { session } } = await sb.auth.getSession(); ok(await sb.from('feedback').insert({ ...f, user_id: session?.user?.id || null })); },

    // ── public (website / Explore) ──
    async nearbySpecies(lat, lng, km = 10, days = 3650) { need(); return ok(await sb.rpc('nearby_species', { p_lat: lat, p_lng: lng, p_km: km, p_days: days })); },
    async speciesMedia(id) { need(); return ok(await sb.from('species_media').select('*').eq('species_id', id).order('kind').order('sort').order('created_at')); },
    async publicStats() { need(); return ok(await sb.rpc('public_stats')); },
    async publicPoints() { need(); return ok(await sb.rpc('public_points')); },
    async publicTracks() { need(); return ok(await sb.rpc('public_tracks')); },
    async leaderboard(f = {}) { need(); return ok(await sb.rpc('public_leaderboard', { p_region: f.region || null, p_from: f.from || null, p_group: f.group || null, p_limit: f.limit || 50 })); },
    async publicObservations(f = {}) {
      need();
      return ok(await sb.rpc('public_observations', { p_species: f.species || null, p_family: f.family || null, p_from: f.from || null, p_to: f.to || null, p_region: f.region || null, p_status: f.status || null, p_limit: f.limit || 3000 }));
    },

    // ── reviewer & admin (dashboard) ──
    admin: {
      async allSpecies() { need(); return ok(await sb.from('species_full').select('*').order('pack_id')).map(fromRow); },
      async upsertSpecies(s) { need(); ok(await sb.from('species').upsert(toRow(s))); return s; },
      async annotateSpecies(id, patch) { need(); ok(await sb.from('species').update(pick(patch, ['distribution', 'habitat', 'endemic', 'iucn', 'sensitive', 'images', 'refs', 'id_notes', 'behaviour', 'similar_species'])).eq('id', id)); },
      async deleteSpecies(id) { need(); ok(await sb.from('species').delete().eq('id', id)); },
      async checklistEntries(region) { need(); return ok(await sb.from('checklist').select('species_id,status').eq('region_code', region)); },
      async setChecklistEntry(region, speciesId, status) {
        need();
        if (!status) ok(await sb.from('checklist').delete().eq('region_code', region).eq('species_id', speciesId));
        else ok(await sb.from('checklist').upsert({ region_code: region, species_id: speciesId, status }));
      },
      async copyChecklist(from, to) {
        need();
        const rows = ok(await sb.from('checklist').select('species_id,status').eq('region_code', from));
        if (rows.length) ok(await sb.from('checklist').upsert(rows.map((r) => ({ ...r, region_code: to }))));
        return rows.length;
      },
      async upsertRegion(r) { need(); ok(await sb.from('regions').upsert(pick(r, ['code', 'name', 'parent', 'kind', 'lat', 'lng', 'sort']))); },
      async deleteRegion(code) { need(); ok(await sb.from('regions').delete().eq('code', code)); },
      async auditLog(limit = 500) { need(); return ok(await sb.from('audit_log').select('*').order('at', { ascending: false }).limit(limit)); },
      async upsertPrice(p) { need(); ok(await sb.from('pack_prices').upsert({ ...(p.id ? { id: p.id } : {}), pack_id: p.pack, region_code: p.region, paise: p.paise, days: p.days, active: p.active !== false })); },
      async deletePrice(id) { need(); ok(await sb.from('pack_prices').delete().eq('id', id)); },
      async users() {
        need();
        const users = ok(await sb.from('profiles').select('*').order('created_at', { ascending: false }));
        const ents = ok(await sb.from('entitlements').select('id,user_id,pack:pack_id,region:region_code,valid_until,source').or('valid_until.is.null,valid_until.gt.' + new Date().toISOString()));
        const owner = ok(await sb.from('platform_owner').select('user_id')).map((r) => r.user_id)[0];
        return users.map((u) => ({ ...u, is_owner: u.id === owner, packs: ents.filter((e) => e.user_id === u.id) }));
      },
      async setUser(id, patch) { need(); ok(await sb.from('profiles').update(pick(patch, ['role', 'status', 'full_name', 'phone', 'home_region'])).eq('id', id)); },
      async grant(user_id, pack, region, days) { need(); ok(await sb.rpc('grant_pack', { p_user: user_id, p_pack: pack, p_region: region, p_days: days || null })); },
      async revoke(entId) { need(); ok(await sb.from('entitlements').update({ valid_until: new Date().toISOString() }).eq('id', entId)); },
      async trips() { need(); return withUsernames(ok(await sb.from('trips').select('*, sightings(*)').order('started_at', { ascending: false }).limit(3000))); },
      async sightings() { need(); return withUsernames(ok(await sb.from('sightings').select('*, photo_rows:photos(*), reviews:observation_reviews(*)').order('observed_at', { ascending: false }).limit(10000))); },
      /** action: verify | reject | needs_id | more_info | suggest_id | reidentify | duplicate | comment | reopen */
      async reviewObservation(id, action, speciesId = null, comment = '', duplicateOf = null) {
        need(); return ok(await sb.rpc('review_observation', { p_sighting: id, p_action: action, p_species: speciesId, p_comment: comment, p_duplicate_of: duplicateOf }));
      },
      async review(id, status, note = '') { const action = { verified: 'verify', rejected: 'reject', needs_id: 'needs_id', more_info: 'more_info', pending: 'reopen' }[status] || status; return api.admin.reviewObservation(id, action, null, note); },
      async reviewTrip(tripId, status, note = '') {
        need(); const ids = ok(await sb.from('sightings').select('id,review_status').eq('trip_id', tripId));
        for (const s of ids) if (s.review_status !== status) await api.admin.review(s.id, status, note);
      },
      async deleteSighting(id) { need(); ok(await sb.from('sightings').delete().eq('id', id)); },
      async deleteTrip(id) { need(); ok(await sb.from('trips').delete().eq('id', id)); },
      /** road-kill: legacy logger tables + road-survey sessions with road-kill observations */
      async roadkill() {
        need();
        const [ls, lr, ts, tr] = await Promise.all([
          sb.from('roadkill_surveys').select('*').order('started_at', { ascending: false }),
          sb.from('roadkill_records').select('*').order('observed_at', { ascending: false }),
          sb.from('trips').select('*').eq('survey_type', 'road').order('started_at', { ascending: false }),
          sb.from('sightings').select('*').eq('mortality', 'roadkill').order('observed_at', { ascending: false }),
        ].map(async (p) => ok(await p)));
        const spPack = Object.fromEntries((await api.speciesIndex()).map((s) => [s.id, s.pack]));
        const surveys = [...ls, ...ts.map((t) => ({ id: t.id, user_id: t.user_id, region_code: t.region_code, mode: 'session', road_name: t.title || t.location_name || 'Road survey', road_type: '', started_at: t.started_at, ended_at: t.ended_at, distance_km: +t.distance_km || 0, track: t.track || [], notes: t.notes }))];
        const records = [...lr, ...tr.map((s) => ({ id: s.id, survey_id: s.trip_id, user_id: s.user_id, species_id: s.species_id, species_text: s.species_text, pack: spPack[s.species_id] || 'snakes', count: s.count, lat: s.lat, lng: s.lng, observed_at: s.observed_at, condition: s.notes ? 'see notes' : '', side: '', notes: s.notes, photos: s.photos || [], region_code: s.region_code }))];
        return { surveys: await withUsernames(surveys), records: await withUsernames(records) };
      },
      async deleteRoadkill(id) { need(); const r = await sb.from('roadkill_records').delete().eq('id', id).select('id'); if (!r.data?.length) ok(await sb.from('sightings').delete().eq('id', id)); },
      async deleteSurvey(id) { need(); const r = await sb.from('roadkill_surveys').delete().eq('id', id).select('id'); if (!r.data?.length) ok(await sb.from('trips').delete().eq('id', id)); },
      async feedback() { need(); return ok(await sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(1000)); },
      async setFeedbackStatus(id, status) { need(); ok(await sb.from('feedback').update({ status }).eq('id', id)); },
      async accessRequests() { need(); return withUsernames(ok(await sb.from('access_requests').select('*').order('created_at', { ascending: false }).limit(200))); },
      async decideAccess(id, approve) { need(); ok(await sb.rpc('decide_access', { p_id: id, p_approve: !!approve })); },
      // reviewer proposals → Admin approval
      async submissions() { need(); return withUsernames((ok(await sb.from('reviewer_submissions').select('*').order('created_at', { ascending: false }).limit(500))).map((r) => ({ ...r, user_id: r.submitted_by }))); },
      async submit(kind, { region = null, species = null, payload = {}, note = '', refs = '' } = {}) {
        need(); const m = await me();
        return ok(await sb.from('reviewer_submissions').insert({ submitted_by: m.id, kind, region_code: region, species_id: species, payload, note, refs }).select().single());
      },
      async decideSubmission(id, approve, note = '') { need(); return ok(await sb.rpc('decide_submission', { p_id: id, p_approve: !!approve, p_note: note })); },
      /** upload a file (image, video, audio, PDF) to the public species bucket and return its URL */
      async uploadSpeciesFile(file, speciesId) {
        need();
        const ext = (file.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const path = `${speciesId}/${Date.now()}-${uid().slice(0, 8)}.${ext}`;
        const { error } = await sb.storage.from('species').upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw new Error(/row-level|policy|not authorized/i.test(error.message) ? 'Upload refused: the species storage policy is missing (re-run setup.sql) or you are not a reviewer.' : error.message);
        return { url: sb.storage.from('species').getPublicUrl(path).data.publicUrl, storage_path: path };
      },
      async addMedia(m) { need(); const me_ = await me(); return ok(await sb.from('species_media').insert({ ...pick(m, ['species_id', 'kind', 'url', 'storage_path', 'title', 'caption', 'credit', 'license', 'citation', 'doi', 'year', 'sort']), added_by: me_.id }).select().single()); },
      async updateMedia(id, patch) { need(); ok(await sb.from('species_media').update(pick(patch, ['title', 'caption', 'credit', 'license', 'citation', 'doi', 'year', 'sort'])).eq('id', id)); },
      async deleteMedia(id) { need(); ok(await sb.from('species_media').delete().eq('id', id)); },
      async setSetting(key, value) { need(); ok(await sb.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() })); },
      /** complete platform export (Admin): every table the Admin can read */
      async exportAll() {
        need();
        const tables = ['profiles', 'regions', 'species', 'species_media', 'checklist', 'trips', 'sightings', 'photos', 'observation_reviews', 'track_points', 'reviewer_submissions', 'roadkill_surveys', 'roadkill_records', 'feedback', 'access_requests', 'audit_log', 'platform_settings', 'pack_prices', 'entitlements'];
        const out = {};
        for (const t of tables) {
          const rows = []; let from = 0;
          for (;;) { const r = ok(await sb.from(t).select('*').range(from, from + 999)); rows.push(...r); if (r.length < 1000) break; from += 1000; }
          out[t] = rows;
        }
        return out;
      },
    },
  };

  window.HW = {
    C, SEED, DEMO: false, CONFIGURED, sb, net, isNetError, IUCN, VENOM, TOXIC, SURVEY_TYPES, STATUSES, EVIDENCE, LIFE_STAGES, SEXES, HABITATS, MICROHABITATS, BEHAVIOURS, GROUPS, GROUP_CLASS,
    api,
    util: { durSet, durGet, photoStore, storageWorks, isStandalone, isInAppBrowser, uid, esc, rupees, lsGet, lsSet, haversineKm, trackKm, quoteFrom, locateRegions, placeName, processPhoto, toCSV, download, downloadXlsx, printReport },
  };
})();
