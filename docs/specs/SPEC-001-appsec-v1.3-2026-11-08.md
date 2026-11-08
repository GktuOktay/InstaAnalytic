# SPEC-001 v1.3 · AppSec delta doğrulaması (durak A, 2026-11-08)

Karar: **PASS-koşullu.** CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 3 · INFO 7. Koşul: S-22 için AC + §9 testi imzadan önce; S-23..S-25 ucuz, eklenmeleri önerilir.

Önceki bulgular: S-13..S-21 kapandı; I-1, I-2, I-3, I-5 kapandı; I-4 kısmen (API'nin göreli yol döndüğünü sınayan backend testi yok).

| # | Önem | Bulgu | Öneri | Test |
|---|---|---|---|---|
| S-22 | MEDIUM | Takılı parti denetimi `last_seen_at`'e dayanıyor, `start` bunu yenilemiyor: limit sonrası ~60 dk bekleyip yeniden Başlat → ilk `next`/beat partiyi `stale` yapar (≈13 Başlat akışı çalışmaz). Hiç görülmemiş partide `last_seen_at` NULL → hiç `stale` olmaz (REQ-24 ihlali) | `start` aynı işlemde `last_seen_at = now`; kural `now − coalesce(last_seen_at, started_at) > T` | `test_restart_after_long_stop_is_not_stale`, `test_started_but_never_seen_goes_stale` |
| S-23 | LOW | Eklentinin `stop` çağrısında `run_seq` yok: eski iş yeni çalıştırmayı durdurabilir; AC-C51 ile §6.6 çelişiyor | Eklenti `stop`'u `run_seq` taşır; eskiyse durdurmaz, `cleanup_anomaly` yazar; arayüz `user_stop` her zaman uygulanır; AC-C51'e "sunucu stopped döndüyse stop çağrılmaz" | `test_extension_stop_with_old_run_seq_does_not_stop_new_run` |
| S-24 | LOW | 429 sonrası hemen yeniden Başlat mümkün; her Başlat bir deneme daha; artık risk §8'de yok | §8'e "kabul edilmiş artık risk" satırı (CEO imzada görür); isteğe bağlı: 24 sa'te ikinci `rate_limited` → `blocked` ya da `next_allowed_at ≥ now + delay_max` | (seçilirse) `test_second_rate_limited_in_24h_pauses` |
| S-25 | LOW | `collection_id` filtre girdisinin doğrulaması tanımsız (jsonb sorgusu ham metinle kurulursa SQLi) | `^\d{1,25}$` aksi 422; parametreli sorgu | `collection_id="1' OR '1'='1"` → 422 |

INFO: I-6 beat koşullu UPDATE ya da profil kilidi, eşzamanlı önizleme 409; I-7 `T` için son `stale_after_ms` saklansın, `max(saklanan, güncel T)`; I-8 `retry_after` ≥1 tamsayı, LIKE'ta `_` kaçışı; I-9 kapı alt sınırı da yeniden uygular `max(delay_min, 10)`; I-10 `stop.reason` enum + `extra='forbid'`; I-11 `changed=[…]` yalnız bilinen anahtarlar, API `path` mutlak değil testi; I-12 §8'de `run_seq` kimlik doğrulayıcı değil, metin düzeltilsin.

Doğrulanan: `blockedResponse` bugün 429'u `blocked` sayıyor (`frontend/extension/content.js:313`); spec'in "429 önce ayrılır" talimatı gerekli.

Taranmayan: bağımlılık/secret taraması, DAST (kod yok), Instagram uç noktaları (T-0a), Ek A.
