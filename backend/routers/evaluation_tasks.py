from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import EvaluationTaskCreate, EvaluationTaskItemCreate
from backend.services.evaluation_service import (
    add_evaluation_item,
    create_evaluation_task,
    delete_evaluation_item,
    get_evaluation_task,
    list_evaluation_candidates,
    list_evaluation_tasks,
)

router = APIRouter(prefix="/api/evaluation-tasks", tags=["evaluation_tasks"])


@router.post("")
def post_evaluation_task(payload: EvaluationTaskCreate):
    return create_evaluation_task(payload.dict())


@router.get("")
def get_evaluation_tasks(scene_id: Optional[str] = None, dataset_id: Optional[str] = None):
    return list_evaluation_tasks(scene_id, dataset_id)


@router.get("/{evaluation_task_id}")
def get_evaluation_task_detail(evaluation_task_id: str):
    return get_evaluation_task(evaluation_task_id)


@router.get("/{evaluation_task_id}/candidates")
def get_evaluation_task_candidates(evaluation_task_id: str):
    return list_evaluation_candidates(evaluation_task_id)


@router.post("/{evaluation_task_id}/items")
def post_evaluation_task_item(evaluation_task_id: str, payload: EvaluationTaskItemCreate):
    return add_evaluation_item(evaluation_task_id, payload.dict())


@router.delete("/{evaluation_task_id}/items/{item_id}")
def remove_evaluation_task_item(evaluation_task_id: str, item_id: str):
    return delete_evaluation_item(evaluation_task_id, item_id)
