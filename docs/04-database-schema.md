# Instapp — Veritabanı Şeması

**Versiyon:** 1.0  
**Tarih:** 2026-09-06  
**Veritabanı:** PostgreSQL 15

---

## Tablo Listesi

| Tablo | Açıklama |
|-------|----------|
| `sessions` | Instagram oturumları |
| `ig_users` | Kullanıcı havuzu |
| `relationships` | Takip ilişkileri |
| `posts` | Gönderiler |
| `interactions` | Like / yorum etkileşimleri |
| `action_log` | Gerçekleştirilen aksiyonlar |
| `sync_jobs` | Sync geçmişi |
| `cleanup_scans` | Kaydedilenler taramaları (SPEC-001, migration `o5e7a9c1d3f5`) |
| `saved_collections` | Kullanıcının koleksiyonları ve koruma bayrağı |
| `saved_targets` | Taramadaki kaydedilen gönderiler (envanter) |
| `cleanup_batches` | Temizleme partileri (taslak, onaylı, çalışan, durmuş, biten) |
| `cleanup_items` | Partideki tek tek çıkarma işleri |
| `cleanup_write_grants` | Verilen yazma izinleri (saatlik/günlük sayım) |

---

## DDL

```sql
-- Oturumlar
CREATE TABLE sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ig_user_id   BIGINT UNIQUE NOT NULL,
    ig_username  VARCHAR(100) NOT NULL,
    session_data TEXT NOT NULL,       -- AES-256 encrypted JSON
    plan_b_active BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ
);

-- Kullanıcı Havuzu
CREATE TABLE ig_users (
    id              BIGINT PRIMARY KEY,
    username        VARCHAR(100) NOT NULL,
    full_name       VARCHAR(200),
    profile_pic_url TEXT,
    is_private      BOOLEAN DEFAULT FALSE,
    is_verified     BOOLEAN DEFAULT FALSE,
    follower_count  INT,
    following_count INT,
    post_count      INT,
    bio             TEXT,
    external_url    TEXT,
    last_synced_at  TIMESTAMPTZ,
    first_seen_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ig_users_username ON ig_users(username);

-- Takip İlişkileri
CREATE TABLE relationships (
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    ig_user_id      BIGINT REFERENCES ig_users(id),
    we_follow       BOOLEAN DEFAULT FALSE,     -- biz onu takip ediyoruz
    they_follow     BOOLEAN DEFAULT FALSE,     -- o bizi takip ediyor
    we_follow_since TIMESTAMPTZ,
    they_follow_since TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (session_id, ig_user_id)
);
CREATE INDEX idx_rel_we_follow ON relationships(session_id, we_follow);
CREATE INDEX idx_rel_they_follow ON relationships(session_id, they_follow);

-- Gönderiler
CREATE TABLE posts (
    id              BIGINT PRIMARY KEY,
    session_id      UUID REFERENCES sessions(id),
    shortcode       VARCHAR(50) UNIQUE NOT NULL,
    media_type      VARCHAR(20),               -- 'photo', 'video', 'carousel'
    thumbnail_url   TEXT,
    caption         TEXT,
    like_count      INT DEFAULT 0,
    comment_count   INT DEFAULT 0,
    view_count      INT,                       -- video için
    taken_at        TIMESTAMPTZ,
    last_synced_at  TIMESTAMPTZ
);
CREATE INDEX idx_posts_session ON posts(session_id);
CREATE INDEX idx_posts_taken_at ON posts(taken_at DESC);

-- Etkileşimler (Like / Yorum)
CREATE TABLE interactions (
    id               SERIAL PRIMARY KEY,
    session_id       UUID REFERENCES sessions(id),
    ig_user_id       BIGINT REFERENCES ig_users(id),
    post_id          BIGINT REFERENCES posts(id),
    interaction_type VARCHAR(20) NOT NULL,     -- 'like', 'comment'
    content          TEXT,                     -- yorum metni
    interacted_at    TIMESTAMPTZ,
    discovered_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_interactions_unique 
    ON interactions(ig_user_id, post_id, interaction_type);
CREATE INDEX idx_interactions_user ON interactions(ig_user_id);
CREATE INDEX idx_interactions_post ON interactions(post_id);

-- Aksiyon Logu
CREATE TABLE action_log (
    id          SERIAL PRIMARY KEY,
    session_id  UUID REFERENCES sessions(id),
    ig_user_id  BIGINT REFERENCES ig_users(id),
    action_type VARCHAR(30) NOT NULL,    -- 'follow', 'unfollow'
    status      VARCHAR(20) DEFAULT 'pending', -- 'pending','success','failed','skipped'
    error_msg   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);
CREATE INDEX idx_action_log_session ON action_log(session_id, created_at DESC);

-- Sync Geçmişi
CREATE TABLE sync_jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID REFERENCES sessions(id),
    job_type    VARCHAR(50) NOT NULL,    -- 'followers','following','posts','interactions'
    status      VARCHAR(20) DEFAULT 'running',
    celery_task_id VARCHAR(200),
    total_items INT,
    processed_items INT DEFAULT 0,
    error_msg   TEXT,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
```

---

## Etkileşim Skoru Hesabı

Her `ig_users` kaydı için view hesabı (view — materialized view olarak tutulacak):

```sql
CREATE MATERIALIZED VIEW user_engagement_scores AS
SELECT
    i.ig_user_id,
    i.session_id,
    COUNT(CASE WHEN i.interaction_type = 'like'    THEN 1 END) AS total_likes,
    COUNT(CASE WHEN i.interaction_type = 'comment' THEN 1 END) AS total_comments,
    MAX(i.interacted_at)  AS last_interaction_at,
    MIN(i.interacted_at)  AS first_interaction_at,
    -- Skor: yorum ağırlığı 3x, like 1x
    (COUNT(CASE WHEN i.interaction_type = 'like'    THEN 1 END) * 1 +
     COUNT(CASE WHEN i.interaction_type = 'comment' THEN 1 END) * 3) AS engagement_score
FROM interactions i
GROUP BY i.ig_user_id, i.session_id;

CREATE UNIQUE INDEX ON user_engagement_scores(ig_user_id, session_id);
```

Yenileme: Her sync tamamlandığında `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

---

## İlişki Diyagramı

```
sessions ──< relationships >── ig_users
sessions ──< posts
sessions ──< action_log >── ig_users
posts ──< interactions >── ig_users
sessions ──< sync_jobs
```

---

## Kaydedilenleri temizleme tabloları (SPEC-001)

Migration: `backend/alembic/versions/o5e7a9c1d3f5_cleanup_saved.py` (`down_revision = 'n4d6f8b0c2e4'`). Modeller: `backend/app/models/cleanup.py` (`Session` ve `ActionLog` kolonları `models/session.py`, `models/action_log.py`'de). Kısıtlar migration ile modelde aynıdır; adlandırılmış CHECK'ler `ck_<tablo>_<kolon>` biçimindedir. Kimlik kolonları `^\d{1,25}$` desenine uyar. Tüm yeni tablolar `session_id` ile `sessions(id) ON DELETE CASCADE` bağlıdır; `DELETE /api/sessions/{id}/purge` bu satırları da siler.

### Mevcut tablolarda değişiklik
```sql
ALTER TABLE sessions
    ADD COLUMN allow_unsave           BOOLEAN NOT NULL DEFAULT FALSE,  -- "Kaydedilen temizleme" anahtarı
    ADD COLUMN unsave_enabled_at      TIMESTAMPTZ,
    ADD COLUMN cleanup_paused_until   TIMESTAMPTZ,                     -- ek iş duraklatması (takipten ayrı kolon)
    ADD COLUMN cleanup_paused_reason  VARCHAR(200);                    -- blocked | follow_blocked

ALTER TABLE action_log
    ALTER COLUMN ig_user_id DROP NOT NULL,       -- unsave / cleanup_setting / collection_protection satırlarında null olabilir
    ADD COLUMN target_ref   VARCHAR(64),         -- gönderi kimliği ya da koleksiyon kimliği
    ADD COLUMN target_label VARCHAR(200);        -- koleksiyon korumasında yalnız 'protected' | 'unprotected'
```
`action_log.action_type` (varchar(30)) yeni değerler alır: `unsave`, `cleanup_setting`, `collection_protection`. `downgrade` yeni tabloları ve kolonları düşürür; `action_log.ig_user_id` nullable kalır (ADR-0001 b), çünkü geri NOT NULL yapmak o satırları silmeyi gerektirir.

### Yeni tablolar
```sql
CREATE TABLE cleanup_scans (
    id                      BIGSERIAL PRIMARY KEY,
    session_id              UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind                    VARCHAR(5)  NOT NULL DEFAULT 'saved',            -- CHECK = 'saved'
    status                  VARCHAR(10) NOT NULL,                            -- running|ok|partial|failed|blocked
    pages                   INTEGER NOT NULL DEFAULT 0,                      -- CHECK >= 0
    items                   INTEGER NOT NULL DEFAULT 0,                      -- CHECK >= 0
    duplicates              INTEGER NOT NULL DEFAULT 0,                      -- CHECK >= 0
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_page_at            TIMESTAMPTZ,
    finished_at             TIMESTAMPTZ,
    note_code               VARCHAR(30),
    collections_mode        VARCHAR(14) NOT NULL DEFAULT 'all_protected',    -- per_collection (W) | all_protected (F)
    collections_received_at TIMESTAMPTZ                                      -- koleksiyon listesi bu tarama için alındı (tek hak)
);
CREATE INDEX ix_cleanup_scans_session_id ON cleanup_scans(session_id);

CREATE TABLE saved_collections (
    id                 BIGSERIAL PRIMARY KEY,
    session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    collection_id      VARCHAR(25)  NOT NULL,                                -- CHECK ~ '^\d{1,25}$'
    name               VARCHAR(100) NOT NULL,                                -- CHECK char_length 1..100; log'a yazılmaz
    protected          BOOLEAN NOT NULL DEFAULT TRUE,                        -- yeni koleksiyon korumalı başlar
    first_seen_scan_id BIGINT REFERENCES cleanup_scans(id) ON DELETE SET NULL,
    last_seen_scan_id  BIGINT REFERENCES cleanup_scans(id) ON DELETE SET NULL,
    listed_scan_id     BIGINT REFERENCES cleanup_scans(id) ON DELETE SET NULL, -- son koleksiyon çağrısının taraması
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_saved_collections_session_collection UNIQUE (session_id, collection_id)
);

CREATE TABLE saved_targets (
    id                     BIGSERIAL PRIMARY KEY,
    session_id             UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    scan_id                BIGINT NOT NULL REFERENCES cleanup_scans(id) ON DELETE CASCADE,
    position               INTEGER NOT NULL,                                 -- CHECK >= 0
    media_id               VARCHAR(25) NOT NULL,                             -- CHECK ~ '^\d{1,25}$'
    shortcode              VARCHAR(40) NOT NULL,                             -- CHECK ~ '^[\w-]{5,40}$'
    owner_username         VARCHAR(30),                                      -- CHECK null ya da ~ '^[a-z0-9._]{1,30}$'
    media_type             VARCHAR(10),                                      -- CHECK null ya da image|video|carousel
    is_ad                  BOOLEAN NOT NULL DEFAULT FALSE,
    thumbnail_url          TEXT,
    collection_ids         JSONB,                                            -- null = bilgi yok
    collections_unreadable BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_saved_targets_scan_media UNIQUE (scan_id, media_id)
);
CREATE INDEX ix_saved_targets_scan_owner ON saved_targets(scan_id, owner_username);

CREATE TABLE cleanup_batches (
    id                   BIGSERIAL PRIMARY KEY,
    session_id           UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind                 VARCHAR(5)  NOT NULL DEFAULT 'saved',               -- CHECK = 'saved'
    scan_id              BIGINT REFERENCES cleanup_scans(id) ON DELETE SET NULL,
    status               VARCHAR(10) NOT NULL,                               -- draft|confirmed|running|stopped|done|cancelled|expired
    selection            JSONB,
    plan_refs            JSONB,                                              -- önizlemedeki gönderi kimlikleri (taslakta)
    item_count           INTEGER NOT NULL DEFAULT 0,                         -- CHECK 0..500
    max_items_at_preview INTEGER NOT NULL,
    run_seq              INTEGER NOT NULL DEFAULT 0,                         -- çalıştırma çitleme belirteci (kimlik doğrulayıcı değil)
    last_stop_reason     VARCHAR(30),
    last_allow_at        TIMESTAMPTZ,
    stale_after_s        INTEGER,
    stopped_ext_version  VARCHAR(20),                                        -- durma anındaki eklenti sürümü
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL,
    confirmed_at         TIMESTAMPTZ,
    started_at           TIMESTAMPTZ,
    last_seen_at         TIMESTAMPTZ,
    last_progress_at     TIMESTAMPTZ,
    finished_at          TIMESTAMPTZ
);
-- Profil başına tek taslak ve tek etkin parti (kısmi benzersiz indeksler)
CREATE UNIQUE INDEX uq_cleanup_batches_active ON cleanup_batches(session_id, kind)
    WHERE status IN ('confirmed','running','stopped');
CREATE UNIQUE INDEX uq_cleanup_batches_draft ON cleanup_batches(session_id, kind)
    WHERE status = 'draft';

CREATE TABLE cleanup_items (
    id           BIGSERIAL PRIMARY KEY,
    session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    batch_id     BIGINT NOT NULL REFERENCES cleanup_batches(id) ON DELETE CASCADE,
    action       VARCHAR(10) NOT NULL DEFAULT 'unsave',                      -- CHECK = 'unsave'
    ref          VARCHAR(25) NOT NULL,                                       -- CHECK ~ '^\d{1,25}$' (gönderi pk)
    label        VARCHAR(200) NOT NULL,
    status       VARCHAR(10) NOT NULL DEFAULT 'pending',                     -- pending|done|already|not_found|protected|failed|cancelled
    attempts     INTEGER NOT NULL DEFAULT 0,                                 -- CHECK 0..3
    note_code    VARCHAR(30),
    http_status  SMALLINT,
    fields       JSONB,                                                      -- yalnız üst düzey alan adları
    prechecked_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_at      TIMESTAMPTZ
);
CREATE INDEX ix_cleanup_items_session_action_status ON cleanup_items(session_id, action, status);
CREATE UNIQUE INDEX uq_cleanup_items_pending_ref ON cleanup_items(session_id, action, ref)
    WHERE status = 'pending';                                                -- aynı gönderi iki bekleyen işte olamaz

CREATE TABLE cleanup_write_grants (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    item_id    BIGINT NOT NULL REFERENCES cleanup_items(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_cleanup_write_grants_session_granted ON cleanup_write_grants(session_id, granted_at);
```

### Saklama
- `cleanup_retention` (günde bir, Celery beat): `expired` ve `cancelled` taslakları 1 gün sonra siler, tür başına son 20 taramanın dışındakini siler (partilerde `scan_id` null olur), 48 saatten eski `cleanup_write_grants` satırlarını siler.
- Yeni bir tarama `ok`/`partial` bitince eski taramanın `saved_targets` satırları silinir; tarama satırı kalır.
- `cleanup_stale` (60 sn): süresi geçen `running` partileri `stopped(stale)`, takılan taramaları `failed` yapar.
- Saklanan kişisel veri: gönderi sahibinin kullanıcı adı, gönderi kimliği ve kısa kodu, küçük resim adresi, kullanıcının kendi koleksiyon adları. Raporlara yalnız sayı gider.

### İlişki diyagramı (kaydedilenler)
```
sessions ──< cleanup_scans ──< saved_targets
sessions ──< saved_collections            (taramalara first/last/listed_scan_id ile gevşek bağlı)
sessions ──< cleanup_batches >── cleanup_scans   (scan_id, SET NULL)
cleanup_batches ──< cleanup_items ──< cleanup_write_grants
sessions ──< action_log                   (target_ref, target_label)
```
