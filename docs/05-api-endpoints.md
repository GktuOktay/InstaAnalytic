# Instapp — API Endpoint Referansı

**Versiyon:** 1.0  
**Tarih:** 2026-09-06  
**Base URL:** `http://localhost:8000/api`

---

## Session

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/sessions` | Yeni session ekle |
| GET | `/sessions` | Tüm sessionları listele |
| GET | `/sessions/{id}` | Session detay |
| DELETE | `/sessions/{id}` | Session sil |
| POST | `/sessions/{id}/verify` | Session geçerliliğini kontrol et |

```json
// POST /sessions — Request Body
{
  "ig_username": "kullanici_adi",
  "session_id_cookie": "ABC123...",  // Instagram sessionid cookie değeri
  "plan": "A"  // "A" veya "B"
}

// POST /sessions — Response
{
  "id": "uuid",
  "ig_username": "kullanici_adi",
  "ig_user_id": 123456789,
  "verified": true,
  "created_at": "2026-09-06T10:00:00Z"
}
```

---

## Analiz — Sync

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/sessions/{id}/sync/followers` | Takipçi listesini çek |
| POST | `/sessions/{id}/sync/following` | Takip edilenleri çek |
| POST | `/sessions/{id}/sync/posts` | Gönderileri çek |
| POST | `/sessions/{id}/sync/interactions` | Tüm etkileşimleri çek |
| POST | `/sessions/{id}/sync/all` | Tam sync (sıralı) |

```json
// POST sync — Response (async task başlatır)
{
  "task_id": "celery-task-uuid",
  "job_id": "sync-job-uuid",
  "status": "queued"
}
```

---

## Analiz — Takipçi

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/sessions/{id}/analysis/followers` | Takipçi listesi |
| GET | `/sessions/{id}/analysis/following` | Takip edilen listesi |
| GET | `/sessions/{id}/analysis/not-following-back` | Biz takip, o etmiyor |
| GET | `/sessions/{id}/analysis/not-followed-back` | O takip, biz etmiyoruz |
| GET | `/sessions/{id}/analysis/mutual` | Karşılıklı takip |
| GET | `/sessions/{id}/analysis/summary` | Özet istatistik |

```json
// GET /analysis/not-following-back — Query Params
?page=1&limit=50&sort=username&order=asc

// Response
{
  "total": 342,
  "page": 1,
  "limit": 50,
  "data": [
    {
      "id": 123456,
      "username": "ornek_kullanici",
      "full_name": "Örnek Kullanıcı",
      "profile_pic_url": "https://...",
      "is_private": false,
      "follower_count": 1500,
      "engagement_score": 0
    }
  ]
}
```

---

## Aksiyonlar

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/sessions/{id}/actions/follow/{user_id}` | Tek kullanıcı takip et |
| POST | `/sessions/{id}/actions/unfollow/{user_id}` | Tek kullanıcı takipten çık |
| POST | `/sessions/{id}/actions/bulk-unfollow` | Toplu takipten çık |
| GET | `/sessions/{id}/actions/log` | Aksiyon geçmişi |
| DELETE | `/sessions/{id}/actions/bulk/{task_id}` | Toplu işlemi iptal et |

```json
// POST /actions/bulk-unfollow — Request Body
{
  "user_ids": [123, 456, 789],
  "delay_min_seconds": 30,
  "delay_max_seconds": 90,
  "hourly_limit": 50
}

// Response
{
  "task_id": "celery-task-uuid",
  "queued_count": 3,
  "estimated_duration_minutes": 15
}
```

---

## Gönderiler

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/sessions/{id}/posts` | Gönderi listesi |
| GET | `/sessions/{id}/posts/{post_id}` | Gönderi detay |
| GET | `/sessions/{id}/posts/{post_id}/likers` | Like atanlar |
| GET | `/sessions/{id}/posts/{post_id}/comments` | Yorumlar |
| GET | `/sessions/{id}/posts/stats` | Genel gönderi istatistikleri |

---

## Kullanıcı Havuzu

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/sessions/{id}/users` | Havuz listesi (filtreli) |
| GET | `/sessions/{id}/users/{user_id}` | Kullanıcı profil |
| GET | `/sessions/{id}/users/{user_id}/report` | Etkileşim raporu |
| GET | `/sessions/{id}/users/{user_id}/interactions` | Etkileşim listesi |
| GET | `/sessions/{id}/users/export` | CSV dışa aktar |

```json
// GET /users/{user_id}/report
{
  "user": {
    "id": 123456,
    "username": "ornek"
  },
  "relationship": {
    "we_follow": true,
    "they_follow": false
  },
  "engagement": {
    "total_likes": 45,
    "total_comments": 7,
    "engagement_score": 66,
    "first_interaction_at": "2024-01-15T08:30:00Z",
    "last_interaction_at": "2026-08-20T14:22:00Z"
  },
  "posts_interacted": 12
}
```

---

## Task / Job

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/tasks/{task_id}` | Celery task durumu |
| GET | `/jobs/{job_id}` | Sync job detay |
| GET | `/jobs` | Tüm jobları listele |

```json
// GET /tasks/{task_id}
{
  "task_id": "...",
  "status": "PROGRESS",  // PENDING, PROGRESS, SUCCESS, FAILURE
  "progress": {
    "current": 234,
    "total": 1500,
    "percent": 15.6
  },
  "result": null,
  "error": null
}
```
