from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import PromptCreate
from backend.services.resource_service import create_prompt, list_prompts

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.get("")
def get_prompts(scene_id: Optional[str] = None):
    return list_prompts(scene_id)


@router.post("")
def post_prompt(payload: PromptCreate):
    return create_prompt(payload.dict())
