# LLM 标注工具 PRD

> 版本：v5.0 · 2026-05-28  
> 当前设计基准：`design-system/MASTER.md`  
> 目标：围绕重数据列表，做一个本地可运行、实时反馈、适合批量标注的高质感工作台

---

## 1. 产品定位

LLM 标注工具是一个面向大模型评测和 Prompt 迭代的本地化工作台。用户导入数据集，配置字段和标注方案，批量调用模型完成标注，并通过 TP/TN/FP/FN、准确率、F1 等指标判断模型表现。

第一阶段核心目标：

- 完成场景、数据集、Prompt、知识库、错题集、标注方案的基础管理
- 支持在场景下导入 Excel 数据集，并在标注工作台展示数据
- 预留用户自定义后台方法和模型调用入口

---

## 2. 页面结构

系统采用单页三步式工作流，顶部导航固定展示当前阶段。

| 步骤 | 页面 | 作用 |
|---|---|---|
| 1 | 开始使用工具 | 引导和介绍页面，不查接口和数据 |
| 2 | 数据集与方案管理 | 管理场景、数据集、Prompt、知识库、错题集、标注方案 |
| 3 | 标注工作台 | 第一阶段只展示已导入数据集的数据 |

三个页面在同一个前端入口内切换。切换时保留当前选中的数据集、方案、筛选条件和任务状态。

---

## 3. 核心工作流

```text
创建场景
  -> 导入数据集
  -> 创建 / 导入 Prompt
  -> 创建 / 导入知识库
  -> 创建标注方案
  -> 进入标注工作台查看数据
```

---

## 4. 开始使用工具

该页面承担轻量引导和产品介绍功能，不调用接口，不展示真实统计数据。

主要内容：

- 产品定位介绍
- 使用步骤提示：创建场景 -> 导入资源 -> 配置方案 -> 查看数据
- 快速入口：进入数据集与方案管理、进入标注工作台

页面要求：

- 不查后端接口
- 不展示真实数据统计
- 不承担复杂配置

---

## 5. 数据集与方案管理

该页面用于完成第一阶段的资源准备工作，核心组织方式是「场景」。数据集、Prompt、知识库、错题集都归属于某个场景。

### 5.1 场景二级 Tab

页面下方设有二级 Tab，用于展示场景名称。

交互规则：

- 初次进入且无场景时，页面提示先添加场景
- 添加第一个场景后，出现第一个场景 Tab
- 场景 Tab 最右侧固定展示加号按钮，用于快捷添加场景
- 切换场景后，下方内容区展示该场景下的资源卡片

场景规则：

- 场景是平铺结构，没有父子层级
- 每个场景独立保存一张数据表，用于存储该场景下导入的数据行
- 每个场景分配唯一 `scene_id`
- 场景名称
- 场景描述
- 创建时间
- 最近更新时间

### 5.2 数据集

在特定场景下，可以上传 N 个数据集。

数据集规则：

- 第一阶段只支持 Excel 文件
- 支持一次导入多个 Excel
- 支持单独导入一个 Excel
- 文件由后端解析并入库
- 每个数据集记录所属 `scene_id`
- 每个场景的数据行写入该场景独立数据表
- 前端只展示数据集摘要和列表

### 5.3 Prompt

Prompt 是用户自定义提示词资源。

Prompt 字段：

- Prompt 名称
- 角色名
- Prompt 内容
- 所属场景
- 创建时间
- 最近更新时间

Prompt 创建方式：

- 手动新增：名称、角色名、内容全部由用户填写
- 批量导入：用户选择多个文件，默认用文件名作为 Prompt 名称；导入时需要分别为每个 Prompt 设置角色名；文件内容作为 Prompt 内容

### 5.4 知识库

知识库本质上是一段用户编辑的文字，用于后续方案引用。

知识库字段：

- 知识名称
- 知识内容
- 所属场景
- 创建时间
- 最近更新时间

知识库创建方式：

- 手动新增 / 编辑
- 从电脑选择文件导入；默认用文件名作为知识名称，文件内容作为知识内容

### 5.5 错题集

错题集用于保存标注过程中沉淀的错误样本。

第一阶段范围：

- 保留错题集资源卡片和基础数据结构
- 支持列表展示和手动管理的接口预留
- 标注工作台“一键添加错题”功能暂不实现

### 5.6 卡片展示与弹窗

场景内容区以卡片形式展示资源：数据集、Prompt、知识库、错题集。

点击资源卡片后，弹出该资源类型的列表弹窗。

列表能力：

- 展示当前场景下的该类资源
- 支持搜索、筛选、排序
- 支持新增、导入、删除
- 点击列表项进入详情

详情能力：

- 查看完整内容
- 编辑基础信息
- 编辑字段映射或模板内容
- 查看关联关系，例如 Prompt 引用了哪些知识库、错题集属于哪个场景

### 5.7 标注方案

标注方案用于配置当前要使用的资源和参数。

核心字段：

- 方案名称
- 所属场景
- Prompt 多选
- 知识库多选
- 错题集多选
- 并发数量
- 调用模型
- 后台方法名
- Prompt 初始化类型：自动替换占位符 / 自定义处理
- Prompt 初始化后台方法名：仅自定义处理时使用

后台方法规则：

- 后台维护一个方案字典
- Key 为方案名
- Value 为对应的后台方法名
- 用户在前端选择方案名后，系统根据 Key 找到后台方法名，并调用对应方案方法

Prompt 初始化规则：

- 自动替换占位符使用方括号语法：`[[row.列名]]`、`[[knowledge]]`、`[[error_sets]]`
- Prompt 中要求模型返回 JSON 时，JSON 示例直接写 `{ "字段": "值" }`，系统只解析 `[[...]]`，不会解析普通大括号
- 旧版简单占位符 `{{row.列名}}`、`{{knowledge}}`、`{{error_sets}}` 临时兼容；新 Prompt 统一使用 `[[...]]`
- 自定义处理会把 Prompt 列表、知识库、错题集、字段映射和当前行数据传给用户实现的方法
- 自动处理和自定义处理都输出同一种结构：`{ 角色名: Prompt对象 }`
- Prompt 对象结构：`prompt_id`、`name`、`role_name`、`content`
- 调用标注方法时，系统会把完整 Prompt 字典传给用户选择的标注方法
- 标注方法最终返回 dict，dict 中必须包含字段映射配置里的“标注答案列”

---

## 6. 标注工作台

标注工作台是核心页面，页面布局和视觉风格以 `design-system/MASTER.md` 为设计基准。

### 6.1 顶部区域

顶部固定包含：

- 产品名
- 三步导航
- 主题切换入口：支持白天/暗黑模式，以及多套主题色预览

顶部导航用于切换工作阶段。当前阶段高亮展示。

### 6.2 指标区

指标区实时展示当前数据集的基础数量、任务状态和标注结果。

指标包括：

- 总数
- 未标注
- 已标注
- 排队中
- 标注中
- TP
- TN
- FP
- FN
- 准确率
- 精确率
- 召回率
- F1
- 特异度
- 误报率

第一版采用“人工答案列”和“标注答案列”的相等判断：相等为 TP，不相等为 FP。FN/TN 暂作预留。

### 6.3 操作条

操作条位于指标区下方。

主要操作：

- 全选当前页
- 批量标注
- 全量标注
- 删除
- 搜索
- 筛选
- 导出
- 列设置
- 停止未完成标注

搜索和筛选走后端查询，前端只刷新当前页数据。

### 6.4 数据列表

数据列表是页面主体，使用 Tabulator 实现。除原始数据列外，模型返回 dict 的所有 key 都会追加为表格列。

默认列：

| 列 | 说明 |
|---|---|
| 选择框 | 支持批量选择 |
| ID | 数据记录唯一标识 |
| 工单名称 | 业务名称 |
| 工单类型 | 工单分类 |
| 工单耗时 | 原始业务耗时 |
| COT名称 | 数据所属任务或链路名称 |
| API Order | 大字段预览 |
| API Part 1 | 大字段预览 |
| API Part 2 | 大字段预览 |
| API Part 3 | 大字段预览 |
| API Part 4 | 大字段预览 |
| API Part 5 | 大字段预览 |
| API Part 6 | 大字段预览 |
| API Part 7 | 大字段预览 |
| Summary | 大字段预览 |
| 标注数据 | 大文本预览 |
| 情感分类 | GT 结果 |
| GPT4_标注 | 外部模型结果 |
| Claude_结果 | 外部模型结果 |
| 状态 | 未标注/排队中/标注中/TP/FP/失败/取消，固定在操作列左侧 |
| 操作 | 固定在最右侧，展示标注、查看、分析、更多；更多菜单包含编辑、导出、删除 |

列表要求：

- 支持横向滚动
- 支持斑马线
- 状态列和操作列共同固定在右侧
- 固定列必须有独立背景色，横向滚动时不能透出底层单元格内容
- 支持分页或远程虚拟滚动
- 支持列宽调整和列显示设置
- `API Order`、`API Part 1-7`、`Summary`、`标注数据` 在表格中只展示截断预览
- 点击行或查看按钮打开详情
- 同一行重复标注时，列表只展示最近一次标注结果
- 历史结果保存在任务行记录中，后续通过“查看”弹窗或历史任务查看

### 6.5 标注结果写回

标注方法返回 dict 后：

- 完整 dict 写入最新标注结果
- dict 所有 key/value 写入当前行最新投影
- 新 key 追加到数据集列结构，前端表格自动显示
- 与已有列重名时更新该列最新值
- “标注答案列”用于与“人工答案列”比较，得到 TP 或 FP

### 6.6 行详情

行详情以弹窗展示。

内容包括：

- 原始字段完整内容
- JSON 字段格式化展示
- 渲染后的 Prompt
- 模型返回结果
- 当前行历史标注记录
- 加入错题集
- 单行重新标注

大字段在打开详情时单独向后端请求。

### 6.7 批量标注任务

用户可以启动全量标注或批量标注。

弹窗内容：

- 当前数据集
- 当前方案
- 将标注的行数
- 并发数
- 是否覆盖已有结果

任务启动后：

- 后端创建任务并进入队列
- 前端通过 SSE 接收进度
- 行状态局部更新
- 指标区实时刷新
- 页面无需刷新
- 用户切换数据集或方案时，后台任务持续运行
- “停止未完成标注”只取消排队中的任务，正在运行的调用自然完成

---

## 7. 数据库设计

数据库使用 SQLite，文件路径建议为 `backend/data/annotation.db`。

### 7.1 scenes

场景表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 场景 ID |
| name | TEXT NOT NULL | 场景名称 |
| description | TEXT | 场景描述 |
| data_table_name | TEXT NOT NULL | 该场景独立数据表名 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 7.2 datasets

数据集表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 数据集 ID |
| scene_id | TEXT NOT NULL | 所属场景 |
| name | TEXT NOT NULL | 数据集名称 |
| file_name | TEXT | 原始文件名 |
| row_count | INTEGER | 行数 |
| column_schema | TEXT | JSON 字符串，保存列名列表和字段类型 |
| created_at | TEXT | 创建时间 |

### 7.3 场景数据表

每个场景单独一张数据表，表名由 `scenes.data_table_name` 记录，例如 `scene_data_spn`。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 数据行 ID |
| dataset_id | TEXT NOT NULL | 来源数据集 |
| row_index | INTEGER | Excel 原始行号 |
| raw_data | TEXT NOT NULL | JSON 字符串，保存整行原始数据 |
| created_at | TEXT | 创建时间 |

说明：

- 第一阶段用 `raw_data` 保存整行，减少动态建列复杂度
- 前端表格列由 `datasets.column_schema` 决定
- 后续如需搜索优化，可增加全文索引或常用字段冗余列

### 7.4 prompts

Prompt 表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Prompt ID |
| scene_id | TEXT NOT NULL | 所属场景 |
| name | TEXT NOT NULL | Prompt 名称 |
| role_name | TEXT NOT NULL | 角色名 |
| content | TEXT NOT NULL | Prompt 内容 |
| source_file | TEXT | 导入文件名 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 7.5 knowledge_items

知识库表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 知识 ID |
| scene_id | TEXT NOT NULL | 所属场景 |
| name | TEXT NOT NULL | 知识名称 |
| content | TEXT NOT NULL | 知识内容 |
| source_file | TEXT | 导入文件名 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 7.6 error_sets

错题集表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 错题集 ID |
| scene_id | TEXT NOT NULL | 所属场景 |
| name | TEXT NOT NULL | 错题集名称 |
| description | TEXT | 描述 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 7.7 schemes

标注方案表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 方案 ID |
| scene_id | TEXT NOT NULL | 所属场景 |
| name | TEXT NOT NULL | 方案名称 |
| model_key | TEXT NOT NULL | 调用模型 |
| method_name | TEXT NOT NULL | 后台方法名 |
| prompt_init_type | TEXT NOT NULL | `auto` / `custom` |
| prompt_init_method_name | TEXT | Prompt 初始化方法名 |
| concurrency | INTEGER | 并发数量 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 7.8 scheme_resources

方案资源关联表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 关联 ID |
| scheme_id | TEXT NOT NULL | 方案 ID |
| resource_type | TEXT NOT NULL | `prompt` / `knowledge` / `error_set` |
| resource_id | TEXT NOT NULL | 资源 ID |
| sort_order | INTEGER | 顺序 |

### 7.9 annotation_tasks

标注任务表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 任务 ID |
| scene_id | TEXT NOT NULL | 场景 ID |
| dataset_id | TEXT NOT NULL | 数据集 ID |
| scheme_id | TEXT NOT NULL | 方案 ID |
| status | TEXT NOT NULL | queued/running/done/stopped/failed |
| total_count | INTEGER | 总行数 |
| queued_count | INTEGER | 排队数 |
| running_count | INTEGER | 运行数 |
| done_count | INTEGER | 完成数 |
| failed_count | INTEGER | 失败数 |
| cancelled_count | INTEGER | 取消数 |
| concurrency | INTEGER | 任务并发数 |

### 7.10 annotation_task_rows

任务行历史表。每次标注都会保留一条记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 任务行 ID |
| task_id | TEXT NOT NULL | 任务 ID |
| row_id | TEXT NOT NULL | 数据行 ID |
| row_index | INTEGER | 原始行号 |
| status | TEXT NOT NULL | 排队中/标注中/TP/FP/失败/取消 |
| model_result | TEXT | 标注方法返回 dict |
| analysis_data | TEXT | 分析方法返回 dict |
| rendered_prompt | TEXT | 初始化后的 Prompt |
| error | TEXT | 错误信息 |

### 7.11 场景数据表新增字段

每个 `scene_data_<scene_id>` 表增加最新标注投影字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| annotation_status | TEXT | 当前行最新状态 |
| annotation_task_id | TEXT | 最近一次任务 ID |
| model_result | TEXT | 最近一次模型返回 dict |
| analysis_data | TEXT | 最近一次分析返回 dict |
| rendered_prompt | TEXT | 最近一次渲染 Prompt |
| updated_at | TEXT | 更新时间 |

---

## 8. 第一阶段实现思路

### 8.1 后端

- `run.py` 启动 FastAPI，并挂载 `frontend/` 静态目录
- 初始化 SQLite 数据库和基础表
- 实现场景 CRUD
- 实现 Excel 数据集导入
- 导入 Excel 时读取表头和每行数据，写入场景独立数据表
- 实现 Prompt 手动新增、单文件/多文件导入
- 实现知识库手动新增、单文件/多文件导入
- 预留错题集基础表和接口
- 实现标注方案 CRUD 和资源关联
- 实现标注任务队列、SSE 推送、结果写回和指标统计
- 实现分析接口，将分析 dict 写入“分析数据”

### 8.2 前端

- 保留三步式单页导航
- 开始使用工具页面只做静态介绍
- 数据集与方案管理页面对接场景、资源卡片、列表弹窗
- 标注工作台接入 Tabulator 展示数据集行
- 标注工作台接入全量/批量标注、SSE 更新、动态结果列和停止排队任务

### 8.3 用户扩展

- `user_hooks.py` 放在项目根目录
- 后台方案字典维护 `方案名 -> 方法名`
- 用户在 `user_hooks.py` 中实现模型调用、Prompt 自定义初始化和分析逻辑
- Mock 阶段默认模型调用延时 3 秒返回 dict

---

## 9. 数据与性能策略

性能策略以“后端处理、前端轻展示”为核心。

- 数据导入后全部写入 SQLite
- 前端只请求当前页或当前可见范围数据
- 搜索、筛选、分页、指标统计由后端完成
- 标注任务在后端队列中运行
- 前端通过 SSE 接收增量事件
- 后端全局并发上限默认 20；每个方案按自己的并发数执行
- 停止任务只取消排队项，运行中的模型调用自然完成
- 大字段只在详情抽屉打开时加载
- 前端不缓存完整数据集

SSE 推送事件示例：

```json
{
  "type": "row_updated",
  "task_id": "task-001",
  "row_id": "row-1024",
  "status": "TP",
  "model_result": "是"
}
```

---

## 10. 技术方案

技术方案保持内网友好，不依赖 Node/npm 构建。

| 层 | 方案 |
|---|---|
| 后端 | Python 3.10+，FastAPI |
| 数据库 | SQLite |
| 任务 | Python threading + queue |
| 实时更新 | Server-Sent Events |
| 前端 | HTML + Tailwind CSS + Tabulator + GSAP + 可选 Vue 3 Global |
| 静态资源 | FastAPI 托管 `frontend/` 和 `vendor/` |

前端依赖全部以本地文件形式放入 `frontend/vendor/`。主数据表使用 Tabulator 实现，页面视觉以设计规范为准。

UI/UX 设计规范沉淀在 `design-system/MASTER.md`。后续页面设计、组件样式、动效和可访问性检查以该文件为准。

### 10.1 工程目录结构

```text
新数据飞轮cc/
├── run.py
├── user_hooks.py
├── README.md
├── prd-business.md
│
├── frontend/
│   ├── index.html
│   ├── assets/
│   │   ├── app.css
│   │   └── app.js
│   ├── pages/
│   │   ├── start.js
│   │   ├── manage.js
│   │   └── workbench.js
│   └── vendor/
│       ├── tabulator.min.js
│       ├── tabulator.min.css
│       └── gsap.min.js
│
├── backend/
│   ├── app.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── routers/
│   │   ├── datasets.py
│   │   ├── prompts.py
│   │   ├── schemes.py
│   │   ├── tasks.py
│   │   └── rows.py
│   ├── services/
│   │   ├── dataset_service.py
│   │   ├── prompt_service.py
│   │   ├── task_service.py
│   │   └── metric_service.py
│   └── data/
│       └── annotation.db
│
└── design-system/
    └── MASTER.md
```

目录职责：

- `run.py`：工程启动入口，负责启动 FastAPI 和前端静态服务
- `user_hooks.py`：用户自定义实现文件，放在项目根目录，便于业务开发人员修改
- `frontend/`：前台页面、样式、页面脚本、本地 vendor 依赖
- `backend/`：后台 API、数据库、任务队列、指标计算、数据解析
- `design-system/`：UI/UX 设计规范
- `prd-business.md`：产品需求文档
- `README.md`：启动方式、依赖说明、用户扩展方法说明

### 10.2 用户扩展点

系统需要预留用户自行实现的方法，统一放在根目录 `user_hooks.py` 中。后端只调用接口，不关心用户内部如何连接模型或处理业务逻辑。

建议接口：

```python
class UserHooks:
    def list_models(self) -> dict:
        """返回可用模型列表。"""
        ...

    def call_model(self, model_key: str, prompts: dict, context: dict) -> dict:
        """调用用户自己的模型服务，返回模型标注结果。"""
        ...

    def mock_model_call(self, model_key: str, prompts: dict, context: dict) -> dict:
        """Mock 大模型调用，延时 3 秒并返回 dict。"""
        ...

    def list_prompt_init_methods(self) -> dict:
        """返回可选 Prompt 初始化方法。"""
        ...

    def build_prompts_custom(
        self,
        prompt_contents: list,
        knowledge: list,
        error_sets: list,
        field_mapping: dict,
        row_data: dict,
        context: dict,
    ) -> dict:
        """自定义 Prompt 初始化，返回 {角色名: Prompt对象}。"""
        ...

    def build_prompt(
        self,
        template: str,
        row_data: dict,
        knowledge: list,
        error_examples: list,
    ) -> str:
        """按 [[...]] 占位符规则构造最终 Prompt，避免和 JSON 大括号冲突。"""
        ...

    def analyze_row(self, row_data: dict, model_result: dict) -> dict:
        """对单行数据和模型结果做扩展分析。"""
        ...
```

---

## 11. 关键对象

### Dataset

```ts
interface Dataset {
  id: string
  name: string
  rowCount: number
  columns: string[]
  mappingDone: boolean
  mapping: {
    gtCol: string
    defaultCols: string[]
    refCols: string[]
    predCol?: string
  }
}
```

### Prompt

```ts
interface Prompt {
  id: string
  name: string
  role: string
  model: string
  template: string
  outputFormat: string
}
```

### Scheme

```ts
interface Scheme {
  id: string
  name: string
  promptIds: string[]
  knowledgeIds: string[]
  errorSetIds: string[]
  concurrency: number
  methodName: string
  promptInitType: "auto" | "custom"
  promptInitMethodName?: string
}
```

### AnnotationTask

```ts
interface AnnotationTask {
  id: string
  datasetId: string
  schemeId: string
  status: "queued" | "running" | "done" | "stopped" | "failed"
  progress: {
    done: number
    total: number
  }
}
```

---

## 12. 当前优先级

第一阶段优先实现：

- 三步式单页导航
- 开始使用工具页面静态介绍
- 场景管理
- Excel 数据集导入
- Prompt 手动新增和批量导入
- 知识库手动新增和文件导入
- 错题集基础结构预留
- 标注方案配置
- 标注工作台展示已导入数据集

第二阶段再实现：

- 批量标注任务
- 真实 TP/TN/FP/FN 和指标计算
- SSE 实时行状态更新
- 行详情抽屉
- 工作台一键加入错题集
- Prompt 版本管理
- 标注历史对比
- 导出报表
- 更复杂的权限和多用户协作
