from __future__ import annotations

import json
import time


def llm_chat_function(prompt: dict) -> dict:
    """单 Prompt 大模型调用入口。

    开发人员主要改这个方法。

    入参只有一个 `prompt` 字典，常用字段：
    - `prompt["content"]`：已经初始化好的 Prompt 正文。
    - `prompt["name"]`：Prompt 名称。
    - `prompt["role_name"]`：角色名。
    - `prompt["context"]`：系统附带上下文，包含 row_data、field_mapping、dataset_id、scheme_id 等。

    返回要求：
    - 必须返回 dict。
    - dict 必须包含字段映射中的“标注答案列”。

    正式接入示例：
    response_text = your_llm_client.chat(prompt["content"])
    return json.loads(response_text)
    """
    time.sleep(2)
    context = prompt.get("context", {})
    field_mapping = context.get("field_mapping", {})
    row_data = context.get("row_data", {})
    row_index = int(context.get("row_index") or row_data.get("row_index") or 0)
    model_column = field_mapping.get("model_answer_column") or "GPT4_标注"
    role_name = prompt.get("role_name") or context.get("prompt_role") or "default"
    model_value = "是" if row_index % 2 == 0 else "否"
    return {
        model_column: model_value,
        "角色名": role_name,
        "置信度": 0.86,
        "模型说明": "Mock 单 Prompt 返回结果，正式环境请替换 user_hooks/llm_chat.py 中的 llm_chat_function。",
        "raw_output": json.dumps(
            {
                "name": prompt.get("name"),
                "role_name": role_name,
                "content": prompt.get("content", ""),
            },
            ensure_ascii=False,
        )[:500],
    }
