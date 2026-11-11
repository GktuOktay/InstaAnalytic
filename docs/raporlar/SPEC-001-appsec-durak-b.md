# SPEC-001 · AppSec Durak B (kod) raporu

Taban: `a2e859e`. Yazan: ana oturum (AppSec'in yazma aracı yok; içerik AppSec raporundan).

**Özet:** CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 1 · INFO 3
**Karar:** SPEC-001 temizleme kodu PASS. Bağımlılık kapısında `npm audit` kırmızı (D-1), önceden var olan ve SPEC-002 §10'da kapsam dışı bırakılmış bir durum.

## Önceki bulguların kodda kapanışı
S-28 (gövde bekçisi `content.js:54`, tek geçit `forward()` :62-66; `NEVER` deseni `listener.js:26`), S-29 (`DTSGInitialData`, `"LSD",[]`, `"csrf_token"` desenleri), token ayrımı AC-C54 (göreli yollar, `credentials:'omit'`), `doc_id` sabitleri ve komut beyaz listesi, IDOR (`id AND session_id`, 404), `ack_shared_risk` (422 `ack_required`), sunucu yeniden denetimi AC-S23 (precheck profil kilidi altında), I-17 ve I-19: hepsi KAPANDI. S-30 ve S-32 süreç kuralıdır, koddan doğrulanamaz. S-31 uygulanamaz.

## Bulgular
- **D-1 [MEDIUM]** Frontend bağımlılıkları: `npm audit` tüm ağaçta 2 critical (vitest 2.1.9, tinypool 1.1.1), 1 high (vite 5.4.21), 5 moderate; `--omit=dev` ile 2 moderate (react-router 6.30.6 açık yönlendirme). Kritikler test araçlarında, bugünkü kurulumda tetiklenmiyor (konteyner Linux, port yalnız 127.0.0.1). Yer: `frontend/package-lock.json`, `frontend/Dockerfile`.
- **S-33 [LOW]** `SavedTab.tsx:386` küçük resimde `referrerPolicy` yok; Meta CDN'e uygulama kökeni gidiyor. Düzeltme: `referrerPolicy="no-referrer"` + test.
- **I-21 [INFO]** Bekçi yalnız `payload.text`'e bakıyor, `variables`'a bakmıyor (`content.js:63`, :886). Bugün sömürülemez.
- **I-22 [INFO]** Vite proxy `127.0.0.1:3002/api`'ye gelen her isteğe `X-API-Token` ekliyor (`vite.config.ts:38`); 415 kuralı basit CSRF'yi durduruyor. Kabul edilmiş risk, SPEC-003 adayı.
- **I-23 [INFO]** `protection_context` oturum süzgeci olmadan `db.get` yapıyor (`cleanup_scan.py:536`); `scan_id` partinin kendi kaydından geldiği için sömürülemez.

## Bağımlılık taraması
`pip-audit`: temiz. `npm audit`: D-1.

## Taranmayanlar
DAST, imaj taraması, git geçmişinde gizli bilgi, canlı Instagram, oturum kayıtları, canlıda Vite `allowedHosts`.
