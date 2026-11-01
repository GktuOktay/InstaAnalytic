// InstaAnalytic Köprüsü: Instagram sekmesinde (izole dünya) çalışır.
//
// Yalnızca OKUR ve iletir; Instagram'a hiçbir istek göndermez, sayfada hiçbir şeye tıklamaz.
// - Eklenti açıksa listener.js'i açar, kapalıysa kapatır.
// - Yalnızca kullanıcının kendi profilinde ve gönderi sayfalarında yakalanan yanıtları arka plana iletir.
// - Sayfa ilk açıldığında HTML'e gömülü gönderi verisini de aynı kurallarla bir kez okur.
(() => {
  'use strict';

  const ORIGIN = 'https://www.instagram.com';
  const MAX_CHARS = 8 * 1024 * 1024;
  const POST_PATH = /^\/([\w.]+\/)?(p|reel|tv)\/[\w-]+(\/(liked_by|comments))?\/?$/;
  let cfg = { on: false, username: null };

  // Instagram hesabının sayısal kimliği: oturum çerezi değil, herkese okunur ds_user_id
  function viewerId() {
    const m = document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/);
    return m ? m[1] : null;
  }

  // Yalnızca kendi profil sayfam ve gönderi sayfaları
  function pageAllowed() {
    const path = location.pathname;
    if (POST_PATH.test(path)) return true;
    const me = (cfg.username || '').toLowerCase();
    return !!me && (path.toLowerCase() === `/${me}/` || path.toLowerCase().startsWith(`/${me}/`));
  }

  function forward(payload) {
    chrome.runtime.sendMessage({ type: 'ia-observed', viewer: viewerId(), page: location.href, ...payload })
      .catch(() => { /* eklenti güncellendiyse sessizce geç */ });
  }

  function applyConfig(next) {
    cfg = { on: next && next.on === true, username: (next && next.username) || null };
    window.postMessage({ __ia: 'ia-config', on: cfg.on }, ORIGIN);
  }

  async function loadConfig() {
    try {
      applyConfig(await chrome.runtime.sendMessage({ type: 'ia-config', viewer: viewerId() }));
    } catch {
      applyConfig({ on: false });
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== ORIGIN) return;
    const d = e.data;
    if (!cfg.on || !d || d.__ia !== 'ia-observed' || !pageAllowed()) return;
    if (typeof d.url !== 'string' || !d.url.startsWith(ORIGIN + '/') || typeof d.text !== 'string' || d.text.length > MAX_CHARS) return;
    forward({
      url: d.url, status: Number(d.status) || 0, text: d.text,
      friendly: typeof d.friendly === 'string' ? d.friendly.slice(0, 200) : '',
      variables: typeof d.variables === 'string' ? d.variables.slice(0, 8192) : '',
    });
  });

  // Sayfaya gömülü JSON: yalnızca izinli sayfalarda ve gönderi verisine benzeyenler
  function scanEmbedded() {
    if (!cfg.on || !pageAllowed()) return;
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent || '';
      if (t.length > MAX_CHARS || t.indexOf('"username"') === -1) continue;
      if (t.indexOf('"taken_at') === -1 && t.indexOf('liker') === -1) continue;
      forward({ url: location.href, status: 200, text: t, friendly: '', variables: '' });
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.enabled || changes.profiles)) loadConfig();
  });

  loadConfig().then(() => {
    if (document.readyState === 'complete') scanEmbedded();
    else window.addEventListener('load', scanEmbedded, { once: true });
  });
})();
