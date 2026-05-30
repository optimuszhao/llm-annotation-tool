from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, File, Form, Query, UploadFile

from backend.services.annotation_service import (
    analyze_dataset_row,
    get_dataset_metrics,
    list_row_analysis_history,
    list_row_annotation_history,
    start_batch_analysis,
)
from backend.services.dataset_service import (
    delete_dataset,
    delete_dataset_row,
    delete_dataset_rows,
    export_dataset_rows,
    get_dataset_row,
    get_dataset_row_field,
    get_dataset_rows,
    import_excel_files,
    list_datasets,
    update_dataset_row,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("")
def get_datasets(scene_id: Optional[str] = None):
    return list_datasets(scene_id)


@router.post("")
async def post_dataset(scene_id: str = Form(...), files: list[UploadFile] = File(...)):
    return await import_excel_files(scene_id, files)


@router.delete("/{dataset_id}")
def remove_dataset(dataset_id: str):
    return delete_dataset(dataset_id)


@router.get("/{dataset_id}/rows")
def get_rows(
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1),
    search: str = "",
    search_column: str = "",
    scheme_id: str = "",
    statuses: list[str] = Query(default=[]),
):
    return get_dataset_rows(dataset_id, page, page_size, search, search_column, scheme_id, statuses)


@router.get("/{dataset_id}/export")
def export_rows(dataset_id: str):
    return export_dataset_rows(dataset_id)


@router.get("/{dataset_id}/rows/{row_id}/fields/{column:path}")
def get_row_field(dataset_id: str, row_id: str, column: str, scheme_id: str = ""):
    return get_dataset_row_field(dataset_id, row_id, column, scheme_id)


@router.get("/{dataset_id}/rows/{row_id}")
def get_row(dataset_id: str, row_id: str, scheme_id: str = ""):
    return get_dataset_row(dataset_id, row_id, scheme_id)


@router.put("/{dataset_id}/rows/{row_id}")
def put_row(dataset_id: str, row_id: str, payload: dict = Body(...)):
    return update_dataset_row(dataset_id, row_id, payload)


@router.delete("/{dataset_id}/rows/{row_id}")
def remove_row(dataset_id: str, row_id: str):
    return delete_dataset_row(dataset_id, row_id)


@router.post("/{dataset_id}/rows/delete")
def remove_rows(dataset_id: str, payload: dict = Body(...)):
    return delete_dataset_rows(dataset_id, payload.get("row_ids") or [])


@router.post("/{dataset_id}/rows/{row_id}/analysis")
def post_row_analysis(dataset_id: str, row_id: str, scheme_id: str = "", method_name: str = ""):
    return analyze_dataset_row(dataset_id, row_id, scheme_id, method_name)


@router.post("/{dataset_id}/analysis-batch")
def post_batch_analysis(dataset_id: str, payload: dict = Body(...)):
    return start_batch_analysis({**payload, "dataset_id": dataset_id})


@router.get("/{dataset_id}/rows/{row_id}/analysis-history")
def get_row_analysis_history(dataset_id: str, row_id: str):
    return list_row_analysis_history(dataset_id, row_id)


@router.get("/{dataset_id}/rows/{row_id}/annotation-history")
def get_row_annotation_history(dataset_id: str, row_id: str, scheme_id: str = ""):
    return list_row_annotation_history(dataset_id, row_id, scheme_id)


@router.get("/{dataset_id}/metrics")
def get_metrics(dataset_id: str, scheme_id: str = ""):
    return get_dataset_metrics(dataset_id, scheme_id)
