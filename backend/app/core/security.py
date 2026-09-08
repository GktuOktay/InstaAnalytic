import base64
import hashlib
import os
from cryptography.fernet import Fernet
from app.core.config import settings

_SALT = b"instaanalytic-v1"
_ITERATIONS = 200_000


def _derive_key(raw_key: str) -> bytes:
    """PBKDF2-HMAC-SHA256 ile 32 byte key türet, Fernet için base64'e çevir."""
    key_bytes = raw_key.encode("utf-8")
    derived = hashlib.pbkdf2_hmac("sha256", key_bytes, _SALT, _ITERATIONS, dklen=32)
    return base64.urlsafe_b64encode(derived)


def _get_fernet() -> Fernet:
    return Fernet(_derive_key(settings.encryption_key))


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _get_fernet().decrypt(value.encode()).decode()
