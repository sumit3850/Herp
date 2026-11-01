/* HerpWatch — "Install app" support (PWA), shared by the website and the field app.
 *
 * Any element with [data-install] becomes an install button:
 *   • Android / desktop Chrome & Edge → the browser's native install prompt
 *   • iPhone / iPad (Safari has no prompt) → step-by-step "Add to Home Screen" help
 *   • already running as an installed app → the button hides itself
 */
(function () {
  let deferred = null;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const icon = (n) => (window.HWI ? window.HWI(n) : '');

  function update() {
    document.querySelectorAll('[data-install]').forEach((el) => { el.hidden = isStandalone(); });
  }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; update(); });
  addEventListener('appinstalled', () => { deferred = null; update(); });

  function help() {
    const steps = isIOS
      ? [['share', 'Tap the <b>Share</b> button in Safari’s toolbar.'], ['square-plus', 'Scroll down and tap <b>Add to Home Screen</b>.'], ['check', 'Tap <b>Add</b>. HerpWatch opens full-screen and works offline.']]
      : /Firefox/i.test(ua)
        ? [['info', 'Firefox on desktop can’t install web apps.'], ['monitor-smartphone', 'Open this page in <b>Chrome</b> or <b>Edge</b>, or on your phone, to install it.']]
        : [['download', 'Click the <b>install icon</b> at the right end of the address bar, or open the browser menu (⋮) and choose <b>Install HerpWatch</b> / <b>Add to Home screen</b>.'], ['check', 'HerpWatch then opens in its own window and works offline.']];
    const wrap = document.createElement('div');
    wrap.className = 'hw-install-modal';
    wrap.innerHTML = `<div class="hw-im-card" role="dialog" aria-modal="true" aria-labelledby="hw-im-t">
      <button class="hw-im-x" aria-label="Close">${icon('x')}</button>
      <div class="hw-im-head"><img src="${document.querySelector('link[rel=apple-touch-icon]')?.href || 'assets/icon-192.png'}" alt="" width="48" height="48"><div><h3 id="hw-im-t">Install HerpWatch</h3><p>Free · works offline · no app store needed</p></div></div>
      <ol>${steps.map(([i, t]) => `<li><span>${icon(i)}</span><p>${t}</p></li>`).join('')}</ol>
      <button class="hw-im-ok">Got it</button></div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.hw-im-x,.hw-im-ok')) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(wrap);
    wrap.querySelector('.hw-im-ok').focus();
  }

  async function prompt() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null; update();
      return choice?.outcome;
    }
    help();
  }

  document.addEventListener('click', (e) => { const b = e.target.closest('[data-install]'); if (b) { e.preventDefault(); prompt(); } });
  document.addEventListener('DOMContentLoaded', update);
  update();

  const css = document.createElement('style');
  css.textContent = `.hw-install-modal{position:fixed;inset:0;z-index:1000;background:rgba(10,20,14,.55);backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px;animation:hwFade .15s ease-out}
.hw-im-card{position:relative;width:min(420px,100%);background:var(--surface,#fff);color:var(--ink,#16231c);border:1px solid var(--line,#e3e0d5);border-radius:18px;padding:22px;box-shadow:0 24px 60px -20px rgba(0,0,0,.45)}
.hw-im-x{position:absolute;right:12px;top:12px;width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:var(--ink-soft,#56685d)}
.hw-im-x:hover{background:var(--surface-2,#f8f7f2)}
.hw-im-head{display:flex;gap:14px;align-items:center;margin-bottom:14px}.hw-im-head img{border-radius:12px}
.hw-im-head h3{font-size:18px;font-weight:650}.hw-im-head p{font-size:13px;color:var(--ink-soft,#56685d)}
.hw-install-modal ol{list-style:none;display:flex;flex-direction:column;gap:12px;margin:6px 0 18px;padding:0}
.hw-install-modal li{display:flex;gap:12px;align-items:flex-start;font-size:14.5px;line-height:1.45}
.hw-install-modal li span{flex-shrink:0;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--forest-soft,#e3efe6);color:var(--forest-2,#2f7d4f)}
.hw-install-modal .ic{width:18px;height:18px}
.hw-im-ok{width:100%;min-height:44px;border-radius:11px;background:var(--forest-2,#2f7d4f);color:#fff;font-weight:600;font-size:15px}
@keyframes hwFade{from{opacity:0}}`;
  document.head.appendChild(css);

  window.HWInstall = { prompt, update, isStandalone, canPrompt: () => !!deferred };
})();
