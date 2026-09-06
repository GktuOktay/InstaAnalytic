import uuid
from datetime import datetime
from pydantic import BaseModel


class SessionCreate(BaseModel):
    ig_username: str
    session_id_cookie: str
    extra_cookies: dict | None = None


class SessionResponse(BaseModel):
    id: uuid.UUID
    ig_user_id: int
    ig_username: str
    plan_b_active: bool
    created_at: datetime
    last_used_at: datetime | None
    last_verified_at: datetime | None

    model_config = {"from_attributes": True}


class SessionVerifyResponse(BaseModel):
    valid: bool
    ig_username: str | None = None
    error: str | None = None


class SessionPreviewRequest(BaseModel):
    session_id_cookie: str
    extra_cookies: dict | None = None  # csrftoken, ds_user_id vb.


class SessionPreviewResponse(BaseModel):
    ig_username: str
    ig_user_id: int
    full_name: str | None
