import base64
from cryptography.fernet import Fernet
from app.core.config import settings


def _get_fernet() -> Fernet:
    key = settings.encryption_key.encode()
    # Fernet key must be 32 url-safe base64 bytes
    padded = key[:32].ljust(32, b"=")
    return Fernet(base64.urlsafe_b64encode(padded))


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _get_fernet().decrypt(value.encode()).decode()
