from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.database import init_db
from backend.routers import (
    annotation_tasks,
    chat,
    data_transform,
    datasets,
    error_sets,
    evaluation_tasks,
    export_packages,
    field_mappings,
    knowledge,
    maintenance,
    model_market,
    model_distillation,
    preferences,
    prompts,
    root_cause,
    scenes,
    schemes,
)


ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def create_app() -> FastAPI:
    init_db(recover_interrupted=True)
    app = FastAPI(title="LLM Annotation Tool", version="0.1.0")
    app.include_router(scenes.router)
    app.include_router(data_transform.router)
    app.include_router(datasets.router)
    app.include_router(prompts.router)
    app.include_router(knowledge.router)
    app.include_router(error_sets.router)
    app.include_router(evaluation_tasks.router)
    app.include_router(export_packages.router)
    app.include_router(schemes.router)
    app.include_router(field_mappings.router)
    app.include_router(annotation_tasks.router)
    app.include_router(maintenance.router)
    app.include_router(model_market.router)
    app.include_router(model_distillation.router)
    app.include_router(preferences.router)
    app.include_router(chat.router)
    app.include_router(root_cause.router)

    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
    app.mount("/pages", StaticFiles(directory=FRONTEND_DIR / "pages"), name="pages")
    app.mount("/vendor", StaticFiles(directory=FRONTEND_DIR / "vendor"), name="vendor")

    @app.get("/")
    def index():
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.on_event("startup")
    def resume_annotation_tasks_on_startup():
        from backend.services.annotation_service import resume_pending_annotation_tasks

        resume_annotation_tasks_on_startup.last_resumed = resume_pending_annotation_tasks()

    return app


app = create_app()
