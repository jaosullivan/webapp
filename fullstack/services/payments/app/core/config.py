from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/payments"
    ORDERS_SERVICE_URL: str = "http://orders:8000"

    model_config = {"env_file": ".env"}


settings = Settings()
