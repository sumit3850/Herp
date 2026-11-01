// HerpWatch — local Supabase stand-in FOR TESTS ONLY.
//
// Speaks the parts of the Supabase protocol the apps use (Auth, PostgREST, Storage)
// on top of a real Postgres that has the real schema (supabase/setup.sql) and RLS.
// Every request runs in a transaction as the caller's role (anon / authenticated /
// service_role) with request.jwt.claims set, exactly like PostgREST, so the security
// rules being tested are the real ones.
//
//   DATABASE_URL=postgres://postgres@/hwtest?host=/var/tmp/hwpg&port=5499 node server.mjs
//   → http://localhost:54321   anon key printed on start
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const PORT = +(process.env.PORT || 54321);
const SECRET = process.env.JWT_SECRET || 'local-test-secret-not-for-production-1234567890';
const STORE = path.resolve(process.env.STORAGE_DIR || new URL('./storage', import.meta.url).pathname);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const sent = [];                              // "e-mails" the server would have sent (tests read them)

// ── JWT (HS256) ──
const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (claims) => {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(claims));
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};
const verify = (t) => {
  const [h, p, s] = String(t || '').split('.');
  if (!s || crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url'));
  return c.exp && c.exp < Date.now() / 1000 ? null : c;
};
export const ANON_KEY = sign({ role: 'anon', iss: 'local', iat: 1700000000, exp: 4102444800 });
export const SERVICE_KEY = sign({ role: 'service_role', iss: 'local', iat: 1700000000, exp: 4102444800 });

// ── helpers ──
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD', 'access-control-expose-headers': 'content-range' };
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...cors, ...headers });
  res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const pgErr = (res, e) => {
  const status = e.code === '42501' ? 403 : e.code === '23505' ? 409 : e.code?.startsWith('PGRST2') ? 404 : 400;
  send(res, status, { code: e.code || 'PGRST', message: e.message, details: e.detail || null, hint: e.hint || null });
};
async function asRole(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', $3, true)`,
      [claims.role || 'anon', JSON.stringify(claims), claims.sub || '']);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
const claimsOf = (req) => verify((req.headers.authorization || '').replace(/^Bearer\s+/i, '')) || verify(req.headers.apikey) || { role: 'anon' };

// ── Auth (GoTrue subset) ──
async function initAuth() {
  await pool.query(`alter table auth.users add column if not exists encrypted_password text`);
  await pool.query(`alter table auth.users add column if not exists created_at timestamptz default now()`);
  await pool.query(`alter table auth.users add column if not exists last_sign_in_at timestamptz`);
  fs.mkdirSync(STORE, { recursive: true });
}
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at,
  user_metadata: u.raw_user_meta_data || {}, app_metadata: { provider: 'email', providers: ['email'] }, identities: [{ id: u.id, provider: 'email' }], created_at: u.created_at, updated_at: u.created_at });
const session = (u) => {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    refresh_token: sign({ sub: u.id, typ: 'refresh', iat: now, exp: now + 86400 * 30 }), user: userJson(u) };
};
const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
async function auth(req, res, route, url) {
  const body = req.method === 'GET' ? {} : JSON.parse((await readBody(req)).toString() || '{}');
  if (route === 'settings') return send(res, 200, { external: { email: true, google: false }, disable_signup: false, mailer_autoconfirm: true });
  if (route === 'signup') {
    if (!body.password || body.password.length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
    const ex = await pool.query('select * from auth.users where lower(email) = lower($1)', [body.email]);
    if (ex.rows[0]) return send(res, 200, { ...userJson(ex.rows[0]), identities: [] });          // like Supabase: existing e-mail hidden
    const r = await pool.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data, aud, role, email_confirmed_at)
      values ($1, crypt($2, gen_salt('bf')), $3, 'authenticated', 'authenticated', now()) returning *`, [body.email, body.password, body.data || {}]);
    return send(res, 200, session(r.rows[0]));
  }
  if (route === 'token') {
    const grant = url.searchParams.get('grant_type');
    let u;
    if (grant === 'password') {
      u = (await pool.query(`select * from auth.users where lower(email) = lower($1) and encrypted_password = crypt($2, encrypted_password)`, [body.email, body.password])).rows[0];
      if (!u) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
    } else if (grant === 'refresh_token') {
      const c = verify(body.refresh_token); if (!c || c.typ !== 'refresh') return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      u = (await pool.query('select * from auth.users where id = $1', [c.sub])).rows[0];
    } else return authErr(res, 400, 'unsupported_grant_type', 'unsupported grant');
    await pool.query('update auth.users set last_sign_in_at = now() where id = $1', [u.id]);
    return send(res, 200, session(u));
  }
  const c = claimsOf(req);
  if (route === 'user') {
    if (!c.sub) return authErr(res, 401, 'no_authorization', 'This endpoint requires a Bearer token');
    if (req.method === 'PUT') {
      if (body.password) await pool.query(`update auth.users set encrypted_password = crypt($2, gen_salt('bf')) where id = $1`, [c.sub, body.password]);
      if (body.data) await pool.query(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $2 where id = $1`, [c.sub, body.data]);
    }
    const u = (await pool.query('select * from auth.users where id = $1', [c.sub])).rows[0];
    return u ? send(res, 200, userJson(u)) : authErr(res, 404, 'user_not_found', 'User not found');
  }
  if (route === 'logout') { res.writeHead(204, cors); return res.end(); }
  if (route === 'recover' || route === 'resend' || route === 'otp') { sent.push({ type: route, email: body.email, at: Date.now() }); return send(res, 200, {}); }
  return authErr(res, 404, 'not_found', 'not implemented in local test server');
}

// ── PostgREST subset ──
const fkCache = new Map();
async function childFk(client, parent, child) {
  const k = parent + '>' + child;
  if (!fkCache.has(k)) {
    const r = await client.query(`select a.attname as col, af.attname as ref from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass limit 1`, ['public.' + child, 'public.' + parent]);
    fkCache.set(k, r.rows[0] || null);
  }
  return fkCache.get(k);
}
function splitTop(s) {   // split on commas not inside parentheses
  const out = []; let d = 0, cur = '';
  for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur) out.push(cur); return out;
}
async function selectList(client, table, sel, alias = 't') {
  const parts = [];
  for (const raw of splitTop(sel || '*')) {
    const item = raw.trim(); if (!item) continue;
    const m = item.match(/^(?:(\w+):)?(\w+)\((.*)\)$/);
    if (m) {                                        // one-to-many embed, e.g. sightings(*) or records:roadkill_records(id,count)
      const [, as, child, inner] = m;
      const fk = await childFk(client, table, child);
      if (!fk) throw Object.assign(new Error(`Could not find a relationship between '${table}' and '${child}'`), { code: 'PGRST200' });
      const cols = inner.trim() === '*' ? 'c.*' : splitTop(inner).map((x) => { const [k, col] = x.includes(':') ? x.split(':') : [x, x]; return `c.${q(col.trim())} as ${q(k.trim())}`; }).join(', ');
      parts.push(`(select coalesce(json_agg(e), '[]') from (select ${cols} from public.${q(child)} c where c.${q(fk.col)} = ${alias}.${q(fk.ref)}) e) as ${q(as || child)}`);
    } else if (item === '*') parts.push(`${alias}.*`);
    else { const [a, b] = item.includes(':') ? item.split(':') : [item, item]; parts.push(`${alias}.${q(b.split('::')[0])} as ${q(a)}`); }
  }
  return parts;
}
function where(params, values, alias = 't') {
  const conds = [];
  const one = (col, expr) => {
    const m = expr.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s); if (!m) return null;
    const [, not, op, v] = m; const c = `${alias}.${q(col)}`;
    let sql;
    if (op === 'is') sql = `${c} is ${v === 'null' ? 'null' : v === 'true' ? 'true' : 'false'}`;
    else if (op === 'in') { values.push(v.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''))); sql = `${c}::text = any($${values.length}::text[])`; }
    else { values.push(op.endsWith('like') ? v.replace(/\*/g, '%') : v); const o = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[op]; sql = `${c} ${o} $${values.length}`; }
    return not ? `not (${sql})` : sql;
  };
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') { const ors = splitTop(v.replace(/^\(|\)$/g, '')).map((x) => { const i = x.indexOf('.'); return one(x.slice(0, i), x.slice(i + 1)); }).filter(Boolean); if (ors.length) conds.push(`(${ors.join(' or ')})`); continue; }
    const s = one(k, v); if (s) conds.push(s);
  }
  return conds.length ? ' where ' + conds.join(' and ') : '';
}
const orderBy = (o) => (!o ? '' : ' order by ' + o.split(',').map((p) => { const [c, dir, nulls] = p.split('.'); return `t.${q(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls ? ' ' + nulls.replace('nulls', 'nulls ') : ''}`; }).join(', '));

async function rest(req, res, name, url) {
  const claims = claimsOf(req), params = [...url.searchParams.entries()], sel = url.searchParams.get('select');
  const prefer = req.headers.prefer || '', wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object');
  const body = req.method === 'GET' || req.method === 'DELETE' ? null : JSON.parse((await readBody(req)).toString() || 'null');
  try {
    const out = await asRole(claims, async (c) => {
      if (name.startsWith('rpc/')) {
        const fn = name.slice(4);
        const sig = (await c.query(`select p.proretset, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`, [fn])).rows[0];
        if (!sig) throw Object.assign(new Error(`Could not find the function public.${fn} in the schema cache`), { code: 'PGRST202' });
        const args = [], vals = [];
        (sig.proargnames || []).forEach((a, i) => { if (body && a in body) { vals.push(body[a] !== null && typeof body[a] === 'object' ? JSON.stringify(body[a]) : body[a]); args.push(`${q(a)} => $${vals.length}::${sig.types[i]}`); } });
        const call = `public.${q(fn)}(${args.join(', ')})`;
        const r = sig.proretset ? await c.query(`select coalesce(jsonb_agg(to_jsonb(t)), '[]') as v from ${call} t`, vals) : await c.query(`select to_jsonb(${call}) as v`, vals);
        return { status: 200, data: r.rows[0].v };
      }
      const table = `public.${q(name)}`, vals = [];
      if (req.method === 'GET') {
        const cols = (await selectList(c, name, sel)).join(', ');
        const lim = url.searchParams.get('limit'), off = url.searchParams.get('offset');
        const sql = `select ${cols} from ${table} t${where(params, vals)}${orderBy(url.searchParams.get('order'))}${lim ? ' limit ' + (+lim) : ''}${off ? ' offset ' + (+off) : ''}`;
        const r = await c.query(`select coalesce(json_agg(x), '[]') as v from (${sql}) x`, vals);
        let count = null;
        if (/count=exact/.test(prefer)) count = +(await c.query(`select count(*) from ${table} t${where(params, [])}`, [])).rows[0]?.count || r.rows[0].v.length;
        return { status: 200, data: r.rows[0].v, count };
      }
      const returning = /return=representation/.test(prefer) ? ` returning to_jsonb(${table.split('.')[1]}.*) as v` : '';
      if (req.method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        if (!rows.length) return { status: 201, data: [] };
        const colsAll = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const tuples = rows.map((r) => '(' + colsAll.map((k) => { const v = r[k]; vals.push(v === undefined ? null : v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return `$${vals.length}`; }).join(',') + ')');
        const types = (await c.query(`select attname, format_type(atttypid, atttypmod) as t from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped`, [table])).rows;
        const typeOf = Object.fromEntries(types.map((x) => [x.attname, x.t]));
        let sql = `insert into ${table} (${colsAll.map(q).join(',')}) select ${colsAll.map((k) => `v.${q(k)}::${typeOf[k] || 'text'}`).join(',')} from (values ${tuples.join(',')}) v(${colsAll.map(q).join(',')})`;
        if (/resolution=merge-duplicates/.test(prefer)) {
          const key = url.searchParams.get('on_conflict') || (await c.query(`select string_agg(a.attname, ',') as k from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary`, [table])).rows[0].k;
          const upd = colsAll.filter((k) => !key.split(',').includes(k));
          sql += ` on conflict (${key.split(',').map(q).join(',')}) do ${upd.length ? 'update set ' + upd.map((k) => `${q(k)} = excluded.${q(k)}`).join(', ') : 'nothing'}`;
        } else if (/resolution=ignore-duplicates/.test(prefer)) sql += ' on conflict do nothing';
        const r = await c.query(sql + returning, vals);
        return { status: 201, data: returning ? r.rows.map((x) => x.v) : null };
      }
      if (req.method === 'PATCH') {
        const types = (await c.query(`select attname, format_type(atttypid, atttypmod) as t from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped`, [table])).rows;
        const typeOf = Object.fromEntries(types.map((x) => [x.attname, x.t]));
        const sets = Object.entries(body).map(([k, v]) => { vals.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return `${q(k)} = $${vals.length}::${typeOf[k] || 'text'}`; });
        const r = await c.query(`update ${table} t set ${sets.join(', ')}${where(params, vals)}${returning.replace(table.split('.')[1], 't')}`, vals);
        return { status: returning ? 200 : 204, data: returning ? r.rows.map((x) => x.v) : null };
      }
      if (req.method === 'DELETE') {
        const r = await c.query(`delete from ${table} t${where(params, vals)}${returning.replace(table.split('.')[1], 't')}`, vals);
        return { status: returning ? 200 : 204, data: returning ? r.rows.map((x) => x.v) : null };
      }
      return { status: 405, data: { message: 'method not allowed' } };
    });
    let data = out.data;
    if (wantsObject && Array.isArray(data)) {
      if (data.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${data.length} rows` });
      data = data[0];
    }
    const h = out.count != null ? { 'content-range': `0-${Math.max(0, (data?.length || 1) - 1)}/${out.count}` } : {};
    if (out.status === 204 || data === null && req.method !== 'GET' && !name.startsWith('rpc/')) { res.writeHead(out.status === 201 ? 201 : 204, { ...cors, ...h }); return res.end(); }
    return send(res, out.status, data, h);
  } catch (e) { return pgErr(res, e); }
}

// ── Storage subset (public buckets) ──
async function storage(req, res, rest_) {
  const m = rest_.match(/^object\/(public\/)?([^/]+)\/(.+)$/);
  if (!m) return send(res, 404, { message: 'not found' });
  const [, pub, bucket, key] = m, file = path.join(STORE, bucket, decodeURIComponent(key));
  if (!file.startsWith(STORE)) return send(res, 400, { message: 'bad path' });
  if (req.method === 'GET') {
    if (!fs.existsSync(file)) return send(res, 404, { message: 'Object not found' });
    const ext = path.extname(file).slice(1).toLowerCase(); const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf' };
    res.writeHead(200, { ...cors, 'content-type': types[ext] || 'application/octet-stream' }); return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const c = claimsOf(req);
    if (!c.sub && c.role !== 'service_role') return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (bucket === 'photos' && c.role !== 'service_role' && !decodeURIComponent(key).startsWith(c.sub + '/'))
      return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });   // mirrors the photos policy
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let body = await readBody(req);
    const ct = req.headers['content-type'] || '';
    const bm = ct.match(/multipart\/form-data;\s*boundary=(.+)$/);
    if (bm) {   // supabase-js sends Blobs as multipart: keep only the file part, like the real Storage API
      const boundary = Buffer.from('--' + bm[1].replace(/^"|"$/g, ''));
      let at = 0; const parts = [];
      for (let i; (i = body.indexOf(boundary, at)) !== -1; at = i + boundary.length) parts.push(i);
      for (let k = 0; k + 1 < parts.length; k++) {
        const chunk = body.subarray(parts[k] + boundary.length + 2, parts[k + 1] - 2);
        const h = chunk.indexOf('\r\n\r\n');
        if (h > 0 && /filename=/.test(chunk.subarray(0, h).toString())) { body = chunk.subarray(h + 4); break; }
      }
    }
    fs.writeFileSync(file, body);
    return send(res, 200, { Key: `${bucket}/${key}`, Id: crypto.randomUUID() });
  }
  return send(res, 405, { message: 'method not allowed' });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/__test/sent') return send(res, 200, sent);
    let m;
    if ((m = url.pathname.match(/^\/auth\/v1\/(\w+)/))) return await auth(req, res, m[1], url);
    if ((m = url.pathname.match(/^\/rest\/v1\/(.+)$/))) return await rest(req, res, m[1], url);
    if ((m = url.pathname.match(/^\/storage\/v1\/(.+)$/))) return await storage(req, res, m[1]);
    if (url.pathname.startsWith('/realtime/')) { res.writeHead(404, cors); return res.end(); }
    return send(res, 404, { message: 'not found' });
  } catch (e) { console.error(e); return send(res, 500, { message: e.message }); }
});
await initAuth();
server.listen(PORT, () => console.log(`local supabase on http://localhost:${PORT}\nANON_KEY=${ANON_KEY}`));
