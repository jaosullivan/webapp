import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/users_test")
os.environ.setdefault("INITIAL_ADMIN_EMAIL", "admin@test.com")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient, ASGITransport

import app.models.user  # noqa: F401 — must import before app.main to register with Base
from app.main import app as fastapi_app
from app.db.session import get_db
from app.db.base import Base
from app.core.security import create_access_token

_TEST_DB_URL = os.environ["DATABASE_URL"]
_SECRET_KEY = os.environ.get("SECRET_KEY", "changeme-in-production")


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(_TEST_DB_URL, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_tables(engine):
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest_asyncio.fixture
async def client(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def admin_headers() -> dict:
    """Valid JWT with admin=True — does not create any DB row."""
    token = create_access_token(
        subject="test-admin-id",
        secret_key=_SECRET_KEY,
        expire_minutes=60,
        is_admin=True,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_headers() -> dict:
    """Valid JWT with admin=False — does not create any DB row."""
    token = create_access_token(
        subject="test-user-id",
        secret_key=_SECRET_KEY,
        expire_minutes=60,
        is_admin=False,
    )
    return {"Authorization": f"Bearer {token}"}
