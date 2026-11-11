// InstaAnalytic Köprüsü: arka plan, Kaydedilenler temizliği (SPEC-001 v1.6, T-9).
//
// background.js tarafından `importScripts` ile yüklenir ve `globalThis.iaCleanup` isim alanını kurar (kurul N-1).
// Instagram'a hiçbir istek göndermez: yalnız bu bilgisayardaki uygulamayla konuşur (next, precheck, result, stop, tarama uçları).
// Instagram isteklerini sekmedeki content.js yapar; sözleşme content.js başındaki "ia-cl-*" yorumundadır.
//
// Kurallar: sunucu partiyi zaten durdurduysa `stop` ÇAĞRILMAZ; yalnız eklentinin kendi gördüğü nedenlerde
// (user_stop, circuit_breaker, already_streak, tab_closed, eski işin ölü sayılması) `stop(reason, run_seq)` çağrılır (§6.6, AC-C51).
// jobView ve iş raporu yalnız sayı taşır; öğe listesi yalnız chrome.storage.session'dadır (AC-C29).
// doc_id, sorgu adı ve variables bu dosyada hiç yoktur ve komut / next yanıtından alınmaz (AC-C56).
(() => {
  'use strict';

  const g = globalThis;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const NUM_ID_RE = /^\d{1,25}$/;
  const VIEWER_RE = /^\d{1,20}$/;
  const NOTE_RE = /^[a-z_]{1,30}$/;
  const FIELD_NAME_RE = /^[a-z_][a-z0-9_]{0,39}$/;
  const OUTCOMES = ['done', 'already', 'not_found', 'protected', 'failed', 'blocked'];
  const SCAN_OUTCOMES = ['ok', 'partial', 'failed', 'blocked'];
  const API_DEAD_AFTER_MS = 60 * 1000;              // background.js ile aynı varsayılan; her next yanıtı `stale_after_ms` ile değiştirir
  const BREAKER = 5;                                // ardışık failed / too_soon / already
  const MAX_INT = Number.MAX_SAFE_INTEGER;

  // §7.9.5 (TR). Sunucu nedenleri ve eklenti nedenleri; kullanıcıya yalnız bu metinler gösterilir.
  const TEXT = {
    user_stop: 'Sen durdurdun.',
    limit: 'Saatlik ya da günlük sınıra ulaşıldı.',
    quiet_hours: 'Sessiz saatler (01:00-08:00).',
    off: 'Bu ek iş kapatıldı.',
    paused: 'İşlemler duraklatıldı.',
    blocked: 'Instagram işlemi engelledi; tüm işlemler 24 saat duraklatıldı.',
    rate_limited: "Instagram çok sık istek yapıldığını söyledi. Bir süre bekleyip Başlat'a bas.",
    circuit_breaker: 'Art arda 5 işlem başarısız oldu.',
    account_mismatch: "Instagram'da başka bir hesap açık.",
    viewer_unknown: "Bu profilin Instagram kimliği henüz bilinmiyor.",
    extension_outdated: 'Eklenti güncel değil; 2.9.0 veya üstü gerekli.',
    login_required: 'Instagram oturumu kapalı ya da doğrulama istiyor.',
    tab_closed: 'Instagram sekmesi kapandı.',
    network: "Ağ hatası; Instagram'a ulaşılamadı.",
    unrecognised_shape: "Instagram'ın yanıtı tanınmadı; sayfa düzeni değişmiş olabilir.",
    tokens_missing: 'Instagram oturum anahtarları sayfada bulunamadı; sekmeyi yenile.',
    read_limit: "Saatlik okuma sınırına ulaşıldı; bir süre sonra Başlat'a bas.",
    mutation_unrecognised: "Instagram kaydedilenlerden çıkarma isteğini tanımadı; Instagram güncellenmiş olabilir. Bu gönderi değişmedi. Eklentinin yeni sürümü gerekiyor.",
    extension_update_required: "Bu parti için eklentinin yeni sürümü gerekiyor; güncelleyip Başlat'a bas.",
    already_streak: "Art arda 5 gönderi zaten kaydedilmemiş görünüyor. Bunları Instagram'da kendin çıkardıysan: kalanları iptal et, yeniden tara ve yeniden önizle. Çıkarmadıysan Instagram'ın yanıtı değişmiş olabilir; eklentinin güncellenmesi gerekebilir.",
    stale: "Eklentiden haber gelmedi; Instagram sekmesi kapanmış ya da bilgisayar uykuya geçmiş olabilir.",
    start_failed: 'Eklenti işi başlatamadı.',
    feature_off: 'Bu ek iş kapalı.',
    scan_closed: 'Tarama zaten kapanmış.',
    stopped: 'İş durduruldu.',
    page_cap: 'Tarama sayfa sınırına ulaştı.',
    not_found: 'Profil ya da parti bulunamadı.',
    unreachable: 'Uygulamaya ulaşılamadı.',
    save_failed: 'Yapılan işlem kaydedilemedi.',
    unexpected: 'Beklenmeyen yanıt.',
    empty: 'Yapılacak işlem kalmadı.',
  };
  const text = (code) => TEXT[code] || TEXT.unexpected;

  let env = null;                                   // background.js'in verdiği yardımcılar (test edilebilirlik için enjekte)
  let lock = Promise.resolve();
  // Aynı işe ait mesajlar (next, precheck, beat ...) sırayla işlenir: oku-değiştir-yaz yarışı olmasın
  const serial = (fn) => { const run = lock.then(fn); lock = run.catch(() => {}); return run; };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pairOk = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])) && Number(p[0]) >= 0 && Number(p[1]) >= Number(p[0]);

  // ── Komut doğrulama (AC-C33, K-3, C56): yalnız bilinen alanlar; fazlası atılır ─────────────────────────
  function cleanCommand(cmd) {
    if (!cmd || typeof cmd !== 'object' || !['saved_scan', 'saved_unsave'].includes(cmd.kind)) return null;
    if (!UUID_RE.test(String(cmd.session_id || ''))) return null;
    const out = { kind: cmd.kind, session_id: String(cmd.session_id) };
    if (cmd.kind === 'saved_unsave') {
      const batch = Number(cmd.batch_id);
      const seq = Number(cmd.run_seq);
      if (!Number.isSafeInteger(batch) || batch < 1 || !Number.isSafeInteger(seq) || seq < 0) return null;
      out.batch_id = batch;
      out.run_seq = seq;
    }
    return out;
  }

  // ── Uygulama çağrıları ─────────────────────────────────────────────────────
  async function app(path, body, timeoutMs) {
    const cfg = await env.getCfg();
    return env.callApp(cfg.appUrl, path, body, timeoutMs);
  }
  const base = (profileId) => `/api/sessions/${profileId}/cleanup`;
  const version = () => env.chrome.runtime.getManifest().version;
  const code = (r) => (r && r.data && r.data.detail && typeof r.data.detail.code === 'string' ? r.data.detail.code : null);

  // Sunucunun sıradaki öğeleri. { items, delay, staleMs, allow } | { empty:true } | { end:true, why }
  async function fetchNext(ctx) {
    const r = await app(`${base(ctx.profileId)}/saved/next`, { batch_id: ctx.batchId, run_seq: ctx.runSeq, viewer_id: ctx.viewer, ext_version: version(), limit: 10 }, 20000);
    if (r.status === 0 || r.status >= 500) return { end: true, why: 'unreachable' };
    if (r.status === 404) return { end: true, why: 'not_found' };
    if (r.status === 409) {
      const c = code(r);
      return { end: true, why: c === 'extension_update_required' || c === 'account_mismatch' || c === 'viewer_unknown' || c === 'extension_outdated' ? c : 'stopped' };
    }
    const d = r.status === 200 && r.data && typeof r.data === 'object' ? r.data : null;
    if (!d) return { end: true, why: 'unexpected' };
    if (d.reason === 'empty') return { empty: true };
    if (d.reason) return { end: true, why: TEXT[d.reason] ? d.reason : 'stopped' };          // limit, quiet_hours, off, paused, stopped
    const items = (Array.isArray(d.items) ? d.items : [])
      .filter((x) => x && Number.isSafeInteger(x.id) && x.id > 0 && typeof x.ref === 'string' && NUM_ID_RE.test(x.ref))
      .map((x) => ({ id: x.id, ref: x.ref }));                                             // etiket (kullanıcı adı) tutulmaz
    if (!items.length) return { empty: true };
    return {
      items,
      delay: pairOk(d.delay) ? [Number(d.delay[0]), Number(d.delay[1])] : [10, 45],
      staleMs: Number.isFinite(Number(d.stale_after_ms)) && Number(d.stale_after_ms) > 0 ? Number(d.stale_after_ms) : null,
      allow: (Array.isArray(d.allow_collections) ? d.allow_collections : []).filter((x) => typeof x === 'string' && NUM_ID_RE.test(x)),
    };
  }

  // `stop`: yalnız eklentinin kendi nedenleri. Sonucu iş akışını değiştirmez (best effort)
  async function stopServer(job, reason) {
    if (job.kind !== 'saved_unsave') return;
    await app(`${base(job.profileId)}/batches/${job.batchId}/stop`, { reason, run_seq: job.runSeq, viewer_id: job.viewer }, 20000).catch(() => {});
  }

  function cleanNote(v) { return typeof v === 'string' && NOTE_RE.test(v) ? v : undefined; }
  function cleanStatus(v) { return Number.isInteger(v) && v >= 100 && v <= 599 ? v : undefined; }
  function cleanFields(v) {
    if (!Array.isArray(v)) return undefined;
    const f = v.filter((x) => typeof x === 'string' && FIELD_NAME_RE.test(x)).slice(0, 10);
    return f.length ? f : undefined;
  }
  const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  // ── İş durumu ────────────────────────────────────────────────────────────────
  const countsOf = (job) => job.counts || { done: 0, already: 0, not_found: 0, protected: 0, failed: 0 };
  const processed = (job) => Object.values(countsOf(job)).reduce((a, b) => a + b, 0);

  // Uygulama sayfasına / açılır pencereye giden görünüm: yalnız sayı (AC-C29). ref, etiket, kullanıcı adı yok.
  function view(job) {
    const c = countsOf(job);
    return {
      id: job.id, kind: job.kind, state: job.state, outcome: job.outcome || null, api: true, cleanup: true,
      total: job.kind === 'saved_scan' ? (job.pages || 0) : (job.total || 0), index: job.kind === 'saved_scan' ? (job.pages || 0) : processed(job),
      counts: job.kind === 'saved_scan' ? { pages: job.pages || 0, items: job.items || 0 } : { ...c },
      stopReason: job.stopReason || null, message: job.message || '', results: [], errors: [],
      startedAt: job.startedAt, finishedAt: job.finishedAt || null,
    };
  }

  async function save(job) {
    await env.chrome.storage.session.set({ job });
    await env.chrome.storage.local.set({ jobView: view(job) });
  }

  function progressMessage(job) {
    if (job.kind === 'saved_scan') return `Kaydedilenler taranıyor: ${job.pages || 0} sayfa, ${job.items || 0} gönderi.`;
    return `Kaydedilenlerden çıkarma: ${processed(job)} işlendi.`;
  }

  async function reportJob(job) {
    const cfg = await env.getCfg();
    const c = countsOf(job);
    const n = job.kind === 'saved_scan' ? Math.min(job.pages || 0, 1000) : Math.min(processed(job), 1000);
    const ok = job.kind === 'saved_scan' ? n : Math.min(c.done + c.already + c.not_found + c.protected, 1000);
    await env.callApp(cfg.appUrl, '/api/bridge/jobs', {
      session_id: job.profileId, kind: job.kind, outcome: job.outcome, total: n, done: n, ok, saved: 0,
      message: `${n} / ${n}`,                                         // yalnız sayı (AC-C29)
      results: [], started_at: new Date(job.startedAt).toISOString(), finished_at: new Date(job.finishedAt).toISOString(),
    }).catch(() => {});
  }

  // İşin her bitiş yolu buradan geçer. `why`: kullanıcıya gösterilen neden kodu (TEXT).
  async function finish(job, state, why, outcome) {
    if (job.state !== 'running') return;
    const c = countsOf(job);
    job.state = state;
    job.stopReason = why || null;
    job.finishedAt = Date.now();
    job.outcome = outcome || (state === 'stopped' ? 'stopped'
      : job.kind === 'saved_scan' ? 'ok' : c.failed === 0 ? 'ok' : (c.done + c.already + c.not_found + c.protected) > 0 ? 'partial' : 'failed');
    job.message = why ? text(why) : progressMessage(job);
    if (state === 'done' && !why) job.message = progressMessage(job);
    await save(job);
    try { env.chrome.tabs.sendMessage(job.tabId, { type: 'ia-cl-abort', jobId: job.id }, () => { void (env.chrome.runtime.lastError); }); } catch { /* sekme gitmiş olabilir */ }
    if (job.ownTab && job.tabId != null) setTimeout(() => { env.chrome.tabs.remove(job.tabId).catch(() => {}); }, 1500);
    env.notify(job.outcome === 'ok' ? 'ok' : 'warning', job.kind === 'saved_scan' ? 'Kaydedilenler taraması' : 'Kaydedilenlerden çıkarma', job.message);
    await reportJob(job);
    env.checkUpdate(true).catch(() => {});
  }

  // ── Sekme ────────────────────────────────────────────────────────────────────
  function tabSend(tabId, msg) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      try {
        env.chrome.tabs.sendMessage(tabId, msg, (res) => { clearTimeout(timer); void (env.chrome.runtime.lastError); resolve(res || null); });
      } catch { clearTimeout(timer); resolve(null); }
    });
  }

  async function acquireTab() {
    const found = await env.findIgTab();
    if (found.id == null && found.loggedOut) return { error: "Açık Instagram sekmesinde oturum görünmüyor. Instagram'a giriş yapıp tekrar dene." };
    if (found.id != null) return { id: found.id, own: false };
    const own = await env.openOwnIgTab();
    if (own.id == null) return { error: "Instagram sekmesi açılamadı ya da yanıt vermedi. Instagram'ı bir sekmede açıp sayfayı yenile, sonra tekrar dene." };
    if (!own.ready) {
      env.chrome.tabs.remove(own.id).catch(() => {});
      return { error: "Instagram'da oturum görünmüyor. Instagram'a giriş yapıp tekrar dene." };
    }
    return { id: own.id, own: true };
  }

  // ── Başlatma ─────────────────────────────────────────────────────────────────
  async function startJob(cmdIn) {
    const cmd = cleanCommand(cmdIn);
    if (!cmd) return { ok: false, error: 'Geçersiz iş.' };

    const running = await env.getJob();
    if (running && running.state === 'running') {
      const beat = running.beat || running.startedAt || 0;
      if (running.api && Date.now() - beat > (running.deadAfterMs || API_DEAD_AFTER_MS)) {
        if (running.cleanup) await finishDead(running);
        else await env.finishJob(running, 'stopped', 'İş yanıt vermediği için durduruldu.');
      } else {
        return { ok: false, code: 'running', error: 'Zaten çalışan bir iş var.' };
      }
    }

    const cfg = await env.getCfg();
    const profile = cfg.lastViewer ? cfg.profiles[cfg.lastViewer] : null;
    if (!profile) return { ok: false, error: "Önce Instagram'ı bir sekmede açıp eklentide profilinizi seçin." };
    // AC-C33: komuttaki profil eklentide seçili profilden farklıysa hiçbir şey yapılmaz
    if (profile.id !== cmd.session_id) return { ok: false, code: 'profile_mismatch', error: "Bu iş başka bir profil için başlatıldı; eklentide seçili profil farklı." };
    const viewer = String(cfg.lastViewer);
    if (!VIEWER_RE.test(viewer)) return { ok: false, error: "Önce Instagram'ı bir sekmede açıp eklentide profilinizi seçin." };

    const tab = await acquireTab();
    if (tab.error) return { ok: false, error: tab.error };
    const dropTab = () => { if (tab.own) env.chrome.tabs.remove(tab.id).catch(() => {}); };

    const job = {
      id: `c${Date.now()}`, kind: cmd.kind, cleanup: true, api: true, state: 'running', startedAt: Date.now(), beat: Date.now(),
      profileId: profile.id, viewer, tabId: tab.id, ownTab: tab.own || undefined, counts: { done: 0, already: 0, not_found: 0, protected: 0, failed: 0 },
      failStreak: 0, alreadyStreak: 0, tooSoon: { id: 0, n: 0 }, queue: [], total: 0, pages: 0, items: 0,
    };

    let collectionChoice = false;
    if (cmd.kind === 'saved_scan') {
      const r = await app(`${base(profile.id)}/saved/scan/start`, { viewer_id: viewer, ext_version: version() }, 20000);
      if (r.status === 0 || r.status >= 500) { dropTab(); return { ok: false, error: text('unreachable') }; }
      if (r.status !== 200 || !r.data) {
        dropTab();
        const c = code(r);
        const retry = r.data && r.data.detail && Number(r.data.detail.retry_after) > 0 ? ` ${Math.ceil(Number(r.data.detail.retry_after))} sn sonra tekrar dene.` : '';
        return { ok: false, code: c || 'invalid', error: `${TEXT[c] || 'Tarama başlatılamadı.'}${retry}` };
      }
      const d = r.data;
      if (typeof d.scan_id !== 'number' && typeof d.scan_id !== 'string') { dropTab(); return { ok: false, error: text('unexpected') }; }
      job.scanId = d.scan_id;
      job.pageDelay = pairOk(d.page_delay) ? [Number(d.page_delay[0]), Number(d.page_delay[1])] : [3, 6];
      job.deadAfterMs = Number(d.stale_after_ms) > 0 ? Number(d.stale_after_ms) : undefined;
      collectionChoice = d.collection_choice === true;
    } else {
      job.batchId = cmd.batch_id;
      job.runSeq = cmd.run_seq;
      const n = await fetchNext(job);
      if (n.end) { dropTab(); return { ok: false, code: n.why, error: text(n.why) }; }
      if (n.empty) { dropTab(); return { ok: false, code: 'empty', error: text('empty') }; }
      job.queue = n.items; job.total = n.items.length; job.delay = n.delay; job.allow = n.allow;
      job.deadAfterMs = n.staleMs || undefined;
    }
    job.message = progressMessage(job);
    await save(job);

    const reply = await tabSend(tab.id, { type: 'ia-cl-run', jobId: job.id, kind: cmd.kind, collectionChoice });
    if (!reply || reply.ok !== true) {
      job.state = 'stopped'; job.stopReason = 'start_failed'; job.finishedAt = Date.now(); job.outcome = 'stopped'; job.message = text('start_failed');
      await save(job);
      dropTab();
      return { ok: false, code: 'start_failed', error: "Instagram sekmesi işi başlatamadı. Sayfayı yenileyip tekrar dene." };
    }
    return { ok: true, total: job.total };
  }

  // ── Sekmeden gelen mesajlar (ia-cl-*) ────────────────────────────────────────
  const END = { 'ia-cl-next': { item: null }, 'ia-cl-precheck': { action: 'end' }, 'ia-cl-page': { end: true } };

  function handleMessage(msg, tabId) {
    return serial(async () => {
      const dflt = END[msg && msg.type] || { ok: false };
      const job = await env.getJob();
      if (!job || !job.cleanup || job.state !== 'running' || job.tabId !== tabId || !msg || msg.jobId !== job.id) return dflt;
      job.beat = Date.now();
      try {
        switch (msg.type) {
          case 'ia-cl-beat': await save(job); return { ok: true };
          case 'ia-cl-next': return await onNext(job, msg);
          case 'ia-cl-precheck': return await onPrecheck(job, msg);
          case 'ia-cl-collections': return await onCollections(job, msg);
          case 'ia-cl-page': return await onPage(job, msg);
          case 'ia-cl-finish': return await onFinish(job, msg);
          default: return dflt;
        }
      } catch {
        await finish(job, 'stopped', 'unexpected');
        return dflt;
      }
    });
  }

  // Bir sonucu uygulamaya yazar; true = iş bitti (çağıran öğe vermez)
  async function postResult(job, r) {
    const item = job.current;
    job.current = null;
    if (!item || !r || typeof r !== 'object' || r.item_id !== item.id || !OUTCOMES.includes(r.outcome)) return false;
    const body = { viewer_id: job.viewer, run_seq: job.runSeq, outcome: r.outcome, ...defined({ note_code: cleanNote(r.note_code), http_status: cleanStatus(r.http_status), fields: cleanFields(r.fields) }) };
    const res = await app(`${base(job.profileId)}/items/${item.id}/result`, body, 30000);
    if (res.status === 0 || res.status >= 500) {
      await stopServer(job, 'stale');                                 // "stop dener; başaramaz" (§6.6): sunucu T sonra stale yapar
      await finish(job, 'stopped', 'save_failed');
      return true;
    }
    if (res.status === 409) { await finish(job, 'stopped', code(res) === 'account_mismatch' ? 'account_mismatch' : 'stopped'); return true; }
    if (res.status === 422) { await finish(job, 'stopped', 'unexpected'); return true; }
    if (res.status === 404) return false;                             // öğe/parti artık yok: devam
    if (res.status !== 200 || !res.data) { await finish(job, 'stopped', 'save_failed'); return true; }

    const retry = res.data.retry === true && r.outcome === 'failed';
    if (retry) { job.queue.push(item); job.total += 1; }              // işin sonuna yeniden eklenir
    else countsOf(job)[r.outcome === 'blocked' ? 'failed' : r.outcome] += 1;

    if (res.data.stopped === true) {                                  // sunucu partiyi kendisi durdurdu: stop ÇAĞRILMAZ
      await finish(job, 'stopped', r.outcome === 'blocked' ? 'blocked' : (TEXT[r.note_code] ? r.note_code : 'stopped'));
      return true;
    }
    job.failStreak = r.outcome === 'failed' ? job.failStreak + 1 : 0;
    job.alreadyStreak = r.outcome === 'already' ? job.alreadyStreak + 1 : 0;
    if (job.failStreak >= BREAKER) { await stopServer(job, 'circuit_breaker'); await finish(job, 'stopped', 'circuit_breaker'); return true; }
    if (job.alreadyStreak >= BREAKER) { await stopServer(job, 'already_streak'); await finish(job, 'stopped', 'already_streak'); return true; }
    return false;
  }

  async function onNext(job, msg) {
    if (msg.result && await postResult(job, msg.result)) return { item: null };
    if (!job.queue.length) {
      const n = await fetchNext(job);
      if (n.empty) { await finish(job, 'done'); return { item: null }; }
      if (n.end) { await finish(job, 'stopped', n.why); return { item: null }; }   // sunucu durdurdu ya da ulaşılamadı: stop yok
      job.queue = n.items; job.total += n.items.length; job.delay = n.delay; job.allow = n.allow;
      if (n.staleMs) job.deadAfterMs = n.staleMs;                                   // tek eşik: sunucunun verdiği T (AC-C30)
    }
    job.current = job.queue.shift();
    job.message = progressMessage(job);
    await save(job);
    return { item: { id: job.current.id, ref: job.current.ref }, delay: job.delay, allow: job.allow };
  }

  async function onPrecheck(job, msg) {
    const item = job.current;
    if (!item || msg.itemId !== item.id) return { action: 'end' };
    const viewer = VIEWER_RE.test(String(msg.viewer || '')) ? String(msg.viewer) : null;
    const ids = Array.isArray(msg.collectionIds) ? msg.collectionIds : null;
    if (!viewer) return { action: 'end' };
    // Geçersiz ya da uzun dizi: precheck gönderilmez, doğrudan protected (AC-S23)
    if (!ids || ids.length > 20 || !ids.every((x) => typeof x === 'string' && NUM_ID_RE.test(x))) return { action: 'report', outcome: 'protected' };
    const r = await app(`${base(job.profileId)}/items/${item.id}/precheck`, { viewer_id: viewer, ext_version: version(), run_seq: job.runSeq, collection_ids: ids }, 10000);
    const d = r.status === 200 && r.data && typeof r.data === 'object' ? r.data : null;

    if (d && d.allow === true && d.item_id === item.id) { job.tooSoon = { id: item.id, n: 0 }; await save(job); return { action: 'write' }; }
    if (d && d.allow === false) {
      if (d.reason === 'too_soon') {
        job.tooSoon = job.tooSoon && job.tooSoon.id === item.id ? { id: item.id, n: job.tooSoon.n + 1 } : { id: item.id, n: 1 };
        if (job.tooSoon.n >= BREAKER) { await stopServer(job, 'circuit_breaker'); await finish(job, 'stopped', 'circuit_breaker'); return { action: 'end' }; }
        await save(job);
        return { action: 'wait', retryAfterMs: Math.max(1, Math.ceil(Number(d.retry_after) || 1)) * 1000 };
      }
      if (d.reason === 'not_pending') return { action: 'skip' };
      if (d.reason === 'protected') return { action: 'report', outcome: 'protected' };
      await finish(job, 'stopped', TEXT[d.reason] ? d.reason : 'stopped');        // limit, quiet_hours, off, paused, stopped: sunucu durdurdu
      return { action: 'end' };
    }
    if (r.status === 409) { const c = code(r); await finish(job, 'stopped', TEXT[c] ? c : 'stopped'); return { action: 'end' }; }
    if (r.status === 404) return { action: 'skip' };
    return { action: 'report', outcome: 'failed' };                                 // 422, 0, 5xx, bozuk JSON, farklı item_id: precheck_unavailable
  }

  async function onCollections(job, msg) {
    let body;
    if (msg.available === true && Array.isArray(msg.collections) && msg.collections.length <= 200
      && msg.collections.every((c) => c && typeof c.collection_id === 'string' && NUM_ID_RE.test(c.collection_id) && typeof c.name === 'string')) {
      body = { viewer_id: job.viewer, available: true, collections: msg.collections.map((c) => ({ collection_id: c.collection_id, name: c.name })) };
    } else {
      body = { viewer_id: job.viewer, available: false, note_code: 'collections_unavailable' };
    }
    const path = `${base(job.profileId)}/saved/scan/${job.scanId}/collections`;
    const r = await app(path, body, 20000);
    // 422 hakkı tüketmez: bir kez available:false ile yeniden dene (K-7). 409: tarama F ile sürer.
    if (r.status === 422 && body.available === true) await app(path, { viewer_id: job.viewer, available: false, note_code: 'collections_unavailable' }, 20000);
    await save(job);
    return { ok: true };
  }

  async function postFinish(job, outcome, note, status, fields) {
    return app(`${base(job.profileId)}/saved/scan/${job.scanId}/finish`, { viewer_id: job.viewer, outcome, ...defined({ note_code: cleanNote(note), http_status: cleanStatus(status), fields: cleanFields(fields) }) }, 20000);
  }

  async function onPage(job, msg) {
    const items = Array.isArray(msg.items) ? msg.items : null;
    if (!items || items.length > 50 || !Number.isInteger(msg.pageNo) || msg.pageNo < 1) { await postFinish(job, job.pages > 0 ? 'partial' : 'failed', 'unrecognised_shape'); await finish(job, 'stopped', 'unrecognised_shape', 'failed'); return { end: true }; }
    const r = await app(`${base(job.profileId)}/saved/scan/${job.scanId}/page`, { viewer_id: job.viewer, page_no: msg.pageNo, items }, 60000);
    const partialOrFailed = job.pages > 0 ? 'partial' : 'failed';
    if (r.status === 0 || r.status >= 500) { await finish(job, 'stopped', 'unreachable', 'failed'); return { end: true }; }   // sunucu tarama eşiğinden sonra failed yapar
    if (r.status === 422) { await postFinish(job, partialOrFailed, 'unrecognised_shape'); await finish(job, 'stopped', 'unrecognised_shape', 'failed'); return { end: true }; }
    if (r.status === 403) { await postFinish(job, 'partial', 'feature_off'); await finish(job, 'stopped', 'feature_off', 'partial'); return { end: true }; }
    if (r.status === 409) { await finish(job, 'stopped', code(r) === 'account_mismatch' ? 'account_mismatch' : 'scan_closed', 'failed'); return { end: true }; }
    if (r.status !== 200 || !r.data) { await finish(job, 'stopped', 'unexpected', 'failed'); return { end: true }; }
    job.pages += 1;
    job.items += items.length;
    if (r.data.continue !== true) {
      await postFinish(job, 'partial', 'page_cap');
      await finish(job, 'stopped', 'page_cap', 'partial');
      return { end: true };
    }
    job.message = progressMessage(job);
    await save(job);
    const [lo, hi] = job.pageDelay || [3, 6];
    return { continue: true, waitMs: Math.round(rand(lo, hi) * 1000) };
  }

  async function onFinish(job, msg) {
    if (job.kind !== 'saved_scan' || !SCAN_OUTCOMES.includes(msg.outcome)) return { ok: false };
    const r = await postFinish(job, msg.outcome, msg.note_code, msg.http_status, msg.fields);
    const why = cleanNote(msg.note_code);
    if (r.status === 0 || r.status >= 500) { await finish(job, 'stopped', 'unreachable', 'failed'); return { ok: true }; }
    if (msg.outcome === 'ok') await finish(job, 'done');
    else await finish(job, 'stopped', why && TEXT[why] ? why : 'stopped', msg.outcome === 'partial' ? 'partial' : 'failed');
    return { ok: true };
  }

  // ── Dışarıdan gelen bitişler ─────────────────────────────────────────────────
  // Kullanıcı Durdur: beklemeyi hemen keser (abort), stop(user_stop, run_seq) çağırır (idempotent)
  function stopJob(job) {
    return serial(async () => {
      const cur = (await env.getJob()) || job;
      if (!cur || !cur.cleanup || cur.state !== 'running') return { ok: true };
      await ownEnd(cur, 'user_stop');
      return { ok: true };
    });
  }
  function tabClosed(job) {
    return serial(async () => {
      const cur = (await env.getJob()) || job;
      if (!cur || !cur.cleanup || cur.state !== 'running') return;
      await ownEnd(cur, 'tab_closed');
    });
  }
  // İkinci startJob eski işi ölü sayar: stop(stale, eski run_seq). Sunucuda yeni run_seq ile yeniden başlamışsa uyuşmazlık: değişiklik yok (K-3)
  function finishDead(job) {
    return serial(async () => {
      const cur = (await env.getJob()) || job;
      if (!cur || !cur.cleanup || cur.state !== 'running') return;
      await ownEnd(cur, 'stale');
    });
  }
  async function ownEnd(job, reason) {
    if (job.kind === 'saved_unsave') await stopServer(job, reason);
    else await postFinish(job, job.pages > 0 ? 'partial' : 'failed', reason).catch(() => {});
    await finish(job, 'stopped', reason);
  }

  g.iaCleanup = {
    init(e) { env = e; },
    cleanCommand, startJob, handleMessage, stopJob, tabClosed, finishDead,
  };
})();
