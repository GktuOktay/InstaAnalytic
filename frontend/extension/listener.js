// InstaAnalytic Köprüsü: Instagram sayfasının kendi dünyasında (MAIN world) çalışır.
// Hiçbir istek göndermez. Sayfanın zaten yaptığı fetch / XHR isteklerinin YANITLARININ bir kopyasını okur
// ve içerik betiğine (content.js) iletir. Asıl yanıta dokunulmaz; sayfa aynen çalışmaya devam eder.
(() => {
  'use strict';
  if (window.__iaListener) return;
  window.__iaListener = true;

  const RELEVANT = /^https:\/\/www\.instagram\.com\/(graphql\/query|api\/graphql|api\/v1\/)/;
  // Mesajlar, bildirimler ve kayıt istekleri hiç okunmaz
  const SKIP = /\/api\/v1\/(direct|notifications|news|web\/log|qp|logging|bloks)/;
  const MAX_CHARS = 8 * 1024 * 1024;

  function bodyText(body) {
    try {
      if (typeof body === 'string') return body.slice(0, 65536);
      if (body instanceof URLSearchParams) return body.toString().slice(0, 65536);
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const p = new URLSearchParams();
        for (const [k, v] of body.entries()) if (typeof v === 'string') p.append(k, v);
        return p.toString().slice(0, 65536);
      }
    } catch { /* yoksay */ }
    return '';
  }

  function emit(url, reqBody, status, text) {
    if (typeof text !== 'string' || !text || text.length > MAX_CHARS) return;
    // Başarılı ama kullanıcı listesi içermeyen yanıtlar ilgisiz; hata yanıtları (ör. 429) uyarı için iletilir
    if (status === 200 && text.indexOf('"username"') === -1) return;
    window.postMessage({ __ia: 'ia-observed', url, reqBody, status, text, page: location.href }, location.origin);
  }

  function absolute(url) {
    try { return new URL(url, location.href).href; } catch { return ''; }
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = absolute(typeof input === 'string' ? input : (input && input.url) || String(input || ''));
      if (RELEVANT.test(url) && !SKIP.test(url)) {
        const reqBody = bodyText(init && init.body);
        p.then((res) => res.clone().text().then((t) => emit(url, reqBody, res.status, t))).catch(() => {});
      }
    } catch { /* sayfayı asla bozma */ }
    return p;
  };

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__iaUrl = absolute(url); } catch { /* yoksay */ }
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      const url = this.__iaUrl || '';
      if (RELEVANT.test(url) && !SKIP.test(url)) {
        const reqBody = bodyText(body);
        this.addEventListener('load', () => {
          try {
            let t = '';
            if (this.responseType === '' || this.responseType === 'text') t = this.responseText;
            else if (this.responseType === 'json') t = JSON.stringify(this.response);
            emit(url, reqBody, this.status, t);
          } catch { /* yoksay */ }
        });
      }
    } catch { /* yoksay */ }
    return XS.apply(this, arguments);
  };
})();
