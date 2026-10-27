"""Нагрузочный тест запущенного сервера: смешанный поток запросов читателей.

Запуск (при работающем start.exe):
    backend\\.venv\\Scripts\\python backend\\scripts\\load_test.py --requests 3000 --concurrency 50
"""
import argparse
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

SCENARIO = [
    ("GET", "/api/topics", None),
    ("GET", "/api/articles", {"page_size": 12}),
    ("GET", "/api/articles", {"q": "звезда"}),
    ("GET", "/api/articles", {"q": "хищник", "topic": "dinosaurs"}),
    ("GET", "/api/articles/tyrannosaurus", None),
    ("GET", "/api/articles/saturn", None),
    ("GET", "/api/articles/jwst", None),
    ("GET", "/api/timeline/dinosaurs", None),
    ("GET", "/api/graph", None),
    ("GET", "/api/quiz/space", None),
]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://127.0.0.1:8000")
    p.add_argument("--requests", type=int, default=2000)
    p.add_argument("--concurrency", type=int, default=50)
    args = p.parse_args()

    rng = random.Random(1)
    plan = [rng.choice(SCENARIO) for _ in range(args.requests)]
    limits = httpx.Limits(max_connections=args.concurrency, max_keepalive_connections=args.concurrency)
    client = httpx.Client(base_url=args.base, limits=limits, timeout=30)

    def call(item):
        method, path, params = item
        t = time.perf_counter()
        r = client.request(method, path, params=params)
        return r.status_code, (time.perf_counter() - t) * 1000

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        results = list(pool.map(call, plan))
    elapsed = time.perf_counter() - started

    latencies = sorted(ms for _, ms in results)
    errors = sum(1 for code, _ in results if code >= 400)
    q = statistics.quantiles(latencies, n=100)
    print(f"Запросов: {len(results)}, параллельно: {args.concurrency}, ошибок: {errors}")
    print(f"Пропускная способность: {len(results) / elapsed:.0f} запросов/с")
    print(f"Задержка, мс: медиана {q[49]:.0f}, p95 {q[94]:.0f}, p99 {q[98]:.0f}, максимум {latencies[-1]:.0f}")


if __name__ == "__main__":
    main()
