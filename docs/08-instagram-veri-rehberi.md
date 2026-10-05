# Instagram verisini ZIP ile ekleme rehberi

Takipçi / takip listesini Instagram'a **hiç istek atmadan** (bot riski yok) uygulamaya almanın yolu:
Instagram'ın kendi "Bilgilerini indir" özelliği.

## 1. Instagram'dan ZIP'i alma

1. Instagram uygulaması → Profil → ☰ menü → **Hesap merkezi** (Accounts Center).
   (Web'de: instagram.com → Ayarlar → Hesap merkezi.)
2. **Bilgilerin ve izinlerin** → **Bilgilerini indir** → **Bilgileri indir veya aktar**.
3. Hesabını seç → **Bilgilerinin bir kısmı** (Some of your information).
4. Yalnızca **Takipçiler ve takip edilenler** (Followers and following) kutusunu işaretle.
5. **Cihaza indir** → Tarih aralığı: **Tüm zamanlar** → Biçim: **JSON** (HTML seçme!) → Gönder.
6. Hazır olunca Instagram e-posta / bildirim gönderir (dakikalar ile saatler arası). Bağlantıdan ZIP'i indir;
   bağlantı birkaç gün sonra geçersiz olur.
7. **ZIP'i açma.** Olduğu gibi yükle.

> Menü adları Instagram sürümüne göre değişebilir; yukarıdaki yol yazıldığı tarihteki hâlidir.

## 2. Uygulamaya yükleme

Takipçi Analizi sayfası → **Veri Kaynağı → ZIP seç**. İşlem bittiğinde:

- takipçi / takip sayıları,
- önceki yüklemeye göre **yeni gelenler** ve **takipten çıkanlar** (kullanıcı adlarıyla)

gösterilir. Listeler ve "geri takip etmeyenler" hemen güncellenir.

API ile: `POST /api/sessions/{id}/import/zip` (multipart, alan adı `file`).
Geçmiş farklar: `GET /api/sessions/{id}/import/snapshots`.

## 3. ZIP'in içeriği ve sınırları

| Var | Yok |
|---|---|
| Kullanıcı adı, profil bağlantısı, takip zamanı | Kullanıcı ID'si, profil fotoğrafı, takipçi sayısı, doğrulama rozeti |

- Dosya adları: `followers_1.json` (büyük hesaplarda `_2`, `_3` …) ve `following.json`.
  Yalnızca biri yüklenirse sadece o liste güncellenir, diğerine dokunulmaz.
- ID olmadığı için kullanıcılara geçici (negatif) kimlik verilir. Gerçek ID, **yalnızca takip et / takipten çık
  anında** çözülür (bu adımda session gerekir) ya da canlı tarama o kullanıcıyı görürse otomatik bağlanır.
- Dosya boşsa mevcut veri silinmez; işlem reddedilir.
- Haftada bir yeni ZIP yüklemek, "kim ayrıldı" takibi için yeterlidir.

## 4. Sık hatalar

| Mesaj / belirti | Neden |
|---|---|
| `followers_*.json / following.json bulunamadı` | "Takipçiler ve takip edilenler" işaretlenmemiş ya da biçim HTML seçilmiş. |
| `JSON olarak okunamadı` | Biçim HTML. Tekrar iste, JSON seç. |
| `Geçerli bir ZIP dosyası değil` | Dosya yarım inmiş ya da açılıp yeniden sıkıştırılmış. İndirdiğin ZIP'i olduğu gibi yükle. |
| `Dosya çok büyük` | Üst sınır 100 MB. Yalnızca takipçi/takip verisini seç (tüm hesabı değil). |

# Risk profilleri

Canlı tarama ve takip/çıkış hızı hesap başına seçilir (Takipçi Analizi sayfası → **Hız / Risk profili**).
Instagram gerçek eşiklerini yayınlamaz; sayılar tahmindir ve **hiçbir profil garanti vermez**.

| | Güvenli | Dengeli (varsayılan) | Agresif |
|---|---|---|---|
| Tarama (sayfa/saat · sayfa/gün) | 15 · 60 | 30 · 150 | 60 · 300 |
| İstekler arası bekleme | 8–15 sn | 4–9 sn | 2–5 sn |
| Risk sinyali sonrası ilk bekleme | 60 dk | 30 dk | 15 dk |
| Takip / çıkış (saat · gün) | 15 · 60 | 30 · 120 | 60 · 250 |
| İşlemler arası bekleme | 90–180 sn | 60–120 sn | 30–60 sn |
| Beğeni/yorum için gönderi sayısı | 15 | 30 | 100 |

**Agresif** profilde Instagram'ın otomasyon tespitine takılma ihtimali belirgin biçimde yüksektir.
Olası sonuçlar: "İşlem engellendi" uyarısı, saatler–günler süren geçici kısıtlama, hesap incelemesi,
oturumun kapatılması; en kötü ihtimalle kalıcı kısıtlama. Seçmek için riskleri onaylaman gerekir
(`PUT /api/sessions/{id}/risk-profile` içinde `acknowledge: true`).

Her profilde ortak korumalar: aynı hesapta tek tarama, kayan 1 saat / 24 saat bütçesi, kademeli cooldown
(429/401/403/challenge sonrası otomatik devam yok), kaldığı yerden devam.
