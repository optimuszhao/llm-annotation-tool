import { api, loadSceneResources, loadState, state, toast } from "/assets/app.js";

let activeDemoScene = "spn";

const demoScenes = [
  {
    id: "spn",
    name: "SPN",
    desc: "面向 SPN 运维工单的情感分类与故障初审场景。",
    resources: { datasets: 2, prompts: 6, knowledge: 4, errorSets: 1 },
    schemes: [
      { name: "双角色情感分类", model: "demo", concurrency: 3, method: "call_model" },
      { name: "故障根因初审", model: "demo", concurrency: 6, method: "analyze_fault" },
    ],
  },
  {
    id: "iprun-th-receipt",
    name: "IP run 泰国（有回单）",
    desc: "面向泰国 IP run 有回单样本，适合做回单一致性判断。",
    resources: { datasets: 4, prompts: 5, knowledge: 3, errorSets: 2 },
    schemes: [
      { name: "泰国回单一致性核查", model: "demo", concurrency: 4, method: "check_receipt" },
      { name: "回单摘要质量评估", model: "demo", concurrency: 5, method: "review_summary" },
    ],
  },
  {
    id: "iprun-th-no-receipt",
    name: "IP run 泰国（无回单）",
    desc: "面向泰国 IP run 无回单样本，适合做故障归因和补充信息判断。",
    resources: { datasets: 3, prompts: 4, knowledge: 5, errorSets: 1 },
    schemes: [
      { name: "无回单故障归因", model: "demo", concurrency: 4, method: "infer_fault" },
      { name: "缺失信息补全检查", model: "demo", concurrency: 3, method: "check_missing_context" },
    ],
  },
];

export function renderManagePage() {
  const activeScene = demoScenes.find((scene) => scene.id === activeDemoScene) || demoScenes[0];
  document.querySelector("#page-manage").innerHTML = `
    <div class="manage-layout">
      <section class="manage-hero">
        <div>
          <p class="eyebrow">SCENE FIRST · RESOURCE COMPOSITION</p>
          <h2>场景 &gt; 数据集、知识库、错题集、标注方案 &gt; 指向标注工作台</h2>
          <p>围绕场景组织全部资源，资源卡片用于快速进入导入、编辑和检查流程。</p>
        </div>
        <div class="flow-strip manage-flow">
          <span class="flow-node">场景</span><span class="flow-arrow">→</span>
          <span class="flow-node">数据集知识库</span><span class="flow-arrow">→</span>
          <span class="flow-node">标注方案</span><span class="flow-arrow">→</span>
          <span class="flow-node">标注管理</span>
        </div>
      </section>
      <div class="scene-switch-panel">
        <div>
          <strong>场景切换</strong>
          <span class="card-meta">${activeScene.desc}</span>
        </div>
        <div class="scene-tabs scene-tabs-premium">
          ${demoScenes.map((scene) => `<button class="scene-tab ${scene.id === activeScene.id ? "active" : ""}" data-demo-scene="${scene.id}">${scene.name}</button>`).join("")}
          <button class="scene-add" id="addSceneButton" title="添加场景">+</button>
        </div>
      </div>
      ${renderSceneContent(activeScene)}
    </div>
    ${renderModal()}
  `;
  bindManageEvents();
}

function renderSceneContent(activeScene) {
  const cards = [
    { key: "datasets", title: "数据集", action: "导入数据集", meta: "Excel 文件入库后，工作台按页读取。", count: activeScene.resources.datasets },
    { key: "prompts", title: "Prompt", action: "新增 Prompt", meta: "支持角色名、名称和提示词正文。", count: activeScene.resources.prompts },
    { key: "knowledge", title: "知识库", action: "导入知识", meta: "保存业务规则、上下文和补充说明。", count: activeScene.resources.knowledge },
    { key: "errorSets", title: "错题集", action: "整理错题", meta: "第一阶段保留结构和基础管理。", count: activeScene.resources.errorSets },
  ];
  return `
    <div class="manage-main">
      <div class="resource-grid resource-grid-premium">
        ${cards.map((card) => `
          <button class="resource-card" data-resource-card="${card.key}">
            <div>
              <div class="resource-head">
                <h3>${card.title}</h3>
                <span class="resource-dot"></span>
              </div>
              <div class="card-count">${card.count}</div>
              <p class="card-meta">${card.meta}</p>
            </div>
            <span class="resource-action">${card.action}</span>
          </button>
        `).join("")}
      </div>
      <section class="scheme-panel">
        <div class="scheme-head">
          <div>
            <h3>标注方案</h3>
            <p class="card-meta">${activeScene.name} · 组合资源、参数和后台方法名。</p>
          </div>
          <button class="btn add-scheme-btn" id="addSchemeButton">添加方案</button>
        </div>
        <div class="scheme-card-grid">
          ${activeScene.schemes.map((item) => `
            <article class="scheme-card">
              <div>
                <span class="scheme-badge">方案</span>
                <h4>${item.name}</h4>
                <p>模型：${item.model} · 并发：${item.concurrency}</p>
              </div>
              <div class="scheme-method">${item.method}</div>
            </article>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderModal() {
  return `
    <div class="modal-backdrop" id="manageModal">
      <div class="modal">
        <div class="modal-head">
          <div><h2 id="modalTitle">资源管理</h2><p class="card-meta" id="modalMeta">当前场景资源</p></div>
          <button class="icon-btn" id="closeModal">×</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>
  `;
}

function bindManageEvents() {
  document.querySelectorAll("[data-demo-scene]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDemoScene = button.dataset.demoScene;
      renderManagePage();
    });
  });
  document.querySelectorAll("[data-scene-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeSceneId = button.dataset.sceneId;
      await loadSceneResources();
      renderManagePage();
    });
  });
  document.querySelector("#addSceneButton")?.addEventListener("click", openSceneModal);
  document.querySelector("#emptyAddScene")?.addEventListener("click", openSceneModal);
  document.querySelectorAll("[data-resource-card]").forEach((card) => {
    card.addEventListener("click", () => openResourceModal(card.dataset.resourceCard));
  });
  document.querySelector("#addSchemeButton")?.addEventListener("click", openSchemeModal);
  document.querySelector("#closeModal")?.addEventListener("click", closeModal);
}

function openModal(title, meta, body) {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalMeta").textContent = meta;
  document.querySelector("#modalBody").innerHTML = body;
  document.querySelector("#manageModal").classList.add("open");
}

function closeModal() {
  document.querySelector("#manageModal").classList.remove("open");
}

function openSceneModal() {
  openModal("添加场景", "场景是平铺结构，会创建独立数据表。", `
    <form id="sceneForm" class="form-grid">
      <input class="input" name="name" placeholder="场景名称" required>
      <input class="input" name="description" placeholder="场景描述">
      <button class="btn primary full">保存场景</button>
    </form>
  `);
  document.querySelector("#sceneForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scene = await api("/api/scenes", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), description: form.get("description") }),
    });
    state.activeSceneId = scene.id;
    await loadState();
    closeModal();
    renderManagePage();
    toast("场景已创建");
  });
}

function openResourceModal(key) {
  const titleMap = { datasets: "数据集", prompts: "Prompt", knowledge: "知识库", errorSets: "错题集" };
  const listMap = { datasets: state.datasets, prompts: state.prompts, knowledge: state.knowledge, errorSets: state.errorSets };
  openModal(titleMap[key], "点击条目查看详情，使用底部表单新增或导入。", `
    <div class="list-row header"><span>名称</span><span>数量/角色</span><span>状态</span><span>时间</span></div>
    ${(listMap[key] || []).map((item) => `
      <div class="list-row">
        <strong>${item.name}</strong>
        <span>${item.row_count ?? item.role_name ?? "-"}</span>
        <span><span class="status-pill tp">可用</span></span>
        <span>${item.created_at || "-"}</span>
      </div>
    `).join("") || `<div class="empty">暂无数据</div>`}
    ${renderResourceForm(key)}
  `);
  bindResourceForm(key);
}

function renderResourceForm(key) {
  if (key === "datasets") {
    return `
      <form id="datasetForm" class="form-grid" style="margin-top:14px">
        <input class="input full" type="file" name="files" accept=".xlsx,.xls" multiple required>
        <button class="btn primary full">导入数据集</button>
      </form>
    `;
  }
  if (key === "prompts") {
    return `
      <form id="promptForm" class="form-grid" style="margin-top:14px">
        <input class="input" name="name" placeholder="Prompt 名称" required>
        <input class="input" name="role_name" placeholder="角色名" required>
        <textarea class="textarea full" name="content" placeholder="Prompt 内容" required></textarea>
        <button class="btn primary full">保存 Prompt</button>
      </form>
    `;
  }
  if (key === "knowledge") {
    return `
      <form id="knowledgeForm" class="form-grid" style="margin-top:14px">
        <input class="input full" name="name" placeholder="知识名称" required>
        <textarea class="textarea full" name="content" placeholder="知识内容" required></textarea>
        <button class="btn primary full">保存知识</button>
      </form>
    `;
  }
  return `
    <form id="errorSetForm" class="form-grid" style="margin-top:14px">
      <input class="input" name="name" placeholder="错题集名称" required>
      <input class="input" name="description" placeholder="描述">
      <button class="btn primary full">保存错题集</button>
    </form>
  `;
}

function bindResourceForm(key) {
  if (key === "datasets") {
    document.querySelector("#datasetForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData();
      formData.append("scene_id", state.activeSceneId);
      const input = event.currentTarget.querySelector('input[type="file"]');
      for (const file of input.files) formData.append("files", file);
      await api("/api/datasets", { method: "POST", body: formData });
      await loadSceneResources();
      closeModal();
      renderManagePage();
      toast("数据集已导入");
    });
  }
  const forms = {
    prompts: ["#promptForm", "/api/prompts", (form) => ({ scene_id: state.activeSceneId, name: form.get("name"), role_name: form.get("role_name"), content: form.get("content") })],
    knowledge: ["#knowledgeForm", "/api/knowledge", (form) => ({ scene_id: state.activeSceneId, name: form.get("name"), content: form.get("content") })],
    errorSets: ["#errorSetForm", "/api/error-sets", (form) => ({ scene_id: state.activeSceneId, name: form.get("name"), description: form.get("description") })],
  };
  if (!forms[key]) return;
  const [selector, url, payload] = forms[key];
  document.querySelector(selector).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(url, { method: "POST", body: JSON.stringify(payload(form)) });
    await loadSceneResources();
    closeModal();
    renderManagePage();
    toast("资源已保存");
  });
}

function openSchemeModal() {
  openModal("添加方案", "方案会保存资源组合、模型和后台方法名。", `
    <form id="schemeForm" class="form-grid">
      <input class="input" name="name" placeholder="方案名称" required>
      <input class="input" name="model_key" placeholder="模型 Key" value="demo" required>
      <input class="input" name="method_name" placeholder="后台方法名" value="call_model" required>
      <input class="input" type="number" min="1" max="50" name="concurrency" value="3" required>
      <button class="btn primary full">保存方案</button>
    </form>
  `);
  document.querySelector("#schemeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/schemes", {
      method: "POST",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        name: form.get("name"),
        model_key: form.get("model_key"),
        method_name: form.get("method_name"),
        concurrency: Number(form.get("concurrency") || 1),
      }),
    });
    await loadSceneResources();
    closeModal();
    renderManagePage();
    toast("方案已创建");
  });
}
