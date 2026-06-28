import os
import sys

# Make `shared/` importable — two levels up from tests/ reaches services/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/orders_test")

import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient, ASGITransport

import app.models.order  # noqa: F401 — must import before app.main to register with Base
from app.main import app as fastapi_app
from app.db.session import get_db
from app.db.base import Base
from shared.auth import get_current_user_id

_TEST_DB_URL = os.environ["DATABASE_URL"]
_TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


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

    async def override_auth():
        return _TEST_USER_ID

    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_current_user_id] = override_auth
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()
