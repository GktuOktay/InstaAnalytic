// InstaAnalytic Köprüsü: Instagram sayfasının kendi dünyasında (MAIN world) çalışır.
//
// Yalnızca OKUR. Hiçbir istek göndermez, hiçbir isteği değiştirmez, sayfaya bir şey eklemez.
// Sayfanın zaten yaptığı isteklerin yanıtlarının bir kopyasını, eklenti açıkken ve yalnızca gönderi /
// beğenen / yorum / profil ızgarasıyla ilgili isteklerde içerik betiğine (content.js) iletir.
// İstek gövdesinden yalnızca sorgu adı ve değişkenleri alınır; oturum anahtarları (fb_dtsg, lsd vb.) asla alınmaz.
(() => {
  'use strict';
  if (window.__iaListener) return;
  window.__iaListener = true;

  let enabled = false;   // content.js açar; kapalıyken hiçbir yanıt kopyalanmaz

  const ORIGIN = 'https://www.instagram.com';
  // REST: gönderi beğenenleri / yorumları, profil ızgarası
  const REST = /^https:\/\/www\.instagram\.com\/api\/v1\/(media\/\d+(_\d+)?\/(likers|comments)\/|feed\/user\/)/;
  const GRAPHQL = /^https:\/\/www\.instagram\.com\/(graphql\/query|api\/graphql)\/?(\?|$)/;
  // GraphQL sorgu adı: yalnızca bunlar; mesaj, bildirim, hikâye, arama, keşfet asla
  const WANTED = /liker|likes|comment|post|media|timeline|profile|feed/i;
  const NEVER = /direct|message|inbox|thread|notification|story|stories|search|explore|ads?\b|login|password|account/i;
  const MAX_CHARS = 8 * 1024 * 1024;

  window.addEventListener('message', (e) => {
    if (e.source === window && e.origin === ORIGIN && e.data && e.data.__ia === 'ia-config') enabled = e.data.on === true;
  });

  // İstek gövdesinden yalnızca sorgu adı ve değişkenler (gerisi oturum anahtarları içerir)
  function queryInfo(body) {
    try {
      let params = null;
      if (typeof body === 'string') params = new URLSearchParams(body);
      else if (body instanceof URLSearchParams) params = body;
      else if (typeof FormData !== 'undefined' && body instanceof FormData) {
        params = new URLSearchParams();
        for (const k of ['fb_api_req_friendly_name', 'variables']) {
          const v = body.get(k);
          if (typeof v === 'string') params.set(k, v);
        }
      }
      if (!params) return { friendly: '', variables: '' };
      return {
        friendly: String(params.get('fb_api_req_friendly_name') || '').slice(0, 200),
        variables: String(params.get('variables') || '').slice(0, 8192),
      };
    } catch {
      return { friendly: '', variables: '' };
    }
  }

  function wanted(url, info) {
    if (REST.test(url)) return true;
    if (!GRAPHQL.test(url)) return false;
    return WANTED.test(info.friendly) && !NEVER.test(info.friendly);
  }

  function emit(url, info, status, text) {
    if (!enabled || typeof text !== 'string' || !text || text.length > MAX_CHARS) return;
    window.postMessage({
      __ia: 'ia-observed', url: url.split('#')[0], status,
      friendly: info.friendly, variables: info.variables, text,
    }, ORIGIN);
  }

  function absolute(url) {
    try { return new URL(url, location.href).href; } catch { return ''; }
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    if (!enabled) return p;
    try {
      const url = absolute(typeof input === 'string' ? input : (input && input.url) || String(input || ''));
      const info = queryInfo(init && init.body);
      if (wanted(url, info)) {
        p.then((res) => res.clone().text().then((t) => emit(url, info, res.status, t))).catch(() => {});
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
      const info = enabled ? queryInfo(body) : null;
      if (info && wanted(url, info)) {
        this.addEventListener('load', () => {
          try {
            let t = '';
            if (this.responseType === '' || this.responseType === 'text') t = this.responseText;
            else if (this.responseType === 'json') t = JSON.stringify(this.response);
            emit(url, info, this.status, t);
          } catch { /* yoksay */ }
        });
      }
    } catch { /* yoksay */ }
    return XS.apply(this, arguments);
  };
})();
