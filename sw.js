// HerpWatch service worker — offline-first app shell, network-first for data.
const CACHE = 'hw-shell-v8';
const SHELL = ['./', 'index.html', 'app.html', 'app.js', 'admin.html', 'style.css', 'common.js', 'config.js', 'data/seed.js', 'manifest.json', 'assets/icon.svg', 'assets/icons.js', 'install.js', 'assets/hero-herp.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'feedback.html', 'roadkill.html', 'roadkill-manifest.json', 'assets/icon-roadkill-192.png',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hw-shell-') && k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // species photos, calls and papers (public storage): cache-first so a downloaded field guide works with no signal
  if (e.request.method === 'GET' && u.pathname.includes('/storage/v1/object/public/')) {
    e.respondWith(caches.open('hw-media').then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co') || u.hostname.includes('razorpay')) return;   // API: always network
  if (u.hostname.includes('tile.openstreetmap.org') || u.hostname.includes('arcgisonline')) {                          // map tiles: cache as you go
    e.respondWith(caches.open('hw-tiles').then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; })));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
