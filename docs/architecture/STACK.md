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
| instagrapi (Instagram özel mobil API istemcisi, eski "Plan A") | retire | SPEC-002: çalışma yolunda kullanılmıyor (`instagram.py` ölü kod), açık kaydı var (GHSA-ggxf-37hm-9wqf), "uygulama Instagram'a istek göndermez" ilkesine aykırı. Kesinleşmesi SPEC-002 Soru 1 = A'ya bağlı | 2026-11-09 | yok (çıkış maliyeti sıfır; `gorus-SPEC-002-2026-11-09.md`) |
| Python kilit dosyası (hash'li; araç seçilmedi) | assess | SPEC-002 R-8: geçişli bağımlılıklar kilitsiz. SPEC-003 adayı; araç gerekçe tablosuyla kurula gelecek | 2026-11-09 | yok |
| Yapılandırma dosyası: TOML (`tomllib`, Python standart kütüphanesi) | trial | SPEC-001 v1.2 §6.5: ek iş sınırları `backend/config/limits.toml`; yeni bağımlılık yok (Python 3.12, `backend/Dockerfile:1`); sert tavanlar kodda. Repodaki ilk TOML kullanımı; Faz 1 teslimiyle `adopt`'a aday | 2026-11-08 | yok (çıkış maliyeti düşük; `gorus-SPEC-001-v1.2-2026-11-08.md` §3) |

SPEC-001 (2026-11-08): yeni teknoloji yok, durum değişikliği yok.
SPEC-001 v1.1 yeniden inceleme (2026-11-08): yeni teknoloji yok, durum değişikliği yok; yeni eklenti izni yok.
SPEC-001 v1.2 kısa bakış (2026-11-08): TOML yapılandırma dosyası `trial` olarak girdi (üçüncü taraf bağımlılık değil); ADR-0001 Accepted.
SPEC-001 v1.3 kısa doğrulama (2026-11-08): yeni teknoloji yok, durum değişikliği yok; mevcut Celery beat'e iki görev ekleniyor (`gorus-SPEC-001-v1.3-2026-11-08.md`).
SPEC-001 v1.6 kısa bakış (2026-11-08): yeni teknoloji ve bağımlılık yok, yeni eklenti izni yok. Unsave, Instagram'ın iç GraphQL ucuna düz `fetch` ile gider (mevcut takipten çıkma kalıbı); bu bir dış sözleşmedir, yığın kaydı değildir. Durum değişikliği yok (`gorus-SPEC-001-v1.6-2026-11-08.md`).
SPEC-002 kısa görüş (2026-11-09): yeni teknoloji yok. instagrapi `retire` olarak girdi (Soru 1 ile kesinleşir), kilit dosyası `assess`. FastAPI satırı değişmedi; starlette, FastAPI'nin geçişli bağımlılığı olarak `requirements.txt`'e açık güvenlik pini alıyor (`gorus-SPEC-002-2026-11-09.md` K-2).
