from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.services.model_market_service import get_model_market_config
from user_hooks.llm_chat import llm_dialog_function, llm_dialog_stream_function


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatPayload(BaseModel):
    message: str
    model_key: str = "demo"
    model_type: str = "local"
    history: list[dict] = []


@router.post("")
def chat_with_model(payload: ChatPayload):
    message = payload.message.strip()
    if not message:
        return {"text": "请输入要发送给大模型的内容。"}

    model_type = payload.model_type or "local"
    model_key = payload.model_key or ("core_model" if model_type == "local" else "")
    model_config = get_model_market_config(model_key) if model_type == "market" and model_key else {}
    chat_payload = {
        "message": message,
        "history": payload.history,
        "model_key": model_key,
        "model_type": model_type,
        "model_config": model_config or {},
    }
    return {
        "text": llm_dialog_function(chat_payload),
        "model_type": model_type,
        "model_key": model_key,
    }


@router.post("/stream")
def stream_chat_with_model(payload: ChatPayload):
    message = payload.message.strip()
    if not message:
        return StreamingResponse(iter(["请输入要发送给大模型的内容。"]), media_type="text/plain; charset=utf-8")

    stream_payload = {
        "message": message,
        "history": payload.history,
        "model_key": payload.model_key or "demo",
    }
    return StreamingResponse(
        llm_dialog_stream_function(stream_payload),
        media_type="text/plain; charset=utf-8",
    )
