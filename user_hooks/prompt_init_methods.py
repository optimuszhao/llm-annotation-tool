from __future__ import annotations

from .prompt_utils import render_prompt_template


def list_prompt_init_methods() -> dict:
    """暴露给前端“自定义 Prompt 初始化方法”下拉框。"""
    return {
        "custom_default": {
            "name": "自定义 Prompt 初始化",
            "method_name": "build_prompts_custom",
            "description": "接收 Prompt、知识库、fewshots样例、字段映射和当前行数据，返回 {角色名: Prompt对象}。",
        }
    }


def build_prompts_custom(
    prompt_contents: dict,
    knowledge: dict,
    error_sets: dict,
    field_mapping: dict,
    row_data: dict,
    context: dict,
) -> dict:
    """自定义 Prompt 初始化。

    入参结构：
    - prompt_contents: {角色名: Prompt对象}
    - knowledge: {知识名称: 知识内容}
    - error_sets: {fewshots样例名称: fewshots样例内容}
    - context["root_cause_baselines"]: {"正例": [名称1, 名称2], "反例": [名称1, 名称2]}

    原始资源列表仍保存在 context["resource_lists"]，需要 id、排序等元数据时可以读取。
    返回结构必须是 `{角色名: Prompt对象}`。
    """
    extra_context = {
        "field_mapping": field_mapping,
        "context": context,
        "root_cause_baselines": context.get("root_cause_baselines", {}),
    }
    rendered_prompts = {}
    for role_name, prompt in iter_prompt_items(prompt_contents):
        role_name = prompt.get("role_name") or role_name or prompt.get("name") or prompt.get("id") or "default"
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


def iter_prompt_items(prompt_contents) -> list[tuple[str, dict]]:
    """兼容旧 list 写法，推荐使用新的 {角色名: Prompt对象}。"""
    if isinstance(prompt_contents, dict):
        return [
            (str(role_name), prompt if isinstance(prompt, dict) else {"content": str(prompt)})
            for role_name, prompt in prompt_contents.items()
        ]
    return [
        (
            str(prompt.get("role_name") or prompt.get("name") or prompt.get("id") or "default"),
            prompt,
        )
        for prompt in (prompt_contents or [])
        if isinstance(prompt, dict)
    ]


def build_prompt_custom(
    prompt_contents: dict,
    knowledge: dict,
    error_sets: dict,
    field_mapping: dict,
    row_data: dict,
    context: dict,
) -> dict:
    """旧方法名兼容。"""
    return build_prompts_custom(prompt_contents, knowledge, error_sets, field_mapping, row_data, context)
