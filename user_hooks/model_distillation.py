from __future__ import annotations

from typing import Any


class ModelDistillationHooks:
    """模型蒸馏扩展入口。

    这个类用于把多行标注数据提炼成可复用知识。系统会把用户在标注工作台
    多选的行一次性传入蒸馏方法，蒸馏方法只执行一次，并返回一个 list。

    返回格式固定为：
    [
        {"知识名称 A": "知识内容 A"},
        {"知识名称 B": "知识内容 B"},
    ]

    每个 dict 建议只放一个 key/value，前端会把 key 当作知识名称，value 当作知识内容。
    用户人工勾选后，系统会把这些结果快速写入当前场景的知识库。
    """

    def list_methods(self) -> dict[str, dict[str, str]]:
        """暴露给前端“模型蒸馏方法”下拉框。

        新增方法步骤：
        1. 在这里添加一个配置项。
        2. `method_name` 写本类里的真实方法名。
        3. 新方法签名固定为 `(rows: list[dict], context: dict) -> list[dict]`。
        """
        return {
            "mock_distill": {
                "name": "示例蒸馏",
                "method_name": "mock_distill",
                "description": "从选中行里提炼示例知识，正式环境请替换为真实蒸馏逻辑。",
            },
            "answer_gap_distill": {
                "name": "答案差异蒸馏",
                "method_name": "answer_gap_distill",
                "description": "演示如何读取人工答案、标注答案和原始行数据，提炼可沉淀的知识。",
            },
        }

    def run(self, method_name: str, rows: list[dict], context: dict) -> list[dict]:
        method_name = method_name or "mock_distill"
        method = getattr(self, method_name, None)
        if not method:
            raise ValueError(f"模型蒸馏方法不存在：{method_name}")
        result = method(rows, context)
        if not isinstance(result, list):
            raise ValueError(f"模型蒸馏方法 {method_name} 必须返回 list")
        return result

    def mock_distill(self, rows: list[dict], context: dict) -> list[dict]:
        """示例蒸馏方法。

        `rows` 中每一项包含：
        - `row_id`：行 ID。
        - `row_index`：序号。
        - `raw_data`：Excel 原始完整行数据。
        - `model_result`：该行当前方案下的最新标注结果；没有方案时读取行上的最新标注结果。
        - `status`：当前行标注状态。

        `context` 中常用字段：
        - `dataset_id`、`scene_id`、`scheme_id`
        - `dataset`、`scene`、`scheme`
        - `field_mapping`
        - `selected_count`

        正式接入时，你可以在这里把 rows 组装成 Prompt，只调用一次大模型，
        再把模型返回解析成 `[{"知识名称": "知识内容"}]`。
        """
        selected_count = len(rows)
        sample = rows[0] if rows else {}
        raw_data = sample.get("raw_data") or {}
        model_result = sample.get("model_result") or {}
        return [
            {
                f"蒸馏样例-选中{selected_count}行": (
                    "这是模型蒸馏 Mock 结果。正式环境请在 "
                    "user_hooks/model_distillation.py 中改写 ModelDistillationHooks.mock_distill。\n"
                    f"示例行序号：{sample.get('row_index', '')}\n"
                    f"原始字段数量：{len(raw_data)}\n"
                    f"标注结果字段：{', '.join(model_result.keys()) if isinstance(model_result, dict) else ''}"
                )
            },
            {
                "蒸馏样例-知识沉淀格式": (
                    "返回 list[dict]；每个 dict 的 key 是知识名称，value 是知识内容。"
                    "用户勾选后会写入当前场景知识库。"
                )
            },
        ]

    def answer_gap_distill(self, rows: list[dict], context: dict) -> list[dict]:
        """示例：基于人工答案和标注答案差异沉淀知识。"""
        field_mapping = context.get("field_mapping") or {}
        human_column = field_mapping.get("human_answer_column") or ""
        model_column = field_mapping.get("model_answer_column") or ""
        mismatch_rows: list[dict[str, Any]] = []
        for row in rows:
            raw_data = row.get("raw_data") or {}
            model_result = row.get("model_result") or {}
            human_answer = raw_data.get(human_column, "")
            model_answer = model_result.get(model_column, raw_data.get(model_column, ""))
            if human_answer != model_answer:
                mismatch_rows.append({
                    "row_index": row.get("row_index"),
                    "human_answer": human_answer,
                    "model_answer": model_answer,
                })
        return [
            {
                "答案差异蒸馏-规则样例": (
                    f"本次选中 {len(rows)} 行，发现 {len(mismatch_rows)} 行人工答案与标注答案不一致。\n"
                    f"人工答案列：{human_column or '未配置'}\n"
                    f"标注答案列：{model_column or '未配置'}\n"
                    "建议结合这些差异行补充知识库规则，用于后续 Prompt 初始化。"
                )
            }
        ]


model_distillation_hooks = ModelDistillationHooks()
