"""
Entegrasyon testleri için izole test veritabanı (gerçek verilere ASLA dokunmaz).
Gerekli: DATABASE_URL'in gösterdiği Postgres'e erişim (docker compose ile çalışırken otomatik).
Postgres yoksa bu testler atlanır; saf birim testleri etkilenmez.
"""
import os
import uuid

import pytest
import pytest_asyncio

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ENCRYPTION_KEY", "test-key")

from app.core.config import settings  # noqa: E402

_TEST_DB = "instaanalytic_pytest"


def _admin_conn():
    import psycopg2
    from sqlalchemy.engine import make_url
    u = make_url(settings.database_url)
    conn = psycopg2.connect(host=u.host, port=u.port or 5432, user=u.username, password=u.password, dbname=u.database,
                            connect_timeout=3)
    conn.autocommit = True
    return conn, u


@pytest.fixture(scope="session")
def test_db_url():
    try:
        conn, u = _admin_conn()
    except Exception as e:  # Postgres yok
        pytest.skip(f"Postgres erişilemiyor: {e}")
    with conn.cursor() as c:
        c.execute(f'DROP DATABASE IF EXISTS "{_TEST_DB}"')
        c.execute(f'CREATE DATABASE "{_TEST_DB}"')
    conn.close()
    url = u.set(database=_TEST_DB)
    yield url
    conn, _ = _admin_conn()
    with conn.cursor() as c:
        c.execute(f'DROP DATABASE IF EXISTS "{_TEST_DB}" WITH (FORCE)')
    conn.close()


@pytest_asyncio.fixture
async def db_engine(test_db_url):
    from sqlalchemy.ext.asyncio import create_async_engine
    import app.models  # noqa: F401  (tüm tabloları kaydet)
    from app.db.base import Base
    engine = create_async_engine(test_db_url.set(drivername="postgresql+asyncpg"))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(db_engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    async with maker() as s:
        yield s


@pytest_asyncio.fixture
async def client(db_engine, monkeypatch):
    import httpx
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.db.base import get_db
    from app.main import app

    monkeypatch.setattr(settings, "api_token", "test-token")
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _get_db():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Token": "test-token"}) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def fake_redis_async(monkeypatch):
    import fakeredis.aioredis
    from app.routers import sessions
    r = fakeredis.aioredis.FakeRedis()
    monkeypatch.setattr(sessions, "_redis", lambda: r)
    return r


@pytest_asyncio.fixture
async def make_session(db):
    """Sahte profil üretir: make_session(source='browser', username='me')"""
    from app.core.security import encrypt
    from app.models.ig_user import IgUser
    from app.models.session import Session
    import json
    counter = {"n": 0}

    async def _make(username="me", source="browser", allow_actions=False, **kw):
        counter["n"] += 1
        uid = 1000 + counter["n"]
        db.add(IgUser(id=uid, username=username))
        await db.flush()
        s = Session(ig_user_id=uid, ig_username=username, source=source, allow_actions=allow_actions,
                    session_data=encrypt(json.dumps({"cookies": {"sessionid": "x"} if source == "browser" else {}})), **kw)
        db.add(s)
        await db.commit()
        await db.refresh(s)
        return s
    return _make


def new_id():
    return uuid.uuid4()
