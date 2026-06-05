from __future__ import annotations

from fastapi import APIRouter, Body

from backend.services.preference_service import get_workbench_source, save_workbench_source


router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("/workbench-source")
def get_saved_workbench_source():
    return get_workbench_source()


@router.put("/workbench-source")
def put_saved_workbench_source(payload: dict = Body(...)):
    return save_workbench_source(payload)
