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
- Tek komut: `scripts/test.sh` (ikisi), `scripts/test.sh backend [pytest args]`, `scripts/test.sh frontend`. Backend tek kullanımlık konteynerde, izole `instaanalytic_pytest` veritabanında koşar (gerçek veriye dokunmaz).
- Migration kontrolü: `scripts/migrate-check.sh` (geçici veritabanında upgrade → downgrade -1 → upgrade).
- Node 22 LTS hedeflenir (`.nvmrc`); CI da `.nvmrc`'yi okur. Node 25'teki bozuk `localStorage` `frontend/src/test/setup.ts` içinde ele alınır.

## Bilinen tuzaklar

- `TOPOLOGY.md` portları ve şifreleme bilgisi eski (IA D-05); doğru değerler `docker-compose.yml` ve README'de.
- Eklenti metni "hiçbir istek göndermez" diyor ama doğrudan takipten çıkma modu istek gönderiyor (IA D-01).
