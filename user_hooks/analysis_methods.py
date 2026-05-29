from __future__ import annotations

import random


def list_analysis_methods() -> dict:
    """暴露给前端“分析方法”下拉框。

    新增分析方法时：
    1. 在这里加一个配置项。
    2. `method_name` 写下面真实函数名。
    3. 函数签名固定为 `(row_data: dict, model_result: dict, context: dict) -> dict`。

    `row_data` 是当前行完整数据，包含原始导入列，以及 row_id、row_index、状态、
    model_result、rendered_prompt。只想读取原始导入数据时，使用 `context["raw_data"]`。
    """
    return {
        "default": {
            "name": "默认分析",
            "method_name": "default_analysis",
            "description": "Mock 行分析，返回风险、置信度和建议。",
        },
        "compare_answers": {
            "name": "答案对比分析",
            "method_name": "compare_answer_analysis",
            "description": "对比人工答案和模型答案，输出差异说明。",
        },
        "prompt_trace": {
            "name": "Prompt 追踪分析",
            "method_name": "prompt_trace_analysis",
            "description": "查看模型结果和关键输入字段，适合排查 Prompt 问题。",
        },
    }


def default_analysis(row_data: dict, model_result: dict, context: dict) -> dict:
    return {
        "analysis_id": f"mock_analysis_{random.randint(1000, 9999)}",
        "risk_level": random.choice(["low", "medium", "high"]),
        "confidence": round(random.uniform(0.72, 0.98), 2),
        "reason": "Mock 分析结果，用于验证分析抽屉展示字典数据。",
        "suggestion": "正式环境请在 user_hooks/analysis_methods.py 中接入真实分析方法。",
    }


def compare_answer_analysis(row_data: dict, model_result: dict, context: dict) -> dict:
    field_mapping = context.get("field_mapping", {})
    human_column = field_mapping.get("human_answer_column") or ""
    model_column = field_mapping.get("model_answer_column") or ""
    human_answer = row_data.get(human_column, "")
    model_answer = model_result.get(model_column, row_data.get(model_column, ""))
    return {
        "分析类型": "答案对比",
        "人工答案列": human_column,
        "人工答案": human_answer,
        "标注答案列": model_column,
        "标注答案": model_answer,
        "是否一致": human_answer == model_answer,
        "建议": "重点查看人工答案与标注答案不一致的字段上下文。",
    }


def prompt_trace_analysis(row_data: dict, model_result: dict, context: dict) -> dict:
    rendered_prompt = context.get("rendered_prompt") or {}
    return {
        "分析类型": "Prompt追踪",
        "行ID": context.get("row_id", ""),
        "方案ID": context.get("scheme_id", ""),
        "输入字段数量": len(row_data),
        "模型返回字段": list((model_result or {}).keys()),
        "渲染Prompt角色": list(rendered_prompt.keys()) if isinstance(rendered_prompt, dict) else [],
        "建议": "检查 Prompt 角色、模型返回字段和字段映射是否保持一致。",
    }
