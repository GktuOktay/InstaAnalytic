// InstaAnalytic Köprüsü: arka plan (service worker).
//
// Yalnızca iletir: Instagram sekmesinin zaten indirdiği yanıtları bu bilgisayardaki uygulamaya gönderir.
// Instagram'a hiçbir istek göndermez, çerez okumaz. Neyin kaydedileceğine, uyarının ne anlama geldiğine
// ve kullanıcıya ne söyleneceğine uygulama karar verir; eklenti yalnızca uygulamanın cevabını gösterir.
'use strict';

const DEFAULT_APP = 'http://localhost:3002';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWER_RE = /^\d{1,20}$/;
const MAX_BODY_CHARS = 8 * 1024 * 1024;
const MAX_QUEUE = 20;            // uygulama yavaşsa bekleyen yanıt birikmesin; fazlası atılır

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
  const s = await chrome.storage.local.get(['enabled', 'appUrl', 'profiles', 'lastViewer']);
  return {
    enabled: s.enabled === true,
    appUrl: normalizeAppUrl(s.appUrl) || DEFAULT_APP,
    profiles: s.profiles && typeof s.profiles === 'object' ? s.profiles : {},
    lastViewer: VIEWER_RE.test(String(s.lastViewer || '')) ? String(s.lastViewer) : null,
  };
}

function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function setStatus(patch) {
  const { status } = await chrome.storage.local.get('status');
  const next = { ...(status || {}), ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ status: next });
  await updateBadge(next);
  return next;
}

// Instagram uyarısı kritik: süre bitene kadar simgede kırmızı "!" kalır.
async function updateBadge(s) {
  const warn = !!(s && s.warningUntil && s.warningUntil > Date.now());
  await chrome.action.setBadgeText({ text: warn ? '!' : '' });
  if (warn) await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  await chrome.action.setTitle({
    title: warn ? 'InstaAnalytic Köprüsü: Instagram uyarı verdi' : 'InstaAnalytic Köprüsü',
  });
}

async function setProfile(viewerId, profile) {
  const { profiles } = await chrome.storage.local.get('profiles');
  const map = profiles && typeof profiles === 'object' ? { ...profiles } : {};
  if (profile) map[viewerId] = profile; else delete map[viewerId];
  await chrome.storage.local.set({ profiles: map });
}

async function countSaved(result) {
  const { status } = await chrome.storage.local.get('status');
  const today = todayKey();
  const same = status && status.todayDate === today;
  const posts = (same ? Number(status.todayPosts) || 0 : 0) + (result.likers > 0 ? 1 : 0);
  const people = (same ? Number(status.todayPeople) || 0 : 0) + (Number(result.likers) || 0);
  await setStatus({ todayDate: today, todayPosts: posts, todayPeople: people, lastSavedAt: Date.now() });
}

// ── Uygulama (localhost) ─────────────────────────────────────────────────────

async function callApp(appUrl, path, body, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = { signal: ctrl.signal, credentials: 'omit', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(appUrl + path, init);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// ID büyükse metin olarak gönderilir (JS sayısında hassasiyet kaybı olmasın)
function viewerParam(id) {
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : id;
}

async function resolveProfile(cfg, viewerId) {
  const known = cfg.profiles[viewerId];
  if (known) return known;
  const hello = await callApp(cfg.appUrl, `/api/bridge/hello?viewer_id=${encodeURIComponent(viewerId)}`);
  if (hello.status === 0) {
    await setStatus({ state: 'app_down', message: 'Uygulama kapalı. Açınca kayıt devam eder.' });
    return null;
  }
  if (hello.status !== 200 || !hello.data || hello.data.app !== 'instaanalytic') {
    await setStatus({ state: 'error', message: 'Bu adreste InstaAnalytic bulunamadı. Uygulama adresini kontrol edin.' });
    return null;
  }
  const matched = hello.data.matched;
  if (!matched || !UUID_RE.test(matched)) {
    await setStatus({ state: 'needs_profile', message: 'Bu Instagram hesabının hangi profile ait olduğunu aşağıdan seçin.', profile: null });
    return null;
  }
  const row = (hello.data.sessions || []).find((s) => s.id === matched);
  const profile = { id: matched, username: row ? row.username : null };
  await setProfile(viewerId, profile);
  return profile;
}

// ── İçerik betiği için ayar ──────────────────────────────────────────────────

async function configFor(viewer) {
  const cfg = await getCfg();
  if (!cfg.enabled || !VIEWER_RE.test(String(viewer || ''))) return { on: false };
  await chrome.storage.local.set({ lastViewer: String(viewer) });
  const profile = await resolveProfile(cfg, String(viewer));
  if (!profile) return { on: false };
  return { on: true, username: profile.username || null };
}

// ── Gözlem ───────────────────────────────────────────────────────────────────

let chain = Promise.resolve();
let pending = 0;

async function handleObserved(msg) {
  const cfg = await getCfg();
  if (!cfg.enabled || !VIEWER_RE.test(String(msg.viewer || ''))) return;
  const viewerId = String(msg.viewer);
  const profile = await resolveProfile(cfg, viewerId);
  if (!profile) return;

  // Uygulamanın beklediği biçim: yalnızca sorgu adı ve değişkenler (oturum anahtarı yok)
  const req = new URLSearchParams();
  if (msg.friendly) req.set('fb_api_req_friendly_name', msg.friendly);
  if (msg.variables) req.set('variables', msg.variables);

  const rep = await callApp(cfg.appUrl, '/api/bridge/observe', {
    session_id: profile.id,
    viewer_id: viewerParam(viewerId),
    url: msg.url,
    page_url: msg.page || '',
    req_body: req.toString(),
    status: msg.status,
    body: msg.text,
  }, 60000);

  if (rep.status === 0) {
    await setStatus({ state: 'app_down', message: 'Uygulama kapalı. Açınca kayıt devam eder.' });
    return;
  }
  if (rep.status === 404) {
    await setProfile(viewerId, null); // profil uygulamada silinmiş
    await setStatus({ state: 'needs_profile', message: 'Seçili profil uygulamada bulunamadı. Yeniden seçin.', profile: null });
    return;
  }
  if (rep.status === 409) {
    const detail = rep.data && typeof rep.data.detail === 'string' ? rep.data.detail : "Instagram'da başka bir hesap açık.";
    await setStatus({ state: 'error', message: detail });
    return;
  }
  if (rep.status !== 200 || !rep.data) return; // tek bir yanıt kabul edilmediyse dinlemeye devam

  const r = rep.data;
  const until = r.paused_until ? Date.parse(r.paused_until) : null;
  if (until && until > Date.now()) {
    // Metni uygulama belirler (son kullanıcı dili)
    await setStatus({ state: 'warning', profile, message: String(r.message || 'Instagram uyarı verdi.'), warningUntil: until });
    return;
  }
  if (r.stopped) {
    await setStatus({ state: 'paused', profile, message: 'Bu profil için uygulamadan durduruldu.', warningUntil: null });
    return;
  }
  if (r.likers || r.comments || r.posts) {
    const parts = [];
    if (r.posts) parts.push(`${r.posts} gönderi`);
    if (r.likers) parts.push(`${r.likers} beğenen`);
    if (r.comments) parts.push(`${r.comments} yorum`);
    await setStatus({ state: 'ok', profile, message: `Kaydedildi: ${parts.join(', ')}.`, warningUntil: null });
    await countSaved(r);
  } else {
    const { status } = await chrome.storage.local.get('status');
    if (!status || ['needs_login', 'app_down', 'off', 'error', 'warning'].includes(status.state)) {
      await setStatus({ state: 'listening', profile, message: 'Dinliyor.', warningUntil: null });
    }
  }
}

function enqueue(msg) {
  if (pending >= MAX_QUEUE) return;
  pending += 1;
  chain = chain.then(() => handleObserved(msg)).catch(() => {}).finally(() => { pending -= 1; });
}

// ── Açılır pencere için yardımcılar ──────────────────────────────────────────

async function helloForPopup() {
  const cfg = await getCfg();
  const viewerId = cfg.lastViewer;
  const q = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
  const r = await callApp(cfg.appUrl, `/api/bridge/hello${q}`);
  if (r.status === 0) return { ok: false, error: 'Uygulamaya ulaşılamadı. Açık mı?' };
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
}

// Uygulamadaki durum (ör. bekleyen uyarı) açılır pencereye ve simgeye yansısın
async function refreshFromApp() {
  const cfg = await getCfg();
  const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
  if (!profile) return;
  const r = await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/status`);
  if (r.status !== 200 || !r.data) return;
  const until = r.data.paused_until ? Date.parse(r.data.paused_until) : null;
  if (until && until > Date.now()) {
    await setStatus({ state: 'warning', profile, message: String(r.data.paused_message || 'Instagram uyarı verdi.'), warningUntil: until });
  } else {
    const { status } = await chrome.storage.local.get('status');
    if (status && status.state === 'warning') await setStatus({ state: 'listening', message: 'Dinliyor.', warningUntil: null });
  }
}

async function chooseProfile(id, username) {
  const { lastViewer } = await getCfg();
  if (!lastViewer) return { ok: false, error: "Önce Instagram'ı bir sekmede açın." };
  if (id && !UUID_RE.test(String(id))) return { ok: false, error: 'Geçersiz profil.' };
  await setProfile(lastViewer, id ? { id, username: username ? String(username) : null } : null);
  await setStatus({ profile: id ? { id, username: username || null } : null, state: 'listening', message: 'Dinliyor.' });
  return { ok: true };
}

// ── Olaylar ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return false;
  const fromInstagram = !!(sender.tab && String(sender.tab.url || '').startsWith('https://www.instagram.com/'));

  if (msg.type === 'ia-config') {
    if (!fromInstagram) return false;
    configFor(msg.viewer).then(sendResponse, () => sendResponse({ on: false }));
    return true;
  }
  if (msg.type === 'ia-observed') {
    if (!fromInstagram) return false;
    if (typeof msg.url !== 'string' || !msg.url.startsWith('https://www.instagram.com/')) return false;
    if (typeof msg.text !== 'string' || msg.text.length > MAX_BODY_CHARS) return false;
    enqueue(msg);
    return false;
  }

  // Aşağıdakiler yalnızca eklentinin kendi açılır penceresinden
  if (sender.tab) return false;
  if (msg.type === 'ia-hello') {
    helloForPopup().then(sendResponse);
    return true;
  }
  if (msg.type === 'ia-refresh') {
    refreshFromApp().finally(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'ia-set-profile') {
    chooseProfile(msg.id || '', msg.username || '').then(sendResponse);
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabled) return;
  if (changes.enabled.newValue === true) setStatus({ state: 'listening', message: 'Dinliyor.' });
  else setStatus({ state: 'off', message: 'Kapalı.' });
});

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(['enabled', 'appUrl']);
  const init = {};
  if (typeof s.enabled !== 'boolean') init.enabled = false; // kullanıcı açana kadar kapalı
  if (!normalizeAppUrl(s.appUrl)) init.appUrl = DEFAULT_APP;
  if (Object.keys(init).length) await chrome.storage.local.set(init);
  await setStatus({ state: s.enabled === true ? 'listening' : 'off', message: s.enabled === true ? 'Dinliyor.' : 'Kapalı.' });
});

chrome.runtime.onStartup.addListener(async () => {
  const { status } = await chrome.storage.local.get('status');
  await updateBadge(status);
});
