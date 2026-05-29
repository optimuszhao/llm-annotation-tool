from __future__ import annotations

from .prompt_utils import render_prompt_template


def list_prompt_init_methods() -> dict:
    """暴露给前端“自定义 Prompt 初始化方法”下拉框。"""
    return {
        "custom_default": {
            "name": "自定义 Prompt 初始化",
            "method_name": "build_prompts_custom",
            "description": "接收 Prompt、知识库、错题集、字段映射和当前行数据，返回 {角色名: Prompt对象}。",
        }
    }


def build_prompts_custom(
    prompt_contents: list,
    knowledge: list,
    error_sets: list,
    field_mapping: dict,
    row_data: dict,
    context: dict,
) -> dict:
    """自定义 Prompt 初始化。

    返回结构必须是 `{角色名: Prompt对象}`。
    """
    extra_context = {
        "field_mapping": field_mapping,
        "context": context,
    }
    rendered_prompts = {}
    for prompt in prompt_contents:
        role_name = prompt.get("role_name") or prompt.get("name") or prompt.get("id") or "default"
        rendered_prompts[role_name] = {
            "prompt_id": prompt.get("id", ""),
            "name": prompt.get("name", role_name),
            "role_name": role_name,
            "content": render_prompt_template(
                prompt.get("content", ""),
                row_data=row_data,
                knowledge=knowledge,
                error_sets=error_sets,
                extra_context=extra_context,
            ),
        }
    return rendered_prompts


def build_prompt_custom(
    prompt_contents: list,
    knowledge: list,
    error_sets: list,
    field_mapping: dict,
    row_data: dict,
    context: dict,
) -> dict:
    """旧方法名兼容。"""
    return build_prompts_custom(prompt_contents, knowledge, error_sets, field_mapping, row_data, context)
