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
    // Kendi kaydedilenler sayfam (ve koleksiyonları) asla gözlenmez (AC-S6)
    if (me && (path.toLowerCase() === `/${me}/saved` || path.toLowerCase().startsWith(`/${me}/saved/`))) return false;
    return !!me && (path.toLowerCase() === `/${me}/` || path.toLowerCase().startsWith(`/${me}/`));
  }

  // Gövde bekçisi (AC-C55, S-28/S-29): DM kutusu meta verisi ve oturum anahtarı kalıpları. `forward()` tek geçittir;
  // `ia-observed` yolu da `scanEmbedded` de buradan geçer. Desen eşleşirse bütün blok düşer (sorgu adından bağımsız).
  const BODY_GUARD = /get_slide_mailbox|iris_subscription|as_ig_direct_thread|threads_by_folder|direct_v2|"thread_|DTSGInitialData|"LSD",\[\]|"csrf_token"/;

  // FB-1 sayaçları: YALNIZ sayı. İletilen blok, bekçiye takılan blok, bunlardan gönderi verisi içerenler. Gövde, url ya da
  // başka içerik tutulmaz, loglanmaz, hiçbir yere gönderilmez; yalnız bu betiğin kendi `window`'undan okunur (hata ayıklama).
  const guardStats = { forwarded: 0, guarded: 0, guardedWithPostData: 0 };
  const looksLikePost = (t) => t.indexOf('"username"') !== -1 && (t.indexOf('"taken_at') !== -1 || t.indexOf('liker') !== -1);
  window.__iaGuardStats = () => ({ forwarded: guardStats.forwarded, guarded: guardStats.guarded, guardedWithPostData: guardStats.guardedWithPostData });

  function forward(payload) {
    if (payload && ((typeof payload.text === 'string' && BODY_GUARD.test(payload.text)) ||
        (typeof payload.variables === 'string' && BODY_GUARD.test(payload.variables)))) {
      guardStats.guarded += 1;
      if (looksLikePost(payload.text)) guardStats.guardedWithPostData += 1;
      return;
    }
    guardStats.forwarded += 1;
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
  // Instagram web uygulaması takipten çıkmayı artık GraphQL ile yapar (eski /api/v1/friendships/destroy yolu ölü:
  // HTML döner). İstek, sayfanın kendi oturum anahtarlarıyla (csrftoken çerezi, sayfa verisindeki LSD / DTSG) ve
  // kullanıcının bu sekmedeki oturumuyla yapılır. Anahtarlar yalnızca burada okunur; uygulamaya, günlüğe ya da
  // nota ASLA yazılmaz. Sekme açılmaz.
  const IG_APP_ID = '936619743392459';                  // Instagram web uygulamasının herkese açık uygulama kimliği
  const ASBD_ID = '359341';
  const UNFOLLOW_DOC_ID = '27789106940691111';           // usePolarisUnfollowMutation (Instagram web, canlı istekten alındı)
  const UNFOLLOW_NAME = 'usePolarisUnfollowMutation';
  const csrfToken = () => (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || '';
  const viewerCookie = () => (document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/) || [])[1] || '';

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

  // Sayfanın gömülü verisindeki oturum anahtarları (LSD, DTSG)
  function pageTokens() {
    let lsd = null;
    let dtsg = null;
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent || '';
      if (!lsd) { const m = t.match(/\["LSD",\[\],\{"token":"([^"]+)"/); if (m) lsd = m[1]; }
      if (!dtsg) { const m = t.match(/\["DTSGInitialData",\[\],\{"token":"([^"]+)"/); if (m) dtsg = m[1]; }
      if (lsd && dtsg) break;
    }
    if (!lsd || !dtsg) return null;
    return { lsd, dtsg, jazoest: '2' + [...dtsg].reduce((a, ch) => a + ch.charCodeAt(0), 0) };
  }

  // Instagram'ın hız / spam / doğrulama engeli
  function blockedResponse(r) {
    const text = JSON.stringify(r.json || {}).slice(0, 600);
    if (r.status === 429) return true;
    return /feedback_required|spam|checkpoint_required|challenge_required|rate.?limit|wait a few minutes|try again later|restrict certain/i.test(text);
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

  // İşlemden sonra gerçek durumu yeniden oku; Instagram'ın duruma yansıtması gecikebilir, bu yüzden birkaç kez bak
  async function currentState(id, expectFollowing) {
    let last = null;
    for (const [lo, hi] of [[900, 1500], [2000, 3000], [3500, 5000]]) {
      await sleep(rand(lo, hi));
      const s = await igFetch(`/api/v1/friendships/show/${id}/`);
      if (s.status !== 200 || !s.json) continue;
      last = { following: s.json.following === true, requested: s.json.outgoing_request === true };
      if (expectFollowing ? (last.following || last.requested) : (!last.following && !last.requested)) return last;
    }
    return last;
  }

  // Hata ayıklama için yanıtın yalnızca alan ADLARI ve Instagram'ın kısa hata iletisi (değer / token asla)
  function shape(j) {
    if (!j || typeof j !== 'object') return ' (yanıt JSON değil)';
    const err = Array.isArray(j.errors) && j.errors[0] && typeof j.errors[0].message === 'string' ? `; ileti: ${j.errors[0].message.slice(0, 80)}` : '';
    return ` (yanıt alanları: ${Object.keys(j).slice(0, 6).join(', ')}${err})`;
  }

  async function graphqlUnfollow(id, tokens) {
    const body = new URLSearchParams({
      av: viewerCookie(), __d: 'www', __user: '0', __a: '1', __req: '1', dpr: '1', __comet_req: '7',
      fb_dtsg: tokens.dtsg, jazoest: tokens.jazoest, lsd: tokens.lsd,
      fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: UNFOLLOW_NAME,
      variables: JSON.stringify({ target_user_id: id, container_module: 'profile', nav_chain: 'PolarisProfilePostsTabRoot:profilePage:1' }),
      server_timestamps: 'true', doc_id: UNFOLLOW_DOC_ID,
    }).toString();
    const res = await fetch('/api/graphql', {
      method: 'POST', credentials: 'include', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrfToken(), 'X-IG-App-ID': IG_APP_ID,
        'X-FB-LSD': tokens.lsd, 'X-FB-Friendly-Name': UNFOLLOW_NAME, 'X-ASBD-ID': ASBD_ID },
    });
    let json = null;
    try { json = JSON.parse((await res.text()).replace(/^for \(;;\);/, '')); } catch { /* JSON değil */ }
    return { status: res.status, json };
  }

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

      if (item.action === 'follow') {
        if (following) return { outcome: 'already', note: 'Zaten takip ediyorsunuz.' };
        if (requested) return { outcome: 'already', note: 'Takip isteği zaten gönderilmiş.' };
        return { outcome: 'failed', note: 'Takip etme doğrudan istekle henüz desteklenmiyor; takipten çıkma destekleniyor.' };
      }

      if (!following && !requested) return { outcome: 'already', note: 'Zaten takip etmiyorsunuz.' };
      const tokens = pageTokens();
      if (!tokens) return { outcome: 'failed', note: 'Instagram oturum anahtarları sayfada bulunamadı (sayfa tam yüklenmemiş olabilir).' };
      const r = await graphqlUnfollow(who.id, tokens);
      if (blockedResponse(r)) return { outcome: 'blocked', note: 'Instagram işlemi engelledi.' };
      if (r.status !== 200) return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP ${r.status}).` };
      // Sonuç, yanıt gövdesinin şekline değil Instagram'ın gerçek durumuna bakılarak doğrulanır
      const after = await currentState(who.id, false);
      if (after && !after.following && !after.requested) return { outcome: 'done' };
      return { outcome: 'failed', note: `Instagram isteği başarısız (HTTP 200); takipten çıkılamadı, durum hâlâ takipte${shape(r.json)}.` };
    } catch (e) {
      return { outcome: 'failed', note: 'Instagram isteği başarısız (ağ hatası).' };
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

  // ── Kaydedilenler temizliği (SPEC-001 v1.6, T-8a) ─────────────────────────────
  // Bu bölüm yalnız KENDİ gönderdiği isteklerin yanıtını okur; ia-observed akışını ve listener.js'in yakaladığı
  // yanıtları hiç kullanmaz (AC-C55). Gövdeyi yerel ayrıştırır, uygulamaya yalnız kod / HTTP durumu / alan adı gider (AC-C28).
  //
  // İçerik betiği ↔ arka plan sözleşmesi (arka plan tarafı cleanup-bg.js, T-9). Hepsi chrome.runtime.sendMessage:
  //   arka plan → içerik: { type:'ia-cl-run', jobId, kind:'saved_scan'|'saved_unsave', collectionChoice? }, { type:'ia-cl-abort', jobId }
  //   içerik → arka plan (yanıtı arka plan verir; içerik yalnız aşağıda adı geçen alanları okur):
  //     ia-cl-next      { jobId, result|null }       → { item:{id, ref}|null, delay:[a,b] sn, readGap?:[a,b] sn, allow:[koleksiyon kimliği] }
  //     ia-cl-precheck  { jobId, itemId, collectionIds, viewer } → { action:'write'|'wait'(+retryAfterMs)|'skip'|'report'(+outcome,note_code)|'end' }
  //     ia-cl-beat      { jobId }                      (bekleme sırasında 15 sn'de bir)
  //     ia-cl-collections { jobId, available, collections?|note_code? }  → yanıt kullanılmaz
  //     ia-cl-page      { jobId, pageNo, items, skipped } → { continue:true, waitMs } | { end:true }
  //     ia-cl-finish    { jobId, outcome, note_code?, http_status?, fields? }
  //   result: { item_id, outcome, note_code?, http_status?, fields?, wrote }
  // doc_id, sorgu adı ve variables yalnız aşağıdaki sabitlerden ve doğrulanmış ref'ten kurulur; hiçbir mesaj bunları taşıyamaz (AC-C56).
  // Kaynak (kurul N-11): SPEC-001-spike.md "T-0c"; değerler yazmasız yoldan (sayfanın Relay modülleri) alındı, 2026-11-08.
  const UNSAVE_DOC_ID = '27371251859134880';
  const UNSAVE_NAME = 'usePolarisSaveMediaUnsaveMutation';
  const COLLECTIONS_DOC_ID = '29115677831365401';
  const COLLECTIONS_NAME = 'PolarisSavedCollectionPickerQuery';

  const NUM_ID_RE = /^\d{1,25}$/;
  const CODE_RE = /^[\w-]{5,40}$/;
  const OWNER_RE = /^[a-z0-9._]{1,30}$/;
  const FIELD_NAME_RE = /^[a-z_][a-z0-9_]{0,39}$/;
  const THUMB_HOST_RE = /\.(cdninstagram\.com|fbcdn\.net)$/;
  const MAX_COLLECTION_IDS = 20;
  const MAX_COLLECTION_PAGES = 4;
  const READ_GAP_DEFAULT = [3, 6];                       // sn; tarama sayfa gecikmesinin varsayılanı (AC-C52)
  const VERIFY_DELAYS = [[900, 1500], [2000, 3000], [3500, 5000]];   // ms; content.js currentState deseni
  const BLOCK_CODES = ['feedback_required', 'checkpoint_required', 'challenge_required'];
  let mutationSeq = 0;                                   // client_mutation_id: sekme başına 1'den artan, anlamsız, kaydedilmez
  let clActive = null;                                   // { jobId, aborted }

  // pk: string pk; değilse string id'nin "_" öncesi. Sayı pk asla çevrilmez (2^53 üstü yuvarlanır; R7 M6)
  function pkOf(media) {
    let pk = null;
    if (typeof media.pk === 'string') pk = media.pk;
    else if (typeof media.id === 'string') pk = media.id.split('_')[0];
    return pk && NUM_ID_RE.test(pk) ? pk : null;
  }

  // Geçerli koleksiyon dizisi: ≤ 20 öğe, hepsi ^\d{1,25}$ string. Aksi null (çağıran fail-closed davranır; süzülmez, R6 H-2)
  function validCollectionIds(v) {
    if (!Array.isArray(v) || v.length > MAX_COLLECTION_IDS) return null;
    return v.every((x) => typeof x === 'string' && NUM_ID_RE.test(x)) ? v.slice() : null;
  }

  function thumbnailOf(media) {
    const iv = (media.image_versions2 && media.image_versions2.candidates) ? media.image_versions2
      : (Array.isArray(media.carousel_media) && media.carousel_media[0] && media.carousel_media[0].image_versions2) || null;
    const cands = iv && Array.isArray(iv.candidates) ? iv.candidates.filter((c) => c && typeof c.url === 'string') : [];
    if (!cands.length) return null;
    const big = cands.filter((c) => Number(c.width) >= 150).sort((a, b) => Number(a.width) - Number(b.width));
    const url = (big[0] || cands[0]).url;
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password && THUMB_HOST_RE.test(u.hostname) && url.length <= 2000 ? url : null;
    } catch { return null; }
  }

  // Saf alan kurucusu (§7.2.1): yalnız `Saved` alanları. Atlanacak öğede null.
  function toSavedItem(entry) {
    const media = entry && typeof entry === 'object' ? entry.media : null;
    if (!media || typeof media !== 'object') return null;
    const pk = pkOf(media);
    if (!pk || typeof media.code !== 'string' || !CODE_RE.test(media.code)) return null;
    const out = { media_id: pk, shortcode: media.code };
    const owner = media.user && typeof media.user.username === 'string' ? media.user.username.toLowerCase() : '';
    if (OWNER_RE.test(owner)) out.owner_username = owner;
    const type = { 1: 'image', 2: 'video', 8: 'carousel' }[media.media_type];
    if (type) out.media_type = type;
    out.is_ad = media.product_type === 'ad';
    const thumb = thumbnailOf(media);
    if (thumb) out.thumbnail_url = thumb;
    if (Array.isArray(media.saved_collection_ids)) {
      const ids = validCollectionIds(media.saved_collection_ids);
      if (ids) out.collection_ids = ids;
      else out.collections_unreadable = true;
    }
    return out;
  }

  // Dar engel deseni (R6 M-6): yalnız yapısal alanlar; serbest metinde "try again later" engel sayılmaz
  function isBlockBody(j) {
    if (!j || typeof j !== 'object') return false;
    return BLOCK_CODES.includes(j.message) || BLOCK_CODES.includes(j.error_type) || j.spam === true;
  }

  function topFields(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return undefined;
    const f = Object.keys(j).filter((k) => FIELD_NAME_RE.test(k)).slice(0, 10);
    return f.length ? f : undefined;
  }

  const clSend = (msg) => chrome.runtime.sendMessage(msg);

  // Bölünmüş bekleme: iptal edilince hemen çıkar, 15 sn'de bir kalp atışı gönderir. true = süre doldu, false = iptal
  async function clSleep(job, ms) {
    let left = Math.max(0, ms);
    let sinceBeat = 0;
    while (left > 0) {
      if (job.aborted) return false;
      const step = Math.min(1000, left);
      await sleep(step);
      left -= step;
      sinceBeat += step;
      if (sinceBeat >= 15000) { sinceBeat = 0; clSend({ type: 'ia-cl-beat', jobId: job.jobId }).catch(() => {}); }
    }
    return !job.aborted;
  }
  const secRange = (r, dflt) => {
    const a = Array.isArray(r) ? Number(r[0]) : NaN;
    const b = Array.isArray(r) ? Number(r[1]) : NaN;
    const [lo, hi] = Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= a && b <= 3600 ? [a, b] : dflt;
    return (lo + Math.random() * (hi - lo)) * 1000;
  };

  // GraphQL (unsave ve koleksiyon listesi): token'lar yalnız burada, istekten hemen önce okunur ve yalnız /api/graphql'e gider (AC-C54)
  let graphqlCall = 0;
  async function igGraphql(name, docId, variables) {
    const tokens = pageTokens();
    if (!tokens) return { tokensMissing: true };
    graphqlCall += 1;
    const body = new URLSearchParams({
      av: viewerCookie(), __d: 'www', __user: '0', __a: '1', __req: String(graphqlCall), dpr: '1', __comet_req: '7',
      fb_dtsg: tokens.dtsg, jazoest: tokens.jazoest, lsd: tokens.lsd,
      fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: name,
      variables: JSON.stringify(variables), server_timestamps: 'true', doc_id: docId,
    }).toString();
    const res = await fetch('/api/graphql', {
      method: 'POST', credentials: 'include', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrfToken(), 'X-IG-App-ID': IG_APP_ID,
        'X-FB-LSD': tokens.lsd, 'X-FB-Friendly-Name': name, 'X-ASBD-ID': ASBD_ID },
    });
    let json = null;
    try { json = JSON.parse((await res.text()).replace(/^for \(;;\);/, '')); } catch { /* JSON değil */ }
    return { status: res.status, json };
  }

  // Gönderi bilgisi okuması (yalnız okuma). § AC-C52 adım 1-2.
  async function readInfo(pk) {
    let r;
    try { r = await igFetch(`/api/v1/media/${encodeURIComponent(pk)}/info/`); } catch { return { kind: 'fail', note_code: 'network' }; }
    const j = r.json && typeof r.json === 'object' ? r.json : null;
    if (r.status === 429) return { kind: 'fail', note_code: 'rate_limited', http_status: 429 };
    if (r.status === 401 || (j && j.message === 'login_required')) return { kind: 'fail', note_code: 'login_required', http_status: r.status };
    if (r.status === 404 || r.status === 410) return { kind: 'not_found', http_status: r.status };
    if (isBlockBody(j)) return { kind: 'blocked' };
    if (r.status !== 200) return { kind: 'fail', note_code: 'http_error', http_status: r.status };
    if (!j) return { kind: 'fail', note_code: 'not_json', http_status: 200 };
    const media = Array.isArray(j.items) && j.items.length ? j.items[0] : null;
    if (!media || typeof media !== 'object' || typeof media.pk !== 'string' || media.pk !== pk) return { kind: 'fail', note_code: 'unrecognised_shape', http_status: 200 };
    const saved = media.has_viewer_saved === true;       // alan yok ya da true değil = kaydedilmemiş (v1.6)
    return { kind: 'ok', saved, ids: saved ? validCollectionIds(media.saved_collection_ids) : [] };   // saved && ids === null: okunamadı -> korunur
  }

  // Doğrulama okuması: en fazla 3 deneme. state: unsaved | saved | unavailable | rate_limited | login_required | not_found
  async function verifyUnsaved(job, pk) {
    let anyRead = false;
    for (const [lo, hi] of VERIFY_DELAYS) {
      if (!(await clSleep(job, lo + Math.random() * (hi - lo)))) return { state: 'aborted' };
      let r;
      try { r = await igFetch(`/api/v1/media/${encodeURIComponent(pk)}/info/`); } catch { continue; }
      if (r.status === 429) return { state: 'rate_limited' };
      if (r.status === 401 || (r.json && r.json.message === 'login_required')) return { state: 'login_required' };
      if (r.status === 404 || r.status === 410) return { state: 'not_found' };
      const media = r.status === 200 && r.json && Array.isArray(r.json.items) ? r.json.items[0] : null;
      if (!media || typeof media !== 'object') continue;     // 5xx, ağ, boş yanıt: sıradaki deneme
      anyRead = true;
      if (media.has_viewer_saved !== true) return { state: 'unsaved' };
    }
    return { state: anyRead ? 'saved' : 'unavailable' };
  }

  const R = (item, outcome, extra) => ({ item_id: item.id, outcome, wrote: false, ...extra });

  // Unsave yanıtının sınıfı (§7.9.4 B; ilk tutan satır)
  function classifyUnsave(r, pk) {
    if (r.status === 429) return { row: 1 };
    if (r.status === 401 || (r.json && r.json.message === 'login_required')) return { row: 2 };
    const media = r.json && r.json.data && r.json.data.xig_media_unsave && r.json.data.xig_media_unsave.media;
    if (r.status === 200 && media && media.id === pk) return { row: 3 };
    if (isBlockBody(r.json)) return { row: 4 };
    if (r.status >= 500) return { row: 5 };
    return { row: 6 };
  }

  // Yazmadan sonraki sonuç (satır 3, 5, 6 doğrulama okumasıyla birlikte)
  async function afterWrite(job, item, row, r) {
    const v = await verifyUnsaved(job, item.ref);
    const W = (outcome, extra) => R(item, outcome, { wrote: true, ...extra });
    if (v.state === 'aborted') return { end: true };
    if (v.state === 'rate_limited') return W('failed', { note_code: 'rate_limited', http_status: 429 });
    if (v.state === 'login_required') return W('failed', { note_code: 'login_required' });
    if (v.state === 'not_found') return W('not_found', { note_code: 'not_found' });
    if (v.state === 'unsaved') return W('done', row === 6 ? { fields: topFields(r.json) } : {});
    if (row === 3) return W('failed', { note_code: v.state === 'saved' ? 'verify_failed' : 'verify_unavailable' });
    if (row === 5) return v.state === 'saved' ? W('failed', { note_code: 'http_error', http_status: r.status }) : W('failed', { note_code: 'verify_unavailable' });
    return W('failed', { note_code: 'mutation_unrecognised', http_status: r.status, fields: topFields(r.json) });
  }

  async function unsaveOne(job, item, allow) {
    if (!csrfToken() || loginWall()) return R(item, 'failed', { note_code: 'login_required' });
    const rd = await readInfo(item.ref);
    if (rd.kind === 'blocked') return R(item, 'blocked', { note_code: 'blocked' });
    if (rd.kind === 'not_found') return R(item, 'not_found', { note_code: 'not_found', http_status: rd.http_status });
    if (rd.kind === 'fail') return R(item, 'failed', { note_code: rd.note_code, http_status: rd.http_status });
    if (!rd.saved) return R(item, 'already', { note_code: 'already' });
    // Koruma kuralı (§6.10): alan okunamadıysa korunur; boş dizi korunmaz; hepsi allow içindeyse korunmaz
    if (rd.ids === null || (rd.ids.length > 0 && !rd.ids.every((x) => allow.includes(x)))) return R(item, 'protected', { note_code: 'in_collection' });

    const viewer = viewerCookie();
    if (!viewer) return R(item, 'failed', { note_code: 'login_required' });
    for (;;) {
      let pc;
      try { pc = await clSend({ type: 'ia-cl-precheck', jobId: job.jobId, itemId: item.id, collectionIds: rd.ids, viewer }); } catch { return { end: true }; }
      const action = pc && typeof pc === 'object' ? pc.action : null;
      if (action === 'wait') { if (!(await clSleep(job, Math.min(Math.max(Number(pc.retryAfterMs) || 1000, 1000), 3600000)))) return { end: true }; continue; }
      if (action === 'skip') return { skip: true };
      if (action === 'report') {
        const outcome = pc.outcome === 'protected' ? 'protected' : 'failed';
        return R(item, outcome, { note_code: outcome === 'protected' ? 'in_collection' : 'precheck_unavailable' });
      }
      if (action !== 'write') return { end: true };
      break;
    }
    if (job.aborted) return { end: true };

    // Yazma: actor_id, precheck'te gönderilen viewer ile aynı olmalı (AC-S17)
    if (viewerCookie() !== viewer) return R(item, 'failed', { note_code: 'account_mismatch' });
    let r;
    try {
      r = await igGraphql(UNSAVE_NAME, UNSAVE_DOC_ID, { input: { media_id: item.ref, actor_id: viewer, client_mutation_id: String(++mutationSeq) } });
    } catch { r = { status: 0, json: null, netError: true }; }
    if (r.tokensMissing) return R(item, 'failed', { note_code: 'tokens_missing' });
    if (r.netError) return afterWrite(job, item, 5, { status: 0, json: null });
    const c = classifyUnsave(r, item.ref);
    const W = (outcome, extra) => R(item, outcome, { wrote: true, ...extra });
    if (c.row === 1) return W('failed', { note_code: 'rate_limited', http_status: 429 });
    if (c.row === 2) return W('failed', { note_code: 'login_required', http_status: r.status });
    if (c.row === 4) return W('blocked', { note_code: 'blocked' });
    return afterWrite(job, item, c.row, r);
  }

  async function runUnsaveJob(job) {
    let result = null;
    let lastWrote = false;
    let first = true;
    for (let guard = 0; guard < 1200 && !job.aborted; guard++) {
      let next;
      try { next = await clSend({ type: 'ia-cl-next', jobId: job.jobId, result }); } catch { return; }
      result = null;
      const item = next && next.item;
      if (!item) return;
      const ok = Number.isInteger(item.id) && item.id > 0 && typeof item.ref === 'string' && NUM_ID_RE.test(item.ref);
      const allow = Array.isArray(next.allow) ? next.allow.filter((x) => typeof x === 'string' && NUM_ID_RE.test(x)) : [];
      // Gecikme yalnız gerçek bir yazmadan sonra; yazmasız biten öğeden sonra yalnız okuma aralığı (AC-C52)
      if (!first && !(await clSleep(job, lastWrote ? secRange(next.delay, [10, 45]) : secRange(next.readGap, READ_GAP_DEFAULT)))) return;
      first = false;
      if (!ok) { result = { item_id: Number.isInteger(item && item.id) ? item.id : 0, outcome: 'failed', note_code: 'unrecognised_shape', wrote: false }; lastWrote = false; continue; }
      let out;
      try { out = await unsaveOne(job, item, allow); } catch { out = R(item, 'failed', { note_code: 'exception' }); }
      if (out.end) return;
      if (out.skip) { lastWrote = false; continue; }
      lastWrote = out.wrote === true;
      result = out;
    }
  }

  // ── Tarama ───────────────────────────────────────────────────────────────────
  const finishScan = (job, outcome, note_code, http_status, fields) =>
    clSend({ type: 'ia-cl-finish', jobId: job.jobId, outcome, ...(note_code ? { note_code } : {}), ...(http_status ? { http_status } : {}), ...(fields ? { fields } : {}) }).catch(() => {});

  // Koleksiyon listesi (W, istek 4). { available, collections } | { available:false, note_code } | { finish:{...} }
  async function readCollections(job) {
    const unavailable = { available: false, note_code: 'collections_unavailable' };
    const all = [];
    let after = null;
    for (let page = 0; page < MAX_COLLECTION_PAGES; page++) {
      if (page > 0 && !(await clSleep(job, rand(1500, 3000)))) return { finish: null };
      let r;
      try { r = await igGraphql(COLLECTIONS_NAME, COLLECTIONS_DOC_ID, after ? { first: 50, after } : { first: 50 }); } catch { return unavailable; }
      if (r.tokensMissing) return unavailable;
      if (r.status === 429) return { finish: ['failed', 'rate_limited', 429] };
      if (isBlockBody(r.json)) return { finish: ['blocked', 'blocked'] };
      if (r.status === 401 || (r.json && r.json.message === 'login_required')) return { finish: ['failed', 'login_required', r.status] };
      const mc = r.status === 200 && r.json && r.json.data && r.json.data.viewer && r.json.data.viewer.media_collections;
      if (!mc || !Array.isArray(mc.edges) || !mc.page_info) return unavailable;
      for (const e of mc.edges) {
        const n = e && e.node;
        if (!n || typeof n.collection_id !== 'string' || !NUM_ID_RE.test(n.collection_id) || typeof n.collection_name !== 'string') return unavailable;
        all.push({ collection_id: n.collection_id, name: n.collection_name });   // başka alan (cover_media dahil) okunmaz
      }
      if (all.length > 200) return unavailable;
      if (mc.page_info.has_next_page !== true) return { available: true, collections: all };
      if (typeof mc.page_info.end_cursor !== 'string' || !mc.page_info.end_cursor) return unavailable;
      after = mc.page_info.end_cursor;
    }
    return unavailable;                                  // 4 sayfada bitmedi: 200'den fazla koleksiyon
  }

  async function runScanJob(job, collectionChoice) {
    if (!csrfToken() || loginWall()) { await finishScan(job, 'failed', 'login_required'); return; }
    if (collectionChoice === true && COLLECTIONS_DOC_ID) {
      let c;
      try { c = await readCollections(job); } catch { c = { available: false, note_code: 'collections_unavailable' }; }
      if (job.aborted) return;
      if (c.finish === null) return;
      if (c.finish) { await finishScan(job, ...c.finish); return; }
      await clSend({ type: 'ia-cl-collections', jobId: job.jobId, ...c }).catch(() => {});
    }
    let url = '/api/v1/feed/saved/posts/';
    let pageNo = 0;
    for (let guard = 0; guard < 400 && !job.aborted; guard++) {
      const fail = (note, status) => finishScan(job, pageNo > 0 ? 'partial' : 'failed', note, status);
      let r;
      try { r = await igFetch(url); } catch { await fail('network'); return; }
      const j = r.json && typeof r.json === 'object' ? r.json : null;
      if (r.status === 429) { await fail('rate_limited', 429); return; }
      if (r.status === 401 || (j && j.message === 'login_required')) { await fail('login_required', r.status); return; }
      if (isBlockBody(j)) { await finishScan(job, 'blocked', 'blocked'); return; }
      if (r.status !== 200) { await fail('http_error', r.status); return; }
      if (!j) { await fail('not_json', 200); return; }
      if (!Array.isArray(j.items)) { await fail('unrecognised_shape', 200); return; }
      // Şekil değişmiş olabilir: dolu sayfada hiçbir öğede has_viewer_saved === true yoksa tarama başarısız (R6 M-8)
      if (j.items.length > 0 && !j.items.some((x) => x && x.media && x.media.has_viewer_saved === true)) { await fail('unrecognised_shape', 200); return; }
      const items = j.items.map(toSavedItem).filter(Boolean);
      if (items.length) {
        pageNo += 1;
        let reply;
        try { reply = await clSend({ type: 'ia-cl-page', jobId: job.jobId, pageNo, items, skipped: j.items.length - items.length }); } catch { return; }
        if (!reply || reply.continue !== true) return;                    // arka plan sonucu kendisi yönetti
        if (j.more_available !== true || typeof j.next_max_id !== 'string' || !j.next_max_id) { await finishScan(job, 'ok'); return; }
        url = `/api/v1/feed/saved/posts/?max_id=${encodeURIComponent(j.next_max_id)}`;
        if (!(await clSleep(job, Math.min(Math.max(Number(reply.waitMs) || 3000, 0), 600000)))) return;
        continue;
      }
      if (j.more_available === true && typeof j.next_max_id === 'string' && j.next_max_id && j.items.length > 0) {
        url = `/api/v1/feed/saved/posts/?max_id=${encodeURIComponent(j.next_max_id)}`;   // sayfadaki hiçbir öğe kullanılamadı: sonrakine geç
        if (!(await clSleep(job, secRange(null, READ_GAP_DEFAULT)))) return;
        continue;
      }
      await finishScan(job, 'ok');
      return;
    }
  }

  function startCleanupJob(msg) {
    if (clActive || typeof msg.jobId !== 'string' || !msg.jobId) return false;
    const job = { jobId: msg.jobId, aborted: false };
    clActive = job;
    const work = msg.kind === 'saved_scan' ? runScanJob(job, msg.collectionChoice) : runUnsaveJob(job);
    work.catch(() => {}).finally(() => { if (clActive === job) clActive = null; });
    return true;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return false;
    if (msg.type === 'ia-api-ping') { sendResponse({ ok: true, csrf: !!csrfToken(), loginWall: loginWall() }); return false; }
    if (msg.type === 'ia-api-run' && typeof msg.jobId === 'string') { runApiJob(msg.jobId); sendResponse({ ok: true }); return false; }
    if (msg.type === 'ia-cl-run' && (msg.kind === 'saved_scan' || msg.kind === 'saved_unsave')) { sendResponse({ ok: startCleanupJob(msg) }); return false; }
    if (msg.type === 'ia-cl-abort' && clActive && clActive.jobId === msg.jobId) { clActive.aborted = true; sendResponse({ ok: true }); return false; }
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
