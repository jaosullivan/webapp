import os
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from shared.redis import get_redis_pool

bearer = HTTPBearer(auto_error=False)
_SECRET_KEY = os.environ.get("SECRET_KEY", "changeme-in-production")


async def _decode_and_check(credentials: HTTPAuthorizationCredentials | None) -> tuple[str, dict]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        r = get_redis_pool()
        if await r.get(f"blocklist:{token}"):
            raise HTTPException(status_code=401, detail="Token has been revoked")
    except HTTPException:
        raise
    except Exception:
        pass  # Redis unavailable — fail open rather than locking out all users
    return user_id, payload


async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Security(bearer)) -> str:
    user_id, _ = await _decode_and_check(credentials)
    return user_id


async def require_admin(credentials: HTTPAuthorizationCredentials = Security(bearer)) -> str:
    user_id, payload = await _decode_and_check(credentials)
    if not payload.get("admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id
