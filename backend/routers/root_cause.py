from __future__ import annotations

from fastapi import APIRouter, Body

from backend.services.root_cause_service import (
    bulk_add_root_cause_baselines,
    create_root_cause_baseline,
    delete_root_cause_baseline,
    get_root_cause_summary,
    list_root_cause_baselines,
    update_root_cause_baseline,
)

router = APIRouter(prefix="/api/root-cause", tags=["root_cause"])


@router.get("/summary")
def root_cause_summary(scene_id: str, dataset_id: str = "", scheme_id: str = ""):
    return get_root_cause_summary(scene_id, dataset_id, scheme_id)


@router.get("/baselines")
def get_baselines(scene_id: str):
    return list_root_cause_baselines(scene_id)


@router.post("/baselines")
def post_baseline(payload: dict = Body(...)):
    return create_root_cause_baseline(
        payload.get("scene_id", ""),
        payload.get("polarity", ""),
        payload.get("name", ""),
    )


@router.put("/baselines/{baseline_id}")
def put_baseline(baseline_id: str, payload: dict = Body(...)):
    return update_root_cause_baseline(
        baseline_id,
        payload.get("polarity", ""),
        payload.get("name", ""),
    )


@router.delete("/baselines/{baseline_id}")
def remove_baseline(baseline_id: str):
    return delete_root_cause_baseline(baseline_id)


@router.post("/baselines/bulk")
def post_baselines_bulk(payload: dict = Body(...)):
    return bulk_add_root_cause_baselines(payload.get("scene_id", ""), payload.get("items", []))
