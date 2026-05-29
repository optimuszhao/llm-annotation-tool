from __future__ import annotations

import time
import random


class UserHooks:
    """业务开发人员在这里接入公司内部模型服务。"""

    def list_models(self) -> dict:
        return {
            "demo": {
                "name": "Demo Model",
                "description": "本地占位模型，正式环境请替换为内部模型。",
            }
        }

    def list_scheme_methods(self) -> dict:
        return {
            "default": {
                "name": "默认标注方案",
                "method_name": "call_model",
                "description": "调用默认模型方法进行标注。",
            },
            "fault_analysis": {
                "name": "故障分析方案",
                "method_name": "analyze_fault",
                "description": "面向故障根因和工单分析。",
            },
        }

    def list_prompt_init_methods(self) -> dict:
        return {
            "custom_default": {
                "name": "自定义 Prompt 初始化",
                "method_name": "build_prompt_custom",
                "description": "接收 Prompt、知识库、错题集、字段映射和当前行数据，由用户自行拼装最终 Prompt。",
            }
        }

    def call_model(self, model_key: str, prompt: str, context: dict) -> dict:
        return self.mock_model_call(model_key, prompt, context)

    def mock_model_call(self, model_key: str, prompt: str, context: dict) -> dict:
        """Mock 大模型调用。

        TODO: 正式环境在这里替换为公司内部模型服务请求。
        当前逻辑：
        1. 等待 10 秒，模拟网络和模型推理耗时。
        2. 从 field_mapping.model_answer_column 读取必须返回的标注答案列。
        3. 默认返回人工答案列的值；偶数行会返回相同值，奇数行会返回一个模拟差异值，便于测试 TP/FP。
        """
        time.sleep(10)
        field_mapping = context.get("field_mapping", {})
        row_data = context.get("row_data", {})
        row_index = int(context.get("row_index") or row_data.get("row_index") or 0)
        human_column = field_mapping.get("human_answer_column") or ""
        model_column = field_mapping.get("model_answer_column") or "GPT4_标注"
        human_value = row_data.get(human_column, "")
        model_value = human_value if row_index % 2 == 0 else f"mock_{human_value or 'unknown'}"
        return {
            "model_key": model_key,
            model_column: model_value,
            "置信度": 0.86,
            "模型说明": "Mock 返回结果，正式环境请替换 user_hooks.py 中的 mock_model_call。",
            "raw_output": prompt[:500],
        }

    def build_prompt(
        self,
        template: str,
        row_data: dict,
        knowledge: list,
        error_examples: list,
    ) -> str:
        return template.format(
            row_data=row_data,
            knowledge=knowledge,
            error_examples=error_examples,
        )

    def build_prompt_custom(
        self,
        prompt_contents: list,
        knowledge: list,
        error_sets: list,
        field_mapping: dict,
        row_data: dict,
        context: dict,
    ) -> str:
        """自定义 Prompt 初始化。

        TODO: 用户可在这里实现复杂占位符、业务规则、检索和多 Prompt 编排。
        系统选择“自定义处理”时会调用这个方法；选择“自动替换占位符”时由系统完成替换。
        """
        sections = []
        for prompt in prompt_contents:
            sections.append(f"[{prompt.get('role_name', '')}] {prompt.get('name', '')}\n{prompt.get('content', '')}")
        sections.append(f"知识库：{knowledge}")
        sections.append(f"错题集：{error_sets}")
        sections.append(f"字段映射：{field_mapping}")
        sections.append(f"当前行：{row_data}")
        return "\n\n".join(sections)

    def analyze_row(self, row_data: dict, model_result: dict) -> dict:
        return {
            "analysis_id": f"mock_analysis_{random.randint(1000, 9999)}",
            "risk_level": random.choice(["low", "medium", "high"]),
            "confidence": round(random.uniform(0.72, 0.98), 2),
            "reason": "Mock 分析结果，用于验证分析弹窗展示字典数据。",
            "suggestion": "正式环境请在 user_hooks.py 中接入真实分析方法。",
        }


hooks = UserHooks()
