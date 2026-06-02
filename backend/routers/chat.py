from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from user_hooks.llm_chat import llm_dialog_stream_function


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatPayload(BaseModel):
    message: str
    model_key: str = "demo"
    history: list[dict] = []


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
