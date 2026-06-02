from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter

from user_hooks import hooks


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatPayload(BaseModel):
    message: str
    model_key: str = "demo"


@router.post("")
def chat_with_model(payload: ChatPayload):
    message = payload.message.strip()
    if not message:
        return {"result": {}, "reply": "请输入要发送给大模型的内容。"}

    prompt = {
        "name": "对话大模型",
        "role_name": "用户",
        "content": message,
    }
    context = {
        "source": "chat_page",
        "field_mapping": {
            "model_answer_column": "GPT4_标注",
        },
    }
    result = hooks.call_model(payload.model_key or "demo", {"用户": prompt}, context)
    reply = result.get("模型说明") or result.get("GPT4_标注") or ""
    return {
        "result": result,
        "reply": str(reply),
    }
