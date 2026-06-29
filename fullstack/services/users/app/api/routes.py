import bcrypt
from datetime import datetime, timezone
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Security
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm, HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.limiter import limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserListResponse
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from shared.redis import get_redis_pool
from shared.auth import require_admin

_bearer = HTTPBearer(auto_error=False)

router = APIRouter()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _refresh_cookie_kwargs() -> dict:
    return dict(
        key="refresh_token",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",  # scope cookie to auth endpoints only
    )


@router.post("/users", response_model=UserResponse, status_code=201)
@limiter.limit("3/minute")
async def create_user(request: Request, body: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    is_admin = bool(settings.INITIAL_ADMIN_EMAIL and body.email == settings.INITIAL_ADMIN_EMAIL)
    user = User(email=body.email, hashed_password=hash_password(body.password), is_admin=is_admin)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/auth/token")
@limiter.limit("20/minute")
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user.id, settings.SECRET_KEY, settings.ACCESS_TOKEN_EXPIRE_MINUTES, is_admin=user.is_admin)
    refresh_token = create_refresh_token(user.id, settings.SECRET_KEY, settings.REFRESH_TOKEN_EXPIRE_DAYS)

    response = JSONResponse({"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(value=refresh_token, **_refresh_cookie_kwargs())
    return response


@router.post("/auth/refresh")
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    try:
        r = get_redis_pool()
        if await r.get(f"blocklist:{refresh_token}"):
            raise HTTPException(status_code=401, detail="Refresh token has been revoked")
    except HTTPException:
        raise
    except Exception:
        pass

    # Rotate: blocklist old refresh token, issue new pair
    try:
        exp = payload.get("exp", 0)
        ttl = max(int(exp - datetime.now(timezone.utc).timestamp()), 0)
        if ttl > 0:
            r = get_redis_pool()
            await r.setex(f"blocklist:{refresh_token}", ttl, "1")
    except Exception:
        pass

    user = await db.get(User, user_id)
    is_admin = user.is_admin if user else False

    new_access = create_access_token(user_id, settings.SECRET_KEY, settings.ACCESS_TOKEN_EXPIRE_MINUTES, is_admin=is_admin)
    new_refresh = create_refresh_token(user_id, settings.SECRET_KEY, settings.REFRESH_TOKEN_EXPIRE_DAYS)

    response = JSONResponse({"access_token": new_access, "token_type": "bearer"})
    response.set_cookie(value=new_refresh, **_refresh_cookie_kwargs())
    return response


@router.post("/auth/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    refresh_token: str | None = Cookie(default=None),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        exp = payload.get("exp", 0)
        ttl = max(int(exp - datetime.now(timezone.utc).timestamp()), 0)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    r = get_redis_pool()
    if ttl > 0:
        await r.setex(f"blocklist:{token}", ttl, "1")

    # Also blocklist the refresh token so it can't be used after logout
    if refresh_token:
        try:
            rt_payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=["HS256"])
            rt_exp = rt_payload.get("exp", 0)
            rt_ttl = max(int(rt_exp - datetime.now(timezone.utc).timestamp()), 0)
            if rt_ttl > 0:
                await r.setex(f"blocklist:{refresh_token}", rt_ttl, "1")
        except Exception:
            pass

    response = JSONResponse({"detail": "Logged out"})
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/api/v1/auth",
    )
    return response


@router.get("/users", response_model=UserListResponse)
async def list_users(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(require_admin),
):
    total = await db.scalar(select(func.count()).select_from(User))
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    return {"items": result.scalars().all(), "total": total or 0}


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db), _admin: str = Depends(require_admin)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def toggle_user_status(user_id: str, db: AsyncSession = Depends(get_db), _admin: str = Depends(require_admin)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    await db.refresh(user)
    return user
