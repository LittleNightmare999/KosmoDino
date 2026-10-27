"""Поведение под параллельной нагрузкой: пул соединений и счётчик просмотров без потерь."""
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select

from app.database import SessionLocal, engine
from app.models import Article
from app.services import views


def _db_views(slug):
    with SessionLocal() as db:
        return db.scalar(select(Article.views).where(Article.slug == slug))


def test_parallel_reads_lose_no_views(client):
    views.flush(engine)
    before = _db_views("neptune")
    n = 40
    with ThreadPoolExecutor(max_workers=16) as pool:
        codes = list(pool.map(lambda _: client.get("/api/articles/neptune").status_code, range(n)))
    assert codes == [200] * n
    # до сброса просмотры видны в ответе, но ещё не записаны в строку статьи
    assert _db_views("neptune") == before
    assert client.get("/api/articles/neptune").json()["views"] == before + n + 1
    views.flush(engine)
    assert _db_views("neptune") == before + n + 1


def test_flush_is_batched_per_article(client):
    views.flush(engine)
    for slug in ["sun", "sun", "saturn"]:
        client.get(f"/api/articles/{slug}")
    assert views.flush(engine) == 2  # два UPDATE вместо трёх
    assert views.flush(engine) == 0


def test_parallel_search(client):
    queries = ["звезда", "хищник", "планета", "мел", "телескоп"] * 6
    with ThreadPoolExecutor(max_workers=12) as pool:
        codes = list(pool.map(lambda q: client.get("/api/articles", params={"q": q}).status_code, queries))
    assert set(codes) == {200}
