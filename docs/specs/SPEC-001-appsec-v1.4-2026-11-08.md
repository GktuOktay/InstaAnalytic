# SPEC-001 v1.4 · AppSec kısa doğrulama (durak A, 2026-11-08)

Karar: **PASS-koşullu.** CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1 · INFO 3. Koşul: imzadan önce S-26 metni düzeltilir.

Kapandı: S-22, S-23, S-24 (kabul edilmiş artık risk; §8 + imza bloğu 4. madde), S-25, I-7, I-8, I-10, I-11, I-12. Kısmen: I-6 (eşzamanlı önizleme 409'un AC/testi yok → I-13), I-9 (testi yok → I-14).

| # | Önem | Bulgu | Öneri |
|---|---|---|---|
| S-26 | LOW | AC-U21/§6.6 arayüzün `stop(start_failed)` çağırdığını söylüyor; AC-C50/§7.8 arayüze yalnız `user_stop` izin veriyor → harfiyen uygulanırsa 422, parti `running` kalır, eklentiye geç ulaşan iş sürer | Arayüz `{reason:'user_stop'}` ya da `{reason:'start_failed', run_seq}` gönderebilsin; `run_seq` yoksa yalnız `user_stop`. Test: `test_ui_start_failed_stop_applies_with_current_run_seq`, `run_seq`'siz `circuit_breaker` → 422 |
| I-13 | INFO | Eşzamanlı önizleme `UniqueViolation` → 409, AC/test yok | AC-C5'e cümle + `test_concurrent_preview_returns_409_not_500` |
| I-14 | INFO | Kapının alt sınırı yeniden uygulamasının testi yok | AC-L9'a `test_gate_reapplies_delay_floor` (önbellekte `delay_min=3` → kapı 10 kullanır) |
| I-15 | INFO | `start` `stale_after_s`'i sıfırlamıyor; yalnız gevşetir, güvenlik etkisi yok | İsteğe bağlı: `start`'ta `stale_after_s = null` |

v1.4 değişiklikleri (coalesce/T_eff, run_seq, §8 artık risk listesi) yeni HIGH/CRITICAL yaratmıyor.
