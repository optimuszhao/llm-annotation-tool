from __future__ import annotations

import json
import re


PROMPT_PLACEHOLDER_PATTERN = re.compile(r"｛\s*([^｛｝]+?)\s*｝")


def render_prompt_template(
    template: str,
    row_data: dict,
    knowledge: list | dict | None = None,
    error_sets: list | dict | None = None,
    extra_context: dict | None = None,
) -> str:
    """安全替换 Prompt 中的 `｛...｝` 占位符。

    推荐写法：
    - `｛row.工单名称｝`：读取当前行字段。
    - `｛knowledge.知识名称｝`：读取指定知识库。
    - `｛error_sets.fewshots样例名称｝`：读取指定fewshots样例。
    - `｛knowledge｝` / `｛error_sets｝`：读取方案关联的全部资源。
    - `｛root_cause_baselines.正例｝` / `｛root_cause_baselines.反例｝`：读取根因分类基线。
    - `｛根因基线.正例｝` / `｛根因基线.反例｝`：中文别名。

    Prompt 里的 JSON 示例和 `{{...}}` 返回格式提示会原样保留。
    """
    knowledge_text = join_knowledge(knowledge or [])
    error_text = join_error_sets(error_sets or [])
    extra_context = extra_context or {}

    def resolve_placeholder(match: re.Match) -> str:
        key = match.group(1).strip()
        if key in {"knowledge", "知识库"}:
            return knowledge_text
        if key in {"error_sets", "error_set", "fewshots样例", "错题集"}:
            return error_text
        knowledge_name = named_resource_placeholder(key, {"knowledge", "知识库"})
        if knowledge_name:
            return lookup_named_resource_text(knowledge or [], knowledge_name, "content")
        error_name = named_resource_placeholder(key, {"error_sets", "error_set", "fewshots样例", "错题集"})
        if error_name:
            return lookup_named_resource_text(error_sets or [], error_name, "description")
        if key.startswith("row."):
            column = key[4:].strip()
            return stringify_prompt_value(row_data.get(column, ""))
        root_cause_name = named_resource_placeholder(key, {"root_cause_baselines", "root_cause_baseline", "根因基线", "根因分类基线"})
        if root_cause_name:
            baselines = root_cause_baselines_from_context(extra_context)
            return "\n".join(baselines.get(normalize_root_cause_baseline_key(root_cause_name), []))
        if key in {"root_cause_baselines", "root_cause_baseline", "根因基线", "根因分类基线"}:
            baselines = root_cause_baselines_from_context(extra_context)
            return stringify_prompt_value(baselines)
        if key in extra_context:
            return stringify_prompt_value(extra_context[key])
        return match.group(0)

    return PROMPT_PLACEHOLDER_PATTERN.sub(resolve_placeholder, template or "")


def join_knowledge(knowledge: list | dict) -> str:
    if isinstance(knowledge, dict):
        return "\n\n".join(stringify_resource_value(item, "content") for item in knowledge.values())
    return "\n\n".join(stringify_resource_value(item, "content") for item in knowledge)


def join_error_sets(error_sets: list | dict) -> str:
    if isinstance(error_sets, dict):
        return "\n\n".join(
            format_error_set_text(name, item)
            for name, item in error_sets.items()
        )
    return "\n\n".join(format_error_set_text("", item) for item in error_sets)


def stringify_resource_value(value, field: str) -> str:
    if isinstance(value, dict):
        return str(value.get(field) or value.get("content") or value.get("description") or "")
    return str(value)


def format_error_set_text(name: str, value) -> str:
    if isinstance(value, dict):
        item_name = value.get("name") or name
        return f"{item_name}\n{value.get('description') or value.get('content') or ''}".strip()
    return f"{name}\n{value}".strip() if name else str(value)


def stringify_prompt_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return str(value)


def root_cause_baselines_from_context(extra_context: dict | None) -> dict:
    extra_context = extra_context or {}
    context = extra_context.get("context") if isinstance(extra_context.get("context"), dict) else {}
    value = extra_context.get("root_cause_baselines") or context.get("root_cause_baselines") or {}
    return {
        "正例": list(value.get("正例") or value.get("positive") or []),
        "反例": list(value.get("反例") or value.get("negative") or []),
    }


def normalize_root_cause_baseline_key(value: str) -> str:
    text = str(value or "").strip().lower()
    return "反例" if text in {"negative", "neg", "false", "no", "反例", "负例", "否"} else "正例"


def named_resource_placeholder(key: str, prefixes: set) -> str:
    for prefix in prefixes:
        for separator in (".", ":", "："):
            token = f"{prefix}{separator}"
            if key.startswith(token):
                return key[len(token):].strip()
    return ""


def lookup_named_resource_text(items: list | dict, name: str, field: str) -> str:
    if isinstance(items, dict):
        for key, item in items.items():
            if name not in {str(key), str(item.get("name", "")) if isinstance(item, dict) else ""}:
                continue
            if field == "description":
                return format_error_set_text(str(key), item)
            return stringify_resource_value(item, field)
        return ""
    for item in items:
        if not isinstance(item, dict):
            continue
        if name in {str(item.get("name", "")), str(item.get("id", ""))}:
            if field == "description":
                return f"{item.get('name', '')}\n{item.get('description', '')}".strip()
            return str(item.get(field, ""))
    return ""


def is_yes_answer(value) -> bool:
    text = str(value or "").strip().lower()
    if text.startswith("mock_"):
        text = text[5:]
    normalized = "".join(text.split())
    return normalized in {"1", "true", "yes", "y", "positive", "pos", "是", "有", "正", "正例", "阳性", "命中"}
