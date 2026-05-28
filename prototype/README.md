# 标注 Lab — 高保真静态原型

> 配套 [`prd-business.md`](../prd-business.md) · 设计语言 [`nexus-design-system.md`](../nexus-design-system.md)
> **纯前端原型,无后端依赖**。直接用浏览器打开 `index.html` 即可。

---

## 怎么跑

```bash
# 任选其一启动一个本地静态服务(因为页面之间用 fetch 加载 sidebar.html)
cd prototype
python3 -m http.server 8080
# 然后浏览器打开 http://localhost:8080
```

> 直接双击 `index.html` 可能因浏览器对 `file://` 的 CORS 限制导致 sidebar 加载失败。**强烈建议起一个静态服务器**(命令见上)。

---

## 目录结构

```
prototype/
├── index.html                     # 入口,自动跳转到数据集管理
├── pages/                         # 每个菜单一个 HTML
│   ├── datasets.html              # 数据集管理(侧边栏 1)
│   ├── workbench.html             # 标注工作台 ⭐(侧边栏 2,内含 3 Tab)
│   ├── prompts.html               # Prompt 管理(侧边栏 3)
│   ├── knowledge.html             # 知识管理(侧边栏 4)
│   ├── error-sets.html            # 错题集管理(侧边栏 5)
│   └── models.html                # 模型管理(侧边栏 6,只读)
├── partials/
│   └── sidebar.html               # 共享侧边栏,各页 fetch 注入
├── assets/
│   ├── shared.css                 # 通用样式(滚动条、徽章、抽屉、skeleton、JSON 高亮…)
│   ├── shared.js                  # 通用工具(Toast、Drawer、Modal、JSON、复制、下载…)
│   ├── mock/                      # mock 数据(按模块拆分,各页面按需加载)
│   │   ├── scenes.js              # 场景标签
│   │   ├── datasets.js            # 数据集
│   │   ├── prompts.js             # Prompt 库
│   │   ├── schemes.js             # 方案
│   │   ├── models.js              # 模型(模拟 UserHooks.models)
│   │   ├── knowledge.js           # 知识片段
│   │   ├── error-sets.js          # 错题 + 错题集
│   │   ├── tasks.js               # 任务历史
│   │   └── annotation-data.js     # 标注行数据(80 行,覆盖各种状态)
│   └── pages/                     # 各页面专属 JS
│       ├── datasets.js
│       ├── workbench.js           # 最大,含指标条/表格/抽屉/添加错题…
│       ├── prompts.js
│       ├── knowledge.js
│       ├── error-sets.js
│       └── models.js
└── README.md
```

---

## 性能设计

针对"上传 Excel 后操作卡顿"的问题,本原型在以下几处做了优化:

1. **多页面 + 按需加载** — 每个菜单独立 HTML,只加载自身需要的 mock 数据与 JS,避免单文件臃肿
2. **事件委托** — 表格行的勾选、双击、菜单按钮全部通过 `tbody.onclick`/`ondblclick` 单一监听处理,80 行表格不会注册 80 套事件
3. **选中态无重渲** — 勾选行只切换 CSS class + 维护 `Set`,不整表 rerender
4. **筛选 debounce** — 搜索输入用 150ms debounce
5. **CSS class 驱动动画** — 抽屉、modal、toast 都用 CSS transform/opacity,GPU 加速

> 若未来 mock 数据扩到 1000+ 行,可以再加虚拟滚动(`assets/components/` 已预留位置)。

---

## 核心闭环演示路径

1. 进入 **数据集管理** → 看到 5 个 mock 数据集 → 点「编辑映射」体验 4 项规则配置
2. 切到 **Prompt 管理** → 点任意行「编辑」→ 看处理模式开关 + 输出建议联动 + 可用变量侧栏
3. 切到 **标注工作台** → 看 14 项指标条 + 选数据集 + 选方案 → 勾几行 → 「开始标注」→ **观察行级 loading 动效(单元格 spinner + 状态徽章变化)**
4. 双击任意行 → 行详情侧边抽屉(原始字段 + 渲染 Prompt + 各角色返回)→ 切「历史」Tab
5. 多选错例行 → 批量栏「加入错题本」→ 选列 → JSON 预览 → 保存
6. 切到 **错题集管理** → 找到刚加的散错题 → 勾选合并 → 命名为错题集
7. 切回 **Prompt 管理** → 编辑 Prompt → 右侧侧栏可看到刚命名的错题集占位符 → 一键插入
8. 切到 **模型管理** → 只读列表 + 代码示例(说明用户如何在 UserHooks 中新增模型)

---

## 与 PRD 的对应

| PRD 章节 | 原型文件 |
| --- | --- |
| §3.1 全局侧边栏(6 项)| `partials/sidebar.html` |
| §6.1 场景标签 | 各页面顶部「场景 ▾」筛选器 |
| §6.2 数据集管理 + 字段映射 | `pages/datasets.html` |
| §6.3 Prompt 管理 + 处理模式 + 输出建议 | `pages/prompts.html` |
| §6.4 模型管理 + UserHooks.models | `pages/models.html` |
| §6.5 标注工作台(3 Tab + 指标条 + 7 行操作 + 批量栏) | `pages/workbench.html` |
| §6.6 行详情侧边抽屉 | 同 workbench 内 |
| §6.7 知识管理 | `pages/knowledge.html` |
| §6.8 错题集管理(双栏 + 合并命名) | `pages/error-sets.html` |
| §7 加载动效(spinner / skeleton / 进度条) | 散布于各页 |
| §8 Mock 实现(translate/analyze/init_prompt) | 在 workbench.js 中模拟 |

---

## 已知简化

- 真实场景下数据量上 1k 行需要虚拟滚动,本原型为演示用 80 行
- 「方案」的新建/编辑表单仅占位,核心数据结构已可用
- 「编辑行」「列设置」等次要交互打了 toast 占位
- UserHooks 的真实 Python 代码不在原型范围内,模型管理页提供代码示例
