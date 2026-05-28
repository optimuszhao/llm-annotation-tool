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
- `call_model(model_key, prompt, context)`
- `build_prompt(template, row_data, knowledge, error_examples)`
- `analyze_row(row_data, model_result)`
