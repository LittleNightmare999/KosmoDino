"""Простой TTL-кэш в памяти процесса для «горячих» read-only эндпоинтов.

Снижает нагрузку на БД при массовом чтении (справочники, граф знаний).
Каждый воркер uvicorn держит собственный кэш; при изменении данных
кэш текущего процесса сбрасывается, остальные устаревают не дольше TTL.
"""
import functools
import threading
import time
from collections.abc import Callable

_registry: list[dict] = []
_lock = threading.Lock()


def ttl_cache(seconds: float) -> Callable:
    def decorator(fn: Callable) -> Callable:
        store: dict = {}
        _registry.append(store)

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = tuple(sorted((k, v) for k, v in kwargs.items() if k != "db"))
            now = time.monotonic()
            hit = store.get(key)
            if hit and hit[0] > now:
                return hit[1]
            value = fn(*args, **kwargs)
            with _lock:
                store[key] = (now + seconds, value)
            return value

        return wrapper

    return decorator


def invalidate_all() -> None:
    with _lock:
        for store in _registry:
            store.clear()
