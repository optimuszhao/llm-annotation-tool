from __future__ import annotations

import json
import queue
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.schemas import AnnotationTaskCreate
from backend.services.annotation_service import (
    create_annotation_task,
    get_annotation_task,
    list_annotation_tasks,
    stop_unfinished,
    subscribe_task_events,
    unsubscribe_task_events,
)

router = APIRouter(prefix="/api/annotation-tasks", tags=["annotation_tasks"])


@router.post("")
def post_annotation_task(payload: AnnotationTaskCreate):
    return create_annotation_task(payload.dict())


@router.get("")
def get_annotation_tasks(dataset_id: Optional[str] = None, scheme_id: Optional[str] = None):
    return list_annotation_tasks(dataset_id, scheme_id)


@router.get("/{task_id}")
def get_annotation_task_detail(task_id: str):
    return get_annotation_task(task_id)


@router.post("/{task_id}/stop-unfinished")
def post_stop_unfinished(task_id: str):
    return stop_unfinished(task_id)


@router.get("/{task_id}/events")
def get_task_events(task_id: str):
    event_queue = subscribe_task_events(task_id)

    def stream():
        try:
            snapshot = get_annotation_task(task_id)
            yield f"data: {json.dumps({'type': 'snapshot', 'task': snapshot}, ensure_ascii=False)}\n\n"
            if snapshot.get("status") in {"done", "stopped", "failed", "interrupted"}:
                return
            while True:
                try:
                    event = event_queue.get(timeout=15)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if event.get("type") == "task_finished":
                        break
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'heartbeat'}, ensure_ascii=False)}\n\n"
        finally:
            unsubscribe_task_events(task_id, event_queue)

    return StreamingResponse(stream(), media_type="text/event-stream")
