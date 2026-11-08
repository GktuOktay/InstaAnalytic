# SPEC-001 · Spec eleştirisi R5 (v1.4, yalnız Faz 0+1, spec-critic, 2026-11-08)

Karar: Critical 0 · High 1. **H-1 düzeltilirse yeni tur gerekmeden imzaya hazır.** R4: C-1 kapandı; M-1..M-3, L-1..L-7 kapandı; M-4 kısmen (H-1).

- H-1 (High; = AppSec S-26): AC-C50/§7.8 "arayüz yalnız `user_stop`" ile AC-U21/§6.6 "arayüz `stop(start_failed)`" çelişiyor. Öneri: arayüz `user_stop` ve `start_failed` gönderebilir; `start_failed` `start` yanıtındaki `run_seq`'i taşır, eskiyse `applied=false`. U21 ve AC-C50'ye birer sınama.

Medium/Low: M-a durmuş partiye/eski `run_seq`'e `result` → `stopped=true`, ardışık `already` okumalarına saatlik üst sınır; L-a §7.8 `last_seen_at` listesine `start`; L-b `not_found` sonrası gecikme ve precheck'siz bildirim; L-c `run_seq` uyuşmazlığında sunucu partiye dokunmaz; L-d takılı `running` partiye `start`; L-e `network`/`unrecognised_shape`/`tokens_missing` metinleri; L-f AC-C42 (f) ifadesi.
