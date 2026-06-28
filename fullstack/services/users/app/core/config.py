from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/users"
    SECRET_KEY: str = "changeme-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False  # set True in production (requires HTTPS)
    REDIS_URL: str = "redis://localhost:6379"
    CORS_ORIGINS: str = "http://localhost:3000"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""  # e.g. http://tempo:4317 in k8s
    INITIAL_ADMIN_EMAIL: str = ""  # first user with this email is promoted to admin

    model_config = {"env_file": ".env"}


settings = Settings()
