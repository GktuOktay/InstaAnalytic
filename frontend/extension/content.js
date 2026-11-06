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
    if (/\/api\/v1\/media\/\d+(_\d+)?\/likers\//.test(path) || /liker|likes|liked_?by/i.test(friendly)) return 'likers';
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
    let steps = 0;
    for (let i = 0; i < maxSteps && stable < 3; i++) {
      const box = getBox();
      if (!box) break;
      const h = box.scrollHeight;
      box.scrollTo({ top: h, behavior: 'smooth' });
      await sleep(rand(pause[0], pause[1]));
      stable = box.scrollHeight === h ? stable + 1 : 0;   // yeni içerik gelmediyse
      report({ step: i + 1 });
      steps = i + 1;
    }
    return steps;
  }

  function scrollableIn(root) {
    for (const el of root.querySelectorAll('div')) {
      const st = getComputedStyle(el);
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) return el;
    }
    return null;
  }

  // Sayfada görünen kişi / gönderi sayısı: kaydedilenle karşılaştırılır (tanınmayan yanıtı ortaya çıkarır)
  const PROFILE_HREF = /^\/[\w.]{1,30}\/$/;
  function countProfiles(root) {
    const names = new Set();
    for (const a of root.querySelectorAll('a[href^="/"]')) {
      const h = a.getAttribute('href') || '';
      if (PROFILE_HREF.test(h)) names.add(h.toLowerCase());
    }
    return names.size;
  }
  function countPosts() {
    const codes = new Set();
    for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
      const m = (a.getAttribute('href') || '').match(/\/(?:p|reel)\/([\w-]+)/);
      if (m) codes.add(m[1]);
    }
    return codes.size;
  }

  function loginWall() {
    return /\/accounts\/login|\/challenge\//.test(location.pathname);
  }

  async function collectPosts() {
    if (loginWall()) return { error: "Instagram giriş sayfası açıldı; Instagram oturumu kapalı ya da doğrulama istiyor. Instagram'a giriş yapıp tekrar deneyin." };
    await scrollToEnd(() => document.scrollingElement, 80, [1300, 3000]);
    return { seen: countPosts() };
  }

  async function collectLikers(code) {
    if (loginWall()) return { error: "Instagram giriş sayfası açıldı; Instagram oturumu kapalı ya da doğrulama istiyor." };
    if (/\/accounts\/|page not found|sayfa bulunamadı/i.test(document.title)) return { error: 'Gönderi açılamadı: silinmiş ya da arşivlenmiş olabilir.' };
    // Tam liste sayfası (/liked_by/): sayfanın kendisini kaydır
    if (/\/liked_by\/?$/.test(location.pathname)) {
      const ready = await waitFor(() => countProfiles(document) > 0, 12000);
      if (ready) {
        await sleep(rand(1200, 2200));
        const first = countProfiles(document);
        const pageBox = () => scrollableIn(document.body) || document.scrollingElement;
        const steps = await scrollToEnd(pageBox, 200, [900, 2200]);
        const seen = countProfiles(document);
        return { seen, detail: `Tam liste sayfası kaydırıldı (${steps} adım): ${first} → ${seen} kişi göründü.` };
      }
    }
    const link = await waitFor(() => document.querySelector(`a[href$="/p/${code}/liked_by/"], a[href$="/liked_by/"]`), 12000);
    if (!link) {
      return { error: 'Beğenme sayısı sayfada bulunamadı. Gönderinin beğeni sayısı gizlenmiş, hiç beğenisi yok ya da Instagram sayfa düzenini değiştirmiş olabilir. Gönderiyi açıp sayıya kendiniz tıklayarak deneyebilirsiniz.' };
    }
    await sleep(rand(600, 1400));
    link.click();
    const dialog = await waitFor(() => document.querySelector('[role="dialog"]'), 12000);
    if (!dialog) return { error: 'Beğenme sayısına tıklandı ama beğenenler listesi 12 saniye içinde açılmadı. Bağlantı yavaş olabilir; tekrar deneyin.' };
    await sleep(rand(1200, 2200));
    // Az beğenili gönderide liste kaydırılabilir olmaz: ilk sayfa zaten kaydedildi
    const box = await waitFor(() => scrollableIn(dialog), 6000);
    const first = countProfiles(dialog);
    const steps = box ? await scrollToEnd(() => box, 120, [900, 2200]) : 0;
    const seen = countProfiles(dialog);
    // Ölçüm: kaydırma ek kişi getirdi mi? (Instagram ilk ~100'den sonrasını vermiyorsa burada görünür)
    const detail = box ? `Liste kaydırıldı (${steps} adım): ${first} → ${seen} kişi göründü.` : `Liste kaydırılamadı; ${first} kişi göründü.`;
    return { seen, detail };
  }

  // ── Takip / takipten çıkma ────────────────────────────────────────────────
  // Profili açar, "Takip ediliyor" / "Takip et" düğmesine bir insan gibi tıklar, sonucu doğrular.
  // Hiçbir istek göndermez; yalnızca görünür düğmeler.
  const FOLLOWING_RE = /^(following|takip ediliyor|takiptesin)$/i;
  const FOLLOW_RE = /^(follow|follow back|takip et|geri takip et|sen de takip et)$/i;
  const REQUESTED_RE = /^(requested|[iİ]stek gönderildi|i̇stek gönderildi)$/i;
  const UNFOLLOW_RE = /^(unfollow|takibi bırak|takipten çık)$/i;
  const BLOCKED_RE = /try again later|action blocked|we restrict certain activity|restrict certain activity|daha sonra tekrar dene|bazı etkinlikleri kısıtlıyoruz|işlem engellendi/i;

  // Düğme metni: Instagram okun erişilebilirlik metnini de içine yazar ("TakiptesinAşağı Ok Simgesi",
  // "Following" + "Down chevron icon"). Simge öğeleri ve sondaki simge açıklaması atılır.
  const ICON_TAIL = /\s*(aşağı ok simgesi|down chevron icon|chevron(?: down)? icon|[\wğüşöçıİĞÜŞÖÇ]+ simgesi|[\w]+ icon)$/i;
  function btnText(el) {
    const copy = el.cloneNode(true);
    for (const x of copy.querySelectorAll('svg, img, [aria-hidden="true"]')) x.remove();
    return (copy.textContent || '').replace(/\s+/g, ' ').trim().replace(ICON_TAIL, '').trim();
  }

  function profileButtons() {
    const out = [];
    for (const h of document.querySelectorAll('header')) {
      for (const el of h.querySelectorAll('button, [role="button"]')) out.push(el);
    }
    return out;
  }

  // Profil düğmesinin durumu: following | requested | follow | null
  function followState() {
    for (const el of profileButtons()) {
      const t = btnText(el);
      if (FOLLOWING_RE.test(t)) return { el, state: 'following' };
      if (REQUESTED_RE.test(t)) return { el, state: 'requested' };
      if (FOLLOW_RE.test(t)) return { el, state: 'follow' };
    }
    return null;
  }

  function blockedNotice() {
    for (const d of document.querySelectorAll('[role="dialog"], [role="alert"]')) {
      if (BLOCKED_RE.test(d.textContent || '')) return true;
    }
    return false;
  }

  function pageMissing(username) {
    const path = location.pathname.toLowerCase();
    if (!path.startsWith(`/${username.toLowerCase()}/`) && path !== `/${username.toLowerCase()}`) return true;
    return /page not found|sayfa bulunamadı|bu sayfa mevcut değil|isn't available|ulaşılamıyor/i.test(`${document.title} ${(document.body.innerText || document.body.textContent || '').slice(0, 600)}`);
  }

  async function performAction(item) {
    if (loginWall()) return { error: "Instagram giriş sayfası açıldı; Instagram oturumu kapalı ya da doğrulama istiyor." };
    if (!item || !/^[\w.]{1,30}$/.test(String(item.username || '')) || (item.action !== 'follow' && item.action !== 'unfollow')) {
      return { error: 'Geçersiz işlem.' };
    }
    if (cfg.username && item.username.toLowerCase() === cfg.username.toLowerCase()) return { error: 'Kendi hesabınız için işlem yapılmaz.' };
    const first = await waitFor(() => followState() || (pageMissing(item.username) ? { missing: true } : null), 14000);
    if (!first || first.missing) {
      if (first) return { outcome: 'not_found', note: 'Hesap bulunamadı: silinmiş, dondurulmuş ya da kullanıcı adı değişmiş olabilir.' };
      // Düğmeyi tanıyamadık: ne bulduğumuzu yaz ki sorun görülebilsin (yalnızca düğme metinleri)
      const seen = profileButtons().map(btnText).filter(Boolean).slice(0, 6).join(' | ');
      return { outcome: 'failed', note: `Takip düğmesi tanınmadı (sayfadaki düğmeler: ${seen || 'yok'}). Instagram sayfa düzeni değişmiş olabilir.` };
    }
    if (blockedNotice()) return { outcome: 'blocked', note: 'Instagram bir kısıtlama uyarısı gösterdi.' };
    await sleep(rand(1500, 3500));                           // profile bakıyormuş gibi bekle
    const cur = followState();
    if (!cur) return { outcome: 'failed', note: 'Takip düğmesi kayboldu; sayfa değişti.' };

    if (item.action === 'unfollow') {
      if (cur.state === 'follow') return { outcome: 'already', note: 'Zaten takip etmiyorsunuz.' };
      cur.el.click();
      await sleep(rand(900, 1800));
      const findConfirm = () => {
        for (const d of document.querySelectorAll('[role="dialog"]')) {
          for (const el of d.querySelectorAll('button, [role="button"], [role="menuitem"]')) if (UNFOLLOW_RE.test(btnText(el))) return el;
        }
        return null;
      };
      // Önce menüdeki "Takibi bırak"; gizli hesaplarda Instagram bir kez daha onay isteyebilir
      for (let i = 0; i < 2; i++) {
        const confirmBtn = await waitFor(findConfirm, i === 0 ? 6000 : 3000);
        if (!confirmBtn) break;
        await sleep(rand(700, 1500));
        confirmBtn.click();
        await sleep(rand(900, 1600));
      }
      await sleep(rand(1500, 2500));
      const after = await waitFor(() => { const s = followState(); return s && s.state === 'follow' ? s : null; }, 8000);
      if (after) return { outcome: 'done' };
    } else {
      if (cur.state !== 'follow') return { outcome: 'already', note: cur.state === 'requested' ? 'Takip isteği zaten gönderilmiş.' : 'Zaten takip ediyorsunuz.' };
      cur.el.click();
      await sleep(rand(1500, 2500));
      const after = await waitFor(() => { const s = followState(); return s && s.state !== 'follow' ? s : null; }, 8000);
      if (after) return { outcome: 'done', note: after.state === 'requested' ? 'Gizli hesap: takip isteği gönderildi.' : undefined };
    }
    if (blockedNotice()) return { outcome: 'blocked', note: 'Instagram işlemi engelledi.' };
    return { outcome: 'failed', note: 'Düğmeye tıklandı ama sonuç doğrulanamadı; Instagram sayfa düzenini değiştirmiş olabilir.' };
  }

  // ── Takip / takipten çıkma: doğrudan istek ─────────────────────────────────
  // Instagram web uygulamasının kendi uç noktaları, kullanıcının bu sekmedeki oturumuyla (aynı kaynak, çerezler).
  // Token (csrftoken) yalnızca burada okunur; uygulamaya, günlüğe ya da nota ASLA yazılmaz. Sekme açılmaz.
  const IG_APP_ID = '936619743392459';          // Instagram web uygulamasının herkese açık uygulama kimliği
  const csrfToken = () => (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || '';

  function apiHeaders(post) {
    const h = { 'X-CSRFToken': csrfToken(), 'X-IG-App-ID': IG_APP_ID, 'X-Requested-With': 'XMLHttpRequest', Accept: '*/*' };
    let claim = null;
    try { claim = sessionStorage.getItem('www-claim-v2'); } catch { /* erişilemezse gönderme */ }
    if (claim) h['X-IG-WWW-Claim'] = claim;
    if (post) h['Content-Type'] = 'application/x-www-form-urlencoded';
    return h;
  }

  async function igFetch(path, init) {
    const res = await fetch(path, { credentials: 'include', headers: apiHeaders(!!(init && init.method === 'POST')), ...init });
    let json = null;
    try { json = await res.json(); } catch { /* HTML ya da boş yanıt */ }
    return { status: res.status, json };
  }

  // Instagram'ın hız / spam / doğrulama engeli
  function blockedResponse(r) {
    const msg = String((r.json && (r.json.message || r.json.error_type || r.json.spam)) || '');
    if (r.status === 429) return true;
    if (r.status === 400 || r.status === 403) return /feedback_required|spam|checkpoint|challenge|rate|wait a few minutes|try again later|restrict/i.test(msg + JSON.stringify(r.json || {}).slice(0, 400));
    return false;
  }

  // Kullanıcı kimliği: uygulamada gerçek kimlik varsa o; geçici (negatif) ise profil sayfasının gömülü verisinden
  async function resolveUserId(item) {
    if (Number(item.igUserId) > 0) return { id: String(item.igUserId) };
    const res = await fetch(`/${encodeURIComponent(item.username)}/`, { credentials: 'include', headers: { Accept: 'text/html' } });
    if (res.status === 404) return { missing: true };
    const html = await res.text();
    const m = html.match(/"profile_id":"(\d{5,20})"/);
    return m ? { id: m[1] } : { unknown: true };
  }

  // İşlemden sonra gerçek durumu yeniden oku (kısa bir an bekleyip)
  async function currentState(id) {
    await sleep(rand(900, 1500));
    const s = await igFetch(`/api/v1/friendships/show/${id}/`);
    if (s.status !== 200 || !s.json) return null;
    return { following: s.json.following === true, requested: s.json.outgoing_request === true };
  }

  // Hata ayıklama için yanıtın yalnızca alan ADLARI (değerler değil: token / kişisel veri sızmasın)
  const shape = (j) => (j && typeof j === 'object' ? ` (yanıt alanları: ${Object.keys(j).slice(0, 6).join(', ')})` : ' (yanıt JSON değil)');

  async function apiAct(item) {
    if (!csrfToken() || loginWall()) return { error: 'Instagram giriş sayfası açıldı; Instagram oturumu kapalı ya da doğrulama istiyor.' };
    if (!item || !/^[\w.]{1,30}$/.test(String(item.username || '')) || (item.action !== 'follow' && item.action !== 'unfollow')) return { error: 'Geçersiz işlem.' };
    if (cfg.username && item.username.toLowerCase() === cfg.username.toLowerCase()) return { error: 'Kendi hesabınız için işlem yapılmaz.' };
    try {
      const who = await resolveUserId(item);
      if (who.missing) return { outcome: 'not_found', note: 'Hesap bulunamadı: silinmiş, dondurulmuş ya da kullanıcı adı değişmiş olabilir.' };
      if (!who.id) return { outcome: 'failed', note: 'Hesap kimliği okunamadı (Instagram sayfa düzeni değişmiş olabilir).' };

      // Önce gerçek durum: uygulamadaki kayıt eski olabilir
      const show = await igFetch(`/api/v1/friendships/show/${who.id}/`);
      if (blockedResponse(show)) return { outcome: 'blocked', note: 'Instagram bir kısıtlama uyarısı gösterdi.' };
      if (show.status === 401 || (show.json && show.json.message === 'login_required')) return { error: 'Instagram giriş sayfası açıldı; Instagram oturumu kapalı ya da doğrulama istiyor.' };
      if (show.status !== 200 || !show.json) return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP ${show.status}).` };
      const following = show.json.following === true;
      const requested = show.json.outgoing_request === true;

      if (item.action === 'unfollow') {
        if (!following && !requested) return { outcome: 'already', note: 'Zaten takip etmiyorsunuz.' };
        const r = await igFetch(`/api/v1/friendships/destroy/${who.id}/`, { method: 'POST', body: new URLSearchParams({ container_module: 'profile', user_id: who.id }).toString() });
        if (blockedResponse(r)) return { outcome: 'blocked', note: 'Instagram işlemi engelledi.' };
        if (r.status !== 200) return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP ${r.status}).` };
        // Sonuç, yanıt gövdesinin şekline değil Instagram'ın gerçek durumuna bakılarak doğrulanır
        const after = await currentState(who.id);
        if (after && !after.following && !after.requested) return { outcome: 'done' };
        return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP 200); takipten çıkılamadı, durum hâlâ takipte${shape(r.json)}.` };
      }
      if (following) return { outcome: 'already', note: 'Zaten takip ediyorsunuz.' };
      if (requested) return { outcome: 'already', note: 'Takip isteği zaten gönderilmiş.' };
      const r = await igFetch(`/api/v1/friendships/create/${who.id}/`, { method: 'POST', body: new URLSearchParams({ container_module: 'profile', user_id: who.id }).toString() });
      if (blockedResponse(r)) return { outcome: 'blocked', note: 'Instagram işlemi engelledi.' };
      if (r.status !== 200) return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP ${r.status}).` };
      const after = await currentState(who.id);
      if (after && (after.following || after.requested)) {
        return { outcome: 'done', note: after.requested && !after.following ? 'Gizli hesap: takip isteği gönderildi.' : undefined };
      }
      return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP 200); takip edilemedi${shape(r.json)}.` };
    } catch (e) {
      return { outcome: 'failed', note: `Instagram isteği başarısız (ağ hatası).` };
    }
  }

  // Arka plan hangi kişiyi ne zaman yapacağımızı söyler; sonucu ona bildiririz. Aynı anda tek döngü.
  let apiLoop = false;
  async function runApiJob(jobId) {
    if (apiLoop) return;
    apiLoop = true;
    try {
      let result = null;
      for (let guard = 0; guard < 400; guard++) {
        let next;
        try { next = await chrome.runtime.sendMessage({ type: 'ia-api-next', jobId, result }); } catch { break; }
        if (!next || !next.item) break;
        if (next.waitMs > 0) await sleep(next.waitMs);
        result = await apiAct(next.item);
      }
    } finally {
      apiLoop = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return false;
    if (msg.type === 'ia-api-ping') { sendResponse({ ok: true, csrf: !!csrfToken(), loginWall: loginWall() }); return false; }
    if (msg.type === 'ia-api-run' && typeof msg.jobId === 'string') { runApiJob(msg.jobId); sendResponse({ ok: true }); return false; }
    return false;
  });
  // Bu sekmeyi doğrudan istekler için aday olarak bildir (sekme izni gerekmez)
  chrome.runtime.sendMessage({ type: 'ia-tab-hello' }).catch(() => {});

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
    if (loginWall()) return { error: "Instagram giriş sayfası açıldı; Instagram oturumu kapalı ya da doğrulama istiyor." };
    await sleep(rand(1500, 2500));
    let clicks = 0;
    for (let i = 0; i < 60; i++) {
      const btn = moreCommentsButton();
      if (!btn) break;
      btn.click();
      clicks += 1;
      await sleep(rand(1200, 2600));
      report({ step: i + 1 });
    }
    const root = document.querySelector('main') || document.body;
    return { seen: Math.max(0, countProfiles(root) - 1), clicks };   // gönderi sahibi hariç kabaca
  }

  function report(extra) {
    chrome.runtime.sendMessage({ type: 'ia-job-progress', ...extra }).catch(() => {});
  }

  async function runJob(job) {
    let out = {};
    try {
      await sleep(rand(1500, 3000));                       // sayfa otursun
      if (job.kind === 'posts') out = await collectPosts();
      else if (job.kind === 'likers') out = await collectLikers(String(job.shortcode || ''));
      else if (job.kind === 'comments') out = await collectComments();
      else if (job.kind === 'actions') out = await performAction(job.item);
      await sleep(rand(1500, 2500));                       // son yanıtlar iletilsin
    } catch (e) {
      out = { error: `Sayfada beklenmeyen bir durum oldu (${String((e && e.message) || e).slice(0, 120)}).` };
    }
    chrome.runtime.sendMessage({ type: 'ia-job-done', error: out.error || null, seen: Number(out.seen) || 0, detail: out.detail ? String(out.detail).slice(0, 200) : null,
      outcome: out.outcome || null, note: out.note ? String(out.note).slice(0, 300) : null }).catch(() => {});
    // Takip işlemlerinde bir sonrakine geçene dek bekleme uzun: servis çalışanını uyanık tutan ve süreyi denetleyen nabız
    if (job.kind === 'actions') setInterval(() => chrome.runtime.sendMessage({ type: 'ia-job-tick' }).catch(() => {}), 15000);
  }

  async function loadConfig() {
    try {
      applyConfig(await chrome.runtime.sendMessage({ type: 'ia-config', viewer: viewerId() }));
    } catch {
      applyConfig({ on: false });
    }
  }

  // Hesap kimliği sayfa yenilenince geç okunabilir: o zamana dek yeniden dene (tampondaki yanıtlar kaybolmasın)
  async function loadConfigRetrying() {
    for (let i = 0; i < 20; i++) {
      await loadConfig();
      if (cfg.on || viewerId()) return;
      await sleep(500);
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
  loadConfigRetrying();
  if (document.readyState === 'complete') onReady();
  else window.addEventListener('load', onReady, { once: true });
  // Gömülü veri DOMContentLoaded'da hazır; yükleme bitmesini beklemeden bir kez daha oku
  document.addEventListener('DOMContentLoaded', () => { loadConfig().then(scanEmbedded); }, { once: true });
})();
