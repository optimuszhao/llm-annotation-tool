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
├── user_hooks.py
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

业务开发人员只需要改根目录的 `user_hooks.py`。前端创建标注方案时会读取这里暴露的方法，标注任务运行时也会调用这里的代码。

常用扩展点：

- `list_scheme_methods()`：把可选的标注方案方法暴露给前端下拉框。
- `list_prompt_init_methods()`：把可选的自定义 Prompt 初始化方法暴露给前端下拉框。
- `build_prompts_custom(...)`：自定义处理多个 Prompt、知识库、错题集和行数据，返回初始化后的 Prompt 字典。
- `call_model(...)` 或你自己注册的方法：接收初始化后的 Prompt 字典，调用公司内部模型服务，返回标注结果 `dict`。
- `analyze_row(...)`：实现 FP/FN 等数据行的分析逻辑。

### Prompt 占位符规则

系统推荐使用 `[[...]]` 作为占位符：

```text
工单名称：[[row.工单名称]]
API 内容：[[row.API Part 1]]
知识库：[[knowledge]]
错题集：[[error_sets]]

请严格返回 JSON：
{
  "GPT4_标注": "是/否",
  "原因": "..."
}
```

`[[row.列名]]` 会读取当前行数据，`[[knowledge]]` 会合并当前方案选择的知识库，`[[error_sets]]` 会合并当前方案选择的错题集。

Prompt 里可以直接写 JSON 示例的大括号 `{}`。推荐复用 `render_prompt_template(...)` 处理占位符，整段 Prompt 使用 `str.format()` 容易和 JSON 大括号冲突。

### 为什么需要自定义 Prompt 初始化

自动替换适合简单场景：把 `[[row.列名]]`、`[[knowledge]]`、`[[error_sets]]` 替换成文本后直接调用模型。

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

在 `list_prompt_init_methods()` 中注册方法名：

```python
def list_prompt_init_methods(self) -> dict:
    return {
        "custom_default": {
            "name": "自定义 Prompt 初始化",
            "method_name": "build_prompts_custom",
            "description": "按角色初始化多个 Prompt。",
        }
    }
```

实现 `build_prompts_custom(...)`。入参里包含前端方案选择的所有 Prompt、知识库、错题集、字段映射和当前行数据。

返回结构必须是 `{角色名: Prompt对象}`：

```python
def build_prompts_custom(
    self,
    prompt_contents: list,
    knowledge: list,
    error_sets: list,
    field_mapping: dict,
    row_data: dict,
    context: dict,
) -> dict:
    rendered_prompts = {}

    for prompt in prompt_contents:
        role_name = prompt.get("role_name") or prompt.get("name") or "default"
        content = self.render_prompt_template(
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

### 自定义标注方案方法

在 `list_scheme_methods()` 中注册方法名。前端创建方案时会在“后台方法名”下拉框里选择这里的 `method_name`。

```python
def list_scheme_methods(self) -> dict:
    return {
        "company_main": {
            "name": "公司主标注方案",
            "method_name": "company_annotation",
            "description": "调用公司内部模型服务。",
        }
    }
```

实现对应的标注方法。方法签名固定为：

```python
def company_annotation(self, model_key: str, prompts: dict, context: dict) -> dict:
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
