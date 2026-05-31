const sceneStats = [
  { title: "数据集", value: "12", note: "12,840 行数据" },
  { title: "Prompt", value: "18", note: "5 个角色可复用" },
  { title: "知识库", value: "26", note: "业务规则与口径" },
  { title: "错题集", value: "9", note: "高频误判样例" },
];

const schemeCards = [
  {
    name: "质检员 + 复核员 · call_model",
    tag: "主方案",
    description: "覆盖投诉审核质检主流程，强调稳健判断和可解释输出。",
    datasets: "SPN_测试数据.xlsx",
    prompts: ["质检员", "复核员"],
    knowledge: ["产品规则", "审核口径"],
    errors: ["高频误判样例"],
    method: "call_model",
    mode: "自动占位符",
    metrics: ["准确率 91.8%", "并发 5", "全量标注"],
  },
  {
    name: "高召回审核 · call_model",
    tag: "实验",
    description: "提高风险样本召回，适合批量回归和边界样例验证。",
    datasets: "售后审核_抽样集.xlsx",
    prompts: ["初审", "安全检查", "裁判"],
    knowledge: ["售后政策", "拒绝规则"],
    errors: ["边界误判集"],
    method: "call_model",
    mode: "自动占位符",
    metrics: ["准确率 88.2%", "并发 8", "批量标注"],
  },
  {
    name: "裁判角色 · build_prompts_custom",
    tag: "灰度",
    description: "由自定义 Prompt 初始化方法组装上下文，适合复杂规则试验。",
    datasets: "历史误判样本.xlsx",
    prompts: ["兜底裁判"],
    knowledge: ["裁判规则"],
    errors: ["历史误判样本"],
    method: "build_prompts_custom",
    mode: "自定义初始化",
    metrics: ["准确率 86.8%", "并发 3", "单条验证"],
  },
];

const datasetRows = [
  { name: "SPN_测试数据.xlsx", rows: "12,840", fields: "42 列", use: "主方案数据源" },
  { name: "售后审核_抽样集.xlsx", rows: "3,200", fields: "36 列", use: "批量回归" },
  { name: "历史误判样本.xlsx", rows: "976", fields: "28 列", use: "错题沉淀" },
];

export function renderManageStudioPage() {
  const root = document.querySelector("#page-manage-studio");
  if (!root) return;
  root.innerHTML = `
    <div class="evaluation-layout manage-studio-layout manage-studio-v2">
      <header class="evaluation-head manage-studio-head">
        <div>
          <p class="eyebrow">新数据集与方案管理</p>
          <h1>先维护场景，再沉淀资源，最后配置标注方案</h1>
          <span>方案是核心入口，它连接数据集、Prompt、知识库、错题集和标注方法。</span>
        </div>
        <div class="evaluation-head-actions">
          <button class="btn ghost" type="button">新增场景</button>
          <button class="btn primary" type="button">新增数据集</button>
        </div>
      </header>

      <section class="manage-logic-hero">
        <div class="logic-step primary">
          <span>01</span>
          <strong>场景</strong>
          <p>没有业务场景时，先新增场景。每个场景拥有独立的数据、Prompt、知识库、错题集和方案。</p>
        </div>
        <i>→</i>
        <div class="logic-step">
          <span>02</span>
          <strong>场景资源</strong>
          <p>在场景下导入数据集，并维护可被方案引用的 Prompt、知识库和错题集。</p>
        </div>
        <i>→</i>
        <div class="logic-step focus">
          <span>03</span>
          <strong>标注方案</strong>
          <p>方案决定标注时使用哪些资源和后台方法，是日常使用时最重要的管理对象。</p>
        </div>
      </section>

      <section class="manage-scene-strip">
        <div class="scene-summary">
          <span>当前场景</span>
          <strong>投诉审核质检</strong>
          <em>该场景下已有 3 个标注方案，可直接进入标注工作台使用。</em>
        </div>
        <div class="scene-tabs-preview">
          <button class="active" type="button">投诉审核质检</button>
          <button type="button">工单情绪分析</button>
          <button type="button">售后规则回归</button>
          <button type="button">+ 新增场景</button>
        </div>
      </section>

      <section class="manage-resource-grid compact">
        ${sceneStats.map(renderSceneStat).join("")}
      </section>

      <section class="evaluation-panel scheme-focus-panel">
        <div class="evaluation-panel-head">
          <div>
            <strong>当前场景的标注方案</strong>
            <span>每个方案都说明自己会使用哪些数据集、Prompt、知识库、错题集和标注方法。</span>
          </div>
          <button class="btn primary" type="button">新增方案</button>
        </div>
        <div class="scheme-card-grid">
          ${schemeCards.map(renderSchemeCard).join("")}
        </div>
      </section>

      <div class="manage-studio-main">
        <section class="evaluation-panel">
          <div class="evaluation-panel-head">
            <div>
              <strong>场景下的数据集</strong>
              <span>新增数据集后，方案可以选择这些数据作为标注对象。</span>
            </div>
            <button class="btn ghost" type="button">新增数据集</button>
          </div>
          <div class="dataset-preview-list">
            ${datasetRows.map(renderDatasetRow).join("")}
          </div>
        </section>

        <section class="evaluation-panel resource-relation-panel">
          <div class="evaluation-panel-head">
            <div>
              <strong>方案如何连接资源</strong>
              <span>资源平时低频维护，真正使用时通过方案完成组合。</span>
            </div>
          </div>
          <div class="relation-map">
            ${renderRelationNode("Prompt", "角色指令", "质检员、复核员、裁判")}
            ${renderRelationNode("知识库", "业务上下文", "产品规则、审核口径")}
            ${renderRelationNode("错题集", "误判经验", "高频误判、边界样例")}
            ${renderRelationNode("标注方法", "后台调用", "call_model")}
          </div>
          <div class="mapping-preview">
            <strong>字段映射</strong>
            <span>人工答案列：情感分类</span>
            <span>模型答案列：GPT4_标注</span>
            <span>上下文字段：Summary、标注数据</span>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderSceneStat(item) {
  return `
    <article class="evaluation-stat manage-resource-card">
      <span>${item.title}</span>
      <strong>${item.value}</strong>
      <em>${item.note}</em>
    </article>
  `;
}

function renderSchemeCard(scheme) {
  return `
    <article class="scheme-focus-card">
      <div class="scheme-focus-head">
        <div>
          <strong>${scheme.name}</strong>
          <span>${scheme.description}</span>
        </div>
        <em>${scheme.tag}</em>
      </div>
      <div class="scheme-resource-links">
        ${renderLinkGroup("数据集", [scheme.datasets])}
        ${renderLinkGroup("Prompt", scheme.prompts)}
        ${renderLinkGroup("知识库", scheme.knowledge)}
        ${renderLinkGroup("错题集", scheme.errors)}
      </div>
      <div class="scheme-method-line">
        <span>${scheme.mode}</span>
        <span>${scheme.method}</span>
      </div>
      <div class="scheme-metric-line">
        ${scheme.metrics.map((item) => `<span>${item}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderLinkGroup(title, items) {
  return `
    <div class="link-group">
      <strong>${title}</strong>
      <div>${items.map((item) => `<span>${item}</span>`).join("")}</div>
    </div>
  `;
}

function renderDatasetRow(dataset) {
  return `
    <article class="dataset-preview-row">
      <div>
        <strong>${dataset.name}</strong>
        <span>${dataset.rows} 行 · ${dataset.fields}</span>
      </div>
      <em>${dataset.use}</em>
      <button class="btn ghost" type="button">查看</button>
    </article>
  `;
}

function renderRelationNode(title, desc, detail) {
  return `
    <article class="relation-node">
      <span>${title}</span>
      <strong>${desc}</strong>
      <p>${detail}</p>
    </article>
  `;
}
