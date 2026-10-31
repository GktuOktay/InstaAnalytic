# Güvenlik ve gizlilik modeli

## Varsayılanlar (en güvenli olan)
| Konu | Davranış |
|---|---|
| Veri kaynağı | **ZIP** önerilir: Instagram'a hiç istek gitmez, çerez/parola gerekmez. |
| Tarayıcı oturumu | Kullanıcı tarayıcıyı **kendisi seçer**; bulunan hesaplar önizlenir, **onaylanmayan hiçbir şey kaydedilmez** (adaylar 5 dk sonra silinir). |
| Yazma işlemleri | Takip / takipten çıkma / takipçi çıkarma **kapalı**; profil başına bilinçli açılır. ZIP profilinde hiç açılamaz. |
| Devre kesici | Üst üste 3 başarısız işlem ya da `challenge / action_blocked / 429 / checkpoint` sinyali → 6 saat otomatik durdurma, kuyruk boşaltılır. |
| Sert tavanlar | Hangi risk profili seçilirse seçilsin: saatte en fazla 15, günde en fazla 60 işlem, işlemler arası en az 60 sn. Varsayılan profil **safe** (saatte 8, günde 30, 2-4 dk bekleme). |
| Isınma | İşlemler yeni açıldığında günlük tavan kademeli artar: ilk 3 gün 20, 7. güne kadar 40, sonra profilin değeri. |
| Sessiz saatler | 01:00-08:00 (İstanbul) arası hiçbir işlem yapılmaz; kuyruk korunur, sabah otomatik devam eder. |
| Oturum ömrü | 30 gün kullanılmayan tarayıcı oturumunun çerezleri silinir; profil ve analiz verisi kalır (ZIP moduna döner). |
| Ağ | Tüm portlar `127.0.0.1`. API `X-API-Token` ister (Vite proxy ekler, tarayıcıya gömülmez). Redis ve Flower parolalı. |
| Host agent | Yalnızca seçilen tarayıcıları okur, `~/.instaanalytic_agent.log`'a kayıt düşer, macOS'ta bildirim gösterir. Sürüm uyuşmazsa backend taramayı reddeder. |
| Görsel proxy | Yalnızca `*.cdninstagram.com` / `*.fbcdn.net`, https, yönlendirme yok, 5 MB sınır, yalnızca `image/*`. |
| Şifreleme | Fernet; `ENCRYPTION_KEY_OLD` ile kesintisiz rotasyon (`python -m app.scripts.rotate_keys`). |
| Veri hakları | `DELETE /api/sessions/{id}/purge` her şeyi ve artık kullanılmayan kullanıcı kayıtlarını siler; CSV dışa aktarma (formül enjeksiyonuna karşı korumalı). |

## Bilinen sınırlar (dürüst liste)
- Instagram eşiklerini yayınlamaz; risk profilleri tahmindir, **hiçbir ayar "ban yemez" garantisi değildir**.
- Yazma işlemleri Docker içindeki headless Chromium'dan yapılır; parmak izi gerçek tarayıcınla birebir aynı değildir. Bu yüzden işlemler varsayılan kapalıdır.
- `ENCRYPTION_KEY` türetmesinde tuz sabittir (geriye dönük uyumluluk). Anahtar yüksek entropili rastgele üretildiği için pratik risk düşüktür.
- Frontend geliştirme (Vite) sunucusuyla çalışır; internete açmayın.
- Linux/Windows host agent ikili dosyaları CI ile yeniden derlenmelidir (`build-agent.yml`).

## Sızıntı durumunda
`CREDENTIALS.md` içindeki "Bir şey sızarsa" bölümüne bakın.
