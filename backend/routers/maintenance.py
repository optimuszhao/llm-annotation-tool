from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body

from backend.services.maintenance_service import (
    backfill_preview_cache,
    compact_database,
    database_storage_diagnostics,
    prune_analysis_history,
    prune_annotation_history,
    prune_unused_model_result_columns,
)


router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("/preview-backfill")
def post_preview_backfill(payload: Optional[dict] = Body(default=None)):
    return backfill_preview_cache(force=bool((payload or {}).get("force")))


@router.post("/annotation-history/prune")
def post_prune_annotation_history():
    return prune_annotation_history()


@router.post("/analysis-history/prune")
def post_prune_analysis_history():
    return prune_analysis_history()


@router.post("/model-result-columns/prune")
def post_prune_model_result_columns():
    return prune_unused_model_result_columns()


@router.get("/storage-diagnostics")
def get_storage_diagnostics():
    return database_storage_diagnostics()


@router.post("/database/compact")
def post_compact_database():
    return compact_database()
