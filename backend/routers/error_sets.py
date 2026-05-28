from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import ErrorSetCreate
from backend.services.resource_service import create_error_set, list_error_sets

router = APIRouter(prefix="/api/error-sets", tags=["error_sets"])


@router.get("")
def get_error_sets(scene_id: Optional[str] = None):
    return list_error_sets(scene_id)


@router.post("")
def post_error_set(payload: ErrorSetCreate):
    return create_error_set(payload.dict())
