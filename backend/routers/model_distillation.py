from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import ModelDistillationRun
from backend.services.model_distillation_service import list_distillation_methods, run_model_distillation

router = APIRouter(prefix="/api/model-distillation", tags=["model_distillation"])


@router.get("/methods")
def get_distillation_methods():
    return list_distillation_methods()


@router.post("/run")
def post_model_distillation(payload: ModelDistillationRun):
    return run_model_distillation(payload.dict())
