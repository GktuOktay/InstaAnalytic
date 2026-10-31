"""
Risk profilleri: tarama bütçesi + aksiyon (takip/takipten çıkma) hızı.

Instagram eşiklerini yayınlamıyor; sayılar muhafazakârlık sırasına göre seçilmiş tahminlerdir,
hiçbir profil "ban yemez" garantisi vermez. Varsayılan: safe.
"""
from dataclasses import dataclass

from app.services.scan_governor import GovernorConfig

DEFAULT_PROFILE = "safe"


@dataclass(frozen=True)
class RiskProfile:
    key: str
    scan: GovernorConfig
    interactions_max_posts: int      # beğeni/yorum için en yeni kaç gönderi
    action_hourly: int               # takip / takipten çıkma limitleri
    action_daily: int
    action_delay_min: int            # işlemler arası bekleme (sn)
    action_delay_max: int

    def public(self) -> dict:
        s = self.scan
        return {
            "key": self.key,
            "scan_pages_per_hour": s.pages_per_hour, "scan_pages_per_day": s.pages_per_day,
            "scan_users_per_day": s.pages_per_day * _page_size(),
            "scan_delay": [s.delay_min, s.delay_max],
            "cooldown_minutes": [int(t) // 60 for t in s.cooldown_tiers],
            "interactions_max_posts": self.interactions_max_posts,
            "action_hourly": self.action_hourly, "action_daily": self.action_daily,
            "action_delay": [self.action_delay_min, self.action_delay_max],
        }


def _page_size() -> int:
    from app.core.config import settings
    return settings.scan_page_size


PROFILES: dict[str, RiskProfile] = {
    "safe": RiskProfile(
        "safe",
        GovernorConfig(pages_per_hour=15, pages_per_day=60, delay_min=8, delay_max=15,
                       long_break_every=6, long_break_min=90, long_break_max=180,
                       cooldown_tiers=(3600, 14400, 86400, 172800)),
        interactions_max_posts=15, action_hourly=8, action_daily=30, action_delay_min=120, action_delay_max=240,
    ),
    "balanced": RiskProfile(
        "balanced",
        GovernorConfig(pages_per_hour=30, pages_per_day=150, delay_min=4, delay_max=9,
                       long_break_every=10, long_break_min=60, long_break_max=120,
                       cooldown_tiers=(1800, 7200, 43200, 86400)),
        interactions_max_posts=30, action_hourly=12, action_daily=45, action_delay_min=90, action_delay_max=180,
    ),
    "aggressive": RiskProfile(
        "aggressive",
        GovernorConfig(pages_per_hour=60, pages_per_day=300, delay_min=2, delay_max=5,
                       long_break_every=20, long_break_min=30, long_break_max=60,
                       cooldown_tiers=(900, 3600, 21600, 43200)),
        interactions_max_posts=100, action_hourly=15, action_daily=60, action_delay_min=60, action_delay_max=120,
    ),
}


def get_profile(key: str | None) -> RiskProfile:
    return PROFILES.get(key or "", PROFILES[DEFAULT_PROFILE])


def load_profile_sync(session_id: str) -> RiskProfile:
    """Celery tarafı: session'ın profilini veritabanından oku."""
    import uuid
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings
    from app.models.session import Session
    url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(url)
    try:
        with sessionmaker(bind=engine)() as db:
            key = db.execute(select(Session.risk_profile).where(Session.id == uuid.UUID(str(session_id)))).scalar_one_or_none()
    finally:
        engine.dispose()
    return get_profile(key)


# ── Sert tavanlar: hangi profil seçilirse seçilsin AŞILAMAZ ─────────────────────────
ACTION_HARD_HOURLY = 15
ACTION_HARD_DAILY = 60
ACTION_HARD_MIN_DELAY = 60          # sn
QUIET_HOURS = (1, 8)                # yerel saat 01:00-08:00 arası işlem yapılmaz (insan gibi davran)
QUIET_TZ = "Europe/Istanbul"
# İşlemler yeni açıldığında kademeli artış: (gün eşiği, günlük tavan)
RAMP_UP = ((3, 20), (7, 40))


def effective_action_limits(prof: RiskProfile, enabled_at, now) -> tuple[int, int, int, int]:
    """(saatlik, günlük, min bekleme, max bekleme) — profil, sert tavan ve ısınma süresinin en kısıtlayıcısı."""
    daily = min(prof.action_daily, ACTION_HARD_DAILY)
    if enabled_at is not None:
        age_days = (now - enabled_at).total_seconds() / 86400
        for threshold, cap in RAMP_UP:
            if age_days < threshold:
                daily = min(daily, cap)
                break
    dmin = max(prof.action_delay_min, ACTION_HARD_MIN_DELAY)
    return min(prof.action_hourly, ACTION_HARD_HOURLY), daily, dmin, max(prof.action_delay_max, dmin + 15)


def in_quiet_hours(now) -> bool:
    from zoneinfo import ZoneInfo
    h = now.astimezone(ZoneInfo(QUIET_TZ)).hour
    return QUIET_HOURS[0] <= h < QUIET_HOURS[1]
