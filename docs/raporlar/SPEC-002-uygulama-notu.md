# SPEC-002 uygulama notu (T-1..T-3, KISMEN: durduruldu)

Tarih: 2026-11-09. Yazan: polyglot-engineer. Durum: **CB-1 karşılanmadı, PB-7 koşulmadı** (aşağıda).

## Seçilen sürümler (spec §2.1 kuralı)
| Paket | Eski | Yeni | Not |
|---|---|---|---|
| fastapi | 0.111.0 | 0.133.0 | starlette üst sınırı olmayan en düşük sürüm (0.132.x `<1.0.0`) |
| starlette | 0.37.2 (geçişli) | 1.10.0 (açık pin) | ≥ 1.3.1 olan en son 1.x |
| cryptography | 42.0.7 | 49.0.0 | 49.x hattında tek sürüm; **PYSEC-2026-3552 açık, düzeltme 50.0.0** |
| python-multipart | 0.0.9 | 0.0.33 | en son 0.0.x |
| python-dotenv | 1.0.1 | 1.2.4 | en son 1.x |
| instagrapi | 2.1.2 | kaldırıldı | + ölü kod (`instagram.py`) |
| pydantic / pydantic-settings | 2.7.1 / 2.2.1 | değişmedi | fastapi 0.133.0 `pydantic>=2.7.0` |

FastAPI 0.133.0 `Requires-Dist`: `starlette>=0.40.0`, `pydantic>=2.7.0`, `typing-extensions>=4.8.0`, `typing-inspection>=0.4.2`.
Yeni geçişli: annotated-doc 0.0.5, typing-inspection 0.4.5, anyio 4.16.0.

## Kanıt
- Taban CI run 42491093608: frontend success, backend failure, secrets success.
- Eski imaj `:pre-spec002` etiketleri (backend, worker, flower) alındı. Sabit token'lar cryptography 42.0.7 ile üretildi.
- PB-2: önce 467 passed, 2 skipped, 15 warnings (T-1 testleri dahil); sonra 467 passed, 2 skipped, 11 warnings. Yeni uyarı yok (instagrapi'nin 4 pydantic uyarısı gitti). Karakterizasyon testleri değiştirilmedi.
- PB-3: `SONUC: up/down/up TAMAM`.
- CB-1 c: `No broken requirements found.` CB-2: `pip show instagrapi` -> `Package(s) not found`; greplar boş (yalnız `sync_tasks.py:30,33` yorumları).
- PB-1 c2: yeni imajda üretilen token eski imajda çözüldü (`cryptography 42.0.7`, sentetik düz metin).
- Test/migrate-check, gerçek yığın kapalı olduğu için tek kullanımlık geçici postgres/redis konteynerlerinde koştu (gerçek veriye dokunulmadı; konteynerler silindi).

## Sapma / engel
1. **CB-1 kırmızı:** `pip-audit` (kaynak ve imaj kümesi) cryptography 49.0.0 için PYSEC-2026-3552 (düzeltme 50.0.0) bildiriyor. Spec kuralı major'da kalmayı söylüyor; çözüm major atlamak. Araştırma (requirements değiştirilmedi): geçici konteynerde `cryptography==50.0.2` ile PB-1 ve ilgili testler 29 passed, `pip check` temiz, imaj içi audit `No known vulnerabilities found`. Karar CEO'da.
2. **PB-7 koşulmadı:** instaanalytic yığını (6 konteyner) 06:24Z'den beri Exited(255); `exec` yapılamıyor, gerçek DB okuma taban/son alınamadı.
