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
    allow_actions: bool = False
    source: str = "browser"
    paused_until: datetime | None = None
    paused_reason: str | None = None
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


class BrowserListResponse(BaseModel):
    browsers: list[str]


class BrowserScanRequest(BaseModel):
    browsers: list[str]


class BrowserCandidate(BaseModel):
    candidate_id: str
    browser: str
    ig_username: str
    full_name: str | None = None
    already_saved: bool = False


class BrowserScanResponse(BaseModel):
    candidates: list[BrowserCandidate]
    errors: list[str] = []


class BrowserConfirmRequest(BaseModel):
    candidate_ids: list[str]


class ZipOnlyCreate(BaseModel):
    ig_username: str


class ActionsToggle(BaseModel):
    allow_actions: bool
