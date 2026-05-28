from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import KnowledgeCreate
from backend.services.resource_service import create_knowledge, list_knowledge

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("")
def get_knowledge(scene_id: Optional[str] = None):
    return list_knowledge(scene_id)


@router.post("")
def post_knowledge(payload: KnowledgeCreate):
    return create_knowledge(payload.dict())
