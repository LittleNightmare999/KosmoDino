"""Конфигурация приложения. Значения читаются из переменных окружения (префикс ENC_)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ENC_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://encyclopedia:encyclopedia@localhost:5433/encyclopedia"
    jwt_secret: str = "change-me-in-production-cosmodino-2026"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12
    db_pool_size: int = 10
    db_max_overflow: int = 20
    page_size_max: int = 50
    views_flush_seconds: float = 3.0  # 0 — без фонового сброса (тесты сбрасывают вручную)
    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
