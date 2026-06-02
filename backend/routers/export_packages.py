from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend.services.resource_service import build_algorithm_package

router = APIRouter(prefix="/api/export-packages", tags=["export_packages"])


@router.get("/algorithm")
def export_algorithm_package(scene_id: str):
    package = build_algorithm_package(scene_id)
    return FileResponse(
        package["zip_path"],
        media_type="application/zip",
        filename=package["filename"],
    )
