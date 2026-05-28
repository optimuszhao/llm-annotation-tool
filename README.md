# Excel 自定义标注工具 — `cc_528` 分支

> 这是一条**全新独立分支**,与 `main` 没有共享历史。
> 内容是一份**高保真静态原型** + **业务 PRD** + **视觉设计系统**,用于演示与对齐。

---

## 这是什么

一个面向大模型开发者的**本地化数据标注 + Prompt 评测工具**的前端原型。覆盖的核心闭环:

> **导入 Excel → 配置 Prompt → 选数据 + 选方案 → 跑批 → 看 14 项指标 → 错例反哺错题集 → 改 Prompt → 再跑 → 提升准确率**

本分支只包含**静态前端原型**与**文档**,真实后端(FastAPI / SQLite / 多线程调度 / UserHooks)在后续迭代中实现。

---

## 怎么运行

原型是纯静态前端,但页面之间通过 `fetch` 注入共享侧边栏,**直接双击 HTML 会被浏览器的 CORS 拦截**。需要起一个本地静态服务:

### 方式一:Python(推荐)

```bash
cd prototype
python3 -m http.server 8080
```

然后浏览器打开 → **<http://localhost:8080/>**(自动跳转到数据集管理页)。

### 方式二:Node

```bash
cd prototype
npx serve -l 8080
# 或:npx http-server -p 8080
```

### 方式三:VS Code Live Server 插件

在 VS Code 里右键 `prototype/index.html` → "Open with Live Server"。

> 端口冲突时,把 `8080` 改成空闲端口(如 `5500`、`8000`)即可。

---

## 演示路径(完整走通核心闭环 ~3 分钟)

1. **数据集管理** — 看到 5 个 mock 数据集 → 点「编辑映射」体验 4 项字段映射规则
2. **Prompt 管理** — 点任意 Prompt「编辑」→ 看处理模式开关(自动 / 自定义)、输出建议联动答案列、右侧可用变量侧栏
3. **标注工作台** ⭐(核心)
   - 看顶部 **14 项指标条**(数据统计 5 + 混淆矩阵 4 + 评测 5)
   - 选数据集 + 选方案 → 勾几行 → 「开始标注」
   - **观察行级 loading 动效**(单元格 spinner + 状态徽章变化,1.5~5.5 秒模拟返回)
   - 点指标块(如 FP / 失败) → 表格联动筛选
4. **双击任意行** — 行详情侧边抽屉(原始字段 + 渲染后 Prompt + 各角色 JSON)
5. **多选错例行 → 「加入错题本」** — 选列 → JSON 预览 → 确认保存
6. **错题集管理** — 找到刚保存的散错题 → 勾选 → 「合并所选为错题集」→ 命名
7. **回到 Prompt 管理** — 编辑 Prompt → 右侧侧栏的「错题集」会列出刚命名的集合 → 一键插入占位符
8. **模型管理** — 只读列表 + 代码示例(说明 `UserHooks.models` 字典如何注册模型)

---

## 目录结构

```
.
├── prototype/                      # 静态原型(纯前端,无后端)
│   ├── index.html                  # 入口,重定向到数据集管理
│   ├── pages/                      # 每个菜单独立一个 HTML
│   │   ├── datasets.html           # 数据集管理(侧边栏 1)
│   │   ├── workbench.html          # 标注工作台 ⭐(侧边栏 2,3 个 Tab)
│   │   ├── prompts.html            # Prompt 管理(侧边栏 3)
│   │   ├── knowledge.html          # 知识管理(侧边栏 4)
│   │   ├── error-sets.html         # 错题集管理(侧边栏 5)
│   │   └── models.html             # 模型管理(侧边栏 6,只读)
│   ├── partials/sidebar.html       # 共享侧边栏,各页 fetch 注入
│   ├── assets/
│   │   ├── shared.css              # 通用样式(徽章/抽屉/skeleton/JSON 高亮)
│   │   ├── shared.js               # 通用工具(Toast/Drawer/Modal/JSON/复制/下载)
│   │   ├── mock/                   # mock 数据(9 个独立文件,按需加载)
│   │   └── pages/                  # 各页专属 JS
│   └── README.md                   # 原型自身的 README
│
├── prd-business.md                 # 业务 PRD(11 章节,完整业务规格)
├── nexus-design-system.md          # 视觉设计系统(色彩 / 字体 / 组件)
├── nexus-companies.html            # 视觉基线参考(Nexus Companies 复刻)
└── README.md                       # 本文件
```

---

## 关键设计点

### 1. 前端性能(针对之前"上传 Excel 后操作卡顿"问题)

- **多页面 + 按需加载**:每个菜单独立 HTML,只加载自身需要的 mock 数据与 JS,避免单文件臃肿
- **事件委托**:表格行的勾选、双击、菜单按钮全部由 `tbody.onclick` 单一监听处理,80 行不会注册 80 套事件
- **选中态无重渲**:勾选只切 CSS class + 维护 `Set`,不整表 rerender
- **搜索 debounce**:输入 150ms 才触发筛选
- **CSS class 驱动动画**:抽屉/Modal/Toast 都是 `transform`/`opacity`,GPU 加速

### 2. 业务结构(详见 `prd-business.md`)

- 侧边栏 6 个扁平菜单,场景从顶层导航降级为标签字段
- Prompt 升级为全局可复用资源,方案 = 引用一组 Prompt 的组合
- UserHooks 用户实现区:**1 个模型字典 `models` + 3 个钩子方法**(`translate` / `analyze` / `init_prompt`)
- Prompt 处理模式:**自动占位符** vs **自定义处理**(走 `init_prompt`)
- 错题集闭环:标注 → 发现错例 → 加入错题本 → 合并命名 → Prompt 引用 `{{错题集.<名称>}}` → 重跑

### 3. 14 项指标条(标注工作台顶部)

| 分组 | 项目 |
| --- | --- |
| 数据统计(5,可点击筛选)| 总数 / 已标注 / 未标注 / 进行中 / 失败 |
| 混淆矩阵(4,可点击筛选)| TP / TN / FP / FN |
| 评测指标(5,只读)| 准确率 / 精确率 / 召回率 / F1 / 特异度 |

---

## 配套文档

- **业务 PRD**:[`prd-business.md`](./prd-business.md) — 包含术语表、菜单总览、业务对象、详细功能规格、加载动效规范、Mock 实现说明
- **视觉设计系统**:[`nexus-design-system.md`](./nexus-design-system.md) — 色彩、字体、间距、组件规范
- **基线 UI**:[`nexus-companies.html`](./nexus-companies.html) — 视觉参考的原始复刻,各页面均沿用此风格

---

## 已知简化(后续迭代补)

- 真实场景下大数据量(1k+ 行)需要**虚拟滚动**,原型为演示用 80 行
- 「方案」的新建/编辑表单仅占位,核心数据结构已就绪
- 「编辑行」「列设置」等次要交互打 toast 占位
- 真实 Python 后端(FastAPI + SQLite + 多线程 + UserHooks)在后续 commit 中加入
