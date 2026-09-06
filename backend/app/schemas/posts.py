from datetime import datetime
from pydantic import BaseModel


class PostResponse(BaseModel):
    id: int
    shortcode: str
    media_type: str | None
    thumbnail_url: str | None
    caption: str | None
    like_count: int
    comment_count: int
    view_count: int | None
    taken_at: datetime | None
    last_synced_at: datetime | None

    model_config = {"from_attributes": True}


class PostLiker(BaseModel):
    id: int
    username: str
    full_name: str | None
    profile_pic_url: str | None
    is_verified: bool

    model_config = {"from_attributes": True}


class PostComment(BaseModel):
    ig_user_id: int
    username: str | None
    content: str | None
    interacted_at: datetime | None

    model_config = {"from_attributes": True}


class PostStats(BaseModel):
    total_posts: int
    total_likes: int
    total_comments: int
    avg_likes: float
    avg_comments: float
    top_post_shortcode: str | None
