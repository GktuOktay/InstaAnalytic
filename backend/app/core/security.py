import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, MultiFernet

from app.core.config import settings

_SALT = b"instaanalytic-v1"
_ITERATIONS = 200_000


def _derive_key(raw_key: str) -> bytes:
    """PBKDF2-HMAC-SHA256 ile 32 byte key türet, Fernet için base64'e çevir."""
    derived = hashlib.pbkdf2_hmac("sha256", raw_key.encode("utf-8"), _SALT, _ITERATIONS, dklen=32)
    return base64.urlsafe_b64encode(derived)


@lru_cache(maxsize=4)
def _build(key: str, old_key: str) -> MultiFernet:
    # PBKDF2 yavaş: türetilen anahtarlar bir kez hesaplanıp önbelleğe alınır.
    # İlk anahtar şifreler; hepsi çözebilir (rotasyon: ENCRYPTION_KEY_OLD).
    fernets = [Fernet(_derive_key(key))]
    if old_key:
        fernets.append(Fernet(_derive_key(old_key)))
    return MultiFernet(fernets)


def _get_fernet() -> MultiFernet:
    return _build(settings.encryption_key, settings.encryption_key_old)


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _get_fernet().decrypt(value.encode()).decode()


def needs_rotation(value: str) -> bool:
    """Kayıt eski anahtarla mı şifrelenmiş? (rotasyon betiği için)"""
    try:
        Fernet(_derive_key(settings.encryption_key)).decrypt(value.encode())
        return False
    except Exception:
        return True
