from __future__ import annotations

from . import analysis_methods, annotation_methods, prompt_init_methods
from .llm_chat import llm_chat_function
from .prompt_utils import (
    is_yes_answer,
    join_error_sets,
    join_knowledge,
    lookup_named_resource_text,
    named_resource_placeholder,
    render_prompt_template,
    stringify_prompt_value,
)


class UserHooks:
    """业务开发人员扩展入口。

    入口分为四类：
    1. `llm_chat.py`：默认标注方法使用的单 Prompt 大模型调用函数 `llm_chat_function(prompt) -> dict`。
    2. `annotation_methods.py`：自定义标注方法，可以写多个。
    3. `prompt_init_methods.py`：自定义 Prompt 初始化方法。
    4. `analysis_methods.py`：自定义分析方法，可以写多个。
    """

    render_prompt_template = staticmethod(render_prompt_template)
    join_knowledge = staticmethod(join_knowledge)
    join_error_sets = staticmethod(join_error_sets)
    stringify_prompt_value = staticmethod(stringify_prompt_value)
    named_resource_placeholder = staticmethod(named_resource_placeholder)
    lookup_named_resource_text = staticmethod(lookup_named_resource_text)
    is_yes_answer = staticmethod(is_yes_answer)

    def list_models(self) -> dict:
        return {
            "demo": {
                "name": "Demo Model",
                "description": "本地占位模型，正式环境请替换为内部模型。",
            }
        }

    def list_scheme_methods(self) -> dict:
        return annotation_methods.list_annotation_methods()

    def list_prompt_init_methods(self) -> dict:
        return prompt_init_methods.list_prompt_init_methods()

    def list_analysis_methods(self) -> dict:
        return analysis_methods.list_analysis_methods()

    def call_model(self, model_key: str, prompts: dict, context: dict) -> dict:
        """默认标注方法。

        多个 Prompt 会逐个调用 `llm_chat_function(prompt)`。
        聚合规则：所有角色的标注答案都是“是”，最终标注答案为“是”；任一角色为“否”，最终为“否”。
        """
        field_mapping = context.get("field_mapping", {})
        model_column = field_mapping.get("model_answer_column") or "GPT4_标注"
        role_results = {}
        role_answers = {}

        for role_name, prompt in (prompts or {}).items():
            prompt_context = {
                **context,
                "prompt_role": role_name,
                "prompt": prompt,
            }
            result = self.call_model_with_prompt(model_key, prompt, prompt_context)
            if not isinstance(result, dict):
                raise ValueError(f"{role_name} 的标注方法必须返回 dict")
            if model_column not in result:
                raise ValueError(f"{role_name} 的标注结果缺少字段：{model_column}")
            role_results[role_name] = result
            role_answers[role_name] = result.get(model_column)

        if not role_results:
            raise ValueError("当前方案未选择 Prompt")

        final_answer = "是" if all(is_yes_answer(value) for value in role_answers.values()) else "否"
        return {
            model_column: final_answer,
            "角色标注答案": role_answers,
            "角色标注结果": role_results,
            "Prompt数量": len(role_results),
            "模型说明": "默认标注方案已按角色逐个调用模型，并按全员为是规则聚合标注答案。",
        }

    def call_model_with_prompt(self, model_key: str, prompt: dict, context: dict) -> dict:
        """单个 Prompt 调用入口，默认转发给 `llm_chat_function(prompt)`。"""
        payload = {
            **(prompt or {}),
            "model_key": model_key,
            "context": context,
        }
        return llm_chat_function(payload)

    def run_analysis_method(self, method_name: str, row_data: dict, model_result: dict, context: dict) -> dict:
        method_name = method_name or "default_analysis"
        method = getattr(analysis_methods, method_name, None)
        if not method:
            raise ValueError(f"分析方法不存在：{method_name}")
        result = method(row_data, model_result, context)
        if not isinstance(result, dict):
            raise ValueError(f"分析方法 {method_name} 必须返回 dict")
        return result

    def analyze_row(self, row_data: dict, model_result: dict) -> dict:
        """旧分析入口兼容。"""
        return self.run_analysis_method("default_analysis", row_data, model_result, {})

    def __getattr__(self, name: str):
        for module in (annotation_methods, prompt_init_methods, analysis_methods):
            method = getattr(module, name, None)
            if method:
                return method
        raise AttributeError(name)


hooks = UserHooks()
