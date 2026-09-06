# Instapp — Tech Stack

**Versiyon:** 1.0  
**Tarih:** 2026-09-06

---

## Seçilen Stack

| Katman | Teknoloji | Versiyon | Neden |
|--------|-----------|----------|-------|
| Frontend | React + Vite + TypeScript | React 18, Vite 5 | İstek + hız |
| UI Kütüphanesi | TailwindCSS + shadcn/ui | Tailwind 3 | Hızlı prototip |
| Graf Görselleştirme | Graphify (terminal kurulum) | latest | İlişki ağı görselleştirme |
| HTTP Client | Axios | latest | REST API calls |
| State | Zustand | latest | Lightweight, boilerplate-free |
| Backend | Python FastAPI | 0.110+ | instagrapi ekosistemi, async |
| Instagram Client | instagrapi | 2.x | Plan A — mobile API wrapper |
| ORM | SQLAlchemy 2.0 + Alembic | 2.x | Async support, migration yönetimi |
| Task Queue | Celery + Redis broker | Celery 5.x | Arka plan bulk işlemler |
| Task Monitor | Flower | latest | Celery görsel monitoring |
| Ana Veritabanı | PostgreSQL | 15 | İlişkisel veri, JSON support |
| Cache / Broker | Redis | 7 | Celery broker + rate limit counter |
| Container | Docker + Docker Compose | Compose v2 | localhost orchestration |

---

## Plan A — Instagram Erişim Stratejisi

**instagrapi** kütüphanesi Instagram'ın private mobile API endpoint'lerini kullanır. Kullanıcı `sessionid` cookie'sini uygulamaya girer, backend bu session ile API çağrıları yapar.

**Avantajlar:**
- Gerçek veri (bot tespiti düşük)
- Tüm endpoint'lere erişim
- Rate limit kontrolü kütüphane içinde var

**Riskler:**
- Instagram ToS ihlali (kişisel kullanımda düşük risk)
- Account checkpoint / ban olasılığı

---

## Plan B — Script Tabanlı Tarama

instagrapi çalışmazsa veya ban alınırsa devreye girer.

**Yaklaşım:** Playwright ile headless browser, kullanıcının mevcut tarayıcı profilini (Chrome/Firefox user-data-dir) kullanır. Instagram oturumu tarayıcıdan alınır, sayfa DOM'u parse edilir.

**Script çalıştırma:** Terminal üzerinden, backend Playwright scriptleri yönetir.

**Veri akışı:**
```
Playwright (headless) → DOM parse → JSON output → FastAPI → PostgreSQL
```

**Tetikleyici:** Plan A'da 3 ardışık başarısız API call veya `ChallengeRequired` exception.

---

## Graphify Kurulum

Graf görselleştirme için Graphify terminal scripti ile kurulacak (npm global veya Docker service olarak).

Kullanım alanı:
- Kullanıcı ilişki ağı (mutual follow, tek yönlü)
- Etkileşim grafiği (kullanıcı — gönderi)

Kurulum komutu (ilgili fazda çalıştırılacak):
```bash
# Frontend içinde bağımlılık olarak ya da standalone service
npm install --save react-force-graph
# veya D3.js tabanlı custom graph component
```

Not: "Graphify" standalone bir tool ise Docker service olarak eklenecek. Karar ilgili fazda verilecek.

---

## Port Haritası (localhost)

| Servis | Port |
|--------|------|
| React Frontend | 3000 |
| FastAPI Backend | 8001 (8000 Portainer tarafından kullanılıyor) |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Flower (Celery UI) | 5555 |

---

## Versiyon Yönetimi

- Her servis kendi `Dockerfile`'ına sahip
- `.env` ile konfigürasyon yönetimi
- `docker-compose.yml` tek komutla tüm stack'i ayağa kaldırır
