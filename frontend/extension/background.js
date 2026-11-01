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
const UPDATE_EVERY_MS = 6 * 3600 * 1000;
const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const DEFAULT_TOOLS = { posts: true, likers: true, comments: true };
const TOOL_KEYS = Object.keys(DEFAULT_TOOLS);

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
  const s = await chrome.storage.local.get(['enabled', 'appUrl', 'profiles', 'lastViewer', 'tools']);
  const tools = { ...DEFAULT_TOOLS };
  if (s.tools && typeof s.tools === 'object') for (const k of TOOL_KEYS) if (typeof s.tools[k] === 'boolean') tools[k] = s.tools[k];
  return {
    enabled: s.enabled === true,
    tools,
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

// Instagram uyarısı kritik: süre bitene kadar simgede kırmızı "!" kalır (güncelleme işaretinden önce gelir).
async function updateBadge(s) {
  const warn = !!(s && s.warningUntil && s.warningUntil > Date.now());
  const { update } = await chrome.storage.local.get('update');
  const manual = !!(update && update.state === 'manual');
  await chrome.action.setBadgeText({ text: warn ? '!' : manual ? '↑' : '' });
  if (warn || manual) await chrome.action.setBadgeBackgroundColor({ color: warn ? '#d93025' : '#c98a1b' });
  await chrome.action.setTitle({
    title: warn ? 'InstaAnalytic Köprüsü: Instagram uyarı verdi'
      : manual ? 'InstaAnalytic Köprüsü: yeni sürüm var' : 'InstaAnalytic Köprüsü',
  });
}

// ── Güncelleme ───────────────────────────────────────────────────────────────
// Paketlenmemiş eklentiler Chrome'da kendiliğinden güncellenmez. Eklenti uygulamanın klasöründen
// (InstaAnalytic/frontend/extension) yüklendiyse, uygulama güncellendiğinde dosyalar da güncellenir;
// burada uygulamanın sunduğu sürüm daha yeniyse eklenti kendini yeniden yükler. İndirilmiş bir kopyadan
// yüklendiyse yeniden yükleme yeni dosya getirmez: bir kez denenir, sonra elle kurulum istenir.

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkUpdate(force = false) {
  const { update } = await chrome.storage.local.get('update');
  const prev = update && typeof update === 'object' ? update : {};
  if (!force && prev.checkedAt && Date.now() - prev.checkedAt < UPDATE_EVERY_MS) return prev;
  const current = chrome.runtime.getManifest().version;
  const cfg = await getCfg();
  // Önbellekten eski sürüm gelmesin: her denetimde farklı adres
  const r = await callApp(cfg.appUrl, `/extension/manifest.json?t=${Date.now()}`, undefined, 10000);
  const latest = r.status === 200 && r.data && VERSION_RE.test(String(r.data.version || '')) ? String(r.data.version) : null;
  const next = { checkedAt: Date.now(), current, latest, reloadedFor: prev.reloadedFor || null };

  if (!latest) {
    next.state = 'unreachable';
  } else if (cmpVersion(latest, current) <= 0) {
    next.state = 'current';
  } else if (prev.reloadedFor === latest) {
    next.state = 'manual';                      // yeniden yükleme yeni dosya getirmedi: kopyadan kurulmuş
  } else {
    next.state = 'reloading';
    next.reloadedFor = latest;
    await chrome.storage.local.set({ update: next });
    chrome.runtime.reload();                    // diskteki yeni dosyalarla yeniden başlar
    return next;
  }
  await chrome.storage.local.set({ update: next });
  const { status } = await chrome.storage.local.get('status');
  await updateBadge(status);
  return next;
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
    const init = { signal: ctrl.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } };
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

async function configFor(viewer, tabId) {
  checkUpdate().catch(() => {});                // en çok 6 saatte bir; Instagram sayfası açıldıkça
  const cfg = await getCfg();
  if (!VIEWER_RE.test(String(viewer || ''))) return { on: false };
  // Hangi hesabın açık olduğu, eklenti kapalıyken de hatırlanır: profil seçimi buna dayanır
  await chrome.storage.local.set({ lastViewer: String(viewer), lastViewerAt: Date.now() });

  // Bu sekme bir işin sekmesiyse: anahtarlardan bağımsız, işin türü kaydedilir ve iş adımı verilir
  const job = await getJob();
  if (job && job.state === 'running' && job.tabId === tabId) {
    const profile = await resolveProfile(cfg, String(viewer));
    if (!profile) return { on: false };
    return { on: true, username: profile.username || null, tools: jobTools(job), job: { kind: job.kind, shortcode: job.queue[job.index] || null } };
  }

  if (!cfg.enabled || !TOOL_KEYS.some((k) => cfg.tools[k])) return { on: false };
  const profile = await resolveProfile(cfg, String(viewer));
  if (!profile) return { on: false };
  return { on: true, username: profile.username || null, tools: cfg.tools };
}

// ── Gözlem ───────────────────────────────────────────────────────────────────

let chain = Promise.resolve();
let pending = 0;

async function handleObserved(msg, tabId) {
  const cfg = await getCfg();
  const job = await getJob();
  const jobTab = !!(job && job.state === 'running' && job.tabId === tabId);
  if ((!cfg.enabled && !jobTab) || !VIEWER_RE.test(String(msg.viewer || ''))) return;
  const allowed = jobTab ? jobTools(job) : cfg.tools;
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
    ext_version: chrome.runtime.getManifest().version,
    // Hangi araçların açık olduğu: uygulama yalnızca bunları kaydeder
    kinds: TOOL_KEYS.filter((k) => allowed[k] && Array.isArray(msg.kinds) && msg.kinds.includes(k)),
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
  const until = r.warning_until ? Date.parse(r.warning_until) : null;
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

function enqueue(msg, tabId) {
  if (pending >= MAX_QUEUE) return;
  pending += 1;
  chain = chain.then(() => handleObserved(msg, tabId)).catch(() => {}).finally(() => { pending -= 1; });
}

// ── İşler ────────────────────────────────────────────────────────────────────
// Uygulamadan ya da açılır pencereden başlatılır. Eklenti bir Instagram sekmesi açar ve içerik betiği
// bir insanın yapacağını yapar (kaydırma, beğenme sayısına tıklama, "daha fazla yorum"). Instagram'a
// doğrudan istek yine gönderilmez. Aynı anda tek iş çalışır; durum chrome.storage.session'da tutulur.

const SHORTCODE_RE = /^[\w-]{5,40}$/;
const KINDS = ['posts', 'likers', 'comments'];
const BETWEEN_POSTS_MS = [6000, 18000];

async function getJob() {
  try {
    const { job } = await chrome.storage.session.get('job');
    return job && typeof job === 'object' ? job : null;
  } catch {
    return null;
  }
}

async function setJob(job) {
  await chrome.storage.session.set({ job });
  await chrome.storage.local.set({ jobView: job });   // açılır pencere ve uygulama sayfası izlesin
}

function jobTools(job) {
  // Gönderi sayfasındaki gönderinin kendisi de kaydedilsin (beğeni / yorum sayısı tazelenir)
  return { posts: true, likers: job.kind === 'likers', comments: job.kind === 'comments' };
}

function jobUrl(job, i) {
  if (job.kind === 'posts') return `https://www.instagram.com/${encodeURIComponent(job.username)}/`;
  return `https://www.instagram.com/p/${encodeURIComponent(job.queue[i])}/`;
}

const KIND_LABEL = { posts: 'Gönderi listesi', likers: 'Beğenenler', comments: 'Yorumlar' };

async function startJob(cmd) {
  const kind = cmd && KINDS.includes(cmd.kind) ? cmd.kind : null;
  if (!kind) return { ok: false, error: 'Bilinmeyen iş.' };
  const running = await getJob();
  if (running && running.state === 'running') return { ok: false, error: `Zaten çalışan bir iş var (${KIND_LABEL[running.kind]}).` };

  const cfg = await getCfg();
  const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
  if (!profile) return { ok: false, error: "Önce Instagram'ı bir sekmede açıp eklentide profilinizi seçin." };

  let queue = [null];
  if (kind === 'posts') {
    if (!profile.username) return { ok: false, error: 'Profilin kullanıcı adı bilinmiyor; Ayarlar sekmesinden profili yeniden seçin.' };
  } else {
    let codes = Array.isArray(cmd.shortcodes) ? cmd.shortcodes.map(String).filter((c) => SHORTCODE_RE.test(c)) : [];
    if (!codes.length) {
      const limit = Math.max(1, Math.min(Number(cmd.count) || 50, 50));
      const r = await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/todo?kind=${kind}&limit=${limit}`);
      if (r.status === 0) return { ok: false, error: 'Uygulamaya ulaşılamadı.' };
      codes = Array.isArray(r.data) ? r.data.map((p) => String(p.shortcode)).filter((c) => SHORTCODE_RE.test(c)) : [];
    }
    if (!codes.length) return { ok: false, error: kind === 'likers' ? 'Beğenenleri okunacak gönderi kalmadı.' : 'Yorumları okunacak gönderi kalmadı.' };
    queue = codes.slice(0, 50);
  }

  const job = {
    id: `${Date.now()}`, kind, queue, index: 0, total: queue.length, errors: [],
    username: profile.username || null, state: 'running', startedAt: Date.now(), step: 0,
    message: `${KIND_LABEL[kind]}: 1 / ${queue.length}`,
  };
  const tab = await chrome.tabs.create({ url: jobUrl(job, 0), active: true });
  job.tabId = tab.id;
  await setJob(job);
  return { ok: true, total: job.total };
}

async function finishJob(job, state, message) {
  job.state = state;
  job.message = message;
  job.finishedAt = Date.now();
  await setJob(job);
  if (state === 'done' && job.tabId != null) {
    setTimeout(() => { chrome.tabs.remove(job.tabId).catch(() => {}); }, 1500);
  }
}

async function jobStepDone(tabId, error) {
  const job = await getJob();
  if (!job || job.state !== 'running' || job.tabId !== tabId) return;
  if (error) job.errors.push({ shortcode: job.queue[job.index], error: String(error).slice(0, 200) });
  job.index += 1;
  if (job.index >= job.total) {
    const ok = job.total - job.errors.length;
    const msg = job.kind === 'posts' ? 'Gönderi listesi okundu.'
      : `${KIND_LABEL[job.kind]}: ${ok} / ${job.total} gönderi okundu${job.errors.length ? `, ${job.errors.length} gönderide sorun çıktı` : ''}.`;
    await finishJob(job, 'done', msg);
    return;
  }
  job.message = `${KIND_LABEL[job.kind]}: ${job.index + 1} / ${job.total}`;
  job.step = 0;
  await setJob(job);
  // Gönderiler arasında insan hızında, rastgele bekleme
  const wait = BETWEEN_POSTS_MS[0] + Math.random() * (BETWEEN_POSTS_MS[1] - BETWEEN_POSTS_MS[0]);
  setTimeout(async () => {
    const cur = await getJob();
    if (cur && cur.state === 'running' && cur.id === job.id) chrome.tabs.update(tabId, { url: jobUrl(cur, cur.index) }).catch(() => {});
  }, wait);
}

async function stopJob() {
  const job = await getJob();
  if (!job || job.state !== 'running') return { ok: true };
  await finishJob(job, 'stopped', 'Durduruldu.');
  if (job.tabId != null) chrome.tabs.remove(job.tabId).catch(() => {});
  return { ok: true };
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const job = await getJob();
  if (job && job.state === 'running' && job.tabId === tabId) await finishJob(job, 'stopped', 'Sekme kapatıldı, iş durdu.');
});

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

// Açılır pencere için araç özetleri: uygulamadaki ilerleme ve sıradaki gönderi
async function summaryForPopup() {
  const cfg = await getCfg();
  const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
  if (!profile) return { ok: false };
  const [st, todo, todoComments] = await Promise.all([
    callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/status`),
    callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/todo?kind=likers&limit=1`),
    callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/todo?kind=comments&limit=1`),
  ]);
  if (st.status !== 200 || !st.data) return { ok: false, appDown: st.status === 0 };
  const next = todo.status === 200 && Array.isArray(todo.data) && todo.data[0] ? todo.data[0] : null;
  return {
    ok: true,
    username: profile.username || null,
    posts: Number(st.data.posts) || 0,
    likersDone: Number(st.data.likers_done) || 0,
    commentsDone: Number(st.data.comments_done) || 0,
    next: next && /^[\w-]{5,40}$/.test(String(next.shortcode)) ? { shortcode: String(next.shortcode), likes: Number(next.like_count) || 0 } : null,
    nextComments: todoComments.status === 200 && Array.isArray(todoComments.data) && todoComments.data.length > 0,
  };
}

// Uygulamadaki durum (ör. bekleyen uyarı) açılır pencereye ve simgeye yansısın
async function refreshFromApp() {
  const cfg = await getCfg();
  const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
  if (!profile) return;
  const r = await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/status`);
  if (r.status !== 200 || !r.data) return;
  const until = r.data.warning_until ? Date.parse(r.data.warning_until) : null;
  if (until && until > Date.now()) {
    await setStatus({ state: 'warning', profile, message: String(r.data.warning_message || 'Instagram uyarı verdi.'), warningUntil: until });
  } else {
    const { status } = await chrome.storage.local.get('status');
    if (status && status.state === 'warning') await setStatus({ state: 'listening', message: 'Dinliyor.', warningUntil: null });
  }
}

async function chooseProfile(id, username) {
  const { lastViewer } = await getCfg();
  if (!lastViewer) return { ok: false, error: 'Instagram sekmesini bir kez yenileyin; eklenti hesabı o zaman tanır.' };
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
    configFor(msg.viewer, sender.tab.id).then(sendResponse, () => sendResponse({ on: false }));
    return true;
  }
  if (msg.type === 'ia-observed') {
    if (!fromInstagram) return false;
    if (typeof msg.url !== 'string' || !msg.url.startsWith('https://www.instagram.com/')) return false;
    if (typeof msg.text !== 'string' || msg.text.length > MAX_BODY_CHARS) return false;
    enqueue(msg, sender.tab.id);
    return false;
  }
  if (msg.type === 'ia-job-progress' || msg.type === 'ia-job-done') {
    if (!fromInstagram) return false;
    if (msg.type === 'ia-job-done') jobStepDone(sender.tab.id, msg.error || null);
    else getJob().then((job) => {
      if (job && job.state === 'running' && job.tabId === sender.tab.id) { job.step = Number(msg.step) || 0; setJob(job); }
    });
    return false;
  }

  // İş başlatma / durdurma: açılır pencereden ya da uygulama sayfasından (app-bridge.js)
  if (msg.type === 'ia-run' || msg.type === 'ia-stop' || msg.type === 'ia-job') {
    const fromApp = !!(sender.tab && /^http:\/\/(localhost|127\.0\.0\.1):3002\//.test(String(sender.tab.url || '')));
    if (sender.tab && !fromApp) return false;
    const work = msg.type === 'ia-run' ? startJob(msg.cmd) : msg.type === 'ia-stop' ? stopJob() : getJob();
    work.then(sendResponse, () => sendResponse({ ok: false, error: 'Beklenmeyen bir hata oldu.' }));
    return true;
  }

  // Aşağıdakiler yalnızca eklentinin kendi açılır penceresinden
  if (sender.tab) return false;
  if (msg.type === 'ia-hello') {
    helloForPopup().then(sendResponse);
    return true;
  }
  if (msg.type === 'ia-summary') {
    summaryForPopup().then(sendResponse, () => sendResponse({ ok: false }));
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
  if (msg.type === 'ia-update') {
    checkUpdate(msg.force === true).then(sendResponse, () => sendResponse(null));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabled) return;
  if (changes.enabled.newValue === true) setStatus({ state: 'listening', message: 'Dinliyor.' });
  else setStatus({ state: 'off', message: 'Kapalı.' });
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const s = await chrome.storage.local.get(['enabled', 'appUrl', 'update']);
  const init = {};
  if (typeof s.enabled !== 'boolean') init.enabled = false; // kullanıcı açana kadar kapalı
  if (!normalizeAppUrl(s.appUrl)) init.appUrl = DEFAULT_APP;
  if (Object.keys(init).length) await chrome.storage.local.set(init);

  const version = chrome.runtime.getManifest().version;
  const prev = s.update || {};
  if (details && details.reason === 'update' && prev.current && cmpVersion(version, prev.current) > 0) {
    // Kendini güncelledi: açık Instagram sekmelerindeki eski betikler kopuktur, bir kez yenilenmeli
    await chrome.storage.local.set({ update: { ...prev, current: version, state: 'current', reloadedFor: null } });
    await setStatus({ state: s.enabled === true ? 'listening' : 'off',
      message: `Eklenti ${version} sürümüne güncellendi. Açık Instagram sekmesini bir kez yenileyin.` });
  } else {
    await setStatus({ state: s.enabled === true ? 'listening' : 'off', message: s.enabled === true ? 'Dinliyor.' : 'Kapalı.' });
  }
  checkUpdate(true).catch(() => {});
});

chrome.runtime.onStartup.addListener(async () => {
  const { status } = await chrome.storage.local.get('status');
  await updateBadge(status);
  checkUpdate().catch(() => {});
});
