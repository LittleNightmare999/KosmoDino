"""Точка входа: сборка FastAPI-приложения, маршруты API и раздача собранного React-клиента."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import get_settings
from .database import Base, engine
from .routers import admin, auth, catalog, editor, reader
from .services import views


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    interval = get_settings().views_flush_seconds
    flusher = views.Flusher(engine, interval) if interval > 0 else None
    if flusher:
        flusher.start()
    yield
    if flusher:
        flusher.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="КосмоДино — интерактивная энциклопедия",
        version="1.0.0",
        description="Курсовой проект по дисциплине «Программная инженерия»",
        lifespan=lifespan,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth.router, catalog.router, reader.router, editor.router, admin.router):
        app.include_router(r)

    @app.get("/api/health", tags=["system"])
    def health():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}

    dist = (Path(__file__).resolve().parent.parent / settings.frontend_dist).resolve()
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            file = dist / path
            if path and file.is_file() and dist in file.resolve().parents:
                return FileResponse(file)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
