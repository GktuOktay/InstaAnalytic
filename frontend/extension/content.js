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
  let cfg = { on: false, username: null, tools: {} };

  // Yanıtın hangi araca ait olduğu: gönderi listesi, beğenenler ya da yorumlar
  function toolOf(url, friendly) {
    const path = (() => { try { return new URL(url).pathname; } catch { return ''; } })();
    if (/\/api\/v1\/media\/\d+(_\d+)?\/likers\//.test(path) || /liker|likes/i.test(friendly)) return 'likers';
    if (/\/api\/v1\/media\/\d+(_\d+)?\/comments\//.test(path) || /comment/i.test(friendly)) return 'comments';
    return 'posts';
  }

  // Açık Instagram hesabının sayısal kimliği. Önce ds_user_id (oturum çerezi değil); okunamazsa
  // sayfanın kendi gömülü verisindeki kullanıcı kimliği.
  let pageViewer = null;
  function viewerId() {
    const m = document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/);
    if (m) return m[1];
    if (pageViewer) return pageViewer;
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent || '';
      const k = t.match(/"(?:USER_ID|viewerId|viewer_id)":"(\d{3,20})"/);
      if (k && k[1] !== '0') { pageViewer = k[1]; return pageViewer; }
    }
    return null;
  }

  // Yalnızca kendi profil sayfam ve gönderi sayfaları
  function pageAllowed() {
    const path = location.pathname;
    if (POST_PATH.test(path)) return true;
    const me = (cfg.username || '').toLowerCase();
    return !!me && (path.toLowerCase() === `/${me}/` || path.toLowerCase().startsWith(`/${me}/`));
  }

  function forward(payload) {
    const kinds = Object.keys(cfg.tools).filter((k) => cfg.tools[k]);
    chrome.runtime.sendMessage({ type: 'ia-observed', viewer: viewerId(), page: location.href, kinds, ...payload })
      .catch(() => { /* eklenti güncellendiyse sessizce geç */ });
  }

  function applyConfig(next) {
    const tools = (next && next.tools) || {};
    cfg = { on: next && next.on === true, username: (next && next.username) || null, tools };
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
    const friendly = typeof d.friendly === 'string' ? d.friendly : '';
    // Kapalı aracın yanıtı hiç iletilmez (uyarı yanıtları hariç: Instagram uyarısı her zaman bildirilir)
    if (Number(d.status) === 200 && !cfg.tools[toolOf(d.url, friendly)]) return;
    forward({
      url: d.url, status: Number(d.status) || 0, text: d.text,
      friendly: typeof d.friendly === 'string' ? d.friendly.slice(0, 200) : '',
      variables: typeof d.variables === 'string' ? d.variables.slice(0, 8192) : '',
    });
  });

  // Sayfaya gömülü JSON: yalnızca izinli sayfalarda ve gönderi verisine benzeyenler
  function scanEmbedded() {
    if (!cfg.on || !pageAllowed() || !(cfg.tools.posts || cfg.tools.comments)) return;
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent || '';
      if (t.length > MAX_CHARS || t.indexOf('"username"') === -1) continue;
      if (t.indexOf('"taken_at') === -1 && t.indexOf('liker') === -1) continue;
      forward({ url: location.href, status: 200, text: t, friendly: '', variables: '' });
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.enabled || changes.profiles || changes.tools)) loadConfig();
  });

  // Kimlik çoğu zaman sayfa yüklenince okunabilir; o yüzden yükleme bitince ayarı bir kez daha iste
  function onReady() {
    loadConfig().then(scanEmbedded);
  }
  loadConfig();
  if (document.readyState === 'complete') onReady();
  else window.addEventListener('load', onReady, { once: true });
})();
