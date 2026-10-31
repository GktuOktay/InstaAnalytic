#!/usr/bin/env python3
"""
.env dosyasını güvenli değerlerle tamamlar ve CREDENTIALS.md üretir.

- Var olan değerlerin üzerine ASLA yazmaz (özellikle ENCRYPTION_KEY: değişirse kayıtlı oturumlar çözülemez).
- Eksik olanları rastgele üretir: REDIS_PASSWORD, API_TOKEN, FLOWER_PASSWORD, host agent secret.
- Her çalıştırmada CREDENTIALS.md'yi güncel değerlerle yeniden yazar (dosya git'e girmez, izinleri 600).

Kullanım:  python3 scripts/init_env.py
"""
import re
import secrets
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
CRED_FILE = ROOT / "CREDENTIALS.md"
AGENT_SECRET_FILE = Path.home() / ".instaanalytic_agent_secret"


def _read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
            if m:
                values[m.group(1)] = m.group(2).strip()
    return values


def _agent_secret() -> str:
    if AGENT_SECRET_FILE.exists():
        token = AGENT_SECRET_FILE.read_text().strip()
        if token:
            return token
    token = secrets.token_hex(32)
    AGENT_SECRET_FILE.write_text(token)
    AGENT_SECRET_FILE.chmod(0o600)
    return token


def main() -> int:
    env = _read_env()

    env.setdefault("POSTGRES_USER", "instaanalytic")
    env.setdefault("POSTGRES_DB", "instaanalytic")
    env.setdefault("POSTGRES_PASSWORD", secrets.token_hex(16))
    env.setdefault(
        "DATABASE_URL",
        f"postgresql+asyncpg://{env['POSTGRES_USER']}:{env['POSTGRES_PASSWORD']}@postgres:5432/{env['POSTGRES_DB']}",
    )
    env.setdefault("ENCRYPTION_KEY", secrets.token_hex(32))
    env.setdefault("REDIS_PASSWORD", secrets.token_hex(24))
    # Redis URL'si parola içermiyorsa parolalı olanla değiştir
    if "@redis" not in env.get("REDIS_URL", ""):
        env["REDIS_URL"] = f"redis://:{env['REDIS_PASSWORD']}@redis:6379/0"
    env.setdefault("API_TOKEN", secrets.token_hex(32))
    env.setdefault("FLOWER_USER", "admin")
    env.setdefault("FLOWER_PASSWORD", secrets.token_hex(12))
    if not env.get("HOST_AGENT_SECRET"):
        env["HOST_AGENT_SECRET"] = _agent_secret()
    env.setdefault("ENVIRONMENT", "production")
    env.setdefault("LOG_LEVEL", "INFO")

    ENV_FILE.write_text("".join(f"{k}={v}\n" for k, v in env.items()))
    ENV_FILE.chmod(0o600)

    CRED_FILE.write_text(_credentials_doc(env))
    CRED_FILE.chmod(0o600)

    print(f"✓ {ENV_FILE.name} güncellendi, {CRED_FILE.name} yazıldı (izin: 600)")
    return 0


def _credentials_doc(e: dict[str, str]) -> str:
    return f"""# InstaAnalytic — Erişim Bilgileri

> **GİZLİ.** Bu dosya `.gitignore` içindedir, asla paylaşma / commit etme / ekran görüntüsü alma.
> Son güncelleme: {datetime.now():%Y-%m-%d %H:%M}  ·  Yeniden üretmek için: `python3 scripts/init_env.py`

## Günlük kullanım (sadece bunlar lazım)

| Ne | Adres | Giriş |
|---|---|---|
| Uygulama | http://localhost:3002 | Giriş yok (yalnızca bu bilgisayardan açılır) |
| Güvenlik kaydı (host agent) | `~/.instaanalytic_agent.log` | Hangi tarayıcının ne zaman okunduğu (çerez değeri yazılmaz) |
| Kuyruk monitörü (Flower) | http://localhost:5555 | Kullanıcı: `{e['FLOWER_USER']}` · Parola: `{e['FLOWER_PASSWORD']}` |

## Teknik değerler (normalde dokunmazsın)

| Anahtar | Değer | Ne işe yarar |
|---|---|---|
| `API_TOKEN` | `{e['API_TOKEN']}` | Arayüzün API'ye girişi. Vite proxy otomatik ekler; tarayıcıya gömülmez. Doğrudan API denerken `X-API-Token` başlığıyla gönder. |
| `HOST_AGENT_SECRET` | `{e['HOST_AGENT_SECRET']}` | Backend ↔ host agent. Aynı değer `~/.instaanalytic_agent_secret` dosyasındadır. |
| `ENCRYPTION_KEY` | `{e['ENCRYPTION_KEY']}` | Kayıtlı Instagram oturumlarını şifreler. **Kaybedersen oturumlar çözülemez**, değiştirme (rotasyon için aşağıya bak). |
| `REDIS_PASSWORD` | `{e['REDIS_PASSWORD']}` | Redis (kuyruk). Port yalnızca 127.0.0.1'e açıktır. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `{e['POSTGRES_USER']}` / `{e['POSTGRES_PASSWORD']}` | Veritabanı `{e['POSTGRES_DB']}` · port 127.0.0.1:5434 |

## Anahtar döndürme (rotasyon)

1. `.env` içinde eski anahtarı `ENCRYPTION_KEY_OLD`'a taşı, yeni anahtarı `ENCRYPTION_KEY`'e yaz.
2. Servisleri yeniden başlat; eski kayıtlar hâlâ çözülür, yeni yazımlar yeni anahtarla yapılır.
3. `docker compose exec backend python -m app.scripts.rotate_keys` ile tüm kayıtları yeniden şifrele; "kalan: 0" görünce `ENCRYPTION_KEY_OLD` satırını sil.

## Bir şey sızarsa

- Instagram oturumu için: tarayıcıdan Instagram'dan çıkış yap (cookie geçersiz olur), uygulamada "Oturumu sil" yap.
- Diğer değerler için: ilgili satırı `.env`'den sil, `python3 scripts/init_env.py` çalıştır, `docker compose up -d` ile yeniden başlat
  (`ENCRYPTION_KEY` ve `POSTGRES_PASSWORD` hariç: bunlar için önce rotasyon / parola değişikliği gerekir).
"""


if __name__ == "__main__":
    sys.exit(main())
