#!/usr/bin/env python3
"""
Session Re-Encryption Migration
================================
Eski encryption yöntemi (key[:32].ljust truncation) ile şifrelenmiş
session_data kayıtlarını yeni PBKDF2-HMAC-SHA256 yöntemiyle yeniden şifreler.

Kullanım:
    python3 scripts/migrate_reencrypt_sessions.py

Gereksinimler:
    pip install cryptography psycopg2-binary python-dotenv
"""

import base64
import hashlib
import os
import sys

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:
    print("HATA: cryptography yüklü değil. 'pip install cryptography' çalıştırın.")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("HATA: python-dotenv yüklü değil. 'pip install python-dotenv' çalıştırın.")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("HATA: psycopg2-binary yüklü değil. 'pip install psycopg2-binary' çalıştırın.")
    sys.exit(1)

# .env yükle (script dizininin üstündeki .env)
_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(_ENV_PATH)

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not ENCRYPTION_KEY:
    print("HATA: ENCRYPTION_KEY bulunamadı. .env dosyasını kontrol edin.")
    sys.exit(1)
if not DATABASE_URL:
    print("HATA: DATABASE_URL bulunamadı. .env dosyasını kontrol edin.")
    sys.exit(1)


# ── Eski yöntem (truncation) ──────────────────────────────────────────────────

def _old_fernet(raw_key: str) -> Fernet:
    key = raw_key.encode()
    padded = key[:32].ljust(32, b"=")
    return Fernet(base64.urlsafe_b64encode(padded))


def old_decrypt(ciphertext: str, raw_key: str) -> str:
    return _old_fernet(raw_key).decrypt(ciphertext.encode()).decode()


# ── Yeni yöntem (PBKDF2) ─────────────────────────────────────────────────────

_SALT = b"instaanalytic-v1"
_ITERATIONS = 200_000


def _new_fernet(raw_key: str) -> Fernet:
    key_bytes = raw_key.encode("utf-8")
    derived = hashlib.pbkdf2_hmac("sha256", key_bytes, _SALT, _ITERATIONS, dklen=32)
    return Fernet(base64.urlsafe_b64encode(derived))


def new_encrypt(plaintext: str, raw_key: str) -> str:
    return _new_fernet(raw_key).encrypt(plaintext.encode()).decode()


def new_decrypt(ciphertext: str, raw_key: str) -> str:
    return _new_fernet(raw_key).decrypt(ciphertext.encode()).decode()


# ── Veritabanı bağlantısı ────────────────────────────────────────────────────

def _pg_dsn(url: str) -> str:
    """asyncpg DSN'i psycopg2 DSN'ine çevir."""
    return url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")


def main():
    dsn = _pg_dsn(DATABASE_URL)
    print(f"Bağlanıyor: {dsn.split('@')[-1]}")  # host:port/db kısmını göster, şifre gizle

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT id, ig_username, session_data FROM sessions ORDER BY created_at")
    rows = cur.fetchall()

    if not rows:
        print("Veritabanında session bulunamadı. Çıkılıyor.")
        cur.close()
        conn.close()
        return

    print(f"\n{len(rows)} session bulundu. Migration başlıyor...\n")

    migrated = 0
    already_new = 0
    errors = []

    for row_id, ig_username, session_data in rows:
        # 1. Önce yeni yöntemle decrypt etmeyi dene (zaten migrate edilmiş mi?)
        try:
            new_decrypt(session_data, ENCRYPTION_KEY)
            print(f"  ✓ @{ig_username}: zaten yeni formatta, atlanıyor.")
            already_new += 1
            continue
        except (InvalidToken, Exception):
            pass

        # 2. Eski yöntemle decrypt et
        try:
            plaintext = old_decrypt(session_data, ENCRYPTION_KEY)
        except (InvalidToken, Exception) as e:
            msg = f"  ✗ @{ig_username}: eski format ile decrypt başarısız — {e}"
            print(msg)
            errors.append((ig_username, str(e)))
            continue

        # 3. Yeni yöntemle re-encrypt et
        try:
            new_ciphertext = new_encrypt(plaintext, ENCRYPTION_KEY)
        except Exception as e:
            msg = f"  ✗ @{ig_username}: re-encrypt başarısız — {e}"
            print(msg)
            errors.append((ig_username, str(e)))
            continue

        # 4. Güncelle
        cur.execute(
            "UPDATE sessions SET session_data = %s WHERE id = %s",
            (new_ciphertext, row_id),
        )
        print(f"  ✓ @{ig_username}: yeniden şifrelendi.")
        migrated += 1

    # Hata yoksa commit, varsa rollback
    if errors:
        conn.rollback()
        print(f"\n⚠ {len(errors)} hata nedeniyle rollback yapıldı:")
        for uname, err in errors:
            print(f"   @{uname}: {err}")
        print("\nDeğişiklikler uygulanmadı. Hataları giderip tekrar çalıştırın.")
    else:
        conn.commit()
        print(f"\n{'─'*50}")
        print(f"✓ Migration tamamlandı.")
        print(f"  Yeniden şifrelendi : {migrated}")
        print(f"  Zaten yeni format  : {already_new}")
        print(f"  Hata               : 0")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
