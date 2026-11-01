// InstaAnalytic Köprüsü: Instagram sekmesinde (izole dünya) çalışır.
//
// Instagram'a kendisi hiçbir istek göndermez; sayfanın indirdiği yanıtları okur ve iletir.
// - Eklenti açıksa listener.js'i açar, kapalıysa kapatır.
// - Yalnızca kullanıcının kendi profilinde ve gönderi sayfalarında yakalanan yanıtları arka plana iletir.
// - Sayfa ilk açıldığında HTML'e gömülü gönderi verisini de aynı kurallarla bir kez okur.
// - Uygulamadan ya da açılır pencereden bir iş başlatıldıysa (yalnızca o işin açtığı sekmede), bir insanın
//   yapacağını yapar: profili sonuna kadar kaydırır, beğenme sayısına tıklayıp listeyi kaydırır ya da
//   "daha fazla yorum" düğmesine basar. Aralarda rastgele bekler.
(() => {
  'use strict';

  const ORIGIN = 'https://www.instagram.com';
  const MAX_CHARS = 8 * 1024 * 1024;
  const POST_PATH = /^\/([\w.]+\/)?(p|reel|tv)\/[\w-]+(\/(liked_by|comments))?\/?$/;
  let cfg = { on: false, username: null, tools: {}, job: null };
  let jobStarted = false;

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
    const job = next && next.job && typeof next.job === 'object' ? next.job : null;
    cfg = { on: next && next.on === true, username: (next && next.username) || null, tools, job };
    window.postMessage({ __ia: 'ia-config', on: cfg.on }, ORIGIN);
    if (job && !jobStarted) { jobStarted = true; runJob(job); }
  }

  // ── İş çalıştırıcı ─────────────────────────────────────────────────────────
  // Yalnızca DOM: kaydırma ve görünür düğmelere tıklama. Her adım arasında insan hızında rastgele bekleme.

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  async function waitFor(find, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const el = find();
      if (el) return el;
      await sleep(300);
    }
    return null;
  }

  // Bir kutuyu (ya da sayfayı) içerik bitene kadar kaydırır: üst üste 3 kez uzamazsa bitti sayılır
  async function scrollToEnd(getBox, maxSteps, pause) {
    let stable = 0;
    for (let i = 0; i < maxSteps && stable < 3; i++) {
      const box = getBox();
      if (!box) break;
      const h = box.scrollHeight;
      box.scrollTo({ top: h, behavior: 'smooth' });
      await sleep(rand(pause[0], pause[1]));
      stable = box.scrollHeight === h ? stable + 1 : 0;   // yeni içerik gelmediyse
      report({ step: i + 1 });
    }
  }

  function scrollableIn(root) {
    for (const el of root.querySelectorAll('div')) {
      const st = getComputedStyle(el);
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) return el;
    }
    return null;
  }

  async function collectPosts() {
    await scrollToEnd(() => document.scrollingElement, 80, [1300, 3000]);
  }

  async function collectLikers(code) {
    const link = await waitFor(() => document.querySelector(`a[href$="/p/${code}/liked_by/"], a[href$="/liked_by/"]`), 12000);
    if (!link) return 'Beğenme sayısı bulunamadı (beğeni sayısı gizli ya da gönderinin beğenisi yok).';
    await sleep(rand(600, 1400));
    link.click();
    const dialog = await waitFor(() => document.querySelector('[role="dialog"]'), 12000);
    if (!dialog) return 'Beğenenler listesi açılmadı.';
    await sleep(rand(1200, 2200));
    // Az beğenili gönderide liste kaydırılabilir olmaz: ilk sayfa zaten kaydedildi
    const box = await waitFor(() => scrollableIn(dialog), 6000);
    if (box) await scrollToEnd(() => box, 120, [900, 2200]);
    return null;
  }

  const MORE_COMMENTS = /load more comments|view more comments|view all|daha fazla yorum|yorumların tümünü|tüm yorumları/i;

  function moreCommentsButton() {
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`;
      const svg = el.querySelector('svg[aria-label]');
      if (MORE_COMMENTS.test(label) || (svg && MORE_COMMENTS.test(svg.getAttribute('aria-label') || ''))) return el;
    }
    return null;
  }

  async function collectComments() {
    await sleep(rand(1500, 2500));
    for (let i = 0; i < 60; i++) {
      const btn = moreCommentsButton();
      if (!btn) break;
      btn.click();
      await sleep(rand(1200, 2600));
      report({ step: i + 1 });
    }
  }

  function report(extra) {
    chrome.runtime.sendMessage({ type: 'ia-job-progress', ...extra }).catch(() => {});
  }

  async function runJob(job) {
    let error = null;
    try {
      await sleep(rand(1500, 3000));                       // sayfa otursun
      if (job.kind === 'posts') await collectPosts();
      else if (job.kind === 'likers') error = await collectLikers(String(job.shortcode || ''));
      else if (job.kind === 'comments') await collectComments();
      await sleep(rand(1500, 2500));                       // son yanıtlar iletilsin
    } catch {
      error = 'Sayfada beklenmeyen bir durum oldu.';
    }
    chrome.runtime.sendMessage({ type: 'ia-job-done', error }).catch(() => {});
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
