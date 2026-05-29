from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import PromptCreate
from backend.services.resource_service import create_prompt, list_prompts, update_prompt

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.get("")
def get_prompts(scene_id: Optional[str] = None):
    return list_prompts(scene_id)


@router.post("")
def post_prompt(payload: PromptCreate):
    return create_prompt(payload.dict())


@router.put("/{prompt_id}")
def put_prompt(prompt_id: str, payload: PromptCreate):
    return update_prompt(prompt_id, payload.dict())
