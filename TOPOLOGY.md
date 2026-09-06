# InstaAnalytic — System Topology

## Service Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Network                         │
│                                                                        │
│  ┌──────────────────┐   HTTP/JSON    ┌───────────────────────────┐   │
│  │  React Frontend  │ ─────────────► │     FastAPI Backend        │   │
│  │  Vite + TS       │ ◄──────────── │     Python 3.11+           │   │
│  │  Port: 3000      │                │     Port: 8000             │   │
│  └──────────────────┘                └──────────┬────────────────┘   │
│                                                  │                     │
│                                    ┌─────────────┼──────────────┐     │
│                                    ▼             ▼              ▼     │
│                             ┌──────────┐  ┌──────────┐  ┌──────────┐│
│                             │Instagram │  │PostgreSQL│  │  Redis   ││
│                             │API /     │  │  Port:   │  │  Port:   ││
│                             │Playwright│  │  5432    │  │  6379    ││
│                             └──────────┘  └──────────┘  └────┬─────┘│
│                                                               │       │
│                                                    ┌──────────▼────┐  │
│                                                    │  Celery Worker│  │
│                                                    │  (async tasks)│  │
│                                                    └──────────┬────┘  │
│                                                               │        │
│                                                    ┌──────────▼────┐  │
│                                                    │    Flower UI  │  │
│                                                    │    Port: 5555 │  │
│                                                    └───────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Ports

| Service         | Port  | Description                        |
|-----------------|-------|------------------------------------|
| Frontend        | 3000  | React / Vite dev + prod build      |
| Backend API     | 8000  | FastAPI REST                       |
| PostgreSQL      | 5432  | Relational database                |
| Redis           | 6379  | Message broker + rate-limit cache  |
| Flower          | 5555  | Celery task monitor UI             |

## Data Flow

### Follower / Following Sync
```
User → POST /api/analysis/sync
  → Celery task created → task_id returned
  → Frontend polls GET /api/tasks/{task_id}
  → Worker: fetch followers + following (paginated)
  → Upsert ig_users, update relationships
  → Task complete → UI refresh
```

### Bulk Unfollow
```
User selects list → POST /api/actions/bulk-unfollow [user_ids]
  → Celery periodic task
  → Worker: random 30-90s delay per action
  → Max 60 actions/hour (Redis sliding counter)
  → Each action logged → action_log table
  → relationships table updated
```

### Plan A → Plan B Fallback (Playwright)
```
instagrapi raises ChallengeRequired / RateLimitError
  → FastAPI sets plan_b_active:{session_id} in Redis (TTL 24h)
  → Celery switches to Playwright scraper:
      Chrome headless with user-data-dir
      → instagram.com DOM parse
      → Same DB pipeline as Plan A
```

## Database Schema Summary

| Table           | Purpose                                      |
|-----------------|----------------------------------------------|
| `ig_users`      | Instagram user pool (all seen accounts)      |
| `relationships` | follower / following edges + timestamps      |
| `posts`         | Post metadata (likes, comments, media)       |
| `interactions`  | Per-user interaction records                 |
| `sessions`      | Encrypted Instagram session tokens           |
| `action_log`    | Audit log of all automated actions           |
| `sync_jobs`     | Sync task history and status                 |

## Security Design

- `sessionid` stored AES-256 encrypted in PostgreSQL
- `.env` never committed — use `.env.example` as template
- Backend accessible only within Docker network (not exposed externally)
- Instagram session data never forwarded to frontend
- Rate limiting via Redis sliding-window counter

## Technology Stack

| Layer       | Technology                                    |
|-------------|-----------------------------------------------|
| Frontend    | React 18, TypeScript, Vite, Tailwind CSS      |
| Backend     | FastAPI, Python 3.11+, Pydantic v2            |
| ORM         | SQLAlchemy (async) + Alembic migrations       |
| Task Queue  | Celery + Redis                                |
| Scraping    | instagrapi (Plan A), Playwright (Plan B)      |
| Database    | PostgreSQL 15                                 |
| Cache       | Redis 7                                       |
| Container   | Docker Compose                                |
