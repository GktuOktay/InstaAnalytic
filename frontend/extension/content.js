// InstaAnalytic Köprüsü: Instagram sekmesinde (izole dünya) çalışır.
// listener.js'in yakaladığı yanıtları arka plana iletir. Instagram'a hiçbir istek göndermez.
// Sayfa ilk açıldığında HTML'e gömülü gelen veriyi (profilin ilk gönderileri, gönderi sayfası) de bir kez okur.
(() => {
  'use strict';

  const MAX_CHARS = 8 * 1024 * 1024;

  function forward(url, reqBody, status, text) {
    chrome.runtime.sendMessage({ type: 'ia-observed', url, reqBody, status, text, page: location.href })
      .catch(() => { /* eklenti güncellendiyse ya da kapalıysa sessizce geç */ });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.__ia !== 'ia-observed' || typeof d.url !== 'string' || typeof d.text !== 'string') return;
    if (!d.url.startsWith('https://www.instagram.com/') || d.text.length > MAX_CHARS) return;
    forward(d.url, typeof d.reqBody === 'string' ? d.reqBody : '', Number(d.status) || 0, d.text);
  });

  // Sayfaya gömülü JSON: yalnızca gönderi şekline benzeyenler
  function scanEmbedded() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const t = s.textContent || '';
      if (t.length > MAX_CHARS || t.indexOf('"username"') === -1) continue;
      if (t.indexOf('"taken_at') === -1 && t.indexOf('liker') === -1) continue;
      forward(location.href, '', 200, t);
    }
  }
  if (document.readyState === 'complete') scanEmbedded();
  else window.addEventListener('load', scanEmbedded, { once: true });
})();
