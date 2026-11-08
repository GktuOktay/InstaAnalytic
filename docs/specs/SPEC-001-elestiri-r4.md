# SPEC-001 · Spec eleştirisi R4 (v1.3, yalnız Faz 0+1, spec-critic, 2026-11-08)

Karar: **İmzaya hazır değil.** Critical 1 · High 0 · Medium 4 · Low 7. Critical kapanınca kısa doğrulamayla imzaya gidebilir. R3 (19 bulgu): 16 kapandı, 3 kısmen (#1, #10, #15), açık yok. Yeni Type 1 (CEO'ya) bulgu yok.

Critical:
- C-1 (= AppSec S-22): Takılı parti kuralı `now − last_seen_at > T`; `start` `last_seen_at`'i yazmıyor. (a) Duruştan sonra yeniden Başlat → ilk `status`/`next` partiyi hemen `stopped(stale)` yapar; "hazır" kuralı yüzünden bu her devamı etkiler. (b) İlk Başlat'ta `last_seen_at` null; `ia-run` kaybolursa parti 7 güne kadar `running`. Öneri: `start` satırına ve AC-C40'a `last_seen_at = now`; formül `now − coalesce(last_seen_at, started_at) > T`; AC-C44'e iki sınama.

Medium:
- M-1: Aggressive profilde `hourly_cap` ve hesap tavanı ikisi 80; son 1 saatteki tek takip işlemi Başlat'ı ≤60 dk pasif bırakır, `next_allowed_at` kayar. Öneri: `need = max(1, min(hourly_cap, kalan, account.hourly − follow_done_1h))`, günlük tarafa benzer sınır, AC-C42'ye sınama.
- M-2: Sözleşme boş `q` gönderiyor, kural boş `q`'ya 422 diyor. Öneri: boş/yalnız `@` `q`, boş `media_type`/`collection_id` = filtre yok.
- M-3: Yeniden taramada istemcideki seçimin korunup korunmadığı tanımsız; kesilme iletisi vaadi büyük partide gerçekleşmiyor. Öneri: geçiş tablosuna satır, iletiyi gerçeğe uydur.
- M-4: `ia-run` yanıtsız/zaman aşımı/`ok:false` dönerse parti `running` kalır. Öneri: `ok:true` dışındaki her sonuçta ve 10 sn yanıtsızlıkta `stop(start_failed)`.

Low: L-1 `T` son `next`'teki `stale_after_ms` olarak saklansın; L-2 "filtre modu + sayfa değişir" satırı; L-3 `confirmed` partiye `stop` → 200, değişiklik yok; L-4 §7.9.5 metin tablosunda eksik kodlar (AC-U26 geçemez); L-5 kalıcı hata tanımı iki yerde farklı (401/410/422); L-6 `already` sonrası `too_soon` ile okuma/precheck sırası; L-7 `precheck` `stopped` davranışı iki tabloda farklı.
