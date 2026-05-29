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

## 用户扩展

业务开发人员在根目录 `user_hooks.py` 中实现内部模型调用：

- `list_models()`
- `call_model(model_key, prompts, context)`
- `build_prompt(template, row_data, knowledge, error_examples)`
- `build_prompts_custom(prompt_contents, knowledge, error_sets, field_mapping, row_data, context)`
- `analyze_row(row_data, model_result)`

Prompt 占位符统一使用 `[[...]]`：

```text
工单名称：[[row.工单名称]]
知识库：[[knowledge]]

请严格返回 JSON：
{
  "GPT4_标注": "是/否",
  "原因": "..."
}
```

自定义 Prompt 初始化建议复用 `user_hooks.py` 中的 `render_prompt_template(...)`，避免用 `str.format()` 处理整段 Prompt。这样 JSON 大括号可以原样保留。

初始化后的 Prompt 会统一传给标注方法，结构如下：

```python
{
    "质检员": {
        "prompt_id": "prompt_xxx",
        "name": "情感分类 Prompt",
        "role_name": "质检员",
        "content": "替换后的 Prompt 正文"
    }
}
```
