import os
import redis.asyncio as redis_async

_pool: redis_async.Redis | None = None


def get_redis_pool() -> redis_async.Redis:
    global _pool
    if _pool is None:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        _pool = redis_async.from_url(url, decode_responses=True)
    return _pool


async def close_redis_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
