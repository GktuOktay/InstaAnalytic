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

---

## Kaydedilenleri temizleme (`/cleanup`, SPEC-001)

Router: `backend/app/routers/cleanup.py`; istek gövdeleri: `backend/app/schemas/cleanup.py`. Tam sözleşme: `docs/specs/SPEC-001-kaydedilen-ve-dm-temizleme.md` §7.8-§7.9. Bu bölümdeki yollar `/api` altındadır ve `X-API-Token` ister (tüm `/api` uçları gibi). `{S}` = `/sessions/{id}/cleanup`.

**Genel kurallar**
- Gövdeler `extra='forbid'` ve katı tiplidir; durum değiştiren uçlar JSON ister (aksi 415 `unsupported_media_type`). Büyük kimlikler string taşınır.
- Her sorgu `id AND session_id` ile yapılır (başka profilin kaydı 404).
- Hata zarfı: `{"detail": {"code": "<kod>", "fields"?: [...], "reason"?: "...", "next_allowed_at"?: "<ISO>", "retry_after"?: <sn>}}`. `/cleanup` yollarında doğrulama hataları `code='invalid'` + yalnız alan adları olur; girdi değeri yansıtılmaz. Sunucu yalnız **kod** döner; metin arayüzdedir (`cleanup.reason.<kod>`).
- `viewer_id` (Instagram kimliği) ve `ext_version` (eklenti sürümü, en az 2.9.0) yürütme uçlarında hesap ve sürüm denetimi içindir.
- Özellik kapalıyken (`allow_unsave=false`): `scan/start`, `scan/{id}/page`, `scan/{id}/collections`, `preview`, `confirm`, `start` → 403 `feature_off`; `next` → 200 `reason=off`; `precheck` → `allow=false, reason=off`. Ayar, sınırlar, durum, envanter, geçmiş, koleksiyon ayarı, `stop` ve `cancel` kapalıyken de çalışır.
- Faz 1'de yalnız `saved` türü vardır.

### Ayarlar ve sınırlar
| Method | Path | Açıklama | Hatalar |
|---|---|---|---|
| GET | `{S}/settings` | `saved.{enabled, enabled_at, collection_choice_available}`, `budget`, `account` (en kötü toplam 95/saat, 460/gün) | 404 |
| PUT | `{S}/settings` | `{saved_enabled, ack_irreversible?}`; açarken `ack_irreversible=true` gerekir | 422 `ack_required` / `not_available` / `invalid` |
| GET | `/cleanup/limits` | `limits.toml`'dan etkin sınırlar, sert tavanlar, `warnings`, `sha256`, `follow_limits_managed_here: false`; salt okunur | |

### Tarama (eklenti çağırır)
| Method | Path | Açıklama | Hatalar |
|---|---|---|---|
| POST | `{S}/saved/scan/start` | `{viewer_id, ext_version}` -> `{scan_id, max_pages, page_delay, warn_after_ms, stale_after_ms, collection_choice}` | 403; 409 `account_mismatch` / `viewer_unknown` / `extension_outdated` / `scan_running`; 429 `scan_too_soon` |
| POST | `{S}/saved/scan/{scan_id}/collections` | Koleksiyon listesi (en çok 200) ya da `available:false` + `note_code`; tarama başına tek hak | 403; 404; 409 `collections_closed` / `collections_unavailable` / `scan_closed` / `account_mismatch`; 422 |
| POST | `{S}/saved/scan/{scan_id}/page` | `{viewer_id, page_no, items[≤50]}` -> `{accepted, duplicates, total, continue}` | 403; 404; 409 `scan_closed` / `page_out_of_order` / `page_cap` / `account_mismatch`; 422 |
| POST | `{S}/saved/scan/{scan_id}/finish` | `{viewer_id, outcome: ok\|partial\|failed\|blocked, note_code?, http_status?, fields?}`; `blocked` 24 saat duraklatır | |

### Envanter, koleksiyon koruması, önizleme, parti
| Method | Path | Açıklama | Hatalar |
|---|---|---|---|
| GET | `{S}/saved/inventory?q=&media_type=&collection_id=&limit=50&offset=0` | Sayfalı envanter; satırda `state` (`available`, `queued`, `done`, `already`, `not_found`, `protected`) ve koleksiyonlar. `collection_id` filtresi şu an 422 `not_available` | 422 |
| GET | `{S}/saved/collections` | `{mode, scan_id, items:[{collection_id, name, id_suffix, protected, in_last_scan, is_new, post_count}]}` | 404 |
| PUT | `{S}/saved/collections/{collection_id}` | `{protected, ack_shared_risk?}`; korumayı kaldırmak (`protected=false`) `ack_shared_risk=true` ister; `action_log`'a yazılır | 404; 409 `collections_unavailable`; 415; 422 `ack_required` / `invalid` |
| POST | `{S}/saved/preview` | `{scan_id, select:'refs', refs}` ya da `{scan_id, select:'filter', filter, exclude_refs?}` -> `{batch_id, item_count, unknown_refs, excluded, excluded_protected, in_unprotected_collections, truncated, remaining, expires_at, estimate}`; yeni taslak eskisini iptal eder | 403; 409 `no_scan` / `scan_stale` / `scan_mismatch` / `batch_active`; 422 `invalid_selection` / `invalid` / `not_available` |
| GET | `{S}/batches/{batch_id}/items?status=&limit=50&offset=0` | Partinin öğeleri (taslakta önizleme listesi) | 404 |
| POST | `{S}/batches/{batch_id}/confirm` | `{confirm_count}` (önizlemedeki sayıya eşit olmalı) | 404; 409 `not_draft` / `plan_changed` / `batch_active`; 410 `expired`; 422 `count_mismatch` |
| POST | `{S}/batches/{batch_id}/start` | `{ext_version?}`; yalnız "hazır" iken kabul edilir -> `{status:'running', run_seq, started_at}` | 403; 404; 409 `not_now` (+`reason`, `next_allowed_at`) / `not_startable` / `extension_update_required` |
| POST | `{S}/batches/{batch_id}/stop` | Arayüzden `{reason:'user_stop'}`; eklentiden `{reason, run_seq, viewer_id}` | 404; 422 |
| POST | `{S}/batches/{batch_id}/cancel` | `{}`; bekleyen öğeleri iptal eder | 404 |
| GET | `{S}/status` | `run_state` (`ready`, `off`, `paused`, `quiet_hours`, `limit`), `next_allowed_at`, sayaçlar, etkin parti, `paused_until` | |
| GET | `{S}/history?state=&limit=50&offset=0` | Sayfalı sonuç geçmişi ve sayaçlar | |

### Yürütme (eklenti çağırır)
| Method | Path | Açıklama | Hatalar |
|---|---|---|---|
| POST | `{S}/saved/next` | `{batch_id, run_seq, viewer_id, ext_version, limit≤10}` -> `{items, run_seq, delay, stale_after_ms, allow_collections, reason}`; `reason` ∈ `null`, `off`, `paused`, `quiet_hours`, `limit`, `empty`, `stopped` | 404; 409 |
| POST | `{S}/items/{item_id}/precheck` | `{viewer_id, ext_version, run_seq, collection_ids[≤20]}`; yazma izni verir (`allow:true`) ya da reddeder (`reason` ∈ `off`, `paused`, `quiet_hours`, `limit`, `not_pending`, `stopped`, `too_soon`, `protected`; `retry_after`). Her izin `cleanup_write_grants`'a bir satır yazar; koleksiyon koruması burada sunucuda yeniden denetlenir | 404; 409; 422 |
| POST | `{S}/items/{item_id}/result` | `{viewer_id, run_seq, outcome: done\|already\|not_found\|protected\|failed\|blocked, note_code?, http_status?, fields?}`; `protected` yalnız `note_code='in_collection'` ile | 404; 409 `account_mismatch`; 422 |

### Hata kodları (HTTP)
| HTTP | Kodlar |
|---|---|
| 403 | `feature_off` |
| 404 | `session_not_found`, `not_found` |
| 409 | `account_mismatch`, `viewer_unknown`, `extension_outdated`, `scan_running`, `scan_closed`, `page_out_of_order`, `page_cap`, `no_scan`, `scan_stale`, `scan_mismatch`, `batch_active`, `plan_changed`, `not_draft`, `not_now`, `not_startable`, `collections_closed`, `collections_unavailable`, `extension_update_required` |
| 410 | `expired` |
| 415 | `unsupported_media_type` |
| 422 | `invalid`, `invalid_selection`, `count_mismatch`, `ack_required`, `not_available` |
| 429 | `scan_too_soon` |

Instagram'dan dönen 429 bir HTTP hatası değil, öğe sonucudur: `result` içinde `failed` + `note_code=rate_limited` olur, parti `stopped(rate_limited)` olur ve 24 saatlik duraklatma yazılmaz. Engel (`blocked`) ise 24 saat duraklatır (bkz. `docs/09-guvenlik-ve-gizlilik.md`).

Köprü iş raporu (`routers/bridge.py`) `saved_scan` ve `saved_unsave` türlerini kabul eder; yalnız sayı taşır. Yeni bildirim türü: `cleanup_anomaly`.
