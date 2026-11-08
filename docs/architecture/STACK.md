# Standart yığın kaydı: InstaAnalytic

Kurulun tuttuğu kayıt. Durum: adopt / trial / assess / retire. Kayıt dışı bir teknoloji önce "assess" olarak girer ve gerekçe tablosuyla kurula gelir. Sürümler bu kayıtta tutulmaz; kaynak dosyalar (`backend/requirements*.txt`, `frontend/package.json`) esastır.

| Technology | Status | Rationale | Date | ADR |
|---|---|---|---|---|
| FastAPI (Python) backend | adopt | Mevcut yığın (`CLAUDE.md`); kayıt açılırken kuruldan önce seçilmiş | 2026-11-08 | yok (kurul öncesi) |
| PostgreSQL + Alembic | adopt | Mevcut; doğrusal migration zinciri, head `n4d6f8b0c2e4` (2026-11-08 itibarıyla) | 2026-11-08 | yok (kurul öncesi) |
| Celery + Redis (beat dahil) | adopt | Mevcut; arka plan ve zamanlanmış işler | 2026-11-08 | yok (kurul öncesi) |
| React 18 + TypeScript + Vite + Tailwind | adopt | Mevcut (`frontend/package.json`) | 2026-11-08 | yok (kurul öncesi) |
| Zod | adopt | Mevcut (`frontend/package.json`); istemci doğrulaması | 2026-11-08 | yok (kurul öncesi) |
| Vitest + Testing Library, pytest | adopt | Mevcut test katmanları | 2026-11-08 | yok (kurul öncesi) |
| Chrome eklentisi MV3, düz JS, paketleyicisiz, klasik service worker | adopt | Mevcut (`frontend/extension/manifest.json`); SPEC-001 dosya bölmeyi `importScripts` ile önerir, paketleyici eklenmez | 2026-11-08 | ADR-0001 (Accepted 2026-11-08) |
| Docker Compose, yalnız 127.0.0.1 | adopt | Mevcut dağıtım (`docker-compose.yml`) | 2026-11-08 | yok (kurul öncesi) |
| Yapılandırma dosyası: TOML (`tomllib`, Python standart kütüphanesi) | trial | SPEC-001 v1.2 §6.5: ek iş sınırları `backend/config/limits.toml`; yeni bağımlılık yok (Python 3.12, `backend/Dockerfile:1`); sert tavanlar kodda. Repodaki ilk TOML kullanımı; Faz 1 teslimiyle `adopt`'a aday | 2026-11-08 | yok (çıkış maliyeti düşük; `gorus-SPEC-001-v1.2-2026-11-08.md` §3) |

SPEC-001 (2026-11-08): yeni teknoloji yok, durum değişikliği yok.
SPEC-001 v1.1 yeniden inceleme (2026-11-08): yeni teknoloji yok, durum değişikliği yok; yeni eklenti izni yok.
SPEC-001 v1.2 kısa bakış (2026-11-08): TOML yapılandırma dosyası `trial` olarak girdi (üçüncü taraf bağımlılık değil); ADR-0001 Accepted.
SPEC-001 v1.3 kısa doğrulama (2026-11-08): yeni teknoloji yok, durum değişikliği yok; mevcut Celery beat'e iki görev ekleniyor (`gorus-SPEC-001-v1.3-2026-11-08.md`).
