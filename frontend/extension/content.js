// InstaAnalytic Köprüsü: Instagram sekmesinin içinde çalışır.
// Tek işi: arka plandan gelen yolu, Instagram web uygulamasının kendi isteğiyle aynı başlıklarla getirmek.
// Yanıt ayrıştırılmaz; ham metin olarak döner (büyük sayılar JSON.parse'ta bozulmasın diye).
(() => {
  'use strict';

  // Arka plandaki ve sunucudaki ifadeyle birebir aynı. Bunun dışındaki hiçbir yol istenmez.
  const PATH_RE = /^\/api\/v1\/(feed\/user\/\d+\/\?count=12(&max_id=[\w%.-]+)?|media\/\d+\/likers\/(\?max_id=[\w%.-]+)?|media\/\d+\/comments\/\?can_support_threading=true&permalink_enabled=false(&min_id=[\w%.-]+)?)$/;
  const TIMEOUT_MS = 30000;

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  function wwwClaim() {
    try { return sessionStorage.getItem('www-claim-v2') || '0'; } catch { return '0'; }
  }

  async function igFetch(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://www.instagram.com' + path, {
        method: 'GET',
        credentials: 'include',
        signal: ctrl.signal,
        headers: {
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': readCookie('csrftoken'),
          'X-ASBD-ID': '129477',
          'X-IG-WWW-Claim': wwwClaim(),
          'Accept': '*/*',
        },
      });
      const text = await res.text();
      return { status: res.status, text };
    } catch {
      // Ağ hatası, zaman aşımı: yeniden denemek arka planın da işi değil, sunucu karar verir.
      return { status: 0, text: '' };
    } finally {
      clearTimeout(timer);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Yalnızca bu eklentinin arka planından gelen mesajlar
    if (sender.id !== chrome.runtime.id || sender.tab) return false;
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'ia-ping') {
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type !== 'ia-fetch') return false;

    if (typeof msg.path !== 'string' || !PATH_RE.test(msg.path)) {
      sendResponse({ status: 0, text: '', refused: true });
      return false;
    }
    igFetch(msg.path).then(sendResponse);
    return true; // yanıt asenkron gelecek
  });
})();
