"""SPEC-002 PB-6: .env okuma (pydantic-settings -> python-dotenv). Yalnız sentetik değerler."""
from app.core.config import Settings

_VARS = ("ENCRYPTION_KEY", "ENCRYPTION_KEY_OLD", "API_TOKEN", "DATABASE_URL", "REDIS_URL")


def test_pb6_settings_read_from_env_file(monkeypatch, tmp_path):
    for v in _VARS:                       # ortam değişkeni .env'i ezer; temiz başla
        monkeypatch.delenv(v, raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "DATABASE_URL=postgresql+asyncpg://syn:syn@dbhost:5432/syn\n"
        "REDIS_URL=redis://synhost:6379/3\n"
        "ENCRYPTION_KEY=synthetic-enc-key\n"
        "API_TOKEN=synthetic-api-token\n"
        "ENCRYPTION_KEY_OLD=synthetic-old-key\n"
        "UNDEFINED_EXTRA_KEY=ignored\n"
        'QUOTED="with # hash"\n',
        encoding="utf-8",
    )
    s = Settings(_env_file=str(env))
    assert s.database_url == "postgresql+asyncpg://syn:syn@dbhost:5432/syn"
    assert s.redis_url == "redis://synhost:6379/3"
    assert s.encryption_key == "synthetic-enc-key"
    assert s.api_token == "synthetic-api-token"
    assert s.encryption_key_old == "synthetic-old-key"
    assert not hasattr(s, "undefined_extra_key")
