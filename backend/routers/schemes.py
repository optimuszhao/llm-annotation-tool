from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import SchemeCreate
from backend.services.resource_service import create_scheme, list_schemes

router = APIRouter(prefix="/api/schemes", tags=["schemes"])


@router.get("")
def get_schemes(scene_id: Optional[str] = None):
    return list_schemes(scene_id)


@router.post("")
def post_scheme(payload: SchemeCreate):
    return create_scheme(payload.dict())
