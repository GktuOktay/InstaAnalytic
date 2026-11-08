# Mimari görüş (kısa doğrulama): SPEC-001 v1.4

Mimari görüş: `docs/specs/SPEC-001-kaydedilen-ve-dm-temizleme.md` v1.4 (imza kapsamı Faz 0+1; Ek A incelenmedi) | Tarih: 2026-11-08 | Karar: **ONAY**

> Bu bir görüştür; spec değiştirilmedi. Önceki görüş: `gorus-SPEC-001-v1.3-2026-11-08.md` (K-3, K-4, N-4..N-8).

## 1. Koşulların doğrulaması

| # | İstenen | v1.4'teki karşılığı | Sonuç |
|---|---|---|---|
| K-3 (1) | `run_seq` `ia-run` komutunda, `cleanCmd` doğrular | AC-C33; AC-C40 "Başlat" (`start` yanıtı `run_seq` döner, `ia-run` `{kind, session_id, batch_id, run_seq}`); §6.6 "Komut" | **Karşılandı** |
| K-3 (2) | `next`, `precheck`, `result`, eklenti `stop`'u `run_seq` taşır | AC-C49 1. madde; §7.8 gövdeleri (`next`, `precheck`, `result`, `stop` eklentiden `{reason, run_seq, viewer_id}`); §6.6 adım 3 ve 6 | **Karşılandı** |
| K-3 (3) | `next`/`precheck`'te uyuşmazlık → `reason=stopped` | AC-C49 2. madde; §7.8 `next` satırı; `precheck` denetim listesi | **Karşılandı** |
| K-3 (4) | Eklenti `stop`'unda uyuşmazlık → 200, değişiklik yok, `cleanup_anomaly`; arayüz `user_stop` her zaman geçerli | AC-C49 4. ve 5. madde; §7.8 `stop` yanıtında `applied:false`; §6.6 bitiş tablosu "eski `run_seq`" satırı; §6.8 durum tablosunda ayrı satır | **Karşılandı.** `result`'ta uyuşmazlığın engellemeyip yalnız not düşmesi (AC-C49 3. madde) doğru: yürütülmüş işlemin sonucu kaybolmaz. |
| K-3 test | — | §9 AC-C49: `test_next_with_old_run_seq_is_stopped`, `test_extension_stop_with_old_run_seq_does_not_stop_new_run`, `test_user_stop_always_applies` | **Karşılandı** |
| K-4 (a) | `cleanup_tasks` `include` listesinde | §7.4 "Kayıt (K-4)"; AC-C32; T-4a | **Karşılandı** |
| K-4 (b) | §10'da `docker compose restart worker` + `inspect registered` | §10 diyagramında `W` düğümü; açıklamada gerekçe (`docker-compose.yml:53`, `:59`) ve `celery -A app.tasks.celery_app inspect registered` beklentisi | **Karşılandı.** Uygulama adı `docker-compose.yml:59`'daki `-A app.tasks.celery_app` ile aynı. Backend'de `--reload` var (`:45`); yeni uç noktalar için ayrıca yeniden başlatma gerekmez. |
| K-4 (c) | Kayıt testi | AC-C32 kayıt kanıtı (4 alt madde); §9 `test_celery_registration.py::test_cleanup_tasks_included_scheduled_and_registered`; T-6 dosya listesi | **Karşılandı** |

## 2. Uygulama notları

| # | v1.4'teki yeri | Sonuç |
|---|---|---|
| N-4 | `stale_after_s` + `T_eff = max(T_güncel, stale_after_s)` (AC-C44 kuralı, §6.6) | Girdi (notun ötesinde, bağlayıcı kural olarak) |
| N-5 | §7.4 tablo `expires=55` ve ön süzme; AC-C32 | Girdi |
| N-6 | §7.4 "Eşzamanlı önizleme" | Girdi |
| N-7 | §6.5, T-pre | Girdi |
| N-8 | AC-C48, §6.6 adım 7 ve bitiş tablosu; §9 `five too_soon trigger circuit_breaker` | Girdi |

## Gereksiz bulunanlar

Yok. v1.4 yeni katman, servis ya da bağımlılık eklemiyor.

## Geri alması pahalı kararlar

Değişiklik yok. ADR-0001 geçerli; `run_seq` ve `stale_after_s` tablo içi kolonlar, migration henüz uygulanmadı, ADR gerekmez.

## STACK.md değişikliği

Yok. Yeni teknoloji yok; CEO'ya yeni bağımlılık rotası açılmıyor.

## Cevaplanmamış sorular

1. **(CEO, CK-16)** Bütçe tavanı 22 g, v1.4 tahmini 26,7 g. Kurul konusu değil. Kurul, `run_seq`'in (K-3) "daraltılmış alternatif"te ertelenmemesini önermeye devam ediyor.

## Kayda geçen gözlemler

- Hiçbir komut ya da test koşturulmadı (kurulun Bash yetkisi yok). `docker-compose.yml:45`, `:53`, `:59` 2026-11-08'de okunarak doğrulandı.
