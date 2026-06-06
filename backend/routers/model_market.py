from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import ModelMarketConfigCreate
from backend.services.model_market_service import (
    create_model_market_config,
    delete_model_market_config,
    list_model_market_configs,
)

router = APIRouter(prefix="/api/model-market-configs", tags=["model_market_configs"])


@router.get("")
def get_model_market_configs():
    return list_model_market_configs()


@router.post("")
def post_model_market_config(payload: ModelMarketConfigCreate):
    return create_model_market_config(payload.dict())


@router.delete("/{config_id}")
def remove_model_market_config(config_id: str):
    return delete_model_market_config(config_id)
