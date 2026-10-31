import pytest
from cryptography.fernet import InvalidToken

from app.core import security
from app.core.config import settings


def test_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "key-one")
    monkeypatch.setattr(settings, "encryption_key_old", "")
    token = security.encrypt('{"cookies": {"sessionid": "abc"}}')
    assert "sessionid" not in token
    assert security.decrypt(token) == '{"cookies": {"sessionid": "abc"}}'


def test_wrong_key_cannot_decrypt(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "key-one")
    monkeypatch.setattr(settings, "encryption_key_old", "")
    token = security.encrypt("secret")
    monkeypatch.setattr(settings, "encryption_key", "key-two")
    with pytest.raises(InvalidToken):
        security.decrypt(token)


def test_rotation_old_key_still_decrypts_and_is_flagged(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "old-key")
    monkeypatch.setattr(settings, "encryption_key_old", "")
    old_token = security.encrypt("payload")

    monkeypatch.setattr(settings, "encryption_key", "new-key")
    monkeypatch.setattr(settings, "encryption_key_old", "old-key")
    assert security.decrypt(old_token) == "payload"
    assert security.needs_rotation(old_token)

    fresh = security.encrypt(security.decrypt(old_token))
    assert not security.needs_rotation(fresh)
