# SPEC-001 sapma kaydi

Imzali spec (`SPEC-001-kaydedilen-ve-dm-temizleme.md`) degistirilmedi; sapmalar burada tutulur.

## AC-C29 gevsetildi

Kriter "sayi" diyor; kod sabit bir sunucu-tarafi kod dizesi donduruyor. AC-C29 gevsetildi: sayi ya da sunucu-tarafi kod dizesi. Karar: ana oturum, CEO yetki devri 2026-11-11. Kanit: `backend/tests/test_cleanup_api.py:486`, `frontend/src/test/extension-cleanup.test.ts:1334`, `frontend/src/test/notification-bell.test.tsx:11` (QA raporu `docs/raporlar/SPEC-001-qa.md` §3).

## B-3: spec §9 test adi -> gercek dosya esleme notu

Spec §9 `test_cleanup.py` ve `extras.test.tsx::...` adlarini verir. Depoda `test_cleanup.py` yoktur; testler konuya gore bolunmustur. Spec'teki 155 `test_*` adindan 54'u bu adlarla bulunamaz (adlandirma farki, ornek: `test_one_active_batch`, `test_stop_and_precheck_serialised`, `test_toggle_audited`). Kod hatasi degil, belge borcudur.

Spec'teki `test_cleanup.py` -> gercek dosyalar (`backend/tests/`):

| Konu | Gercek dosya |
|---|---|
| API uclari, hata zarfi | `test_cleanup_api.py` |
| Butce, kapi, izin sayimi, profil satiri kilidi | `test_cleanup_budget.py` |
| Yurutme, precheck, partiler | `test_cleanup_exec.py` |
| Limit yukleyici/profiller | `test_cleanup_limits.py` |
| Saklama/temizlik sureleri | `test_cleanup_retention.py` |
| Tarama (scan) | `test_cleanup_scan.py` |
| Sema | `test_cleanup_schema.py` |
| Durum makinesi, toggle, denetim | `test_cleanup_state.py` |

Frontend (`frontend/src/test/`): `extras.test.tsx` (panel/sayfa), `extension-cleanup.test.ts` (eklenti kolu), `notification-bell.test.tsx` (zil).

Asil kriter -> `dosya:satir` esleme tablosu `docs/raporlar/SPEC-001-qa.md` §3'tedir; ad bazli eslemede o tablo gecerlidir.

## D-1 risk kabulu

`npm audit`: yalniz gelistirme bagimliliginda (vitest/tinypool/vite) critical bulgu. Konteyner 127.0.0.1'e bagli, bulgu tetiklenmiyor (uretim paketine girmiyor). Yukseltme ayri SPEC'te yapilacak. Karar: ana oturum, CEO yetki devri 2026-11-11.
