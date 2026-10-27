"""Общие фикстуры. Тесты работают с отдельной БД encyclopedia_test в том же контейнере PostgreSQL."""
import os

os.environ.setdefault(
    "ENC_DATABASE_URL", "postgresql+psycopg://encyclopedia:encyclopedia@localhost:5433/encyclopedia_test"
)

os.environ.setdefault("ENC_VIEWS_FLUSH_SECONDS", "0")

import itertools

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.seed.seed import seed
from app.services.cache import invalidate_all

_counter = itertools.count(1)


@pytest.fixture(scope="session", autouse=True)
def database():
    assert "encyclopedia_test" in str(engine.url), "тесты должны идти на тестовой БД"
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


@pytest.fixture(autouse=True)
def _fresh_cache():
    invalidate_all()


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, username, password="password123"):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client, "alice")


@pytest.fixture(scope="session")
def editor(client):
    return login(client, "editor1")


@pytest.fixture(scope="session")
def reader(client):
    return login(client, "reader1")


@pytest.fixture
def unique():
    return lambda prefix="t": f"{prefix}-{next(_counter)}"


def article_payload(slug, category_id, **over):
    data = {
        "title": f"Тестовая статья {slug}",
        "slug": slug,
        "summary": "Краткое описание тестовой статьи для проверки.",
        "content": "## Раздел\nСодержимое тестовой статьи достаточной длины.",
        "category_id": category_id,
        "facts": [{"label": "Масса", "value": "1 кг"}],
        "tags": ["Тест", "проверка", "тест"],
    }
    data.update(over)
    return data


@pytest.fixture(scope="session")
def space_category(client):
    topics = client.get("/api/topics").json()
    space = next(t for t in topics if t["slug"] == "space")
    return space["categories"][0]["id"]
