from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import router
from app.core.config import settings
from app.db.session import engine, run_migrations
from shared.log import configure_logging
from shared.middleware import RequestLoggingMiddleware
from shared.redis import close_redis_pool

configure_logging()

from shared.tracing import setup_tracing  # noqa: E402
setup_tracing("orders")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations()
    yield
    await engine.dispose()
    await close_redis_pool()


app = FastAPI(title="Orders Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")

from prometheus_fastapi_instrumentator import Instrumentator  # noqa: E402
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

try:
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # noqa: E402
    FastAPIInstrumentor.instrument_app(app)
except ImportError:
    pass


@app.get("/health")
async def health():
    checks: dict[str, str] = {}
    status_code = 200

    try:
        import sqlalchemy
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy.pool import NullPool
        _hc = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
        try:
            async with _hc.connect() as conn:
                await conn.execute(sqlalchemy.text("SELECT 1"))
            checks["db"] = "ok"
        finally:
            await _hc.dispose()
    except Exception as exc:
        checks["db"] = f"error: {exc}"
        status_code = 503

    try:
        from shared.redis import get_redis_pool
        await get_redis_pool().ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        status_code = 503

    return JSONResponse({"status": "ok" if status_code == 200 else "degraded", **checks},
                        status_code=status_code)
