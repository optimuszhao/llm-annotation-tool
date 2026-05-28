# Nexus 设计系统 PRD

> 本文档基于 `nexus-companies.html` 沉淀,定义 Nexus 产品的视觉风格与组件规范。后续所有页面(Dashboard / Leads / Opportunities / Contacts / Forms / Emails 等)均需遵循本规范,保证体验一致。

---

## 1. 设计语言总览

| 维度 | 定位 |
| --- | --- |
| 风格 | 现代、专业、轻量;企业级 SaaS / CRM |
| 信息密度 | 中等偏高(表格场景需高密度信息呈现) |
| 主色情绪 | 绿色主导 → 增长、行动、积极 |
| 配色基调 | 深色侧边栏 + 浅色主内容(经典双区布局) |
| 圆角语言 | 中等圆角(8–12px),柔和但不卡通 |
| 装饰原则 | 极简,功能优先;以颜色和留白引导视线,不依赖描边和阴影 |

**一句话总结**:深色导航 + 浅色工作区 + 翠绿主操作色 + 多彩状态徽章,典型现代 SaaS Dashboard 美学。

---

## 2. 色彩系统

### 2.1 品牌主色

| Token | 色值 | 用途 |
| --- | --- | --- |
| `brand` | `#22C55E` (Tailwind `green-500`) | 主操作按钮、激活态、品牌色 |
| `brandDark` | `#16A34A` (`green-600`) | 主按钮 hover、Tab 激活文字 |
| `brand-soft` | `#DCFCE7` (`green-100`) | 配合主色的浅底,如 Active 徽章背景 |

### 2.2 侧边栏深色

| Token | 色值 | 用途 |
| --- | --- | --- |
| `sidebar` | `#0B1220` | 侧边栏底色 |
| `sidebar2` | `#111A2E` | 二级表面、分组背景 |
| `sidebar3` | `#1B2640` | 激活态、hover 高亮 |
| 侧边栏文字 | `text-slate-300` 默认 / `text-white` 激活 / `text-slate-500` 分组标题 |

### 2.3 主区中性色

| Token | 色值 | 用途 |
| --- | --- | --- |
| 页面底 | `bg-white` |
| 表格行分隔 | `border-slate-100` |
| 卡片描边 | `border-slate-200` |
| 主文字 | `text-slate-900` (标题) / `text-slate-800` (正文) |
| 次级文字 | `text-slate-700` (表格内容) / `text-slate-500` (标签、说明) |
| 占位文字 | `text-slate-400` |

### 2.4 状态语义色(成对使用 `*-100` 背景 + `*-700` 文字 + `*-200/60` ring)

| 含义 | 调色板 | 示例 |
| --- | --- | --- |
| **Active / 成功** | `emerald` | Active 徽章、Sort/Filter 按钮 icon |
| **Prospect / 待跟进** | `amber` | Prospect 徽章 |
| **Inactive / 中性** | `slate` | Inactive 徽章 |
| **信息 / 链接** | `sky` | 中等规模徽章 |
| **强调 / 计数** | `violet` | 大规模徽章 |
| **危险 / 红点** | `red-500` | Task 红点角标 |

### 2.5 数据可视化色板(用于 logo / 头像 / 图表分类)

按截图沉淀的 15 色循环色板,用于多分类数据着色:

`blue-500` · `orange-500` · `emerald-500` · `rose-500` · `violet-500` · `slate-900` · `teal-500` · `slate-800` · `fuchsia-500` · `sky-500` · `green-500` · `purple-500` · `pink-500` · `lime-600` · `pink-400`

> 规则:首字母固定为白色,背景使用上述色板,圆角统一 `rounded-lg`。

---

## 3. 字体与排版

- **字族**:`Inter`,fallback `ui-sans-serif, system-ui, sans-serif`
- **抗锯齿**:`antialiased`
- **数字**:与正文同字,不单独使用 tabular-nums(表格序号场景可后续按需补)

| 角色 | 大小 | 字重 | 颜色 |
| --- | --- | --- | --- |
| 页面标题 H1 | `text-[28px]` | `font-bold` | `slate-900` |
| Section / 分组标题 | `text-[11px] uppercase tracking-wider` | `font-semibold` | `slate-500` |
| Tab 文本 | `text-sm` | 激活 `font-semibold` / 普通 `font-medium` | 激活 `green-600` / 普通 `slate-500` |
| 表头 | `text-[13px]` | `font-medium` | `slate-500` |
| 表格正文 | `text-[14px]` | `font-medium` 仅公司名 | `slate-800` / 次级 `slate-700` |
| 徽章 | `text-xs` | `font-medium` | 同色系 `*-700` |
| 用户名(侧边栏) | `text-sm font-semibold` | | `white` |
| 用户邮箱(侧边栏) | `text-xs` | | `slate-400` |
| 按钮文字 | `text-sm` | 主按钮 `font-semibold` / 次按钮 `font-medium` | |

---

## 4. 间距、圆角、阴影

### 4.1 圆角

| 尺寸 | Token | 适用 |
| --- | --- | --- |
| `rounded-md` (6px) | 小图标按钮、徽章 |
| `rounded-lg` (8px) | 侧边栏菜单项、logo 方块 |
| `rounded-xl` (12px) | 主区按钮、输入框、icon button |
| `rounded-full` | 头像、红点角标、Logo 圆球 |

### 4.2 间距体系(基于 Tailwind 4px 栅格)

- **主内容横向 padding**:`px-8` (32px)
- **侧边栏内部 padding**:外层 `px-3`,菜单项 `px-3 py-2`
- **菜单项间距**:`space-y-1`(4px)
- **分组之间**:`mt-6`(24px)
- **表格行高**:`py-3`(单元格上下 12px)
- **按钮高度**:统一 `h-10`(40px),icon-only 也是 `h-10 w-10`
- **输入框高度**:`h-10`,搜索框宽 `w-72`

### 4.3 阴影

整体减克制,仅主按钮使用品牌色软阴影增强 CTA:

```css
shadow-sm shadow-emerald-500/30
```

其他元素**不使用阴影**,改用边框/底色区分层级。

---

## 5. 图标系统

- **来源**:全部内联 SVG,无外部图标字体
- **网格**:24×24 viewBox
- **常用尺寸**:导航 `h-[18px]`,工具栏/按钮 `h-4`–`h-5`
- **风格**:线性图标为主,`stroke-width="2"`,`stroke-linecap="round"`,`stroke-linejoin="round"`;品牌 logo / Status 等少量用 filled
- **颜色**:继承父级 `currentColor`,不在 SVG 内写死颜色

> 新增图标时请保持 stroke 风格统一,避免线性 + filled 混用同一组按钮内。

---

## 6. 组件规范

### 6.1 侧边栏导航项

```text
flex items-center gap-3 rounded-lg px-3 py-2 text-sm
默认:   text-slate-300, 透明背景
hover:   bg-sidebar3/60
active:  bg-sidebar3 text-white font-medium
```

- 图标左对齐,文字 14px
- 计数/badge 用 `ml-auto`,小圆药丸,红色 `bg-red-500`

### 6.2 按钮

| 类型 | Class 摘要 | 用途 |
| --- | --- | --- |
| **Primary** | `h-10 rounded-xl bg-brand text-white font-semibold shadow-sm shadow-emerald-500/30 hover:bg-brandDark` | Add Company、提交类 CTA(每屏最多 1 个) |
| **Secondary** | `h-10 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50` | Sort / Filter / List View 等工具按钮 |
| **Icon (Light)** | `h-10 w-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200` | Header 铃铛、帮助等 |
| **Icon (Primary)** | `h-10 w-10 rounded-xl bg-brand text-white` | Header 主新建按钮 |
| **Ghost** | `text-slate-500 hover:text-slate-900` | Manage Views、表头 + 等 |

> **规则**:一屏内最多 1 个 Primary 按钮;Secondary 按钮 icon 用 `text-emerald-500` 点睛。

### 6.3 输入框

```text
h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm
placeholder: text-slate-400
focus:    border-emerald-400 + ring-2 ring-emerald-100
```

- 前缀图标绝对定位 `left-3 top-1/2 -translate-y-1/2 text-slate-400`

### 6.4 Tab

```text
border-b-2 px-1 pb-3 pt-1 text-sm
默认: text-slate-500 border-transparent
激活: text-green-600 border-green-500 font-semibold
hover: text-slate-900
```

- 整组 Tab 父容器有 `border-b border-slate-200` 形成基线,激活 Tab 下划线压在基线之上

### 6.5 徽章 / Pill

```text
inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium
+ bg-{color}-100 text-{color}-700 ring-1 ring-{color}-200/60
```

- 圆角 `rounded-md`,而非 `rounded-full`
- 必带 `ring-1` 内描边以提升在浅色背景上的可读性

### 6.6 表格

| 元素 | 规范 |
| --- | --- |
| 容器 | 主区 `px-8 pb-8`,内部 `overflow-auto` |
| 表头 | `text-[13px] text-slate-500 font-medium`,底部 `border-b border-slate-200` |
| 单元格 | `px-4 py-3 border-b border-slate-100` |
| 行 hover | `hover:bg-slate-50/70`,带 `transition-colors` |
| 序号列 | 宽 `w-12`,文字 `text-slate-400` |
| 末列 + 按钮 | 宽 `w-10`,右对齐 |

**表格设计原则**:
1. 无外框、无垂直分隔线,仅用水平细分隔
2. 重要列(公司名)字重 `font-medium`,其余 `font-normal`
3. 第一列与最后一列保持 padding 对齐主区 `px-8`(行内已经有 `px-4`,可按需在外层补足)

### 6.7 用户卡片(侧边栏底部)

- 头像 36×36 `rounded-full`,加 `ring-2 ring-white/10`
- 用户名 + 邮箱两行,均 `truncate`
- 右侧展开箭头,hover 整张卡片提亮

### 6.8 Logo 方块(数据 logo)

```text
flex h-8 w-8 items-center justify-center rounded-lg bg-{color} text-white
```

- 配合 §2.5 的 15 色循环色板
- 内置 16×16 SVG 图标,统一白色

---

## 7. 页面骨架模板

任何新业务页面应遵循以下结构:

```text
<div class="flex h-screen">
  <aside class="w-64 bg-sidebar"> ... 共享侧边栏 ... </aside>
  <main class="flex-1 flex flex-col bg-white overflow-hidden">
    <header class="px-8 pt-6 pb-3">  标题 + 右上 Action Icons  </header>
    <div   class="px-8 border-b">    Tabs + Manage Views        </div>
    <div   class="px-8 py-4">        Toolbar (Search/Filter/CTA)</div>
    <div   class="flex-1 overflow-auto px-8 pb-8"> 内容区 </div>
  </main>
</div>
```

**布局红线**:
- 侧边栏宽度永远 `w-64`(256px),不可变窄
- 主区横向 padding 永远 `px-8`,保持左右对齐
- 标题区高度 ~72px,Tab 区高度 ~48px,工具栏 ~72px,内容区自适应

---

## 8. 交互与状态规范

### 8.1 Hover

- 浅色按钮:背景由 `bg-slate-100` → `bg-slate-200`
- 主按钮:`bg-brand` → `bg-brandDark`
- 表格行:无背景 → `bg-slate-50/70`
- 侧边栏菜单:无 → `bg-sidebar3/60`
- 过渡:必要时加 `transition-colors`(默认 150ms)

### 8.2 Focus(键盘可达)

- 输入框:`focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100`
- 按钮:后续补 `focus-visible:ring-2 ring-emerald-300 ring-offset-2`(本期未实现,新增页面应补全)

### 8.3 Active(选中态)

- Tab:绿色文字 + 绿色下划线
- 侧边栏菜单:`bg-sidebar3 text-white`
- 单选按钮组:沿用 Tab 配色逻辑

### 8.4 禁用

- `opacity-50 cursor-not-allowed`,文字 / 图标颜色不变

### 8.5 加载

- 暂未定义,推荐使用 Tailwind `animate-pulse` 骨架屏或 `animate-spin` 旋转 icon,颜色对齐 `slate-200` / `emerald-500`

---

## 9. 内容与文案

- **标题**:名词为主("Companies"、"Leads"),不带动词,首字母大写
- **按钮**:`<动词> <对象>`,如 `Add Company`、`Create Lead`、`Send Email`
- **空状态**:`No <object> yet` + 一句指引 + Primary 按钮
- **时间**:相对时间("About 2 hours ago"、"2 days ago"、"1 month ago"),不显示绝对时间戳;hover tooltip 可展示绝对时间(后续可拓展)
- **地点**:国家全称,USA 例外可缩写

---

## 10. 可拓展指引(给后续开发)

### 新增页面 checklist

- [ ] 复用 §7 骨架与共享侧边栏(后续应抽离为 partial)
- [ ] 主操作按钮使用 §6.2 Primary,且仅 1 个
- [ ] 列表/表格场景沿用 §6.6 表格规范
- [ ] 状态字段一律使用 §6.5 徽章
- [ ] 新增图标遵循 §5 线性 24px 网格
- [ ] 颜色仅可从 §2 色板取用,不引入新色相

### 新增组件 checklist

- [ ] 圆角从 §4.1 表格中选取
- [ ] 间距使用 4px 栅格
- [ ] hover / focus / active 三态均覆盖
- [ ] 暗色侧边栏内的组件必须额外验证对比度

### 暂未覆盖、需后续补充

1. **暗色模式**(本版本仅侧边栏暗,主区未提供 dark variant)
2. **响应式断点**(当前为桌面优先 ≥1280px,移动端折叠侧边栏待设计)
3. **动效语言**(微动效、转场)
4. **空状态 / 错误 / 加载** 插画与文案模版
5. **图表样式**(Dashboard 页将引入,需对齐主色与中性色)
6. **表单组件**(下拉、日期、多选等,本版本未涉及)

---

## 11. 参考实现

- 完整 HTML 演示:[`nexus-companies.html`](nexus-companies.html)
- 该文件可直接用浏览器打开作为像素级参照
