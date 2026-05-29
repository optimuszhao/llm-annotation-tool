from __future__ import annotations

import json
import random
import re
import time


PROMPT_PLACEHOLDER_PATTERN = re.compile(r"\[\[\s*([^\[\]]+?)\s*\]\]")


class UserHooks:
    """业务开发人员在这里接入公司内部模型服务。

    常用改造点：
    1. `build_prompts_custom(...)`：把前端选中的多个 Prompt 初始化成 `{角色名: Prompt对象}`。
    2. `call_model(...)` 或 `example_annotation_by_role_prompts(...)`：调用你的模型服务并返回 dict。
    3. `analyze_row(...)`：实现 FP/FN 行的分析逻辑。
    """

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
            "example_by_role": {
                "name": "示例：按角色 Prompt 标注",
                "method_name": "example_annotation_by_role_prompts",
                "description": "演示如何读取 {角色名: Prompt对象} 并返回标注结果，方便复制改造。",
            },
        }

    def list_prompt_init_methods(self) -> dict:
        return {
            "custom_default": {
                "name": "自定义 Prompt 初始化",
                "method_name": "build_prompts_custom",
                "description": "接收 Prompt、知识库、错题集、字段映射和当前行数据，返回 {角色名: Prompt对象}。",
            }
        }

    def call_model(self, model_key: str, prompts: dict, context: dict) -> dict:
        """标注方法入口。

        你需要在正式环境改这个方法，调用公司内部大模型服务。

        参数说明：
        - model_key：前端方案里选择的模型标识。
        - prompts：已经初始化完成的 Prompt 字典，结构是 `{角色名: Prompt对象}`。
          例：`prompts["质检员"]["content"]` 可以拿到质检员 Prompt 正文。
        - context：任务上下文，包含 dataset_id、scheme_id、row_id、row_data、field_mapping 等。

        返回要求：
        - 必须返回 dict。
        - dict 里必须包含字段映射配置中的“标注答案列”，例如 `{"GPT4_标注": "是"}`。
        """
        return self.mock_model_call(model_key, prompts, context)

    def mock_model_call(self, model_key: str, prompts: dict, context: dict) -> dict:
        """Mock 大模型调用。

        TODO: 正式环境在这里替换为公司内部模型服务请求。
        当前逻辑：
        1. 等待 10 秒，模拟网络和模型推理耗时。
        2. 从 field_mapping.model_answer_column 读取必须返回的标注答案列。
        3. 默认返回人工答案列的值；偶数行会返回相同值，奇数行会返回一个模拟差异值，便于测试 TP/FP。

        prompts 示例：
        {
            "质检员": {
                "prompt_id": "prompt_xxx",
                "name": "情感分类 Prompt",
                "role_name": "质检员",
                "content": "替换后的 Prompt 正文"
            }
        }
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
            "raw_output": json.dumps(prompts, ensure_ascii=False)[:500],
        }

    def example_annotation_by_role_prompts(self, model_key: str, prompts: dict, context: dict) -> dict:
        """示例：按角色读取 Prompt 并返回标注结果。

        这个方法可以直接复制后改造成真实模型调用。

        你通常会做三件事：
        1. 从 `prompts` 中按角色名取 Prompt，例如 `prompts["质检员"]["content"]`。
        2. 把这些 Prompt 组装成公司内部模型接口需要的 messages。
        3. 解析模型返回 JSON，并确保返回 dict 中包含“标注答案列”。

        prompts 入参示例：
        {
            "质检员": {
                "prompt_id": "prompt_xxx",
                "name": "情感分类 Prompt",
                "role_name": "质检员",
                "content": "替换后的 Prompt 正文"
            },
            "复核员": {
                "prompt_id": "prompt_yyy",
                "name": "复核 Prompt",
                "role_name": "复核员",
                "content": "替换后的 Prompt 正文"
            }
        }

        真实接入时可以参考下面的伪代码：

        messages = [
            {"role": "system", "content": prompts["质检员"]["content"]},
            {"role": "user", "content": prompts["复核员"]["content"]},
        ]
        response_text = your_llm_client.chat(model=model_key, messages=messages)
        model_result = json.loads(response_text)
        return model_result
        """
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

    def build_prompt(
        self,
        template: str,
        row_data: dict,
        knowledge: list,
        error_examples: list,
    ) -> str:
        """按 [[...]] 规则渲染单段 Prompt。

        推荐占位符：
        - [[row.工单名称]]
        - [[row.API Part 1]]
        - [[knowledge]]
        - [[error_sets]]

        Prompt 中的 JSON 返回格式可以直接写 `{ "字段": "值" }`。
        避免用 str.format() 处理整段 Prompt，因为 JSON 大括号会和 `{name}` 占位符冲突。
        """
        return self.render_prompt_template(
            template,
            row_data=row_data,
            knowledge=knowledge,
            error_sets=error_examples,
        )

    def build_prompts_custom(
        self,
        prompt_contents: list,
        knowledge: list,
        error_sets: list,
        field_mapping: dict,
        row_data: dict,
        context: dict,
    ) -> dict:
        """自定义 Prompt 初始化。

        系统选择“自定义处理”时会调用这个方法。

        输入说明：
        - prompt_contents：方案中选择的所有 Prompt 列表。每个对象包含 id、name、role_name、content。
        - knowledge：方案中选择的知识库列表。
        - error_sets：方案中选择的错题集列表。
        - field_mapping：字段映射配置。
        - row_data：当前正在标注的数据行。
        - context：任务上下文，包含 dataset_id、scheme_id、row_id、row_index 等。

        返回要求：
        - 返回 dict。
        - Key 是角色名 role_name。
        - Value 是替换后的 Prompt 对象，必须包含 content。

        返回示例：
        {
            "质检员": {
                "prompt_id": "prompt_xxx",
                "name": "情感分类 Prompt",
                "role_name": "质检员",
                "content": "替换后的 Prompt 正文"
            }
        }

        推荐写法：
        1. 使用 `self.render_prompt_template(...)` 替换 `[[...]]` 占位符。
        2. JSON 返回示例直接写 `{}`，无需写成 `{{}}`。
        3. 需要额外变量时，通过 `extra_context` 注入，例如 `[[scheme_name]]`。

        Prompt 示例：

        请判断工单：
        工单名称：[[row.工单名称]]
        知识库：[[knowledge]]

        请严格返回 JSON：
        {
          "GPT4_标注": "是/否",
          "原因": "..."
        }
        """
        extra_context = {
            "field_mapping": field_mapping,
            "context": context,
        }
        rendered_prompts = {}
        for prompt in prompt_contents:
            rendered = self.render_prompt_template(
                prompt.get("content", ""),
                row_data=row_data,
                knowledge=knowledge,
                error_sets=error_sets,
                extra_context=extra_context,
            )
            role_name = prompt.get("role_name") or prompt.get("name") or prompt.get("id") or "default"
            rendered_prompts[role_name] = {
                "prompt_id": prompt.get("id", ""),
                "name": prompt.get("name", role_name),
                "role_name": role_name,
                "content": rendered,
            }
        return rendered_prompts

    def build_prompt_custom(
        self,
        prompt_contents: list,
        knowledge: list,
        error_sets: list,
        field_mapping: dict,
        row_data: dict,
        context: dict,
    ) -> dict:
        """旧方法名兼容。

        已有方案如果还配置了 `build_prompt_custom`，会继续走这里。
        新方案建议选择 `build_prompts_custom`。
        """
        return self.build_prompts_custom(prompt_contents, knowledge, error_sets, field_mapping, row_data, context)

    def render_prompt_template(
        self,
        template: str,
        row_data: dict,
        knowledge: list = None,
        error_sets: list = None,
        extra_context: dict = None,
    ) -> str:
        """安全替换 Prompt 中的 `[[...]]` 占位符。

        这个方法不会处理单大括号 `{}`，因此 Prompt 可以直接包含 JSON 示例。
        未识别的占位符会原样保留，便于调试。
        """
        knowledge_text = self.join_knowledge(knowledge or [])
        error_text = self.join_error_sets(error_sets or [])
        extra_context = extra_context or {}

        def resolve_placeholder(match: re.Match) -> str:
            key = match.group(1).strip()
            if key in {"knowledge", "知识库"}:
                return knowledge_text
            if key in {"error_sets", "error_set", "错题集"}:
                return error_text
            if key.startswith("row."):
                column = key[4:].strip()
                return self.stringify_prompt_value(row_data.get(column, ""))
            if key in extra_context:
                return self.stringify_prompt_value(extra_context[key])
            return match.group(0)

        return PROMPT_PLACEHOLDER_PATTERN.sub(resolve_placeholder, template or "")

    def join_knowledge(self, knowledge: list) -> str:
        return "\n\n".join(
            item.get("content", "") if isinstance(item, dict) else str(item)
            for item in knowledge
        )

    def join_error_sets(self, error_sets: list) -> str:
        return "\n\n".join(
            f"{item.get('name', '')}\n{item.get('description', '')}".strip()
            if isinstance(item, dict)
            else str(item)
            for item in error_sets
        )

    def stringify_prompt_value(self, value) -> str:
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, indent=2)
        return str(value)

    def analyze_row(self, row_data: dict, model_result: dict) -> dict:
        return {
            "analysis_id": f"mock_analysis_{random.randint(1000, 9999)}",
            "risk_level": random.choice(["low", "medium", "high"]),
            "confidence": round(random.uniform(0.72, 0.98), 2),
            "reason": "Mock 分析结果，用于验证分析弹窗展示字典数据。",
            "suggestion": "正式环境请在 user_hooks.py 中接入真实分析方法。",
        }


hooks = UserHooks()
