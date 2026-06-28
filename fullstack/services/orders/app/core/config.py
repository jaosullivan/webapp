from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/orders"
    USERS_SERVICE_URL: str = "http://users:8000"
    SECRET_KEY: str = "changeme-in-production"
    REDIS_URL: str = "redis://localhost:6379"
    CORS_ORIGINS: str = "http://localhost:3000"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""  # e.g. http://tempo:4317 in k8s

    model_config = {"env_file": ".env"}


settings = Settings()
