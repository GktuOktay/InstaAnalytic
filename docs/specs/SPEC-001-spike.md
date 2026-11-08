# SPEC-001 T-0a spike raporu: Kaydedilenler uç noktaları

- Spec: `docs/specs/SPEC-001-kaydedilen-ve-dm-temizleme.md` v1.5, §6.9
- Talimat: `docs/plan/SPEC-001-uygulama-plani.md` §4
- Yürüten: main session (Claude), CEO'nun açık izniyle, uygulama içi tarayıcıda, CEO'nun hesabıyla
- Tarih: 2026-11-08
- Durum: **tamamlandı; G1 = GO + şekil farkı (K-15)**

## Sapma kaydı (CK-1)

Spec ve plan spike'ın ayrı bir test hesabıyla yapılmasını şart koşuyordu (CK-1). CEO sohbette "benim hesabım üzerinden yapabilirsin" diyerek gerçek hesabı onayladı. Karar Kaydı'na işlenecek.

CEO ayrıca "ortak koleksiyonlara dokunma" kuralını koydu. Spike'ta hiçbir koleksiyona yazma işlemi yapılmadı; unsave yalnız koleksiyonsuz bir gönderide denendi. Bu kural ürün kuralı olarak spec v1.6'ya girecek (bkz. "Spec'e etkisi").

## Yürütme özeti

- Okuma istekleri yaklaşık 20-30 sn arayla gönderildi: listeleme 4 kez, 2. sayfa 1 kez, gönderi bilgisi 2 kez, koleksiyon listesi adayı 2 kez.
- Yazma işlemleri bir gönderide yapıldı ve her adım arasında en az 30 sn beklendi: unsave → save → unsave → save. Gönderi kaydedilmiş hâlde, koleksiyonsuz ve listenin en üstünde bırakıldı (son doğrulama: `has_viewer_saved: true`, liste başında).
- Engel, 429 ya da uyarı gözlenmedi.
- Rapora token, çerez, `fb_dtsg`, `lsd`, `doc_id` değeri ve gönderi sahibi kullanıcı adı yazılmadı.
- Gizlilik notu: GraphQL yanıtları elle taranırken bir yanıtın DM kutusu meta verisi (`get_slide_mailbox_for_iris_subscription`) olduğu görüldü. İçinde mesaj metni yoktu, yalnız kimlikler ve zaman damgaları vardı. Hiçbir yere kaydedilmedi.

## Sonuçlar

| İş | Aday (§6.9) | Gözlenen yöntem + yol | İstek alan/parametre adları | Yanıt alan adları | HTTP | Not | Sonuç |
|---|---|---|---|---|---|---|---|
| Listeleme | `GET /api/v1/feed/saved/posts/?max_id=` | `GET /api/v1/feed/saved/posts/` (web sayfası da bunu kullanıyor) | `max_id` (2. sayfa). Başlıklar: `x-ig-app-id`, `x-requested-with` | `num_results`, `more_available`, `next_max_id` (string), `auto_load_more_enabled`, `status`, `items[].media.{pk, id, code, media_type, product_type, user.{pk,id,username}, image_versions2, has_viewer_saved, saved_collection_ids, taken_at}` | 200 | Sayfa boyutu 21. 2. sayfada da 21 öğe var, 1. sayfayla kesişim 0. `id` = `<pk>_<sahip_pk>`. | **doğrulandı** |
| Koleksiyon listesi | `GET /api/v1/collections/list/` | REST aday web'de **404** (parametreli ve parametresiz). Web, listeyi GraphQL ile çekiyor: `POST /api/graphql`, `fb_api_req_friendly_name=PolarisSavedCollectionPickerQuery` | GraphQL standart gövdesi (`variables`, `doc_id`, `fb_dtsg`, `lsd` …) | Yapısı çıkarılamadı (yanıt yakalandı ama alan yolları kaydedilmeden önce) | 404 / 200 | Koleksiyon adı + kimliği sayfada görünüyor (`/saved/<ad>/<collection_id>/`); kimlikler sayısal, ≤ 25 hane. | **farklı** |
| Koleksiyonlu liste | — | `POST /api/graphql`, `PolarisSavedCollectionPageWWWQuery` | `variables`: `collection_id`, `first`, `after` | `data.fetch__MediaCollection.{id, media.edges[], media.page_info.{end_cursor, has_next_page}}` | 200 | Alternatif: listelemedeki `items[].media.saved_collection_ids` ile istemci tarafında filtre (21 öğeden 4'ünde dolu). | **farklı** (GraphQL) |
| Unsave | `POST /api/v1/web/save/{media_pk}/unsave/` | `POST /api/graphql`, `fb_api_req_friendly_name=usePolarisSaveMediaUnsaveMutation` | `variables.input.{media_id, actor_id, client_mutation_id}` (üçü de sayısal string; `media_id` = `pk`) + `doc_id`, `fb_dtsg`, `lsd`, `jazoest` | `data.xig_media_unsave.media.id`, `extensions.{server_metadata, is_final}` | 200 | REST aday denenmedi (gereksiz yazma yapmamak için). Eklentideki takipten çıkma mutasyonuyla aynı kalıp (`content.js` `UNFOLLOW_DOC_ID`). | **farklı** (GraphQL) |
| Save (geri alma) | — | `POST /api/graphql`, `usePolarisSaveMediaSaveMutation` | `variables.input` | `data.xig_media_save.media.id` | 200 | Kapsam dışı; yalnız spike'ı geri almak için kullanıldı. | bilgi |
| Unsave (ikinci kez) | — | aynı mutasyon | aynı | aynı | 200 | Yanıt şekli ilkiyle aynı. "Zaten kaydedilmemiş" durumu doğal yoldan oluşmadığı için denenmedi. | `already` **doğrulanamadı** |
| Unsave doğrulama | `GET /api/v1/media/{pk}/info/` → `items[0].has_viewer_saved` | `GET /api/v1/media/{pk}/info/` | — | `num_results`, `more_available`, `items[]`, `auto_load_more_enabled`, `status`. Kayıtlıyken `items[0].has_viewer_saved: true` ve `saved_collection_ids: []`; unsave sonrası **iki alan da yok** (false değil). | 200 | Doğrulama kuralı "alan yok ya da false → kaydedilmemiş" olmalı. | **doğrulandı** (şekil notuyla) |
| Engel / 429 | — | — | — | — | — | — | **gözlenmedi** |

### Ek sorular

| Soru | Cevap |
|---|---|
| İlk sayfadaki öğe sayısı | 21 |
| Sıra: en son kaydedilen en üstte mi? | Büyük olasılıkla evet: geri kaydedilen gönderi listenin başında. Zayıf kanıt, çünkü gönderi zaten başta duruyordu. |
| İkinci sayfada değişen parametre adı | `max_id` (değeri önceki yanıttaki `next_max_id`) |
| `media_type` kodu: fotoğraf / video-reel / carousel | 1 / 2 / 8 |
| Ek tür bilgisi | `product_type`: `feed`, `clips`, `carousel_container`, `ad` (kaydedilenler arasında reklam gönderisi de var) |
| Koleksiyon kimliklerini veren alan | `items[].media.saved_collection_ids` (dizi) |
| GraphQL zorunlu mu | Listeleme için hayır (REST). Unsave ve koleksiyonlar için web arayüzü GraphQL kullanıyor; REST karşılıkları ya 404 ya da denenmedi. |
| Ortak (paylaşılan) koleksiyon işareti | **Tespit edilemedi.** Picker sorgusunun yanıt yapısı çıkarılamadı. |

## Spec'e etkisi (öneri, karar CEO'nun)

1. **Unsave GraphQL ile yapılır.** Bunun için `doc_id` (Instagram sürümleriyle değişebilir), sayfadan `fb_dtsg`/`lsd`/`jazoest` ve `actor_id` (= `ds_user_id`) gerekir. Eklentide aynı kalıp zaten var (takipten çıkma). T-8a ve T-9 yeniden tahminlenmeli. `doc_id` değeri T-8a'da canlı istekten alınır.
2. **Koleksiyon listesi REST'te yok.** Seçenekler: (a) `saved_collection_ids` ile kimlik bazlı filtre ve adlar için `PolarisSavedCollectionPickerQuery`; (b) Faz 1'de koleksiyon filtresi `not_available` (AC-S5 bunu zaten öngörüyor).
3. **Ortak koleksiyonlar (CEO kuralı):** "Ortak koleksiyondaki gönderiler temizlemeye girmez." Ortak koleksiyonları ayırt eden alan bilinmediği için güvenli varsayılan şu: `saved_collection_ids` dolu olan her gönderi varsayılan olarak hariç tutulur. Ya da ortak koleksiyon işareti ayrı bir spike adımında çıkarılır.
4. **Doğrulama kuralı:** `has_viewer_saved` alanı yoksa "kaydedilmemiş" sayılır.
5. **Reklam gönderileri** (`product_type: "ad"`) envanterde görünür; tür filtresinde ayrı ele alınmalı.

## Karar (CEO, G1)

Öneri: **GO + şekil farkı.** Listeleme ve unsave çalışıyor ve doğrulandı, ama unsave ve koleksiyonlar §6.9'daki REST adaylarından farklı. Spec v1.6 gerekiyor; T-4a, T-8a ve T-9 yeniden tahminlenecek ve toplam 28 g'yi aşarsa iş başlamadan CEO'ya dönülecek.

- [ ] **GO**
- [x] **GO + şekil farkı**: CEO, 2026-11-08, sohbet ("GO + şekil farkı"), K-15
- [ ] **NO-GO**
