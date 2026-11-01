// InstaAnalytic Köprüsü: açılır pencere.
// Ayarları chrome.storage.local'a yazar; asıl işi arka plan yapar. Durum, depolama değiştikçe yenilenir.
'use strict';

const DEFAULT_APP = 'http://localhost:3002';
const $ = (id) => document.getElementById(id);

const el = {
  enabled: $('enabled'),
  lead: $('lead'),
  statPosts: $('stat-posts'),
  statLikers: $('stat-likers'),
  statComments: $('stat-comments'),
  barLikers: $('bar-likers'),
  actPosts: $('act-posts'),
  actLikers: $('act-likers'),
  status: $('status'),
  warning: $('warning'),
  warningUntil: $('warning-until'),
  warningTitle: $('warning-title'),
  statusText: $('status-text'),
  today: $('today'),
  last: $('last'),
  profileName: $('profile-name'),
  profileChange: $('profile-change'),
  profilePicker: $('profile-picker'),
  profileSelect: $('profile-select'),
  profileHint: $('profile-hint'),
  appUrl: $('app-url'),
  appSave: $('app-save'),
  appHint: $('app-hint'),
  openApp: $('open-app'),
  version: $('version'),
  updateDot: $('update-dot'),
  vCurrent: $('v-current'),
  vLatest: $('v-latest'),
  vChecked: $('v-checked'),
  updateStatus: $('update-status'),
  updateText: $('update-text'),
  manualSteps: $('manual-steps'),
  updateHint: $('update-hint'),
  checkNow: $('check-now'),
};

// ── Sekmeler (ok tuşlarıyla da gezilir) ──────────────────────────────────────

const TABS = ['tools', 'settings', 'update'];

function selectTab(name, focus = false) {
  for (const t of TABS) {
    const tab = $(`tab-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${t}`).hidden = !on;
    if (on && focus) tab.focus();
  }
  try { sessionStorage.setItem('ia-tab', name); } catch { /* yoksay */ }
  if (name === 'update') loadUpdate(false);
}

for (const t of TABS) {
  const tab = $(`tab-${t}`);
  tab.addEventListener('click', () => selectTab(t));
  tab.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(t);
    if (e.key === 'ArrowRight') selectTab(TABS[(i + 1) % TABS.length], true);
    else if (e.key === 'ArrowLeft') selectTab(TABS[(i + TABS.length - 1) % TABS.length], true);
  });
}

// ── Güncelleme ───────────────────────────────────────────────────────────────

const UPDATE_TEXT = {
  current: 'Güncel.',
  reloading: 'Yeni sürüm yükleniyor…',
  manual: 'Yeni sürüm var ama bu kopya kendiliğinden güncellenemiyor. Aşağıdaki adımları bir kez yapın.',
  unreachable: 'Uygulamaya ulaşılamadı; denetlenemedi.',
};

function renderUpdate(u) {
  const own = chrome.runtime.getManifest().version;
  el.version.textContent = `v${own}`;
  const state = (u && u.state) || 'unknown';
  el.updateStatus.dataset.state = state;
  el.updateText.textContent = UPDATE_TEXT[state] || 'Denetlenmedi.';
  el.vCurrent.textContent = own;
  el.vLatest.textContent = (u && u.latest) || '—';
  el.vChecked.textContent = u && u.checkedAt ? fmtTime(u.checkedAt) : '—';
  el.manualSteps.hidden = state !== 'manual';
  el.updateHint.hidden = state === 'manual';
  el.updateDot.hidden = state !== 'manual';
}

async function loadUpdate(force) {
  el.checkNow.disabled = true;
  const u = await send({ type: 'ia-update', force });
  if (u) renderUpdate(u);
  el.checkNow.disabled = false;
}

el.checkNow.addEventListener('click', () => loadUpdate(true));

let appUrl = DEFAULT_APP;
let hello = null;

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

function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (todayKey(d) === todayKey()) return time;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
}

function setHint(node, text, bad = false) {
  node.textContent = text || '';
  node.classList.toggle('bad', !!bad);
}

function send(msg) {
  return chrome.runtime.sendMessage(msg).catch(() => null);
}

// ── Durum ────────────────────────────────────────────────────────────────────

function renderStatus(status, enabled, seenAccount) {
  const s = status || {};
  // Açık ama Instagram hesabı henüz görülmedi: kurulumdan önce açılmış sekme yenilenmemiş
  const unseen = enabled && !seenAccount;
  const state = !enabled ? 'off' : unseen ? 'needs_login' : (s.state || 'listening');
  el.status.dataset.state = state;
  // Instagram uyarısı: kapalıyken bile görünür, en üstte
  const warnOn = s.state === 'warning' && (!s.warningUntil || s.warningUntil > Date.now());
  el.warning.hidden = !warnOn;
  if (warnOn) el.warningTitle.textContent = s.message || 'Instagram uyarı verdi.';   // metni uygulama verir
  el.warningUntil.textContent = warnOn && s.warningUntil
    ? `Bu tarihe kadar bekleyin: ${new Date(s.warningUntil).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`
    : '';
  el.statusText.textContent = !enabled ? 'Köprü kapalı. Sağ üstteki anahtarla açın.'
    : unseen ? 'Instagram sekmesini bir kez yenileyin; eklenti hesabı o zaman tanır.'
    : (s.message || 'Dinliyor.');

  const today = s.todayDate === todayKey();
  el.today.textContent = `${today ? Number(s.todayPosts) || 0 : 0} gönderi, ${today ? Number(s.todayPeople) || 0 : 0} kişi`;
  el.last.textContent = fmtTime(s.lastSavedAt);

  const p = s.profile;
  el.profileName.textContent = p ? (p.username ? `@${p.username}` : 'Seçili profil') : 'Seçilmedi';
  if (state === 'needs_profile') showPicker();
}

async function refresh() {
  const s = await chrome.storage.local.get(['enabled', 'status', 'appUrl', 'update', 'lastViewer', 'tools']);
  renderTools(toolsFrom(s.tools), s.enabled === true);
  renderUpdate(s.update);
  appUrl = normalizeAppUrl(s.appUrl) || DEFAULT_APP;
  el.enabled.checked = s.enabled === true;
  if (document.activeElement !== el.appUrl) el.appUrl.value = appUrl;
  renderStatus(s.status, s.enabled === true, !!s.lastViewer);
}

// ── Profil seçimi ────────────────────────────────────────────────────────────

function fillProfiles() {
  const sel = el.profileSelect;
  sel.textContent = '';
  if (!hello || !hello.ok) {
    sel.disabled = true;
    setHint(el.profileHint, hello ? hello.error : 'Profiller yükleniyor…', !!hello);
    return;
  }
  if (!hello.loggedIn) {
    sel.disabled = true;
    setHint(el.profileHint, "Eklenti açık Instagram hesabını henüz görmedi. Instagram sekmesini bir kez yenileyin (eklenti kurulduktan ya da güncellendikten sonra gerekir), sonra bu pencereyi yeniden açın.", true);
    return;
  }
  if (!hello.sessions.length) {
    sel.disabled = true;
    setHint(el.profileHint, 'Uygulamada henüz profil yok. Önce uygulamadan bir profil ekleyin.', true);
    return;
  }

  sel.disabled = false;
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = hello.matched ? 'Otomatik (bu hesapla eşleşen)' : 'Seçin…';
  sel.appendChild(auto);
  for (const s of hello.sessions) {
    const o = document.createElement('option');
    o.value = s.id;
    o.dataset.username = s.username || '';
    o.textContent = (s.username ? `@${s.username}` : 'İsimsiz profil') + (s.matches ? ' — bu hesap' : '');
    sel.appendChild(o);
  }
  sel.value = hello.current ? hello.current.id : ''; // kayıtlı profil artık listede yoksa boş kalır

  const cur = hello.sessions.find((s) => hello.current && s.id === hello.current.id);
  if (cur && !cur.matches && hello.sessions.some((s) => s.matches)) {
    setHint(el.profileHint, "Seçili profil Instagram'da açık olan hesapla eşleşmiyor.", true);
  } else if (!hello.matched && !hello.current) {
    setHint(el.profileHint, 'Bu Instagram hesabı hiçbir profille otomatik eşleşmedi; listeden seçin.');
  } else {
    setHint(el.profileHint, '');
  }
}

async function loadHello() {
  hello = null;
  fillProfiles();
  hello = (await send({ type: 'ia-hello' })) || { ok: false, error: 'Arka plana ulaşılamadı.' };
  fillProfiles();
}

function showPicker() {
  if (!el.profilePicker.hidden) return;
  selectTab('settings');                         // yalnızca ilk açılışta; sonra kullanıcı sekmeler arasında serbest
  el.profilePicker.hidden = false;
  el.profileChange.hidden = true;
  if (!hello || !hello.ok) loadHello();
}

el.profileChange.addEventListener('click', showPicker);

el.profileSelect.addEventListener('change', async () => {
  const opt = el.profileSelect.selectedOptions[0];
  const id = opt ? opt.value : '';
  const r = await send({ type: 'ia-set-profile', id, username: opt ? opt.dataset.username || '' : '' });
  if (!r || !r.ok) {
    setHint(el.profileHint, (r && r.error) || 'Kaydedilemedi.', true);
    return;
  }
  setHint(el.profileHint, 'Kaydedildi.');
  if (hello) hello.current = id ? { id } : null;
});

// ── Ayarlar ve düğmeler ──────────────────────────────────────────────────────

el.enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: el.enabled.checked });
});

async function saveAppUrl() {
  const url = normalizeAppUrl(el.appUrl.value);
  if (!url) {
    setHint(el.appHint, 'Yalnızca bu bilgisayardaki bir adres girilebilir (ör. http://localhost:3002).', true);
    return;
  }
  await chrome.storage.local.set({ appUrl: url });
  el.appUrl.value = url;
  setHint(el.appHint, 'Kaydedildi.');
  if (!el.profilePicker.hidden) loadHello();
}

el.appSave.addEventListener('click', saveAppUrl);
el.appUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveAppUrl(); });

el.openApp.addEventListener('click', () => {
  chrome.tabs.create({ url: appUrl });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.status && area === 'local' && changes.status.newValue && changes.status.newValue.lastSavedAt
      !== (changes.status.oldValue || {}).lastSavedAt) loadSummary();   // yeni kayıt geldi: ilerlemeyi tazele
  if (area === 'local' && (changes.status || changes.enabled || changes.appUrl || changes.update || changes.lastViewer || changes.tools)) {
    refresh();
    if (changes.lastViewer && !el.profilePicker.hidden) loadHello();   // hesap az önce görüldü: listeyi tazele
  }
let startTab = 'tools';
try { startTab = sessionStorage.getItem('ia-tab') || 'tools'; } catch { /* yoksay */ }
selectTab(TABS.includes(startTab) ? startTab : 'tools');
loadUpdate(false);
});

// ── Araçlar ──────────────────────────────────────────────────────────────────

const DEFAULT_TOOLS = { posts: true, likers: true, comments: true };
let summary = null;

function toolsFrom(stored) {
  const t = { ...DEFAULT_TOOLS };
  if (stored && typeof stored === 'object') for (const k of Object.keys(t)) if (typeof stored[k] === 'boolean') t[k] = stored[k];
  return t;
}

function renderTools(tools, enabled) {
  for (const input of document.querySelectorAll('[data-tool-switch]')) {
    const k = input.dataset.toolSwitch;
    input.checked = !!tools[k];
    input.disabled = !enabled;
    input.closest('.tool').classList.toggle('off', !enabled || !tools[k]);
  }
  const s = summary;
  if (!s || !s.ok) {
    const text = s && s.appDown ? 'Uygulama kapalı' : 'Profil seçilince görünür';
    el.statPosts.textContent = el.statLikers.textContent = el.statComments.textContent = text;
    el.barLikers.style.width = '0%';
    el.actPosts.disabled = el.actLikers.disabled = true;
    return;
  }
  el.statPosts.textContent = s.posts ? `${s.posts} gönderi bulundu` : 'Henüz gönderi yok';
  el.statLikers.textContent = s.posts ? `${s.likersDone} / ${s.posts} gönderi okundu` : 'Önce gönderi listesi gerekli';
  el.statComments.textContent = s.commentsDone ? `${s.commentsDone} gönderinin yorumları kaydedildi` : 'Henüz kayıt yok';
  el.barLikers.style.width = s.posts ? `${Math.round((100 * s.likersDone) / s.posts)}%` : '0%';
  el.actPosts.disabled = !enabled || !tools.posts || !s.username;
  el.actLikers.disabled = !enabled || !tools.likers || !s.next;
  el.actLikers.textContent = s.posts && !s.next ? 'Hepsi okundu' : 'Sıradaki gönderiyi aç';
}

async function loadSummary() {
  summary = await send({ type: 'ia-summary' });
  refresh();
}

for (const input of document.querySelectorAll('[data-tool-switch]')) {
  input.addEventListener('change', async () => {
    const { tools } = await chrome.storage.local.get('tools');
    const next = toolsFrom(tools);
    next[input.dataset.toolSwitch] = input.checked;
    await chrome.storage.local.set({ tools: next });
  });
}

// Eylemler yalnızca sekme açar; geri kalan her şey sizin tıklamanız
el.actPosts.addEventListener('click', () => {
  if (summary && summary.username) chrome.tabs.create({ url: `https://www.instagram.com/${encodeURIComponent(summary.username)}/` });
});
el.actLikers.addEventListener('click', () => {
  if (summary && summary.next) chrome.tabs.create({ url: `https://www.instagram.com/p/${encodeURIComponent(summary.next.shortcode)}/` });
});

refresh();
loadSummary();
let startTab = 'tools';
try { startTab = sessionStorage.getItem('ia-tab') || 'tools'; } catch { /* yoksay */ }
selectTab(TABS.includes(startTab) ? startTab : 'tools');
loadUpdate(false);
// Uygulamada bekleyen bir Instagram uyarısı varsa pencere açılınca hemen yansısın
send({ type: 'ia-refresh' }).then(refresh);
