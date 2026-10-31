import pytest
from fastapi import HTTPException

from app.core.auth import require_api_token
from app.core.config import settings


@pytest.mark.asyncio
async def test_accepts_matching_token(monkeypatch):
    monkeypatch.setattr(settings, "api_token", "s3cret")
    assert await require_api_token("s3cret") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("given", ["", "wrong", "s3cre", "s3cret "])
async def test_rejects_wrong_token(monkeypatch, given):
    monkeypatch.setattr(settings, "api_token", "s3cret")
    with pytest.raises(HTTPException) as e:
        await require_api_token(given)
    assert e.value.status_code == 401


@pytest.mark.asyncio
async def test_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "api_token", "")
    with pytest.raises(HTTPException) as e:
        await require_api_token("")
    assert e.value.status_code == 503
