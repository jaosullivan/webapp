import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings
from app.db.base import Base
import app.models.order  # noqa: F401 — registers model with Base.metadata

engine = create_async_engine(settings.DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def run_migrations() -> None:
    """Run alembic upgrade head. Falls back to create_all if alembic is unavailable."""
    def _upgrade():
        from alembic.config import Config
        from alembic import command
        ini = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
        cfg = Config(os.path.normpath(ini))
        command.upgrade(cfg, "head")
    try:
        await asyncio.to_thread(_upgrade)
    except Exception:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
