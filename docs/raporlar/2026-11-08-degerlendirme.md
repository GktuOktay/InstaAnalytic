# InstaAnalytic · Değerlendirme ve iyileştirme önerileri (2026-11-08)

Kapsam: backend (FastAPI + Celery), frontend (React + TS), Chrome eklentisi (MV3, v2.8.6), CI, dokümanlar. Kaynak: repo `main` @ `b7f51b9`, çalışan Docker yığını, yerel test koşusu.

## Kısa sonuç

Ürün çekirdeği sağlam: fail-closed API token, Fernet şifreli oturum, 127.0.0.1'e bağlı portlar, risk profili + bütçe + cooldown, kalıcı aksiyon kuyruğu ve denetim kaydı, 162 backend + 239 frontend/eklenti testi, CI'da gitleaks + pip-audit + npm audit. Zayıf yanlar ürünün kendisinden çok **çevresinde**: yerel test ortamı kırık, dokümanlar kodun gerisinde, eklentinin kullanıcıya verdiği bir söz artık doğru değil, büyük dosyalar bakım yükü üretiyor ve proje yönetimi araçlara (BookStack/Plane/Penpot) bağlı değil.

## Bulgular (önem sırasıyla)

| # | Önem | Alan | Bulgu | Kanıt | Öneri |
|---|---|---|---|---|---|
| D-01 | Yüksek | Doğruluk / güven | Eklenti açıklaması ve README "Instagram'a kendisi hiçbir istek göndermez" diyor; ama doğrudan takipten çıkma modu `content.js` içinde `/api/v1/friendships/show/` ve `/api/graphql` istekleri gönderiyor. Yeni unsave/DM silme işleri bu farkı büyütecek. | `frontend/extension/manifest.json` description, `frontend/extension/README.md:8`, `frontend/extension/content.js` `apiAct` | Metni gerçeğe çevir: "Siz açmadıkça istek göndermez; açtığınız işlerde sizin oturumunuzla, sizin hızınızda istek gönderir." Ayarlarda hangi işlerin doğrudan istek kullandığını göster. |
| D-02 | Yüksek | Test ortamı | Yerelde `npx vitest run` 239 testin tamamında `localStorage.clear is not a function` ile düşüyor. Sebep Node 25'in yerleşik deneysel `localStorage`'ı jsdom'unkini gölgeliyor. CI Node 20 kullandığı için yeşil; yerelde kanıt üretilemiyor. | `node -v` → v25.9.0; `NODE_OPTIONS=--no-experimental-webstorage` ile 235/239 geçiyor | `.nvmrc` (20 veya 22 LTS) + `package.json` `engines`; ya da `test` betiğine `--no-experimental-webstorage`. |
| D-03 | Orta | Test kararlılığı | Bayrakla bile 4–5 bileşen testi 5 sn varsayılan süreyi aşıyor (`SessionPage — ZIP first`, `FansPage > lists fans…`). Yavaş makinede kırmızı, hızlıda yeşil: güvenilmez kanıt. | `src/test/components.test.tsx` | `findBy*` beklemelerini daralt, `userEvent` gecikmesini kapat (`delay: null`), gerekiyorsa `testTimeout: 15000`. |
| D-04 | Orta | Test ortamı | Backend imajında pytest yok (`requirements-dev.txt` kurulmuyor); "testleri çalıştır" talimatı container içinde doğrudan çalışmıyor. | `docker exec instaanalytic-backend-1 python -m pytest` → `No module named pytest` | Dockerfile'a `ARG DEV=0` ile dev bağımlılıkları; ya da `scripts/test.sh` (geçici test container'ı). |
| D-05 | Orta | Doküman | `TOPOLOGY.md` portları eski (3000/8000; gerçek 3002/8001, Postgres 5434), şifreleme "AES-256" yazıyor (gerçek: Fernet, AES-128-CBC + HMAC; README doğru). `docs/05-api-endpoints.md` bridge/notifications/ghosts uçlarını kapsamıyor. | `TOPOLOGY.md` Ports + Security Design, `docker-compose.yml` | TOPOLOGY'yi düzelt; API belgesini FastAPI OpenAPI'den üret (`/openapi.json` → md) ve CI'da fark kontrolü. |
| D-06 | Orta | Bakım | Büyük, çok sorumluluklu dosyalar: `extension/background.js` 1019 satır, `services/bridge.py` 644, `services/playwright_instagram.py` 654, `tasks/sync_tasks.py` 625. Yeni iki iş türü (unsave, DM) eklenirse background.js'e yeni kollar girer. | `wc -l` | Yeni işlerden önce eklenti iş motorunu "iş türü kaydı" desenine böl (`jobs/follow.js`, `jobs/unsave.js`, `jobs/dm.js`); backend'de `bridge_actions` iş türünden bağımsız hale gelsin (SPEC-001'in veri modeli kararıyla birlikte). |
| D-07 | Düşük | Kod kalitesi | 43 adet geniş `except Exception`; bir kısmı hatayı sessizce yutuyor. `bridge_actions.py`'de `API_DELAY` iki kez tanımlı. | `grep -rn "except Exception" backend/app` | Yutulan yerlerde en az `log.warning(..., exc_info=True)`; tekrar satırı sil. Ruff `BLE001` kuralı CI'ya. |
| D-08 | Düşük | Gözlemlenebilirlik | Kuyruk işleri için sağlık özeti yok: kaç iş bekliyor, son başarılı işlem ne zaman, eklenti en son ne zaman bağlandı tek ekranda değil. | Monitor sayfası Celery odaklı | "Sistem durumu" kartı: eklenti son görülme, bekleyen işler türe göre, son engel/cooldown. |
| D-09 | Düşük | Yedek | Kullanıcı verisi yalnız Docker volume'unda; yedek/geri yükleme yolu yok (CSV dışa aktarma var ama geri yüklenemez). | `docker-compose.yml` volumes | `scripts/backup.sh` (pg_dump + şifreli arşiv) ve geri yükleme adımı. |
| D-10 | Süreç | Proje yönetimi | İşler, kararlar ve tasarım SR IMS'teki gibi BookStack/Plane/Penpot'a bağlı değil; spec ve imza izi yok. | — | Bu çalışmada kuruldu: BookStack › InstaAnalytic rafı, Plane › InstaAnalytic (IA) projesi, Penpot › InstaAnalytic projesi, repo `CLAUDE.md`. |

## Sistemi daha iyi hale getirmek için yön

1. **Önce kanıt zemini (1 gün):** D-02, D-03, D-04. Yerelde tek komutla yeşil test görülmeden yeni özellik eklemek, "bitti" demeyi imkânsız kılar.
2. **Dürüst iletişim (yarım gün):** D-01. Silme işleri gelmeden önce kullanıcıya verilen söz düzeltilmeli; aksi halde yeni özellik güven kaybı yaratır.
3. **Yeni işlere hazırlık (1–2 gün):** D-06'nın iş türü kaydı kısmı. SPEC-001 (kaydedilenleri ve DM temizleme) bunun üzerine oturur.
4. **SPEC-001 (imzadan sonra):** kaydedilenleri kaldırma + whitelist'li DM silme.
5. **Sürekli:** D-05 (API belgesini koddan üret), D-07, D-08, D-09.

## Doğrulama notu

- Frontend: `npx vitest run` → 239/239 başarısız (D-02); `NODE_OPTIONS=--no-experimental-webstorage npx vitest run` → 235 geçti, 4 zaman aşımı (D-03).
- Backend: `docker exec instaanalytic-backend-1 python -m pytest -q` (dev bağımlılıkları elle kurularak, D-04) → `162 passed, 15 warnings in 12.33s`.
