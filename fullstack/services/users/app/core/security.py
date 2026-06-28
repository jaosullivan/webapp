from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import HTTPException


def create_access_token(subject: str, secret_key: str, expire_minutes: int, is_admin: bool = False) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    return jwt.encode({"sub": subject, "exp": expire, "admin": is_admin}, secret_key, algorithm="HS256")


def create_refresh_token(subject: str, secret_key: str, expire_days: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=expire_days)
    return jwt.encode(
        {"sub": subject, "exp": expire, "type": "refresh"},
        secret_key,
        algorithm="HS256",
    )


def decode_access_token(token: str, secret_key: str) -> str:
    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        user_id: str = payload["sub"]
        return user_id
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
