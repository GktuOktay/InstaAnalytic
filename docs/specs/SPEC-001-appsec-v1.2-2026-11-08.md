# SPEC-001 v1.2 · AppSec delta incelemesi (durak A, 2026-11-08)

Kapsam: yalnız Faz 0+1 (Ek A hariç). Karar: **PASS-koşullu.** CRITICAL 0 · HIGH 0 · MEDIUM 4 · LOW 5 · INFO 5. Koşul: S-13..S-16 imzadan önce REQ/AC + §9 test satırı; S-17 ucuz, eklenmesi önerilir.

Sorulan başlıklar: A-01 S-06'yı karşılıyor (kalan: S-16, S-18). A-02 S-01'in özünü karşılıyor (tek geçersizlik yolu yeniden tarama; ama S-13 çelişkisine dayanıyor, S-14 yeni sapma yolu). Ayar dosyası: yalnız host kullanıcısı ve root çalışan backend/worker konteynerleri yazabilir, uzaktan yazma yolu bulunmadı; tasarım kabul edilebilir, ancak S-15, S-19, S-20, S-21. Durdur akışı sunucu tarafında iyi; boşluklar S-16, S-17.

| # | Önem | Bulgu | Öneri | Test |
|---|---|---|---|---|
| S-13 | MEDIUM | Onaydaki `plan_changed` `scan_id IS NULL`'a dayanıyor; AC-C22 (eski tarama silinir) ile §7.4/AC-C32 (son 20 tarama kalır) çelişiyor → yeniden taramadan sonra eski taslak onaylanabilir | §7.6 adım 4: `batch.scan_id` = profilin güncel envanter taraması; AC-C22 ile §7.4'ü birleştir | `test_confirm_rejects_after_rescan_even_if_old_scan_row_kept` |
| S-14 | MEDIUM | Filtre modunda önizlenen küme kullanıcının gördüğü envanterden kopabilir (preview'da `scan_id` yok; liste istemciden çizilebilir; kaçışsız `ILIKE` ile `_` joker) | `preview`'a zorunlu `scan_id` → farklıysa 409; diyalog listeyi yalnız sunucudaki `plan_refs`'ten çizer; envanter ve önizleme tek filtre fonksiyonu + LIKE kaçışı | `test_preview_rejects_scan_mismatch`, `test_inventory_and_preview_filter_identical`, `extras.test.tsx::preview list from server plan` |
| S-15 | MEDIUM | Sert tavan kırpması NaN ile atlanır (`min(max(nan,1),80)=nan`, `500>=nan` False); bool int sayılır | Tamsayıda `type(v) is int`, kesirde `math.isfinite`; gate son adımda yeniden `min(değer, HARD_CAP)`; istisnada `allow=false` | `test_nan_inf_bool_huge_negative_never_exceed_caps` |
| S-16 | MEDIUM | Takılı parti yalnız `next`'te; uykudan uyanan döngü precheck ile saatler sonra Başlat'sız yazabilir; `delay_max` tavanı (900 sn) takılma eşiğini (600 sn) aşıyor | Kuralı precheck ve günlük beat'te de uygula: `now-last_seen_at > max(600, 2×delay_max+60)` → `stop(stale)`; ya da `delay_max` tavanı 270 sn | `test_precheck_after_long_silence_stops_batch` |
| S-17 | LOW | Durdur/iptal/kapatma ile precheck arasında kilit sırası yok (yarışta durdurulduktan sonra bir öğe daha) | stop, cancel, PUT settings aynı profil satırı kilidini alır; iptal edilmiş öğeye `done` yalnız `prechecked_at` son 120 sn içindeyse | `test_stop_and_precheck_serialised` |
| S-18 | LOW | "Tek aktör" varsayımı sunucuda zorlanmıyor; gecikme yalnız istemcide | Kilit altında "son izinden bu yana ≥ delay_min", aksi `allow=false, retry_after`; isteğe bağlı `run_seq` | `test_two_actors_respect_min_gap` |
| S-19 | LOW | İlişkili kural ihlalinde anahtar bazında varsayılana dönmek ayarı gevşetebilir | Grubun tamamı varsayılana döner ya da daha kısıtlayıcı değer seçilir | `test_relational_violation_never_loosens` |
| S-20 | LOW | Bilinmeyen anahtar adları ve değerler loga/API'ye ham yansır (TOML tırnaklı anahtarda `\n` → sahte log satırı) | Yalnız bilinen anahtar adları; desen dışı → `<invalid>`; `value` yalnız sonlu sayıysa | `test_unknown_key_with_newline_not_logged_raw` |
| S-21 | LOW | Tavan içindeki limit değişikliklerinin denetim izi yok; değişiklik yalnız mtime/boyutla algılanıyor | Her yeniden okumada INFO log (sha256 + değişen anahtarlar); panelde son değişiklik + hash; içerik hash'iyle tespit | `test_reload_logs_hash_and_changed_keys`, `test_same_size_same_mtime_change_detected` |

INFO: I-1 isteğe bağlı `./backend/config:/app/config:ro` bağlaması; I-2 onayda `item_count ≤ güncel batch.max_items`; I-3 `POST /stop` başarısızsa "Durdurulamadı" + "Tekrar dene"; I-4 `GET /cleanup/limits` mutlak yol dönüyor (yerelde sorun değil); I-5 Durdur'dan hemen sonra Başlat kafa karıştırıcı, `run_seq` çözer.

Taranmayan: bağımlılık/secret taraması, DAST (kod yok), Instagram uç noktaları (T-0a), Ek A.
