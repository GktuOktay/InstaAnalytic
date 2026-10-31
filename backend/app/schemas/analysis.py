import uuid
from datetime import datetime
from pydantic import BaseModel


class IgUserBase(BaseModel):
    id: int
    username: str
    full_name: str | None
    profile_pic_url: str | None
    is_private: bool
    is_verified: bool
    follower_count: int | None
    following_count: int | None

    model_config = {"from_attributes": True}


class RelationshipUser(IgUserBase):
    we_follow: bool
    they_follow: bool
    last_checked_at: datetime | None
    reach_status: str | None = None     # None | ok | unreachable (hayalet) | unknown


class AnalysisSummary(BaseModel):
    total_followers: int
    total_following: int
    mutual: int
    not_following_back: int   # biz takip, o etmiyor
    not_followed_back: int    # o takip, biz etmiyoruz
    ghosts: int = 0           # geri takip etmiyor görünen ama silinmiş/dondurulmuş hesaplar (not_following_back'e dahil değil)


class SyncResponse(BaseModel):
    task_id: str
    job_id: uuid.UUID
    status: str


class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: dict | None = None
    result: dict | None = None
    error: str | None = None


class GoldenHourSlot(BaseModel):
    day_of_week: int   # 0=Sun ... 6=Sat (PostgreSQL DOW)
    hour: int
    avg_engagement: float
    post_count: int
    lift: float = 1.0          # ortalamaya göre kat: 1.5 = genel ortalamanın %50 üstü
    confidence: str = "low"    # low (<3 gönderi) | ok (3-5) | high (6+)


class GoldenHourHour(BaseModel):
    hour: int
    avg_engagement: float
    post_count: int
    lift: float
    confidence: str


class GoldenHourResponse(BaseModel):
    slots: list[GoldenHourSlot]
    hours: list[GoldenHourHour] = []   # günlerden bağımsız saat özeti: daha çok örnek, daha güvenilir
    timezone: str
    total_posts: int = 0
    overall_avg: float = 0.0
    media_types: list[str] = []
    enough_data: bool = False          # en az 15 gönderi
