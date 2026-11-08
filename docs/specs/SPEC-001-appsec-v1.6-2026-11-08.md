# SPEC-001 · AppSec v1.6 delta

> Bu dosyayı main session yazdı. AppSec'in yazma aracı yoktu; içerik onun raporundan alındı. Kanıt dosyası yolları ve satır numaraları korunmuştur.

AppSec raporu: SPEC-001 v1.6 | Durak: A (spec, imza öncesi) | Taban: `2409727` + çalışma ağacında değiştirilmiş spec

**Özet:** CRITICAL 0 · HIGH 0 · MEDIUM 2 · LOW 3 · INFO 4
**Karar: PASS-koşullu.** Koşul: imzadan önce S-28 ve S-30'un spec metni düzeltmeleri işlenir. S-30 CEO'nun kendi hesabındaki veriyle ilgilidir, CEO'ya iletilir.

Önceki bulgular: v1.4'teki S-26 ile I-13, I-14 ve I-15 kapandı; hepsinin §9'da testi var.

## Doğru kurulmuş olanlar (kanıtla)
- **Token kalıbı:** `graphqlUnfollow` ile aynı (`content.js:297-308`, `:347-363`). Token'lar istek anında okunur ve yalnız aynı kökene gider. Mevcut test token'ların sonuca ve nota sızmadığını denetliyor (`src/test/extension-api.test.ts:96`, `:166`).
- **`actor_id`:** istek anındaki `ds_user_id`'dir ve precheck'teki `viewer_id`'ye eşit olmalıdır, değilse yazma yapılmaz (AC-S17). Sunucu da `viewer_id`'yi profille karşılaştırır (AC-C4).
- **`doc_id` değişimi:** §7.9.4 B tablosunun sırası doğru. Her belirsiz durumda doğrulama okuması yapılır; gönderi hâlâ kayıtlıysa iş ilk öğede durur (`mutation_unrecognised`).
- **Kaydetme yanıtlarının sızması bugün gerçek, v1.6 bunu kapatıyor.** `usePolarisSaveMediaUnsaveMutation` ve `usePolarisSaveMediaSaveMutation` bugünkü `WANTED`'a `media` ile uyuyor ve `NEVER`'e takılmıyor; gönderi sayfalarında bugün `/bridge/observe`'a gidiyorlar. v1.6'daki `savemedia|savedcollection` eki ikisini de keser.
- **Koleksiyon koruması:** varsayılan korumalı, bilinmeyen kimlik korunur, alan yoksa korunur; sunucu kuralı precheck'te kilit altında yeniden uygular (AC-S23).
- **`ack_shared_risk`:** kabul edilmiş risk olarak dürüstçe yazılmış (§8).
- **IDOR:** `id AND session_id` kuralı yeni uçlara da uygulanıyor; başka profilin `collection_id`'si için 404 (AC-S22).

## Bulgular

### S-28 [MEDIUM] DM meta verisine karşı önlem yalnız sorgu adına bakıyor
- Yer: AC-C55; §8; `frontend/extension/listener.js:25-26`, `:62-66`; `frontend/extension/content.js:497-521`.
- Kanıt:
  - (a) `wanted()` yalnız `fb_api_req_friendly_name`'e bakar (`listener.js:65`). `get_slide_mailbox_for_iris_subscription` bir sorgu adı değil, yanıttaki bir veri alanıdır. Taşıyan isteğin sorgu adı kaydedilmedi. Adı `WANTED` sözcüklerinden birini içeriyorsa `NEVER`'e eklenen `mailbox|iris` onu durdurmaz.
  - (b) Liste ad ad engelliyor ve kırılgan. Varsayımsal adlar (`usePolarisMediaSaveToCollectionMutation`, `PolarisCollectionAddMediaMutation`) v1.6 desenini geçiyor.
  - (c) `scanEmbedded()` (`content.js:513-521`), izinli sayfalarda `"username"` ve `"taken_at"` geçen her gömülü JSON bloğunu olduğu gibi iletir. AC-C55 bu yolu anmıyor.
  - Backend ham gövdeyi saklamıyor (`services/bridge.py:442-502`), ama veri sınır 3'ü geçmiş olur.
- Etki: DM kutusu meta verisi (üçüncü kişi kimlikleri, okundu bilgisi, zaman damgaları) yerel backend'e iletilebilir. Olasılık doğrulanmadı.
- Düzeltme:
  1. AC-C55'e gövde düzeyinde bekçi: `content.js` `forward()`'tan önce, mesaj yolunda ve `scanEmbedded`'de, metin `/get_slide_mailbox|iris_subscription|as_ig_direct_thread|threads_by_folder|direct_v2|"thread_/` desenine uyuyorsa iletmez.
  2. `NEVER` genelleşir: `save|saved|collection|mailbox|iris|slide`; bugünkü `WANTED` adlarıyla çakışmadığı testle gösterilir.
  3. Mailbox yanıtını taşıyan isteğin sorgu adı (yalnız ad) kaydedilir.
  4. Testler: `WANTED`'a uyan adla gelen mailbox gövdesi iletilmez; gömülü blokta mailbox alanı varsa `scanEmbedded` iletmez; ad varyantları engellenir.

### S-30 [MEDIUM] Spike yöntemi DM meta verisini ajan oturum kaydına kalıcı yazdı; spike raporu bunun tersini söylüyordu
- Yer: `docs/specs/SPEC-001-spike.md` (gizlilik notu); spec §6.10 T-0c ve K-20; kanıt dosyası `/Users/goktugoktay/.claude/projects/-Users-goktugoktay-Desktop-Projects-InstaAnalytic/7d1e8b75-e506-4ae9-845a-0b9a4e8b8ed9.jsonl` satır 356.
- Kanıt: Satır 356'da 8587 karakterlik bir `get_slide_mailbox_for_iris_subscription` yanıtı duruyor. Alan adları: `threads_by_folder`, `as_ig_direct_thread`, `participant_fbid`, `slide_read_receipts`, `last_activity_timestamp_ms`, `is_muted`, `marked_as_unread`, `watermark_timestamp_ms`. Mesaj metni yok. Token'lar tarayıcı aracınca `REDACTED`; çerez ya da `sessionid` deseni yok.
- Etki: CEO'nun DM kutusu meta verisi ve üçüncü kişi kimlikleri yerel diskte kalıcı duruyor.
- Düzeltme: T-0c ve K-20'ye yöntem kuralı (yalnız hedef sorgu adıyla süzülmüş isteklerin gövdesi açılır; yanıttan yalnız alan adları ve yollar alınır). §8'e "ajan oturumu ↔ Instagram sekmesi" güven sınırı. Spike raporu düzeltilir. Kayıttaki satırın silinmesi kalıcı silmedir; karar CEO'nundur.

### S-27 [LOW] AC-C54 ile §7.2.1 tutarsız
- `csrftoken` ve claim, listeleme ve `media/{pk}/info/` okumalarında da gidiyor (`content.js:280-287`). Öneri: "`fb_dtsg`, `lsd` ve `jazoest` yalnız `/api/graphql` isteklerinde; `csrftoken` ve `www-claim` yalnız `https://www.instagram.com` aynı kökenine giden §7.2.1 isteklerinde; hiçbiri uygulamaya gitmez."

### S-29 [LOW] Pasif gömülü veri yolu sayfa token'larını sınır 3'e taşıyabilir
- `pageTokens()` LSD ve DTSG'yi aynı tür bloklardan okuyor; `scanEmbedded`'in token ayıklaması yok. Doğrulanmadı. Öneri: S-28 bekçisine `DTSGInitialData|"LSD",\[\]` eklenir; AC-C54 testine pasif modda gömülü blok senaryosu eklenir.

### S-31 [LOW] Ortak koleksiyon kilidi kalıcı değil
- Ortaklık alanı bir taramada `null` gelirse `shared_locked` sessizce kalkar. Öneri: `shared=true` yalnız açık `false` ile değişsin. Test: `test_shared_lock_survives_scan_without_field`.

### I-16 [INFO]
AC-C20 purge testinde `saved_collections` ve `saved_targets` açıkça adlandırılsın.

### I-17 [INFO]
Koleksiyon adı temizliği Unicode Cf karakterlerini de atsın (U+202A-202E, U+2066-2069, sıfır genişlikli karakterler).

### I-18 [INFO]
Spec'e açık cümle: `doc_id`, sorgu adı ve `variables` hiçbir zaman komuttan ya da sunucudan gelmez; `content.js` bunları sabitlerden ve doğrulanmış `ref`'ten kurar.

### I-19 [INFO]
AC-C38 testi yeni `PUT …/saved/collections/{id}` ve `POST …/scan/{id}/collections` uçlarını listelesin (JSON değilse 415); `PUT` yol parametresi `^\d{1,25}$` ile doğrulanıp 422 dönsün.

## Taranmayanlar
- Mailbox yanıtını taşıyan isteğin sorgu adı (doğrulanmadı).
- Bağımlılık taraması (yeni paket yok), dinamik tarama, imaj taraması.
- Backend `observe` yolunda gövdenin loglanmadığı (kısmen okundu).
- Token'ların gönderi verisiyle aynı gömülü blokta taşınıp taşınmadığı.
- Daha eski oturum kayıtları (son 5 dosya dışında).
