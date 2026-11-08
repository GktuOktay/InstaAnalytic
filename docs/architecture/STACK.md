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
| Chrome eklentisi MV3, düz JS, paketleyicisiz, klasik service worker | adopt | Mevcut (`frontend/extension/manifest.json`); SPEC-001 dosya bölmeyi `importScripts` ile önerir, paketleyici eklenmez | 2026-11-08 | ADR-0001 (Proposed, düzeltme istendi 2026-11-08) |
| Docker Compose, yalnız 127.0.0.1 | adopt | Mevcut dağıtım (`docker-compose.yml`) | 2026-11-08 | yok (kurul öncesi) |

SPEC-001 (2026-11-08): yeni teknoloji yok, durum değişikliği yok.
SPEC-001 v1.1 yeniden inceleme (2026-11-08): yeni teknoloji yok, durum değişikliği yok; yeni eklenti izni yok.
