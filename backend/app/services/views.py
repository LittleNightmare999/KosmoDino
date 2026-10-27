"""Буферизованный счётчик просмотров.

Обновлять строку статьи на каждый просмотр — значит заставлять всех читателей популярной
статьи ждать блокировку одной строки. Вместо этого просмотры копятся в памяти процесса
и раз в несколько секунд сбрасываются в БД одним UPDATE на статью: views = views + n.
Инкремент относительный, поэтому несколько воркеров uvicorn не мешают друг другу.
"""
import threading
from collections import Counter

from sqlalchemy import update
from sqlalchemy.engine import Engine

from ..models import Article

_lock = threading.Lock()
_pending: Counter[int] = Counter()
_seen: Counter[int] = Counter()  # монотонный счётчик просмотров этого процесса


def add(article_id: int) -> int:
    """Учесть просмотр; возвращает число ещё не сброшенных просмотров статьи."""
    with _lock:
        _pending[article_id] += 1
        _seen[article_id] += 1
        return _pending[article_id]


def pending(article_id: int) -> int:
    with _lock:
        return _pending[article_id]


def snapshot(article_id: int) -> tuple[int, int]:
    """Согласованная пара (несброшенные, всего учтено процессом) для кэшированных ответов."""
    with _lock:
        return _pending[article_id], _seen[article_id]


def seen(article_id: int) -> int:
    with _lock:
        return _seen[article_id]


def flush(engine: Engine) -> int:
    """Записать накопленные просмотры в БД. Возвращает число обновлённых статей."""
    with _lock:
        batch = dict(_pending)
    if not batch:
        return 0
    with engine.begin() as conn:
        for article_id, n in sorted(batch.items()):  # фиксированный порядок исключает взаимоблокировки
            conn.execute(update(Article).where(Article.id == article_id).values(views=Article.views + n))
    with _lock:
        # вычитаем ровно сброшенное: просмотры, пришедшие во время записи, остаются в буфере
        _pending.subtract(batch)
        for k in [k for k, v in _pending.items() if v <= 0]:
            del _pending[k]
    return len(batch)


class Flusher:
    """Фоновый поток, периодически сбрасывающий буфер."""

    def __init__(self, engine: Engine, interval: float):
        self.engine = engine
        self.interval = interval
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="views-flusher", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            try:
                flush(self.engine)
            except Exception:  # БД временно недоступна — попробуем в следующий раз
                pass

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)
        flush(self.engine)
