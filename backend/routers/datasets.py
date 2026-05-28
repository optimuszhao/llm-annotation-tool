from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, Query, UploadFile

from backend.services.dataset_service import get_dataset_rows, import_excel_files, list_datasets

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("")
def get_datasets(scene_id: Optional[str] = None):
    return list_datasets(scene_id)


@router.post("")
async def post_dataset(scene_id: str = Form(...), files: list[UploadFile] = File(...)):
    return await import_excel_files(scene_id, files)


@router.get("/{dataset_id}/rows")
def get_rows(
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1),
    search: str = "",
):
    return get_dataset_rows(dataset_id, page, page_size, search)
