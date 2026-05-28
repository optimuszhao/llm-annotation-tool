# LLM 标注工具 · 业务 PRD

> **文档版本**：v4.1 · 2026-05-28  
> **定位**：功能需求 + 数据模型 + API 规格，供后端开发与产品对齐使用  
> **注**：前端静态原型已完成，见 `prototype/`，本文档不再描述前端实现细节

---

## 目录

0. [UI 布局备选方案](#0-ui-布局备选方案)
1. [项目定位](#1-项目定位)
2. [技术栈概览](#2-技术栈概览)
3. [菜单 & 页面总览](#3-菜单--页面总览)
4. [数据集字段规范](#4-数据集字段规范)
5. [核心数据对象](#5-核心数据对象)
6. [详细功能规格](#6-详细功能规格)
7. [UserHooks 规范](#7-userhooks-规范)
8. [后端 API 规格](#8-后端-api-规格)
9. [TP/TN/FP/FN 指标逻辑](#9-tptnfpfn-指标逻辑)
10. [术语表](#10-术语表)

---

## 0. UI 布局备选方案

> 当前原型采用「左边菜单 + 右边内容」的传统布局。以下四个方案是更具质感与未来感的替代思路，核心原则一致：**数据列表是第一优先级，占据主屏；其他一切都是对列表的服务。**

---

### 方案 A：全屏数据台 + 命令面板

**核心思路**：列表即是 App，其他功能通过快捷键调出，不存在固定导航区域。

- 整个屏幕只有一张全宽数据表，顶部是一条极细的状态栏（当前数据集、方案、准确率、正在标注的行数）
- 所有操作通过 **⌘K 命令面板** 触发：切换数据集、新建方案、启动标注、查看错题集……一切用键盘搜索
- 点击任意行，右侧滑出浮层（不推走列表，而是叠加在上方），展示该行详情、标注历史、分析结果
- 标注任务运行时，状态栏出现实时进度环；每行的状态直接在行内用颜色/角标呈现（排队=灰、进行中=动画点、完成=TP/TN/FP/FN 色块）
- **适合场景**：熟悉快捷键的重度用户，极简风格偏好

---

### 方案 B：驾驶舱（Cockpit）

**核心思路**：水平分层，像 DAW 音频软件或飞行控制台，每一层有明确职责。

```
┌─────────────────────────────────────────────────────┐
│  控制条：数据集 · 方案 · 对照角色 · [▶ 开始标注]   ← 顶部操作带
│  指标带：TP 32 · TN 41 · FP 8 · FN 6 · 准确率 82%  ← 实时指标（始终可见）
├─────────────────────────────────────────────────────┤
│                                                     │
│                    数据列表（主体）                   │  ← 占 70–80% 高度
│                                                     │
├─────────────────────────────────────────────────────┤
│  任务监控带：[任务 #3 ▰▰▰▱▱ 61%]  排队 12  完成 43  │  ← 底部常驻，可折叠
└─────────────────────────────────────────────────────┘
```

- 点击行 → 底部任务带收起，右侧浮出行详情面板
- 标注进行中，底部带实时滚动显示「正在标注第 N 行…」，动画有呼吸感
- Prompt / 错题集 / 知识库等配置入口藏在顶部控制条的下拉或侧边图标里，平时不可见
- **适合场景**：需要实时感知标注进度，重视数据状态可视化

---

### 方案 C：双轨动态面板

**核心思路**：左主右辅，但右侧不是固定菜单，而是**随上下文自动切换内容**的智能面板。

```
┌──────────────────────┬──────────────────┐
│                      │  [空闲时]         │
│    数据列表（主轨）   │  → 显示指标概览   │
│    60–65% 宽度        │──────────────────│
│                      │  [选中行时]       │
│                      │  → 行详情 + 历史  │
│                      │──────────────────│
│                      │  [标注进行中时]   │
│                      │  → 实时任务流     │
│                      │  逐条刷新进度     │
└──────────────────────┴──────────────────┘
```

- 右侧面板是「状态机」：没有固定内容，跟随当前动作自动呈现最有用的信息
- 标注结束后右侧自动切为「完成报告」（准确率变化、新增 FP/FN 列表），用户可直接在此决定下一步
- 其他配置页（Prompt、知识库等）作为全屏覆盖层打开，用完关掉，不占常驻空间
- **适合场景**：不想用快捷键，但也不想被静态菜单占据空间

---

### 方案 D：标注会话模式（Session-first）

**核心思路**：强调「一次工作」的完整生命周期，进入会话前配置，进入后专注执行。

- **进入前**：一个简洁的「启动页」，选择数据集 + 方案，就像进入一个任务房间
- **进入后**：整个界面变为沉浸式标注工作区，顶部只显示会话信息（数据集名、方案名、进度环），没有任何其他导航
- 数据列表占满全高，行状态用极细的左侧色条区分（灰=待标注、蓝光动画=进行中、绿=TP、蓝=TN、橙=FP、红=FN）
- 会话结束后弹出「复盘卡片」：准确率曲线、新增错题数、与上次会话的对比
- Prompt / 错题集等管理功能在会话外（启动页入口），会话中只能查看，不能修改（避免误操作）
- **适合场景**：希望工作状态有明确的「开始 / 进行中 / 结束」感，适合专注式使用

---

### 方案对比

| | A 全屏数据台 | B 驾驶舱 | C 双轨动态面板 | D 会话模式 |
|---|---|---|---|---|
| 上手门槛 | 高（依赖⌘K） | 低 | 低 | 中 |
| 实时感知 | 行内呈现 | 最强（底部带） | 右侧切换 | 顶部进度环 |
| 屏幕利用率 | 最高 | 高 | 中 | 高 |
| 操作流畅度 | 键盘流 | 中 | 鼠标友好 | 会话切换感 |
| 未来感 | ★★★★★ | ★★★★ | ★★★ | ★★★★ |
| 实现复杂度 | 高 | 中 | 中 | 中 |

---

## 1. 项目定位

**LLM 标注工具**是一个面向大模型开发者的**本地化数据标注 + Prompt 评测闭环系统**。

核心工作流：

```
导入 Excel/CSV/JSON
  → 配置字段映射（指定人工答案列、Prompt 引用列等）
  → 选数据集 + 选标注方案（含一组有序 Prompt）
  → 跑批标注（并发调用大模型）
  → 查看 TP/TN/FP/FN 及准确率等 5 项指标
  → 错例加入错题集 → 改进 Prompt → 再跑 → 提升准确率
```

关键设计原则：

- **纯本地运行**：后端 Python + SQLite，不依赖任何外部云服务
- **用户只写一个文件**：`user_hooks.py`，注册大模型调用函数，3 个钩子方法扩展业务逻辑
- **标注答案二值化**：人工答案和模型答案均为 **是 / 否**，以此计算 TP/TN/FP/FN

---

## 2. 技术栈概览

| 层 | 技术 |
|---|---|
| 前端 | 纯 HTML + Tailwind CSS（本地 vendor）+ 原生 JS，无框架无构建 |
| 后端 | Python 3.10+ · FastAPI |
| 数据库 | SQLite（单文件，`backend/data/annotation.db`） |
| 任务调度 | Python threading + queue（多并发标注，无需 Celery） |
| 进度推送 | Server-Sent Events (SSE) |

### 前端技术选型（内网离线方案）

当前原型用纯 HTML + Vanilla JS。若要实现 §0 中更具质感的 UI 方案，推荐升级为以下组合，**全部单文件，下载放 vendor 目录即可，无需 npm 或构建工具**：

| 文件 | 大小 | 作用 |
|---|---|---|
| `vue.global.js` | ~130 KB | 响应式状态管理。替代手写 DOM 操作，处理并发标注状态更新、实时指标刷新等复杂状态 |
| `gsap.min.js` | ~70 KB | 动画引擎。行进场交错、面板弹性滑入、数字滚动、状态切换闪光等效果 |
| Tailwind（已有） | — | 样式工具类 |

**为什么不用其他方案**：React CDN 版需要 Babel 才能写 JSX，麻烦；Svelte 必须构建；Alpine.js 处理并发标注的复杂状态会力不从心；纯 Vanilla JS 在状态逐渐复杂后维护成本很高。

Vue 3 script-tag 模式写法接近增强版 HTML，学习成本低，无需任何构建步骤。

后端启动：

```bash
cd backend
pip install fastapi uvicorn sqlalchemy openpyxl
uvicorn main:app --reload --port 8000
```

---

## 3. 菜单 & 页面总览

侧边栏 6 个扁平菜单：

| # | 菜单名 | 核心功能 |
|---|---|---|
| 1 | 数据集管理 | 导入 Excel/CSV/JSON，配置字段映射 |
| 2 | 标注工作台 ⭐ | 核心页，含标注、方案管理、任务面板三个子 Tab |
| 3 | Prompt 管理 | Prompt 卡片库，两种处理模式（自动/自定义） |
| 4 | 知识管理 | 知识片段库，可在 Prompt 中引用 |
| 5 | 错题集管理 | 错例集合管理，双栏布局 |
| 6 | 模型管理 | 只读，数据来源 `UserHooks.models` |

**场景（Scene）**：不是独立菜单，而是所有资源上的通用标签字段，用于筛选。示例值：`SPN`、`IPRAN`、`泰国`、`印尼`。

---

## 4. 数据集字段规范

### 4.1 支持的文件格式

| 格式 | 说明 |
|---|---|
| Excel（`.xlsx`） | 第一行为表头，每行为一条数据记录 |
| CSV（`.csv`） | 逗号分隔，第一行为表头，UTF-8 编码 |
| JSON（`.json`） | 顶层为数组（`[{...}, {...}]`），每个对象的 key 即为列名 |

所有格式导入后均归一化为：**列名 + 行列表** 的内部表示。

---

### 4.2 标准字段说明

实际数据集中的字段分为以下几类，字段名以实际 Excel 表头为准：

#### A. 基础元信息字段（轻量，适合在表格中直接展示）

| 字段示例 | 含义 | 特点 |
|---|---|---|
| `ID` | 数据记录唯一标识 | 纯文本，简短 |
| `工单名称` | 工单的业务名称 | 纯文本，简短 |
| `工单类型` | 工单分类标签 | 枚举值 |
| `工单耗时` | 处理该工单花费的时间 | 数值或时间字符串 |
| `COT名称` | 思维链/任务名称 | 纯文本，简短 |

> 这类字段值较短，适合作为**表格默认显示列**。

---

#### B. 人工答案字段（Ground Truth）

- **字段名由用户在字段映射中指定**，没有固定名称
- **值必须为二值**：`是` 或 `否`（导入时自动校验）
- 该列用于与模型答案对比，计算 TP/TN/FP/FN

> 用户可将任意一列指定为人工答案列，系统会验证其值全为 `是` / `否`，否则提示映射错误。

---

#### C. 大型结构化字段（JSON 类）

这类字段值为 JSON 字符串，体积大（单个字段可能有 **数千行**），不适合在表格中直接展示，应在行详情抽屉中展开查看。

| 字段示例 | 含义 | 特点 |
|---|---|---|
| `API Order` | 一次接口调用的请求/响应记录 | JSON 字符串，中等大小 |
| `API Part 1` ~ `API Part 7` | 7 个并行或串行 API 片段的数据 | 每个都是大 JSON，可能 **数千行** |
| `Summary` | 汇总数据，对前述字段的结构化摘要 | 大 JSON |

> **注意**：API Part 字段共有 7 个，且每个体积很大。系统需要能够优雅处理这类字段：
> - 表格中显示截断预览（如前 80 字符 + `...`）
> - 点击「详情」后在右侧抽屉中以 JSON 高亮格式完整展示
> - 允许用户在字段映射中将这类字段添加到「Prompt 引用列」，在 Prompt 模板中通过 `{{API Part 1}}` 等方式引用

---

#### D. 大型文本字段

| 字段示例 | 含义 | 特点 |
|---|---|---|
| `标注数据` | 人工或业务系统产出的文字描述 | 纯文本，**几百到上千字** |

> 与 JSON 类字段类似，表格中只展示截断预览，详情中完整显示。

---

#### E. 其他大模型标注字段

- 数据集中可能已经包含**其他大模型的标注结果**，字段名形如 `GPT4_标注`、`Claude_结果` 等（由用户数据决定）
- 这类字段与本系统产出的 `[角色]_gtCol` 格式结果列并列存在，用户可在 Prompt 中引用作为参考
- 在字段映射时，用户可将这类列加入「Prompt 引用列」供 Prompt 模板使用

---

### 4.3 字段映射配置

导入数据集后，用户需要完成以下 4 项字段映射配置：

| 配置项 | 说明 | 必填 |
|---|---|---|
| **GT 列（人工答案列）** | 选择一列作为 Ground Truth，值必须全为 `是`/`否` | ✅ |
| **默认显示列** | 工作台表格默认展示的列（建议选基础元信息字段，避免大字段导致表格卡顿） | ✅ |
| **Prompt 引用列** | 允许在 Prompt 模板中用 `{{列名}}` 引用的列 | ✅ |
| **预测列（可选）** | 数据集自带的预测结果列（若已有其他模型的二值结果，可直接对比） | ❌ |

---

### 4.4 大字段的处理原则

由于 API Part 类字段单个可能达到数千行，系统需遵循以下原则：

1. **存储**：原始值完整存储在数据库中，不做截断
2. **列表展示**：表格中显示前 **100 字符**，末尾加 `...`
3. **详情展示**：行详情抽屉中完整渲染，JSON 字段做语法高亮
4. **Prompt 引用**：当大字段被引用到 Prompt 时，后端直接将完整内容拼入 Prompt 字符串；如果 Prompt 过长超出模型限制，由用户在 `UserHooks.init_prompt()` 中自行处理截断逻辑
5. **搜索**：全文搜索覆盖所有字段（包括大字段），但前端搜索仅在已加载的行中进行；大数据集建议后端做全文索引

---

## 5. 核心数据对象

### 5.1 Dataset（数据集）

```typescript
interface Dataset {
  id: string;               // "ds-1"
  name: string;             // "客户工单_2025Q1.xlsx"
  scene: string;            // "SPN"
  rowCount: number;
  colCount: number;
  mappingDone: boolean;     // 是否完成字段映射，false 时不可用于标注
  createdAt: string;
  columns: string[];        // 原始列名列表（按导入顺序）
  columnTypes: Record<string, 'basic' | 'json' | 'text' | 'gt' | 'llm'>;
  // columnTypes 说明:
  //   basic — 基础元信息字段（短文本）
  //   json  — 值为 JSON 字符串的大字段（API Part / Summary 等）
  //   text  — 大型纯文本字段（标注数据等）
  //   gt    — 被指定为人工答案列（值为 是/否）
  //   llm   — 其他大模型的标注结果列
  mapping: {
    gtCol: string;          // 人工答案列名（值为 "是"/"否"）
    defaultCols: string[];  // 表格默认显示列（建议为 basic 类型字段）
    refCols: string[];      // Prompt 模板中可 {{列名}} 引用的列
    predCol?: string;       // 数据集自带的预测结果列（可选）
  } | null;
}
```

### 5.2 Prompt（Prompt 卡片）

```typescript
interface Prompt {
  id: string;
  name: string;             // "SPN 情感初审"
  role: string;             // "初审" — 标注结果列名为 "[初审]_gtCol"
  scene: string;
  defaultModel: string;     // 对应 UserHooks.models 的 key
  processingMode: 'auto' | 'custom';
  // auto:   系统自动替换 {{变量}} 占位符
  // custom: 调用 UserHooks.init_prompt(template, row_data, knowledge, error_sets)
  template: string;         // Prompt 模板文本
  outputAdvice: string;     // 输出格式建议（如 '{"thinking": "...", "情感分类": "是/否"}'）
  knowledgeIds: string[];
  errorSetRefs: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 5.3 Scheme（方案）

```typescript
interface Scheme {
  id: string;
  name: string;             // "双角色情感分类"
  scene: string;
  promptIds: string[];      // 有序 Prompt 列表，每个 Prompt 独立调用一次模型
  concurrency: number;      // 并发数（1–32）
  lastUsed: string;
}
```

### 5.4 AnnotationRow（标注行）

```typescript
interface AnnotationRow {
  id: string;
  no: number;               // 序号（行号）
  datasetId: string;
  data: Record<string, string>;           // 原始字段值，{"列名": "值"}
  results: Record<string, string | null>;
  // results 结构示例（方案含 初审 + 质检 两个 Prompt 角色，GT 列名为"情感分类"）:
  // {
  //   "[初审]_情感分类": "是",
  //   "[初审]_thinking": "用户表达了不满...",
  //   "[质检]_情感分类": "是",
  //   "[质检]_thinking": "与初审结论一致..."
  // }
  status: 'pending' | 'running' | 'done' | 'failed' | 'partial';
  lastTaskAt: string | null;
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
  rowIds: string[];
  rowCount: number;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  progress: { done: number; total: number };
  accuracy: number | null;  // 任务完成后计算，null 表示无法计算（无 GT 对照）
  triggeredAt: string;
  finishedAt: string | null;
  errMsg: string | null;
}
```

### 5.6 Knowledge（知识片段）

```typescript
interface Knowledge {
  id: string;
  name: string;             // "SPN 故障处理规范"
  scene: string;
  content: string;
  tags: string[];
  createdAt: string;
}
```

### 5.7 ErrorEntry / ErrorSet（错题与错题集）

```typescript
interface ErrorEntry {
  id: string;
  scene: string;
  setId: string | null;     // null = 散错题（未归入任何集合）
  sourceRowId: string;
  createdAt: string;
  content: Record<string, any>;  // 用户选择保存的字段快照（列名 → 值）
}

interface ErrorSet {
  id: string;
  name: string;             // Prompt 中通过 {{错题集.名称}} 引用
  scene: string;
  description: string;
  entryCount: number;
  createdAt: string;
}
```

---

## 6. 详细功能规格

### 6.1 数据集管理

**列表视图**：名称、场景、行数、列数、映射状态、创建时间、操作（编辑映射 · 去标注 · 删除）

**导入流程**：

1. 选择文件（`.xlsx` / `.csv` / `.json`）
2. 后端解析，返回 `{ id, columns[], rowCount, colCount }`
3. 弹出字段映射弹窗
4. 用户完成 4 项映射配置（见 §4.3）后确认保存，`mappingDone = true`

**字段映射弹窗注意事项**：

- GT 列选择后，后端需验证该列的值是否全为 `是`/`否`，否则弹出警告（允许继续，但告知有脏数据）
- 默认显示列建议引导用户选择 `basic` 类型字段，对 `json` 类字段给出提示（「该字段内容较大，可能影响表格加载速度」）
- API Part 1–7 均可选入 Prompt 引用列

**数据集合并**：多选两个及以上数据集 → 「合并」→ 输入名称 → 生成新数据集（列取并集，缺失列填空字符串）

---

### 6.2 标注工作台

#### Tab 1：标注

**指标条**（单行，三组用竖分隔线分隔）：

```
总数 N · 已标注 N · 未标注 N · 进行中 N · 失败 N
  |  TP N · TN N · FP N · FN N
  |  准确率 N% · 精确率 N% · 召回率 N% · F1 N% · 特异度 N%
```

- 前两组（数据统计 + 混淆矩阵）可点击，过滤下方表格
- 第三组（评测指标）只读
- 指标基于**当前选中数据集 + 方案 + 对照角色**实时计算

**工具栏**（左：上下文选择；右：操作）：

| 控件 | 说明 |
|---|---|
| 数据集下拉 | 仅显示 `mappingDone=true` 的数据集 |
| 方案下拉 | 全部方案 |
| 对照角色下拉 | 当前方案中的 Prompt 角色列表，决定混淆矩阵计算用哪个角色的结果 |
| 搜索框 | 150ms debounce，模糊匹配所有可见列 |
| 导出 | 导出当前可见行 |
| 开始标注 | 打开配置弹窗（不直接启动） |

**开始标注弹窗**：

- 展示「将标注 N 行」（N 来自外部已选中行；若无选中则为当前视图内未标注行数）
- 方案卡片单选（展示：方案名、Prompt 角色数、场景、并发数）
- 并发数输入（1–32）
- 不再需要在弹窗里选数据集或选标注范围（范围在外部通过筛选/勾选确定）

**视图 Tab**：全部 · 未标注 · 已完成 · 失败 · 与 GT 不一致

**表格列顺序**（固定规则）：

```
[复选框] [#序号] [状态] [默认显示列...] [每个Prompt角色: 预测值 + thinking...] [GT列] [操作列]
```

**状态列显示逻辑**：

| 行状态 | 显示内容 |
|---|---|
| `pending` | 灰色「未标注」徽章 |
| `running` | Spinner + 「进行中」（amber 色） |
| `done` + 有分类结果 | 直接显示 **TP**（绿）/ **TN**（蓝）/ **FP**（橙）/ **FN**（红）徽章 |
| `done` + 无 GT 对照 | 绿色「已完成」徽章 |
| `failed` | 红色「失败」徽章 |

**操作列**（sticky 固定在右侧，不随横向滚动消失）：

- 直接显示文字按钮：`标注`（绿）· `详情`（灰）· `分析`（紫）
- `···` 更多菜单：标注历史 · 编辑行 · 加入错题本 · 导出行 · ——— · 删除（红）

**行详情抽屉**（右侧滑入，宽 560px）：

两个 Tab：
- **当前结果**：原始字段（JSON 高亮）· 渲染后 Prompt · 每个角色的模型返回（JSON 高亮）
- **历史**：该行在所有任务下的标注记录时间轴

**添加错题弹窗**：选择要保存的列（多选）→ 实时预览（JSON）→ 确认写入错题库

---

#### Tab 2：方案管理

列：名称 · 场景 · Prompt 角色列表 · 并发 · 最近使用 · 操作（▶ 标注 · 编辑 · 删除）

**新建/编辑方案**：名称、场景、选择 Prompt（多选有序，可排序）、并发数

---

#### Tab 3：任务面板

列：任务 ID · 触发时间 · 数据集 · 方案 · 行数 · 状态/进度 · 操作

**操作**：运行中 → `取消`；失败 → `重跑`（仅重跑失败的行）；其他 → `详情`

---

### 6.3 Prompt 管理

列：名称 · 角色 · 场景 · 处理模式 · 绑定模型 · 更新时间 · 操作

**编辑 Prompt**（右侧宽抽屉）：

- 左侧：名称、角色、场景、绑定模型、处理模式开关、Prompt 模板文本域、输出格式建议
- 右侧变量侧栏：数据列（点击插入 `{{列名}}`）· 知识库 · 错题集

---

### 6.4 知识管理

列：名称 · 场景 · 内容摘要（前 100 字符）· 标签 · 操作

新建/编辑：名称 · 场景 · 内容（大文本域）· 标签

> 在 Prompt 中通过 `{{知识库.片段名}}` 引用，后端渲染时将完整内容注入。

---

### 6.5 错题集管理

**双栏布局（左窄右宽）**：

- 左栏：已命名错题集列表 + 散错题列表；散错题可勾选，支持「合并为错题集」
- 右栏：选中错题集时展示条目卡片；选中散错题时展示单条 JSON

**导出**：选中错题集 → 导出 JSON（格式：`{ name, description, entries[] }`）

---

### 6.6 模型管理（只读）

数据来源：后端读取 `UserHooks.models` 字典

列：模型 Key · 状态（可调用/抛异常/未测试）· 最近调用 · 耗时（avg/P95）· 测试连通

新增模型通过修改 `user_hooks.py` 注册，重启后端自动出现。

---

## 7. UserHooks 规范

**用户唯一需要修改的文件**：`backend/user_hooks.py`

```python
from typing import Callable

class UserHooks:
    def __init__(self):
        # ── 注册大模型（key = 前端显示名，value = 调用函数）──
        self.models: dict[str, Callable] = {
            "deepseek-local": self._call_deepseek,
            "qwen-local":     self._call_qwen,
        }

    # ── 模型调用函数规范 ──
    # 参数: prompt（已渲染的完整字符串）, role（角色名）
    # 返回: JSON 字符串，必须包含 GT 列名对应字段（值为 "是"/"否"）+ 可选 "thinking"
    def _call_deepseek(self, prompt: str, role: str) -> str:
        return '{"thinking": "推理过程...", "情感分类": "是"}'

    # ── 三个扩展钩子 ──

    def translate(self, text: str, target_lang: str = "zh") -> str:
        """前端「翻译」按钮触发。返回翻译后的文本字符串。"""
        raise NotImplementedError

    def analyze(self, row_data: dict) -> dict:
        """前端「分析」按钮触发。
        row_data: {"列名": "值", ...}（完整行数据，包含大字段）
        返回任意 dict，前端以 JSON 高亮格式展示。"""
        raise NotImplementedError

    def init_prompt(
        self,
        prompt_template: str,
        row_data: dict,
        knowledge: list[dict],             # [{"name": "...", "content": "..."}, ...]
        error_sets: dict[str, list[dict]]  # {"集合名": [{"列名": "值"}, ...]}
    ) -> str:
        """processingMode='custom' 时调用，完全自定义 Prompt 构建逻辑。
        
        注意：row_data 中包含 API Part 1–7、Summary 等大字段的完整内容。
        若 Prompt 过长，需在此函数中自行截断或摘要处理。
        
        返回最终发送给模型的 Prompt 字符串。"""
        raise NotImplementedError
```

**Prompt 渲染流程（auto 模式）**：

```
template
  → 替换 {{列名}}              （来自 row_data，大字段完整注入）
  → 替换 {{知识库.名称}}        （来自 knowledge[i].content）
  → 替换 {{错题集.名称}}        （来自 error_set entries 序列化 JSON）
  → 发送给对应模型函数
```

**Prompt 渲染流程（custom 模式）**：

```
template + row_data + knowledge + error_sets → init_prompt() → 最终 Prompt → 模型函数
```

---

## 8. 后端 API 规格

> 基础路径：`http://localhost:8000/api`

### 8.1 数据集

| Method | Path | Body / Params | 返回 |
|--------|------|---------------|------|
| GET | `/datasets` | `?scene=SPN` | `Dataset[]` |
| POST | `/datasets/import` | FormData: `file` | `{id, columns[], columnTypes{}, rowCount, colCount}` |
| PUT | `/datasets/{id}/mapping` | `{mapping: {...}}` | `Dataset` |
| DELETE | `/datasets/{id}` | — | `{ok: true}` |
| POST | `/datasets/merge` | `{ids[], name, scene}` | `Dataset` |

**GT 列验证**（`PUT /datasets/{id}/mapping` 时）：

后端校验 `mapping.gtCol` 对应列的所有值是否为 `是`/`否`，返回：

```json
{
  "dataset": {...},
  "gtValidation": {
    "valid": false,
    "invalidCount": 3,
    "invalidSamples": ["可能", "N/A", ""]
  }
}
```

### 8.2 标注行

| Method | Path | Params | 返回 |
|--------|------|--------|------|
| GET | `/datasets/{id}/rows` | `?page=1&size=50&status=pending&q=关键词` | `{rows: AnnotationRow[], total: number}` |
| GET | `/rows/{id}` | — | `AnnotationRow & {history: RowHistory[]}` |
| PUT | `/rows/{id}` | `{data: {...}}` | `AnnotationRow` |
| DELETE | `/rows/{id}` | — | `{ok: true}` |

> `GET /rows/{id}` 返回完整行数据（含大字段），不做截断。

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
| DELETE | `/tasks/{id}` | — | 取消任务，`{ok: true}` |
| **GET** | **`/tasks/{id}/stream`** | — | **SSE 流** |

**SSE 事件格式**：

```
// 每行完成：
data: {"type":"row_done","rowId":"r-1000","status":"done","results":{"[初审]_情感分类":"是","[初审]_thinking":"..."}}

// 每行失败：
data: {"type":"row_failed","rowId":"r-1001","status":"failed","error":"timeout"}

// 任务完成：
data: {"type":"task_done","taskId":"tk-ab12","accuracy":0.856,"finishedAt":"2025-05-28T10:30:00"}
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
| GET | `/error-entries` | `?setId=` (空=散错题) | `ErrorEntry[]` |
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
| GET | `/scenes` | `string[]`（从所有资源的 scene 字段自动聚合） |

---

## 9. TP/TN/FP/FN 指标逻辑

### 9.1 核心定义

人工答案（GT，`mapping.gtCol` 列）和模型答案（`[角色]_gtCol` 结果列）均为二值：`"是"` 或 `"否"`。

| 组合 | 分类 | 含义 |
|------|------|------|
| 模型=是 & 人工=是 | **TP**（真正例）| 模型正确预测为正 |
| 模型=否 & 人工=否 | **TN**（真负例）| 模型正确预测为负 |
| 模型=是 & 人工=否 | **FP**（假正例）| 模型误报（应否却判是）|
| 模型=否 & 人工=是 | **FN**（假负例）| 模型漏报（应是却判否）|

### 9.2 五项评测指标

```
准确率 Accuracy    = (TP + TN) / (TP + TN + FP + FN)
精确率 Precision   = TP / (TP + FP)
召回率 Recall      = TP / (TP + FN)
F1                = 2 × Precision × Recall / (Precision + Recall)
特异度 Specificity = TN / (TN + FP)
```

分母为 0 时显示 `0.0%`，不抛错。

### 9.3 计算规则

- 只有 `status === 'done'` 的行参与混淆矩阵和评测指标计算
- `pending / running / failed / partial` 参与数据统计组，不参与混淆矩阵
- 混淆矩阵使用「对照角色」下拉选定的 Prompt 角色的结果列与 GT 比较
- 方案含多个 Prompt 角色时，用户切换对照角色，指标条随之刷新

---

## 10. 术语表

| 术语 | 含义 |
|------|------|
| **场景（Scene）** | 业务场景标签（如 SPN/IPRAN），所有资源的通用筛选维度 |
| **GT 列** | Ground Truth 列，数据集中人工标注的答案列，值为 是/否 |
| **基础字段** | 数据集中体积小的元信息列（ID、工单名称、工单类型等），适合表格展示 |
| **大字段** | API Part 1–7、Summary、标注数据等体积大的列，仅在详情中完整展示 |
| **Prompt 卡片** | Prompt 管理中的一条实体，含模板、角色、处理模式等元数据 |
| **角色（Role）** | Prompt 卡片的标识符，如「初审」「质检」，标注结果列名为 `[角色]_gtCol` |
| **方案（Scheme）** | 一组有序 Prompt 卡片的组合，单次标注按方案中每个 Prompt 各调用一次模型 |
| **对照角色** | 计算混淆矩阵时选用的 Prompt 角色，其预测结果与 GT 比较 |
| **UserHooks** | 用户自定义代码类（`user_hooks.py`），注册模型并实现扩展钩子 |
| **散错题** | 未归入任何错题集的单条错例，`setId = null` |
| **错题集** | 已命名的错题集合，在 Prompt 中通过 `{{错题集.名称}}` 引用 |
| **处理模式** | Prompt 变量处理方式：`auto`（占位符自动替换）或 `custom`（调用 init_prompt）|
| **SSE** | Server-Sent Events，后端向前端实时推送标注进度的长连接协议 |
