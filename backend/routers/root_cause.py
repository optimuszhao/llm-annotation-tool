from __future__ import annotations

from fastapi import APIRouter

from backend.services.root_cause_service import get_root_cause_summary

router = APIRouter(prefix="/api/root-cause", tags=["root_cause"])


@router.get("/summary")
def root_cause_summary(scene_id: str, dataset_id: str = "", scheme_id: str = ""):
    return get_root_cause_summary(scene_id, dataset_id, scheme_id)
