# ADR-0001 — Yıkıcı ek işler ayrı kuyrukta ve ayrı şemada

- Status: Proposed (kurul incelemesi bekliyor)
- Date: 2026-11-08
- Author: business-analyst (spec sahibi; kurul kendi önerisini onaylamaz)
- Related: `docs/specs/SPEC-001-kaydedilen-ve-dm-temizleme.md` v1.1, `docs/architecture/gorus-SPEC-001-2026-11-08.md` (koşul 9)

## Bağlam

SPEC-001 iki geri alınamaz iş ekliyor: kaydedilenlerden çıkarma (unsave) ve DM sohbetini kendi gelen kutusundan silme. Mevcut takip / takipten çıkma kuyruğu (`bridge_actions`) takip ilişkisine sıkı bağlı: `enqueue` `Relationship.we_follow`'a bakıyor (`backend/app/services/bridge_actions.py:86`), `report` ilişkiyi güncelliyor (`:167-174`), `_done_since` tür ayrımı yapmadan sayıyor (`:40-42`), `ig_user_id` `ig_users`'a FK (`backend/app/models/bridge_action.py:16`). Eklenti tarafında takip yolu türe sabit kodlu (`frontend/extension/background.js:680-714`, `:776`, `:901`).

## Karar

### (a) Ayrı şema; `bridge_actions` genelleştirilmez
Yıkıcı işler yeni tablolarda tutulur: Faz 1'de `cleanup_scans`, `saved_targets`, `cleanup_batches`, `cleanup_items`; Faz 2'de `dm_targets`, `dm_whitelist`. `bridge_actions` ve `bridge_actions.py` değişmez. Ek işler kendi kapısını (`cleanup_gate`) kullanır; mevcut `gate()` (`bridge_actions.py:45-51`) `allow_actions`'a bağlı olduğu için yeniden kullanılmaz.

Reddedilen seçenek A (genelleştirme): takip yolunun her fonksiyonuna tür dalı ekler. Bir dal hatası, bir unsave ya da DM silme öğesinin takip uç noktasına (ya da tersi) gitmesine yol açabilir. Parti, önizleme ve onay kavramları A'ya sığmaz. Sessiz regresyon riski, ~300 satırlık kod tekrarından daha pahalıdır.

### (b) `action_log.ig_user_id` nullable
Tek denetim tablosu korunur. DM (çok katılımcı) ve gönderi için tek kişi yoktur; `ig_user_id` nullable olur, `target_ref` ve `target_label` eklenir. Downgrade `ig_user_id`'yi NOT NULL'a geri döndürmez: null satırlar varken bu ya başarısız olur ya da denetim kaydının silinmesini gerektirir. Bu asimetri bilinçlidir ve migration docstring'inde yazılıdır.

### (c) Eklenti ↔ backend sözleşmesi ve sürüm kuralı
- Yeni uçlar `/api/sessions/{id}/cleanup/*` altındadır. Eklenti 2.9.0 ve üstü bu uçları kullanır.
- Backend, `ext_version` alanı eksik ya da `< 2.9.0` olan her `cleanup` yürütme çağrısını (`scan/start`, `next`, `precheck`) 409 `extension_outdated` ile reddeder. Yıkıcı işte sürüm uyumsuzluğu fail-closed olmalıdır.
- Eklentide türden bağımsız `JOB_API` adaptör tablosu kullanılır. Yeni türlerin kodu `frontend/extension/cleanup-bg.js` dosyasındadır, `importScripts` ile yüklenir (klasik service worker, paketleyici yok). Takip yolundaki davranış değişmez. Bunun kanıtı, mevcut eklenti testlerinin değiştirilmeden yeşil kalmasıdır.
- Backend'i geri almak eklentiyi geri almaz. Eklenti 2.9.0 eski bir backend'e karşı çalışırsa `/cleanup/*` 404 döner ve eklenti işi başlatmaz (fail-closed).

## Sonuçlar

- Artı: takip kuyruğunda regresyon riski yok, bütçeler doğal olarak ayrı, DM meta tipli kolonlarda (metin kolonu yok).
- Eksi: `next` / `result` / `history` mantığının bir kısmı yeniden yazılır; iki kuyruk iki ayrı geçmiş ekranı demektir (Aksiyon Geçmişi ikisini `action_log` üzerinden birleştirir).
- Geri dönüş maliyeti: sonradan birleştirmek iki kuyruğun geçmişinin taşınmasını gerektirir.
