from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.schemas import SchemeCreate
from backend.services.resource_service import create_scheme, delete_scheme, list_schemes
from user_hooks import hooks

router = APIRouter(prefix="/api/schemes", tags=["schemes"])


@router.get("")
def get_schemes(scene_id: Optional[str] = None):
    return list_schemes(scene_id)


@router.get("/methods")
def get_scheme_methods():
    return hooks.list_scheme_methods()


@router.get("/prompt-init-methods")
def get_prompt_init_methods():
    return hooks.list_prompt_init_methods()


@router.post("")
def post_scheme(payload: SchemeCreate):
    return create_scheme(payload.dict())


@router.delete("/{scheme_id}")
def remove_scheme(scheme_id: str):
    return delete_scheme(scheme_id)
