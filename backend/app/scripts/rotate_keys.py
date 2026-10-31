"""
ENCRYPTION_KEY rotasyonu: eski anahtarla şifrelenmiş session kayıtlarını yeni anahtarla yeniden şifreler.

  1) .env: eski anahtarı ENCRYPTION_KEY_OLD'a taşı, yeni anahtarı ENCRYPTION_KEY'e yaz
  2) docker compose up -d
  3) docker compose exec backend python -m app.scripts.rotate_keys
  4) Çıktı "kalan: 0" ise .env'den ENCRYPTION_KEY_OLD satırını sil
"""
import asyncio

from sqlalchemy import select

from app.core.security import decrypt, encrypt, needs_rotation
from app.db.base import AsyncSessionLocal
from app.models.session import Session


async def main() -> None:
    done = remaining = 0
    async with AsyncSessionLocal() as db:
        for s in (await db.execute(select(Session))).scalars().all():
            if not needs_rotation(s.session_data):
                continue
            try:
                s.session_data = encrypt(decrypt(s.session_data))
                done += 1
            except Exception:
                remaining += 1
                print(f"✗ çözülemedi: @{s.ig_username} — ENCRYPTION_KEY_OLD doğru mu?")
        await db.commit()
    print(f"✓ yeniden şifrelendi: {done} · kalan: {remaining}")


if __name__ == "__main__":
    asyncio.run(main())
