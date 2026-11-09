# Onay bekleyenler

Güncelleme: 2026-11-09. Her maddenin cevabını bu sayfanın yorumuna madde numarasıyla yaz (ör. "1: ok", "5: kaldır"). Cevaplanan madde Karar Kaydı'na işlenir ve bu sayfadan çıkar. Her maddenin altında önerim yazıyor; "ok" önerinin kabulü demektir.

Bu sayfa bildirim üretsin istiyorsan: BookStack'te **Kararlar ve Sorular** kitabını aç, sağdaki **İzle (Watch)** seçeneğini "Tüm sayfalar ve yorumlar" yap.

## A. Genel (SPEC-001)

### 1. Push (main → origin)
Yerelde 11 commit push'lanmadı: SPEC-001 v1.6 dokümanları ve imzası, plan 2.0, T-1, T-2b, T-2, T-7a, T-4a, T-7b, T-4b. Hepsi test edildi; özellik varsayılan olarak kapalı (kullanıcıya etkisi yok). Push'lanmayan iş tek makinede duruyor, yedeği yok.
**Önerim:** push et.

### 2. S-30: oturum kaydındaki DM meta verisi
Spike sırasında bir Instagram yanıtı (DM kutusu özeti: konuşma kimlikleri, karşı tarafın numerik kimlikleri, okundu bilgisi, son mesaj zamanı; mesaj metni yok) Claude Code'un yerel oturum kaydına yazıldı: `~/.claude/projects/-Users-goktugoktay-Desktop-Projects-InstaAnalytic/7d1e8b75-e506-4ae9-845a-0b9a4e8b8ed9.jsonl`, satır 356. Dosya yalnız senin bilgisayarında. Silme kalıcıdır; yalnız o satır gider.
**Önerim:** sil.

## B. SPEC-002 · Bağımlılık güvenlik yükseltmesi

CI'ın backend işi 5 paketteki bilinen açıklar yüzünden kırmızı (cryptography, python-multipart, starlette, python-dotenv, instagrapi). Spec: "SPEC-002 · Bağımlılık güvenlik yükseltmesi" sayfası. Kapılar: AppSec PASS-koşullu, kurul koşullu onay, kapasite uygun, spec-critic "imzaya hazır değil" (düzeltilebilir 2 High). Tahmin 2,1 g, tavan 2,5 g. Aşağıdaki cevaplar ve kapı bulguları işlendikten sonra spec imzana ayrıca gelecek.

### 3. instagrapi kaldırılsın mı, yükseltilsin mi?
Hiçbir çalışan kod yolunda kullanılmıyor.
**Önerim:** kaldır.

### 4. FastAPI'nin hiçbir sürümü güvenli Starlette'i kabul etmezse
**Önerim:** iş durur. İstisna yalnız tek tek açık bazında, senin onayınla, en fazla 30 gün ve bitiş tarihli.

### 5. Sıralama
**Önerim:** T-4b (bitti) → SPEC-002 → T-4c; paralel değil. T-4c için push/CI beklenmez, yerel yeşil yeter. SPEC-001 takvimi en fazla ~2 gün kayar; SPEC-001'in 37 g bütçesine dokunmaz.

### 6. Hash'li kilit dosyası
**Önerim:** ayrı küçük iş (SPEC-003 adayı); Plane'de hemen görev açılır.

### 7. Gerçek veritabanında salt okuma şifre çözme kontrolü
Yükseltme öncesi ve sonrası, şifreli oturumların hâlâ çözüldüğü sayılır. Bağlantı teknik olarak salt okunur, çıktı yalnız sayılardır (toplam / çözülen / çözülemeyen). Sonrası tabandan kötüyse iş durur ve geri alınır.
**Önerim:** izin ver.

### 8. Spec biçimi
**Önerim:** hızlı spec (threat model eklenmiş) olarak kalsın; kullanıcıya görünen değişiklik yok.

### 9. Token kontrolünden önce form ayrıştırma (AppSec S-01)
Herhangi bir web sitesi tarayıcın üzerinden API'ye token'sız form gönderebiliyor; FastAPI bunu token kontrolünden önce ayrıştırıyor (sentetik denemeyle doğrulandı). Dosya parçaları toplam sınır olmadan diske yazılıyor: dışarıdan disk doldurma mümkün. Etki yalnız erişilebilirlik; veri sızmıyor. SPEC-002 bilinen açıkları kapatır, bu yol açık kalır.
**Önerim:** asıl önlem ayrı iş (T-5'ten sonra): token'ı routing'den önce kontrol eden ara katman + istek boyutu sınırı. Erteleme Karar Kaydı'na yazılır.

## C. Yeni iş önerileri (SPEC-002 kapsamı dışı)

### 10. Tarayıcı izolasyonu (AppSec S-03, etki yüksek, olasılık düşük)
Worker, Instagram'a gitmek için eski bir Chromium'u (Chromium 125 dönemi, playwright 1.44) sandbox'ı kapalı (`--no-sandbox`) ve root olarak çalıştırıyor. Tarayıcı ele geçirilirse şifreleme anahtarı ve çözülmüş Instagram çerezleri açığa çıkar. Bağımlılık taraması tarayıcıyı kapsamaz.
**Önerim:** ayrı iş aç: playwright güncellemesi, sandbox açık, root olmayan kullanıcı.

### 11. Sunucunun Instagram'a doğrudan istek göndermesi (AppSec S-02, ürün/uyum riski)
Backend Instagram'a kendisi gidiyor: tarama, gönderi/etkileşim ve takip/takipten çıkma için headless Playwright; hesap bilgisi için mobil API (Android uygulaması gibi görünen User-Agent). ZIP dışındaki her profilde. Bu, "uygulama Instagram'a kendisi istek göndermez" ilkesiyle ve kullanıcıya verilen bilgiyle çelişiyor.
**Önerim:** Karar Kaydı'na ayrı bulgu olarak işle; product-manager ile "ilke mi değişsin, kod mu" kararı için ayrı iş aç.
