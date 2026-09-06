# Instapp — Sistem Mimarisi

**Versiyon:** 1.0  
**Tarih:** 2026-09-06

---

## Genel Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                            │
│                                                                   │
│  ┌─────────────────┐         ┌──────────────────────────────┐   │
│  │   React Frontend│ ──HTTP──►       FastAPI Backend         │   │
│  │   :3000         │◄──JSON──│       :8000                   │   │
│  └─────────────────┘         └────────────┬─────────────────┘   │
│                                            │                      │
│                               ┌────────────┼────────────┐        │
│                               ▼            ▼            ▼        │
│                        ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│                        │Instagram │ │PostgreSQL│ │  Redis   │  │
│                        │  API /   │ │  :5432   │ │  :6379   │  │
│                        │Playwright│ └──────────┘ └────┬─────┘  │
│                        └──────────┘                   │         │
│                                                        ▼         │
│                                                  ┌──────────┐   │
│                                                  │  Celery  │   │
│                                                  │  Worker  │   │
│                                                  └──────────┘   │
│                                                        │         │
│                                                  ┌──────────┐   │
│                                                  │  Flower  │   │
│                                                  │  :5555   │   │
│                                                  └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Veri Akışı

### Senaryo 1: İlk Sync (Follower/Following)

```
1. Kullanıcı "Sync Başlat" → Frontend POST /api/analysis/sync
2. FastAPI → Celery task oluştur → task_id döndür
3. Frontend task_id ile polling: GET /api/tasks/{task_id}
4. Celery Worker:
   a. instagrapi session yükle
   b. followers listesi çek (sayfalı)
   c. following listesi çek (sayfalı)
   d. Tüm kullanıcıları ig_users tablosuna upsert
   e. relationships tablosunu güncelle
   f. Task tamamlandı
5. Frontend polling tamamlandı → UI güncelle
```

### Senaryo 2: Toplu Takipten Çıkma

```
1. Kullanıcı liste seç → POST /api/actions/bulk-unfollow [user_ids]
2. FastAPI → Celery periodic task
3. Celery Worker:
   a. Her 30-90s (random) bir kullanıcıyı unfollow
   b. Saatte max 60 işlem (Redis counter)
   c. Her aksiyon action_log tablosuna yaz
   d. relationships tablosunu güncelle
4. Frontend ilerlemeyi Flower veya polling ile takip eder
```

### Senaryo 3: Plan B Aktif (Playwright)

```
1. instagrapi ChallengeRequired exception fırlat
2. FastAPI Plan B flag'i Redis'e yaz
3. Celery Worker Playwright script'e geç:
   a. Chrome user-data-dir ile headless browser aç
   b. instagram.com/[username]/followers sayfasına git
   c. Infinite scroll ile DOM parse
   d. JSON çıktı → aynı DB pipeline
```

---

## Servis Sorumlulukları

### FastAPI Backend

- REST API endpoint yönetimi
- Session doğrulama
- Celery task tetikleme
- Plan A / Plan B karar mantığı
- Pydantic ile request/response validation

### Celery Worker

- Tüm ağır ve uzun süren işlemler
- Rate limit yönetimi (Redis counter)
- Instagram API çağrıları
- Playwright scriptleri
- Toplu aksiyon işlemleri

### Redis

- Celery message broker
- Rate limit sayaçları (sliding window)
- Session cache
- Task status cache

### PostgreSQL

- Kalıcı veri depolama
- Kullanıcı havuzu
- Etkileşim geçmişi
- Aksiyon logları

---

## Plan A → Plan B Geçiş Mantığı

```python
PLAN_B_TRIGGERS = [
    "ChallengeRequired",
    "LoginRequired",
    "PleaseWaitFewMinutes",
    "RateLimitError"  # 3 kez üst üste
]

# Redis key: "plan_b_active:{session_id}"
# TTL: 24 saat — sonra Plan A'yı tekrar dene
```

---

## Güvenlik Notları

- `sessionid` değeri veritabanında encrypted olarak saklanır (AES-256)
- `.env` dosyası git'e commit edilmez
- Backend sadece localhost'tan erişilebilir
- Instagram session bilgisi frontend'e asla gönderilmez
