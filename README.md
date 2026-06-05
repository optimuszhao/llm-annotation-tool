# LLM 标注工具

本项目是本地可运行的 LLM 标注工作台，第一阶段实现场景管理、Excel 数据集导入、Prompt/知识库/错题集/方案基础管理，以及标注工作台分页展示导入数据。

## 启动

```bash
python3 run.py
```

打开：

```text
http://127.0.0.1:8000
```

## 目录

```text
.
├── run.py
├── user_hooks/
│   ├── llm_chat.py
│   ├── annotation_methods.py
│   ├── prompt_init_methods.py
│   ├── analysis_methods.py
│   └── prompt_utils.py
├── backend/
├── frontend/
├── design-system/
├── prd-business.md
└── README.md
```

## 前端性能策略

- Excel 数据导入后写入 SQLite。
- 前端只请求当前页数据，默认每页 50 行，最大 200 行。
- 搜索和分页由后端处理。
- 工作台使用 Tabulator 虚拟渲染和远程分页。
- 大字段在表格中显示截断预览。

## 开发人员扩展入口

业务开发人员主要改 `user_hooks/` 包。前端创建标注方案和执行分析时会读取这里暴露的方法，标注任务运行时也会调用这里的代码。

四类扩展点：

- `user_hooks/llm_chat.py`：默认标注方法使用的单 Prompt 大模型调用函数，约定名为 `llm_chat_function(prompt) -> dict`。
- `user_hooks/annotation_methods.py`：自定义标注方法，可以注册多个。
- `user_hooks/prompt_init_methods.py`：自定义 Prompt 初始化方法，可以注册多个。
- `user_hooks/analysis_methods.py`：自定义分析方法，可以注册多个，并在行详情分析页下拉选择。

系统入口仍然是 `from user_hooks import hooks`，后端调用入口保持稳定。

### Prompt 占位符规则

系统使用全角大括号 `｛...｝` 作为占位符：

```text
工单名称：｛row.工单名称｝
API 内容：｛row.API Part 1｝
知识库：｛knowledge｝
错题集：｛error_sets｝

请严格返回 JSON：
{
  "GPT4_标注": "是/否",
  "原因": "..."
}
```

`｛row.列名｝` 会读取当前行数据，`｛knowledge｝` 会合并当前方案选择的知识库，`｛error_sets｝` 会合并当前方案选择的错题集。

Prompt 里可以直接写 JSON 示例的大括号 `{}`，也可以写 `{{xxx}}` 作为返回格式提示。系统只解析全角 `｛...｝`，Python `str.format()` 会把全角大括号当作普通文本处理。

### 为什么需要自定义 Prompt 初始化

自动替换适合简单场景：把 `｛row.列名｝`、`｛knowledge｝`、`｛error_sets｝` 替换成文本后直接调用模型。

自定义 Prompt 初始化适合这些情况：

- 一个方案选择了多个 Prompt，每个 Prompt 对应不同角色，需要分别组织 system/user/reviewer 等消息。
- 知识库、错题集需要按业务规则筛选、排序、裁剪或拼接。
- 行数据里有 JSON、长文本、多字段组合，需要先清洗、格式化、摘要或脱敏。
- 公司内部模型服务要求固定的 messages 结构，需要在调用模型前统一组装。
- Prompt 模板中会写大量 JSON 返回示例，需要稳定避开 `{}` 和模板占位符冲突。

系统调用链如下：

```text
方案选择资源
  -> 初始化 Prompt（auto 或 custom）
  -> 调用标注方法
  -> 标注方法返回 dict
  -> dict 追加渲染到列表，并保存历史任务记录
```

### 自定义 Prompt 初始化方法

在 `user_hooks/prompt_init_methods.py` 的 `list_prompt_init_methods()` 中注册方法名：

```python
def list_prompt_init_methods() -> dict:
    return {
        "custom_default": {
            "name": "自定义 Prompt 初始化",
            "method_name": "build_prompts_custom",
            "description": "按角色初始化多个 Prompt。",
        }
    }
```

实现 `build_prompts_custom(...)`。自定义初始化只接收更方便读取的字典结构，原始资源列表保存在 `context["resource_lists"]`。

入参结构：

- `prompt_contents`：`{角色名: Prompt对象}`
- `knowledge`：`{知识名称: 知识内容}`
- `error_sets`：`{错题集名称: 错题内容}`

返回结构必须是 `{角色名: Prompt对象}`：

```python
from user_hooks.prompt_utils import render_prompt_template


def build_prompts_custom(
    prompt_contents: dict,
    knowledge: dict,
    error_sets: dict,
    field_mapping: dict,
    row_data: dict,
    context: dict,
) -> dict:
    rendered_prompts = {}

    # prompt_contents 可以直接按角色名取，例如：
    # main_prompt = prompt_contents.get("质检员")
    # knowledge 可以直接按知识名称取，例如：
    # rule_text = knowledge.get("故障分类规则", "")
    for role_name, prompt in prompt_contents.items():
        content = render_prompt_template(
            prompt.get("content", ""),
            row_data=row_data,
            knowledge=knowledge,
            error_sets=error_sets,
            extra_context={
                "field_mapping": field_mapping,
                "context": context,
            },
        )
        rendered_prompts[role_name] = {
            "prompt_id": prompt.get("id", ""),
            "name": prompt.get("name", role_name),
            "role_name": role_name,
            "content": content,
        }

    return rendered_prompts
```

需要读取资源 id、排序或其他元数据时使用：

```python
raw_prompts = context["resource_lists"]["prompts"]
raw_knowledge = context["resource_lists"]["knowledge"]
raw_error_sets = context["resource_lists"]["error_sets"]
```

初始化后的 Prompt 会传给标注方法：

```python
{
    "质检员": {
        "prompt_id": "prompt_xxx",
        "name": "情感分类 Prompt",
        "role_name": "质检员",
        "content": "替换后的 Prompt 正文",
    },
    "复核员": {
        "prompt_id": "prompt_yyy",
        "name": "复核 Prompt",
        "role_name": "复核员",
        "content": "替换后的复核 Prompt 正文",
    },
}
```

### 默认大模型调用方法

默认标注方案会逐个调用选中的 Prompt。每个 Prompt 会传给 `llm_chat_function(prompt)`，返回一个 `dict`。

```python
# user_hooks/llm_chat.py
def llm_chat_function(prompt: dict) -> dict:
    context = prompt.get("context", {})
    field_mapping = context.get("field_mapping", {})
    model_answer_column = field_mapping.get("model_answer_column") or "GPT4_标注"

    # TODO: 替换为公司内部模型服务调用。
    # response_text = your_llm_client.chat(prompt["content"])
    # model_result = json.loads(response_text)

    model_result = {
        model_answer_column: "是",
        "原因": "示例返回。",
    }
    return model_result
```

默认聚合规则：

- 每个角色 Prompt 都会调用一次 `llm_chat_function`。
- 每个返回 dict 都必须包含“标注答案列”。
- 所有角色都返回“是”，最终标注答案为“是”。
- 任一角色返回“否”，最终标注答案为“否”。

### 自定义标注方案方法

在 `user_hooks/annotation_methods.py` 的 `list_annotation_methods()` 中注册方法名。前端创建方案时会在“标注方法”下拉框里选择这里的 `method_name`。

```python
def list_annotation_methods() -> dict:
    return {
        "company_main": {
            "name": "公司主标注方案",
            "method_name": "company_annotation",
            "description": "调用公司内部模型服务。",
        }
    }
```

在同一个文件里实现对应方法。方法签名固定为：

```python
def company_annotation(model_key: str, prompts: dict, context: dict) -> dict:
    field_mapping = context.get("field_mapping", {})
    model_answer_column = field_mapping.get("model_answer_column") or "GPT4_标注"

    messages = []
    if "质检员" in prompts:
        messages.append({
            "role": "system",
            "content": prompts["质检员"]["content"],
        })
    if "复核员" in prompts:
        messages.append({
            "role": "user",
            "content": prompts["复核员"]["content"],
        })

    # TODO: 替换为公司内部模型服务调用。
    # response_text = your_llm_client.chat(model=model_key, messages=messages)
    # model_result = json.loads(response_text)

    model_result = {
        model_answer_column: "是",
        "原因": "示例返回，正式环境请替换为真实模型结果。",
        "置信度": 0.86,
    }

    if model_answer_column not in model_result:
        raise ValueError(f"标注结果缺少字段：{model_answer_column}")

    return model_result
```

返回要求：

- 必须返回 `dict`。
- 返回的 `dict` 必须包含字段映射配置里的“标注答案列”。
- `dict` 中所有 key/value 都会追加渲染到工作台列表。
- 同一行重复标注时，列表展示最近一次结果，历史记录保存在任务明细中。

### 自动替换和自定义处理的选择建议

简单字段替换选“自动替换占位符”。多 Prompt、多角色、复杂字段处理、知识库裁剪、公司内部 messages 格式组装，选“自定义处理”。

### 自定义分析方法

在 `user_hooks/analysis_methods.py` 的 `list_analysis_methods()` 中注册方法。行详情抽屉的“分析”页会展示这些方法，用户可选择任意方法重新分析。

```python
def list_analysis_methods() -> dict:
    return {
        "company_reason": {
            "name": "公司原因分析",
            "method_name": "company_reason_analysis",
            "description": "分析人工答案和模型答案不一致的原因。",
        }
    }


def company_reason_analysis(row_data: dict, model_result: dict, context: dict) -> dict:
    return {
        "原因类型": "Prompt缺少上下文",
        "建议": "补充工单处理过程字段。",
        "相关字段": ["工单名称", "API Part 1"],
    }
```

返回要求：

- 必须返回 `dict`。
- `row_data` 是当前行完整数据，包含原始导入列、`row_id`、`row_index`、状态、最新模型结果和渲染 Prompt。
- 只想读取原始导入数据时，使用 `context["raw_data"]`。
- 多次分析都会写入历史记录。
- 行详情抽屉会按时间倒序展示多个分析结果，可在右侧“显示结果”里选择显示哪些结果。
