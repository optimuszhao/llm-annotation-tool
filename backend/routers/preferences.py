from __future__ import annotations

from fastapi import APIRouter, Body

from backend.services.preference_service import (
    get_prompt_skeleton,
    get_resource_skeleton,
    get_workbench_source,
    save_prompt_skeleton,
    save_resource_skeleton,
    save_workbench_source,
)


router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("/workbench-source")
def get_saved_workbench_source():
    return get_workbench_source()


@router.put("/workbench-source")
def put_saved_workbench_source(payload: dict = Body(...)):
    return save_workbench_source(payload)


@router.get("/prompt-skeleton")
def get_saved_prompt_skeleton():
    return get_prompt_skeleton()


@router.put("/prompt-skeleton")
def put_saved_prompt_skeleton(payload: dict = Body(...)):
    return save_prompt_skeleton(payload)


@router.get("/knowledge-skeleton")
def get_saved_knowledge_skeleton():
    return get_resource_skeleton("knowledge")


@router.put("/knowledge-skeleton")
def put_saved_knowledge_skeleton(payload: dict = Body(...)):
    return save_resource_skeleton("knowledge", payload)


@router.get("/error-set-skeleton")
def get_saved_error_set_skeleton():
    return get_resource_skeleton("error-set")


@router.put("/error-set-skeleton")
def put_saved_error_set_skeleton(payload: dict = Body(...)):
    return save_resource_skeleton("error-set", payload)
