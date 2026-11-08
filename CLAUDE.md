# InstaAnalytic — proje talimatları

Self-hosted Instagram analiz ve otomasyon uygulaması. Backend `backend/` (FastAPI + Celery + PostgreSQL + Redis), frontend `frontend/` (React 18 + TS + Vite + Tailwind), Chrome eklentisi `frontend/extension/` (MV3). Arayüz TR/EN.

## Çalışma düzeni

- **Önce doküman, sonra kod.** Her yeni iş kendi spec'iyle başlar (`docs/specs/`). CEO imzalamadan o işin kodu yazılmaz.
- İmza öncesi bağımsız kapılar: spec-critic, appsec, architecture-board, talent-capacity. Bulgular spec'e işlenir.
- Kodu yazan birim onu denetlemez. "Bitti" demek için güncel build/test çıktısı gösterilir.
- Tek branch: `main`. Push, eklenti sürümü yayını, dış mesaj ve kalıcı silme her seferinde CEO onayı ister.

## Dokümanların yeri

| Ne | Nerede |
|---|---|
| Asıl doküman kaynağı (CEO burada okur, soruları yorumla cevaplar) | BookStack › InstaAnalytic rafı: http://bookstack.localhost:6875/shelves/instaanalytic |
| Görevler ve durum | Plane › InstaAnalytic projesi (kısaltma `IA`): http://plane.localhost:8090/sr/ |
| Ekran tasarımları | Penpot › InstaAnalytic projesi: http://penpot.localhost:9001 |
| Repodaki kopyalar | `docs/` (analiz, mimari, API, güvenlik), `docs/specs/`, `docs/raporlar/`, `TOPOLOGY.md` |
| Senkron betikleri | `~/Desktop/Projects/proje-masasi/bin/bs_sync_ia.py` (repo `docs/` → BookStack), `plane_seed_ia.py` (Plane kurulumu/görevler) |
| Kayıt numaraları | `proje-masasi/bookstack/instaanalytic-ids.json`, `proje-masasi/plane/instaanalytic-ids.json` |

Repodaki bir doküman değişince `python3 ~/Desktop/Projects/proje-masasi/bin/bs_sync_ia.py <anahtar>` ile BookStack'e aktarılır. Yeni doküman için betikteki `MAP`'e satır eklenir. CEO kararları BookStack › Kararlar ve Sorular › Karar Kaydı'na işlenir.

## Temel ilkeler (bozma)

- Uygulama Instagram'a kendisi istek göndermez; işler kuyruğa yazılır, eklenti kullanıcının kendi Instagram sekmesinde insan hızında yapar (`services/bridge_actions.py`, `extension/content.js`).
- Hız sınırları risk profilinden gelir (`services/risk_profiles.py`); engel → 24 sa duraklatma; her otomatik işlem `action_log`'a yazılır.
- Oturum Fernet ile şifreli; portlar yalnız 127.0.0.1; tüm `/api` uçları `X-API-Token` ister (fail-closed).
- DM içeriği saklanmaz ve gösterilmez (ZIP içe aktarma mesajları bilinçli olarak yok sayar).

## Yerel çalıştırma ve test

- Yığın: `docker compose up -d` (UI 3002, API 8001, Flower 5555, Postgres 5434).
- Backend testleri izole `instaanalytic_pytest` veritabanında koşar (gerçek veriye dokunmaz). İmajda pytest yok (bkz. IA D-04): `docker exec instaanalytic-backend-1 sh -c 'pip install -q -r requirements-dev.txt && python -m pytest -q'`.
- Frontend: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`. Node 25'te vitest için `NODE_OPTIONS=--no-experimental-webstorage` gerekir (bkz. IA D-02); CI Node 20 kullanır.

## Bilinen tuzaklar

- `TOPOLOGY.md` portları ve şifreleme bilgisi eski (IA D-05); doğru değerler `docker-compose.yml` ve README'de.
- Eklenti metni "hiçbir istek göndermez" diyor ama doğrudan takipten çıkma modu istek gönderiyor (IA D-01).
