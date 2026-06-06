from __future__ import annotations


def list_annotation_methods() -> dict:
    """暴露给前端“标注方法”下拉框。

    新增自定义标注方法时：
    1. 在这里加一个配置项。
    2. `method_name` 写下面真实函数名。
    3. 函数签名固定为 `(model_key: str, prompts: dict, context: dict) -> dict`。
    """
    return {
        "default": {
            "name": "默认标注方案",
            "method_name": "call_model",
            "description": "逐个调用 user_hooks/llm_chat.py 的 llm_chat_function，再按全员为是规则聚合答案。",
        },
        "fault_analysis": {
            "name": "故障分析方案",
            "method_name": "analyze_fault",
            "description": "示例标注方法，演示如何读取多个角色 Prompt 后返回 dict。",
        },
        "example_by_role": {
            "name": "示例：按角色 Prompt 标注",
            "method_name": "example_annotation_by_role_prompts",
            "description": "演示如何读取 {角色名: Prompt对象}，方便复制改造成公司内部标注方案。",
        },
        "model_market": {
            "name": "模型市场调用",
            "method_name": "call_model_market",
            "description": "预留公共模型市场调用方法，后续由开发人员接入模型市场配置和真实请求。",
        },
    }


def example_annotation_by_role_prompts(model_key: str, prompts: dict, context: dict) -> dict:
    """示例：按角色读取 Prompt 并返回标注结果。"""
    field_mapping = context.get("field_mapping", {})
    row_data = context.get("row_data", {})
    human_column = field_mapping.get("human_answer_column") or ""
    model_column = field_mapping.get("model_answer_column") or "GPT4_标注"
    role_names = list(prompts.keys())
    first_role = role_names[0] if role_names else ""
    first_prompt = prompts.get(first_role, {}) if first_role else {}
    return {
        model_column: row_data.get(human_column, "示例答案"),
        "示例模型": model_key,
        "使用角色": role_names,
        "Prompt数量": len(prompts),
        "首个Prompt预览": str(first_prompt.get("content", ""))[:200],
        "模型说明": "这是按角色 Prompt 字典读取的示例方法，正式环境请替换为真实 LLM 调用。",
    }


def analyze_fault(model_key: str, prompts: dict, context: dict) -> dict:
    """示例：故障类标注方案。

    可以复制这个函数后改造成真实业务方案。
    """
    field_mapping = context.get("field_mapping", {})
    model_column = field_mapping.get("model_answer_column") or "GPT4_标注"
    prompt_names = [prompt.get("name", role) for role, prompt in prompts.items()]
    return {
        model_column: "是",
        "故障分类": "示例故障",
        "使用Prompt": prompt_names,
        "模型说明": "Mock 故障分析方案，正式环境请在 user_hooks/annotation_methods.py 中替换。",
    }


def call_model_market(model_key: str, prompts: dict, context: dict) -> dict:
    """预留：通过模型市场配置调用大模型。

    这个方法用于后续接入“模型市场”配置。当前系统会把渲染后的 Prompt 以
    `{角色名: Prompt对象}` 的形式传入 `prompts`，字段映射、当前行数据等信息在
    `context` 中。等前端方案配置接入模型市场后，可在 `context["model_config"]`
    或 `context["model_market_config"]` 中读取选中的模型 URL、API Key、Model Name。

    推荐实现步骤：
    1. 读取 `context["model_config"]` 中的 URL、API Key、Model Name。
    2. 遍历 `prompts`，对每个角色的 Prompt 调用模型市场公共请求方法。
    3. 将每个模型返回解析成 dict。
    4. 按业务规则聚合出字段映射中的“标注答案列”。
    5. 返回完整 dict，系统会把所有 key 渲染成可配置列表列。
    """
    field_mapping = context.get("field_mapping", {})
    row_data = context.get("row_data", {})
    model_column = field_mapping.get("model_answer_column") or "GPT4_标注"
    human_column = field_mapping.get("human_answer_column") or ""
    model_config = context.get("model_config") or context.get("model_market_config") or {}
    model_config_payload = model_config.get("config") if isinstance(model_config.get("config"), dict) else {}
    model_display_name = (
        model_config_payload.get("Model Name")
        or model_config.get("model_name")
        or model_config.get("name")
        or model_key
        or "未选择模型"
    )
    role_names = list(prompts.keys())
    return {
        model_column: row_data.get(human_column, "是"),
        "模型市场方法": "call_model_market",
        "模型配置名称": model_display_name,
        "使用角色": role_names,
        "Prompt数量": len(prompts),
        "模型说明": "这是模型市场调用占位方法，正式环境请在这里接入真实模型市场请求。",
    }
