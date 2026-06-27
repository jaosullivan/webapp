from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/orders"
    USERS_SERVICE_URL: str = "http://users:8000"

    model_config = {"env_file": ".env"}


settings = Settings()
