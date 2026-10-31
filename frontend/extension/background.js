// InstaAnalytic Köprüsü: arka plan (service worker).
// Ne isteneceğine ve ne zaman isteneceğine sunucu karar verir; burası yalnızca dikkatli bir uygulayıcıdır.
// Döngü chrome.alarms ile döner (service worker her an kapatılabilir, setTimeout'a güvenilmez).
'use strict';

const DEFAULT_APP = 'http://localhost:3002';
const ALARM = 'ia-tick';

// Sunucudaki ALLOWED_PATH ile birebir aynı. Bunun dışındaki her istek reddedilir.
const PATH_RE = /^\/api\/v1\/(feed\/user\/\d+\/\?count=12(&max_id=[\w%.-]+)?|media\/\d+\/likers\/(\?max_id=[\w%.-]+)?|media\/\d+\/comments\/\?can_support_threading=true&permalink_enabled=false(&min_id=[\w%.-]+)?)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IDLE_S = 300;                // son 5 dakikada klavye/fare yoksa "başında değil"
const MIN_GAP_S = 3;               // sunucu ne derse desin iki istek arası en az bu kadar
const INLINE_MAX_S = 25;           // bundan kısa beklemeler aynı tur içinde beklenir (alarm alt sınırı 30 sn)
const MAX_INLINE_STEPS = 12;       // tek turda en çok bu kadar art arda adım, sonra alarma devredilir
const APP_BACKOFF_MIN = [1, 5, 15];
const MAX_BODY_CHARS = 8 * 1024 * 1024;

const WAIT_TEXT = {
  paused: 'Instagram uyarı verdi, toplama durduruldu.',
  stopped: 'Uygulamadan durduruldu.',
  wrong_account: "Instagram'da bu profile ait olmayan bir hesap açık.",
  pacing: 'Sıradaki istek için bekleniyor.',
  daily_cap: 'Bugünlük sınır doldu, yarın devam eder.',
  up_to_date: 'Her şey güncel.',
  no_viewer: 'Instagram hesabı tanınamadı.',
};
const KIND_TEXT = { feed: 'Gönderi listesi okundu', likers: 'Beğenenler okundu', comments: 'Yorumlar okundu' };

class AppDown extends Error {}

// ── Depolama ─────────────────────────────────────────────────────────────────

// Yalnızca bu bilgisayardaki adreslere izin verilir; Instagram verisi başka hiçbir yere gitmez.
function normalizeAppUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function getCfg() {
  const s = await chrome.storage.local.get(['enabled', 'appUrl', 'profiles', 'appFails']);
  return {
    enabled: s.enabled === true,
    appUrl: normalizeAppUrl(s.appUrl) || DEFAULT_APP,
    profiles: s.profiles && typeof s.profiles === 'object' ? s.profiles : {},
    appFails: Number(s.appFails) || 0,
  };
}

function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function setStatus(patch) {
  const { status } = await chrome.storage.local.get('status');
  const next = { ...(status || {}), ...patch, updatedAt: Date.now() };
  if (patch.state && patch.state !== 'warning') next.warningUntil = null;
  await chrome.storage.local.set({ status: next });
  if (patch.state) await updateBadge(next.state);
  return next;
}

// Instagram uyarısı kritik: simgede kırmızı "!" kalır, pencere açılmasa da görünür.
async function updateBadge(state) {
  const warn = state === 'warning';
  await chrome.action.setBadgeText({ text: warn ? '!' : '' });
  if (warn) await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  await chrome.action.setTitle({
    title: warn ? 'InstaAnalytic Köprüsü: Instagram uyarı verdi, toplama durduruldu' : 'InstaAnalytic Köprüsü',
  });
}

// Sunucunun "paused" cevabı: Instagram uyarısı ya da üst üste hata. Kullanıcının kendi durdurması "stopped".
async function setPaused(reason, message, waitS) {
  if (reason === 'paused') {
    await setStatus({ state: 'warning', message: WAIT_TEXT.paused + (message ? ` ${message}` : ''),
      warningUntil: Date.now() + waitS * 1000 });
  } else {
    await setStatus({ state: 'paused', message: (WAIT_TEXT[reason] || 'Bekleniyor.') + (message ? ` ${message}` : '') });
  }
}

async function countRequest() {
  const { status } = await chrome.storage.local.get('status');
  const today = todayKey();
  const count = status && status.todayDate === today ? (Number(status.todayCount) || 0) + 1 : 1;
  await setStatus({ todayDate: today, todayCount: count, lastActionAt: Date.now() });
}

async function setProfile(viewerId, profile) {
  const { profiles } = await chrome.storage.local.get('profiles');
  const map = profiles && typeof profiles === 'object' ? { ...profiles } : {};
  if (profile) map[viewerId] = profile; else delete map[viewerId];
  await chrome.storage.local.set({ profiles: map });
}

// ── Zamanlama ────────────────────────────────────────────────────────────────

async function schedule(seconds) {
  const s = Math.max(MIN_GAP_S, Number(seconds) || 0);
  const minutes = Math.max(0.5, s / 60);
  await chrome.alarms.create(ALARM, { delayInMinutes: minutes });
  await setStatus({ nextRunAt: Date.now() + minutes * 60000 });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Uygulama (localhost) ─────────────────────────────────────────────────────

async function callApp(appUrl, path, body, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: ctrl.signal };
    if (body !== undefined) {
      init.method = 'POST';
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(appUrl + path, init);
    } catch {
      throw new AppDown();
    }
    if (res.status >= 500) throw new AppDown(); // geliştirme vekili arka uç kapalıyken 5xx döner
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function viewerParam(viewerId) {
  const n = Number(viewerId);
  return Number.isSafeInteger(n) ? n : viewerId;
}

// ── Instagram tarafı ─────────────────────────────────────────────────────────

async function readViewer() {
  try {
    const c = await chrome.cookies.get({ url: 'https://www.instagram.com', name: 'ds_user_id' });
    return c && /^\d+$/.test(c.value) ? c.value : null;
  } catch {
    return null;
  }
}

async function instagramTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
  return tabs
    .filter((t) => !t.discarded && t.id !== undefined)
    .sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
}

// İçerik betiği yüklü mü? (eklenti sonradan kurulduysa sekme yenilenene kadar yoktur)
async function reachableTab(tabs) {
  for (const t of tabs) {
    try {
      const r = await chrome.tabs.sendMessage(t.id, { type: 'ia-ping' });
      if (r && r.ok) return t;
    } catch {
      // bu sekmede içerik betiği yok, sıradakine bak
    }
  }
  return null;
}

async function fetchInTab(tabId, path) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'ia-fetch', path });
    if (r && Number.isInteger(r.status) && typeof r.text === 'string') return r;
  } catch {
    // sekme kapandı ya da başka sayfaya geçti
  }
  return { status: 0, text: '' };
}

// ── Tek adım ─────────────────────────────────────────────────────────────────
// Dönen değer: { wait: saniye, inline: aynı tur içinde beklenebilir mi } ya da null (kapalı, alarm yok).

async function step() {
  const cfg = await getCfg();
  if (!cfg.enabled) {
    await chrome.alarms.clear(ALARM);
    await setStatus({ state: 'off', message: 'Kapalı.', nextRunAt: null });
    return null;
  }

  const idle = await chrome.idle.queryState(IDLE_S);
  if (idle !== 'active') {
    await setStatus({ state: 'idle', message: 'Bilgisayar başında olmadığınız için bekleniyor.' });
    return { wait: IDLE_S };
  }

  const tabs = await instagramTabs();
  if (!tabs.length) {
    await setStatus({ state: 'no_tab', message: 'Instagram bir sekmede açık değil. Açtığınızda devam eder.' });
    return { wait: 120 };
  }

  const viewerId = await readViewer();
  if (!viewerId) {
    await setStatus({ state: 'needs_login', message: "Instagram'a giriş yapılmamış." });
    return { wait: 300 };
  }

  const tab = await reachableTab(tabs);
  if (!tab) {
    await setStatus({ state: 'reload_tab', message: 'Instagram sekmesini bir kez yenileyin (eklenti yeni yüklendi).' });
    return { wait: 120 };
  }

  try {
    // Profil: önce kayıtlı eşleşme, yoksa uygulamaya sor
    let profile = cfg.profiles[viewerId] || null;
    if (!profile) {
      const hello = await callApp(cfg.appUrl, `/api/bridge/hello?viewer_id=${encodeURIComponent(viewerId)}`);
      if (hello.status !== 200 || !hello.data || hello.data.app !== 'instaanalytic') {
        await setStatus({ state: 'error', message: 'Bu adreste InstaAnalytic bulunamadı. Uygulama adresini kontrol edin.' });
        return { wait: 900 };
      }
      const matched = hello.data.matched;
      const row = (hello.data.sessions || []).find((s) => s.id === matched);
      if (!matched || !UUID_RE.test(matched)) {
        await setStatus({ state: 'needs_profile', message: 'Bu Instagram hesabının hangi profile ait olduğunu aşağıdan seçin.', profile: null });
        return { wait: 600 };
      }
      profile = { id: matched, username: row ? row.username : null };
      await setProfile(viewerId, profile);
    }
    await setStatus({ profile });

    // Sıradaki iş
    const next = await callApp(cfg.appUrl, '/api/bridge/next', { session_id: profile.id, viewer_id: viewerParam(viewerId) });
    await chrome.storage.local.set({ appFails: 0 });
    if (next.status === 404) {
      await setProfile(viewerId, null); // profil uygulamada silinmiş
      await setStatus({ state: 'needs_profile', message: 'Seçili profil uygulamada bulunamadı. Yeniden seçin.', profile: null });
      return { wait: 60 };
    }
    if (next.status !== 200 || !next.data) {
      await setStatus({ state: 'error', message: `Uygulama beklenmeyen bir yanıt verdi (HTTP ${next.status}).` });
      return { wait: 600 };
    }

    const job = next.data;
    if (job.action === 'wait') {
      const reason = String(job.reason || '');
      const wait = Number(job.wait_s) || 60;
      if (reason === 'paused' || reason === 'stopped') {
        await setPaused(reason, job.message, wait);
      } else {
        const extra = job.message ? ` ${job.message}` : '';
        await setStatus({ state: reason === 'wrong_account' ? 'error' : 'waiting', message: (WAIT_TEXT[reason] || 'Bekleniyor.') + extra });
      }
      // Kısa tempo beklemesi: bir önceki yanıtın hemen ardından geldiyse aynı turda beklenir
      return { wait: reason === 'pacing' ? wait + 1 : wait, inline: reason === 'pacing' };
    }
    if (job.action !== 'fetch') {
      await setStatus({ state: 'error', message: 'Uygulamadan anlaşılmayan bir iş geldi.' });
      return { wait: 600 };
    }
    if (typeof job.path !== 'string' || !PATH_RE.test(job.path)) {
      await setStatus({ state: 'error', message: 'Uygulama izin verilmeyen bir adres istedi; istek yapılmadı.' });
      return { wait: 600 };
    }

    // Instagram isteği: açık sekmenin içinden, kullanıcının kendi oturumuyla. Tekrar denenmez.
    await setStatus({ state: 'working', message: "Instagram'dan okunuyor…" });
    await countRequest();
    const res = await fetchInTab(tab.id, job.path);
    const body = res.text.length > MAX_BODY_CHARS ? '' : res.text;

    // Hesap bu arada değiştiyse sunucu 409 ile reddeder
    const reportViewer = (await readViewer()) || viewerId;
    const rep = await callApp(cfg.appUrl, '/api/bridge/report', {
      session_id: profile.id,
      viewer_id: viewerParam(reportViewer),
      path: job.path,
      status: res.status,
      body,
    }, 60000);

    if (rep.status === 409) {
      const detail = rep.data && typeof rep.data.detail === 'string' ? rep.data.detail : 'Yanıt bekleyen işle eşleşmedi.';
      await setStatus({ state: 'waiting', message: detail });
      return { wait: 60 };
    }
    if (rep.status === 404) {
      await setProfile(viewerId, null);
      await setStatus({ state: 'needs_profile', message: 'Seçili profil uygulamada bulunamadı. Yeniden seçin.', profile: null });
      return { wait: 60 };
    }
    if (rep.status !== 200 || !rep.data) {
      await setStatus({ state: 'error', message: `Uygulama yanıtı kabul etmedi (HTTP ${rep.status}).` });
      return { wait: 600 };
    }

    const out = rep.data;
    const wait = Number(out.wait_s) || 60;
    if (out.action === 'wait') {
      const reason = String(out.reason || '');
      if (reason === 'paused' || reason === 'stopped') await setPaused(reason, out.message, wait);
      else await setStatus({ state: 'waiting', message: (WAIT_TEXT[reason] || 'Bekleniyor.') + (out.message ? ` ${out.message}` : '') });
      return { wait };
    }

    let msg = res.status === 200 ? (KIND_TEXT[job.kind] || 'Okundu') : `Instagram yanıt vermedi (HTTP ${res.status})`;
    if (res.status === 200 && Number.isInteger(out.saved)) msg += ` (${out.saved} kişi)`;
    else if (res.status === 200 && Number.isInteger(out.posts)) msg += ` (${out.posts} gönderi)`;
    await setStatus({ state: 'ok', message: msg + '.' });
    return { wait, inline: true };
  } catch (e) {
    if (!(e instanceof AppDown)) throw e;
    // Uygulama kapalı: 1, 5, 15 dakika aralıklarla tekrar bakılır
    const fails = cfg.appFails + 1;
    await chrome.storage.local.set({ appFails: fails });
    await setStatus({ state: 'app_down', message: 'Uygulama kapalı. Açıldığında kendiliğinden devam eder.' });
    return { wait: APP_BACKOFF_MIN[Math.min(fails, APP_BACKOFF_MIN.length) - 1] * 60 };
  }
}

// ── Tur ──────────────────────────────────────────────────────────────────────

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < MAX_INLINE_STEPS; i++) {
      const r = await step();
      if (!r) return;
      const wait = Math.max(MIN_GAP_S, r.wait);
      if (r.inline && wait < INLINE_MAX_S && i < MAX_INLINE_STEPS - 1) {
        // Service worker beklerken kapanırsa döngü yedek alarmla sürer
        await chrome.alarms.create(ALARM, { delayInMinutes: Math.max(0.5, (wait + 40) / 60) });
        await setStatus({ nextRunAt: Date.now() + wait * 1000 });
        await sleep(wait * 1000);
        continue;
      }
      await schedule(wait);
      return;
    }
    await schedule(30);
  } catch {
    // Beklenmeyen hata: ayrıntı (çerez, yanıt) kaydedilmez
    await setStatus({ state: 'error', message: 'Beklenmeyen bir hata oldu; 5 dakika sonra yeniden denenecek.' });
    await schedule(300);
  } finally {
    running = false;
  }
}

// ── Açılır pencere için yardımcılar ──────────────────────────────────────────

async function helloForPopup() {
  const cfg = await getCfg();
  const viewerId = await readViewer();
  try {
    const q = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
    const r = await callApp(cfg.appUrl, `/api/bridge/hello${q}`);
    if (r.status !== 200 || !r.data || r.data.app !== 'instaanalytic') {
      return { ok: false, error: 'Bu adreste InstaAnalytic bulunamadı.' };
    }
    const sessions = (Array.isArray(r.data.sessions) ? r.data.sessions : [])
      .filter((s) => s && UUID_RE.test(String(s.id)))
      .map((s) => ({ id: s.id, username: s.username || null, source: s.source || null, matches: !!s.matches }));
    return {
      ok: true,
      loggedIn: !!viewerId,
      matched: r.data.matched || null,
      current: viewerId ? cfg.profiles[viewerId] || null : null,
      sessions,
    };
  } catch {
    return { ok: false, error: 'Uygulamaya ulaşılamadı.' };
  }
}

async function chooseProfile(id, username) {
  const viewerId = await readViewer();
  if (!viewerId) return { ok: false, error: "Önce Instagram'a giriş yapın." };
  if (id && !UUID_RE.test(String(id))) return { ok: false, error: 'Geçersiz profil.' };
  // Boş seçim: kayıtlı eşleşme silinir, bir sonraki turda otomatik eşleşmeye bakılır
  await setProfile(viewerId, id ? { id, username: username ? String(username) : null } : null);
  await setStatus({ profile: id ? { id, username: username || null } : null });
  tick();
  return { ok: true };
}

// ── Olaylar ──────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) tick();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Yalnızca eklentinin kendi sayfalarından (açılır pencere); web sayfalarından gelen mesaj kabul edilmez
  if (sender.id !== chrome.runtime.id || sender.tab || !msg || typeof msg !== 'object') return false;
  if (msg.type === 'ia-tick') {
    tick();
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'ia-hello') {
    helloForPopup().then(sendResponse);
    return true;
  }
  if (msg.type === 'ia-set-profile') {
    chooseProfile(msg.id || '', msg.username || '').then(sendResponse);
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) {
    if (changes.enabled.newValue === true) {
      setStatus({ state: 'waiting', message: 'Başlatılıyor…' }).then(tick);
    } else {
      chrome.alarms.clear(ALARM);
      setStatus({ state: 'off', message: 'Kapalı.', nextRunAt: null });
    }
  }
  if (changes.appUrl) {
    chrome.storage.local.set({ appFails: 0 });
    getCfg().then((c) => { if (c.enabled) schedule(30); });
  }
});

// Bekleme sebebi ortadan kalkınca (bilgisayar başına dönüldü, Instagram açıldı) erkenden bak.
// Sunucunun verdiği uzun beklemeler bu yolla kısaltılmaz.
async function wakeIf(states) {
  const cfg = await getCfg();
  if (!cfg.enabled || running) return;
  const { status } = await chrome.storage.local.get('status');
  if (status && states.includes(status.state)) await schedule(30);
}

chrome.idle.setDetectionInterval(IDLE_S);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') wakeIf(['idle']);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url && tab.url.startsWith('https://www.instagram.com/')) {
    wakeIf(['no_tab', 'reload_tab', 'needs_login']);
  }
});

async function ensureLoop() {
  const cfg = await getCfg();
  if (!cfg.enabled) {
    await setStatus({ state: 'off', message: 'Kapalı.', nextRunAt: null });
    return;
  }
  const a = await chrome.alarms.get(ALARM);
  if (!a) await schedule(30);
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(['enabled', 'appUrl']);
  const init = {};
  if (typeof s.enabled !== 'boolean') init.enabled = false; // kullanıcı açana kadar kapalı
  if (!normalizeAppUrl(s.appUrl)) init.appUrl = DEFAULT_APP;
  if (Object.keys(init).length) await chrome.storage.local.set(init);
  await ensureLoop();
});

chrome.runtime.onStartup.addListener(ensureLoop);
