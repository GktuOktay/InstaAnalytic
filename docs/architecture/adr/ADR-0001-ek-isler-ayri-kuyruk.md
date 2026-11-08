# ADR-0001 — Yıkıcı ek işler ayrı kuyrukta ve ayrı şemada

- Status: Accepted (rev. 3; mimari kurul, 2026-11-08; `docs/architecture/gorus-SPEC-001-v1.6-2026-11-08.md` "İkinci tur"). Rev. 2: Accepted (mimari kurul, 2026-11-08; `docs/architecture/gorus-SPEC-001-v1.2-2026-11-08.md`).
- Date: 2026-11-08 (rev. 2: v1.2 ile; rev. 3: v1.6 ile, kurul K-8)
- Author: business-analyst (spec sahibi; kurul kendi önerisini onaylamaz)
- Related: `docs/specs/SPEC-001-kaydedilen-ve-dm-temizleme.md` v1.6, `docs/architecture/gorus-SPEC-001-2026-11-08.md` (koşul 9), `docs/architecture/gorus-SPEC-001-v1.1-2026-11-08.md` (Y-3), `docs/architecture/gorus-SPEC-001-v1.6-2026-11-08.md` (K-8)

## Rev. 3 değişiklikleri (v1.6)
- (a) Faz 1 tablo listesine `saved_collections` eklendi (T-0c = W, K-21).
- (c) Instagram işlem kimlikleri için değişmez eklendi.

## Bağlam

SPEC-001 iki geri alınamaz iş tanımlıyor:
- Kaydedilenlerden çıkarma (unsave). Faz 1, CEO imzası kapsamında.
- DM sohbetini kendi gelen kutusundan silme. Faz 2, Ek A; imza kapsamı dışında.

Mevcut takip / takipten çıkma kuyruğu (`bridge_actions`) takip ilişkisine sıkı bağlı:
- `enqueue`, `Relationship.we_follow`'a bakıyor (`backend/app/services/bridge_actions.py:86`).
- `report`, ilişkiyi güncelliyor (`:167-174`).
- `_done_since`, tür ayrımı yapmadan sayıyor (`:40-42`).
- `ig_user_id`, `ig_users` tablosuna FK (`backend/app/models/bridge_action.py:16`).

Eklenti tarafında da takip yolu türe sabit kodlu (`frontend/extension/background.js:680-714`, `:776`, `:901`).

## Karar

### (a) Ayrı şema; `bridge_actions` genelleştirilmez
Yıkıcı işler yeni tablolarda tutulur:
- Faz 1: `cleanup_scans`, `saved_targets`, `cleanup_batches`, `cleanup_items` ve (rev. 3) `saved_collections`.
  - `saved_collections` profil başına koleksiyon koruma ayarıdır; varsayılan `protected=true`.
  - Ekleyicidir: geri almak kullanıcının koruma seçimlerini siler ve "tümü korunur" moduna döner. Bu güvenli yöndür.
  - `cleanup_scans.collections_mode` (`per_collection` \| `all_protected`) tarama başına moddur. Kod düzeyindeki mod yalnız backend'de tanımlıdır (kurul K-5).
- Faz 2: `dm_targets`, `dm_whitelist`.

`bridge_actions` ve `bridge_actions.py` değişmez. Ek işler kendi kapısını (`cleanup_gate`) kullanır. Mevcut `gate()` (`bridge_actions.py:45-51`) `allow_actions`'a bağlı olduğu için yeniden kullanılmaz.

Reddedilen seçenek A (genelleştirme): takip yolunun her fonksiyonuna tür dalı ekler. Bir dal hatası, unsave ya da DM silme öğesinin takip uç noktasına gitmesine (ya da tersine) yol açabilir. Parti, önizleme ve onay kavramları da A'ya sığmaz. Sessiz regresyon riski, yaklaşık 300 satırlık kod tekrarından daha pahalıdır.

### (b) `action_log.ig_user_id` nullable
Tek denetim tablosu korunur. DM'de (çok katılımcı) ve gönderide tek bir kişi yoktur; bu yüzden `ig_user_id` nullable olur, `target_ref` ve `target_label` eklenir. Downgrade, `ig_user_id`'yi NOT NULL'a geri döndürmez: null satırlar varken bu ya başarısız olur ya da denetim kaydının silinmesini gerektirir. Bu asimetri bilinçlidir ve migration docstring'inde yazılıdır.

Reddedilen seçenek: ayrı `cleanup_log` tablosu. Aksiyon Geçmişi ekranı (`routers/actions.py:133-162`) tek kaynaktan okumalıdır. İki tablo, iki sayfalama ve iki sıralama demektir; bir kaydın gözden kaçması bu ekranın amacına aykırıdır.

### (c) Eklenti ↔ backend sözleşmesi ve sürüm kuralı
- Yeni uçlar `/api/sessions/{id}/cleanup/*` altındadır ve eklenti 2.9.0+ tarafından kullanılır.
- Backend, `ext_version` alanı eksik ya da `< 2.9.0` olan `scan/start`, `next` ve `precheck` çağrılarını 409 `extension_outdated` ile reddeder (fail-closed). Sürümler sayısal, parça parça karşılaştırılır; eksik parça 0 sayılır (`2.9` = `2.9.0`).
- **Kapsam notu:** `result`, `stop` ve `scan/{id}/finish` sürüm denetiminden bilerek muaftır. Yürütülmekte olan bir öğenin sonucu ya da açık bir taramanın kapanışı, sürüm nedeniyle kaybolmamalıdır. Bu uçlar yeni bir yazma başlatmaz.
- **`importScripts` koruması:** `background.js`, yeni tür kodunu yalnızca şu biçimde yükler:
  ```js
  if (typeof importScripts === 'function') importScripts('cleanup-bg.js');
  ```
  `background.js` yeni türler için yalnızca tek bir isim alanına başvurur (`self.iaCleanup`). Bu isim alanı yoksa yeni türler "desteklenmiyor" yanıtı alır, takip yolu aynen çalışır. Böylece `new Function` ile, `importScripts` tanımsız bir ortamda çalışan mevcut testler (`extension-update.test.ts:1`, `:49`) değiştirilmeden yeşil kalır. Regresyon kanıtı budur.
- **Adaptör yalnız yeni türler için:** takip yolu bir tabloya sarılmaz. `startJob`, `apiNext` ve mesaj yönlendiricisinde tek bir dal bulunur:
  ```js
  if (CLEANUP_KINDS.includes(kind)) return self.iaCleanup.…
  ```
  Kodun tamamı `cleanup-bg.js`'te durur. Bu, kurulun v1.1 önerisi A-04'tür.
- Backend'i geri almak eklentiyi geri almaz. Eklenti 2.9.0 eski bir backend'e karşı çalışırsa `/cleanup/*` 404 döner ve eklenti işi başlatmaz (fail-closed).
- **(rev. 3) Değişmez: Instagram işlem kimlikleri eklentide sabittir.**
  - `doc_id`, `fb_api_req_friendly_name` ve `variables` kalıbı yalnız `content.js` sabitlerinden gelir: `UNSAVE_DOC_ID`, `UNSAVE_NAME`, `COLLECTIONS_DOC_ID`, `COLLECTIONS_NAME` ve `UNFOLLOW_DOC_ID`.
  - Backend, ayar dosyası, `chrome.storage` ve mesajlar bunları sağlayamaz. `cleanCmd` ve `next` yanıtı işlenirken bu alanlar kabul edilmez; gelirse yok sayılır.
  - `variables` içindeki tek değişken değerler şunlardır: doğrulanmış `ref`, istek anındaki `ds_user_id` ve koleksiyon listesi sorgusunun `after` değişkeni. `after`, Instagram'ın bir önceki yanıtındaki `page_info.end_cursor` değeridir; backend'den, ayar dosyasından ya da mesajlardan gelmez.
  - Gerekçe: `doc_id` işlemin kendisini belirler. Uzaktan sağlanabilir bir `doc_id`, yerel bir sürecin (spec §8 sınır 1) eklentiye başka bir mutasyon yaptırmasına yol açar.
  - Bedel: `doc_id` değişince onarım yeni bir eklenti yama sürümüdür (CEO onayıyla).
  - Kanıt: spec AC-C56 testi (`ia-run`/`next` yükündeki fazladan `doc_id` yok sayılır).
  - Reddedilen seçenekler:
    1. Backend ya da ayar dosyasından `doc_id`: yayınsız güncelleme sağlar, ama yukarıdaki saldırı yüzeyini açar.
    2. Çalışma anında Instagram betiklerinden keşif: kırılgandır ve sayfa betiklerini okuma yüzeyini büyütür.

Reddedilen seçenekler:
1. **Sürüm kapısı yok.** Eski eklenti yeni sözleşmeyi bilmez. Örneğin `precheck` yapmadan yazabilir; bu, yıkıcı bir işte kabul edilemez.
2. **Kontrol yalnız eklentide.** Eski eklentide bu kontrol hiç yoktur, dolayısıyla korumaz. Fail-closed kontrolün sunucuda olması gerekir.

### (d) Ortak engel duraklatması
- Ek işler `sessions.cleanup_paused_until` / `cleanup_paused_reason` adlı ayrı kolonları kullanır. `cleanup_gate`, `max(cleanup_paused_until, paused_until)` değerine bakar.
- Bir ek iş engel aldığında iki kolon birden doldurulur: kendi kolonu ve `paused_until`. Böylece takip işleri de 24 saat durur.
- `paused_reason`'a yazılan metin `"Köprü:"` (`PAUSE_PREFIX`, `services/bridge.py:41`) ile başlamaz. O önekle başlayan duraklatmalar, `_warning` (`services/bridge.py:417-421`) tarafından uyarıya çevrilip temizlenir.
- Takip yolunun yazdığı `paused_until` (`bridge_actions.py:160`, `action_tasks.py:148`), ek iş kapısının ilk okumasında `cleanup_paused_until`'a kopyalanır (copy-on-read). `"Köprü:"` önekli duraklatmalar kopyalanmaz, çünkü onlar engel değil eski uyarılardır.
- **Neden ayrı kolon:** `paused_until` üç mevcut yolda temizleniyor: takip anahtarını kapatma (`sessions.py:276-278`), eski oturum dönüşümü (`action_tasks.py:429`) ve köprü uyarı dönüşümü (`services/bridge.py:417-421`). Ek iş engeli bu yollarla erken kalkmamalıdır.
- **Kabul edilen kalan risk:** takip engelinden hemen sonra, ek iş kapısı hiç okunmadan kullanıcı takip anahtarını kapatırsa kopyalama kaçar. Arayüz durumu 5 saniyede bir yokladığı için bu pencere dardır.
- Reddedilen seçenekler:
  1. Üç temizleme yolunu değiştirmek. Spec'in "takip kuyruğu değişmez" ilkesine aykırıdır.
  2. Yalnız `bridge_actions.py:160`'a tek satır eklemek. `action_tasks.py:148` yolunu kaçırır.
- Geri alma maliyeti: bu karar paylaşılan `sessions` durumunun anlamını değiştirir. Geri almak, üç temizleme yolunu yeniden düşünmeyi gerektirir.

## Sonuçlar

- **Artı:** takip kuyruğunda regresyon riski yoktur, bütçeler doğal olarak ayrıdır, DM meta verisi tipli kolonlarda tutulur (metin kolonu yok).
- **Eksi:** `next` / `result` / `history` mantığının bir kısmı yeniden yazılır. İki kuyruk iki ayrı geçmiş ekranı demektir; Aksiyon Geçmişi ikisini `action_log` üzerinden birleştirir.
- **Faz 1 sadeleştirmesi (kurul A-01, A-02):** onay biletleri, öğe kiralama (lease) ve `plan_hash` ile yeniden hesap Faz 1'de yoktur. Faz 2'de AppSec kararıyla gelir (spec Ek A).
- **Geri dönüş maliyeti:** iki kuyruğu sonradan birleştirmek, ikisinin geçmişini taşımayı gerektirir.

## Kurul karar notu (2026-11-08)

Kurulun v1.1 görüşündeki (Y-3) dört ek doğrulandı: (c)'deki `importScripts` koruması ve tek isim alanı, (c)'deki muafiyet notu, (b) ve (c)'deki reddedilen seçenekler, yeni (d). Karar `Accepted`. T-1 bu ADR'ye dayanarak başlayabilir. Kapsam Faz 1 kararlarıdır; (a)'daki Faz 2 tablo adları yönelim olarak durur, Faz 2 spec'i gerekirse bu ADR'yi günceller. Uygulama notu (T-9): isim alanı denetimi `globalThis.iaCleanup` ile yazılsın (node test ortamında `self` tanımsız). Spec'e ait K-1 ve K-2 koşulları bu ADR'nin içeriğini değiştirmez.

## Kurul karar notu, rev. 3 (2026-11-08)

K-8 karşılandı: (a)'da `saved_collections` ve `collections_mode` (`per_collection` | `all_protected`), K-5'e bağlı tek kaynak notu; (c)'de Instagram işlem kimlikleri değişmezi, reddedilen iki seçenek ve kanıt testi (spec AC-C56, §9 test tablosu). Karar `Accepted`. Kapsam Faz 1 W yapımıdır (T-0c = W, K-21).

Engelleyici olmayan not (BA bir sonraki revizyonda düzeltsin): (c)'deki "`variables` içindeki tek değişken değerler doğrulanmış `ref` ve `ds_user_id`" cümlesi koleksiyon sorgusunu tam kapsamıyor. O sorgunun `after` değeri Instagram'ın bir önceki yanıtındaki `end_cursor`'dan gelir (spec §7.2.1 istek 4). Değişmezin özü bozulmaz, çünkü değer backend, ayar dosyası, `chrome.storage` ya da mesajdan gelmez. Cümleye "ve aynı sorgunun önceki sayfa yanıtındaki imleç" eklenmeli.
