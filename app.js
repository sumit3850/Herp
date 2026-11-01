/* HerpWatch field app — herping sessions, observations, GPS tracks, photos, checklists.
 * Offline-first: everything is written to the device first (durable storage) and synced with
 * client-generated ids, so a record is never duplicated and keeps its original timestamp. */
'use strict';
const { api, IUCN, VENOM, SURVEY_TYPES, STATUSES, EVIDENCE, LIFE_STAGES, SEXES, HABITATS, MICROHABITATS, BEHAVIOURS, GROUPS, util: U } = HW;
const $ = (id) => document.getElementById(id);
const esc = U.esc;
const I = (n, c = '') => (window.HWI ? HWI(n, c) : '');

// ───────────────────────── state ─────────────────────────
const S = {
  me: null, packs: [], regions: [], prices: [], index: [], unlocked: {}, ents: [], settings: {},
  region: U.lsGet('hw_region', HW.C.DEFAULT_REGION || 'IN'), checklist: [], clStatus: {},
  myObs: [], mySessions: [], view: 'home',
  guide: { pack: 'all', filters: new Set(), q: '', family: '', genus: '', order: '' },
};
const byId = (id) => S.index.find((s) => s.id === id);
const packOf = (id) => S.packs.find((p) => p.id === id) || { name: id || 'Other', emoji: '', color: '#2f7d4f' };
const regionOf = (c) => S.regions.find((r) => r.code === c);
const regionName = (c) => regionOf(c)?.name || c || '';
const isUnlocked = (id) => !!S.unlocked[id];
const packsRequired = () => S.settings.require_packs !== false && S.settings.require_packs !== 'false';
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const fmtDate = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const fmtDT = (t) => `${fmtDate(t)}, ${fmtTime(t)}`;
const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const nameMode = () => U.lsGet('hw_names', 'common');          // common | sci | both
const nm = (s) => (!s ? '' : nameMode() === 'sci' ? s.sci : nameMode() === 'both' ? `${s.common} (${s.sci})` : s.common);
const nmHtml = (s) => (nameMode() === 'sci' ? `<i>${esc(s.sci)}</i>` : nameMode() === 'both' ? `${esc(s.common)} <i class="muted">(${esc(s.sci)})</i>` : esc(s.common));
const miles = () => U.lsGet('hw_units', 'km') === 'mi';
const dist = (km) => (miles() ? `${(km * 0.621371).toFixed(2)} mi` : `${(+km).toFixed(2)} km`);
const spName = (o) => (o.species_id && byId(o.species_id) ? nm(byId(o.species_id)) : o.species_text || 'Unidentified');
const spSci = (o) => (o.species_id && byId(o.species_id) ? byId(o.species_id).sci : '');

function toast(msg, ms = 2800) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
let sheetClose = null;
function openSheet(html, onClose) { $('sheetbody').innerHTML = html; $('sheet').classList.add('on'); $('scrim').classList.add('on'); $('sheet').scrollTop = 0; sheetClose = onClose || null; }
function closeSheet() { $('sheet').classList.remove('on'); $('scrim').classList.remove('on'); const f = sheetClose; sheetClose = null; f?.(); }
$('scrim').onclick = closeSheet; $('sheetx').onclick = closeSheet;

const dot = (p) => `<span class="gdot" style="--pc:${packOf(p).color}"></span>`;
const VICON = { venomous: 'triangle-alert', mild: 'info', non: 'circle-check' };
function mono(s, hero) {
  const [g = '', sp = ''] = (s.sci || '').split(' ');
  return `<div class="mono-thumb${hero ? ' mono-hero' : ''}" style="--pc:${packOf(s.pack).color}"><b>${esc(g[0] || '')}${esc(sp[0] || '')}</b><small>${esc(hero ? s.family + ' · ' + packOf(s.pack).name : s.family)}</small></div>`;
}
function pills(s) {
  const iu = IUCN[s.iucn] || IUCN.NE;
  let h = `<span class="pill iucn" style="background:${iu.color}" title="${esc(iu.name)}">IUCN ${esc(s.iucn)}</span>`;
  if (s.pack === 'snakes' || s.venom !== 'non') h += `<span class="pill ${s.venom === 'venomous' ? 'venom' : s.venom === 'mild' ? 'mild' : 'safe'}">${I(VICON[s.venom])} ${VENOM[s.venom]?.short || ''}</span>`;
  if (s.toxic === 'poisonous') h += `<span class="pill poison">${I('skull')} Poisonous</span>`;
  const cst = S.clStatus?.[s.id];
  if (s.endemic || cst === 'endemic') h += `<span class="pill end">Endemic</span>`;
  if (cst && !['native', 'endemic'].includes(cst)) h += `<span class="pill lock">${esc(cap(cst))}</span>`;
  if (!isUnlocked(s.id)) h += `<span class="pill lock">${I('lock')} ${esc(packOf(s.pack).name)}</span>`;
  return h;
}
function thumb(s) {
  const img = S.unlocked[s.id]?.images?.[0], url = typeof img === 'string' ? img : img?.url;
  return url ? `<img src="${esc(url)}" alt="" loading="lazy">` : mono(s);
}
const statusBadge = (st) => `<span class="badge ${STATUSES[st]?.tone || ''}">${esc(STATUSES[st]?.label || st)}</span>`;

// ───────────────────────── region helpers ─────────────────────────
function regionOptions(value, { blank = '', kinds = null } = {}) {
  const kids = (code) => S.regions.filter((r) => r.parent === code).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
  const out = blank ? [`<option value="">${esc(blank)}</option>`] : [];
  const walk = (r, depth) => {
    if (!kinds || kinds.includes(r.kind)) out.push(`<option value="${esc(r.code)}" ${r.code === value ? 'selected' : ''}>${'  '.repeat(depth)}${esc(r.name)}${r.kind === 'country' ? ' (whole country)' : ''}</option>`);
    kids(r.code).forEach((k) => walk(k, depth + 1));
  };
  S.regions.filter((r) => !r.parent).forEach((r) => walk(r, 0));
  return out.join('');
}
const descendants = (code) => { const out = new Set([code]); let grew = true; while (grew) { grew = false; for (const r of S.regions) if (r.parent && out.has(r.parent) && !out.has(r.code)) { out.add(r.code); grew = true; } } return out; };
const obsInRegion = (o, code) => { const d = descendants(code); return [o.region_code, o.state_code, o.district_code, o.island_code].some((c) => c && d.has(c)); };

// ───────────────────────── catalogue (cached for offline) ─────────────────────────
async function loadCatalog() {
  const cache = U.lsGet('hw_cat', null);
  if (cache) Object.assign(S, { packs: cache.packs, regions: cache.regions, prices: cache.prices, index: cache.index, settings: cache.settings || {} });
  try {
    const [packs, regions, prices, index, settings] = await Promise.all([api.packs(), api.regions(), api.prices(), api.speciesIndex(), api.settings().catch(() => ({}))]);
    Object.assign(S, { packs, regions, prices, index, settings });
    U.lsSet('hw_cat', { packs, regions, prices, index, settings }); U.lsSet('hw_cat_at', new Date().toISOString());
  } catch (e) {
    if (!cache) { S.regions = HW.SEED.REGIONS || []; S.packs = HW.SEED.PACKS || []; S.index = (HW.SEED.SPECIES || []).map((s) => ({ ...s })); }
    if (e.code === 'db_update_needed') toast(e.message, 8000);
  }
}
async function loadUser() {
  const k = S.me?.id || '';
  S.unlocked = U.lsGet('hw_unlocked_' + k, {});
  S.ents = U.lsGet('hw_ents_' + k, []);
  if (!S.me || S.me.guest) return;
  try {
    const [ents, full] = await Promise.all([api.myEntitlements(), api.unlockedSpecies()]);
    S.ents = ents; S.unlocked = Object.fromEntries(full.map((s) => [s.id, s]));
    U.lsSet('hw_unlocked_' + k, S.unlocked); U.lsSet('hw_ents_' + k, S.ents);
  } catch (e) { console.warn(e); }
}
async function loadChecklist(region = S.region) {
  const key = 'hw_cl_' + region, skey = 'hw_cls_' + region;
  if (region === S.region) { S.checklist = U.lsGet(key, null) || []; S.clStatus = U.lsGet(skey, {}); }
  try {
    const rows = await api.checklistEntries(region);
    const ids = rows.map((r) => r.species_id), st = Object.fromEntries(rows.map((r) => [r.species_id, r.status]));
    U.lsSet(key, ids); U.lsSet(skey, st);
    if (region === S.region) { S.checklist = ids; S.clStatus = st; }
  } catch {}
}
/** my observations + sessions from the server, cached; local unsynced items are merged in on display */
async function loadMine() {
  if (!S.me || S.me.guest) { S.myObs = []; S.mySessions = []; return; }
  const k = S.me.id;
  S.myObs = U.lsGet('hw_myobs_' + k, []); S.mySessions = U.lsGet('hw_myses_' + k, []);
  try {
    const [obs, ses] = await Promise.all([api.myObservations(), api.mySessions()]);
    S.myObs = obs; S.mySessions = ses;
    try { U.lsSet('hw_myobs_' + k, obs.slice(0, 3000)); U.lsSet('hw_myses_' + k, ses.map(({ track, ...x }) => x)); } catch {}
  } catch (e) { if (!HW.isNetError(e)) console.warn(e); }
}

// ── live updates: Admin/Reviewer edits reach the app without a reload ──
let liveTimer = null, liveOff = null;
async function refreshLive() {
  if (!S.me || S.me.guest || !isOnline()) return;
  const before = JSON.stringify([S.checklist, S.clStatus, S.index.length]);
  await loadCatalog(); await loadChecklist(); await loadUser();
  if (JSON.stringify([S.checklist, S.clStatus, S.index.length]) !== before && ['explore', 'checklist'].includes(S.view)) { rerender(); toast(`Checklist for ${regionName(S.region)} updated`); }
}
const scheduleLive = () => { clearTimeout(liveTimer); liveTimer = setTimeout(refreshLive, 800); };
function startLive() { liveOff?.(); liveOff = api.onCatalogChange?.(() => scheduleLive()); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { scheduleLive(); loadMine().then(() => ['home', 'obs'].includes(S.view) && rerender()); } });
setInterval(() => { if (document.visibilityState === 'visible') refreshLive(); }, 3 * 60 * 1000);

// ───────────────────────── GPS ─────────────────────────
const fixOf = (p) => ({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude, t: p.timestamp });
const Geo = {
  wid: null, last: null, subs: new Set(), lock: null, err: '',
  start(fn) {
    if (fn) this.subs.add(fn);
    if (this.wid != null || !navigator.geolocation) return;
    this.wid = navigator.geolocation.watchPosition((p) => { this.err = ''; this.last = fixOf(p); this.subs.forEach((f) => f(this.last)); },
      (e) => { this.err = e.message; this.subs.forEach((f) => f(null)); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    this.wake();
  },
  stop(fn) {
    if (fn) this.subs.delete(fn);
    if (this.subs.size || this.wid == null) return;
    navigator.geolocation.clearWatch(this.wid); this.wid = null; this.lock?.release?.(); this.lock = null;
  },
  async wake() { try { this.lock = await navigator.wakeLock?.request('screen'); } catch {} },
  once(maxAge = 20000) {
    return new Promise((res) => {
      if (this.last && Date.now() - this.last.t < maxAge) return res(this.last);
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => { this.last = fixOf(p); res(this.last); }, () => res(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    });
  },
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Geo.wid != null) Geo.wake(); });
/** where am I: state/district/island from the region list (offline) + place name (online, best effort) */
async function placeOf(f) {
  if (!f) return {};
  const r = U.locateRegions(S.regions, f.lat, f.lng);
  return { state_code: r.state, district_code: r.district, island_code: r.island, region_code: r.state || r.country || null };
}
const elev = (f) => (f?.alt == null ? null : Math.round(f.alt));

// ───────────────────────── local stores ─────────────────────────
const SES = () => U.lsGet('hw_session', null);           // the session being recorded
const saveSES = (s, durable = true) => (durable ? U.durSet('hw_session', s) : U.lsSet('hw_session', s));
const outbox = () => U.lsGet('hw_outbox', []);
const saveOutbox = (o) => U.durSet('hw_outbox', o);
function queue(item) {
  const o = outbox().filter((x) => !(x.kind === item.kind && x.id === item.id));
  // a delete cancels a pending upload of the same record
  const out = item.kind === 'del_obs' ? o.filter((x) => !(x.kind === 'obs' && x.id === item.id)) : item.kind === 'del_session' ? o.filter((x) => !(x.kind === 'session' && x.id === item.id)) : o;
  out.push({ ...item, queued_at: new Date().toISOString() });
  saveOutbox(out); paintSync();
  return syncNow();
}
const pendingObs = () => outbox().flatMap((x) => (x.kind === 'obs' ? [x.observation] : x.kind === 'session' ? x.observations : []));

// ───────────────────────── sync ─────────────────────────
let syncing = false;
async function uploadPhotosOf(obs) {
  for (const p of obs._photos || []) {
    if (p.url) continue;
    const blob = await U.photoStore.get(p.id);
    if (!blob) { p.lost = true; continue; }
    p.storage_path = `${S.me.id}/${obs.id}/${p.id}.jpg`;
    p.url = await api.uploadPhoto(blob, p.storage_path);
  }
  const fresh = (obs._photos || []).filter((p) => p.url);
  obs.photos = [...new Set([...(obs.photos || []), ...fresh.map((p) => p.url)])];
  return fresh.filter((p) => !p.saved).map((p) => ({ id: p.id, sighting_id: obs.id, url: p.url, storage_path: p.storage_path || '', feature: p.feature || '', taken_at: p.taken_at || null,
    width: p.width || null, height: p.height || null, size_bytes: p.size_bytes || null, lat: p.lat ?? null, lng: p.lng ?? null }));
}
async function syncNow() {
  if (syncing || !S.me || S.me.guest) return paintSync();
  syncing = true; paintSync();
  let o = outbox(), changed = false;
  for (const item of [...o]) {
    try {
      if (item.kind === 'session') {
        const photos = [];
        for (const ob of item.observations) photos.push(...(await uploadPhotosOf(ob)));
        o = o.map((x) => (x === item ? item : x)); saveOutbox(o);    // keep uploaded photo URLs if the next step fails
        await api.saveSession({ session: item.session, observations: item.observations, removed: item.removed || [], points: item.points || [], photos });
      } else if (item.kind === 'obs') {
        const photos = await uploadPhotosOf(item.observation);
        saveOutbox(o);
        await api.saveObservation({ observation: item.observation, photos });
      } else if (item.kind === 'del_obs') await api.deleteObservation(item.id);
      else if (item.kind === 'del_session') await api.deleteSession(item.id);
      const done = item.kind === 'session' ? item.observations : item.kind === 'obs' ? [item.observation] : [];
      for (const ob of done) for (const p of ob._photos || []) U.photoStore.del(p.id);
      o = o.filter((x) => x !== item); saveOutbox(o); changed = true;
    } catch (e) {
      console.warn('sync failed', e);
      if (HW.isNetError(e)) break;                                   // offline: retried automatically
      item.error = e.message; saveOutbox(o);
      toast('Could not upload a record: ' + e.message, 6000);
      if (e.code === 'db_update_needed') break;
    }
  }
  syncing = false; paintSync();
  if (changed) { await loadMine(); if (['home', 'obs', 'checklist'].includes(S.view)) rerender(); }
}
const isOnline = () => HW.net.ok && navigator.onLine !== false;
function paintSync() {
  const n = outbox().length, on = isOnline();
  $('syncdot').className = 'dot ' + (!on ? 'off' : n ? 'pending' : '');
  $('synctxt').textContent = S.me?.guest ? `${n} saved · sign in to upload` : syncing ? 'syncing…' : !on ? `offline${n ? ' · ' + n + ' saved' : ''}` : n ? `${n} to sync` : 'synced';
}
addEventListener('online', syncNow); addEventListener('offline', paintSync);
addEventListener('hw-net', (e) => { paintSync(); if (e.detail) syncNow(); });
setInterval(() => { if (outbox().length && document.visibilityState === 'visible') syncNow(); }, 45 * 1000);

// ───────────────────────── navigation ─────────────────────────
const VIEWS = { home: renderHome, record: renderRecord, explore: renderExplore, checklist: renderChecklist, obs: renderObs, profile: renderProfile };
function show(v) {
  if (v !== 'auth' && !VIEWS[v]) v = 'home';
  if (S.view === 'record' && v !== 'record') recLeave();
  S.view = v;
  document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  document.body.classList.toggle('authing', v === 'auth');
  $('region').classList.toggle('hidden', !['explore', 'checklist'].includes(v));
  VIEWS[v]?.();
  if (v !== 'auth') history.replaceState(null, '', '#' + v);
  scrollTo(0, 0);
}
const rerender = () => VIEWS[S.view]?.();
$('tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.v); };
$('region').onchange = async (e) => { S.region = e.target.value; U.lsSet('hw_region', S.region); await loadChecklist(); rerender(); };

// ═════════════════════════ HOME ═════════════════════════
function allMyObs() {
  const server = new Map(S.myObs.map((o) => [o.id, o]));
  for (const p of pendingObs()) server.set(p.id, { ...server.get(p.id), ...p, _pending: true, review_status: server.get(p.id)?.review_status || 'pending' });
  const del = new Set(outbox().filter((x) => x.kind === 'del_obs').map((x) => x.id));
  const ses = SES();
  for (const p of ses?.observations || []) server.set(p.id, { ...p, _pending: true, _live: true, review_status: 'pending' });
  return [...server.values()].filter((o) => !del.has(o.id)).sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)));
}
function allMySessions() {
  const m = new Map(S.mySessions.map((s) => [s.id, s]));
  for (const x of outbox()) if (x.kind === 'session') m.set(x.id, { ...m.get(x.id), ...x.session, _pending: true, _n: x.observations.length });
  const del = new Set(outbox().filter((x) => x.kind === 'del_session').map((x) => x.id));
  return [...m.values()].filter((s) => !del.has(s.id)).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
}
function myStats() {
  const obs = allMyObs().filter((o) => o.review_status !== 'rejected');
  const ses = allMySessions();
  const species = new Set(obs.map((o) => o.species_id).filter(Boolean));
  const mins = ses.reduce((s, x) => s + (+x.duration_min || 0), 0);
  const km = ses.reduce((s, x) => s + (+x.distance_km || 0), 0);
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('en', { month: 'narrow' }), n: 0 }); }
  for (const o of obs) { const m = months.find((x) => x.key === String(o.observed_at).slice(0, 7)); if (m) m.n += +o.count || 1; }
  const byGroup = {};
  for (const o of obs) { const g = byId(o.species_id)?.group || 'other'; byGroup[g] = (byGroup[g] || 0) + 1; }
  const md = new Date().toISOString().slice(5, 10), years = {};
  for (const o of obs) {
    if (!o.species_id) continue;
    const y = String(o.observed_at).slice(0, 4), d = String(o.observed_at).slice(5, 10);
    const Y = (years[y] ||= { ytd: new Set(), all: new Set() });
    Y.all.add(o.species_id); if (d <= md) Y.ytd.add(o.species_id);
  }
  const byYear = Object.entries(years).map(([y, v]) => ({ y, ytd: v.ytd.size, all: v.all.size })).sort((a, b) => b.y.localeCompare(a.y));
  return { byYear, obs: obs.length, individuals: obs.reduce((s, o) => s + (+o.count || 0), 0), species: species.size, sessions: ses.length, hours: mins / 60, km,
    verified: obs.filter((o) => o.review_status === 'verified').length, months, byGroup, roadkill: obs.filter((o) => o.mortality === 'roadkill').length };
}
function renderHome() {
  const ses = SES(), st = myStats(), recent = allMyObs().slice(0, 5);
  const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const max = Math.max(1, ...st.months.map((m) => m.n));
  const pend = outbox().length;
  $('home').innerHTML = `
    <div class="hello"><h1>${greet}${S.me?.full_name ? ', ' + esc(S.me.full_name.split(' ')[0]) : ''}</h1><p>${S.me?.guest ? 'Recording offline. Sign in from Profile to upload.' : 'Ready for the field?'}</p></div>
    ${ses ? `<button class="startbtn live" id="h-resume">${I('timer')}<span class="grow"><b>${ses.status === 'paused' ? 'SESSION PAUSED' : 'SESSION IN PROGRESS'}</b><small>${esc(SURVEY_TYPES[ses.survey_type])} · <span id="h-timer">${hms(elapsed(ses))}</span> · ${ses.observations.length} observation${ses.observations.length === 1 ? '' : 's'}</small></span>${I('chevron-right')}</button>`
      : `<button class="startbtn" id="h-start">${I('play')}<span class="grow"><b>START NEW HERPING SESSION</b><small>Time, GPS track, weather and every observation in one record</small></span>${I('chevron-right')}</button>`}
    <button class="subbtn" id="h-quick">${I('camera')}<span class="grow">Add an observation without a session<br><span class="small muted" style="font-weight:400">Opportunistic sighting, shed skin, road-kill…</span></span>${I('chevron-right')}</button>
    ${pend ? `<div class="note">${I('cloud-upload')}<span>${pend} record${pend > 1 ? 's are' : ' is'} saved on this phone and ${S.me?.guest ? 'will upload after you sign in' : isOnline() ? 'uploading now' : 'will upload when you are back online'}.</span></div>` : ''}
    <div class="tiles">
      <div class="tile"><b>${st.species}</b><span>Species (life list)</span></div>
      <div class="tile"><b>${st.obs}</b><span>Observations</span></div>
      <div class="tile"><b>${st.sessions}</b><span>Sessions</span></div>
      <div class="tile"><b>${st.hours.toFixed(1)}</b><span>Hours in the field</span></div>
      <div class="tile"><b>${dist(st.km).split(' ')[0]}</b><span>${miles() ? 'miles' : 'km'} surveyed</span></div>
      <div class="tile"><b>${st.verified}</b><span>Verified records</span></div>
    </div>
    <div class="card pad"><div class="row" style="justify-content:space-between"><b class="small">Observations · last 12 months</b><span class="tiny muted">${st.individuals} individuals</span></div>
      <div class="bars">${st.months.map((m) => `<div title="${m.key}: ${m.n}"><i style="height:${Math.round((m.n / max) * 70)}px"></i><small>${m.label}</small></div>`).join('')}</div>
      ${Object.keys(st.byGroup).length ? `<div class="legend" style="margin-top:8px">${Object.entries(st.byGroup).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<span>${esc(GROUPS[g] || 'Other')} <b>${n}</b></span>`).join('')}</div>` : ''}</div>
    ${st.byYear.length ? `<div class="sect"><h3>Your species by year</h3><span class="tiny muted">to ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · whole year</span></div>
    <div class="card pad yearbars">${(() => { const mx = Math.max(1, ...st.byYear.map((y) => y.all)); const cur = String(new Date().getFullYear()); return st.byYear.slice(0, 6).map((y) => `<div class="yb ${y.y === cur ? 'cur' : ''}"><b>${y.y}</b><span class="n">${y.ytd}</span>
      <span class="track"><i class="full" style="width:${(y.all / mx) * 100}%"></i><i style="width:${(y.ytd / mx) * 100}%"></i></span><span class="t">${y.y === cur ? '' : y.all}</span></div>`).join(''); })()}</div>` : ''}
    <div class="sect"><h3>Recent observations</h3><button class="linkbtn" data-go="obs">See all</button></div>
    <div class="card">${recent.length ? recent.map(obsRow).join('') : `<div class="empty small">No observations yet. Start a session or add an observation.</div>`}</div>`;
  $('h-start') && ($('h-start').onclick = () => show('record'));
  $('h-resume') && ($('h-resume').onclick = () => show('record'));
  $('h-quick').onclick = () => openObservation({ standalone: true });
  $('home').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
  $('home').querySelectorAll('[data-obs]').forEach((b) => (b.onclick = () => openObsDetail(b.dataset.obs)));
  if (ses) { clearInterval(homeTick); homeTick = setInterval(() => { if (S.view !== 'home' || !$('h-timer')) return clearInterval(homeTick); $('h-timer').textContent = hms(elapsed(SES() || ses)); }, 1000); }
}
let homeTick = null;
function obsRow(o) {
  const ph = (o.photo_rows?.[0]?.url) || (o.photos || [])[0];
  const where = o.location_name || regionName(o.island_code || o.district_code || o.state_code || o.region_code);
  return `<button class="obsrow" data-obs="${esc(o.id)}"><span class="th">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : I(o.evidence && o.evidence !== 'direct' ? 'footprints' : 'binoculars')}</span>
    <span class="grow"><span class="t">${esc(spName(o))}${o.count > 1 ? ` <span class="muted">×${o.count}</span>` : ''}</span><br><span class="s">${fmtDT(o.observed_at)}${where ? ' · ' + esc(where) : ''}</span></span>
    ${o._pending ? `<span class="badge">${I('cloud-upload')} ${o._live ? 'In session' : 'Not uploaded'}</span>` : statusBadge(o.review_status)}</button>`;
}

// ═════════════════════════ RECORD — herping session ═════════════════════════
const TYPE_ICON = { day: 'sun', night: 'moon', road: 'car', transect: 'ruler', habitat: 'trees', opportunistic: 'binoculars', creek_mangrove: 'waves', stream_wetland: 'droplets' };
const WEATHER = ['Clear', 'Partly cloudy', 'Overcast', 'Drizzle', 'Light rain', 'Heavy rain', 'After rain', 'Fog / mist', 'Windy', 'Hot & dry'];
let recTick = null, recMap = null, startOffset = 0;
function elapsed(s) {
  const end = s.status === 'paused' ? new Date(s.paused_at) : new Date();
  return end - new Date(s.started_at) - (s.paused_ms || 0);
}
function onSessionFix(f) {
  const s = SES(); if (!s) return;
  if (f && s.status === 'active' && s.track_on !== false && f.acc <= 60) {
    const p = [+f.lat.toFixed(6), +f.lng.toFixed(6)], prev = s.track[s.track.length - 1];
    const d = prev ? U.haversineKm(prev, p) * 1000 : 1e9;
    if (!prev || (d >= 8 && d <= 3000)) {
      s.track.push(p);
      s.points.push({ t: new Date(f.t).toISOString(), lat: p[0], lng: p[1], accuracy_m: Math.round(f.acc), elevation_m: elev(f) });
      saveSES(s, s.points.length % 10 === 0);
    }
  }
  paintLive(s, f);
}
function recLeave() { clearInterval(recTick); if (recMap) { recMap.m.remove(); recMap = null; } }
function renderRecord() {
  recLeave();
  const s = SES();
  if (!s) return renderRecordStart();
  Geo.start(onSessionFix);
  const el = $('rec');
  el.innerHTML = `
    <div class="live-card">
      <div class="row" style="justify-content:space-between"><span class="badge ${s.status === 'active' ? 'rec' : 'warn'}">${s.status === 'active' ? 'Recording' : 'Paused'}</span><span class="small muted">${I(TYPE_ICON[s.survey_type])} ${esc(SURVEY_TYPES[s.survey_type])}</span></div>
      <div class="timer" id="r-timer" style="margin-top:10px">${hms(elapsed(s))}</div>
      <div class="small muted" style="margin-top:4px">${esc(s.title || '')}${s.title ? ' · ' : ''}Started ${fmtTime(s.started_at)}${s.location_name ? ' · ' + esc(s.location_name) : ''}${s.island_code || s.district_code || s.state_code ? ' · ' + esc(regionName(s.island_code || s.district_code || s.state_code)) : ''}</div>
      <div class="livestat"><div><b id="r-km">0.00</b><span>${s.track_on === false ? 'track off' : miles() ? 'miles' : 'km'}</span></div><div><b>${s.observations.length}</b><span>observations</span></div><div><b id="r-acc">–</b><span>GPS accuracy</span></div></div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn btn-primary grow" id="r-add" style="min-height:52px">${I('plus')} Add observation</button>
      </div>
      <div class="row" style="margin-top:8px;gap:8px">
        ${s.status === 'active' ? `<button class="btn btn-ghost grow" id="r-pause">${I('pause')} Pause</button>` : `<button class="btn btn-ghost grow" id="r-resume">${I('play')} Resume</button>`}
        <button class="btn btn-red grow" id="r-stop">${I('square')} Stop & save</button>
      </div>
    </div>
    <div id="recmap"></div>
    <div class="legend"><span><i style="background:#2f7d4f"></i>Route</span><span><i style="background:#c53030"></i>Observation</span><span><i style="background:#2b6cb0"></i>You</span></div>
    <div class="sect"><h3>Observations in this session</h3><span class="small muted">${s.observations.length}</span></div>
    <div class="card">${s.observations.length ? s.observations.slice().reverse().map((o) => obsRow({ ...o, _pending: true, _live: true })).join('') : '<div class="empty small">Nothing recorded yet. Tap “Add observation” whenever you find an animal or a sign (shed skin, eggs, tracks, calls).</div>'}</div>
    <p class="tiny muted" style="margin-top:10px">${I('shield-check')} The session is saved on this phone after every change, so a closed app or a flat battery won’t lose it. Keep the screen on for the best GPS track.</p>`;
  $('r-add').onclick = () => openObservation({ session: true });
  $('r-pause') && ($('r-pause').onclick = () => { const x = SES(); x.status = 'paused'; x.paused_at = new Date().toISOString(); saveSES(x); renderRecord(); toast('Paused: time and track stop until you resume'); });
  $('r-resume') && ($('r-resume').onclick = () => { const x = SES(); x.paused_ms = (x.paused_ms || 0) + (Date.now() - new Date(x.paused_at)); x.status = 'active'; x.paused_at = null; saveSES(x); renderRecord(); });
  $('r-stop').onclick = finishSession;
  el.querySelectorAll('[data-obs]').forEach((b) => (b.onclick = () => { const o = SES().observations.find((x) => x.id === b.dataset.obs); if (o) openObservation({ session: true, edit: o }); }));
  recMap = drawMap('recmap', s.track, s.observations.filter((o) => o.lat != null).map((o) => ({ lat: o.lat, lng: o.lng, label: spName(o) })), { me: Geo.last });
  paintLive(s, Geo.last);
  recTick = setInterval(() => { const x = SES(); if (x && $('r-timer')) $('r-timer').textContent = hms(elapsed(x)); }, 1000);
}
function paintLive(s, f) {
  if (S.view !== 'record' || !$('r-km')) return;
  $('r-km').textContent = dist(U.trackKm(s.track)).split(' ')[0];
  $('r-acc').textContent = f ? `±${Math.round(f.acc)} m` : Geo.err ? 'no GPS' : '…';
  if (recMap?.m && f) {
    recMap.line.setLatLngs(s.track);
    recMap.me ? recMap.me.setLatLng([f.lat, f.lng]) : (recMap.me = L.circleMarker([f.lat, f.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2b6cb0', fillOpacity: 1 }).addTo(recMap.m));
    if (!recMap.panned) recMap.m.setView([f.lat, f.lng], Math.max(recMap.m.getZoom() || 15, 15));
  }
}
function renderRecordStart() {
  const el = $('rec');
  let type = U.lsGet('hw_last_type', 'night');
  startOffset = 0;
  const draw = () => {
    el.innerHTML = `
      <div class="hello"><h1>New herping session</h1><p>Choose the survey type. Date, time, GPS position, place, elevation and accuracy are captured automatically.</p></div>
      <div class="startclock card"><div><span>Date</span><b id="s-date"></b></div><div><span>Start time</span><b id="s-time"></b>
        <div class="row" style="gap:8px;justify-content:center;margin-top:6px"><button class="round" id="s-earlier" aria-label="5 minutes earlier">−</button><button class="round" id="s-later" aria-label="5 minutes later">+</button></div></div></div>
      <label class="switchrow card"><span class="grow"><b>Record GPS track</b><br><span class="tiny muted">Route and distance for effort (turn off for a stationary search)</span></span><input type="checkbox" id="s-track" class="switch" ${U.lsGet('hw_track_on', true) ? 'checked' : ''}></label>
      <div class="types">${Object.entries(SURVEY_TYPES).map(([k, l]) => `<button class="type ${k === type ? 'on' : ''}" data-t="${k}">${I(TYPE_ICON[k])}${esc(l)}</button>`).join('')}</div>
      <div class="fld"><label for="s-title">Session name (optional)</label><input id="s-title" maxlength="120" placeholder="e.g. Chidiyatapu night walk"></div>
      <div class="grid2"><div class="fld"><label for="s-obs">Observers</label><input id="s-obs" type="number" min="1" max="99" value="1"></div>
        <div class="fld"><label for="s-weather">Weather</label><select id="s-weather"><option value="">—</option>${WEATHER.map((w) => `<option>${w}</option>`).join('')}</select></div></div>
      <div class="loc" id="s-loc" style="margin-top:12px">${I('locate-fixed')}<span>Finding your position…</span></div>
      <button class="startbtn" id="s-go" style="margin-top:14px">${I('play')}<span class="grow"><b>START SESSION</b><small>GPS tracking starts now</small></span></button>
      <p class="tiny muted" style="margin-top:10px">Never handle animals to record them. A photo from a safe distance is enough; venomous snakes are common at night.</p>`;
    el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { type = b.dataset.t; U.lsSet('hw_last_type', type); el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); }));
    $('s-go').onclick = () => startSession(type);
    const paintClock = () => { const t = new Date(Date.now() + startOffset * 60000); $('s-date').textContent = t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); $('s-time').textContent = fmtTime(t); };
    paintClock(); clearInterval(recTick); recTick = setInterval(() => { if ($('s-time')) paintClock(); }, 15000);
    $('s-earlier').onclick = () => { startOffset -= 5; paintClock(); };
    $('s-later').onclick = () => { if (startOffset < 0) startOffset += 5; paintClock(); };
    $('s-track').onchange = (e) => U.lsSet('hw_track_on', e.target.checked);
    Geo.once().then(async (f) => {
      if (!$('s-loc')) return;
      if (!f) { $('s-loc').innerHTML = `${I('triangle-alert')}<span>No GPS fix yet. You can still start; the position is added as soon as GPS works. Allow location access for this site.</span>`; return; }
      const r = await placeOf(f);
      $('s-loc').innerHTML = `${I('map-pin')}<span><b>${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}</b> ±${Math.round(f.acc)} m${elev(f) != null ? ` · ${elev(f)} m elevation` : ''}<br>${esc([regionName(r.island_code), regionName(r.district_code), regionName(r.state_code)].filter(Boolean).join(' · ') || 'Region unknown')}</span>`;
    });
  };
  draw();
}
async function startSession(type) {
  if (SES()) return renderRecord();
  const f = Geo.last && Date.now() - Geo.last.t < 60000 ? Geo.last : await Promise.race([Geo.once(), new Promise((r) => setTimeout(() => r(null), 4000))]);
  const r = await placeOf(f);
  const s = {
    id: U.uid(), survey_type: type, title: $('s-title')?.value.trim() || '', observers: Math.max(1, +$('s-obs')?.value || 1), weather: $('s-weather')?.value || '',
    status: 'active', started_at: new Date(Date.now() + startOffset * 60000).toISOString(), paused_ms: 0, paused_at: null, track_on: $('s-track') ? $('s-track').checked : true,
    lat: f?.lat ?? null, lng: f?.lng ?? null, start_accuracy_m: f ? Math.round(f.acc) : null, start_elevation_m: elev(f), location_name: '', ...r,
    track: [], points: [], observations: [], removed: [],
  };
  if (f && s.track_on && f.acc <= 100) { s.track.push([+f.lat.toFixed(6), +f.lng.toFixed(6)]); s.points.push({ t: new Date(f.t).toISOString(), lat: f.lat, lng: f.lng, accuracy_m: Math.round(f.acc), elevation_m: elev(f) }); }
  saveSES(s);
  toast('Session started. Good herping!');
  renderRecord();
  if (f) U.placeName(f.lat, f.lng).then((n) => { const x = SES(); if (n && x && x.id === s.id && !x.location_name) { x.location_name = n; saveSES(x); if (S.view === 'record') renderRecord(); } });
}
function sessionPayload(s, status) {
  const end = s.ended_at || new Date().toISOString();
  const last = s.track[s.track.length - 1];
  return {
    session: {
      id: s.id, survey_type: s.survey_type, title: s.title, status, started_at: s.started_at, ended_at: status === 'completed' ? end : null,
      duration_min: Math.round(elapsed({ ...s, status: 'active', paused_at: null }) / 60000), paused_min: Math.round((s.paused_ms || 0) / 60000),
      distance_km: +U.trackKm(s.track).toFixed(2), observers: s.observers, complete: !!s.complete, track: s.track, lat: s.lat, lng: s.lng,
      start_accuracy_m: s.start_accuracy_m, start_elevation_m: s.start_elevation_m, end_lat: last?.[0] ?? null, end_lng: last?.[1] ?? null,
      location_name: s.location_name || '', region_code: s.region_code || s.state_code || null, state_code: s.state_code, district_code: s.district_code, island_code: s.island_code,
      weather: s.weather || '', notes: s.notes || '',
    },
    observations: s.observations, removed: s.removed || [], points: s.points,
  };
}
function finishSession() {
  const s = SES(); if (!s) return;
  if (s.status === 'paused') { s.paused_ms = (s.paused_ms || 0) + (Date.now() - new Date(s.paused_at)); s.status = 'active'; s.paused_at = null; }
  s.ended_at = new Date().toISOString(); saveSES(s);
  const dur = elapsed({ ...s, status: 'paused', paused_at: s.ended_at });
  openSheet(`<h2>Finish session</h2>
    <div class="kvgrid"><dt>Survey</dt><dd>${esc(SURVEY_TYPES[s.survey_type])}</dd><dt>Duration</dt><dd>${hms(dur)} (pauses excluded)</dd><dt>Distance</dt><dd>${U.trackKm(s.track).toFixed(2)} km · ${s.points.length} GPS points</dd><dt>Observations</dt><dd>${s.observations.length}</dd></div>
    <div class="fld"><label for="f-weather">Weather</label><select id="f-weather"><option value="">—</option>${WEATHER.map((w) => `<option ${w === s.weather ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
    <div class="fld"><label for="f-notes">Session notes</label><textarea id="f-notes" rows="3" placeholder="Conditions, route, people, anything useful">${esc(s.notes || '')}</textarea></div>
    <label class="row" style="margin-top:12px;gap:10px"><input type="checkbox" id="f-complete" style="width:20px;min-height:20px" ${s.complete ? 'checked' : ''}> <span class="small">I recorded <b>every</b> species I could identify (complete list)</span></label>
    <button class="btn btn-primary btn-block" id="f-save" style="margin-top:16px;min-height:50px">${I('check')} Save session</button>
    <div class="row" style="margin-top:8px;gap:8px"><button class="btn btn-ghost grow" id="f-cont">Keep recording</button><button class="btn btn-ghost grow" id="f-discard" style="color:var(--red)">${I('trash-2')} Discard</button></div>`,
  () => { const x = SES(); if (x && x.ended_at && !x._saving) { x.ended_at = null; saveSES(x); } });
  $('f-cont').onclick = () => { const x = SES(); x.ended_at = null; saveSES(x); closeSheet(); };
  $('f-discard').onclick = () => {
    if (!confirm(`Discard this session and its ${s.observations.length} observation(s)? This cannot be undone.`)) return;
    for (const o of s.observations) for (const p of o._photos || []) U.photoStore.del(p.id);
    U.durSet('hw_session', null); Geo.stop(onSessionFix); closeSheet(); toast('Session discarded'); renderRecord();
  };
  $('f-save').onclick = async () => {
    const x = SES(); x._saving = true; x.weather = $('f-weather').value; x.notes = $('f-notes').value.trim(); x.complete = $('f-complete').checked;
    const p = sessionPayload(x, 'completed');
    Geo.stop(onSessionFix);
    U.durSet('hw_session', null);
    closeSheet();
    await queue({ kind: 'session', id: x.id, ...p });
    toast(S.me?.guest ? 'Session saved on this phone. Sign in to upload it.' : isOnline() ? 'Session saved and uploading' : 'Session saved. It uploads when you are back online.', 4000);
    show('obs'); obsTab = 'sessions'; renderObs();
  };
}

// ═════════════════════════ OBSERVATION FORM ═════════════════════════
const ACTIVITY = ['Active', 'Inactive', 'Sheltering', 'Unknown'];
const MORTALITY = { '': 'Alive', roadkill: 'Road-kill', predation: 'Killed by predator', other: 'Dead (other cause)' };
const ORIGIN = { wild: 'Wild', captive: 'Captive', released: 'Released / rescued', unknown: 'Not sure' };
const CONF = { certain: 'Certain', probable: 'Probable', possible: 'Possible' };
const PRIVACY = { public: 'Public', restricted: 'Restricted (exact place hidden)', private: 'Private (only me & reviewers)' };
const FEATURES = { '': 'Photo', dorsal: 'Dorsal', ventral: 'Ventral', head: 'Head', lateral: 'Side', habitat: 'Habitat', other: 'Other' };
const blobUrls = new Map();
async function photoSrc(p) {
  if (p.url) return p.url;
  if (blobUrls.has(p.id)) return blobUrls.get(p.id);
  const b = await U.photoStore.get(p.id); if (!b) return '';
  const u = URL.createObjectURL(b); blobUrls.set(p.id, u); return u;
}
/** opts: { session: true } adds to the running session; { standalone: true }; { edit: obs } edits */
async function openObservation(opts = {}) {
  const ses = opts.session ? SES() : null;
  const base = opts.edit ? JSON.parse(JSON.stringify(opts.edit)) : null;
  const defPrivacy = (typeof S.settings.default_privacy === 'string' ? S.settings.default_privacy : '') || 'public';
  const o = base || {
    id: U.uid(), trip_id: ses?.id || null, species_id: opts.species || null, species_text: '', count: 1, observed_at: new Date().toISOString(),
    lat: null, lng: null, accuracy_m: null, elevation_m: null, location_name: '', id_confidence: 'certain', evidence: 'direct', mortality: '', origin: 'wild',
    sex: '', life_stage: '', habitat: '', microhabitat: '', behaviour: '', activity: '', weather: ses?.weather || '', temperature_c: null, notes: '',
    privacy: U.lsGet('hw_privacy', defPrivacy), photos: [], _photos: [],
  };
  o._photos = o._photos || [];
  const existingPhotos = (base?.photo_rows || []).map((p) => ({ ...p, saved: true }));
  const isNew = !base;
  const locked = base && base.review_status === 'verified';
  // position: taken at the moment the form opens (each observation keeps its own time + GPS)
  if (isNew) {
    const f = Geo.last && Date.now() - Geo.last.t < 15000 ? Geo.last : await Promise.race([Geo.once(15000), new Promise((r) => setTimeout(() => r(null), 3500))]);
    if (f) Object.assign(o, { lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), accuracy_m: Math.round(f.acc), elevation_m: elev(f) }, await placeOf(f));
    else if (ses) Object.assign(o, { state_code: ses.state_code, district_code: ses.district_code, island_code: ses.island_code, region_code: ses.region_code, location_name: ses.location_name });
    if (ses?.location_name && !o.location_name) o.location_name = ses.location_name;
  }
  const sp = () => (o.species_id ? byId(o.species_id) : null);
  const seg = (name, map, val) => `<div class="seg" data-seg="${name}">${Object.entries(map).map(([k, l]) => `<button type="button" data-k="${esc(k)}" class="${k === (val ?? '') ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const sel = (id, list, val, blank = '—') => `<select id="${id}"><option value="">${blank}</option>${list.map((x) => `<option value="${esc(x.toLowerCase())}" ${String(val).toLowerCase() === x.toLowerCase() ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  const speciesBlock = () => {
    const s = sp();
    return s ? `<div class="chosen"><span class="grow"><b>${esc(s.common)}</b> <i class="muted">(${esc(s.sci)})</i><br><span class="tiny muted">${esc([GROUPS[s.group], s.order, s.family, s.genus].filter(Boolean).join(' · '))}</span>
        ${s.venom === 'venomous' ? `<br><span class="pill venom" style="margin-top:4px">${I('triangle-alert')} Venomous: do not handle</span>` : ''}</span><button type="button" class="btn btn-ghost btn-sm" id="o-chg">Change</button></div>`
      : `<div class="typeahead"><input id="o-sp" placeholder="Type a common or scientific name…" autocomplete="off" value="${esc(o.species_text || '')}"><div class="ta-list hidden" id="o-ta"></div></div>
         <p class="tiny muted" style="margin-top:4px">Not sure? Type what you think it is (e.g. “Lycodon sp.” or “unknown frog”) and add photos. A reviewer can help identify it.</p>`;
  };
  openSheet(`<h2>${isNew ? 'New observation' : 'Edit observation'}</h2>
    <p class="small muted">${ses ? `Part of your ${esc(SURVEY_TYPES[ses.survey_type].toLowerCase())}` : o.trip_id ? 'Part of a session' : 'Standalone observation (no session)'}</p>
    ${locked ? `<div class="note">${I('badge-check')}<span>This record is <b>verified</b>. Changing the species, count, place or time sends it back for review.</span></div>` : ''}
    <div class="fld"><label>Species</label><div id="o-spbox">${speciesBlock()}</div></div>
    <div class="fld"><label>How sure are you?</label>${seg('id_confidence', CONF, o.id_confidence)}</div>
    <div class="fld"><label>What did you find?</label>${seg('evidence', EVIDENCE, o.evidence)}</div>
    <div class="grid2"><div class="fld"><label for="o-count">Count</label><div class="cnt"><button type="button" id="o-minus">−</button><input id="o-count" type="number" min="0" value="${+o.count || 1}" style="text-align:center;font-family:var(--mono)"><button type="button" class="plus" id="o-plus">+</button></div></div>
      <div class="fld"><label for="o-time">Date & time</label><input id="o-time" type="datetime-local" value="${toLocalInput(o.observed_at)}"></div></div>
    <div class="grid2"><div class="fld"><label for="o-stage">Life stage</label>${sel('o-stage', ['Egg', 'Hatchling', 'Tadpole', 'Juvenile', 'Subadult', 'Adult', 'Unknown'], o.life_stage)}</div>
      <div class="fld"><label for="o-sex">Sex</label>${sel('o-sex', SEXES, o.sex)}</div></div>
    <div class="fld"><label>Condition</label>${seg('mortality', MORTALITY, o.mortality)}</div>
    <div class="fld"><label>Wild or captive?</label>${seg('origin', ORIGIN, o.origin)}</div>
    <div class="fld"><label>Photos</label><div class="photos" id="o-photos"></div><p class="tiny muted" style="margin-top:4px">Shrunk to ≤1600 px. Stored on this phone until uploaded. Label the view (dorsal, head…) to help reviewers.</p></div>
    <div class="fld"><label>Location</label><div class="loc" id="o-loc"></div>
      <details class="more"><summary>Edit position manually</summary><div class="grid2" style="margin-top:6px"><input id="o-lat" inputmode="decimal" placeholder="Latitude" value="${o.lat ?? ''}"><input id="o-lng" inputmode="decimal" placeholder="Longitude" value="${o.lng ?? ''}"></div>
        <input id="o-place" style="margin-top:6px" placeholder="Place name" value="${esc(o.location_name || '')}"><button type="button" class="btn btn-ghost btn-sm" id="o-regps" style="margin-top:6px">${I('crosshair')} Use current GPS position</button></details></div>
    <div class="grid2"><div class="fld"><label for="o-hab">Habitat</label>${sel('o-hab', HABITATS, o.habitat)}</div><div class="fld"><label for="o-micro">Microhabitat</label>${sel('o-micro', MICROHABITATS, o.microhabitat)}</div></div>
    <div class="grid2"><div class="fld"><label for="o-beh">Behaviour</label>${sel('o-beh', BEHAVIOURS, o.behaviour)}</div><div class="fld"><label for="o-act">Activity</label>${sel('o-act', ACTIVITY, o.activity)}</div></div>
    <div class="grid2"><div class="fld"><label for="o-wx">Weather</label>${sel('o-wx', WEATHER, o.weather)}</div><div class="fld"><label for="o-temp">Temperature °C</label><input id="o-temp" type="number" step="0.1" min="-20" max="60" value="${o.temperature_c ?? ''}"></div></div>
    <div class="fld"><label for="o-notes">Notes</label><textarea id="o-notes" rows="3" maxlength="4000" placeholder="Size, marks, what it was doing, substrate…">${esc(o.notes || '')}</textarea></div>
    <div class="fld"><label>Who can see the exact location?</label>${seg('privacy', PRIVACY, o.privacy)}<p class="tiny muted" style="margin-top:4px" id="o-privnote"></p></div>
    <div class="note">${I('shield')}<span>Never handle an animal to record it. Photos from a safe distance are enough for identification.</span></div>
    <button class="btn btn-primary btn-block" id="o-save" style="margin-top:14px;min-height:52px">${I('check')} ${isNew ? 'Save observation' : 'Save changes'}</button>
    ${!isNew && !locked ? `<button class="btn btn-ghost btn-block" id="o-del" style="margin-top:8px;color:var(--red)">${I('trash-2')} Delete observation</button>` : ''}`,
  () => { for (const u of blobUrls.values()) URL.revokeObjectURL(u); blobUrls.clear(); });

  const body = $('sheetbody');
  body.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    o[g.dataset.seg] = b.dataset.k; g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (g.dataset.seg === 'privacy') U.lsSet('hw_privacy', b.dataset.k);
    if (g.dataset.seg === 'mortality' && b.dataset.k && !o.behaviour) { o.behaviour = 'dead'; $('o-beh').value = 'dead'; }
    privNote();
  }));
  const privNote = () => { const s = sp(); $('o-privnote').textContent = s?.sensitive ? 'This species is sensitive: its public location is always blurred, whatever you choose.' : o.privacy === 'public' ? 'Shown on the public map once it is not rejected.' : o.privacy === 'restricted' ? 'Counts in public statistics; only reviewers see the exact point.' : 'Only you and reviewers see it.'; };
  privNote();
  const bindSpecies = () => {
    $('o-chg') && ($('o-chg').onclick = () => { o.species_id = null; $('o-spbox').innerHTML = speciesBlock(); bindSpecies(); $('o-sp').focus(); });
    const inp = $('o-sp'); if (!inp) return;
    const ta = $('o-ta'), here = new Set(S.checklist);
    inp.oninput = () => {
      o.species_text = inp.value.trim();
      const q = inp.value.trim().toLowerCase();
      if (q.length < 2) { ta.classList.add('hidden'); return; }
      const hits = S.index.filter((s) => s.common.toLowerCase().includes(q) || s.sci.toLowerCase().includes(q) || (s.family || '').toLowerCase().includes(q) || (s.genus || '').toLowerCase().startsWith(q))
        .sort((a, b) => (here.has(b.id) - here.has(a.id)) || a.common.localeCompare(b.common)).slice(0, 12);
      ta.innerHTML = hits.map((s) => `<button type="button" data-sid="${esc(s.id)}"><b>${esc(s.common)}</b> <i class="muted">${esc(s.sci)}</i><br><span class="tiny muted">${esc(s.family)}${here.has(s.id) ? ' · on this region’s checklist' : ''}</span></button>`).join('')
        + `<button type="button" data-sid=""><b>Keep “${esc(inp.value.trim())}”</b><br><span class="tiny muted">Unidentified / not in the list. A reviewer can identify it.</span></button>`;
      ta.classList.remove('hidden');
    };
    ta.onclick = (e) => {
      const b = e.target.closest('[data-sid]'); if (!b) return;
      if (b.dataset.sid) { o.species_id = b.dataset.sid; o.species_text = ''; if (byId(o.species_id)?.sensitive && o.privacy === 'public') { o.privacy = 'restricted'; body.querySelector('[data-seg=privacy]').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.k === 'restricted')); } }
      else { o.id_confidence = o.id_confidence === 'certain' ? 'possible' : o.id_confidence; body.querySelector('[data-seg=id_confidence]').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.k === o.id_confidence)); }
      $('o-spbox').innerHTML = speciesBlock(); bindSpecies(); privNote();
    };
  };
  bindSpecies();
  $('o-minus').onclick = () => { $('o-count').value = Math.max(0, (+$('o-count').value || 0) - 1); };
  $('o-plus').onclick = () => { $('o-count').value = (+$('o-count').value || 0) + 1; };
  const paintLoc = () => {
    $('o-loc').innerHTML = o.lat != null
      ? `${I('map-pin')}<span><b>${(+o.lat).toFixed(5)}, ${(+o.lng).toFixed(5)}</b>${o.accuracy_m != null ? ` ±${o.accuracy_m} m` : ''}${o.elevation_m != null ? ` · ${o.elevation_m} m elev.` : ''}<br>${esc([o.location_name, regionName(o.island_code), regionName(o.district_code), regionName(o.state_code)].filter(Boolean).join(' · ') || '')}</span>`
      : `${I('triangle-alert')}<span>No GPS position. Enable location, or enter it manually below.</span>`;
  };
  paintLoc();
  if (isNew && o.lat != null && !o.location_name) U.placeName(o.lat, o.lng).then((n) => { if (n && !o.location_name && $('o-loc')) { o.location_name = n; $('o-place').value = n; paintLoc(); } });
  $('o-regps').onclick = async () => {
    const f = await Geo.once(0); if (!f) return toast('No GPS fix');
    Object.assign(o, { lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), accuracy_m: Math.round(f.acc), elevation_m: elev(f) }, await placeOf(f));
    $('o-lat').value = o.lat; $('o-lng').value = o.lng; paintLoc();
  };
  const manualPos = () => {
    const la = parseFloat($('o-lat').value), ln = parseFloat($('o-lng').value);
    if (Number.isFinite(la) && Number.isFinite(ln) && (la !== o.lat || ln !== o.lng)) { Object.assign(o, { lat: la, lng: ln, accuracy_m: null, elevation_m: null }); placeOf({ lat: la, lng: ln }).then((r) => { Object.assign(o, r); paintLoc(); }); }
  };
  $('o-lat').onchange = manualPos; $('o-lng').onchange = manualPos;
  $('o-place').oninput = () => { o.location_name = $('o-place').value.trim(); };
  // photos
  const paintPhotos = async () => {
    const all = [...existingPhotos, ...o._photos.filter((p) => !existingPhotos.some((e) => e.id === p.id))];
    const parts = await Promise.all(all.map(async (p) => `<div class="ph"><img src="${esc(await photoSrc(p))}" alt="">${p.saved ? '' : `<button type="button" class="rm" data-rm="${p.id}" aria-label="Remove photo">×</button>`}
      <select data-feat="${p.id}" ${p.saved ? 'disabled' : ''}>${Object.entries(FEATURES).map(([k, l]) => `<option value="${k}" ${k === (p.feature || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`));
    $('o-photos').innerHTML = parts.join('') + `<label class="add" for="photo-in" title="Add photos">${I('camera')}</label>`;
  };
  paintPhotos();
  $('o-photos').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { o._photos = o._photos.filter((p) => p.id !== b.dataset.rm); U.photoStore.del(b.dataset.rm); paintPhotos(); } };
  $('o-photos').onchange = (e) => { const s = e.target.closest('[data-feat]'); if (s) { const p = o._photos.find((x) => x.id === s.dataset.feat); if (p) p.feature = s.value; } };
  $('photo-in').value = '';
  $('photo-in').onchange = async (e) => {
    for (const file of [...e.target.files].slice(0, 10)) {
      try {
        const r = await U.processPhoto(file), id = U.uid();
        await U.photoStore.put(id, r.blob);
        o._photos.push({ id, feature: '', taken_at: r.taken_at, width: r.width, height: r.height, size_bytes: r.size_bytes, lat: o.lat, lng: o.lng });
      } catch (er) { toast('Photo: ' + er.message); }
    }
    e.target.value = ''; paintPhotos();
  };
  // save
  $('o-save').onclick = async () => {
    manualPos();
    const typed = $('o-sp')?.value.trim() || '';
    if (!o.species_id) o.species_text = typed;
    if (!o.species_id && !o.species_text) { toast('Choose a species, or type what you think it is'); return $('o-sp')?.focus(); }
    const t = $('o-time').value ? new Date($('o-time').value) : new Date(o.observed_at);
    if (t > new Date(Date.now() + 5 * 60000)) return toast('The time is in the future');
    Object.assign(o, {
      count: Math.max(0, parseInt($('o-count').value, 10) || 0), observed_at: t.toISOString(), life_stage: $('o-stage').value, sex: $('o-sex').value,
      habitat: $('o-hab').value, microhabitat: $('o-micro').value, behaviour: $('o-beh').value, activity: $('o-act').value, weather: $('o-wx').value,
      temperature_c: $('o-temp').value === '' ? null : +$('o-temp').value, notes: $('o-notes').value.trim(), location_name: $('o-place').value.trim() || o.location_name,
    });
    if (!o.region_code) o.region_code = o.state_code || null;
    const clean = cleanObs(o);
    if (ses) {
      const x = SES(); if (!x) { closeSheet(); return toast('The session has ended'); }
      const i = x.observations.findIndex((y) => y.id === clean.id);
      i >= 0 ? (x.observations[i] = clean) : x.observations.push(clean);
      saveSES(x); closeSheet(); toast('Added to the session'); if (S.view === 'record') renderRecord();
    } else {
      closeSheet();
      await queue({ kind: 'obs', id: clean.id, observation: clean });
      toast(isNew ? 'Observation saved' : 'Changes saved'); rerender();
    }
  };
  $('o-del') && ($('o-del').onclick = async () => {
    if (!confirm('Delete this observation?')) return;
    for (const p of o._photos) U.photoStore.del(p.id);
    if (ses) { const x = SES(); x.observations = x.observations.filter((y) => y.id !== o.id); saveSES(x); closeSheet(); renderRecord(); return; }
    closeSheet();
    const pendingOnly = outbox().some((x) => x.kind === 'obs' && x.id === o.id) && !S.myObs.some((y) => y.id === o.id);
    if (pendingOnly) { saveOutbox(outbox().filter((x) => !(x.kind === 'obs' && x.id === o.id))); paintSync(); }
    else await queue({ kind: 'del_obs', id: o.id });
    toast('Observation deleted'); rerender();
  });
}
const OBS_KEYS = ['id', 'trip_id', 'species_id', 'species_text', 'count', 'lat', 'lng', 'accuracy_m', 'elevation_m', 'observed_at', 'region_code', 'state_code', 'district_code', 'island_code',
  'location_name', 'life_stage', 'sex', 'notes', 'photos', 'id_confidence', 'evidence', 'mortality', 'origin', 'habitat', 'microhabitat', 'behaviour', 'activity', 'weather', 'temperature_c', 'privacy', '_photos'];
const cleanObs = (o) => Object.fromEntries(OBS_KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
function toLocalInput(iso) { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

// ═════════════════════════ MY OBSERVATIONS ═════════════════════════
let obsTab = 'list', obsStatus = '', obsQ = '', sesTab = 'up';
function renderObs() {
  const el = $('obs');
  const all = allMyObs();
  const counts = Object.fromEntries(Object.keys(STATUSES).map((k) => [k, all.filter((o) => !o._pending && o.review_status === k).length]));
  el.innerHTML = `<div class="subtabs"><button data-t="list" class="${obsTab === 'list' ? 'on' : ''}">Observations</button><button data-t="sessions" class="${obsTab === 'sessions' ? 'on' : ''}">Sessions</button><button data-t="life" class="${obsTab === 'life' ? 'on' : ''}">Life list</button></div><div id="obs-body"></div>`;
  el.querySelectorAll('.subtabs [data-t]').forEach((b) => (b.onclick = () => { obsTab = b.dataset.t; renderObs(); }));
  const body = $('obs-body');
  if (obsTab === 'list') {
    const q = obsQ.toLowerCase();
    const list = all.filter((o) => (!obsStatus || (obsStatus === 'unsynced' ? o._pending : !o._pending && o.review_status === obsStatus)) && (!q || `${spName(o)} ${spSci(o)} ${o.location_name || ''} ${o.notes || ''}`.toLowerCase().includes(q)));
    body.innerHTML = `<div class="search"><input id="obs-q" type="search" placeholder="Search species, place or notes" value="${esc(obsQ)}"></div>
      <div class="chips"><button class="chip ${!obsStatus ? 'on' : ''}" data-s="">All ${all.length}</button>${all.some((o) => o._pending) ? `<button class="chip ${obsStatus === 'unsynced' ? 'on' : ''}" data-s="unsynced">Not uploaded</button>` : ''}
        ${Object.entries(STATUSES).map(([k, v]) => `<button class="chip ${obsStatus === k ? 'on' : ''}" data-s="${k}">${esc(v.label)} ${counts[k] || 0}</button>`).join('')}</div>
      <div class="row" style="gap:6px;margin:4px 0 10px"><button class="btn btn-ghost btn-sm" data-x="csv">${I('file-down')} CSV</button><button class="btn btn-ghost btn-sm" data-x="xlsx">${I('file-spreadsheet')} Excel</button><button class="btn btn-ghost btn-sm" data-x="pdf">${I('printer')} PDF</button></div>
      <div class="card">${list.length ? list.slice(0, 400).map(obsRow).join('') : '<div class="empty small">No observations here yet.</div>'}</div>
      ${list.length > 400 ? `<p class="tiny muted" style="margin-top:6px">Showing 400 of ${list.length}. Export to see them all.</p>` : ''}`;
    $('obs-q').oninput = (e) => { obsQ = e.target.value; clearTimeout(renderObs._t); renderObs._t = setTimeout(() => { renderObs(); const i = $('obs-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    body.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { obsStatus = b.dataset.s; renderObs(); }));
    body.querySelectorAll('[data-obs]').forEach((b) => (b.onclick = () => openObsDetail(b.dataset.obs)));
    body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => exportMine(b.dataset.x, list)));
  } else if (obsTab === 'sessions') {
    const all2 = allMySessions(), live = SES();
    const local = all2.filter((s) => s._pending), ses = sesTab === 'phone' ? local : all2.filter((s) => !s._pending);
    const nObs = (id) => all.filter((o) => o.trip_id === id).length;
    const nSp = (id) => new Set(all.filter((o) => o.trip_id === id).map((o) => o.species_id || o.species_text)).size;
    body.innerHTML = `${live ? `<button class="subbtn" id="ses-live" style="margin-top:0">${I('timer')}<span class="grow">Session in progress · ${esc(SURVEY_TYPES[live.survey_type])}<br><span class="small muted" style="font-weight:400">Started ${fmtDT(live.started_at)}</span></span>${I('chevron-right')}</button>` : ''}
      <h2 style="font-size:24px;margin:6px 0 10px">${all2.length} session${all2.length === 1 ? '' : 's'}</h2>
      <div class="pillseg"><button data-st="phone" class="${sesTab === 'phone' ? 'on' : ''}">On this phone ${local.length}</button><button data-st="up" class="${sesTab === 'up' ? 'on' : ''}">Uploaded ${all2.length - local.length}</button></div>
      <div style="margin-top:10px">${ses.length ? ses.map((s) => `<button class="sesrow" data-ses="${esc(s.id)}"><span class="sptile ${s._pending ? 'local' : ''}"><b>${nSp(s.id)}</b><small>species</small></span>
        <span class="grow"><span class="t">${fmtDate(s.started_at)} <span class="muted">${fmtTime(s.started_at)}</span></span><br>
        <span class="s">${esc(s.title || SURVEY_TYPES[s.survey_type] || 'Session')} · ${Math.round(s.duration_min || 0)} min · ${dist(+s.distance_km || 0)} · ${s._n ?? nObs(s.id)} obs</span>
        ${s.location_name || s.state_code ? `<br><span class="s">${esc([s.location_name, regionName(s.island_code || s.district_code), regionName(s.state_code)].filter(Boolean).join(', '))}</span>` : ''}</span></button>`).join('')
        : `<div class="empty small">${sesTab === 'phone' ? 'Everything is uploaded.' : 'No uploaded sessions yet.'}</div>`}</div>`;
    body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { sesTab = b.dataset.st; renderObs(); }));
    $('ses-live') && ($('ses-live').onclick = () => show('record'));
    body.querySelectorAll('[data-ses]').forEach((b) => (b.onclick = () => openSessionDetail(b.dataset.ses)));
  } else {
    const seen = {};
    for (const o of all) {
      if (!o.species_id || o.review_status === 'rejected') continue;
      const x = (seen[o.species_id] ||= { first: o.observed_at, last: o.observed_at, n: 0, records: 0 });
      if (o.observed_at < x.first) x.first = o.observed_at;
      if (o.observed_at > x.last) x.last = o.observed_at;
      x.n += +o.count || 0; x.records++;
    }
    const rows = Object.entries(seen).map(([id, x]) => ({ s: byId(id) || { id, common: id, sci: '', pack: '' }, ...x })).sort((a, b) => b.first.localeCompare(a.first));
    body.innerHTML = `<p class="small muted" style="margin-bottom:8px">${rows.length} species from your own observations (rejected records excluded). Checklists never add species here.</p>
      <div class="card">${rows.length ? rows.map((r) => `<button class="obsrow" data-sp="${esc(r.s.id)}"><span class="th">${r.s.pack ? thumb(r.s) : I('leaf')}</span><span class="grow"><span class="t">${esc(r.s.common)}</span> <i class="small muted">${esc(r.s.sci)}</i><br>
        <span class="s">First ${fmtDate(r.first)} · last ${fmtDate(r.last)} · ${r.records} record${r.records > 1 ? 's' : ''}</span></span></button>`).join('') : '<div class="empty small">Your life list fills up as you record observations.</div>'}</div>`;
    body.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => openSpecies(b.dataset.sp)));
  }
}
function openObsDetail(id) {
  const o = allMyObs().find((x) => x.id === id); if (!o) return;
  const s = byId(o.species_id), orig = o.original_species_id || o.original_species_text;
  const changed = !o._pending && orig && (o.original_species_id !== o.species_id || (o.original_species_text || '') !== (o.species_text || ''));
  const origName = o.original_species_id ? (byId(o.original_species_id)?.common || o.original_species_id) : o.original_species_text;
  const reviews = (o.reviews || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const ACT = { verify: 'Verified', reject: 'Rejected', needs_id: 'Marked “needs identification”', more_info: 'Asked for more information', suggest_id: 'Suggested an identification', reidentify: 'Changed the identification', duplicate: 'Marked as duplicate', comment: 'Comment', reopen: 'Re-opened for review' };
  const photos = [...new Set([...(o.photo_rows || []).map((p) => p.url), ...(o.photos || [])])];
  const dl = (k, v) => (v || v === 0 ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
  openSheet(`<div class="row" style="justify-content:space-between">${o._pending ? `<span class="badge">${I('cloud-upload')} Not uploaded yet</span>` : statusBadge(o.review_status)}<span class="tiny muted">${esc(PRIVACY[o.privacy]?.split(' (')[0] || '')}</span></div>
    <h2 style="margin-top:8px">${esc(spName(o))}${o.count > 1 ? ` ×${o.count}` : ''}</h2>${s ? `<div class="sci"><i>${esc(s.sci)}</i> · ${esc(s.family)}</div>` : ''}
    ${o.review_note ? `<div class="note">${I('message-square')}<span><b>Reviewer:</b> ${esc(o.review_note)}</span></div>` : ''}
    ${changed ? `<div class="note" style="background:var(--blue-soft)">${I('history')}<span>You recorded <b>${esc(origName)}</b>. A reviewer changed the identification; your original is kept.</span></div>` : ''}
    ${photos.length ? `<div class="gallery">${photos.map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}
    <dl class="kvgrid">${dl('When', fmtDT(o.observed_at))}${dl('Where', [o.location_name, regionName(o.island_code), regionName(o.district_code), regionName(o.state_code)].filter(Boolean).join(' · '))}
      ${o.lat != null ? `<dt>GPS</dt><dd>${(+o.lat).toFixed(5)}, ${(+o.lng).toFixed(5)}${o.accuracy_m != null ? ` ±${Math.round(o.accuracy_m)} m` : ''}${o.elevation_m != null ? ` · ${Math.round(o.elevation_m)} m` : ''}</dd>` : ''}
      ${dl('Evidence', EVIDENCE[o.evidence])}${dl('Confidence', CONF[o.id_confidence])}${dl('Life stage', cap(o.life_stage))}${dl('Sex', cap(o.sex))}${dl('Condition', o.mortality ? MORTALITY[o.mortality] : '')}
      ${dl('Origin', o.origin && o.origin !== 'wild' ? ORIGIN[o.origin] : '')}${dl('Habitat', cap(o.habitat))}${dl('Microhabitat', cap(o.microhabitat))}${dl('Behaviour', cap(o.behaviour))}${dl('Activity', cap(o.activity))}
      ${dl('Weather', cap(o.weather))}${o.temperature_c != null ? dl('Temperature', o.temperature_c + ' °C') : ''}${dl('Notes', o.notes)}${o.trip_id ? `<dt>Session</dt><dd><button class="linkbtn" id="d-ses">Open session</button></dd>` : ''}</dl>
    ${reviews.length ? `<h4 style="margin-top:14px">Review history</h4><div class="hist">${reviews.map((r) => `<div><b>${esc(ACT[r.action] || r.action)}</b>${r.to_species_id ? ` → ${esc(byId(r.to_species_id)?.common || r.to_species_id)}` : ''}<br><span class="tiny muted">${fmtDT(r.created_at)}${r.reviewer_name ? ' · ' + esc(r.reviewer_name) : ''}</span>${r.comment ? `<br>${esc(r.comment)}` : ''}</div>`).join('')}</div>` : ''}
    ${!o._pending && ['more_info', 'needs_id'].includes(o.review_status) ? `<div class="fld"><label for="d-reply">Reply to the reviewer</label><textarea id="d-reply" rows="2" placeholder="Extra details, where the photos were taken, what you saw…"></textarea><button class="btn btn-ghost btn-sm" id="d-send" style="margin-top:6px">${I('message-square')} Send reply</button></div>` : ''}
    <div class="row" style="gap:8px;margin-top:16px">${o._live ? `<button class="btn btn-primary grow" id="d-rec">Open session</button>` : `<button class="btn btn-primary grow" id="d-edit">${I('pencil')} Edit</button>`}
      ${o.review_status !== 'verified' && !o._live ? `<button class="btn btn-ghost" id="d-del" style="color:var(--red)">${I('trash-2')}</button>` : ''}</div>
    ${o.review_status === 'verified' ? '<p class="tiny muted" style="margin-top:6px">Verified records can’t be deleted. Ask a reviewer if something is wrong.</p>' : ''}`);
  $('d-ses') && ($('d-ses').onclick = () => { closeSheet(); if (o._live) show('record'); else openSessionDetail(o.trip_id); });
  $('d-rec') && ($('d-rec').onclick = () => { closeSheet(); show('record'); });
  $('d-edit') && ($('d-edit').onclick = () => { closeSheet(); openObservation({ edit: o }); });
  $('d-del') && ($('d-del').onclick = async () => {
    if (!confirm('Delete this observation?')) return;
    closeSheet();
    const pendingOnly = !S.myObs.some((y) => y.id === o.id);
    if (pendingOnly) { saveOutbox(outbox().filter((x) => !(x.kind === 'obs' && x.id === o.id))); for (const p of o._photos || []) U.photoStore.del(p.id); paintSync(); }
    else await queue({ kind: 'del_obs', id: o.id });
    toast('Observation deleted'); rerender();
  });
  $('d-send') && ($('d-send').onclick = async () => {
    const t = $('d-reply').value.trim(); if (!t) return;
    try { await api.commentOnObservation(o.id, t); toast('Reply sent to the reviewers'); closeSheet(); await loadMine(); rerender(); } catch (e) { toast(HW.isNetError(e) ? 'No connection. Try again when online.' : e.message, 5000); }
  });
}
async function openSessionDetail(id) {
  const s = allMySessions().find((x) => x.id === id); if (!s) return;
  const obs = allMyObs().filter((o) => o.trip_id === id);
  openSheet(`<h2>${esc(s.title || SURVEY_TYPES[s.survey_type] || 'Session')}</h2><p class="small muted">${esc(SURVEY_TYPES[s.survey_type] || '')} · ${fmtDT(s.started_at)}${s.ended_at ? ' – ' + fmtTime(s.ended_at) : ''}</p>
    <div id="sesmap"></div>
    <dl class="kvgrid"><dt>Duration</dt><dd>${Math.round(s.duration_min || 0)} min${s.paused_min ? ` (+${s.paused_min} min paused)` : ''}</dd><dt>Distance</dt><dd>${dist(+s.distance_km || 0)}</dd>
      <dt>Place</dt><dd>${esc([s.location_name, regionName(s.island_code), regionName(s.district_code), regionName(s.state_code)].filter(Boolean).join(' · ') || '—')}</dd>
      ${s.lat != null ? `<dt>Start</dt><dd>${(+s.lat).toFixed(5)}, ${(+s.lng).toFixed(5)}${s.start_accuracy_m != null ? ` ±${s.start_accuracy_m} m` : ''}${s.start_elevation_m != null ? ` · ${s.start_elevation_m} m` : ''}</dd>` : ''}
      <dt>Observers</dt><dd>${s.observers || 1}</dd>${s.weather ? `<dt>Weather</dt><dd>${esc(s.weather)}</dd>` : ''}<dt>Complete list</dt><dd>${s.complete ? 'Yes' : 'No'}</dd>${s.notes ? `<dt>Notes</dt><dd>${esc(s.notes)}</dd>` : ''}</dl>
    <h4 style="margin-top:14px">${obs.length} observation${obs.length === 1 ? '' : 's'}</h4><div class="card" style="margin-top:6px">${obs.map(obsRow).join('') || '<div class="empty small">None</div>'}</div>
    <div class="row" style="gap:8px;margin-top:14px"><button class="btn btn-ghost grow" id="sd-gpx">${I('download')} GPX track</button>${obs.every((o) => o.review_status !== 'verified') ? `<button class="btn btn-ghost" id="sd-del" style="color:var(--red)">${I('trash-2')} Delete</button>` : ''}</div>`);
  let track = s.track || [];
  const pending = outbox().find((x) => x.kind === 'session' && x.id === id);
  if (pending) track = pending.session.track;
  else if (!track.length) { try { track = (await api.sessionTrack(id)).map((p) => [p.lat, p.lng]); } catch {} }
  if ($('sesmap')) drawMap('sesmap', track, obs.filter((o) => o.lat != null).map((o) => ({ lat: o.lat, lng: o.lng, label: spName(o) })));
  $('sheetbody').querySelectorAll('[data-obs]').forEach((b) => (b.onclick = () => openObsDetail(b.dataset.obs)));
  $('sd-gpx').onclick = () => {
    const pts = pending?.points?.length ? pending.points : track.map(([lat, lng]) => ({ lat, lng }));
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="HerpWatch" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(s.title || SURVEY_TYPES[s.survey_type])}</name><trkseg>${pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lng}">${p.elevation_m != null ? `<ele>${p.elevation_m}</ele>` : ''}${p.t ? `<time>${p.t}</time>` : ''}</trkpt>`).join('')}</trkseg></trk>${obs.filter((o) => o.lat != null).map((o) => `<wpt lat="${o.lat}" lon="${o.lng}"><time>${o.observed_at}</time><name>${esc(spName(o))}</name></wpt>`).join('')}</gpx>`;
    U.download(`herpwatch-session-${s.started_at.slice(0, 10)}.gpx`, gpx, 'application/gpx+xml');
  };
  $('sd-del') && ($('sd-del').onclick = async () => {
    if (!confirm(`Delete this session and its ${obs.length} observation(s)?`)) return;
    closeSheet();
    if (pending && !S.mySessions.some((x) => x.id === id)) { saveOutbox(outbox().filter((x) => x !== pending && x.id !== id)); paintSync(); }
    else await queue({ kind: 'del_session', id });
    toast('Session deleted'); rerender();
  });
}
const EXPORT_COLS = [
  ['observation_id', 'Observation ID'], ['date', 'Date'], ['time', 'Time'], ['common_name', 'Common name'], ['scientific_name', 'Scientific name'], ['family', 'Family'], ['order', 'Order'],
  ['species_text', 'Recorded as (unlisted)'], ['original_identification', 'Original identification'], ['count', 'Count'], ['sex', 'Sex'], ['life_stage', 'Life stage'], ['evidence', 'Evidence'],
  ['condition', 'Condition'], ['origin', 'Wild/captive'], ['id_confidence', 'ID confidence'], ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['accuracy_m', 'GPS accuracy (m)'],
  ['elevation_m', 'Elevation (m)'], ['location', 'Location'], ['state', 'State/UT'], ['district', 'District'], ['island', 'Island'], ['habitat', 'Habitat'], ['microhabitat', 'Microhabitat'],
  ['behaviour', 'Behaviour'], ['activity', 'Activity'], ['weather', 'Weather'], ['temperature_c', 'Temperature (°C)'], ['survey_type', 'Survey type'], ['session_id', 'Session ID'],
  ['verification_status', 'Verification status'], ['reviewer_note', 'Reviewer note'], ['privacy', 'Privacy'], ['notes', 'Notes'], ['photos', 'Photo URLs'], ['observer', 'Observer']];
function exportRows(list) {
  const sesById = Object.fromEntries(allMySessions().map((s) => [s.id, s]));
  return list.map((o) => {
    const s = byId(o.species_id), d = new Date(o.observed_at);
    const orig = o.original_species_id ? (byId(o.original_species_id)?.sci || o.original_species_id) : o.original_species_text || '';
    return {
      observation_id: o.id, date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5), common_name: s?.common || '', scientific_name: s?.sci || '', family: s?.family || '', order: s?.order || '',
      species_text: o.species_text || '', original_identification: orig && orig !== (s?.sci || o.species_text) ? orig : '', count: o.count, sex: o.sex || '', life_stage: o.life_stage || '',
      evidence: EVIDENCE[o.evidence] || '', condition: MORTALITY[o.mortality || ''], origin: ORIGIN[o.origin] || '', id_confidence: o.id_confidence || '', latitude: o.lat ?? '', longitude: o.lng ?? '',
      accuracy_m: o.accuracy_m ?? '', elevation_m: o.elevation_m ?? '', location: o.location_name || '', state: regionName(o.state_code), district: regionName(o.district_code), island: regionName(o.island_code),
      habitat: o.habitat || '', microhabitat: o.microhabitat || '', behaviour: o.behaviour || '', activity: o.activity || '', weather: o.weather || '', temperature_c: o.temperature_c ?? '',
      survey_type: o.trip_id ? SURVEY_TYPES[sesById[o.trip_id]?.survey_type] || '' : 'No session', session_id: o.trip_id || '',
      verification_status: o._pending ? 'Not uploaded' : STATUSES[o.review_status]?.label || o.review_status, reviewer_note: o.review_note || '', privacy: o.privacy || '', notes: o.notes || '',
      photos: [...new Set([...(o.photo_rows || []).map((p) => p.url), ...(o.photos || [])])].join(' '), observer: S.me?.username || '',
    };
  });
}
async function exportMine(kind, list) {
  if (!list.length) return toast('Nothing to export');
  const rows = exportRows(list), name = `herpwatch-observations-${new Date().toISOString().slice(0, 10)}`;
  const labelled = rows.map((r) => Object.fromEntries(EXPORT_COLS.map(([k, l]) => [l, r[k]])));
  try {
    if (kind === 'csv') U.download(name + '.csv', '﻿' + U.toCSV(labelled));
    else if (kind === 'xlsx') {
      const ses = allMySessions().map((s) => ({ 'Session ID': s.id, 'Survey type': SURVEY_TYPES[s.survey_type] || '', Title: s.title || '', Start: s.started_at, End: s.ended_at || '', 'Duration (min)': s.duration_min || 0,
        'Distance (km)': +s.distance_km || 0, Observers: s.observers || 1, Location: s.location_name || '', 'State/UT': regionName(s.state_code), District: regionName(s.district_code), Island: regionName(s.island_code), Weather: s.weather || '', Notes: s.notes || '' }));
      await U.downloadXlsx(name + '.xlsx', { Observations: labelled, Sessions: ses });
    } else {
      const cols = [['date', 'Date'], ['time', 'Time'], ['common_name', 'Species'], ['scientific_name', 'Scientific name'], ['count', 'No.'], ['life_stage', 'Stage'], ['evidence', 'Evidence'],
        ['location', 'Location'], ['latitude', 'Lat'], ['longitude', 'Lng'], ['habitat', 'Habitat'], ['verification_status', 'Status']].map(([key, label]) => ({ key, label }));
      U.printReport(`${HW.C.APP_NAME}: observations of ${S.me?.full_name || S.me?.username || ''}`, `${rows.length} observations · exported ${fmtDT(new Date())}`, cols, rows.map((r) => ({ ...r, common_name: r.common_name || r.species_text })));
    }
  } catch (e) { toast(e.message, 5000); }
}

// ═════════════════════════ CHECKLIST ═════════════════════════
const CL = { q: '', group: '', family: '', genus: '', order: '', seen: '' };
function renderChecklist() {
  const el = $('cl'), reg = regionOf(S.region);
  const ids = new Set(S.checklist);
  const mine = allMyObs().filter((o) => o.species_id && o.review_status !== 'rejected');
  const seenHere = {}, seenAny = {};
  for (const o of mine) {
    const a = (seenAny[o.species_id] ||= { first: o.observed_at, last: o.observed_at });
    if (o.observed_at < a.first) a.first = o.observed_at; if (o.observed_at > a.last) a.last = o.observed_at;
    if (obsInRegion(o, S.region)) { const h = (seenHere[o.species_id] ||= { first: o.observed_at, last: o.observed_at, n: 0 }); h.n++; if (o.observed_at < h.first) h.first = o.observed_at; if (o.observed_at > h.last) h.last = o.observed_at; }
  }
  const sp = S.index.filter((s) => ids.has(s.id));
  const q = CL.q.toLowerCase();
  const uniq = (k) => [...new Set(sp.map((s) => s[k]).filter(Boolean))].sort();
  const list = sp.filter((s) => (!CL.group || s.group === CL.group) && (!CL.family || s.family === CL.family) && (!CL.genus || s.genus === CL.genus) && (!CL.order || s.order === CL.order)
    && (!CL.seen || (CL.seen === 'seen' ? seenHere[s.id] : !seenHere[s.id])) && (!q || `${s.common} ${s.sci} ${s.family}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.order || '').localeCompare(b.order || '') || (a.family || '').localeCompare(b.family || '') || a.sci.localeCompare(b.sci));
  const nSeen = sp.filter((s) => seenHere[s.id]).length;
  const parent = reg?.parent && regionOf(reg.parent);
  const kids = S.regions.filter((r) => r.parent === S.region);
  const sel = (k, label, opts) => `<select data-f="${k}"><option value="">${label}</option>${opts.map((v) => `<option ${CL[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  el.innerHTML = `<div class="hello"><h1>${esc(reg?.name || S.region)}</h1><p>${esc(cap(reg?.kind || ''))}${parent ? ' in ' + esc(parent.name) : ''} · official checklist</p></div>
    ${sp.length ? `<div class="card pad"><div class="row" style="justify-content:space-between"><b>You have seen ${nSeen} of ${sp.length} species here</b><span class="small muted">${Math.round((nSeen / sp.length) * 100)}%</span></div>
      <div class="progress"><i style="width:${(nSeen / sp.length) * 100}%"></i></div><p class="tiny muted">Only your own uploaded or saved observations tick a species, never the checklist itself.</p></div>`
      : `<div class="card pad"><b>No species list has been published for ${esc(reg?.name || S.region)} yet.</b><p class="small muted" style="margin-top:4px">Reviewers add district and island lists only where the data is reliable.${parent ? ` <button class="linkbtn" data-r="${esc(parent.code)}">See ${esc(parent.name)}</button>` : ''}</p></div>`}
    ${kids.length ? `<div class="chips" style="margin-top:10px">${kids.map((k) => `<button class="chip" data-r="${esc(k.code)}">${esc(k.name)}</button>`).join('')}</div>` : ''}
    ${sp.length ? `<div class="search" style="margin-top:10px"><input id="cl-q" type="search" placeholder="Search this checklist" value="${esc(CL.q)}"></div>
    <div class="chips"><button class="chip ${!CL.seen ? 'on' : ''}" data-seen="">All</button><button class="chip ${CL.seen === 'seen' ? 'on' : ''}" data-seen="seen">Seen</button><button class="chip ${CL.seen === 'not' ? 'on' : ''}" data-seen="not">Not yet recorded</button></div>
    <div class="filters">${sel('group', 'All groups', uniq('group').map((g) => g))}${sel('order', 'All orders', uniq('order'))}${sel('family', 'All families', uniq('family'))}</div>
    <div class="filters" style="grid-template-columns:1fr">${sel('genus', 'All genera', uniq('genus'))}</div>
    <p class="small muted" style="margin:4px 0 6px">${list.length} species</p>
    <div class="card">${list.map((s) => { const h = seenHere[s.id], a = seenAny[s.id]; return `<button class="cl-row" data-id="${esc(s.id)}"><span class="ck ${h ? 'seen' : a ? 'else' : ''}" title="${h ? 'Seen here' : a ? 'Seen elsewhere' : 'Not yet recorded'}">${h || a ? I('check') : ''}</span>
      <span class="grow"><b>${nmHtml(s)}</b>${nameMode() === 'common' ? ` <i class="small muted">${esc(s.sci)}</i>` : ''}<br><span class="tiny muted">${esc(s.family)}${h ? ` · first ${fmtDate(h.first)} · latest ${fmtDate(h.last)}` : a ? ' · seen elsewhere' : ''}</span></span>
      ${S.clStatus[s.id] && S.clStatus[s.id] !== 'native' ? `<span class="badge">${esc(cap(S.clStatus[s.id]))}</span>` : ''}</button>`; }).join('') || '<div class="empty small">No species match.</div>'}</div>
    <div class="legend" style="margin-top:8px"><span><i style="background:var(--forest-2)"></i>Seen here</span><span><i style="border:2px solid var(--forest-2)"></i>Seen elsewhere</span><span><i style="border:2px solid var(--line)"></i>Not yet recorded</span></div>` : ''}`;
  el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => { S.region = b.dataset.r; U.lsSet('hw_region', S.region); $('region').innerHTML = regionOptions(S.region); await loadChecklist(); renderChecklist(); }));
  el.querySelectorAll('[data-seen]').forEach((b) => (b.onclick = () => { CL.seen = b.dataset.seen; renderChecklist(); }));
  el.querySelectorAll('[data-f]').forEach((s) => (s.onchange = () => { CL[s.dataset.f] = s.value; renderChecklist(); }));
  el.querySelector('select[data-f=group]')?.querySelectorAll('option').forEach((o) => { if (o.value) o.textContent = GROUPS[o.value] || o.value; });
  $('cl-q') && ($('cl-q').oninput = (e) => { CL.q = e.target.value; clearTimeout(renderChecklist._t); renderChecklist._t = setTimeout(() => { renderChecklist(); const i = $('cl-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  el.querySelectorAll('.cl-row').forEach((b) => (b.onclick = () => openSpecies(b.dataset.id)));
}

// ═════════════════════════ EXPLORE: map · species · identify ═════════════════════════
let exTab = 'nearby', exMap = null;
const NB = { days: 30, km: 50 };
async function renderNearby() {
  const el = $('ex-nearby'), reg = regionOf(S.region);
  const from = NB.days ? new Date(Date.now() - NB.days * 864e5).toISOString().slice(0, 10) : null;
  el.innerHTML = `<div class="nbhead"><div class="grow"><h2>Explore nearby</h2><p class="small muted">${NB.days ? `${NB.days} days` : 'All time'} · ${esc(reg?.name || S.region)}</p></div>
      <select id="nb-days" style="width:auto">${[[7, '7 days'], [30, '30 days'], [365, '1 year'], [0, 'All time']].map(([d, l]) => `<option value="${d}" ${NB.days === d ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="search"><input id="nb-q" type="search" placeholder="Search species seen in this area"></div>
    <div id="nb-body"><div class="empty small">Loading…</div></div>`;
  $('nb-days').onchange = (e) => { NB.days = +e.target.value; renderNearby(); };
  let pub = [];
  try { pub = await api.publicObservations({ region: S.region, from, limit: 5000 }); } catch (e) { if (!HW.isNetError(e)) toast(e.message); }
  if (exTab !== 'nearby' || !$('nb-body')) return;
  const mine = allMyObs().filter((o) => o.species_id && o.review_status !== 'rejected');
  const life = new Set(mine.map((o) => o.species_id));
  const y = String(new Date().getFullYear()), m = new Date().toISOString().slice(0, 7);
  const year = new Set(mine.filter((o) => String(o.observed_at).startsWith(y)).map((o) => o.species_id));
  const month = new Set(mine.filter((o) => String(o.observed_at).startsWith(m)).map((o) => o.species_id));
  const seenHere = {};
  for (const p of pub) if (p.species_id) { const x = (seenHere[p.species_id] ||= { n: 0, last: p.observed_at, places: new Set() }); x.n++; if (p.observed_at > x.last) x.last = p.observed_at; if (p.location_name) x.places.add(p.location_name); }
  const ids = Object.keys(seenHere);
  const observers = new Set(pub.map((p) => p.observer)).size;
  const places = new Set(pub.map((p) => p.location_name).filter(Boolean)).size;
  const tgt = (set) => ids.filter((id) => !set.has(id));
  const lists = { life: tgt(life), year: tgt(year), month: tgt(month) };
  const listHtml = (arr) => arr.map((id) => byId(id)).filter(Boolean).sort((a, b) => seenHere[b.id].n - seenHere[a.id].n).map((s) => `<button class="cl-row" data-id="${esc(s.id)}"><span class="th mini">${thumb(s)}</span>
    <span class="grow"><b>${nmHtml(s)}</b><br><span class="tiny muted">${seenHere[s.id].n} record${seenHere[s.id].n > 1 ? 's' : ''} · last ${fmtDate(seenHere[s.id].last)}${[...seenHere[s.id].places].slice(0, 2).map((p) => ' · ' + esc(p)).join('')}</span></span>${life.has(s.id) ? I('circle-check') : ''}</button>`).join('');
  const body = $('nb-body');
  body.innerHTML = `<div class="sect" style="margin-top:4px"><h3>Species observed</h3><span class="small muted">${NB.days ? 'last ' + NB.days + ' days' : 'all time'}</span></div>
    <div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:0"><button class="tile big" data-l="all"><b>${ids.length}</b><span>Species</span></button><button class="tile big" data-l="life"><b>${lists.life.length}</b><span>Targets (new for you)</span></button></div>
    <div class="sect"><h3>Activity</h3></div>
    <div class="tiles" style="margin-top:0"><div class="tile"><b>${pub.length}</b><span>Public records</span></div><div class="tile"><b>${observers}</b><span>Observers</span></div><div class="tile"><b>${places}</b><span>Places</span></div></div>
    <div class="sect"><h3>Targets</h3></div><p class="small muted" style="margin:-4px 0 8px">Species recently seen in ${esc(reg?.name || S.region)} that are missing from your lists.</p>
    <div class="card menu nav">${[['life', 'Life targets', 'Never recorded by you'], ['year', 'Year targets', `Not yet in ${y}`], ['month', 'Month targets', `Not yet this ${new Date().toLocaleString('en', { month: 'long' })}`]]
      .map(([k, t, d]) => `<button data-l="${k}"><span class="grow"><b>${t}</b><br><span class="tiny muted">${d}</span></span><span class="badge">${lists[k].length}</span>${I('chevron-right')}</button>`).join('')}</div>
    <div class="sect"><h3>Top herpers here</h3></div>
    <div class="card menu nav"><button data-top="1"><span class="grow"><b>${esc(reg?.name || S.region)}</b><br><span class="tiny muted">Ranked by distinct species</span></span>${I('chevron-right')}</button></div>
    <div id="nb-list"></div>`;
  const showList = (k) => {
    const arr = k === 'all' ? ids : lists[k];
    $('nb-list').innerHTML = `<div class="sect"><h3>${{ all: 'All species', life: 'Life targets', year: 'Year targets', month: 'Month targets' }[k]}</h3><span class="small muted">${arr.length}</span></div><div class="card">${listHtml(arr) || '<div class="empty small">Nothing here. Well done!</div>'}</div>`;
    $('nb-list').querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openSpecies(b.dataset.id)));
    $('nb-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  body.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => showList(b.dataset.l)));
  body.querySelector('[data-top]').onclick = () => { exTab = 'top'; renderExplore(); };
  $('nb-q').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { $('nb-list').innerHTML = ''; return; }
    const arr = ids.filter((id) => { const s = byId(id); return s && `${s.common} ${s.sci} ${s.family}`.toLowerCase().includes(q); });
    $('nb-list').innerHTML = `<div class="card" style="margin-top:12px">${listHtml(arr) || '<div class="empty small">Not seen here in this period.</div>'}</div>`;
    $('nb-list').querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openSpecies(b.dataset.id)));
  };
}
const TOP = { period: 'all', group: '' };
async function renderTop() {
  const el = $('ex-top'), reg = regionOf(S.region);
  const from = TOP.period === 'year' ? `${new Date().getFullYear()}-01-01` : TOP.period === 'month' ? new Date().toISOString().slice(0, 7) + '-01' : null;
  el.innerHTML = `<h2>Top herpers</h2><p class="small muted">Ranked by distinct species recorded; number of records breaks ties. Private and rejected records don’t count.</p>
    <div class="pillseg" style="margin-top:10px">${[['all', 'All time'], ['year', 'This year'], ['month', 'This month']].map(([k, l]) => `<button data-p="${k}" class="${TOP.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:8px"><select id="tp-reg">${regionOptions(S.region)}</select>
      <select id="tp-grp"><option value="">All herps</option>${Object.entries(GROUPS).map(([k, l]) => `<option value="${k}" ${TOP.group === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div id="tp-body"><div class="empty small">Loading…</div></div>`;
  el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { TOP.period = b.dataset.p; renderTop(); }));
  $('tp-grp').onchange = (e) => { TOP.group = e.target.value; renderTop(); };
  $('tp-reg').onchange = async (e) => { S.region = e.target.value; U.lsSet('hw_region', S.region); $('region').innerHTML = regionOptions(S.region); await loadChecklist(); renderTop(); };
  let rows = [];
  try { rows = await api.leaderboard({ region: S.region, from, group: TOP.group, limit: 100 }); }
  catch (e) { if ($('tp-body')) $('tp-body').innerHTML = `<div class="empty small">${esc(HW.isNetError(e) ? 'Connect to the internet to see the leaderboard.' : e.message)}</div>`; return; }
  if (exTab !== 'top' || !$('tp-body')) return;
  const ini = (r) => esc((r.full_name || r.username || '?').trim()[0].toUpperCase());
  const who = (r) => esc(r.full_name || r.username);
  const podium = [rows[1], rows[0], rows[2]].map((r, i) => (r ? `<div class="pod p${[2, 1, 3][i]}"><div class="pn">${who(r)}<br><b>${r.species} sp</b></div><div class="pa">${ini(r)}<span>${r.rank}</span></div><div class="pb"></div></div>` : '<div class="pod"></div>')).join('');
  $('tp-body').innerHTML = rows.length ? `<div class="card pad" style="margin-top:10px"><b>${esc(TOP.group ? GROUPS[TOP.group] : 'All herps')}</b><div class="tiny muted">${esc(reg?.name || S.region)}</div><div class="podium">${podium}</div></div>
    <div class="card" style="margin-top:10px">${rows.slice(3).map((r) => `<div class="cl-row ${r.username === S.me?.username ? 'me' : ''}"><span class="rk">${r.rank}</span><span class="grow"><b>${who(r)}</b> <span class="tiny muted">@${esc(r.username)}</span></span><b class="mono" style="color:var(--forest-2)">${r.species} sp</b><span class="tiny muted" style="width:56px;text-align:right">${r.records} rec</span></div>`).join('') || '<div class="empty small">Only the podium so far.</div>'}</div>
    ${S.me && !S.me.guest && !rows.some((r) => r.username === S.me.username) ? '<p class="tiny muted" style="margin-top:8px">You are not on this board yet. Public or restricted observations count.</p>' : ''}`
    : '<div class="empty small">No records for this period yet.</div>';
}
const EX = { species: '', family: '', from: '', to: '', status: '', mine: true, routes: true };
$('ex-tabs').onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) { exTab = b.dataset.x; renderExplore(); } };
function renderExplore() {
  document.querySelectorAll('#ex-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.x === exTab));
  ['nearby', 'map', 'guide', 'identify', 'top'].forEach((t) => $('ex-' + t).classList.toggle('hidden', t !== exTab));
  ({ nearby: renderNearby, map: renderExMap, guide: renderGuide, identify: renderIdentify, top: renderTop })[exTab]();
}
const GROUP_COLOR = { snake: '#c53030', lizard: '#c98a16', gecko: '#b7791f', skink: '#9c6b1f', agama: '#dd6b20', monitor: '#7b5b2a', chameleon: '#5a8f3c', turtle: '#2b6cb0', tortoise: '#4a6fa5', crocodilian: '#2c5282', frog: '#2f855a', toad: '#38a169', caecilian: '#805ad5' };
function renderExMap() {
  const el = $('ex-map');
  const fams = [...new Set(S.index.map((s) => s.family).filter(Boolean))].sort();
  el.innerHTML = `<div class="filters">
      <select id="ex-sp"><option value="">All species</option>${S.index.slice().sort((a, b) => a.common.localeCompare(b.common)).map((s) => `<option value="${esc(s.id)}" ${EX.species === s.id ? 'selected' : ''}>${esc(s.common)}</option>`).join('')}</select>
      <select id="ex-fam"><option value="">All families</option>${fams.map((f) => `<option ${EX.family === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select id="ex-st"><option value="">Any status</option>${Object.entries(STATUSES).filter(([k]) => k !== 'rejected').map(([k, v]) => `<option value="${k}" ${EX.status === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <input type="date" id="ex-from" value="${EX.from}" aria-label="From date"><input type="date" id="ex-to" value="${EX.to}" aria-label="To date">
      <select id="ex-reg">${regionOptions(S.region)}</select></div>
    <div class="row" style="gap:14px;margin-bottom:6px"><label class="row small" style="gap:6px"><input type="checkbox" id="ex-mine" style="width:18px;min-height:18px" ${EX.mine ? 'checked' : ''}> My observations</label>
      <label class="row small" style="gap:6px"><input type="checkbox" id="ex-routes" style="width:18px;min-height:18px" ${EX.routes ? 'checked' : ''}> My routes</label><span class="grow"></span><span class="small muted" id="ex-n"></span></div>
    <div id="exmap" style="height:58vh;min-height:320px"></div>
    <div class="legend" id="ex-leg"></div>
    <p class="tiny muted" style="margin-top:6px">Public records from all observers (private and restricted records are hidden; sensitive species are shown at reduced precision). Routes are your own sessions, drawn as a separate layer.</p>`;
  const bind = (id, k, ev = 'onchange', val = (e) => e.target.value) => ($(id)[ev] = (e) => { EX[k] = val(e); paintExMap(); });
  bind('ex-sp', 'species'); bind('ex-fam', 'family'); bind('ex-st', 'status'); bind('ex-from', 'from'); bind('ex-to', 'to');
  bind('ex-mine', 'mine', 'onchange', (e) => e.target.checked); bind('ex-routes', 'routes', 'onchange', (e) => e.target.checked);
  $('ex-reg').onchange = async (e) => { S.region = e.target.value; U.lsSet('hw_region', S.region); $('region').innerHTML = regionOptions(S.region); await loadChecklist(); paintExMap(); };
  if (exMap) { try { exMap.m.remove(); } catch {} }
  exMap = drawMap('exmap', [], []);
  if (exMap.m) { exMap.obs = L.layerGroup().addTo(exMap.m); exMap.routes = L.layerGroup().addTo(exMap.m); }
  paintExMap();
}
let exReq = 0;
async function paintExMap() {
  if (!exMap?.m) return;
  const my = ++exReq;
  let pub = [];
  try { pub = await api.publicObservations({ species: EX.species, family: EX.family, from: EX.from, to: EX.to, region: S.region, status: EX.status, limit: 3000 }); }
  catch (e) { if (!HW.isNetError(e)) toast(e.message); }
  if (my !== exReq || !exMap?.m) return;
  exMap.obs.clearLayers(); exMap.routes.clearLayers();
  const pts = [], groups = new Set();
  const add = (lat, lng, color, html) => { pts.push([lat, lng]); L.circleMarker([lat, lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 }).bindPopup(html).addTo(exMap.obs); };
  const pubIds = new Set();
  for (const p of pub) {
    pubIds.add(p.id); groups.add(p.taxon_group);
    add(p.lat, p.lng, GROUP_COLOR[p.taxon_group] || '#555', `<b>${esc(p.common_name || 'Unidentified')}</b><br><i>${esc(p.scientific_name || '')}</i><br>${fmtDate(p.observed_at)} · ${esc(p.observer || '')}<br>${esc(STATUSES[p.review_status]?.label || '')}${p.precise ? '' : '<br><small>Location blurred (sensitive species)</small>'}${p.photo ? `<br><img src="${esc(p.photo)}" style="width:160px;border-radius:6px;margin-top:4px">` : ''}`);
  }
  if (EX.mine) {
    for (const o of allMyObs()) {
      if (o.lat == null || pubIds.has(o.id) || !obsInRegion(o, S.region) && S.region !== 'IN') continue;
      const s = byId(o.species_id);
      if ((EX.species && o.species_id !== EX.species) || (EX.family && s?.family !== EX.family) || (EX.status && o.review_status !== EX.status) || (EX.from && o.observed_at < EX.from) || (EX.to && o.observed_at.slice(0, 10) > EX.to)) continue;
      groups.add(s?.group);
      add(o.lat, o.lng, GROUP_COLOR[s?.group] || '#555', `<b>${esc(spName(o))}</b> (yours)<br>${fmtDT(o.observed_at)}<br>${o._pending ? 'Not uploaded' : esc(STATUSES[o.review_status]?.label || '')}`);
    }
  }
  if (EX.routes) {
    for (const s of allMySessions()) {
      const pend = outbox().find((x) => x.kind === 'session' && x.id === s.id);
      const tr = pend?.session.track || s.track || [];
      if (tr.length > 1) L.polyline(tr, { color: '#2f7d4f', weight: 3, opacity: 0.8 }).bindPopup(`${esc(s.title || SURVEY_TYPES[s.survey_type])}<br>${fmtDT(s.started_at)} · ${(+s.distance_km || 0).toFixed(2)} km`).addTo(exMap.routes);
    }
    const live = SES(); if (live?.track.length > 1) L.polyline(live.track, { color: '#c53030', weight: 3, dashArray: '6 6' }).bindPopup('Session in progress').addTo(exMap.routes);
  }
  $('ex-n').textContent = `${pts.length} records`;
  $('ex-leg').innerHTML = [...groups].filter(Boolean).map((g) => `<span><i style="background:${GROUP_COLOR[g] || '#555'}"></i>${esc(GROUPS[g] || g)}</span>`).join('') + (EX.routes ? '<span><i style="background:#2f7d4f;border-radius:2px;height:4px"></i>Route</span>' : '');
  if (pts.length) exMap.m.fitBounds(pts, { padding: [24, 24], maxZoom: 13 });
  else { const r = regionOf(S.region); exMap.m.setView(r?.lat != null ? [+r.lat, +r.lng] : [22.5, 79], r?.kind === 'country' ? 4 : r?.kind === 'island' ? 10 : 7); }
}
function drawMap(elId, track, pts, opts = {}) {
  const el = $(elId);
  if (!window.L) { if (el) el.innerHTML = '<div class="empty small">Map unavailable offline. GPS is still recorded.</div>'; return {}; }
  const m = L.map(elId, { zoomControl: true, attributionControl: true });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
  L.control.layers({ Map: osm, Satellite: sat }).addTo(m);
  const line = L.polyline(track || [], { color: '#2f7d4f', weight: 4 }).addTo(m);
  const layer = L.layerGroup().addTo(m);
  (pts || []).forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: p.color || '#c53030', fillOpacity: 1 }).bindPopup(esc(p.label || '')).addTo(layer));
  const all = [...(track || []), ...(pts || []).map((p) => [p.lat, p.lng])];
  if (opts.me) all.push([opts.me.lat, opts.me.lng]);
  if (all.length > 1) m.fitBounds(all, { padding: [20, 20], maxZoom: 17 }); else if (all.length) m.setView(all[0], 16);
  else { const r = regionOf(S.region); m.setView(r?.lat != null ? [+r.lat, +r.lng] : [22.5, 79], 6); }
  const out = { m, line, layer, panned: false };
  m.on('dragstart', () => (out.panned = true));
  return out;
}

// ── species guide ──
const FILTERS = [['venomous', 'Venomous'], ['poisonous', 'Poisonous'], ['threatened', 'Threatened (CR/EN/VU)'], ['endemic', 'Endemic'], ['unseen', 'Not yet seen by me']];
function renderGuide() {
  const G = S.guide, cl = new Set(S.checklist), q = G.q.trim().toLowerCase();
  const seen = new Set(allMyObs().filter((o) => o.review_status !== 'rejected').map((o) => o.species_id));
  const inRegion = S.index.filter((s) => cl.has(s.id));
  const uniq = (k) => [...new Set(inRegion.map((s) => s[k]).filter(Boolean))].sort();
  $('packchips').innerHTML = [['all', 'All groups'], ...S.packs.map((p) => [p.id, p.name])].map(([id, l]) => `<button class="chip ${G.pack === id ? 'on' : ''}" data-p="${id}">${id === 'all' ? '' : dot(id)}${esc(l)}</button>`).join('');
  $('taxfilters').innerHTML = [['order', 'All orders'], ['family', 'All families'], ['genus', 'All genera']].map(([k, l]) => `<select data-tf="${k}"><option value="">${l}</option>${uniq(k).map((v) => `<option ${G[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`).join('');
  $('filterchips').innerHTML = FILTERS.map(([id, l]) => `<button class="chip ${G.filters.has(id) ? 'on' : ''}" data-f="${id}">${esc(l)}</button>`).join('');
  const f = G.filters;
  const list = inRegion.filter((s) => (G.pack === 'all' || s.pack === G.pack) && (!G.family || s.family === G.family) && (!G.genus || s.genus === G.genus) && (!G.order || s.order === G.order)
    && (!q || `${s.common} ${s.sci} ${s.family} ${s.genus}`.toLowerCase().includes(q))
    && (!f.has('venomous') || s.venom === 'venomous') && (!f.has('poisonous') || s.toxic === 'poisonous') && (!f.has('threatened') || ['CR', 'EN', 'VU'].includes(s.iucn))
    && (!f.has('endemic') || s.endemic || S.clStatus[s.id] === 'endemic') && (!f.has('unseen') || !seen.has(s.id)))
    .sort((a, b) => S.packs.findIndex((p) => p.id === a.pack) - S.packs.findIndex((p) => p.id === b.pack) || a.common.localeCompare(b.common));
  const grid = U.lsGet('hw_grid', false);
  $('guidecount').innerHTML = `<span class="grow">${list.length} species · ${esc(regionName(S.region))}</span><span class="viewtog"><button data-g="1" class="${grid ? 'on' : ''}" aria-label="Grid">${I('layers')}</button><button data-g="0" class="${grid ? '' : 'on'}" aria-label="List">${I('list')}</button></span>`;
  $('splist').classList.toggle('grid', grid);
  $('splist').innerHTML = list.length ? list.map((s, i) => `<button class="card sp" style="--i:${i}" data-id="${s.id}"><div class="th">${thumb(s)}</div><div class="grow"><div class="nm">${nmHtml(s)} <span class="tag">${esc(GROUPS[s.group] || packOf(s.pack).name)}</span>${seen.has(s.id) ? ` <span style="color:var(--forest-2)">${I('circle-check')}</span>` : ''}</div><div class="sci"><i>${esc(s.sci)}</i> · ${esc(s.family)}</div><div class="pills">${pills(s)}</div></div></button>`).join('')
    : `<div class="empty">No species match. ${S.checklist.length ? 'Try clearing filters.' : 'No checklist has been published for this region yet.'}</div>`;
}
$('packchips').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { S.guide.pack = b.dataset.p; renderGuide(); } };
$('filterchips').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { const F = S.guide.filters; F.has(b.dataset.f) ? F.delete(b.dataset.f) : F.add(b.dataset.f); renderGuide(); } };
$('taxfilters').onchange = (e) => { const s = e.target.closest('[data-tf]'); if (s) { S.guide[s.dataset.tf] = s.value; renderGuide(); } };
$('q').oninput = (e) => { S.guide.q = e.target.value; renderGuide(); };
$('guidecount').onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) { U.lsSet('hw_grid', b.dataset.g === '1'); renderGuide(); } };
$('splist').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) openSpecies(b.dataset.id); };

function unlockOffer(pack) {
  const isState = S.region.includes('-'), country = S.region.split('-')[0], state = S.region.split('-').slice(0, 2).join('-');
  const opts = [];
  try { if (isState) opts.push({ region: state, ...U.quoteFrom(S.prices, [{ pack, region: state }]) }); } catch {}
  try { opts.push({ region: country, ...U.quoteFrom(S.prices, [{ pack, region: country }]) }); } catch {}
  return `<div class="locked"><b class="row" style="gap:8px">${I('lock')} Unlock the ${esc(packOf(pack).name)} pack</b>
    <p class="small muted" style="margin:4px 0 10px">Photos, identification notes, habitat, distribution and the Identify helper. Safety information and recording are always free.</p>
    <div class="row wrap">${opts.map((o) => `<button class="btn btn-primary btn-sm" data-buy="${pack}|${o.region}">${esc(regionName(o.region))} · ${U.rupees(o.total)}/yr</button>`).join('') || '<span class="small muted">No price set for this region yet.</span>'}</div></div>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (!b) return; const [pack, region] = b.dataset.buy.split('|'); openStore(region, [pack]); });

function openSpecies(id) {
  const s = byId(id); if (!s) return;
  const f = S.unlocked[id];
  const imgs = (f?.images || []).map((i) => (typeof i === 'string' ? { url: i } : i)).filter((i) => i.url);
  const kv = (t, v) => (v ? `<div class="kv"><h4>${t}</h4><p>${esc(v)}</p></div>` : '');
  const regs = (s.regions || []).filter((r) => r.includes('-')).map(regionName);
  const mine = allMyObs().filter((o) => o.species_id === id && o.review_status !== 'rejected').sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  openSheet(`
    <div class="eyebrow">${dot(s.pack)} ${esc([GROUPS[s.group], s.order, s.family].filter(Boolean).join(' · '))}</div>
    <h2 style="font-size:22px;margin-top:2px">${esc(s.common)}</h2>
    <div class="sci" style="font-size:15px"><i>${esc(s.sci)}</i> ${esc(f?.authority || '')}</div>
    <div class="pills" style="margin-top:8px">${pills(s)}</div>
    ${mine.length ? `<div class="note" style="background:var(--forest-soft)">${I('circle-check')}<span>You have recorded it ${mine.length} time${mine.length > 1 ? 's' : ''}: first ${fmtDate(mine[0].observed_at)}, most recently ${fmtDate(mine[mine.length - 1].observed_at)}.</span></div>` : ''}
    ${s.venom === 'venomous' ? `<div class="safety venom"><b>${I('triangle-alert')} Venomous: medically significant.</b> Do not handle. After a bite: keep the person still, remove rings and tight items, do not cut or suck the wound or apply a tourniquet, and go straight to a hospital with anti-venom. Emergency: 108.</div>` : ''}
    ${s.toxic === 'poisonous' ? `<div class="safety" style="background:#f3e3f7;color:#7b2d8e"><b>${I('skull')} Poisonous secretions.</b> Wash hands after contact; keep pets away.</div>` : ''}
    ${f ? `
      <div class="gallery">${imgs.length ? imgs.map((i) => `<img src="${esc(i.url)}" alt="${esc(s.common)}" title="${esc(i.credit || '')}">`).join('') : mono(s, true)}</div>
      ${imgs.some((i) => i.credit) ? `<p class="tiny muted">Photos: ${imgs.map((i) => esc(i.credit || '')).filter(Boolean).join('; ')}</p>` : ''}
      ${kv('Identification', f.id_notes)}${kv('Size', f.size)}${kv('Habitat', f.habitat)}${kv('Distribution', f.distribution)}${kv('Behaviour & notes', f.behaviour)}${kv('Similar species', f.similar)}
      <div class="kv"><h4>Conservation</h4><p>IUCN: ${esc(IUCN[s.iucn]?.name || s.iucn)} (${esc(s.iucn)})${s.endemic ? ' · Endemic' : ''}${s.sensitive ? ' · Sensitive: public locations are blurred' : ''}</p></div>
      ${kv('References', f.refs)}
      ${regs.length ? `<div class="kv"><h4>On these checklists</h4><p class="small">${regs.map(esc).join(' · ')}</p></div>` : ''}
      <p class="small" style="margin-top:10px"><a href="feedback.html?species=${encodeURIComponent(s.id)}">${I('flag')} Report a mistake on this page</a></p>`
    : `<div class="kv"><h4>IUCN Red List</h4><p>${esc(IUCN[s.iucn]?.name || s.iucn)}</p></div>${packsRequired() ? unlockOffer(s.pack) : ''}`}
    <div class="row" style="margin-top:16px"><button class="btn btn-primary grow" id="sp-rec">${I('plus')} ${SES() ? 'Add to session' : 'Record observation'}</button></div>`);
  $('sp-rec').onclick = () => { closeSheet(); SES() ? openObservation({ session: true, species: id }) : openObservation({ standalone: true, species: id }); };
}

// ── store (pick only the packs you want) ──
function openStore(region = S.region, preselect = []) {
  if (!S.me || S.me.guest) return toast('Sign in first (Profile)');
  const owned = (pack, reg) => S.ents.some((e) => e.pack === pack && (e.region === reg || e.region === reg.split('-')[0]));
  const render = (reg, picked) => {
    const lines = S.packs.map((p) => { let q = null; try { q = U.quoteFrom(S.prices, [{ pack: p.id, region: reg }]); } catch {} return { p, q, own: owned(p.id, reg) }; });
    const total = lines.filter((l) => picked.has(l.p.id) && l.q && !l.own).reduce((s, l) => s + l.q.total, 0);
    openSheet(`<h2>Choose your packs</h2><p class="small muted" style="margin:4px 0 10px">Pay only for the groups you need. A state pack covers that state; the country pack covers all of it.</p>
      <label class="f">Region</label><select id="st-reg">${regionOptions(reg, { kinds: ['country', 'state', 'ut'] })}</select>
      <div style="margin-top:12px">${lines.map(({ p, q, own }) => `<label class="storeitem ${own ? 'owned' : ''}"><input type="checkbox" data-sp="${p.id}" ${picked.has(p.id) && !own ? 'checked' : ''} ${own || !q ? 'disabled' : ''}>
        <span class="gdot" style="--pc:${p.color};width:12px;height:12px"></span><span class="grow"><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.blurb)}</span></span>
        <span class="price">${own ? 'Owned' : q ? U.rupees(q.total) : '—'}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><b class="grow">Total <span class="price">${U.rupees(total)}</span> <span class="small muted">/ 1 year</span></b><button class="btn btn-primary" id="st-pay" ${total ? '' : 'disabled'}>Pay with Razorpay</button></div>
      <p class="tiny muted" style="margin-top:8px">Payments are processed by Razorpay (UPI, cards, net-banking). Access is granted by our server once payment is confirmed.</p>`);
    $('st-reg').onchange = (e) => render(e.target.value, picked);
    $('sheetbody').querySelectorAll('[data-sp]').forEach((c) => (c.onchange = () => { c.checked ? picked.add(c.dataset.sp) : picked.delete(c.dataset.sp); render(reg, picked); }));
    $('st-pay').onclick = async () => {
      const items = [...picked].filter((p) => !owned(p, reg)).map((pack) => ({ pack, region: reg }));
      $('st-pay').disabled = true; $('st-pay').textContent = 'Processing…';
      try { await api.checkout(items); await loadUser(); closeSheet(); toast('Unlocked! Packs are now available offline.'); rerender(); }
      catch (e) { toast(e.message); render(reg, picked); }
    };
  };
  const st = region.split('-').slice(0, 2).join('-');
  render(regionOf(st) ? st : region, new Set(preselect));
}

// ── identify (step-by-step) ──
const COLORS = ['black', 'brown', 'tan', 'grey', 'olive', 'green', 'yellow', 'orange', 'red', 'blue', 'purple', 'pink', 'white'];
const PATTERNS = { plain: 'Plain / uniform', banded: 'Bands or rings', spotted: 'Spots', blotched: 'Large blotches', striped: 'Stripes (lengthwise)', zigzag: 'Zig-zag', checkered: 'Checkered', warty: 'Warty skin', star: 'Star-patterned shell' };
const TIMES = { day: ['sun', 'Day'], dusk: ['sunset', 'Dusk / dawn'], night: ['moon', 'Night'] };
const IDF = { step: 0, pack: null, colors: new Set(), pattern: null, time: null };
function renderIdentify() {
  const el = $('idf'), st = IDF.step;
  const bar = `<div class="steps">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (next = true) => `<div class="row" style="margin-top:16px">${st ? '<button class="btn btn-ghost" id="i-back">Back</button>' : ''}<span class="grow"></span>${next ? '<button class="btn btn-primary" id="i-next">Next</button>' : ''}</div>`;
  if (st === 0) {
    el.innerHTML = `${bar}<h2>What did you see?</h2><p class="small muted">Answer a few questions; we list the most likely species in ${esc(regionName(S.region))}.</p>
      <div class="grid2" style="margin-top:12px">${S.packs.map((p) => `<button class="opt ${IDF.pack === p.id ? 'on' : ''}" data-ip="${p.id}"><span class="e" style="--pc:${p.color}"></span>${esc(p.name)}</button>`).join('')}</div>`;
    el.querySelectorAll('[data-ip]').forEach((b) => (b.onclick = () => { IDF.pack = b.dataset.ip; IDF.step = 1; renderIdentify(); }));
    return;
  }
  const cl = new Set(S.checklist);
  const inPack = S.index.filter((s) => s.pack === IDF.pack && cl.has(s.id));
  const pool = inPack.filter((s) => isUnlocked(s.id)).map((s) => ({ ...s, traits: S.unlocked[s.id].traits || {} }));
  if (!pool.length) {
    el.innerHTML = `${bar}<h2>${esc(packOf(IDF.pack).name)}</h2><p class="muted small">${inPack.length} species on the ${esc(regionName(S.region))} checklist.</p>${packsRequired() ? unlockOffer(IDF.pack) : ''}${nav(false)}`;
  } else if (st === 1) {
    const avail = new Set(pool.flatMap((s) => s.traits.color || []));
    el.innerHTML = `${bar}<h2>Main colours?</h2><p class="small muted">Pick all that apply (or skip).</p>
      <div class="chips" style="flex-wrap:wrap;margin-top:10px">${COLORS.filter((c) => avail.has(c)).map((c) => `<button class="chip ${IDF.colors.has(c) ? 'on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>${nav()}`;
    el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { IDF.colors.has(b.dataset.c) ? IDF.colors.delete(b.dataset.c) : IDF.colors.add(b.dataset.c); renderIdentify(); }));
  } else if (st === 2) {
    const avail = new Set(pool.map((s) => s.traits.pattern));
    el.innerHTML = `${bar}<h2>Pattern?</h2><div class="grid2" style="margin-top:10px">${Object.entries(PATTERNS).filter(([k]) => avail.has(k)).map(([k, l]) => `<button class="opt ${IDF.pattern === k ? 'on' : ''}" data-pt="${k}">${esc(l)}</button>`).join('')}</div>${nav()}`;
    el.querySelectorAll('[data-pt]').forEach((b) => (b.onclick = () => { IDF.pattern = IDF.pattern === b.dataset.pt ? null : b.dataset.pt; renderIdentify(); }));
  } else if (st === 3) {
    el.innerHTML = `${bar}<h2>When did you see it?</h2><div class="grid2" style="margin-top:10px">${Object.entries(TIMES).map(([k, [ic, l]]) => `<button class="opt ${IDF.time === k ? 'on' : ''}" data-t="${k}">${I(ic)}${l}</button>`).join('')}</div>${nav()}`;
    el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { IDF.time = IDF.time === b.dataset.t ? null : b.dataset.t; renderIdentify(); }));
  } else {
    const scored = pool.map((s) => {
      const t = s.traits; let sc = 0;
      IDF.colors.forEach((c) => { if ((t.color || []).includes(c)) sc += 2; });
      if (IDF.pattern && t.pattern === IDF.pattern) sc += 3;
      if (IDF.time && (t.time === IDF.time || t.time === 'any' || (IDF.time === 'dusk' && t.time === 'night'))) sc += 1;
      return { s, sc };
    }).sort((a, b) => b.sc - a.sc);
    const max = Math.max(1, IDF.colors.size * 2 + (IDF.pattern ? 3 : 0) + (IDF.time ? 1 : 0));
    el.innerHTML = `${bar}<h2>Most likely matches</h2><p class="small muted">Ranked by your answers. Always confirm with the ID notes. Never handle a snake to identify it.</p>
      <div class="splist" style="margin-top:10px">${scored.slice(0, 8).map(({ s, sc }) => `<button class="card sp" data-id="${s.id}"><div class="th">${thumb(s)}</div><div class="grow"><div class="nm">${esc(s.common)}</div><div class="sci"><i>${esc(s.sci)}</i></div><div class="pills">${pills(s)}<span class="pill lock">${Math.round((sc / max) * 100)}% match</span></div></div></button>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn btn-ghost" id="i-back">Back</button><span class="grow"></span><button class="btn btn-ghost" id="i-reset">Start over</button></div>`;
    el.querySelector('.splist').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) openSpecies(b.dataset.id); };
    $('i-reset').onclick = () => { Object.assign(IDF, { step: 0, pack: null, colors: new Set(), pattern: null, time: null }); renderIdentify(); };
  }
  $('i-back') && ($('i-back').onclick = () => { IDF.step--; renderIdentify(); });
  $('i-next') && ($('i-next').onclick = () => { IDF.step++; renderIdentify(); });
}

// ═════════════════════════ PROFILE ═════════════════════════
const ROLE_LABEL = { user: 'Observer', reviewer: 'Reviewer', admin: 'Admin (platform owner)' };
async function renderProfile() {
  const el = $('prof'), m = S.me || {};
  const n = outbox().length, st = myStats();
  const theme = U.lsGet('hw_theme', '');
  const ents = S.ents.filter((e) => !e.valid_until || new Date(e.valid_until) > new Date());
  el.innerHTML = `<div class="card pad"><div class="profile-head"><span class="avatar">${esc((m.full_name || m.username || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase())}</span>
      <div class="grow"><h2 style="font-size:19px">${esc(m.full_name || m.username || 'Offline recorder')}</h2><p class="small muted">${m.guest ? 'Not signed in' : `@${esc(m.username)} · ${esc(m.email || '')}`}</p>
      ${m.guest ? '' : `<span class="badge ${m.role === 'user' ? '' : 'ok'}" style="margin-top:4px">${I(m.role === 'user' ? 'user' : 'shield-check')} ${esc(ROLE_LABEL[m.role] || m.role)}</span>`}</div></div>
      <div class="tiles" style="margin-bottom:0"><div class="tile"><b>${st.species}</b><span>Species</span></div><div class="tile"><b>${st.obs}</b><span>Observations</span></div><div class="tile"><b>${st.sessions}</b><span>Sessions</span></div></div></div>
    ${m.guest ? `<button class="btn btn-primary btn-block" id="p-signin" style="margin-top:12px;min-height:50px">${I('user')} Sign in to upload ${n} saved record${n === 1 ? '' : 's'}</button>` : ''}
    <div class="sect"><h3>Sync</h3><span class="small muted">${n ? `${n} waiting` : 'All uploaded'}</span></div>
    <div class="card pad"><div class="row" style="gap:10px"><span class="dot ${!isOnline() ? 'off' : n ? 'pending' : ''}"></span><span class="grow small">${!isOnline() ? 'Offline. Records stay on this phone until you have signal.' : n ? `${n} record(s) waiting to upload.` : 'Everything is uploaded.'}</span>
      ${!m.guest ? `<button class="btn btn-ghost btn-sm" id="p-sync">${I('refresh-cw')} Sync now</button>` : ''}</div>
      ${outbox().filter((x) => x.error).map((x) => `<p class="tiny" style="color:var(--red);margin-top:6px">${I('triangle-alert')} ${esc(x.kind === 'session' ? 'Session' : 'Record')} ${fmtDT(x.queued_at)}: ${esc(x.error)}</p>`).join('')}
      ${!U.storageWorks() ? `<p class="tiny" style="color:var(--red);margin-top:6px">This browser blocks storage (private mode?). Install the app or use a normal window.</p>` : ''}</div>
    ${m.guest ? '' : `<div class="sect"><h3>Account</h3></div>
    <div class="card pad menu">
      <button id="p-edit">${I('pencil')}<span class="grow">Edit profile</span>${I('chevron-right')}</button>
      <button id="p-pw">${I('lock')}<span class="grow">Change password</span>${I('chevron-right')}</button>
      ${packsRequired() ? `<button id="p-store">${I('shopping-bag')}<span class="grow">Species packs<br><span class="tiny muted">${ents.length ? ents.map((e) => `${esc(packOf(e.pack).name)} (${esc(regionName(e.region))})`).join(', ') : 'Recording is free; packs unlock the full guide'}</span></span>${I('chevron-right')}</button>` : ''}
      ${m.role === 'reviewer' || m.role === 'admin' ? `<a href="dashboard/">${I('layout-dashboard')}<span class="grow">Open the ${m.role === 'admin' ? 'Admin' : 'Reviewer'} dashboard<br><span class="tiny muted">Review observations, checklists, species${m.role === 'admin' ? ', users and settings' : ''}</span></span>${I('chevron-right')}</a>`
        : `<button id="p-rev">${I('badge-check')}<span class="grow">Become a reviewer<br><span class="tiny muted" id="p-revst">Experienced herpetologists can apply to verify records</span></span>${I('chevron-right')}</button>`}
    </div>`}
    <div class="sect"><h3>Settings</h3></div>
    <div class="card pad">
      <div class="fld" style="margin-top:0"><label>Default privacy for new observations</label><div class="seg" id="p-priv">${Object.entries(PRIVACY).map(([k, l]) => `<button data-k="${k}" class="${U.lsGet('hw_privacy', 'public') === k ? 'on' : ''}">${esc(l.split(' (')[0])}</button>`).join('')}</div></div>
      <div class="fld"><label>Species names</label><div class="seg" id="p-names">${[['common', 'Common name'], ['sci', 'Scientific name'], ['both', 'Both']].map(([k, l]) => `<button data-k="${k}" class="${nameMode() === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="fld"><label>Distance</label><div class="seg" id="p-units"><button data-k="km" class="${miles() ? '' : 'on'}">Kilometres</button><button data-k="mi" class="${miles() ? 'on' : ''}">Miles</button></div></div>
      <div class="fld"><label>Appearance</label><div class="seg" id="p-theme"><button data-k="" class="${!theme ? 'on' : ''}">System</button><button data-k="light" class="${theme === 'light' ? 'on' : ''}">Light</button><button data-k="dark" class="${theme === 'dark' ? 'on' : ''}">Dark</button></div></div>
    </div>
    <div class="sect"><h3>More</h3></div>
    <div class="card pad menu">
      <a href="index.html">${I('chart-column')}<span class="grow">Website & public report</span>${I('chevron-right')}</a>
      <a href="feedback.html">${I('message-square')}<span class="grow">Send feedback / report a mistake</span>${I('chevron-right')}</a>
      <button id="p-share">${I('share')}<span class="grow">Tell a friend</span>${I('chevron-right')}</button>
      <button id="p-upd">${I('refresh-cw')}<span class="grow">Check for updates<br><span class="tiny muted">Catalogue: ${S.index.length} species · ${S.regions.length} regions${U.lsGet('hw_cat_at', '') ? ' · updated ' + fmtDT(U.lsGet('hw_cat_at', '')) : ''}</span></span>${I('chevron-right')}</button>
      <button data-install>${I('download')}<span class="grow">Install the app on this phone</span>${I('chevron-right')}</button>
      ${m.guest ? '' : `<button id="p-out" style="color:var(--red)">${I('log-out')}<span class="grow">Sign out</span></button>`}
    </div>
    <p class="tiny muted" style="text-align:center;margin:16px 0">${esc(HW.C.APP_NAME)} · ${esc(HW.C.SUPPORT_EMAIL || '')}</p>`;
  $('p-share').onclick = async () => { const url = location.href.split('#')[0]; try { if (navigator.share) await navigator.share({ title: HW.C.APP_NAME, text: 'Record reptiles and amphibians with me on ' + HW.C.APP_NAME, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch {} };
  $('p-upd').onclick = async () => { toast('Checking…'); await loadCatalog(); await loadChecklist(); await loadUser(); if ('serviceWorker' in navigator) (await navigator.serviceWorker.getRegistration())?.update(); toast(isOnline() ? 'Up to date' : 'Offline: try again with signal'); renderProfile(); };
  $('p-signin') && ($('p-signin').onclick = () => show('auth'));
  $('p-sync') && ($('p-sync').onclick = async () => { await syncNow(); await loadMine(); toast(outbox().length ? 'Some records are still waiting' : 'All synced'); renderProfile(); });
  $('p-edit') && ($('p-edit').onclick = editProfile);
  $('p-pw') && ($('p-pw').onclick = askNewPassword);
  $('p-store') && ($('p-store').onclick = () => openStore());
  $('p-out') && ($('p-out').onclick = async () => {
    if ((outbox().length || SES()) && !confirm('Some records are not uploaded yet. They stay on this phone and upload after you sign in again. Sign out?')) return;
    await api.signOut(); S.me = null; liveOff?.(); show('auth'); paintAuthHints();
  });
  $('p-priv').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; U.lsSet('hw_privacy', b.dataset.k); renderProfile(); };
  $('p-names').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { U.lsSet('hw_names', b.dataset.k); renderProfile(); } };
  $('p-units').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { U.lsSet('hw_units', b.dataset.k); renderProfile(); } };
  $('p-theme').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; b.dataset.k ? U.lsSet('hw_theme', b.dataset.k) : localStorage.removeItem('hw_theme'); applyTheme(); renderProfile(); };
  if ($('p-rev')) {
    const req = await api.myAccessRequest().catch(() => null);
    if (req && $('p-revst')) $('p-revst').textContent = req.status === 'pending' ? 'Application sent, waiting for the Admin' : req.status === 'declined' ? 'Your last application was declined. You can apply again.' : 'Approved';
    $('p-rev').onclick = () => {
      if (req?.status === 'pending') return toast('Your application is waiting for the Admin');
      openSheet(`<h2>Apply to be a reviewer</h2><p class="small muted" style="margin:4px 0 10px">Reviewers verify observations, suggest identifications and help maintain checklists. The Admin decides. Only the platform owner is Admin; that role can’t be requested.</p>
        <label class="f" for="rv-note">Your experience</label><textarea id="rv-note" rows="4" maxlength="1000" placeholder="Groups and regions you know well, publications, field years…"></textarea>
        <button class="btn btn-primary btn-block" id="rv-send" style="margin-top:12px">Send application</button>`);
      $('rv-send').onclick = async () => { try { await api.requestAccess($('rv-note').value.trim()); closeSheet(); toast('Application sent'); renderProfile(); } catch (e) { toast(e.message, 6000); } };
    };
  }
}
function editProfile() {
  const m = S.me;
  openSheet(`<h2>Edit profile</h2>
    <div class="fld"><label for="ep-name">Full name</label><input id="ep-name" value="${esc(m.full_name || '')}" maxlength="120"></div>
    <div class="fld"><label for="ep-phone">Phone</label><input id="ep-phone" type="tel" value="${esc(m.phone || '')}" maxlength="30"></div>
    <div class="fld"><label for="ep-reg">Home state</label><select id="ep-reg">${regionOptions(m.home_region, { kinds: ['country', 'state', 'ut'] })}</select></div>
    <button class="btn btn-primary btn-block" id="ep-save" style="margin-top:14px">Save</button>`);
  $('ep-save').onclick = async () => {
    try { S.me = await api.updateProfile({ full_name: $('ep-name').value.trim(), phone: $('ep-phone').value.trim(), home_region: $('ep-reg').value }); closeSheet(); toast('Profile saved'); renderProfile(); }
    catch (e) { toast(HW.isNetError(e) ? 'No connection' : e.message); }
  };
}

// ═════════════════════════ AUTH ═════════════════════════
$('t-in').onclick = () => { $('t-in').classList.add('on'); $('t-up').classList.remove('on'); $('f-in').classList.remove('hidden'); $('f-up').classList.add('hidden'); };
$('t-up').onclick = () => { $('t-up').classList.add('on'); $('t-in').classList.remove('on'); $('f-up').classList.remove('hidden'); $('f-in').classList.add('hidden'); };
async function paintAuthHints() {
  const h = $('ctxhint');
  if (U.isStandalone()) { h.className = 'ctxhint ok ae d2'; h.innerHTML = `${I('badge-check')}<span><b>You’re in the installed app.</b> Sign in once with internet; after that it opens and records with no signal.</span>`; }
  else if (U.isInAppBrowser()) { h.className = 'ctxhint warn ae d2'; h.innerHTML = `${I('triangle-alert')}<span><b>You opened this inside a chat app’s browser</b> (WhatsApp, Instagram…). Data saved here can be lost. Tap ⋮ → <b>Open in Chrome / Safari</b>, then install the app.</span>`; }
  else { h.className = 'ctxhint ae d2'; h.innerHTML = `${I('smartphone')}<span>For field work, <button type="button" class="linkbtn" data-install>install the app</button> and open it from your home screen. It keeps working with no signal.</span>`; }
  const n = outbox().length + (SES() ? 1 : 0);
  $('diag').innerHTML = !U.storageWorks() ? `${I('triangle-alert')} This browser is blocking storage (private mode?). Records can’t be kept offline here.`
    : n ? `${I('shield-check')} ${n} unsynced record(s) are safe on this device and will upload after you sign in.` : '';
  $('offline-go').classList.toggle('hidden', !(!isOnline() || n));
  $('offline-go').innerHTML = `${I('cloud-off')} ${n ? 'Keep recording offline' : 'No signal? Record offline now'}`;
}
$('offline-go').onclick = async () => {
  S.me = { id: 'guest', username: 'offline', full_name: '', role: 'user', status: 'approved', guest: true };
  $('region').innerHTML = regionOptions(S.region); await loadChecklist(); paintSync();
  show(SES() ? 'record' : 'home'); toast('Recording offline. Sign in from Profile when you have signal to upload.', 5000);
};
function askNewPassword() {
  openSheet(`<h3 class="row" style="gap:8px">${I('lock')} Set a new password</h3>
    <p class="small muted" style="margin:4px 0 10px">For ${esc(S.me?.email || 'your account')}. It works for the app and the dashboard.</p>
    <label class="f" for="np1">New password</label><input id="np1" type="password" minlength="6" autocomplete="new-password">
    <label class="f" for="np2">Repeat it</label><input id="np2" type="password" minlength="6" autocomplete="new-password">
    <button class="btn btn-primary btn-block" id="np-save" style="margin-top:14px">Save new password</button>`);
  $('np1').focus();
  $('np-save').onclick = async () => {
    if ($('np1').value !== $('np2').value) return toast('The two passwords don’t match');
    $('np-save').disabled = true;
    try { await api.updatePassword($('np1').value); closeSheet(); toast('Password changed.', 4000); }
    catch (er) { $('np-save').disabled = false; toast(er.message, 5000); }
  };
}
function authNote(html) { const n = $('auth-note'); n.innerHTML = html; n.classList.toggle('hidden', !html); }
function offerResend(email) {
  authNote(`${I('mail')}<span>Didn’t get the e-mail? <button type="button" class="linkbtn" id="resend">Send it again</button></span>`);
  $('resend').onclick = async () => { try { await api.resendConfirmation(email); toast('Confirmation e-mail sent to ' + email, 4000); } catch (er) { toast(er.message, 4000); } };
}
function showSignIn(email) { $('t-in').click(); if (email) $('in-email').value = email; $('in-pw').focus(); }
$('f-in').onsubmit = async (e) => {
  e.preventDefault(); authNote('');
  const email = $('in-email').value.trim();
  try { S.me = await api.signIn(email, $('in-pw').value); await afterLogin(); }
  catch (er) { toast(HW.isNetError(er) ? 'No connection. You can still record offline and sign in later to upload.' : er.message, 5000); if (er.code === 'email_not_confirmed') offerResend(email); paintAuthHints(); }
};
$('f-up').onsubmit = async (e) => {
  e.preventDefault(); authNote('');
  const email = $('up-email').value.trim();
  try {
    S.me = await api.signUp({ full_name: $('up-name').value.trim(), username: $('up-user').value.trim().toLowerCase(), phone: $('up-phone').value.trim(), email, home_region: $('up-region').value, password: $('up-pw').value });
    if (!S.me) { showSignIn(email); toast(`Almost done: confirm the e-mail we sent to ${email}, then sign in.`, 7000); return offerResend(email); }
    await afterLogin();
  } catch (er) { toast(er.message, 6000); if (er.code === 'already_registered') showSignIn(email); }
};
$('g-in').onclick = async () => { try { await api.signInWithGoogle(location.href.split('#')[0]); } catch (er) { toast(er.message, 4000); } };
document.querySelectorAll('[data-eye]').forEach((b) => (b.onclick = () => { const i = $(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; b.style.opacity = i.type === 'text' ? 1 : 0.6; }));
$('forgot').onclick = async () => {
  const em = $('in-email').value.trim();
  if (!em.includes('@')) { $('in-email').focus(); return toast('Type your e-mail address above first, then tap Reset password.'); }
  try { await api.resetPassword(em); authNote(`${I('mail')}<span>If <b>${esc(em)}</b> has an account, a reset link is on its way. Open it on this device to choose a new password. Check spam too.</span>`); }
  catch (er) { toast(er.message, 7000); authNote(`${I('triangle-alert')}<span>${esc(er.message)}</span>`); }
};
async function afterLogin() {
  if (S.me?.home_region && !localStorage.getItem('hw_region')) { S.region = S.me.home_region; U.lsSet('hw_region', S.region); }
  $('region').innerHTML = regionOptions(S.region);
  await Promise.all([loadUser(), loadChecklist(), loadMine()]);
  syncNow(); startLive();
  show(SES() ? 'record' : 'home');
}
function applyTheme() { const t = U.lsGet('hw_theme', ''); t ? document.documentElement.setAttribute('data-theme', t) : document.documentElement.removeAttribute('data-theme'); }

// ═════════════════════════ boot ═════════════════════════
(async function boot() {
  applyTheme();
  $('brand').textContent = HW.C.APP_NAME; document.title = HW.C.APP_NAME + ' Field App'; $('tagline').textContent = HW.C.TAGLINE || '';
  $('auth-app').textContent = $('auth-name').textContent = HW.C.APP_NAME;
  document.querySelectorAll('[data-ic]').forEach((el) => (el.innerHTML = I(el.dataset.ic)));
  document.querySelectorAll('.iconbtn[data-install]').forEach((el) => (el.innerHTML = I('download')));
  await Promise.all(['hw_session', 'hw_outbox'].map((k) => U.durGet(k)));   // re-seed localStorage if the browser cleared it
  await loadCatalog();
  $('region').innerHTML = regionOptions(S.region); $('up-region').innerHTML = regionOptions(S.me?.home_region || S.region, { kinds: ['country', 'state', 'ut'] });
  if (SES()) Geo.start(onSessionFix);                      // a session survives app restarts: keep tracking
  try { S.me = await api.session(); } catch { S.me = null; }
  const linkErr = api.linkError();
  if (!S.me) {
    paintSync(); paintAuthHints(); show('auth');
    if (linkErr) { authNote(`${I('triangle-alert')}<span>${esc(linkErr)}</span>`); toast(linkErr, 7000); }
    return;
  }
  if (api.isRecovery()) { await afterLogin(); return askNewPassword(); }
  await afterLogin();
  const h = location.hash.slice(1);
  if (new URLSearchParams(location.search).get('app') === 'roadkill' && !SES()) { U.lsSet('hw_last_type', 'road'); show('record'); }   // road-kill launcher
  else if (!SES() && VIEWS[h]) show(h);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
if (HW.CONFIGURED) { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.async = true; document.head.appendChild(s); }
