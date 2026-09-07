<div align="center">

# 📊 InstaAnalytic

**Your Instagram data, on your own server. Zero third-party tracking.**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-3776ab.svg?logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=white)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed.svg?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791.svg?logo=postgresql&logoColor=white)](https://postgresql.org)

[🇹🇷 Türkçe](#tr--türkçe) · [🇬🇧 English](#en--english) · [Docs](docs/) · [Topology](TOPOLOGY.md)

</div>

---

## EN — English

### What is InstaAnalytic?

InstaAnalytic is a **self-hosted, open-source** Instagram analytics and automation platform. It connects to your own Instagram session using your local Chrome profile — no API keys, no OAuth dance, no third-party cloud.

**Everything runs on your machine. Your data never leaves your server.**

---

### Why InstaAnalytic?

| Problem | How InstaAnalytic solves it |
|---|---|
| "Who never engages with my content?" | Ghost Filter — zero-engagement accounts in one click |
| "Which followers are actually real fans?" | User Pool ranked by engagement rate (%) |
| "I need to clean up 500 ghost follows safely" | Rate-limited queue (50/hour) — no ban risk |
| "I don't trust SaaS tools with my session token" | 100% self-hosted, AES-256 encrypted session storage |
| "Analytics tools are expensive" | Completely free, MIT license |

---

### Features

<table>
<tr>
  <td>

**📥 Post Sync**
Fetches all your posts and bulk-scans every like and comment. Paginated, resumable, async.

  </td>
  <td>

**📈 Interaction Report**
Monthly trends, follower vs. outsider breakdown, and your top fans ranked.

  </td>
</tr>
<tr>
  <td>

**👥 User Pool**
Every account you've interacted with, ranked by engagement rate (%). Sort, filter, act.

  </td>
  <td>

**👻 Ghost Filter**
Identify accounts with zero engagement — either direction — in seconds.

  </td>
</tr>
<tr>
  <td>

**⚡ Follow Actions**
Follow / Unfollow / Remove follower — all queued, rate-limited, and audit-logged.

  </td>
  <td>

**🔄 Queue Monitor**
Real-time Celery task dashboard via Flower UI. See exactly what's running.

  </td>
</tr>
<tr>
  <td>

**🛡️ Plan A / Plan B Scraping**
Uses `instagrapi` first; auto-falls back to headless Playwright on rate limits — transparent to you.

  </td>
  <td>

**🌍 Bilingual UI**
Full Turkish / English interface. One toggle, instant switch.

  </td>
</tr>
</table>

---

### Quick Start

**Requirements:** Docker & Docker Compose v2+, Chrome/Chromium with an active Instagram session.

```bash
git clone https://github.com/GktuOktay/InstaAnalytic.git
cd InstaAnalytic

# Copy and configure environment
cp .env.example .env
# Open .env — set CHROME_USER_DATA_DIR to your Chrome profile path

# Launch everything
docker compose up -d
```

| Service | URL |
|---|---|
| App (UI) | http://localhost:3002 |
| REST API | http://localhost:8001 |
| API Docs (Swagger) | http://localhost:8001/docs |
| Celery Monitor | http://localhost:5555 |

> **First run takes ~2 min** while Docker pulls images. Subsequent starts are instant.

---

### How It Works — 3 Steps

```
1. SESSION    → InstaAnalytic reads your Chrome profile and authenticates locally.
               Your credentials never touch InstaAnalytic's code.

2. SYNC       → A background Celery worker fetches followers, following, posts,
               likes, and comments — paginated and rate-respectful.

3. ACT        → Browse the User Pool, apply the Ghost Filter, queue bulk
               follow/unfollow with a safe 50-actions/hour cap.
```

---

### Architecture

```
InstaAnalytic/
├── backend/              # FastAPI + Celery worker
│   ├── app/
│   │   ├── models/       # SQLAlchemy ORM (PostgreSQL)
│   │   ├── routers/      # REST endpoints
│   │   ├── services/     # instagrapi + Playwright clients
│   │   └── tasks/        # Async Celery tasks
│   └── alembic/          # DB migrations
├── frontend/             # React 18 + TypeScript + Vite + Tailwind
│   └── src/
│       ├── api/          # Axios clients
│       ├── i18n/         # TR/EN strings
│       ├── pages/        # Route pages
│       └── components/   # Shared UI
├── docs/                 # Full technical documentation
├── TOPOLOGY.md           # Service map, ports, data flows
├── docker-compose.yml
└── .env.example
```

Full topology → [TOPOLOGY.md](TOPOLOGY.md)  
Full docs → [docs/](docs/)

---

### Security Model

- **Session tokens** stored AES-256 encrypted in PostgreSQL — never in plaintext
- **`.env`** never committed — use `.env.example` as your template
- **Backend** is Docker-internal only — not exposed to the internet by default
- **Rate limiting** via Redis sliding-window — protects your account from Instagram bans
- **Audit log** — every automated action is recorded in `action_log`

---

### Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

Quick guide:
1. Fork → `git checkout -b feat/your-feature`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/)
3. Add TR/EN translations for any new UI strings (`frontend/src/i18n/`)
4. Open a PR — describe what and why

Found a bug? [Open an issue](https://github.com/GktuOktay/InstaAnalytic/issues/new/choose).

---

### Roadmap

- [ ] Export reports to CSV / PDF
- [ ] Scheduled auto-sync (cron)
- [ ] Story / Reel engagement tracking
- [ ] Multi-account support
- [ ] Telegram bot notifications for queue status

---

## TR — Türkçe

### InstaAnalytic Nedir?

InstaAnalytic, **kendi sunucunuzda** çalışan, açık kaynaklı bir Instagram analitik ve otomasyon platformudur. Yerel Chrome profiliniz üzerinden kendi Instagram oturumunuza bağlanır — API anahtarı yok, OAuth yok, üçüncü taraf bulut yok.

**Her şey sizin makinenizde çalışır. Verileriniz hiçbir zaman sunucunuzu terk etmez.**

---

### Neden InstaAnalytic?

| Sorun | Çözüm |
|---|---|
| "Hiç etkileşim kurmayan takipçilerimi nasıl bulacağım?" | Hayalet Filtresi — tek tıkla sıfır etkileşimli hesaplar |
| "Hangi takipçilerim gerçek fan?" | Kullanıcı Havuzu — etkileşim oranına (%) göre sıralı |
| "500 hayalet takibi güvenle nasıl temizlerim?" | Saate 50 işlem sınırlı kuyruk — ban riski yok |
| "SaaS araçlara session token'ımı vermek istemiyorum" | Tam self-hosted, AES-256 şifreli session saklama |
| "Analitik araçlar pahalı" | Tamamen ücretsiz, MIT lisansı |

---

### Özellikler

| Modül | Açıklama |
|---|---|
| **Gönderi Senkronizasyonu** | Tüm gönderiler; beğeni ve yorumlar sayfalı ve eşzamansız olarak çekilir |
| **Etkileşim Raporu** | Aylık trend, takipçi/dışarıdan kırılımı, en aktif hayranlar |
| **Kullanıcı Havuzu** | Etkileşim oranına (%) göre sıralanmış kişi listesi |
| **Hayalet Filtresi** | Sıfır etkileşimli hesaplar — her iki yönde |
| **Takip Aksiyonları** | Takip et / Takipten çık / Takipçiden çıkart — kuyruklu ve hız sınırlı |
| **Kuyruk Monitörü** | Flower UI ile Celery görev durumu — gerçek zamanlı |
| **Plan A / Plan B** | `instagrapi` önce dener; hız limitinde Playwright'a otomatik geçer |
| **Dil Seçeneği** | Türkçe / İngilizce arayüz |

---

### Hızlı Başlangıç

**Gereksinimler:** Docker & Docker Compose v2+, Instagram oturumu açık Chrome/Chromium

```bash
git clone https://github.com/GktuOktay/InstaAnalytic.git
cd InstaAnalytic

# Ortam değişkenlerini yapılandır
cp .env.example .env
# .env dosyasını aç — CHROME_USER_DATA_DIR'i Chrome profil yoluna ayarla

# Tüm servisleri başlat
docker compose up -d
```

| Servis | Adres |
|---|---|
| Uygulama (UI) | http://localhost:3002 |
| REST API | http://localhost:8001 |
| API Dokümanı (Swagger) | http://localhost:8001/docs |
| Celery Monitör | http://localhost:5555 |

---

### Nasıl Çalışır?

```
1. OTURUM    → InstaAnalytic Chrome profilinizi okur ve yerel olarak kimlik doğrular.
               Kimlik bilgileriniz asla InstaAnalytic koduna geçmez.

2. SENKRON   → Arka planda Celery worker; takipçiler, takip edilenler, gönderiler,
               beğeniler ve yorumları sayfalı olarak çeker.

3. AKSİYON  → Kullanıcı Havuzunu incele, Hayalet Filtresi uygula, saate 50 işlem
               güvenli sınırıyla toplu takip/çıkma kuyruğu oluştur.
```

---

### Katkıda Bulunma

[CONTRIBUTING.md](CONTRIBUTING.md) dosyasını okuduktan sonra:

1. Fork'la → `git checkout -b feat/ozellik-adi`
2. [Conventional Commits](https://www.conventionalcommits.org/) standardını kullan
3. Yeni UI stringleri için `frontend/src/i18n/` altına TR/EN çevirisi ekle
4. PR aç — ne yaptığını ve neden yaptığını açıkla

Hata buldun mu? [Issue aç](https://github.com/GktuOktay/InstaAnalytic/issues/new/choose).

---

## License / Lisans

[MIT](LICENSE) © 2026 [Göktug Oktay](https://github.com/GktuOktay)

---

<div align="center">

**⭐ Beğendiysen yıldız ver — It helps others find the project.**

</div>
