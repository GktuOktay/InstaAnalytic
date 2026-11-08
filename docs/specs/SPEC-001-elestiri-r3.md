# SPEC-001 · Spec eleştirisi R3 (v1.2, yalnız Faz 0+1, spec-critic, 2026-11-08)

Karar: **İmzaya hazır değil.** Critical 0 · High 4 · Medium 9 · Low 6. R2 (Y6 hariç 22 bulgu): 16 kapandı, 6 kısmen (Y7, Y9, Y12, Y15, Y16 + yan etkiler).

High:
1. Eklenti birçok yolda `stop()` çağırmadan bitiyor (next/result 0/5xx, paused_until, ardışık hata, login_required/tokens_missing); takılı parti kuralı yalnız sonraki `next`'te → parti süresiz `running`. Öneri: her bitişte `stop(reason)`; `blocked`'ta sunucu `stopped(blocked)`; takılı kontrolü status/start/preview/cancel ya da 1 dk'lık beat; 7 gün süre dolumu `running`'i kapsar.
2. Çalışan partide iptal için durum geçişi yok. Öneri: tek işlemde stop + pending→cancelled + parti `cancelled`.
3. `next_allowed_at` tek boş yer anı; tahmin tam saatlik payı varsayıyor → "≈13 Başlat" onlarca olabilir. Öneri: "hazır" = `min(hourly_eff, kalan)` boş yer.
4. Ayar dosyası tutarlılık kuralları çelişkili; tek anahtar varsayılana dönünce çift yine tutarsız. Öneri: tip → kırp → çift tutarlılığı; ihlalde çiftin ikisi birden varsayılana.

Medium: 5 negatif/0/bool/float kuralları; 6 takılı eşiği `max(10dk, 2×delay_max+60)`, `result` da `last_seen_at` günceller; 7 ısınma 1/3 vs 0,333 tek kaynak; 8 envanterde işlenmiş satırların `state`'i, önizlemede `excluded`, boş önizleme durumu; 9 seçim modu geçişleri; 10 "aynı seçimi yeniden kullan" vaadi (tarama 24 sa eskir); 11 filtre anlamı (`q`, `media_type`, null, LIKE kaçışı); 12 "Durduruluyor" ve eklenti meşgulken Başlat; 13 Instagram 429 sınıfı.

Low: 14 start/stop idempotans, `not_startable`, ilk neden korunur, `stopped`→`done`; 15 neden kodu ↔ TR/EN metin tablosu, `extension_outdated` nedeni; 16 ekranda 500 sabiti yerine `{max}`, önizleme hata metinleri; 17 eksik anahtar/`version`/yol çözümü/`loaded_at`, init adımı; 18 gecikme değişikliği sonraki `next`'te; 19 `next_allowed_at`'e hesap toplamı ve ısınma, ilerleme zamanı `coalesce`.
