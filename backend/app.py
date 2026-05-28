from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.database import init_db
from backend.routers import datasets, error_sets, knowledge, prompts, scenes, schemes


ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="LLM Annotation Tool", version="0.1.0")
    app.include_router(scenes.router)
    app.include_router(datasets.router)
    app.include_router(prompts.router)
    app.include_router(knowledge.router)
    app.include_router(error_sets.router)
    app.include_router(schemes.router)

    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
    app.mount("/pages", StaticFiles(directory=FRONTEND_DIR / "pages"), name="pages")
    app.mount("/vendor", StaticFiles(directory=FRONTEND_DIR / "vendor"), name="vendor")

    @app.get("/")
    def index():
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
