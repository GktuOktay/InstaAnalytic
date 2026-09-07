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


class AnalysisSummary(BaseModel):
    total_followers: int
    total_following: int
    mutual: int
    not_following_back: int   # biz takip, o etmiyor
    not_followed_back: int    # o takip, biz etmiyoruz


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


class GoldenHourResponse(BaseModel):
    slots: list[GoldenHourSlot]
    timezone: str
