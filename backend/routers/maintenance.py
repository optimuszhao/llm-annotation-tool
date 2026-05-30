from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body

from backend.services.maintenance_service import backfill_preview_cache


router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("/preview-backfill")
def post_preview_backfill(payload: Optional[dict] = Body(default=None)):
    return backfill_preview_cache(force=bool((payload or {}).get("force")))
