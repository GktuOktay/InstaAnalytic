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

## Kaydedilenleri temizleme (SPEC-001 v1.6)

Kaynak: `docs/specs/SPEC-001-kaydedilen-ve-dm-temizleme.md` (§6.4, §6.5, §6.9, §6.10, §7.9, §8). Bu bölüm yalnız Faz 1'i (Kaydedilenler) anlatır; DM silme Faz 2 taslağıdır ve yazılı değildir.

### Ne yapar ve varsayılanlar
| Konu | Davranış |
|---|---|
| Özellik | Varsayılan **kapalı**. Ayarlar'daki "Kaydedilen temizleme" anahtarı, risk onay kutusu işaretlenmeden açılmaz (422 `ack_required`). Açma ve kapama `action_log`'a `cleanup_setting` olarak yazılır. |
| Yazma biçimi | Eklenti, kullanıcının kendi Instagram sekmesinde, sayfanın GraphQL `usePolarisSaveMediaUnsaveMutation` çağrısıyla her gönderiyi tek tek Kaydedilenler'den çıkarır. Sunucu Instagram'a istek göndermez. |
| Onay | Taramadan sonra sunucudaki liste önizlenir; kullanıcı gönderi sayısını yazarak onaylar. Onaylanan parti en çok `batch.max_items` (sert tavan 500) gönderi içerir. |
| Başlatma | Her duruşta (sınır, sessiz saat, durdurma) devam için kullanıcı yeniden Başlat'a basar; kendiliğinden devam yoktur. Başlat yalnız "hazır" olunca kabul edilir. |
| Geri alınamazlık | Çıkarılan gönderiyi uygulama Kaydedilenler'e geri ekleyemez. Önizleme ve onay metni bunu açıkça söyler. |
| Sessiz saatler | Takip kuyruğuyla ortak: 01:00-08:00 (Europe/Istanbul) arası yazma yok (`QUIET_HOURS`, `risk_profiles.py`). |
| Yazmasız sonuçlar | Gönderi zaten kaydedilmemişse (`already`), bulunamazsa (`not_found`) ya da korunan koleksiyondaysa (`protected`) yazma yapılmaz; bunlar yazma bütçesine değil okuma bütçesine (`reads.status_per_hour`, sert tavan 240) sayılır. |
| Devre kesici | Bir partide art arda 5 `failed` sonuç, eklentinin işi durdurmasına neden olur (`circuit_breaker`). |

### Ayar dosyası ve sert tavanlar
- Dosya: `backend/config/limits.toml` (yerel, `.gitignore`'da). Yoksa `scripts/init_env.py` `limits.example.toml`'dan kopyalar. Konteynerde `/app/config/limits.toml` olarak, `docker-compose.yml`'daki `./backend/config:/app/config:ro` bağlamasıyla salt okunur görünür (hem `backend` hem `worker`); konteyner süreçleri dosyayı değiştiremez, yalnız host kullanıcısı değiştirebilir.
- Dosya 30 sn'de bir okunur; içerik özeti (sha256) değiştiyse yeni değerler geçerli olur. Yeniden başlatma gerekmez. Yürütülmekte olan öğe etkilenmez.
- Arayüzden değiştirilemez; Ayarlar'daki "Ek iş sınırları" paneli salt okunurdur. API yalnız okur (`GET /api/cleanup/limits`).
- Takip / takipten çıkma sınırları bu dosyadan yönetilmez; `risk_profiles.py`'de kalır.
- Doğrulama sırası: tip, kırpma, çift tutarlılığı (daha kısıtlayıcı çözüm), kapıda son bir `min(değer, HARD_CAP)`. Hatalı tip (bool, NaN, sonsuz), eksik anahtar ya da çift ihlali o anahtarın güvenli varsayılanına döner. Dosya yok, bozuk TOML, `version` eksik ya da 1'den farklıysa tüm varsayılanlar kullanılır (son geçerli değer değil). Bu durumlar Ayarlar panelinde ve `warnings` alanında görünür; loglara yalnız bilinen anahtar adları ve sayılar yazılır.
- Sert tavanlar kodda sabittir (`backend/app/services/cleanup_limits.py`, `HARD_CAPS`); dosya bunları aşamaz, aşan değer tavana kırpılır:

| Anahtar | Varsayılan | Sert üst sınır |
|---|---|---|
| `profiles.<safe/balanced/aggressive>.unsave.hourly` | 40 / 60 / 80 | 80 |
| `profiles.*.unsave.daily` | 200 / 300 / 400 | 400 |
| `profiles.*.unsave.delay_min` / `delay_max` (sn) | 20-45 / 15-35 / 10-25 | alt sınır 10 ve 15; üst sınır 600 ve 900 |
| `account.hourly` / `account.daily` | 80 / 400 | 80 / 400 |
| `batch.max_items` | 500 | 500 |
| `scan.page_delay_min` / `page_delay_max` (sn) | 3 / 6 | 2-60 / 3-120 |
| `scan.saved_max_pages` | 100 | 200 |
| `scan.max_per_hour` | 2 | 4 |
| `reads.status_per_hour` | 120 | 240 |

- Hesap toplamı (takip + kaydedilen temizleme): `account` 80/saat, 400/gün, ek iş tarafında uygulanır. Takip kuyruğu bu tavana uymaz; en kötü toplam takip sert tavanı (15/saat, 60/gün) ile birlikte **95/saat ve 460/gün**'dür (CEO onaylı, K-08).
- Sayım, her `precheck allow`'un yazdığı `cleanup_write_grants` satırlarıyladır; Instagram'a gitmiş ama `failed` dönen yazmalar da tavana girer.

### İki ısınma modeli
Takip ve temizleme işleri farklı bütçeler kullandığı için ısınmaları bilerek farklı biçimdedir:

| Tür | Kaynak | Biçim | Eşikler |
|---|---|---|---|
| Takip / takipten çıkma | `risk_profiles.py` `RAMP_UP = ((3, 20), (7, 40))` | gün eşiği, **mutlak** günlük tavan | 3. güne kadar 20, 7. güne kadar 40, sonra profilin değeri |
| Kaydedilenleri temizleme | `limits.toml` `[ramp]` | saat eşiği, günlük tavanın **oranı** | ilk 72 saat ×0,333; 168 saate kadar ×0,667; sonra tam değer |

Süreler aynıdır (3 gün = 72 saat, 7 gün = 168 saat). Temizlemede `daily_eff = max(1, floor(daily × oran))`, `hourly_eff = min(hourly, daily_eff)`; örnek (safe): 66 / 133 / 200 günlük. Isınma `ramp.enabled = false` ile kapatılabilir; panel `ramp_disabled` uyarısı gösterir.

### 429 ve engel
| Durum | Davranış |
|---|---|
| HTTP 429 (yazma ya da okuma) | Sonuç `failed` + `rate_limited`, iş durduran sınıf: deneme sayılmaz, öğe `pending` kalır, parti `stopped(rate_limited)` olur. **24 saatlik duraklatma yoktur.** Arayüz "bir süre bekleyip Başlat'a bas" der. |
| Engel sinyali (`feedback_required`, `checkpoint_required`, `challenge_required` ya da `spam === true`) | `blocked`: parti aynı işlemde `stopped(blocked)` olur, `paused_until` ve `cleanup_paused_until` 24 saat ileri alınır. |
| Ortak engel duraklatması | `paused_until`'ı takip yolu da yazar. Kapı, gelecekteki takip duraklatmasını (`"Köprü:"` önekliler hariç) ilk okumada `cleanup_paused_until`'a kopyalar; böylece takip tarafında engel görülürse temizleme de bekler. Tersine, temizlemedeki `blocked`, takip kuyruğunun `next` çağrılarını da `paused` yapar. Özelliği kapatıp açmak ya da `expire_stale_sessions` bu duraklatmayı silmez. |
| Oturum kapalı (401) | `login_required`: parti durur, duraklatma yok. |

Bilinen artık risk (S-24): 429'dan sonra zorunlu bekleme yoktur. Kullanıcı hemen Başlat'a basarsa her Başlat Instagram'a en az bir deneme daha gönderir; art arda 429'lar hesabın kısıtlanma riskini artırabilir. Hafifletenler: "hazır" kuralı (her Başlat en fazla bir saatlik pay), sunucu tarafı asgari aralık (`delay_min`) ve arayüz metni.

### Koleksiyon koruması (F ve W modları) ve sunucu yeniden denetimi
- **F (fail-closed):** koleksiyon listesi alınamadıysa koleksiyonda duran her gönderi korunur.
- **W:** her taramada eklenti koleksiyon listesini (`PolarisSavedCollectionPickerQuery`, salt okuma) alır. Her yeni koleksiyon `protected=true` başlar. Kullanıcı korumayı bir koleksiyon için kaldırabilir; kaldırmak paylaşım uyarısı ve onay kutusu ister (`ack_shared_risk`, aksi 422 `ack_required`); korumaya geri almak tek adımdır. Değişiklik `action_log`'a `collection_protection` olarak yazılır (koleksiyon adı yazılmaz). Kaldırılan koruma, kullanıcı geri alana kadar kalıcıdır.
- Kod düzeyindeki mod yalnız backend sabitidir (`COLLECTION_CHOICE_AVAILABLE`); eklenti modu kendisi belirlemez. Bu sürümde W'dir (T-0c, 2026-11-08). Bir tarama listeyi alamazsa o tarama F gibi davranır.
- **Tek kural:** koleksiyon bilgisi okunamadıysa ya da gönderi, korumasız olarak işaretlenmemiş bir (ya da bilinmeyen) koleksiyondaysa korunur.
- **Sunucu yeniden denetimi:** kural envanterde, önizlemede, eklentinin yazmadan önceki taze okumasında ve sunucuda `precheck`'te (profil kilidi altında, `allow_collections` ile) uygulanır. Taze okumada alan yoksa gönderi korunur. Korunan gönderi `protected` olur ve yazılmaz.
- **Bilinen sınırlar:**
  - Instagram bir koleksiyonun paylaşılıp paylaşılmadığını bildiren alan vermedi (T-0c); uygulama ortaklığı bilemez. Kullanıcı ortak bir koleksiyonun korumasını kaldırırsa üçüncü kişiler etkilenebilir. Uygulama bunu engelleyemez, yalnız uyarır ve kaydeder.
  - Korumasız koleksiyondaki bir gönderiyi Kaydedilenler'den çıkarmak, gönderiyi o koleksiyondan da çıkarabilir varsayılır; spike bunu doğrulamadı. Çıkarma sonrası doğrulama okuması gönderi hâlâ kayıtlıysa sonucu `verify_failed` sayar, `done` saymaz.
  - Önizlemeden sonra korumaya alınan koleksiyonun gönderileri yürütmede sunucu denetimiyle `protected` olur; sonuç beklenenden az çıkarma olur ve "korundu" sayacında görünür.

### Oturum anahtarları ve Instagram yanıtları
- GraphQL yazması için gereken `fb_dtsg`, `lsd`, `jazoest` yalnız `content.js`'te istek anında okunur, yalnız `/api/graphql` adresine gider; uygulamaya, mesajlara, depolamaya, log'a ya da `note_code` ve `fields` alanlarına girmez (AC-C54, AC-C18).
- Kaydedilenler işi yalnız kendi isteklerinin yanıtını okur. Pasif gözlem yolunda sayfanın başka yanıtları (DM kutusu meta verisi dahil) bir gövde bekçisiyle ve genişletilmiş `NEVER` desenle (`save|collection|mailbox|iris|slide`) elenir. DM içeriği saklanmaz ilkesi korunur.
- Koleksiyon adları kullanıcının kendi metnidir: yalnız arayüzde metin olarak çizilir, log ve `action_log`'a yazılmaz, `DELETE /api/sessions/{id}/purge` ile silinir (purge `cleanup_*` ve `saved_collections` satırlarını kapsar).

### Yöntem kuralı: canlı oturumda okuma (S-30, S-32)
Geliştirme sırasında CEO'nun Instagram hesabında bir ajanın yaptığı her canlı okuma (T-0a, T-0c, FB-1, `doc_id` yenilemesi) şu kurala uyar. Gerekçe: ajanın araç çıktıları oturum kaydına kalıcı yazılır ve T-0a'da bir DM kutusu yanıtı bu yolla diske düşmüştür.
1. Yalnız hedef sorgu adıyla (`fb_api_req_friendly_name`) ya da hedef REST yoluyla süzülmüş isteklerin gövdesi açılır; diğerlerinin gövdesi hiç açılmaz ve okunmaz.
2. Açılan yanıttan yalnız alan adları, yollar, sayılar ve `doc_id` alınır; kullanıcı adı, koleksiyon adı, mesaj, kimlik listesi ve token alınmaz. Ayıklama sayfa içinde yapılır; ham gövde, ekran görüntüsü ya da sayfa metni araç çıktısına alınmaz. `/direct/` ve DM bildirimi görünen yüzeylerde ekran görüntüsü ve sayfa metni okuması yapılmaz.
3. Araç çıktısında hedef dışı bir gövde görülürse işlem durur ve CEO'ya bildirilir.
4. Her canlı okuma raporu "yöntem kuralına uyuldu" satırını taşır.

### Runbook: Instagram `doc_id`'yi ya da istek şeklini değiştirdi (N-11)
`doc_id`'ler `frontend/extension/content.js` içinde sabittir: `UNSAVE_DOC_ID` (`usePolarisSaveMediaUnsaveMutation`) ve `COLLECTIONS_DOC_ID` (`PolarisSavedCollectionPickerQuery`). Başka hiçbir kaynaktan alınmaz. Sabitlerin yanında kaynak ve alınma tarihi yorum olarak yazılıdır.

| Adım | İş |
|---|---|
| Belirti | Parti `stopped(mutation_unrecognised)` olur; arayüzde kırmızı şerit: "Instagram kaydedilenlerden çıkarma isteğini tanımadı; Instagram güncellenmiş olabilir. Bu gönderi değişmedi. Eklentinin yeni sürümü gerekiyor." Koleksiyon listesi için ise tarama F'ye düşer ("Koleksiyon listesi bu taramada alınamadı"). |
| Neden güvenli | Tanınmayan yanıtta eklenti yazmadan sonra durumu yeniden okur; gönderi hâlâ kayıtlıysa ilk öğede iş durur. Hiçbir durum sessizce yazmaya ya da `done`'a dönmez. Kurulu eklenti sürümü, durma anındaki sürümden büyük olana kadar Başlat pasiftir (`extension_update_required`). |
| 1. Doğrula | Belirtinin Instagram değişikliğinden geldiğini ayır: hesap oturumu açık mı, sekme yenilendi mi, eklenti güncel mi. |
| 2. Yeni `doc_id`'yi al | Yazmasız yolla: sayfanın yüklediği Relay modüllerinden okunur; hesapta yazma yapılmaz (K-20, T-0c'de uygulandı). Yöntem kuralı (yukarıda) geçerlidir; rapora yalnız alan adları, yollar ve `doc_id` yazılır. |
| 3. Sabiti güncelle | `content.js`'te ilgili sabit ve kaynak/tarih yorumu değişir. Yanıt şekli de değiştiyse §7.9.4 B tablosu ve testleri güncellenir. |
| 4. Yama sürümü | `manifest.json` sürümü artırılır ve eklenti yeni yama sürümü olarak yayımlanır. **Yayın her seferinde CEO onayı ister.** Yama gelene kadar aynı partide yazma denenmez. |
| 5. Sonra | Kullanıcı eklentiyi günceller, Instagram sekmesini yeniler ve partiyi yeniden Başlat'la sürdürür. |

### Gerçek riskler (dürüst liste)
- **Instagram Kullanım Koşulları** otomatik işlemleri yasaklar. Uygulama bu işlemleri kullanıcının kendi oturumunda, insan hızında ve sınırlarla yapar; yine de Instagram hesaba geçici kısıtlama ya da daha ağır bir yaptırım uygulayabilir. Hiçbir ayar bunun olmayacağını garanti etmez. Bu metin hukuki görüş değildir; risk kullanıcıdadır. Açma diyaloğu bunu yazar ve onay kutusu ister.
- **Geri alınamazlık:** çıkarılan gönderiler uygulamayla geri eklenemez.
- **Resmi olmayan uçlar:** kullanılan GraphQL sorguları Instagram'ın belgelenmemiş web arayüzüne aittir. `doc_id`, gövde alanları ya da `has_viewer_saved` alanı haber verilmeden değişebilir (yukarıdaki runbook).
- **Doğrulanmamış varsayımlar:** `already` durumu yazma yanıtından ayırt edilemez (kullanıcı okuma ile yazma arasında elle çıkarırsa öğe `done` sayılır); engel ve 429 davranışı spike'ta gözlenmedi, sınıflar tasarım gereğidir.
- **Yerel API:** `X-API-Token` taşıyan yerel bir süreç koruma ayarını API'den değiştirebilir (güven sınırı 1, kabul edilmiş risk).
- Spike (T-0a), CEO'nun gerçek hesabıyla, CEO onayıyla yapıldı (K-13); 4 yazma yapıldı, engel gözlenmedi.

## Sızıntı durumunda
`CREDENTIALS.md` içindeki "Bir şey sızarsa" bölümüne bakın.
