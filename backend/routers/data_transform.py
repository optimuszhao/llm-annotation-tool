from __future__ import annotations

from fastapi import APIRouter, Body, File, Query, UploadFile
from fastapi.responses import FileResponse

from backend.services.data_transform_service import (
    build_transform_package,
    get_transform_config,
    preview_transform,
    save_transform_config,
    upload_jsonl_files,
)

router = APIRouter(prefix="/api/data-transform", tags=["data_transform"])


@router.post("/upload")
async def upload_data_transform_files(files: list[UploadFile] = File(...)):
    return await upload_jsonl_files(files)


@router.get("/config")
def get_data_transform_config(scene_id: str = Query(...)):
    return get_transform_config(scene_id)


@router.put("/config")
def put_data_transform_config(payload: dict = Body(...)):
    return save_transform_config(payload.get("scene_id") or "", payload.get("config") or {})


@router.post("/preview")
def post_data_transform_preview(payload: dict = Body(...)):
    return preview_transform(
        payload.get("session_id") or "",
        payload.get("config") or {},
        int(payload.get("limit") or 20),
    )


@router.post("/package")
def post_data_transform_package(payload: dict = Body(...)):
    package = build_transform_package(payload.get("config") or {})
    return FileResponse(
        package["zip_path"],
        media_type="application/zip",
        filename=package["filename"],
    )
