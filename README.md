# Instapp

> **TR** · Instagram analitik ve otomasyon platformu  
> **EN** · Instagram analytics and automation platform

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed.svg)](https://docs.docker.com/compose/)

---

## TR — Türkçe

### Nedir?

Instapp, kendi Instagram hesabınıza ait etkileşim verilerini toplayan, analiz eden ve yönetmenizi sağlayan, **kendi sunucunuzda** çalışan açık kaynaklı bir araçtır. Hiçbir verini üçüncü taraf bir sunucuya göndermez.

### Özellikler

| Modül | Açıklama |
|---|---|
| **Gönderi Senkronizasyonu** | Tüm gönderilerinizi çeker; beğeni ve yorumları toplu olarak tarar |
| **Etkileşim Raporu** | Aylık trend, takipçi/dışarıdan kırılımı, en aktif hayranlar |
| **Kullanıcı Havuzu** | Beğeni oranına (%) göre sıralanmış kişi listesi |
| **Hayalet Filtresi** | Takip ettiğin veya seni takip eden ama hiç etkileşim kurmayan hesaplar |
| **Takip Aksiyonları** | Takip et / takipten çık / takipçiden çıkart — kuyruklu ve hız sınırlı |
| **Kuyruк Monitörü** | Flower UI ile Celery görev durumu |
| **Dil Seçeneği** | Türkçe / İngilizce arayüz |

### Gereksinimler

- Docker & Docker Compose (v2+)
- Chrome / Chromium — Instagram oturumunun açık olduğu profil

### Kurulum

```bash
git clone https://github.com/kullaniciadi/instapp.git
cd instapp

# Ortam değişkenlerini düzenle
cp .env.example .env
# .env dosyasını açıp CHROME_USER_DATA_DIR'i ayarla

# Tüm servisleri başlat
docker compose up -d
```

Servisler ayağa kalktıktan sonra:

| Servis | Adres |
|---|---|
| Uygulama (UI) | http://localhost:3002 |
| API | http://localhost:8001 |
| Celery Monitör | http://localhost:5555 |

### Kullanım Kılavuzu

#### 1. Oturum Oluşturma
1. **Session** sayfasına git.
2. "Yeni Oturum" butonuna tıkla.
3. Sistemin Chrome profilini okuyup oturumu doğrulamasını bekle.

#### 2. Verileri Çekme
- **Gönderiler** → "Gönderileri Senkronize Et" → Tüm gönderiler yüklenir.
- **Etkileşimler** → "Tümünü Tara" → Her gönderinin beğeni/yorum listesi çekilir (büyük hesaplarda dakikalar alabilir).

#### 3. Takipçi Analizi
- **Takipçi Analizi** sayfası takip edenler/edilenler farkını gösterir.
- Karşılaştırma sonrası Kullanıcı Havuzu'nda hayalet filtresiyle etkileşimsiz hesapları tespit edebilirsin.

#### 4. Kullanıcı Havuzu
- **Etkileşim %**: Kişinin kaç gönderini beğendiğinin yüzdesi.
- Sıralama: Etkileşim ↓↑ veya Kullanıcı adı A→Z / Z→A.
- Sekmeler: Tümü · Takip Ettiklerim · Takipçilerim · 👻 Hayaletler.
- Her satırda: **Takip et / Takipten çık** + **Takipçiden çıkart** butonu.

#### 5. Aksiyon Kuyruğu
Tüm takip/çıkma işlemleri kuyruğa alınır, saatte 50 işlem sınırıyla çalışır. **Kuyruk Monitörü** sayfasından anlık durumu izleyebilirsin.

### Mimari

```
instapp/
├── backend/          # FastAPI + Celery
│   ├── app/
│   │   ├── models/   # SQLAlchemy ORM
│   │   ├── routers/  # API endpoint'leri
│   │   ├── services/ # Playwright Instagram istemcisi
│   │   └── tasks/    # Celery görevleri
│   └── alembic/      # Veritabanı migrasyonları
├── frontend/         # React + TypeScript + Vite
│   └── src/
│       ├── api/      # Axios istemcileri
│       ├── i18n/     # TR/EN çeviriler
│       ├── pages/    # Sayfa bileşenleri
│       └── components/
├── docker-compose.yml
└── .env
```

### Katkıda Bulunma

1. Fork'la → feature branch aç → PR gönder.
2. Commit mesajları için [Conventional Commits](https://www.conventionalcommits.org/) standardını kullan.
3. Her yeni özellik için ilgili Türkçe/İngilizce çeviriyi `frontend/src/i18n/` altına ekle.

---

## EN — English

### What is it?

Instapp is an open-source, self-hosted Instagram analytics and automation tool that collects and analyzes engagement data from your own account. No data is sent to any third-party server.

### Features

| Module | Description |
|---|---|
| **Post Sync** | Fetches all posts; bulk-scans likes and comments |
| **Interaction Report** | Monthly trends, follower/outsider breakdown, top fans |
| **User Pool** | People ranked by like rate (%) |
| **Ghost Filter** | Accounts you follow or who follow you with zero engagement |
| **Follow Actions** | Follow / unfollow / remove follower — queued & rate-limited |
| **Queue Monitor** | Celery task status via Flower UI |
| **Language** | Turkish / English interface |

### Requirements

- Docker & Docker Compose (v2+)
- Chrome / Chromium with an active Instagram session

### Setup

```bash
git clone https://github.com/yourusername/instapp.git
cd instapp

# Configure environment
cp .env.example .env
# Edit .env and set CHROME_USER_DATA_DIR to your Chrome profile path

# Start all services
docker compose up -d
```

Once running:

| Service | URL |
|---|---|
| App (UI) | http://localhost:3002 |
| API | http://localhost:8001 |
| Celery Monitor | http://localhost:5555 |

### User Guide

#### 1. Create a Session
1. Go to the **Session** page.
2. Click "New Session".
3. Wait for the system to read your Chrome profile and verify the Instagram session.

#### 2. Fetching Data
- **Posts** → "Sync Posts" → All posts are loaded.
- **Interactions** → "Scan All" → Likes and comments are fetched for every post (may take minutes on large accounts).

#### 3. Follower Analysis
- The **Follower Analysis** page shows the difference between who you follow and who follows you.
- Use the Ghost filter in the User Pool to spot zero-engagement accounts.

#### 4. User Pool
- **Engagement %**: Percentage of your posts this person has liked.
- Sort: Engagement ↓↑ or Username A→Z / Z→A.
- Tabs: All · Following · Followers · 👻 Ghosts.
- Per row: **Follow / Unfollow** + **Remove Follower** button.

#### 5. Action Queue
All follow/unfollow operations are queued with a default limit of 50 actions per hour. Monitor real-time status on the **Queue Monitor** page.

### Architecture

```
instapp/
├── backend/          # FastAPI + Celery
│   ├── app/
│   │   ├── models/   # SQLAlchemy ORM
│   │   ├── routers/  # API endpoints
│   │   ├── services/ # Playwright Instagram client
│   │   └── tasks/    # Celery tasks
│   └── alembic/      # Database migrations
├── frontend/         # React + TypeScript + Vite
│   └── src/
│       ├── api/      # Axios clients
│       ├── i18n/     # TR/EN translations
│       ├── pages/    # Page components
│       └── components/
├── docker-compose.yml
└── .env
```

### Contributing

1. Fork → open a feature branch → submit a PR.
2. Follow [Conventional Commits](https://www.conventionalcommits.org/).
3. For every new feature, add the corresponding TR/EN strings to `frontend/src/i18n/`.

---

## License

[MIT](LICENSE) © 2025 Göktug Oktay
