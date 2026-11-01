// InstaAnalytic Köprüsü: yalnızca bu bilgisayardaki uygulama sayfasında (localhost:3002) çalışır.
// Uygulama ile eklenti arasında aracı: eklentinin kurulu olduğunu ve sürümünü bildirir, uygulamanın
// başlattığı işleri (gönderi listesi / beğenenler / yorumlar) arka plana iletir ve iş durumunu geri yollar.
// Instagram'a ya da başka bir adrese hiçbir şey göndermez.
(() => {
  'use strict';

  const ORIGIN = location.origin;
  const version = chrome.runtime.getManifest().version;
  const KINDS = ['posts', 'likers', 'comments'];
  const SHORTCODE_RE = /^[\w-]{5,40}$/;

  function post(data) {
    window.postMessage({ __ia: true, ...data }, ORIGIN);
  }

  function announce() {
    post({ type: 'ia-ext', version });
  }

  // Komutun biçimini burada da denetle: arka plana yalnızca geçerli iş gider
  function cleanCmd(cmd) {
    if (!cmd || !KINDS.includes(cmd.kind)) return null;
    const out = { kind: cmd.kind };
    if (Array.isArray(cmd.shortcodes)) out.shortcodes = cmd.shortcodes.map(String).filter((c) => SHORTCODE_RE.test(c)).slice(0, 50);
    if (Number.isFinite(Number(cmd.count))) out.count = Math.max(1, Math.min(Number(cmd.count), 50));
    return out;
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== ORIGIN) return;
    const d = e.data;
    if (!d || d.__ia !== true || typeof d.type !== 'string') return;
    if (d.type === 'ia-ping') { announce(); return; }
    if (!['ia-run', 'ia-stop', 'ia-job'].includes(d.type)) return;
    let reply;
    try {
      if (d.type === 'ia-run') {
        const cmd = cleanCmd(d.cmd);
        reply = cmd ? await chrome.runtime.sendMessage({ type: 'ia-run', cmd }) : { ok: false, error: 'Geçersiz iş.' };
      } else {
        reply = await chrome.runtime.sendMessage({ type: d.type });
      }
    } catch {
      reply = { ok: false, error: 'Eklentiye ulaşılamadı. Sayfayı yenileyin.' };
    }
    post({ type: 'ia-reply', id: d.id, reply });
  });

  // Çalışan işin durumu değiştikçe uygulamaya bildir
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.jobView) post({ type: 'ia-job-update', job: changes.jobView.newValue || null });
  });

  announce();
})();
