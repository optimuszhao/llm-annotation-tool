# LLM 标注工具 · 完整业务 PRD

> **文档版本**：v3.0 · 2026-05-28  
> **当前状态**：高保真静态原型已完成，后端开发未开始  
> **接手须知**：本文档是唯一权威来源，读完即可独立继续开发，无需参考其他文档

---

## 目录

1. [项目定位](#1-项目定位)  
2. [技术栈 & 仓库结构](#2-技术栈--仓库结构)  
3. [当前完成状态](#3-当前完成状态)  
4. [菜单 & 页面总览](#4-菜单--页面总览)  
5. [核心数据对象](#5-核心数据对象)  
6. [详细功能规格](#6-详细功能规格)  
7. [UserHooks 规范](#7-userhooks-规范)  
8. [后端 API 规格](#8-后端-api-规格)  
9. [加载动效规范](#9-加载动效规范)  
10. [TP/TN/FP/FN 指标逻辑](#10-tptnfpfn-指标逻辑)  
11. [前后端对接改造要点](#11-前后端对接改造要点)  
12. [术语表](#12-术语表)

---

## 1. 项目定位

**LLM 标注工具**是一个面向大模型开发者的**本地化数据标注 + Prompt 评测闭环系统**。

核心工作流：
```
导入 Excel → 配置 Prompt → 选数据集 + 选方案 → 跑批标注
→ 看 14 项指标 → 错例加入错题集 → 改 Prompt → 再跑 → 提升准确率
```

关键设计原则：
- **纯本地运行**：后端 Python + SQLite，不依赖任何外部云服务
- **用户只写一个文件**：`user_hooks.py`，通过 `models` 字典注册大模型，3 个钩子方法扩展业务逻辑
- **标注答案二值化**：人工答案和模型答案均为 **是/否**，以此计算 TP/TN/FP/FN

---

## 2. 技术栈 & 仓库结构

### 2.1 技术选型

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | 纯 HTML + Tailwind CSS (本地 vendor) + 原生 JS | 无框架，无构建，直接运行 |
| 后端 | Python 3.10+ · FastAPI | REST API |
| 数据库 | SQLite (单文件) | `backend/data/annotation.db` |
| 任务调度 | Python threading + queue | 多并发标注，不依赖 Celery |
| 字体/样式 | 已下载到 `prototype/assets/vendor/` | 完全离线，内网可用 |

### 2.2 仓库结构

```
llm-annotation-tool/
├── prototype/                        # 静态前端原型(已完成)
│   ├── index.html                    # 入口,重定向到 datasets.html
│   ├── pages/                        # 6 个菜单页面
│   │   ├── datasets.html             # 数据集管理
│   │   ├── workbench.html            # 标注工作台(含 3 Tab)
│   │   ├── prompts.html              # Prompt 管理
│   │   ├── knowledge.html            # 知识管理
│   │   ├── error-sets.html           # 错题集管理
│   │   └── models.html               # 模型管理(只读)
│   ├── partials/
│   │   └── sidebar.html              # 共享侧边栏,各页 fetch 注入
│   └── assets/
│       ├── shared.css                # 公共样式(徽章/抽屉/Modal/Toast/JSON高亮)
│       ├── shared.js                 # 公共工具(NX 命名空间)
│       ├── vendor/
│       │   ├── tailwind.js           # Tailwind CDN 本地备份(398K)
│       │   └── fonts/                # Inter + JetBrains Mono 字体文件
│       ├── mock/                     # Mock 数据(9 个模块,接后端时逐一替换)
│       │   ├── scenes.js
│       │   ├── datasets.js
│       │   ├── prompts.js
│       │   ├── schemes.js
│       │   ├── models.js
│       │   ├── knowledge.js
│       │   ├── error-sets.js
│       │   ├── tasks.js
│       │   └── annotation-data.js
│       └── pages/                    # 各页专属 JS(逻辑完整,含所有交互)
│           ├── datasets.js
│           ├── workbench.js          # 最大,含全部工作台逻辑
│           ├── prompts.js
│           ├── knowledge.js
│           ├── error-sets.js
│           └── models.js
│
├── backend/                          # 后端(待开发)
│   ├── main.py                       # FastAPI 入口
│   ├── user_hooks.py                 # 用户唯一需要修改的文件
│   ├── models/                       # SQLAlchemy ORM 模型
│   ├── routers/                      # API 路由(datasets/prompts/schemes/tasks...)
│   ├── services/                     # 业务逻辑(annotation_engine/prompt_renderer...)
│   └── data/                         # SQLite 数据库文件目录
│
├── prd-business.md                   # 本文档
├── nexus-design-system.md            # 视觉设计系统(色彩/字体/组件规范)
└── README.md                         # 运行说明
```

### 2.3 启动方式

**前端原型（已可用，内网离线运行）**：
```bash
cd prototype
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

**后端（待开发）**：
```bash
cd backend
pip install fastapi uvicorn sqlalchemy openpyxl
uvicorn main:app --reload --port 8000
```

---

## 3. 当前完成状态

### ✅ 已完成（前端静态原型）

| 页面/功能 | 关键文件 | 状态 |
|---|---|---|
| 共享侧边栏 | `partials/sidebar.html` | ✅ |
| 公共样式/工具 | `shared.css` + `shared.js` | ✅ |
| 数据集管理（列表+映射弹窗） | `pages/datasets.html` + `assets/pages/datasets.js` | ✅ |
| 标注工作台（指标条+表格+3Tab） | `pages/workbench.html` + `assets/pages/workbench.js` | ✅ |
| 开始标注配置弹窗 | 同上 | ✅ |
| 行详情侧边抽屉（当前+历史） | 同上 | ✅ |
| 加入错题本弹窗 | 同上 | ✅ |
| 分析弹窗（mock UserHooks.analyze） | 同上 | ✅ |
| Prompt 管理（列表+编辑+变量侧栏） | `pages/prompts.html` + `assets/pages/prompts.js` | ✅ |
| 知识管理 | `pages/knowledge.html` + `assets/pages/knowledge.js` | ✅ |
| 错题集管理（双栏+合并） | `pages/error-sets.html` + `assets/pages/error-sets.js` | ✅ |
| 模型管理（只读+测试连通） | `pages/models.html` + `assets/pages/models.js` | ✅ |
| Mock 数据 9 个模块 | `assets/mock/*.js` | ✅ |
| 本地化依赖（无 CDN） | `assets/vendor/` | ✅ |

### ❌ 待开发（后端）

| 功能模块 | 优先级 | 说明 |
|---|---|---|
| FastAPI 应用骨架 | P0 | main.py，CORS，路由注册 |
| SQLite 数据库模型 | P0 | 所有 ORM 实体（见第5节） |
| Excel 导入解析 | P0 | openpyxl 解析，字段映射保存 |
| UserHooks 动态加载 | P0 | 动态 import user_hooks.py，读取 models 字典 |
| Prompt 渲染引擎 | P0 | 占位符替换（auto模式）/ 调用 init_prompt（custom模式） |
| 标注任务调度（多并发） | P0 | threading + queue，行级状态实时更新 |
| SSE 任务进度推送 | P0 | 前端 EventSource 订阅实时进度 |
| 指标实时计算 API | P1 | 基于任务结果动态返回 14 项 |
| 方案 CRUD | P1 | 含 Prompt 关联 |
| 错题集 CRUD | P1 | 与标注结果行关联 |
| 知识库 CRUD | P1 | 内容存储与检索 |
| 数据导出（Excel/JSON） | P2 | 按当前视图导出 |
| 翻译 API | P2 | 调用 UserHooks.translate |

---

## 4. 菜单 & 页面总览

侧边栏 6 个扁平菜单（从上到下，`data-key` 值）：

| # | 菜单名 | `data-key` | 核心功能 |
|---|---|---|---|
| 1 | 数据集管理 | `datasets` | 导入/管理 Excel，配置字段映射 |
| 2 | 标注工作台 ⭐ | `workbench` | 核心页，3个内部 Tab |
| 3 | Prompt 管理 | `prompts` | Prompt 卡片库，两种处理模式 |
| 4 | 知识管理 | `knowledge` | 知识片段库，可插入 Prompt |
| 5 | 错题集管理 | `error-sets` | 错例集合管理，双栏布局 |
| 6 | 模型管理 | `models` | 只读，来源 UserHooks.models |

**场景（Scene）**：不是顶级导航，而是所有资源上的**标签字段**，用于筛选过滤。  
示例值：`SPN` / `IPRAN` / `泰国` / `印尼`  
场景列表存储在 `assets/mock/scenes.js`（`NX.scenes`），后端开发时改为 API 读取。

---

## 5. 核心数据对象

### 5.1 Dataset（数据集）

```typescript
interface Dataset {
  id: string;               // "ds-1"
  name: string;             // "客户反馈_2025Q1.xlsx"
  scene: string;            // "SPN"
  rowCount: number;
  colCount: number;
  mappingDone: boolean;     // 是否完成字段映射
  createdAt: string;        // "2025-04-12"
  columns: string[];        // 原始列名列表（Excel 表头）
  mapping: {
    defaultCols: string[];  // 工作台表格默认显示列
    refCols: string[];      // Prompt 模板中可用 {{列名}} 引用的列
    gtCol: string;          // GT 列名（人工答案列，值为 "是"/"否"）
    predCol: string;        // 预测列名（可选，导入时已有预测值）
  } | null;
}
```

### 5.2 Prompt（Prompt 卡片）

```typescript
interface Prompt {
  id: string;               // "p-1"
  name: string;             // "SPN 情感初审"
  role: string;             // "初审" — 标注结果列名为 "[初审]_gtCol"
  scene: string;
  defaultModel: string;     // 对应 UserHooks.models 的 key
  processingMode: 'auto' | 'custom';
  // auto:   系统自动替换 {{变量}} 占位符
  // custom: 调用 UserHooks.init_prompt(template, row_data, knowledge, error_sets)
  template: string;         // Prompt 模板文本
  outputAdvice: string;     // 输出格式建议（显示在编辑器底部）
  knowledgeIds: string[];   // 引用的知识片段 ID
  errorSetRefs: string[];   // 引用的错题集名称
  createdAt: string;
  updatedAt: string;
}
```

### 5.3 Scheme（方案）

```typescript
interface Scheme {
  id: string;               // "sc-1"
  name: string;             // "双角色情感分类"
  scene: string;
  promptIds: string[];      // 有序 Prompt 列表，每个 Prompt 独立调用一次模型
  concurrency: number;      // 并发数（1-32）
  lastUsed: string;
}
```

### 5.4 AnnotationRow（标注行）

```typescript
interface AnnotationRow {
  id: string;               // "r-1000"
  no: number;               // 序号（行号）
  datasetId: string;
  data: Record<string, string>;          // 原始字段值 {"列名": "值"}
  results: Record<string, string | null>;
  // results 示例:
  // {
  //   "[初审]_情感分类": "是",
  //   "[初审]_thinking": "用户表达正向...",
  //   "[质检]_情感分类": "是",
  //   "[质检]_thinking": "复核一致..."
  // }
  status: 'pending' | 'running' | 'done' | 'failed' | 'partial';
  lastTaskAt: string;
}
```

### 5.5 AnnotationTask（标注任务）

```typescript
interface AnnotationTask {
  id: string;               // "tk-ab12"
  datasetId: string;
  datasetName: string;
  schemeId: string;
  schemeName: string;
  rowIds: string[];         // 本次任务涉及的行 ID
  rowCount: number;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  progress: { done: number; total: number };
  accuracy: number;         // 任务完成后计算
  triggeredAt: string;
  finishedAt: string | null;
  errMsg: string | null;
}
```

### 5.6 Knowledge（知识片段）

```typescript
interface Knowledge {
  id: string;               // "kb-1"
  name: string;             // "SPN 故障处理规范"
  scene: string;
  content: string;          // 知识文本内容
  tags: string[];
  createdAt: string;
}
```

### 5.7 ErrorEntry / ErrorSet

```typescript
interface ErrorEntry {
  id: string;               // "err-ab123"
  scene: string;
  setId: string | null;     // null = 散错题（未归集）
  sourceRowId: string;      // 来源标注行 ID
  createdAt: string;
  content: Record<string, any>;  // 用户选择保存的字段快照
}

interface ErrorSet {
  id: string;               // "es-001"
  name: string;             // Prompt 中通过 {{错题集.名称}} 引用
  scene: string;
  description: string;
  entryCount: number;
  createdAt: string;
}
```

---

## 6. 详细功能规格

### 6.1 数据集管理（`datasets.html`）

**列表视图**

- 显示列：名称、场景徽章、行数、列数、映射状态、创建时间、操作
- 操作列（直接显示文字，不用下拉）：**编辑映射** · **去标注**（跳转工作台）· **删除**
- 顶部场景筛选下拉

**字段映射弹窗**（点击「编辑映射」打开）

4 项配置：
1. **默认显示列**：工作台表格默认展示的列（多选复选框）
2. **GT 列**（人工答案列）：值必须为 `"是"/"否"` 的列，用于 TP/TN/FP/FN 计算
3. **Prompt 引用列**：允许在 Prompt 模板中用 `{{列名}}` 引用的列
4. **预测列**（可选）：数据集自带的预测结果列

**Excel 导入流程**

1. 点击「导入数据集」，拖拽或选择 `.xlsx` / `.csv`
2. 后端解析列名，返回 `{ id, columns[], rowCount, colCount }`
3. 弹出字段映射弹窗
4. 确认后保存，`mappingDone = true`，数据行写入 SQLite

**合并数据集**

多选两个或以上数据集 → 「合并」按钮 → 输入合并后名称 → 生成新数据集

---

### 6.2 标注工作台（`workbench.html`）

#### Tab 1: 标注

**指标条（单行）**

14 项紧凑 chip，三组用竖分隔线分隔：

```
[总数 N] [已标注 N] [未标注 N] [进行中 N] [失败 N]  |  [TP N] [TN N] [FP N] [FN N]  |  准确率 N% 精确率 N% 召回率 N% F1 N% 特异度 N%
```

- **数据统计组**（5项）和**混淆矩阵组**（4项）：可点击，过滤下方表格
- **评测指标组**（5项）：只读展示
- 指标基于**当前选中数据集 + 方案 + 对照角色**实时计算
- 实现：`workbench.js` → `renderMetricBar()` 函数

**工具栏**

左侧控件（用于选择当前查看上下文）：
- 数据集下拉（仅显示 `mappingDone=true` 的）
- 方案下拉
- 对照角色下拉（选哪个 Prompt 角色的结果与 GT 比较，决定混淆矩阵）

右侧控件：
- 搜索框（150ms debounce）
- 导出按钮（导出当前可见行）
- **开始标注**按钮（打开配置弹窗，不直接启动）

**开始标注配置弹窗**（`start-modal`）

```
数据集: [下拉，预填当前值]      方案: [下拉，预填当前值]
并发数: [数字输入 1-32]

标注范围:
○ 仅标注已选中行 (N 行)
● 标注全部未标注行 (M 行)    ← 默认
○ 标注全部行（含重新标注）

                    [取消]  [▶ 开始标注]
```

点击「▶ 开始标注」后：后端创建任务，前端订阅 SSE，每行完成时更新状态和指标条。

**视图 Tab**（工具栏下方一行）

`全部` · `未标注` · `已完成` · `失败` · `与 GT 不一致`

**表格**

表头列顺序（固定规则）：

```
[复选框] [#序号] [状态] [数据集默认显示列...] [每个Prompt角色: 预测列 + thinking列...] [GT列] [操作列]
```

**操作列（最右，sticky 固定，不随横向滚动消失）**：

直接显示（带颜色文字，无图标）：
- `标注`（绿色 `text-emerald-600`）— 对单行发起标注
- `详情`（灰色 `text-slate-500`）— 打开行详情抽屉
- `分析`（紫色 `text-violet-500`）— 调用 UserHooks.analyze 弹窗展示

更多下拉（`···`，图标左对齐）：
- 🕘 标注历史 → 打开抽屉并切换到「历史」Tab
- ✎ 编辑行 → 行内编辑（待实现，暂 Toast 占位）
- ➕ 加入错题本 → 将本行加入选中集，打开添加错题弹窗
- ⬇ 导出行 → 下载单行 JSON
- —（分隔线）
- 🗑 删除（红色 danger 样式）

**批量操作栏**（勾选行后从底部弹出）

```
已选 N 行  [取消]          [▶标注选中] [➕加入错题本] [⬇导出] [🗑删除]
```

**行详情侧边抽屉**（双击行或点「详情」，从右侧滑入，宽 560px）

两个 Tab：
- **当前结果**：
  1. 原始字段（JSON 高亮）
  2. 渲染后 Prompt（示例，取第一个 Prompt 角色）
  3. 每个角色的模型返回（JSON 高亮）
- **历史**：
  该行在所有方案/任务下的标注记录时间轴，每条记录包含：任务ID · 时间 · 方案名 · 每个角色结果 · GT · 结论

抽屉右上角操作：复制全行 JSON · 导出 JSON · 翻译（调用 UserHooks.translate）· 关闭（Esc）

**添加错题弹窗**（`add-error-modal`）

1. 标题：已选 N 行
2. 步骤①：选择要保存的列（多选 checkbox，默认勾选 GT列 + 对照角色预测列）
3. 步骤②：实时预览（基于第一条选中行的 JSON）
4. 确认保存 → 写入 `NX.errorEntries`（散错题）

---

#### Tab 2: 方案管理

列表列：名称 · 场景 · Prompt 角色（有序列表，用 `/` 分隔）· 并发 · 最近使用 · 操作

操作：
- `▶ 标注`（绿色）— 选中该方案，跳回标注 Tab 并打开开始标注弹窗
- `编辑` — 打开编辑弹窗
- `删除`

**新建/编辑方案弹窗**：
- 方案名称
- 场景
- 选择 Prompt（多选，有序，可拖拽排序 — 顺序影响结果列的展示顺序）
- 并发数（1-32）

---

#### Tab 3: 任务面板

列表列：任务 ID（mono字体）· 触发时间 · 数据集 · 方案 · 行数 · 状态/进度 · 操作

**状态列**：
- 运行中：状态徽章 + 细进度条（`h-1.5`）+ 数字进度
- 已完成：绿色徽章 + 准确率
- 失败：红色徽章 + 错误信息
- 已取消：灰色徽章

**操作列**（文字按钮）：
- 运行中 → `取消`
- 失败 → `重跑`（重跑失败的行）
- 其他 → `详情`

---

### 6.3 Prompt 管理（`prompts.html`）

**列表视图**

列：名称 · 角色 · 场景 · 处理模式 · 绑定模型 · 更新时间 · 操作

操作：`编辑` · `复制` · `删除`

**编辑 Prompt 侧边栏/弹窗**（右侧宽抽屉或全屏弹窗）

左侧（主编辑区）：
- 名称、角色（如「初审」「质检」）、场景
- 绑定模型（来自 `UserHooks.models` 的 key 列表，后端 `/api/models` 读取）
- **处理模式开关**：
  - `自动`：系统自动将 `{{变量}}` 替换为真实值，无需写代码
  - `自定义`：调用 `UserHooks.init_prompt()`，用户完全控制 Prompt 构建
- Prompt 模板文本域（大文本区，等宽字体）
- **输出建议**（联动 GT 列名自动生成）：  
  `要求以 JSON 格式输出，示例: {"thinking": "推理过程", "gtCol名": "是/否"}`

右侧（可用变量侧栏）：
- **数据列**：当前数据集的 `refCols`，点击插入 `{{列名}}`
- **知识库**：知识片段列表，点击插入 `{{知识库.片段名}}`
- **错题集**：已命名错题集，点击插入 `{{错题集.集合名}}`

---

### 6.4 知识管理（`knowledge.html`）

**列表**：名称 · 场景 · 内容摘要（前 100 字符）· 标签 · 操作

操作：编辑 · 删除

**新建/编辑**：名称 · 场景 · 内容（大文本域）· 标签（逗号分隔）

> 知识片段在 Prompt 中通过 `{{知识库.片段名}}` 引用，后端渲染时将实际内容注入。

---

### 6.5 错题集管理（`error-sets.html`）

**双栏布局（左窄右宽）**

**左栏**：
- 两组：已命名错题集（绿色图标）+ 散错题（未归集）
- 散错题可勾选（复选框）
- 顶部「合并所选为错题集」按钮（≥1条选中时激活）
- 合并弹窗：输入集合名称 + 备注 → 确认 → 散错题 `setId` 更新

**右栏**：
- 选中**错题集**：展示名称（可内联编辑）· 占位符 `{{错题集.名称}}` · 条目卡片列表  
  卡片操作：编辑 · 移出集合 · 删除
- 选中**散错题**：单条详情 JSON
- 未选中：提示「在左侧选择」

**导出**：选中错题集 → 「导出 JSON」→ 下载 `{name, entries}` 格式

---

### 6.6 模型管理（`models.html`）

**只读页面**，数据来源：后端读取 `UserHooks.models` 字典

列：模型 Key · 状态（🟢可调用 / 🔴抛异常 / ⚪未测试）· 最近调用 · 耗时(avg/P95) · 备注 · 测试连通

**测试连通**按钮：调用 `/api/models/{key}/test`，模拟标注一次，更新状态和耗时

**新增模型方式**（代码注册，不通过 UI）：
```python
# user_hooks.py
self.models = {
    "my-model": self._call_my_model,
}
def _call_my_model(self, prompt: str, role: str) -> str:
    # 返回 JSON 字符串
    return '{"thinking": "...", "情感分类": "是"}'
```
重启后端后，模型自动出现在 Prompt 绑定下拉中。

---

## 7. UserHooks 规范

**用户唯一需要修改的文件**：`backend/user_hooks.py`

```python
from typing import Callable

class UserHooks:
    def __init__(self):
        # ── 模型注册区（key = 前端显示名，value = 调用函数）──
        self.models: dict[str, Callable] = {
            "deepseek-local": self._call_deepseek,
            "qwen-local":     self._call_qwen,
            # 在此添加更多模型
        }

    # ── 模型调用函数规范 ──
    # 参数: prompt(已渲染的字符串), role(角色名)
    # 返回: JSON 字符串，必须包含 gtCol 字段值("是"/"否") + 可选 "thinking"
    def _call_deepseek(self, prompt: str, role: str) -> str:
        # 调用本地或远程大模型
        return '{"thinking": "推理过程", "情感分类": "是"}'

    # ── 三个扩展钩子 ──

    def translate(self, text: str, target_lang: str = "zh") -> str:
        """前端「翻译」按钮触发。返回翻译后的文本字符串。"""
        raise NotImplementedError

    def analyze(self, row_data: dict) -> dict:
        """前端「分析」按钮触发。
        row_data: {"列名": "值", ...}
        返回任意 dict，前端以 JSON 高亮格式展示。"""
        raise NotImplementedError

    def init_prompt(
        self,
        prompt_template: str,
        row_data: dict,
        knowledge: list[dict],            # [{"name": "...", "content": "..."}, ...]
        error_sets: dict[str, list[dict]] # {"集合名": [{"列名": "值"}, ...], ...}
    ) -> str:
        """processingMode='custom' 时调用，完全自定义 Prompt 构建。
        返回最终发送给模型的 Prompt 字符串。"""
        raise NotImplementedError
```

**Prompt 渲染流程（auto 模式）**：

```
template  →  替换 {{列名}}（来自 row_data）
          →  替换 {{知识库.名称}}（来自 knowledge content）
          →  替换 {{错题集.名称}}（来自 error_set entries JSON）
          →  发送给对应模型函数
```

**Prompt 渲染流程（custom 模式）**：

```
template + row_data + knowledge + error_sets  →  init_prompt()  →  最终 Prompt  →  模型函数
```

---

## 8. 后端 API 规格

> 基础路径：`http://localhost:8000/api`  
> 前端改造时，将 `assets/mock/*.js` 中的 `NX.xxx = [...]` 替换为 `await fetch('/api/...')` 即可

### 8.1 数据集

| Method | Path | Body/Params | 返回 |
|--------|------|-------------|------|
| GET | `/datasets` | `?scene=SPN` | `Dataset[]` |
| POST | `/datasets/import` | FormData: `file` | `{id, columns[], rowCount, colCount}` |
| PUT | `/datasets/{id}/mapping` | `{mapping: {...}}` | `Dataset` |
| DELETE | `/datasets/{id}` | — | `{ok: true}` |
| POST | `/datasets/merge` | `{ids[], name, scene}` | `Dataset` |

### 8.2 标注行

| Method | Path | Body/Params | 返回 |
|--------|------|-------------|------|
| GET | `/datasets/{id}/rows` | `?page=1&size=50&status=pending` | `{rows: AnnotationRow[], total: number}` |
| GET | `/rows/{id}` | — | `AnnotationRow & {history: RowHistory[]}` |
| PUT | `/rows/{id}` | `{data: {...}}` | `AnnotationRow` |
| DELETE | `/rows/{id}` | — | `{ok: true}` |

### 8.3 Prompt

| Method | Path | 返回 |
|--------|------|------|
| GET | `/prompts` | `Prompt[]` |
| POST | `/prompts` | `Prompt` |
| PUT | `/prompts/{id}` | `Prompt` |
| DELETE | `/prompts/{id}` | `{ok: true}` |

### 8.4 方案

| Method | Path | 返回 |
|--------|------|------|
| GET | `/schemes` | `Scheme[]` |
| POST | `/schemes` | `Scheme` |
| PUT | `/schemes/{id}` | `Scheme` |
| DELETE | `/schemes/{id}` | `{ok: true}` |

### 8.5 标注任务（关键接口）

| Method | Path | Body | 返回 |
|--------|------|------|------|
| POST | `/tasks` | `{datasetId, schemeId, rowIds[], concurrency}` | `AnnotationTask` |
| GET | `/tasks` | `?status=running` | `AnnotationTask[]` |
| GET | `/tasks/{id}` | — | `AnnotationTask` |
| DELETE | `/tasks/{id}` | — | 取消任务 |
| **GET** | **`/tasks/{id}/stream`** | — | **SSE 流** |

**SSE 事件格式**（`/tasks/{id}/stream`）：

```javascript
// 每行完成时：
data: {"type":"row_done","rowId":"r-1000","status":"done","results":{"[初审]_情感分类":"是","[初审]_thinking":"..."}}

// 每行失败时：
data: {"type":"row_failed","rowId":"r-1001","status":"failed","error":"timeout"}

// 任务完成时：
data: {"type":"task_done","taskId":"tk-ab12","accuracy":0.856,"finishedAt":"2025-05-28T10:30:00"}
```

前端订阅示例：
```javascript
const es = new EventSource(`/api/tasks/${taskId}/stream`);
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type === 'row_done' || event.type === 'row_failed') {
    const r = state.rows.find(x => x.id === event.rowId);
    if (r) { Object.assign(r.results, event.results || {}); r.status = event.status; renderAll(); }
  }
  if (event.type === 'task_done') {
    es.close();
    NX.toast(`完成，准确率 ${(event.accuracy*100).toFixed(1)}%`, 'success');
  }
};
```

### 8.6 知识库

| Method | Path | 返回 |
|--------|------|------|
| GET | `/knowledge` | `Knowledge[]` |
| POST | `/knowledge` | `Knowledge` |
| PUT | `/knowledge/{id}` | `Knowledge` |
| DELETE | `/knowledge/{id}` | `{ok: true}` |

### 8.7 错题

| Method | Path | Body | 返回 |
|--------|------|------|------|
| GET | `/error-entries` | `?setId=null`（散错题） | `ErrorEntry[]` |
| POST | `/error-entries/batch` | `{entries: [{sourceRowId, content, scene}]}` | `ErrorEntry[]` |
| PUT | `/error-entries/{id}` | `{content: {...}}` | `ErrorEntry` |
| DELETE | `/error-entries/{id}` | — | `{ok: true}` |
| GET | `/error-sets` | — | `ErrorSet[]` |
| POST | `/error-sets` | `{name, description, entryIds[]}` | `ErrorSet` |
| PUT | `/error-sets/{id}` | `{name, description}` | `ErrorSet` |
| DELETE | `/error-sets/{id}` | — | 集合删除，条目变散错题 |

### 8.8 模型

| Method | Path | 返回 |
|--------|------|------|
| GET | `/models` | `{key, status, lastUsed, avgMs, p95Ms, note}[]` |
| POST | `/models/{key}/test` | `{status, avgMs}` |

### 8.9 场景

| Method | Path | 返回 |
|--------|------|------|
| GET | `/scenes` | `string[]` — 从所有资源的 scene 字段自动聚合 |

---

## 9. 加载动效规范

### 9.1 行级 Loading（标注进行中）

状态列：`<span class="spinner"></span> 进行中`（amber 色）  
预测列：`<span class="spinner"></span>`（仅 spinner，无文字）  
操作列：`标注` 文字变灰，`pointer-events: none`

`spinner` CSS 已在 `shared.css` 定义：
```css
.spinner { border: 2px solid #e2e8f0; border-top-color: #22C55E; width:14px; height:14px; animation: spin 1s linear infinite; }
```

### 9.2 指标条实时刷新

每次行状态变化（SSE 事件触发）后调用 `renderMetricBar()` 全量刷新指标条。不需要动画，数字变化本身即是反馈。

### 9.3 任务进度条

任务面板运行中任务：
```html
<div class="h-1.5 w-28 rounded-full bg-slate-100 overflow-hidden">
  <div class="h-full bg-amber-400 transition-all duration-300" style="width: {pct}%"></div>
</div>
```

### 9.4 骨架屏

初始加载时（后端接口请求期间），用 `skeleton` class 占位：
```css
.skeleton { animation: skeleton-shimmer 1.2s ease-in-out infinite; background: linear-gradient(...); }
```

### 9.5 Toast 通知

- 成功：深绿色背景（`toast--success`）
- 错误：红色背景（`toast--error`）
- 默认：深色背景
- 持续时间：2500ms（可自定义）

---

## 10. TP/TN/FP/FN 指标逻辑

### 10.1 核心定义

人工答案（GT，数据集 `gtCol` 列值）和模型答案（`[角色]_gtCol` 结果列值）均为二值：`"是"` 或 `"否"`。

| 组合 | 分类 | 含义 |
|------|------|------|
| 模型=是 & 人工=是 | **TP**（真正例）| 模型正确预测为正 |
| 模型=否 & 人工=否 | **TN**（真负例）| 模型正确预测为负 |
| 模型=是 & 人工=否 | **FP**（假正例）| 模型误报（应为否却判是）|
| 模型=否 & 人工=是 | **FN**（假负例）| 模型漏报（应为是却判否）|

### 10.2 五项评测指标

```
准确率 Accuracy   = (TP + TN) / (TP + TN + FP + FN)
精确率 Precision  = TP / (TP + FP)
召回率 Recall     = TP / (TP + FN)
F1               = 2 × Precision × Recall / (Precision + Recall)
特异度 Specificity = TN / (TN + FP)
```

分母为 0 时显示 `0.0%`，不抛错。

### 10.3 对照角色

工具栏「对照角色」下拉：从当前方案的 Prompt 角色列表中选一个，用该角色的预测列与 GT 比较，决定混淆矩阵。

方案有多个 Prompt 时（如初审 + 质检），用户可切换对照角色，指标条随之刷新。

### 10.4 行分类规则

- 只有 `status === 'done'` 的行参与混淆矩阵和评测指标计算
- `pending / running / failed / partial` 行不参与（但参与数据统计组）

### 10.5 前端实现（`workbench.js`）

```javascript
function classify(r) {
  if (r.status !== 'done') return null;
  const role  = state.contrastRole || '初审';
  const gtCol = getCurrentDataset()?.mapping?.gtCol || '情感分类';
  const pred  = r.results[`[${role}]_${gtCol}`];
  const gt    = r.data[gtCol];
  if (pred == null || gt == null) return null;
  if (pred === '是' && gt === '是') return 'tp';
  if (pred === '否' && gt === '否') return 'tn';
  if (pred === '是' && gt === '否') return 'fp';
  if (pred === '否' && gt === '是') return 'fn';
  return null;
}
```

---

## 11. 前后端对接改造要点

当后端开发完成后，前端仅需以下改动（无需重写 UI）：

### A. 替换 Mock 数据加载

每个页面初始化时从 API 拉取数据，替换 mock 文件的赋值：

```javascript
// 原来（mock 文件直接赋值）:
NX.datasets = [ {...} ];

// 改造后（init 函数里 fetch）:
NX.datasets = await fetch('/api/datasets').then(r => r.json());
```

涉及文件：`assets/mock/*.js` 中的数据，或在各页 `assets/pages/*.js` 的 `init()` 函数中改为 fetch。

### B. 替换 simulateAnnotate → 真实任务

`workbench.js` 中 `simulateAnnotate(rowIds)` 函数替换为：

```javascript
async function startAnnotateTask(schemeId, datasetId, rowIds, concurrency) {
  // 1. 创建任务
  const task = await fetch('/api/tasks', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ schemeId, datasetId, rowIds, concurrency })
  }).then(r => r.json());

  // 2. 订阅 SSE 进度
  const es = new EventSource(`/api/tasks/${task.id}/stream`);
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    const r = state.rows.find(x => x.id === event.rowId);
    if (r && event.type === 'row_done') {
      r.status = 'done';
      Object.assign(r.results, event.results);
      renderAll();
    }
    if (r && event.type === 'row_failed') {
      r.status = 'failed';
      renderAll();
    }
    if (event.type === 'task_done') {
      es.close();
      NX.toast(`完成，准确率 ${(event.accuracy*100).toFixed(1)}%`, 'success');
    }
  };
}
```

### C. Excel 上传

```javascript
async function importDataset(file) {
  const form = new FormData();
  form.append('file', file);
  const result = await fetch('/api/datasets/import', {
    method: 'POST', body: form
  }).then(r => r.json());
  // result = {id, columns[], rowCount, colCount}
  // → 展示字段映射弹窗
}
```

### D. 无需修改的部分

以下内容**不需要改动**，可原样使用：
- 所有 CSS 样式（`shared.css` + Tailwind class）
- 所有 UI 交互（抽屉/弹窗/指标条/事件委托）
- 侧边栏、Tab 切换、筛选逻辑
- `shared.js` 的全部工具函数
- 14 项指标计算（前端计算，基于 rows 数组）
- 错题集管理的双栏交互
- Toast / Drawer / Modal 控制

---

## 12. 术语表

| 术语 | 含义 |
|------|------|
| **场景(Scene)** | 业务场景标签（SPN/IPRAN/泰国/印尼），所有资源的通用筛选维度 |
| **Prompt 卡片** | Prompt 管理页中的一条实体，包含模板、角色、模式等元数据 |
| **角色(Role)** | Prompt 卡片的唯一标识符字符串，如「初审」「质检」，标注结果列名为 `[角色]_gtCol` |
| **方案(Scheme)** | 一组有序 Prompt 卡片的组合，单次标注任务按方案中每个 Prompt 各调用一次模型 |
| **GT 列** | Ground Truth 列，数据集中人工标注的答案列，值为 是/否 |
| **对照角色** | 计算混淆矩阵时选用哪个 Prompt 角色的预测结果与 GT 比较 |
| **UserHooks** | 用户自定义代码类（`user_hooks.py`），注册模型调用函数和三个扩展钩子 |
| **散错题** | 尚未归入任何错题集的单条错例，`setId = null` |
| **错题集** | 已命名的错题集合，在 Prompt 中通过 `{{错题集.名称}}` 引用 |
| **处理模式** | Prompt 的两种变量处理方式：`auto`（占位符替换）或 `custom`（调用 init_prompt）|
| **SSE** | Server-Sent Events，后端向前端实时推送任务进度的长连接协议 |
| **sticky-action-col** | 表格最右操作列，CSS `position: sticky; right: 0`，不随横向滚动消失 |
