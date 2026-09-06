import uuid
from datetime import datetime
from pydantic import BaseModel


class ActionResponse(BaseModel):
    success: bool
    action_type: str
    ig_user_id: int
    error: str | None = None
    queued: bool = False
    queue_position: int | None = None


class BulkUnfollowRequest(BaseModel):
    user_ids: list[int]
    delay_min_seconds: int = 30
    delay_max_seconds: int = 90
    hourly_limit: int = 50


class BulkUnfollowResponse(BaseModel):
    task_id: str
    queued_count: int
    estimated_duration_minutes: int


class ActionLogEntry(BaseModel):
    id: int
    ig_user_id: int
    ig_username: str | None
    action_type: str
    status: str
    error_msg: str | None
    created_at: datetime
    executed_at: datetime | None

    model_config = {"from_attributes": True}
