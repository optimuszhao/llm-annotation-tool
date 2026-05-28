from __future__ import annotations


class UserHooks:
    """业务开发人员在这里接入公司内部模型服务。"""

    def list_models(self) -> dict:
        return {
            "demo": {
                "name": "Demo Model",
                "description": "本地占位模型，正式环境请替换为内部模型。",
            }
        }

    def call_model(self, model_key: str, prompt: str, context: dict) -> dict:
        return {
            "model_key": model_key,
            "label": "未实现",
            "raw_output": "",
            "context": context,
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

    def analyze_row(self, row_data: dict, model_result: dict) -> dict:
        return {
            "row_data": row_data,
            "model_result": model_result,
            "analysis": "未实现",
        }


hooks = UserHooks()
