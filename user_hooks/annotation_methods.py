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
