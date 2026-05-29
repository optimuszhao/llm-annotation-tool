from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import SceneCreate
from backend.services.scene_service import create_scene, delete_scene, list_scenes

router = APIRouter(prefix="/api/scenes", tags=["scenes"])


@router.get("")
def get_scenes():
    return list_scenes()


@router.post("")
def post_scene(payload: SceneCreate):
    return create_scene(payload.name, payload.description)


@router.delete("/{scene_id}")
def remove_scene(scene_id: str):
    return delete_scene(scene_id)
