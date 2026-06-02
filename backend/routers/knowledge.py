from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import KnowledgeCreate
from backend.services.resource_service import create_knowledge, delete_knowledge, export_knowledge, list_knowledge, update_knowledge

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("")
def get_knowledge(scene_id: Optional[str] = None):
    return list_knowledge(scene_id)


@router.get("/export")
def get_knowledge_export(scene_id: Optional[str] = None):
    return export_knowledge(scene_id)


@router.post("")
def post_knowledge(payload: KnowledgeCreate):
    return create_knowledge(payload.dict())


@router.put("/{knowledge_id}")
def put_knowledge(knowledge_id: str, payload: KnowledgeCreate):
    return update_knowledge(knowledge_id, payload.dict())


@router.delete("/{knowledge_id}")
def remove_knowledge(knowledge_id: str):
    return delete_knowledge(knowledge_id)
