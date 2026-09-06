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
