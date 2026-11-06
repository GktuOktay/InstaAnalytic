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
const API_DEAD_AFTER_MS = 60 * 1000;       // en uzun adım: 3-5 sn bekleme + birkaç istek (~25 sn); bunun iki katından fazla sessizlik = ölü döngü
const UPDATE_MIN_GAP_MS = 30 * 1000;      // eklenti her açıldığında sürüm denetlenir; yalnızca art arda tekrarları engellemek için kısa bir aralık
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
  if (!force && prev.checkedAt && Date.now() - prev.checkedAt < UPDATE_MIN_GAP_MS) return prev;
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
  } else if ((await getJob())?.state === 'running') {
    // Çalışan bir iş varken yeniden yükleme işi keserdi: iş bitince (finishJob) tekrar denetlenir
    next.state = 'current';
    next.pendingReload = latest;
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
  checkUpdate().catch(() => {});                // Instagram sayfası her açıldığında (30 sn'den sık değil)
  const cfg = await getCfg();
  if (!VIEWER_RE.test(String(viewer || ''))) return { on: false };
  // Hangi hesabın açık olduğu, eklenti kapalıyken de hatırlanır: profil seçimi buna dayanır
  await chrome.storage.local.set({ lastViewer: String(viewer), lastViewerAt: Date.now() });

  // Bu sekme bir işin sekmesiyse: anahtarlardan bağımsız, işin türü kaydedilir ve iş adımı verilir
  const job = await getJob();
  if (job && job.state === 'running' && job.tabId === tabId && !job.api) {      // doğrudan istek işi kullanıcının sekmesini sürmez
    const profile = await resolveProfile(cfg, String(viewer));
    if (!profile) return { on: false };
    return { on: true, username: profile.username || null, tools: jobTools(job), job: { kind: job.kind, shortcode: job.queue[job.index] || null, ...(job.items ? { item: job.items[job.index] || null } : {}) } };
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
  const jobTab = !!(job && job.state === 'running' && job.tabId === tabId && !job.api);
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
  // İş sekmesiyse: kaydedilenleri o anki gönderinin sonucuna ekle (uyarı olsa da kayıt sürer)
  if (jobTab) await addToJob(job.id, r);

  const until = r.warning_until ? Date.parse(r.warning_until) : null;
  const warnActive = !!(until && until > Date.now());
  if (r.warning) {
    // Yeni bir uyarı: metni uygulama belirler (son kullanıcı dili). Hiçbir şey durdurulmaz.
    await setStatus({ state: 'warning', profile, message: String(r.message || 'Instagram uyarı verdi.'), warningUntil: until });
    notify('warning', 'Instagram uyarı verdi', `${String(r.message || '')} Hiçbir şey durdurulmadı; önerimiz bir süre ara vermeniz.`);
    return;
  }
  if (r.stopped) {
    await setStatus({ state: 'paused', profile, message: 'Bu profil için uygulamadan durduruldu.' });
    return;
  }
  if (r.likers || r.comments || r.posts) {
    const parts = [];
    if (r.posts) parts.push(`${r.posts} gönderi`);
    if (r.likers) parts.push(`${r.likers} beğenen`);
    if (r.comments) parts.push(`${r.comments} yorum`);
    await setStatus({ state: warnActive ? 'warning' : 'ok', profile, message: `Kaydedildi: ${parts.join(', ')}.`,
      warningUntil: warnActive ? until : null });
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
const KINDS = ['posts', 'likers', 'comments', 'actions'];
const BETWEEN_POSTS_MS = [6000, 18000];
const ACTION_USER_RE = /^[\w.]{1,30}$/;
// Takip / takipten çıkma sebepleri (uygulama /bridge/actions/next ile bildirir)
const ACTION_REASON = {
  off: 'Uygulamada takip / takipten çıkma işlemleri kapalı. Ayarlar sayfasından açın.',
  paused: 'İşlemler güvenlik için duraklatıldı. Uygulamada nedenini görebilirsiniz.',
  quiet_hours: 'Sessiz saatlerdesiniz (01:00-08:00). Sabah tekrar deneyin.',
  limit: 'Bu saat ya da gün için işlem sınırına ulaşıldı. Biraz sonra tekrar deneyin.',
  empty: 'Kuyrukta bekleyen işlem yok.',
};

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
  if (job.kind === 'actions') return { posts: false, likers: false, comments: false };   // yalnızca düğmelere tıklanır, hiçbir şey kaydedilmez
  // Gönderi sayfasındaki gönderinin kendisi de kaydedilsin (beğeni / yorum sayısı tazelenir)
  return { posts: true, likers: job.kind === 'likers', comments: job.kind === 'comments' };
}

// Eski kayıtlarda uzun kod (gerçek kod + 28 karakter) olabilir
function shortCode(c) {
  const s = String(c);
  return s.length > 33 ? s.slice(0, -28) : s;
}

function jobUrl(job, i) {
  if (job.kind === 'actions') return `https://www.instagram.com/${encodeURIComponent(job.items[i].username)}/`;
  if (job.kind === 'posts') return `https://www.instagram.com/${encodeURIComponent(job.username)}/`;
  // Eski kayıtlarda 39 karakterlik uzun kod olabilir; gerçek kısa kod ilk 11 karakter
  const code = encodeURIComponent(shortCode(job.queue[i]));
  // Beğenenler: küçük pencere ilk ~100 kişide kalıyor, tam liste sayfası daha fazlasını veriyor
  if (job.kind === 'likers') return `https://www.instagram.com/p/${code}/liked_by/`;
  return `https://www.instagram.com/p/${code}/`;
}

const KIND_LABEL = { posts: 'Gönderi listesi', likers: 'Beğenenler', comments: 'Yorumlar', actions: 'Takip işlemleri' };

const toItem = (x) => ({ id: x.id, username: String(x.username), action: x.action, manual: x.manual === true,
  igUserId: Number.isSafeInteger(Number(x.ig_user_id)) ? Number(x.ig_user_id) : 0 });

// Açık Instagram sekmeleri: içerik betiği yüklenince kendini bildirir (sekme izni gerekmez). Doğrudan istek, kullanıcının
// zaten açık olan sekmesinin içinden, tarayıcının oturum çerezleriyle yapılır; eklenti sekme AÇMAZ.
async function rememberIgTab(tabId) {
  const { igTabs } = await chrome.storage.session.get('igTabs').catch(() => ({}));
  const map = igTabs && typeof igTabs === 'object' ? igTabs : {};
  map[tabId] = Date.now();
  await chrome.storage.session.set({ igTabs: map });
}

async function forgetIgTab(tabId) {
  const { igTabs } = await chrome.storage.session.get('igTabs').catch(() => ({}));
  if (igTabs && igTabs[tabId] != null) { delete igTabs[tabId]; await chrome.storage.session.set({ igTabs }); }
}

function pingTab(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      chrome.tabs.sendMessage(tabId, { type: 'ia-api-ping' }, (res) => {
        clearTimeout(timer);
        void (chrome.runtime.lastError);
        resolve(res && res.ok === true ? res : null);
      });
    } catch { clearTimeout(timer); resolve(null); }
  });
}

// En son kullanılan, yanıt veren, oturumu açık Instagram sekmesi
async function findIgTab() {
  const { igTabs } = await chrome.storage.session.get('igTabs').catch(() => ({}));
  const ids = Object.entries(igTabs || {}).sort((a, b) => b[1] - a[1]).map(([id]) => Number(id));
  let loggedOut = false;
  for (const id of ids) {
    const res = (await pingTab(id)) || (await pingTab(id));       // dondurulmuş arka plan sekmesi ilk yoklamaya geç cevap verebilir
    if (!res) continue;                                           // kaydı silme: sekme kapanınca onRemoved siler
    if (res.csrf && !res.loginWall) return { id };
    loggedOut = true;
  }
  return { id: null, loggedOut };
}

// Uygun açık sekme yoksa eklenti arka planda (odağı çalmadan) bir Instagram sekmesi açar; iş bitince kapatır.
async function openOwnIgTab() {
  const tab = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: false });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await pingTab(tab.id);
    if (res) return { id: tab.id, ready: res.csrf && !res.loginWall, tab };
  }
  chrome.tabs.remove(tab.id).catch(() => {});
  return { id: null };
}

// Teşhis (yalnızca okuma): eklenti hangi Instagram sekmelerini görüyor, yanıt veriyorlar mı, son başlatma ne oldu
async function saveLastRun(r) {
  await chrome.storage.local.set({ lastRun: { at: Date.now(), ok: !!(r && r.ok), code: (r && r.code) || null, error: (r && r.error) || null } });
}

async function diag() {
  const { igTabs } = await chrome.storage.session.get('igTabs').catch(() => ({}));
  const tabs = [];
  for (const id of Object.keys(igTabs || {})) {
    const res = await pingTab(Number(id));
    tabs.push({ id: Number(id), answers: !!res, csrf: !!(res && res.csrf), loginWall: !!(res && res.loginWall) });
  }
  const job = await getJob();
  const { lastRun } = await chrome.storage.local.get('lastRun');
  return { version: chrome.runtime.getManifest().version, tabs, lastRun: lastRun || null,
    job: job ? { kind: job.kind, state: job.state, api: !!job.api, ownTab: !!job.ownTab, index: job.index, total: job.total } : null };
}

async function startJob(cmd) {
  const kind = cmd && KINDS.includes(cmd.kind) ? cmd.kind : null;
  if (!kind) return { ok: false, error: 'Bilinmeyen iş.' };
  const running = await getJob();
  if (running && running.state === 'running') {
    // Doğrudan istek döngüsü sekmede çalışır; sekme yenilenir/gezinirse sessizce ölür ve iş "çalışıyor" diye takılı kalırdı
    const beat = running.beat || running.startedAt || 0;
    if (running.api && Date.now() - beat > API_DEAD_AFTER_MS) {
      await finishJob(running, 'stopped', `İş yanıt vermediği için durduruldu (Instagram sekmesi yenilenmiş ya da kapanmış olabilir). ${(running.results || []).length} / ${running.total} işlendi. Kalanlar kuyrukta bekliyor.`);
    } else {
      return { ok: false, code: 'running', error: `Zaten çalışan bir iş var (${KIND_LABEL[running.kind]}).` };
    }
  }

  const cfg = await getCfg();
  const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
  if (!profile) return { ok: false, error: "Önce Instagram'ı bir sekmede açıp eklentide profilinizi seçin." };

  let queue = [null];
  let items = null;
  let delay = null;
  let manualDelay = null;
  let apiDelay = null;
  let apiTab = null;
  let apiOwnTab = false;
  if (kind === 'actions') {
    const r = await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/actions/next?limit=10`);
    if (r.status === 0) return { ok: false, error: 'Uygulamaya ulaşılamadı.' };
    if (r.status === 404) return { ok: false, error: 'Seçili profil uygulamada bulunamadı. Eklentinin Ayarlar sekmesinden profili yeniden seçin.' };
    const d = r.data || {};
    items = Array.isArray(d.items)
      ? d.items.filter((x) => x && Number.isInteger(x.id) && ACTION_USER_RE.test(String(x.username)) && (x.action === 'follow' || x.action === 'unfollow'))
          .map(toItem)
      : [];
    if (!items.length) return { ok: false, code: d.reason || 'empty', error: ACTION_REASON[d.reason] || 'Yapılacak işlem yok.' };
    queue = items.map((x) => x.username);
    delay = Array.isArray(d.delay) && d.delay.length === 2 ? [Math.max(60, Number(d.delay[0]) || 120), Math.max(75, Number(d.delay[1]) || 240)] : [120, 240];
    apiDelay = Array.isArray(d.api_delay) && d.api_delay.length === 2 ? [Math.max(2, Number(d.api_delay[0]) || 3), Math.max(3, Number(d.api_delay[1]) || 5)] : [3, 5];
    manualDelay = Array.isArray(d.manual_delay) && d.manual_delay.length === 2 ? [Math.max(10, Number(d.manual_delay[0]) || 15), Math.max(20, Number(d.manual_delay[1]) || 35)] : [15, 35];
  } else if (kind === 'posts') {
    if (!profile.username) return { ok: false, error: 'Profilin kullanıcı adı bilinmiyor; Ayarlar sekmesinden profili yeniden seçin.' };
  } else {
    let codes = Array.isArray(cmd.shortcodes) ? cmd.shortcodes.map(String).filter((c) => SHORTCODE_RE.test(c)) : [];
    if (!codes.length) {
      const limit = Math.max(1, Math.min(Number(cmd.count) || 50, 50));
      const r = await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/todo?kind=${kind}&limit=${limit}${cmd.scope === 'missing' && kind === 'likers' ? '&scope=missing' : ''}`);
      if (r.status === 0) return { ok: false, error: 'Uygulamaya ulaşılamadı.' };
      codes = Array.isArray(r.data) ? r.data.map((p) => String(p.shortcode)).filter((c) => SHORTCODE_RE.test(c)) : [];
    }
    if (!codes.length) return { ok: false, error: cmd.scope === 'missing' ? 'Beğenenleri eksik gönderi kalmadı.' : kind === 'likers' ? 'Beğenenleri okunacak gönderi kalmadı.' : 'Yorumları okunacak gönderi kalmadı.' };
    queue = codes.slice(0, 50);
  }

  // Kullanıcı işi kendisi başlattı: uygulamada bu profil için kayıt durdurulmuşsa yeniden aç,
  // yoksa sayfa okunur ama hiçbir şey kaydedilmez
  const st = kind === 'actions' ? { status: 200, data: {} } : await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/status`);
  if (st.status === 0) return { ok: false, error: 'Uygulamaya ulaşılamadı. Uygulama açık mı?' };
  if (st.status === 404) return { ok: false, error: 'Seçili profil uygulamada bulunamadı. Eklentinin Ayarlar sekmesinden profili yeniden seçin.' };
  let resumed = false;
  if (st.data && st.data.stopped) {
    const r = await callApp(cfg.appUrl, `/api/sessions/${profile.id}/bridge/resume`, {});
    if (r.status !== 200) {
      return { ok: false, error: 'Uygulamada bu profil için kayıt durdurulmuş ve yeniden açılamadı. Gönderiler sayfasındaki köprü kartında «Devam et»e basın.' };
    }
    resumed = true;
  }

  const useApi = kind === 'actions' && cmd.mode !== 'tab';
  if (useApi) {
    let found = await findIgTab();
    if (found.id == null && found.loggedOut) {
      return { ok: false, error: 'Açık Instagram sekmesinde oturum görünmüyor. Instagram\'a giriş yapıp tekrar dene.' };
    }
    if (found.id == null) {
      // Açık, yanıt veren sekme yok: arka planda kendimiz bir tane açalım
      const own = await openOwnIgTab();
      if (own.id == null) return { ok: false, error: "Instagram sekmesi açılamadı ya da yanıt vermedi. Instagram'ı bir sekmede açıp sayfayı yenile, sonra tekrar dene." };
      if (!own.ready) {
        chrome.tabs.remove(own.id).catch(() => {});
        return { ok: false, error: "Instagram'da oturum görünmüyor. Instagram'a giriş yapıp tekrar dene." };
      }
      found = { id: own.id, own: true };
    }
    apiTab = found.id;
    apiOwnTab = found.own === true;
  }

  const job = {
    id: `${Date.now()}`, kind, queue, index: 0, total: queue.length, errors: [], results: [], cur: { posts: 0, likers: 0, comments: 0 },
    items, delay, manualDelay, apiDelay, api: useApi || undefined, ownTab: (useApi && apiOwnTab) || undefined, profileId: profile.id,
    username: profile.username || null, state: 'running', startedAt: Date.now(), step: 0, resumed,
    message: `${KIND_LABEL[kind]}: 1 / ${queue.length}`,
  };
  if (useApi) {
    job.tabId = apiTab;
    job.message = `${KIND_LABEL.actions}: 1 / ${job.total}`;
    await setJob(job);
    chrome.tabs.sendMessage(apiTab, { type: 'ia-api-run', jobId: job.id }, () => { void (chrome.runtime.lastError); });
    return { ok: true, total: job.total };
  }
  const tab = await chrome.tabs.create({ url: jobUrl(job, 0), active: true });
  job.tabId = tab.id;
  await setJob(job);
  return { ok: true, total: job.total };
}

async function finishJob(job, state, message) {
  job.state = state;
  job.message = message;
  job.finishedAt = Date.now();
  job.outcome = state !== 'done' ? 'stopped'
    : (job.results || []).every((x) => x.ok) ? 'ok'
    : (job.results || []).some((x) => x.ok) ? 'partial' : 'failed';
  await setJob(job);
  if (job.tabId != null && ((state === 'done' && !job.api) || job.ownTab)) {          // kendi açtığımız sekme her durumda kapanır
    setTimeout(() => { chrome.tabs.remove(job.tabId).catch(() => {}); }, 1500);
  }
  const title = state !== 'done' ? `${KIND_LABEL[job.kind]} durdu`
    : job.outcome === 'ok' ? `${KIND_LABEL[job.kind]} bitti`
    : job.outcome === 'partial' ? `${KIND_LABEL[job.kind]} bitti, bazı gönderilerde sorun var` : `${KIND_LABEL[job.kind]} sonuç vermedi`;
  notify(job.outcome === 'ok' ? 'ok' : 'warning', title, message);
  reportJob(job).catch(() => {});
  checkUpdate(true).catch(() => {});            // iş sürerken ertelenen güncelleme varsa şimdi uygula
}

// Masaüstü bildirimi: uygulama açık olmasa da işin bittiği görülsün
function notify(kind, title, message) {
  try {
    chrome.notifications.create(`ia-${Date.now()}`, {
      type: 'basic', iconUrl: 'icons/icon-128.png', title: `InstaAnalytic: ${title}`,
      message: String(message || '').slice(0, 400), priority: kind === 'warning' ? 2 : 0,
    });
  } catch { /* bildirim izni yoksa sessizce geç */ }
}

// Sonucu uygulamaya yaz: Kuyruk Monitörü'nde ve iş geçmişinde görünür
async function reportJob(job) {
  const cfg = await getCfg();
  const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
  if (!profile) return;
  await callApp(cfg.appUrl, '/api/bridge/jobs', {
    session_id: profile.id, kind: job.kind, outcome: job.outcome, total: job.total,
    done: (job.results || []).length, ok: (job.results || []).filter((x) => x.ok).length,
    saved: (job.results || []).reduce((n, x) => n + x.saved, 0),
    message: String(job.message || '').slice(0, 4000),
    results: (job.results || []).slice(0, 50).map((x) => ({
      shortcode: x.shortcode, saved: x.saved, seen: x.seen, ok: x.ok, note: x.note ? String(x.note).slice(0, 300) : null,
    })),
    started_at: new Date(job.startedAt).toISOString(), finished_at: new Date(job.finishedAt).toISOString(),
  });
}

// Uygulamanın kayıt yanıtından: bu adımda kaç gönderi / beğenen / yorum kaydedildi
async function addToJob(jobId, r) {
  const job = await getJob();
  if (!job || job.id !== jobId || job.state !== 'running') return;
  job.cur = job.cur || { posts: 0, likers: 0, comments: 0 };
  job.cur.posts += Number(r.posts) || 0;
  job.cur.likers += Number(r.likers) || 0;
  job.cur.comments += Number(r.comments) || 0;
  if (r.warning) job.warned = String(r.message || 'Instagram uyarı verdi.');
  if (r.stopped) job.cur.stopped = true;          // uygulama kaydı reddetti: bu profil için durdurulmuş
  await setJob(job);
}

const UNIT = { posts: 'gönderi', likers: 'beğenen', comments: 'yorum yapan' };

// Bir adımın sonucunu son kullanıcı diliyle açıklar
function stepResult(job, error, seen, detail) {
  const code = job.queue[job.index];
  const saved = (job.cur && job.cur[job.kind]) || 0;
  let note = null;
  if (error) note = error;
  else if (!saved && job.cur && job.cur.stopped) {
    note = 'Uygulamada bu profil için kayıt durdurulmuş; sayfa okundu ama hiçbir şey kaydedilmedi. ' +
      'Gönderiler sayfasındaki köprü kartında «Devam et»e basıp işi yeniden başlatın.';
  } else if (!saved && seen > 0) {
    note = `Sayfada ${seen} ${job.kind === 'posts' ? 'gönderi' : 'kişi'} göründü ama hiçbiri kaydedilmedi. Instagram'ın gönderdiği veri tanınmadı; ` +
      'uygulamadaki teşhis kaydı bunun için tutuldu, bize bildirin.';
  } else if (!saved) {
    note = job.kind === 'comments' ? 'Yeni yorum bulunamadı.' : job.kind === 'likers' ? 'Kaydedilecek beğenen bulunamadı.' : 'Gönderi bulunamadı.';
  }
  if (detail) note = note ? `${note} ${detail}` : detail;
  return { shortcode: code, saved, seen, ok: !error && saved > 0, note };
}

function summarizeActions(job) {
  const res = (job.results || []).filter((x) => !x.retried);          // tekrar denenecek ara başarısızlıklar özeti kirletmez
  const total = job.total - ((job.results || []).length - res.length);
  const okCount = res.filter((x) => x.ok).length;
  const lines = [`${KIND_LABEL.actions}: ${res.length} / ${total} işlendi, ${okCount} tanesi tamam.`];
  for (const x of res.filter((r) => !r.ok).slice(0, 5)) lines.push(`• @${x.shortcode}: ${x.note || 'yapılamadı'}`);
  return lines.join('\n');
}

function summarize(job) {
  if (job.kind === 'actions') return summarizeActions(job);
  const label = KIND_LABEL[job.kind];
  const res = job.results || [];
  const totalSaved = res.reduce((n, x) => n + x.saved, 0);
  const okCount = res.filter((x) => x.ok).length;
  const bad = res.filter((x) => !x.ok);
  let head;
  if (job.kind === 'posts') {
    head = totalSaved ? `${label}: ${totalSaved} gönderi kaydedildi.` : `${label}: hiç gönderi kaydedilmedi.`;
  } else {
    head = `${label}: ${res.length} gönderi açıldı, ${okCount} tanesinden toplam ${totalSaved} ${UNIT[job.kind]} kaydedildi.`;
  }
  const lines = [head];
  for (const x of bad.slice(0, 5)) lines.push(`• ${x.shortcode ? x.shortcode + ': ' : ''}${x.note}`);
  if (bad.length > 5) lines.push(`• …ve ${bad.length - 5} gönderi daha.`);
  for (const x of res.filter((r) => r.ok && r.note).slice(0, 5)) lines.push(`• ${x.shortcode}: ${x.saved} kaydedildi. ${x.note}`);
  if (job.warned) lines.push(`Uyarı: ${job.warned}`);
  if (job.resumed) lines.push('Not: Uygulamada bu profil için kayıt durdurulmuştu; işi başlattığınız için yeniden açıldı.');
  return lines.join('\n');
}

async function jobStepDone(tabId, error, seen, detail, extra) {
  await chain.catch(() => {});                  // bu adımın kayıt yanıtları sayılmış olsun
  const job = await getJob();
  if (!job || job.state !== 'running' || job.tabId !== tabId) return;
  if (job.kind === 'actions') { await actionStepDone(job, error, extra || {}); return; }
  job.results = job.results || [];
  job.results.push(stepResult(job, error, Number(seen) || 0, detail));
  if (error) job.errors.push({ shortcode: job.queue[job.index], error: String(error).slice(0, 300) });
  job.cur = { posts: 0, likers: 0, comments: 0 };
  job.index += 1;
  if (job.index >= job.total) {
    await finishJob(job, 'done', summarize(job));
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

// Takip / takipten çıkma: sonucu uygulamaya yaz, sonra bir sonrakine geçmeden önce uzun ve rastgele bekle.
// Bekleme sırasında içerik betiği her 15 sn'de bir "ia-job-tick" gönderir (servis çalışanı uyumasın);
// süre dolunca tick bir sonraki profile geçirir.
const ACTION_NOTE = { done: 'Yapıldı.', already: 'Zaten istenen durumdaydı.' };

// Uygulamadan (Kullanıcı Havuzu) sonradan eklenen işleri çalışan işe katar.
// onlyManual: bekleme sırasında yalnızca kullanıcının tek tek tıkladıkları öne alınır; iş bitince hepsi alınır.
async function pullNewItems(job, onlyManual) {
  const cfg = await getCfg();
  const r = await callApp(cfg.appUrl, `/api/sessions/${job.profileId}/bridge/actions/next?limit=10`);
  if (r.status !== 200 || !r.data || !Array.isArray(r.data.items)) return 0;
  const known = new Set(job.items.map((x) => x.id));
  const fresh = r.data.items
    .filter((x) => x && Number.isInteger(x.id) && !known.has(x.id) && ACTION_USER_RE.test(String(x.username))
      && (x.action === 'follow' || x.action === 'unfollow') && (!onlyManual || x.manual === true))
    .map(toItem);
  if (!fresh.length) return 0;
  // Kullanıcının tıkladıkları sıradakinden önce, diğerleri sona
  const front = fresh.filter((x) => x.manual);
  const back = fresh.filter((x) => !x.manual);
  job.items.splice(job.index, 0, ...front);
  job.queue.splice(job.index, 0, ...front.map((x) => x.username));
  job.items.push(...back);
  job.queue.push(...back.map((x) => x.username));
  job.total += fresh.length;
  return fresh.length;
}

function waitFor(job) {
  const next = job.items[job.index];
  const [lo, hi] = next && next.manual ? (job.manualDelay || [15, 35]) : (job.delay || [120, 240]);
  return (lo + Math.random() * (hi - lo)) * 1000;
}

// Bir işlemin sonucunu uygulamaya yazar, tekrar deneme / engel / uygulama kapalı durumlarını yönetir.
// 'continue': sıradaki kişiye geçilebilir (index ilerledi). 'stopped': iş durduruldu/bitirildi.
async function recordActionResult(job, error, extra) {
  const item = job.items[job.index];
  const outcome = error ? 'failed' : (['done', 'already', 'not_found', 'failed', 'blocked'].includes(extra.outcome) ? extra.outcome : 'failed');
  const note = String(error || extra.note || ACTION_NOTE[outcome] || '').slice(0, 300) || null;
  const cfg = await getCfg();
  const rep = await callApp(cfg.appUrl, `/api/sessions/${job.profileId}/bridge/actions/${item.id}/result`, { outcome, note }, 30000);
  const ok = outcome === 'done' || outcome === 'already';
  // Uygulama "tekrar dene" derse (en fazla 3 deneme) aynı kişi bu işin sonuna yeniden eklenir
  const retry = !ok && rep.status === 200 && !!(rep.data && rep.data.retry === true);
  job.results = job.results || [];
  job.results.push({ shortcode: item.username, saved: ok ? 1 : 0, seen: 0, ok, retried: retry || undefined,
    note: retry ? `${note || 'Başarısız'} (deneme ${Number(rep.data.attempts) || 1}/3, işin sonunda tekrar denenecek)` : note });
  if (!ok && !retry) job.errors.push({ shortcode: item.username, error: note || outcome });
  if (retry) {
    job.items.push(item);
    job.queue.push(item.username);
    job.total += 1;
  }
  if (rep.status === 0) {
    await finishJob(job, 'stopped', `Uygulamaya ulaşılamadı; yapılan işlem kaydedilemedi, iş durduruldu.\n${summarize(job)}`);
    return 'stopped';
  }
  if (outcome === 'blocked') {
    await finishJob(job, 'stopped', `Instagram işlemi engelledi, iş durduruldu. Uygulama işlemleri 24 saat duraklattı; bir süre ara verin.\n${summarize(job)}`);
    return 'stopped';
  }
  job.index += 1;
  return 'continue';
}

async function actionStepDone(job, error, extra) {
  if ((await recordActionResult(job, error, extra)) === 'stopped') return;
  if (job.index >= job.total) {
    await pullNewItems(job, false);             // iş sürerken uygulamada yeni eklenenler varsa devam et
    if (job.index >= job.total) {
      await finishJob(job, 'done', summarize(job));
      return;
    }
  }
  const waitMs = waitFor(job);
  job.nextAt = Date.now() + waitMs;
  const secs = Math.round(waitMs / 1000);
  job.message = `${KIND_LABEL.actions}: ${job.index} / ${job.total} yapıldı. Sıradaki ${secs >= 90 ? `~${Math.round(secs / 6) / 10} dk` : `~${secs} sn`} sonra; Instagram sekmesini kapatmayın.`;
  job.step = 0;
  await setJob(job);
}

// Doğrudan istek modu: Instagram sekmesindeki içerik betiği döngüyü yürütür, her adımda buraya sorar.
// { item, waitMs } ya da { item: null } (iş bitti / durdu) döner. Sonuç varsa önce kaydedilir.
async function apiNext(tabId, msg) {
  const job = await getJob();
  if (!job || !job.api || job.state !== 'running' || job.tabId !== tabId || job.id !== msg.jobId) return { item: null };
  const hadResult = !!(msg.result && typeof msg.result === 'object');
  job.beat = Date.now();                        // döngü canlı: bu zamandan sonra uzun süre ses çıkmazsa ölü sayılır
  if (hadResult) {
    const r = msg.result;
    if ((await recordActionResult(job, r.error || null, { outcome: r.outcome, note: r.note })) === 'stopped') return { item: null };
  }
  if (job.index >= job.total) {
    await pullNewItems(job, false);             // iş sürerken uygulamada yeni eklenenler varsa devam et
    if (job.index >= job.total) {
      await finishJob(job, 'done', summarize(job));
      return { item: null };
    }
  }
  const [lo, hi] = job.apiDelay || [3, 5];
  const waitMs = hadResult ? Math.round((lo + Math.random() * (hi - lo)) * 1000) : 0;       // ilk işlem hemen
  job.message = `${KIND_LABEL.actions}: ${job.index + 1} / ${job.total} · doğrudan istek, işlemler arası ${lo}-${hi} sn`;
  await setJob(job);
  return { item: job.items[job.index], waitMs };
}

async function stopJob() {
  const job = await getJob();
  if (!job || job.state !== 'running') return { ok: true };
  await finishJob(job, 'stopped', `Durduruldu. ${(job.results || []).length} / ${job.total} gönderi işlenmişti.\n${summarize(job)}`);
  if (job.tabId != null && (!job.api || job.ownTab)) chrome.tabs.remove(job.tabId).catch(() => {});     // kullanıcının kendi sekmesi kapatılmaz; kendi açtığımızı kapatırız
  return { ok: true };
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  forgetIgTab(tabId).catch(() => {});
  const job = await getJob();
  if (job && job.state === 'running' && job.tabId === tabId) {
    await finishJob(job, 'stopped', `Sekme kapatıldı, iş durdu. ${(job.results || []).length} / ${job.total} gönderi işlenmişti.\n${summarize(job)}`);
  }
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
    likersIncomplete: Number(st.data.likers_incomplete) || 0,
    likersSaved: Number(st.data.likers_saved) || 0,
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
  if (msg.type === 'ia-tab-hello') {
    if (!fromInstagram) return false;
    rememberIgTab(sender.tab.id).catch(() => {});
    return false;
  }
  if (msg.type === 'ia-api-next') {
    if (!fromInstagram) return false;
    apiNext(sender.tab.id, msg).then(sendResponse, () => sendResponse({ item: null }));
    return true;
  }
  if (msg.type === 'ia-job-tick') {
    if (!fromInstagram) return false;
    getJob().then(async (job) => {
      if (!job || job.state !== 'running' || job.kind !== 'actions' || job.tabId !== sender.tab.id) return;
      if (job.nextAt && Date.now() < job.nextAt) {
        // Beklerken kullanıcı uygulamada bir kişiye tıkladıysa onu öne al ve bekleme süresini insan hızına indir
        if (await pullNewItems(job, true).catch(() => 0)) {
          const [lo, hi] = job.manualDelay || [15, 35];
          job.nextAt = Math.min(job.nextAt, Date.now() + (lo + Math.random() * (hi - lo)) * 1000);
          await setJob(job);
        }
        return;
      }
      if (!job.nextAt) return;
      job.nextAt = null;
      job.message = `${KIND_LABEL.actions}: ${job.index + 1} / ${job.total}`;
      setJob(job).then(() => chrome.tabs.update(job.tabId, { url: jobUrl(job, job.index) }).catch(() => {}));
    });
    return false;
  }
  if (msg.type === 'ia-job-progress' || msg.type === 'ia-job-done') {
    if (!fromInstagram) return false;
    if (msg.type === 'ia-job-done') jobStepDone(sender.tab.id, msg.error || null, msg.seen, msg.detail || null, { outcome: msg.outcome, note: msg.note });
    else getJob().then((job) => {
      if (job && job.state === 'running' && job.tabId === sender.tab.id) { job.step = Number(msg.step) || 0; setJob(job); }
    });
    return false;
  }

  // İş başlatma / durdurma: açılır pencereden ya da uygulama sayfasından (app-bridge.js)
  if (msg.type === 'ia-diag') {
    const fromApp = !!(sender.tab && /^http:\/\/(localhost|127\.0\.0\.1):3002\//.test(String(sender.tab.url || '')));
    if (!fromApp && sender.tab) return false;
    diag().then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg.type === 'ia-run' || msg.type === 'ia-stop' || msg.type === 'ia-job') {
    const fromApp = !!(sender.tab && /^http:\/\/(localhost|127\.0\.0\.1):3002\//.test(String(sender.tab.url || '')));
    if (sender.tab && !fromApp) return false;
    const work = msg.type === 'ia-run' ? startJob(msg.cmd).then(async (r) => { await saveLastRun(r).catch(() => {}); return r; }) : msg.type === 'ia-stop' ? stopJob() : getJob();
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

async function reloadAppTabs() {
  if (!chrome.tabs || !chrome.tabs.query) return;
  const tabs = await chrome.tabs.query({ url: ['http://localhost:3002/*', 'http://127.0.0.1:3002/*'] });
  for (const t of tabs) if (t && t.id != null) chrome.tabs.reload(t.id).catch(() => {});
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const s = await chrome.storage.local.get(['enabled', 'appUrl', 'update']);
  const init = {};
  if (typeof s.enabled !== 'boolean') init.enabled = false; // kullanıcı açana kadar kapalı
  if (!normalizeAppUrl(s.appUrl)) init.appUrl = DEFAULT_APP;
  if (Object.keys(init).length) await chrome.storage.local.set(init);

  // Eklenti yeniden yüklenince açık uygulama sekmelerindeki köprü betiği kopar ("Eklentiye ulaşılamadı"): sekmeyi yenile
  reloadAppTabs().catch(() => {});

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

// Tarayıcı kapanınca oturum belleği (chrome.storage.session) silinir; "çalışıyor" görünen iş takılı kalmasın.
// Kuyruk uygulamada durur, hiçbir şey kaybolmaz: kaldığın yerden "Kuyruğu çalıştır" ile devam edilir.
async function closeStaleJob() {
  const { jobView } = await chrome.storage.local.get('jobView');
  if (!jobView || jobView.state !== 'running') return;
  if (await getJob()) return;                                   // oturum belleğinde hâlâ var: iş sürüyor
  const stopped = { ...jobView, state: 'stopped', outcome: 'stopped', finishedAt: Date.now(),
    message: `Tarayıcı kapatıldığı için iş durdu. ${(jobView.results || []).length} / ${jobView.total} işlendi. Kalan işler uygulamadaki kuyrukta bekliyor; devam etmek için "Kuyruğu çalıştır"a bas.` };
  await chrome.storage.local.set({ jobView: stopped });
  notify('warning', `${KIND_LABEL[jobView.kind] || 'İş'} durdu`, stopped.message);
}

chrome.runtime.onStartup.addListener(async () => {
  await closeStaleJob().catch(() => {});
  const { status } = await chrome.storage.local.get('status');
  await updateBadge(status);
  checkUpdate(true).catch(() => {});            // tarayıcı her açıldığında yeni sürüm var mı diye bak
});
