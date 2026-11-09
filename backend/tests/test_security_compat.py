"""SPEC-002 PB-1: Fernet geriye uyumu (karakterizasyon).

Token'lar cryptography 42.0.7 ile, SENTETİK anahtar ve düz metinle, .env'siz/ağsız konteynerde üretildi
(komut SPEC-002 §6.2). Gerçek ENCRYPTION_KEY'e ya da gerçek bir oturuma dayanmaz.
"""
import base64

import pytest

from app.core import security
from app.core.config import settings

PLAIN = '{"cookies": {"sessionid": "synthetic-not-a-session"}}'
# cryptography 42.0.7, ENCRYPTION_KEY=golden-key-A (PBKDF2 -> Fernet); sentetik, gerçek veri değil
TOKEN_A1 = "gAAAAABq8bEJRcDmRc1qS0gFM06gjx4UJBx0mBiGx2onHH6YZgbggBySsBv4DMYc-f-CqPp81H4_sDKBNzEpstFgIKJih5Pabgs-PW0xpVkj1RXrGB4maI--bsFdLJgZxUwv2bLR7Bg79Z8gq0xvW1TzhmEFHY_log=="  # gitleaks:allow
TOKEN_A2 = "gAAAAABq8bEO7XE5pa2mVNQD2R89Gd4gSoRCAq2CC83zQpp6g1yqN_Tub1y_1Wxt-WyqxBa5XufiAxaJGftjcJVqBzuj3LeEgTmC_UKlbnqdTTK65u8Kx1hJtUsBQ8HK1fJqCpJ9XM9KAOQ6TsnTprS5aOWN6Mw-pg=="  # gitleaks:allow


def test_pb1a_token_from_42_0_7_decrypts_with_same_key(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "golden-key-A")
    monkeypatch.setattr(settings, "encryption_key_old", "")
    assert security.decrypt(TOKEN_A1) == PLAIN
    assert security.needs_rotation(TOKEN_A1) is False


def test_pb1b_token_from_42_0_7_decrypts_via_old_key_and_needs_rotation(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "golden-key-B")
    monkeypatch.setattr(settings, "encryption_key_old", "golden-key-A")
    assert security.decrypt(TOKEN_A2) == PLAIN
    assert security.needs_rotation(TOKEN_A2) is True


def test_pb1c1_new_tokens_keep_fernet_version_byte(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "golden-key-A")
    monkeypatch.setattr(settings, "encryption_key_old", "")
    tok = security.encrypt(PLAIN)
    assert base64.urlsafe_b64decode(tok.encode())[0] == 0x80
    assert security.decrypt(tok) == PLAIN


def test_pb1_wrong_key_still_fails(monkeypatch):
    from cryptography.fernet import InvalidToken
    monkeypatch.setattr(settings, "encryption_key", "golden-key-B")
    monkeypatch.setattr(settings, "encryption_key_old", "")
    with pytest.raises(InvalidToken):
        security.decrypt(TOKEN_A1)
