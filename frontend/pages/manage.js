import { api, confirmAction, loadSceneResources, loadState, state, toast } from "/assets/app.js";

const defaultColumns = [
  "ID",
  "工单名称",
  "工单类型",
  "Summary",
  "标注数据",
  "情感分类",
  "GPT4_标注",
  "Claude_结果",
];

export function renderManagePage() {
  const activeScene = getActiveScene();
  document.querySelector("#page-manage").innerHTML = `
    <div class="ref-manage-layout">
      <section class="page-heading">
        <div>
          <h2>数据集与方案管理</h2>
          <p>场景驱动资源沉淀，组合 Prompt、知识库、fewshots样例和数据集后形成标注方案。</p>
        </div>
        ${activeScene ? `<button class="btn primary package-export-button" id="exportAlgorithmPackageButton" type="button">导出标注算法包</button>` : ""}
      </section>
      ${renderModelMarketPanel()}
      <div class="ref-scene-tabs" role="tablist" aria-label="场景列表">
        <div class="ref-scene-tab-main">
          <div class="ref-scene-tab-list">
            ${state.scenes.map((scene) => `<button class="scene-tab ${scene.id === state.activeSceneId ? "active" : ""}" type="button" data-scene-id="${scene.id}">${escapeHtml(scene.name)}</button>`).join("")}
          </div>
          <button class="scene-create" id="addSceneButton" type="button" aria-label="新增场景"><span aria-hidden="true">+</span> 新增场景</button>
        </div>
        ${activeScene ? `<button class="scene-delete" id="deleteSceneButton" type="button">删除选中的场景</button>` : ""}
      </div>
      ${activeScene ? renderSceneContent(activeScene) : renderEmptyScene()}
    </div>
    ${renderModal()}
  `;
  bindManageEvents();
}

function renderModelMarketPanel() {
  const models = [
    {
      name: "Core Model",
      type: "本地模型",
      description: "默认 Core Model，对应当前后台 call_model 逻辑。",
      locked: true,
    },
    ...state.modelMarketConfigs.map((item) => ({
      ...item,
      type: "模型市场",
      description: `${item.url || "未配置 URL"} · ${item.model_name || item.name}`,
      locked: false,
    })),
  ];
  return `
    <section class="model-market-panel" aria-label="模型展示区域">
      <div class="model-market-head">
        <div>
          <strong>可用模型</strong>
          <span>Core Model 与模型市场配置统一展示，创建方案时选择具体调用方式。</span>
        </div>
        <button class="model-market-add" id="addModelMarketButton" type="button">添加模型</button>
      </div>
      <div class="model-market-list">
        ${models.map((model) => `
          <article class="model-market-card ${model.locked ? "locked" : ""}">
            <div>
              <strong>${escapeHtml(model.name)}</strong>
              <span>${escapeHtml(model.type || "模型市场配置")}</span>
              <p>${escapeHtml(model.description || "手动维护 URL、API Key 和 Model Name。")}</p>
            </div>
            ${model.locked
              ? `<em>默认</em>`
              : `<button class="model-market-delete" type="button" data-delete-model-market="${escapeHtml(model.id)}" data-model-market-name="${escapeHtml(model.name)}">删除</button>`}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function getActiveScene() {
  return state.scenes.find((scene) => scene.id === state.activeSceneId) || state.scenes[0] || null;
}

function renderEmptyScene() {
  return `
    <div class="empty">
      暂无场景，请点击上方“新增场景”创建第一个场景。
    </div>
  `;
}

function renderSceneContent(activeScene) {
  const positiveRootCauseCount = state.rootCauseBaselines?.positive?.length || 0;
  const negativeRootCauseCount = state.rootCauseBaselines?.negative?.length || 0;
  const cards = [
    { key: "datasets", title: "算法验证数据集", action: "导入数据集", meta: "Excel 文件入库后，工作台按页读取。", count: state.datasets.length },
    { key: "prompts", title: "Prompt", action: "新增 Prompt", meta: "支持角色名、名称和提示词正文。", count: state.prompts.length },
    { key: "knowledge", title: "知识库", action: "导入知识", meta: "保存业务规则、上下文和补充说明。", count: state.knowledge.length },
    { key: "errorSets", title: "fewshots样例", action: "整理样例", meta: "第一阶段保留结构和基础管理。", count: state.errorSets.length },
    { key: "fieldMapping", title: "算法输入输出字段映射", action: "配置字段", meta: "选择答案列、列表展示列和标注上下文字段。", count: columnOptions().length },
    { key: "rootCause", title: "根因分类基线", action: "维护基线", meta: "维护正例和反例根因名称，用于筛选结果沉淀。", countText: `${positiveRootCauseCount} 正例根因 · ${negativeRootCauseCount} 反例根因` },
  ];
  return `
    <div class="ref-manage-main">
      <div class="ref-manage-grid">
        ${cards.map((card) => `
          <article class="ref-resource-card" data-resource-card="${card.key}" tabindex="0">
            <div class="card-topline"></div>
            <div class="ref-resource-head">
              <span class="resource-icon">${resourceIcon(card.key)}</span>
              <button class="ghost-button" type="button">打开列表</button>
            </div>
            <h3>${card.title}</h3>
            <p>${card.meta}</p>
            <div class="resource-meta">
              ${card.countText
                ? `<span class="resource-meta-text">${escapeHtml(card.countText)}</span>`
                : `<span><strong>${card.count}</strong> ${resourceUnit(card.key)}</span>`}
              <span>${card.action}</span>
            </div>
          </article>
        `).join("")}
      </div>
      <section class="ref-scheme-panel">
        <div class="section-title">
          <div>
            <h3>标注方案</h3>
            <p class="card-meta">${escapeHtml(activeScene.name)} · 当前场景独立方案。</p>
          </div>
          <button class="btn primary" id="addSchemeButton" type="button">创建标注方案</button>
        </div>
        <div class="scheme-list">
          ${state.schemes.map((item) => `
            <article class="scheme-row">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <p>后台方法：${escapeHtml(item.method_name)} · 初始化：${item.prompt_init_type === "custom" ? "自定义" : "自动"} · 并发：${item.concurrency}</p>
              </div>
              <div class="scheme-actions">
                <button class="scheme-edit-button" type="button" data-edit-scheme="${escapeHtml(item.id)}">编辑</button>
                <button class="scheme-delete-button" type="button" data-delete-scheme="${escapeHtml(item.id)}" data-scheme-name="${escapeHtml(item.name)}">删除</button>
              </div>
            </article>
          `).join("") || `<div class="empty">当前场景暂无标注方案。</div>`}
        </div>
      </section>
    </div>
  `;
}

function resourceIcon(key) {
  return { datasets: "DS", prompts: "PT", knowledge: "KB", errorSets: "ER", fieldMapping: "FM", rootCause: "RC" }[key] || "RS";
}

function resourceUnit(key) {
  return { datasets: "个文件", prompts: "条", knowledge: "条", errorSets: "个集合", fieldMapping: "个字段", rootCause: "个根因" }[key] || "项";
}

function safeExportFilePart(value) {
  return String(value || "export")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportSceneResource(type) {
  if (!state.activeSceneId) {
    toast("请先选择场景");
    return;
  }
  const endpoint = type === "knowledge" ? "/api/knowledge/export" : "/api/prompts/export";
  const payload = await api(`${endpoint}?scene_id=${encodeURIComponent(state.activeSceneId)}`);
  const sceneName = payload.scene?.name || getActiveScene()?.name || "scene";
  const date = new Date().toISOString().slice(0, 10);
  downloadJsonFile(`${type}_${safeExportFilePart(sceneName)}_${date}.json`, payload);
  toast(`已导出 ${payload.count || 0} 条${type === "knowledge" ? "知识" : " Prompt"}`);
}

function filenameFromDisposition(disposition, fallback) {
  const match = disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1].replace(/"/g, ""));
  } catch {
    return match[1].replace(/"/g, "") || fallback;
  }
}

async function exportAlgorithmPackage() {
  if (!state.activeSceneId) {
    toast("请先选择场景");
    return;
  }
  const button = document.querySelector("#exportAlgorithmPackageButton");
  const oldText = button?.textContent || "导出标注算法包";
  if (button) {
    button.disabled = true;
    button.textContent = "导出中...";
  }
  try {
    const response = await fetch(`/api/export-packages/algorithm?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload.detail || detail;
      } catch {
        detail = await response.text();
      }
      throw new Error(detail);
    }
    const blob = await response.blob();
    const filename = filenameFromDisposition(
      response.headers.get("content-disposition"),
      `algorithm_package_${safeExportFilePart(getActiveScene()?.name || "scene")}.zip`
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast("算法包已导出");
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}

function columnOptions() {
  const columns = new Set();
  state.datasets.forEach((dataset) => {
    (dataset.column_schema || []).forEach((column) => columns.add(column));
  });
  if (!columns.size) defaultColumns.forEach((column) => columns.add(column));
  return [...columns];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderModal() {
  return `
    <div class="modal-backdrop" id="manageModal">
      <div class="modal" id="manageModalDialog">
        <div class="modal-head">
          <div class="modal-title-block"><h2 id="modalTitle">资源管理</h2><p class="card-meta" id="modalMeta">当前场景资源</p></div>
          <div class="scheme-title-name" id="schemeTitleName" hidden></div>
          <button class="icon-btn" id="closeModal">×</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>
  `;
}

function bindManageEvents() {
  document.querySelectorAll("[data-scene-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeSceneId = button.dataset.sceneId;
      await loadSceneResources();
      renderManagePage();
    });
  });
  document.querySelector("#addSceneButton")?.addEventListener("click", openSceneModal);
  document.querySelector("#deleteSceneButton")?.addEventListener("click", deleteActiveScene);
  document.querySelector("#exportAlgorithmPackageButton")?.addEventListener("click", exportAlgorithmPackage);
  document.querySelector("#addModelMarketButton")?.addEventListener("click", openModelMarketModal);
  document.querySelectorAll("[data-delete-model-market]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = await confirmAction({
        title: "删除模型配置",
        message: `确认删除模型市场配置“${button.dataset.modelMarketName}”？`,
        details: ["已被标注方案使用的模型配置需要先调整方案。"],
        confirmText: "删除模型",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/model-market-configs/${encodeURIComponent(button.dataset.deleteModelMarket)}`, { method: "DELETE" });
      state.modelMarketConfigs = await api("/api/model-market-configs");
      renderManagePage();
      toast("模型配置已删除");
    });
  });
  document.querySelectorAll("[data-resource-card]").forEach((card) => {
    const open = () => {
      if (!state.activeSceneId) {
        toast("请先创建或选择场景");
        return;
      }
      if (card.dataset.resourceCard === "fieldMapping") {
        openFieldMappingModal();
      } else if (card.dataset.resourceCard === "rootCause") {
        openRootCauseModal();
      } else {
        openResourceModal(card.dataset.resourceCard);
      }
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open();
    });
  });
  document.querySelector("#addSchemeButton")?.addEventListener("click", () => openSchemeModal());
  document.querySelectorAll("[data-edit-scheme]").forEach((button) => {
    button.addEventListener("click", () => openSchemeModal(button.dataset.editScheme));
  });
  document.querySelectorAll("[data-delete-scheme]").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = await confirmAction({
        title: "删除标注方案",
        message: `确认删除标注方案“${button.dataset.schemeName}”？`,
        details: ["关联资源选择会同步清理。"],
        confirmText: "删除方案",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/schemes/${encodeURIComponent(button.dataset.deleteScheme)}`, { method: "DELETE" });
      await loadSceneResources();
      renderManagePage();
      toast("标注方案已删除");
    });
  });
  document.querySelector("#closeModal")?.addEventListener("click", closeModalAndRefresh);
  document.querySelector("#manageModal")?.addEventListener("click", (event) => {
    if (event.target.id === "manageModal") closeModalAndRefresh();
  });
}

async function deleteActiveScene() {
  const scene = getActiveScene();
  if (!scene) {
    toast("请先选择场景");
    return;
  }
  const ok = await confirmAction({
    title: "删除场景",
    message: `确认删除场景“${scene.name}”？`,
    details: ["该场景下的数据集、Prompt、知识库、fewshots样例、字段映射配置和标注方案会一起删除。"],
    confirmText: "删除场景",
    variant: "danger",
  });
  if (!ok) return;
  await api(`/api/scenes/${encodeURIComponent(scene.id)}`, { method: "DELETE" });
  state.activeSceneId = "";
  state.activeDatasetId = "";
  state.activeSchemeId = "";
  await loadState();
  renderManagePage();
  toast("场景已删除");
}

function openModal(title, meta, body, size = "") {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalMeta").textContent = meta;
  document.querySelector("#modalBody").innerHTML = body;
  const titleName = document.querySelector("#schemeTitleName");
  titleName.hidden = true;
  titleName.textContent = "";
  document.querySelector("#manageModalDialog").className = `modal ${size}`.trim();
  const backdrop = document.querySelector("#manageModal");
  backdrop.classList.toggle("scheme-modal-backdrop", size.includes("scheme-modal"));
  backdrop.classList.add("open");
}

function closeModal() {
  const backdrop = document.querySelector("#manageModal");
  backdrop.classList.remove("open");
  backdrop.classList.remove("scheme-modal-backdrop");
}

async function closeModalAndRefresh() {
  closeModal();
  if (!state.activeSceneId) return;
  await loadSceneResources();
  renderManagePage();
}

function openSceneModal() {
  openModal("添加场景", "场景是平铺结构，会创建独立数据表。", `
    <form id="sceneForm" class="form-grid labeled-form">
      <label>
        <span>场景名称</span>
        <input class="input" name="name" placeholder="例如：SPN 工单分类" required>
      </label>
      <label>
        <span>场景描述</span>
        <input class="input" name="description" placeholder="描述当前场景的业务范围">
      </label>
      <button class="btn primary full" type="submit">保存场景</button>
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

async function openFieldMappingModal() {
  const columns = columnOptions();
  let mapping = {};
  try {
    mapping = await api(`/api/field-mapping?scene_id=${encodeURIComponent(state.activeSceneId)}`);
  } catch (error) {
    toast(error.message);
  }
  const selectedDefaults = mapping.visible_columns?.length
    ? mapping.visible_columns.filter((column) => columns.includes(column))
    : ["ID", "工单名称", "工单类型", "Summary", "标注数据"].filter((column) => columns.includes(column));
  const annotationDefaults = mapping.annotation_columns?.length
    ? mapping.annotation_columns.filter((column) => columns.includes(column))
    : ["工单名称", "工单类型", "Summary", "标注数据"].filter((column) => columns.includes(column));
  const humanAnswer = mapping.human_answer_column || (columns.includes("情感分类") ? "情感分类" : columns[0] || "");
  const modelAnswer = mapping.model_answer_column || (columns.includes("GPT4_标注") ? "GPT4_标注" : "");
  const rootCause = mapping.root_cause_column || "";

  openModal("算法输入输出字段映射", "配置当前场景数据集的答案列、列表展示列和标注上下文字段。", `
    <form id="fieldMappingForm" class="field-mapping-form">
      <section class="mapping-section mapping-primary">
        <label>
          <span>人工答案列</span>
          <select class="select" name="human_answer">
            ${columns.map((column) => `<option value="${escapeHtml(column)}" ${column === humanAnswer ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>标注答案列</span>
          <input class="input" name="model_answer" value="${escapeHtml(modelAnswer)}" placeholder="输入标注答案列名">
        </label>
        <label>
          <span>根因分类列</span>
          <input class="input" name="root_cause" value="${escapeHtml(rootCause)}" placeholder="输入根因分类列名">
        </label>
      </section>
      ${renderColumnPickSection("默认渲染在列表中的列名", "影响标注工作台首屏表格的列展示。", "visible_columns", columns, selectedDefaults)}
      ${renderColumnPickSection("标注时需要用到的列名", "用于后续标注弹窗或后台方法组装上下文。", "annotation_columns", columns, annotationDefaults, "compact")}
      <button class="btn primary full" type="submit">保存字段配置</button>
    </form>
  `, "modal-xl");
  document.querySelector("#fieldMappingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/field-mapping", {
      method: "PUT",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        human_answer_column: form.get("human_answer"),
        model_answer_column: form.get("model_answer"),
        root_cause_column: form.get("root_cause"),
        visible_columns: form.getAll("visible_columns"),
        annotation_columns: form.getAll("annotation_columns"),
      }),
    });
    closeModal();
    toast("字段配置已保存");
  });
  document.querySelectorAll("[data-bulk-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const checked = button.dataset.bulkValue === "checked";
      document.querySelectorAll(`input[name="${button.dataset.bulkSelect}"]`).forEach((input) => {
        input.checked = checked;
      });
    });
  });
}

async function openRootCauseModal() {
  if (!state.activeSceneId) {
    toast("请先选择场景");
    return;
  }
  openModal("根因分类基线", "维护当前场景的正例、反例根因名称列表。", `
    <div class="root-cause-panel">
      <div class="root-cause-loading">正在读取根因基线...</div>
    </div>
  `, "modal-xl root-cause-baseline-modal");
  try {
    const summary = await api(`/api/root-cause/baselines?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    const panel = document.querySelector(".root-cause-panel");
    if (panel) {
      panel.innerHTML = renderRootCauseBaselineManager(summary);
      bindRootCauseBaselineEvents(panel);
    }
  } catch (error) {
    const panel = document.querySelector(".root-cause-panel");
    if (panel) panel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderRootCauseBaselineManager(summary) {
  return `
    <section class="root-cause-baseline-grid">
      ${renderRootCauseBaselineColumn("positive", "正例根因", summary.positive || [])}
      ${renderRootCauseBaselineColumn("negative", "反例根因", summary.negative || [])}
    </section>
  `;
}

function renderRootCauseBaselineColumn(polarity, title, items) {
  return `
    <article class="root-cause-baseline-column" data-root-cause-baseline-column="${polarity}">
      <div class="root-cause-baseline-head">
        <strong>${title}</strong>
        <span>${items.length} 项</span>
      </div>
      <form class="root-cause-baseline-add" data-root-cause-baseline-add="${polarity}">
        <input class="input" name="name" placeholder="输入根因名称" autocomplete="off">
        <button class="btn" type="submit" disabled>新增</button>
      </form>
      <div class="root-cause-baseline-list">
        ${items.map((item) => `
          <div class="root-cause-baseline-item" data-root-cause-baseline-id="${escapeHtml(item.id)}">
            <input class="input" value="${escapeHtml(item.name)}" data-root-cause-baseline-name>
            <button class="btn" type="button" data-root-cause-baseline-save>保存</button>
            <button class="btn danger" type="button" data-root-cause-baseline-delete>删除</button>
          </div>
        `).join("") || `<div class="empty">暂无${title}</div>`}
      </div>
    </article>
  `;
}

function bindRootCauseBaselineEvents(panel) {
  panel.querySelectorAll("[data-root-cause-baseline-add]").forEach((form) => {
    const input = form.querySelector('input[name="name"]');
    const submit = form.querySelector('button[type="submit"]');
    const syncSubmit = () => {
      if (submit) submit.disabled = !String(input?.value || "").trim();
    };
    input?.addEventListener("input", syncSubmit);
    syncSubmit();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const polarity = form.dataset.rootCauseBaselineAdd;
      const name = new FormData(form).get("name");
      if (!String(name || "").trim()) return;
      await api("/api/root-cause/baselines", {
        method: "POST",
        body: JSON.stringify({ scene_id: state.activeSceneId, polarity, name }),
      });
      await refreshRootCauseBaselineModal();
      toast("根因基线已新增");
    });
  });
  panel.querySelectorAll("[data-root-cause-baseline-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = button.closest("[data-root-cause-baseline-id]");
      const column = button.closest("[data-root-cause-baseline-column]");
      await api(`/api/root-cause/baselines/${encodeURIComponent(item.dataset.rootCauseBaselineId)}`, {
        method: "PUT",
        body: JSON.stringify({
          polarity: column.dataset.rootCauseBaselineColumn,
          name: item.querySelector("[data-root-cause-baseline-name]").value,
        }),
      });
      await refreshRootCauseBaselineModal();
      toast("根因基线已保存");
    });
  });
  panel.querySelectorAll("[data-root-cause-baseline-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = button.closest("[data-root-cause-baseline-id]");
      const column = button.closest("[data-root-cause-baseline-column]");
      const name = item.querySelector("[data-root-cause-baseline-name]")?.value || "";
      const polarity = column?.dataset.rootCauseBaselineColumn === "negative" ? "反例" : "正例";
      const ok = await confirmAction({
        title: "删除根因基线",
        message: `确认删除${polarity}根因“${name || "未命名根因"}”？`,
        details: ["删除后不会影响已标注的数据和历史记录。"],
        confirmText: "删除根因",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/root-cause/baselines/${encodeURIComponent(item.dataset.rootCauseBaselineId)}`, { method: "DELETE" });
      await refreshRootCauseBaselineModal();
      toast("根因基线已删除");
    });
  });
}

async function refreshRootCauseBaselineModal() {
  const panel = document.querySelector(".root-cause-panel");
  if (!panel || !state.activeSceneId) return;
  const summary = await api(`/api/root-cause/baselines?scene_id=${encodeURIComponent(state.activeSceneId)}`);
  state.rootCauseBaselines = summary || { positive: [], negative: [] };
  panel.innerHTML = renderRootCauseBaselineManager(summary);
  bindRootCauseBaselineEvents(panel);
  updateRootCauseCardCount();
}

function updateRootCauseCardCount() {
  const card = document.querySelector('[data-resource-card="rootCause"] .resource-meta span');
  if (!card) return;
  const positive = state.rootCauseBaselines?.positive?.length || 0;
  const negative = state.rootCauseBaselines?.negative?.length || 0;
  card.textContent = `${positive} 正例根因 · ${negative} 反例根因`;
  card.classList.add("resource-meta-text");
}

function openModelMarketModal() {
  openModal("添加模型配置", "手动填写模型市场配置，后续创建方案时可选择对应模型调用。", `
    <form id="modelMarketForm" class="model-market-form">
      <section class="model-market-config-grid">
        <label>
          <span>模型名称</span>
          <input class="input" name="model_name" id="modelMarketNameInput" value="新模型" placeholder="例如：千问 Max" required>
        </label>
        <label>
          <span>URL</span>
          <input class="input" name="url" id="modelMarketUrlInput" placeholder="https://your-model-endpoint.example.com/v1/chat/completions" required>
        </label>
        <label>
          <span>API Key</span>
          <input class="input" name="api_key" id="modelMarketApiKeyInput" placeholder="请输入 API Key" autocomplete="off">
        </label>
      </section>
      <label class="model-market-json-field">
        <span>配置预览</span>
        <textarea class="input" id="modelMarketJsonConfig" spellcheck="false" readonly>${escapeHtml(JSON.stringify(modelMarketConfigSample("新模型"), null, 2))}</textarea>
      </label>
      <div class="model-market-note">
        <strong>配置说明</strong>
        <span>配置包含 URL、API Key、Model Name。Model Name 自动取自模型名称。</span>
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" data-model-market-cancel>取消</button>
        <button class="btn primary" type="submit">添加模型</button>
      </div>
    </form>
  `, "modal-wide model-market-modal");
  const form = document.querySelector("#modelMarketForm");
  const nameInput = document.querySelector("#modelMarketNameInput");
  const urlInput = document.querySelector("#modelMarketUrlInput");
  const apiKeyInput = document.querySelector("#modelMarketApiKeyInput");
  const jsonInput = document.querySelector("#modelMarketJsonConfig");
  const syncPreview = () => {
    jsonInput.value = JSON.stringify({
      URL: urlInput.value.trim(),
      "API Key": apiKeyInput.value.trim(),
      "Model Name": nameInput.value.trim() || "新模型",
    }, null, 2);
  };
  [nameInput, urlInput, apiKeyInput].forEach((input) => input.addEventListener("input", syncPreview));
  form.querySelector("[data-model-market-cancel]").addEventListener("click", closeModal);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get("model_name") || "").trim();
    const url = String(formData.get("url") || "").trim();
    const apiKey = String(formData.get("api_key") || "").trim();
    if (!name) {
      toast("请填写模型名称");
      return;
    }
    if (!url) {
      toast("请填写模型 URL");
      return;
    }
    await api("/api/model-market-configs", {
      method: "POST",
      body: JSON.stringify({
        name,
        url,
        api_key: apiKey,
        model_name: name,
      }),
    });
    state.modelMarketConfigs = await api("/api/model-market-configs");
    closeModal();
    renderManagePage();
    toast("模型配置已添加");
  });
}

function modelMarketConfigSample(modelName) {
  return {
    URL: "https://your-model-endpoint.example.com/v1/chat/completions",
    "API Key": "replace-with-your-api-key",
    "Model Name": modelName || "新模型",
  };
}

function parseModelMarketJson(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function renderColumnPickSection(title, description, name, columns, selected, compact = "") {
  return `
    <section class="mapping-section">
      <div class="mapping-title">
        <div>
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
        <div class="mapping-actions">
          <button type="button" data-bulk-select="${name}" data-bulk-value="checked">全选</button>
          <button type="button" data-bulk-select="${name}" data-bulk-value="unchecked">全不选</button>
        </div>
      </div>
      <div class="column-chip-grid ${compact}">
        ${columns.map((column) => `
          <label class="column-chip">
            <input type="checkbox" name="${name}" value="${escapeHtml(column)}" ${selected.includes(column) ? "checked" : ""}>
            <span>${escapeHtml(column)}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function openResourceModal(key) {
  if (key === "datasets") {
    openDatasetModal();
    return;
  }
  if (key === "prompts") {
    openPromptModal();
    return;
  }
  if (key === "knowledge") {
    openKnowledgeModal();
    return;
  }
  if (key === "errorSets") {
    openErrorSetModal();
  }
}

function openDatasetModal() {
  openModal("算法验证数据集", "查看当前场景已导入的数据集，也可以继续导入单个或多个 Excel 文件。", `
    <section class="dataset-modal-layout">
      <div class="dataset-list-panel">
        <div class="dataset-panel-head">
          <div>
            <strong>已导入数据集</strong>
            <span id="datasetListSummary">${state.datasets.length} 个文件</span>
          </div>
          <input class="input dataset-search-input" id="datasetSearchInput" type="search" placeholder="按文件名搜索">
        </div>
        <div class="dataset-table">
          <div class="dataset-row dataset-row-head">
            <span>文件名称</span>
            <span>行数</span>
            <span>导入时间</span>
            <span>操作</span>
          </div>
          <div class="dataset-table-scroll">
            ${state.datasets.map((item) => `
              <div class="dataset-row" data-dataset-row data-dataset-name="${escapeHtml(item.name)}">
                <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
                <span>${item.row_count ?? "-"}</span>
                <span>${item.created_at || "-"}</span>
                <button class="danger-link" type="button" data-delete-dataset="${item.id}" data-dataset-name="${escapeHtml(item.name)}">删除</button>
              </div>
            `).join("") || `<div class="dataset-empty" data-dataset-empty>暂无数据集，请先选择 Excel 文件导入。</div>`}
            ${state.datasets.length ? `<div class="dataset-empty dataset-search-empty" data-dataset-search-empty hidden>没有匹配的数据集。</div>` : ""}
          </div>
        </div>
      </div>
      ${renderDatasetForm()}
    </section>
  `, "modal-wide dataset-modal");
  bindDatasetForm();
  bindDatasetSearch();
  document.querySelectorAll("[data-delete-dataset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = await confirmAction({
        title: "删除数据集",
        message: `确认删除数据集“${button.dataset.datasetName}”？`,
        details: ["该数据集的行数据会同步删除。"],
        confirmText: "删除数据集",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/datasets/${button.dataset.deleteDataset}`, { method: "DELETE" });
      await loadSceneResources();
      renderManagePage();
      openDatasetModal();
      toast("数据集已删除");
    });
  });
}

function renderDatasetForm() {
  return `
    <form id="datasetForm" class="dataset-upload-panel">
      <div class="dataset-panel-head">
        <div>
          <strong>选择需要导入的数据集文件</strong>
          <span>支持 .xlsx / .xls，单选和多选都可以。</span>
        </div>
      </div>
      <label class="file-picker">
        <input type="file" name="files" accept=".xlsx,.xls" multiple required>
        <span class="file-picker-icon">+</span>
        <span>
          <strong>选择 Excel 文件</strong>
          <em id="datasetFileSummary">尚未选择文件</em>
        </span>
      </label>
      <div class="selected-file-list" id="datasetSelectedFiles"></div>
      <button class="btn primary upload-submit" type="submit">
        <span class="spinner" aria-hidden="true"></span>
        <span data-upload-label>导入数据集</span>
      </button>
    </form>
  `;
}

function bindDatasetForm() {
  const formNode = document.querySelector("#datasetForm");
  const fileInput = formNode.querySelector('input[type="file"]');
  const summaryNode = formNode.querySelector("#datasetFileSummary");
  const selectedList = formNode.querySelector("#datasetSelectedFiles");
  const submitButton = formNode.querySelector(".upload-submit");
  const uploadLabel = formNode.querySelector("[data-upload-label]");

  fileInput.addEventListener("change", () => {
    const files = [...fileInput.files];
    summaryNode.textContent = files.length ? `已选择 ${files.length} 个文件` : "尚未选择文件";
    selectedList.innerHTML = files.map((file) => `
      <span class="selected-file-chip" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
    `).join("");
  });

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!fileInput.files.length) {
      toast("请选择数据集文件");
      return;
    }
    const formData = new FormData();
    formData.append("scene_id", state.activeSceneId);
    for (const file of fileInput.files) formData.append("files", file);
    submitButton.disabled = true;
    submitButton.classList.add("loading");
    uploadLabel.textContent = "正在导入...";
    try {
      await api("/api/datasets", { method: "POST", body: formData });
      await loadSceneResources();
      openDatasetModal();
      toast("数据集已导入，列表已刷新");
    } catch (error) {
      submitButton.disabled = false;
      submitButton.classList.remove("loading");
      uploadLabel.textContent = "导入数据集";
      toast(error.message);
    }
  });
}

function bindDatasetSearch() {
  const input = document.querySelector("#datasetSearchInput");
  const rows = [...document.querySelectorAll("[data-dataset-row]")];
  const summary = document.querySelector("#datasetListSummary");
  const empty = document.querySelector("[data-dataset-search-empty]");
  if (!input || !rows.length) return;

  input.addEventListener("input", () => {
    const keyword = input.value.trim().toLowerCase();
    let visibleCount = 0;
    rows.forEach((row) => {
      const matched = row.dataset.datasetName.toLowerCase().includes(keyword);
      row.hidden = !matched;
      if (matched) visibleCount += 1;
    });
    summary.textContent = keyword ? `${visibleCount} / ${rows.length} 个文件` : `${rows.length} 个文件`;
    if (empty) empty.hidden = visibleCount > 0;
  });
}

function openPromptModal() {
  openModal("Prompt", "当前场景独立维护 Prompt。点击左侧 Prompt 名称后，可以在右侧直接编辑保存。", `
    <div class="prompt-editor-layout">
      <aside class="prompt-sidebar" aria-label="已添加 Prompt">
        <div class="prompt-sidebar-head">
          <div>
            <strong>已添加 Prompt</strong>
            <span>${state.prompts.length} 条 · 点击名称可编辑</span>
          </div>
          <div class="resource-head-actions">
            <button class="ghost-button" type="button" id="exportPromptButton">导出</button>
            <button class="ghost-button" type="button" id="newPromptButton">新增</button>
          </div>
        </div>
        <div class="prompt-menu-list">
          <div class="prompt-menu-card resource-menu-card prompt-draft-card" role="button" tabindex="0" data-prompt-draft-card hidden>
            <div class="resource-menu-text">
              <strong id="promptDraftTitle">新建 Prompt</strong>
              <span id="promptDraftMeta">未设置角色 · 尚未保存</span>
            </div>
            <span class="prompt-draft-badge">新增中</span>
          </div>
          ${state.prompts.map((item) => `
            <div class="prompt-menu-card resource-menu-card" role="button" tabindex="0" data-prompt-id="${escapeHtml(item.id)}">
              <div class="resource-menu-text">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.role_name || "未设置角色")} · 点击编辑</span>
              </div>
              <button class="resource-delete-button" type="button" data-delete-prompt="${escapeHtml(item.id)}" data-resource-name="${escapeHtml(item.name)}">删除</button>
            </div>
          `).join("") || `<div class="empty" data-prompt-empty>当前场景暂无 Prompt。</div>`}
        </div>
      </aside>
      <form id="promptForm" class="prompt-editor-form prompt-editor-form-with-rule labeled-form">
        <input type="hidden" name="id" id="promptId">
        <div class="prompt-editor-head">
          <div>
            <strong id="promptFormTitle">新增 Prompt</strong>
            <span id="promptFormMeta">填写名称、角色名和 Prompt 内容。</span>
          </div>
        </div>
        <section class="prompt-rule-box prompt-rule-inline">
          <strong>占位符规范</strong>
          <p>使用 <code>｛row.列名｝</code>、<code>｛knowledge.知识名称｝</code>、<code>｛error_sets.fewshots样例名称｝</code>。JSON 返回格式和 <code>{{字段}}</code> 示例会原样保留。</p>
        </section>
        <div class="prompt-field-grid">
          <label><span>Prompt 名称</span><input class="input" name="name" placeholder="Prompt 名称" required></label>
          <label><span>角色名</span><input class="input" name="role_name" placeholder="例如：质检员 / 分析师" required></label>
        </div>
        <label class="prompt-content-field">
          <span>Prompt 内容</span>
          <textarea class="textarea rich-textarea prompt-editor-textarea" name="content" placeholder="Prompt 内容" required></textarea>
          <em class="prompt-placeholder-warning" id="promptPlaceholderWarning" hidden></em>
        </label>
        <button class="btn resource-save-button full" type="submit" id="promptSubmitButton">新增 Prompt</button>
      </form>
    </div>
  `, "modal-xl prompt-modal");
  bindPromptEditor();
}

function openKnowledgeModal() {
  openModal("知识库", "当前场景独立维护知识内容。点击左侧知识名称后，可以在右侧直接编辑保存。", `
    <div class="prompt-editor-layout">
      <aside class="prompt-sidebar" aria-label="已添加知识">
        <div class="prompt-sidebar-head">
          <div>
            <strong>已添加知识</strong>
            <span>${state.knowledge.length} 条 · 点击名称可编辑</span>
          </div>
          <div class="resource-head-actions">
            <button class="ghost-button" type="button" id="exportKnowledgeButton">导出</button>
            <button class="ghost-button" type="button" id="newKnowledgeButton">新增</button>
          </div>
        </div>
        <div class="prompt-menu-list">
          <div class="prompt-menu-card resource-menu-card prompt-draft-card" role="button" tabindex="0" data-knowledge-draft-card hidden>
            <div class="resource-menu-text">
              <strong id="knowledgeDraftTitle">新建知识</strong>
              <span id="knowledgeDraftMeta">尚未保存</span>
            </div>
            <span class="prompt-draft-badge">新增中</span>
          </div>
          ${state.knowledge.map((item) => `
            <div class="prompt-menu-card resource-menu-card" role="button" tabindex="0" data-knowledge-id="${escapeHtml(item.id)}">
              <div class="resource-menu-text">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.created_at || "未记录时间")} · 点击编辑</span>
              </div>
              <button class="resource-delete-button" type="button" data-delete-knowledge="${escapeHtml(item.id)}" data-resource-name="${escapeHtml(item.name)}">删除</button>
            </div>
          `).join("") || `<div class="empty" data-knowledge-empty>当前场景暂无知识。</div>`}
        </div>
      </aside>
      <form id="knowledgeForm" class="prompt-editor-form labeled-form">
        <input type="hidden" name="id" id="knowledgeId">
        <div class="prompt-editor-head">
          <div>
            <strong id="knowledgeFormTitle">新增知识</strong>
            <span id="knowledgeFormMeta">填写知识名称和知识内容。</span>
          </div>
        </div>
        <div class="prompt-field-grid one">
          <label><span>知识名称</span><input class="input" name="name" placeholder="知识名称" required></label>
        </div>
        <label class="prompt-content-field">
          <span>知识内容</span>
          <textarea class="textarea rich-textarea prompt-editor-textarea" name="content" placeholder="知识内容" required></textarea>
        </label>
        <button class="btn resource-save-button full" type="submit" id="knowledgeSubmitButton">新增知识</button>
      </form>
    </div>
  `, "modal-xl prompt-modal");
  bindKnowledgeEditor();
}

function openErrorSetModal() {
  openModal("fewshots样例", "当前场景独立维护fewshots样例名称和描述。点击左侧fewshots样例名称后，可以在右侧直接编辑保存。", `
    <div class="prompt-editor-layout">
      <aside class="prompt-sidebar" aria-label="已添加fewshots样例">
        <div class="prompt-sidebar-head">
          <div>
            <strong>已添加fewshots样例</strong>
            <span>${state.errorSets.length} 个 · 点击名称可编辑</span>
          </div>
          <button class="ghost-button" type="button" id="newErrorSetButton">新增</button>
        </div>
        <div class="prompt-menu-list">
          <div class="prompt-menu-card resource-menu-card prompt-draft-card" role="button" tabindex="0" data-error-set-draft-card hidden>
            <div class="resource-menu-text">
              <strong id="errorSetDraftTitle">新建fewshots样例</strong>
              <span id="errorSetDraftMeta">未填写描述 · 尚未保存</span>
            </div>
            <span class="prompt-draft-badge">新增中</span>
          </div>
          ${state.errorSets.map((item) => `
            <div class="prompt-menu-card resource-menu-card" role="button" tabindex="0" data-error-set-id="${escapeHtml(item.id)}">
              <div class="resource-menu-text">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.description || "暂无描述")} · 点击编辑</span>
              </div>
              <button class="resource-delete-button" type="button" data-delete-error-set="${escapeHtml(item.id)}" data-resource-name="${escapeHtml(item.name)}">删除</button>
            </div>
          `).join("") || `<div class="empty" data-error-set-empty>当前场景暂无fewshots样例。</div>`}
        </div>
      </aside>
      <form id="errorSetForm" class="prompt-editor-form labeled-form">
        <input type="hidden" name="id" id="errorSetId">
        <div class="prompt-editor-head">
          <div>
            <strong id="errorSetFormTitle">新增fewshots样例</strong>
            <span id="errorSetFormMeta">填写fewshots样例名称和描述。</span>
          </div>
        </div>
        <div class="prompt-field-grid one">
          <label><span>fewshots样例名称</span><input class="input" name="name" placeholder="fewshots样例名称" required></label>
        </div>
        <label class="prompt-content-field">
          <span>描述</span>
          <textarea class="textarea rich-textarea prompt-editor-textarea" name="description" placeholder="描述"></textarea>
        </label>
        <button class="btn resource-save-button full" type="submit" id="errorSetSubmitButton">新增fewshots样例</button>
      </form>
    </div>
  `, "modal-xl prompt-modal");
  bindErrorSetEditor();
}

function renderRichResourceList(items, metaField, contentField) {
  return `
    <div class="resource-list-panel">
      ${items.map((item) => `
        <article class="resource-list-card">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(metaField ? item[metaField] || "-" : item.created_at || "-")}</span>
          </div>
          <p>${escapeHtml(item[contentField] || "暂无内容")}</p>
        </article>
      `).join("") || `<div class="empty">当前场景暂无数据。</div>`}
    </div>
  `;
}

function extractPromptPlaceholders(content) {
  const matches = [];
  const pattern = /｛\s*([^｛｝]+?)\s*｝/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const value = match[1].trim();
    if (value && !matches.includes(value)) matches.push(value);
  }
  return matches;
}

function promptPlaceholderCandidates() {
  const values = new Set([
    "knowledge",
    "知识库",
    "error_sets",
    "error_set",
    "fewshots样例",
    "错题集",
  ]);
  columnOptions().forEach((column) => {
    values.add(column);
    values.add(`row.${column}`);
    values.add(`dataset.${column}`);
  });
  state.knowledge.forEach((item) => {
    if (!item.name) return;
    values.add(item.name);
    values.add(`knowledge.${item.name}`);
    values.add(`知识库.${item.name}`);
  });
  state.errorSets.forEach((item) => {
    if (!item.name) return;
    values.add(item.name);
    values.add(`error_sets.${item.name}`);
    values.add(`error_set.${item.name}`);
    values.add(`fewshots样例.${item.name}`);
    values.add(`错题集.${item.name}`);
  });
  return values;
}

function findUnmappedPromptPlaceholders(content) {
  const candidates = promptPlaceholderCandidates();
  return extractPromptPlaceholders(content).filter((name) => !candidates.has(name));
}

function renderPlaceholderName(name) {
  return `｛${name}｝`;
}

function bindPromptEditor() {
  const formNode = document.querySelector("#promptForm");
  const idInput = formNode.querySelector("#promptId");
  const nameInput = formNode.querySelector('[name="name"]');
  const roleInput = formNode.querySelector('[name="role_name"]');
  const contentInput = formNode.querySelector('[name="content"]');
  const warningNode = formNode.querySelector("#promptPlaceholderWarning");
  const titleNode = formNode.querySelector("#promptFormTitle");
  const metaNode = formNode.querySelector("#promptFormMeta");
  const submitButton = formNode.querySelector("#promptSubmitButton");
  const newButton = document.querySelector("#newPromptButton");
  const exportButton = document.querySelector("#exportPromptButton");
  const menuCards = [...document.querySelectorAll("[data-prompt-id]")];
  const draftCard = document.querySelector("[data-prompt-draft-card]");
  const draftTitle = document.querySelector("#promptDraftTitle");
  const draftMeta = document.querySelector("#promptDraftMeta");
  const emptyNode = document.querySelector("[data-prompt-empty]");

  const syncDraftCard = () => {
    if (!draftCard || draftCard.hidden || idInput.value) return;
    const name = nameInput.value.trim();
    const role = roleInput.value.trim();
    draftTitle.textContent = name || "新建 Prompt";
    draftMeta.textContent = `${role || "未设置角色"} · 尚未保存`;
  };

  const updatePlaceholderWarning = () => {
    const missing = findUnmappedPromptPlaceholders(contentInput.value);
    warningNode.hidden = missing.length === 0;
    warningNode.textContent = missing.length
      ? `未找到映射值：${missing.map(renderPlaceholderName).join("、")}`
      : "";
    formNode.scrollTop = 0;
    return missing;
  };

  const setMode = (item = null) => {
    idInput.value = item?.id || "";
    nameInput.value = item?.name || "";
    roleInput.value = item?.role_name || "";
    contentInput.value = item?.content || "";
    titleNode.textContent = item ? "编辑 Prompt" : "新增 Prompt";
    metaNode.textContent = item ? "已载入历史内容，可直接修改后保存。" : "填写名称、角色名和 Prompt 内容。";
    submitButton.textContent = item ? "保存 Prompt" : "新增 Prompt";
    if (draftCard) {
      draftCard.hidden = Boolean(item);
      draftCard.classList.toggle("active", !item);
    }
    if (emptyNode) {
      emptyNode.hidden = !item;
    }
    menuCards.forEach((card) => {
      card.classList.toggle("active", item?.id === card.dataset.promptId);
    });
    syncDraftCard();
    updatePlaceholderWarning();
  };

  contentInput.addEventListener("input", updatePlaceholderWarning);
  nameInput.addEventListener("input", syncDraftCard);
  roleInput.addEventListener("input", syncDraftCard);
  newButton?.addEventListener("click", () => setMode());
  exportButton?.addEventListener("click", () => exportSceneResource("prompts"));
  draftCard?.addEventListener("click", () => setMode());
  draftCard?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setMode();
  });
  menuCards.forEach((card) => {
    card.addEventListener("click", () => {
      const item = state.prompts.find((prompt) => prompt.id === card.dataset.promptId);
      if (item) setMode(item);
    });
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".resource-delete-button")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const item = state.prompts.find((prompt) => prompt.id === card.dataset.promptId);
      if (item) setMode(item);
    });
  });
  setMode(state.prompts[0] || null);
  document.querySelectorAll("[data-delete-prompt]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = await confirmAction({
        title: "删除 Prompt",
        message: `确认删除 Prompt“${button.dataset.resourceName}”？`,
        details: ["关联方案中的该 Prompt 引用会同步移除。"],
        confirmText: "删除 Prompt",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/prompts/${encodeURIComponent(button.dataset.deletePrompt)}`, { method: "DELETE" });
      await loadSceneResources();
      openPromptModal();
      toast("Prompt 已删除");
    });
  });

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const missing = updatePlaceholderWarning();
    if (missing.length) {
      const ok = await confirmAction({
        title: "继续保存 Prompt",
        message: "以下占位符没有对应的映射值。",
        details: [missing.map(renderPlaceholderName).join("、")],
        confirmText: "继续保存",
        variant: "warning",
      });
      if (!ok) return;
    }
    const payload = {
      scene_id: state.activeSceneId,
      name: form.get("name"),
      role_name: form.get("role_name"),
      content: form.get("content"),
    };
    const promptId = form.get("id");
    const url = promptId ? `/api/prompts/${encodeURIComponent(promptId)}` : "/api/prompts";
    await api(url, {
      method: promptId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    await loadSceneResources();
    openPromptModal();
    toast(promptId ? "Prompt 已保存" : "Prompt 已新增");
  });
}

function bindKnowledgeEditor() {
  const formNode = document.querySelector("#knowledgeForm");
  const idInput = formNode.querySelector("#knowledgeId");
  const nameInput = formNode.querySelector('[name="name"]');
  const contentInput = formNode.querySelector('[name="content"]');
  const titleNode = formNode.querySelector("#knowledgeFormTitle");
  const metaNode = formNode.querySelector("#knowledgeFormMeta");
  const submitButton = formNode.querySelector("#knowledgeSubmitButton");
  const newButton = document.querySelector("#newKnowledgeButton");
  const exportButton = document.querySelector("#exportKnowledgeButton");
  const menuCards = [...document.querySelectorAll("[data-knowledge-id]")];
  const draftCard = document.querySelector("[data-knowledge-draft-card]");
  const draftTitle = document.querySelector("#knowledgeDraftTitle");
  const draftMeta = document.querySelector("#knowledgeDraftMeta");
  const emptyNode = document.querySelector("[data-knowledge-empty]");

  const syncDraftCard = () => {
    if (!draftCard || draftCard.hidden || idInput.value) return;
    draftTitle.textContent = nameInput.value.trim() || "新建知识";
    draftMeta.textContent = "尚未保存";
  };

  const setMode = (item = null) => {
    idInput.value = item?.id || "";
    nameInput.value = item?.name || "";
    contentInput.value = item?.content || "";
    titleNode.textContent = item ? "编辑知识" : "新增知识";
    metaNode.textContent = item ? "已载入历史内容，可直接修改后保存。" : "填写知识名称和知识内容。";
    submitButton.textContent = item ? "保存知识" : "新增知识";
    if (draftCard) {
      draftCard.hidden = Boolean(item);
      draftCard.classList.toggle("active", !item);
    }
    if (emptyNode) {
      emptyNode.hidden = !item;
    }
    menuCards.forEach((card) => {
      card.classList.toggle("active", item?.id === card.dataset.knowledgeId);
    });
    syncDraftCard();
  };

  nameInput.addEventListener("input", syncDraftCard);
  newButton?.addEventListener("click", () => setMode());
  exportButton?.addEventListener("click", () => exportSceneResource("knowledge"));
  draftCard?.addEventListener("click", () => setMode());
  draftCard?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setMode();
  });
  menuCards.forEach((card) => {
    card.addEventListener("click", () => {
      const item = state.knowledge.find((knowledge) => knowledge.id === card.dataset.knowledgeId);
      if (item) setMode(item);
    });
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".resource-delete-button")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const item = state.knowledge.find((knowledge) => knowledge.id === card.dataset.knowledgeId);
      if (item) setMode(item);
    });
  });
  setMode(state.knowledge[0] || null);
  document.querySelectorAll("[data-delete-knowledge]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = await confirmAction({
        title: "删除知识",
        message: `确认删除知识“${button.dataset.resourceName}”？`,
        details: ["关联方案中的该知识引用会同步移除。"],
        confirmText: "删除知识",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/knowledge/${encodeURIComponent(button.dataset.deleteKnowledge)}`, { method: "DELETE" });
      await loadSceneResources();
      openKnowledgeModal();
      toast("知识已删除");
    });
  });

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      scene_id: state.activeSceneId,
      name: form.get("name"),
      content: form.get("content"),
    };
    const knowledgeId = form.get("id");
    const url = knowledgeId ? `/api/knowledge/${encodeURIComponent(knowledgeId)}` : "/api/knowledge";
    await api(url, {
      method: knowledgeId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    await loadSceneResources();
    openKnowledgeModal();
    toast(knowledgeId ? "知识已保存" : "知识已新增");
  });
}

function bindErrorSetEditor() {
  const formNode = document.querySelector("#errorSetForm");
  const idInput = formNode.querySelector("#errorSetId");
  const nameInput = formNode.querySelector('[name="name"]');
  const descriptionInput = formNode.querySelector('[name="description"]');
  const titleNode = formNode.querySelector("#errorSetFormTitle");
  const metaNode = formNode.querySelector("#errorSetFormMeta");
  const submitButton = formNode.querySelector("#errorSetSubmitButton");
  const newButton = document.querySelector("#newErrorSetButton");
  const menuCards = [...document.querySelectorAll("[data-error-set-id]")];
  const draftCard = document.querySelector("[data-error-set-draft-card]");
  const draftTitle = document.querySelector("#errorSetDraftTitle");
  const draftMeta = document.querySelector("#errorSetDraftMeta");
  const emptyNode = document.querySelector("[data-error-set-empty]");

  const syncDraftCard = () => {
    if (!draftCard || draftCard.hidden || idInput.value) return;
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    draftTitle.textContent = name || "新建fewshots样例";
    draftMeta.textContent = `${description || "未填写描述"} · 尚未保存`;
  };

  const setMode = (item = null) => {
    idInput.value = item?.id || "";
    nameInput.value = item?.name || "";
    descriptionInput.value = item?.description || "";
    titleNode.textContent = item ? "编辑fewshots样例" : "新增fewshots样例";
    metaNode.textContent = item ? "已载入历史描述，可直接修改后保存。" : "填写fewshots样例名称和描述。";
    submitButton.textContent = item ? "保存fewshots样例" : "新增fewshots样例";
    if (draftCard) {
      draftCard.hidden = Boolean(item);
      draftCard.classList.toggle("active", !item);
    }
    if (emptyNode) {
      emptyNode.hidden = !item;
    }
    menuCards.forEach((card) => {
      card.classList.toggle("active", item?.id === card.dataset.errorSetId);
    });
    syncDraftCard();
  };

  nameInput.addEventListener("input", syncDraftCard);
  descriptionInput.addEventListener("input", syncDraftCard);
  newButton?.addEventListener("click", () => setMode());
  draftCard?.addEventListener("click", () => setMode());
  draftCard?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setMode();
  });
  menuCards.forEach((card) => {
    card.addEventListener("click", () => {
      const item = state.errorSets.find((errorSet) => errorSet.id === card.dataset.errorSetId);
      if (item) setMode(item);
    });
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".resource-delete-button")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const item = state.errorSets.find((errorSet) => errorSet.id === card.dataset.errorSetId);
      if (item) setMode(item);
    });
  });
  setMode(state.errorSets[0] || null);
  document.querySelectorAll("[data-delete-error-set]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = await confirmAction({
        title: "删除 fewshots 样例",
        message: `确认删除 fewshots 样例“${button.dataset.resourceName}”？`,
        details: ["关联方案中的该 fewshots 样例引用会同步移除。"],
        confirmText: "删除样例",
        variant: "danger",
      });
      if (!ok) return;
      await api(`/api/error-sets/${encodeURIComponent(button.dataset.deleteErrorSet)}`, { method: "DELETE" });
      await loadSceneResources();
      openErrorSetModal();
      toast("fewshots样例已删除");
    });
  });

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      scene_id: state.activeSceneId,
      name: form.get("name"),
      description: form.get("description"),
    };
    const errorSetId = form.get("id");
    const url = errorSetId ? `/api/error-sets/${encodeURIComponent(errorSetId)}` : "/api/error-sets";
    await api(url, {
      method: errorSetId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    await loadSceneResources();
    openErrorSetModal();
    toast(errorSetId ? "fewshots样例已保存" : "fewshots样例已新增");
  });
}

function bindResourceForm(key) {
  const forms = {
    prompts: ["#promptForm", "/api/prompts", (form) => ({ scene_id: state.activeSceneId, name: form.get("name"), role_name: form.get("role_name"), content: form.get("content") })],
    knowledge: ["#knowledgeForm", "/api/knowledge", (form) => ({ scene_id: state.activeSceneId, name: form.get("name"), content: form.get("content") })],
    errorSets: ["#errorSetForm", "/api/error-sets", (form) => ({ scene_id: state.activeSceneId, name: form.get("name"), description: form.get("description") })],
  };
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

async function openSchemeModal(schemeId = "") {
  const editingScheme = schemeId ? state.schemes.find((item) => item.id === schemeId) : null;
  const selectedResources = schemeResourceIds(editingScheme);
  let methods = {};
  let promptInitMethods = {};
  try {
    methods = await api("/api/schemes/methods");
  } catch {
    methods = { default: { name: "默认标注方案", method_name: "call_model" } };
  }
  try {
    promptInitMethods = await api("/api/schemes/prompt-init-methods");
  } catch {
    promptInitMethods = { custom_default: { name: "默认初始化调用", method_name: "build_prompts_custom" } };
  }
  const initType = editingScheme?.prompt_init_type || "auto";
  openModal(editingScheme ? "编辑方案" : "添加方案", "选择 Prompt、初始化方式和标注方法，系统会生成方案名称，你也可以手动修改。", `
    <form id="schemeForm" class="scheme-form-v2 labeled-form">
      <section class="scheme-name-card">
        <label class="scheme-name-field">
          <span>方案名称</span>
          <input class="input" name="name" id="schemeNameInput" value="${escapeHtml(editingScheme?.name || "")}" placeholder="选择 Prompt 后自动生成，可手动修改" required>
        </label>
      </section>
      <div class="scheme-two-column-layout">
        <div class="scheme-column scheme-column-primary">
          ${renderSchemePromptPicker(state.prompts, selectedResources.prompt)}

          <section class="scheme-config-card">
            <div class="scheme-config-title">
              <strong>你想怎么构建你的 Prompt</strong>
            </div>
            <div class="scheme-choice-grid">
              <label class="scheme-choice-card">
                <input type="radio" name="prompt_init_type" value="auto" ${initType === "auto" ? "checked" : ""}>
                <span>
                  <strong>自动替换占位符</strong>
                  <em>系统替换 ｛row.列名｝、｛knowledge.名称｝、｛error_sets.名称｝。</em>
                </span>
              </label>
              <label class="scheme-choice-card">
                <input type="radio" name="prompt_init_type" value="custom" ${initType === "custom" ? "checked" : ""}>
                <span>
                  <strong>自定义 Prompt 处理</strong>
                  <em>交给后台方法，由开发人员自行组装。</em>
                </span>
              </label>
            </div>
            <div class="scheme-custom-init-method scheme-custom-only" id="customPromptPanel" hidden>
              <div class="scheme-config-title">
                <strong>选择你 Prompt 初始化调用的方法</strong>
              </div>
              ${renderSchemeSelect("prompt_init_method_name", "promptInitMethod", promptInitMethods, editingScheme?.prompt_init_method_name)}
            </div>
          </section>

          <section class="scheme-config-card">
            <div class="scheme-config-title">
              <strong>标注时你想使用哪一个大模型</strong>
            </div>
            ${renderSchemeModelPicker(methods, state.modelMarketConfigs, editingScheme)}
            <label class="scheme-concurrency-field scheme-concurrency-full">
              <span>并发数量</span>
              <input class="input" type="number" min="1" max="20" name="concurrency" value="${escapeHtml(editingScheme?.concurrency || 5)}" required>
            </label>
          </section>
        </div>

        <div class="scheme-column scheme-column-custom">
          ${renderSchemeResourcePicker("知识库", "knowledge_ids", state.knowledge, "content", selectedResources.knowledge, { compact: true, standalone: true, customOnly: true })}
          ${renderSchemeResourcePicker("fewshots 样例", "error_set_ids", state.errorSets, "description", selectedResources.error_set, { compact: true, standalone: true, customOnly: true })}
          <section class="scheme-config-card scheme-custom-placeholder" id="customPromptPlaceholder">
            <span>自动替换占位符将会根据 Prompt 中占位符的内容自动替换知识库和 fewshots。如果你想自己决定使用哪些知识库和 fewshots，或者想自己初始化 Prompt 内容，请选择自定义 Prompt 处理。</span>
          </section>
        </div>
      </div>

      <section class="scheme-bottom-validation" id="autoPromptPanel" hidden>
        <div class="scheme-config-title">
          <strong>占位符检查</strong>
        </div>
        <div id="autoPromptValidation"></div>
      </section>

      <div class="scheme-form-actions">
        <div class="scheme-footer-preview" id="schemeExecutionPreview">选择 Prompt 后显示执行配置。</div>
        <button class="btn primary" type="submit" id="schemeSubmitButton">保存方案</button>
      </div>
    </form>
  `, "modal-xl scheme-modal");
  bindSchemeModalControls(methods, promptInitMethods);
  document.querySelector("#schemeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const promptIds = form.getAll("prompt_ids");
    const promptInitType = form.get("prompt_init_type") || "auto";
    const autoLinks = analyzeAutoPromptLinks(promptIds);
    if (!promptIds.length) {
      toast("请至少选择一个 Prompt");
      return;
    }
    if (promptInitType === "auto" && autoLinks.errors.length) {
      renderAutoPromptValidation(promptIds);
      toast("自动占位符检查未通过，请先修改 Prompt");
      return;
    }
    await api(editingScheme ? `/api/schemes/${encodeURIComponent(editingScheme.id)}` : "/api/schemes", {
      method: editingScheme ? "PUT" : "POST",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        name: String(form.get("name") || "").trim() || buildSchemeAutoName(form),
        model_key: form.get("model_key") || "core_model",
        method_name: form.get("method_name"),
        prompt_init_type: promptInitType,
        prompt_init_method_name: promptInitType === "custom" ? form.get("prompt_init_method_name") : "",
        concurrency: Number(form.get("concurrency") || 1),
        prompt_ids: promptIds,
        knowledge_ids: promptInitType === "auto" ? autoLinks.knowledge.map((item) => item.id) : form.getAll("knowledge_ids"),
        error_set_ids: promptInitType === "auto" ? autoLinks.errorSets.map((item) => item.id) : form.getAll("error_set_ids"),
      }),
    });
    await loadSceneResources();
    closeModal();
    renderManagePage();
    toast(editingScheme ? "方案已更新" : "方案已创建");
  });
}

function schemeResourceIds(scheme) {
  const ids = { prompt: new Set(), knowledge: new Set(), error_set: new Set() };
  (scheme?.resources || []).forEach((resource) => {
    ids[resource.resource_type]?.add(resource.resource_id);
  });
  return ids;
}

function renderSchemeModelPicker(methods, modelConfigs, editingScheme) {
  const entries = Object.entries(methods || {});
  const customMethods = entries.filter(([, item]) => !["call_model", "call_model_market"].includes(item.method_name));
  const selectedMethod = editingScheme?.method_name || "call_model";
  const selectedModelKey = editingScheme?.model_key || "core_model";
  const optionGroups = [
    {
      title: "本地模型",
      options: [
        {
          key: "core_model",
          name: "Core Model",
          description: "",
          method_name: "call_model",
          model_key: "core_model",
          selected: selectedMethod === "call_model" && selectedModelKey !== "del_model",
        },
        {
          key: "del_model",
          name: "Del Model",
          description: "",
          method_name: "call_model",
          model_key: "del_model",
          selected: selectedMethod === "call_model" && selectedModelKey === "del_model",
        },
      ],
    },
    {
      title: "模型市场",
      options: (modelConfigs || []).map((item) => ({
        key: item.id,
        name: item.name,
        description: "",
        method_name: "call_model_market",
        model_key: item.id,
        selected: selectedMethod === "call_model_market" && selectedModelKey === item.id,
      })),
      empty: "暂无模型市场配置，请先点击上方“添加模型”。",
    },
    {
      title: "自定义标注方法",
      options: customMethods.map(([key, item]) => ({
        key,
        name: item.name || key,
        description: "",
        method_name: item.method_name,
        model_key: "custom",
        selected: selectedMethod === item.method_name,
      })),
      empty: "暂无自定义标注方法。",
    },
  ];
  let selectedOption = optionGroups.flatMap((group) => group.options).find((item) => item.selected);
  if (!selectedOption) selectedOption = optionGroups[0].options[0];
  return `
    <div class="scheme-model-picker" data-scheme-model-picker>
      <input type="hidden" name="method_name" id="schemeMethod" value="${escapeHtml(selectedOption.method_name)}">
      <input type="hidden" name="model_key" id="schemeModelKey" value="${escapeHtml(selectedOption.model_key)}">
      ${optionGroups.map((group) => `
        <section class="scheme-model-group">
          <div class="scheme-model-group-title">${escapeHtml(group.title)}</div>
          <div class="scheme-model-options">
            ${group.options.length ? group.options.map((item) => `
              <button class="scheme-model-option ${item === selectedOption ? "active" : ""}" type="button"
                data-method-name="${escapeHtml(item.method_name)}"
                data-model-key="${escapeHtml(item.model_key)}"
                data-model-label="${escapeHtml(item.name)}">
                <i aria-hidden="true"></i>
                <span>
                  <strong>${escapeHtml(item.name)}</strong>
                  ${item.description ? `<em>${escapeHtml(item.description)}</em>` : ""}
                </span>
              </button>
            `).join("") : `<div class="scheme-model-empty">${escapeHtml(group.empty || "暂无配置")}</div>`}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderSchemeSelect(name, id, items, selectedValue = "", label = "", required = false) {
  const entries = Object.entries(items);
  const selected = selectedValue || entries[0]?.[1]?.method_name || "";
  return `
    <label class="scheme-select-field">
      ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      <select class="select" name="${name}" id="${id}" ${required ? "required" : ""}>
        ${entries.map(([key, item]) => `<option value="${escapeHtml(item.method_name)}" ${item.method_name === selected ? "selected" : ""} data-method-key="${escapeHtml(key)}">${escapeHtml(item.name || key)} · ${escapeHtml(item.method_name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderSchemePromptPicker(items, selected = new Set()) {
  return `
    <section class="scheme-prompt-picker scheme-config-card" data-scheme-resource-picker="prompt_ids">
      <div class="scheme-config-title">
        <div>
          <strong>选择你要用的 Prompt</strong>
          <span>一个方案可选择多个角色 Prompt。</span>
        </div>
      </div>
      <div class="scheme-prompt-list">
        ${items.map((item) => {
          const roleLabel = item.role_name || item.name || "未设置角色";
          return `
          <label class="scheme-prompt-option" data-resource-option="prompt_ids" data-resource-text="${escapeHtml(`${item.name} ${item.role_name || ""}`.toLowerCase())}">
            <input type="checkbox" name="prompt_ids" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""}>
            <span class="scheme-prompt-check"></span>
            <span class="scheme-prompt-copy">
              <em>${escapeHtml(roleLabel)}</em>
            </span>
          </label>
        `;
        }).join("") || `<div class="empty">当前场景暂无 Prompt，请先新增 Prompt。</div>`}
      </div>
    </section>
  `;
}

function renderSchemeResourcePicker(title, name, items, metaField, selected = new Set(), options = {}) {
  const searchable = options.searchable;
  const compact = options.compact ? "compact" : "";
  const standalone = options.standalone ? "scheme-config-card scheme-resource-card-picker" : "";
  const customOnly = options.customOnly ? "scheme-custom-only" : "";
  const selectedItems = items.filter((item) => selected.has(item.id));
  return `
    <section class="scheme-resource-picker ${compact} ${standalone} ${customOnly}" data-scheme-resource-picker="${name}" ${options.customOnly ? "hidden" : ""}>
      <div class="scheme-resource-headline">
        <strong>${escapeHtml(title)}</strong>
        <span data-resource-count="${name}">${selectedItems.length ? `已选 ${selectedItems.length} 项` : "未选择"}</span>
      </div>
      ${searchable ? `<input class="input scheme-resource-search" type="search" placeholder="搜索${escapeHtml(title)}" data-resource-search="${name}">` : ""}
      <div class="scheme-resource-grid">
        ${items.map((item) => `
          <label class="scheme-resource-option" data-resource-option="${name}" data-resource-text="${escapeHtml(`${item.name} ${item[metaField] || ""}`.toLowerCase())}">
            <input type="checkbox" name="${name}" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""}>
            <span class="scheme-resource-check"></span>
            <span class="scheme-resource-copy">
              <strong>${escapeHtml(item.name)}</strong>
            </span>
          </label>
        `).join("") || `<div class="empty">当前场景暂无${title}资源。</div>`}
      </div>
    </section>
  `;
}

function bindSchemeModalControls(methods, promptInitMethods) {
  const form = document.querySelector("#schemeForm");
  const nameInput = form.querySelector("#schemeNameInput");
  if (nameInput) {
    nameInput.dataset.manual = nameInput.value.trim() ? "true" : "false";
    nameInput.classList.toggle("auto-generated", nameInput.dataset.manual !== "true");
    nameInput.addEventListener("input", () => {
      nameInput.dataset.manual = "true";
      nameInput.classList.remove("auto-generated");
      updateSchemeAutoNamePreview(new FormData(form));
    });
  }
  const refresh = () => {
    const formData = new FormData(form);
    const initType = formData.get("prompt_init_type") || "auto";
    const isCustom = initType === "custom";
    document.querySelectorAll(".scheme-custom-only").forEach((node) => {
      node.hidden = !isCustom;
    });
    document.querySelector("#customPromptPlaceholder").hidden = isCustom;
    renderAutoPromptValidation(formData.getAll("prompt_ids"), initType);
    updateSchemeAutoNamePreview(formData);
    updateSchemeExecutionPreview(formData);
    updateSchemeResourceCounts();
  };
  form.querySelectorAll('input[name="prompt_init_type"], input[name="prompt_ids"]').forEach((input) => {
    input.addEventListener("change", refresh);
  });
  form.querySelector('input[name="concurrency"]')?.addEventListener("input", refresh);
  form.querySelector("#promptInitMethod")?.addEventListener("change", refresh);
  form.querySelectorAll(".scheme-model-option").forEach((button) => {
    button.addEventListener("click", () => {
      form.querySelector("#schemeMethod").value = button.dataset.methodName || "call_model";
      form.querySelector("#schemeModelKey").value = button.dataset.modelKey || "core_model";
      form.querySelectorAll(".scheme-model-option").forEach((item) => item.classList.toggle("active", item === button));
      refresh();
    });
  });
  form.querySelectorAll("[data-resource-search]").forEach((input) => {
    input.addEventListener("input", () => filterSchemeResourceOptions(input));
  });
  form.querySelectorAll('.scheme-resource-picker input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", refresh);
  });
  refresh();
}

function buildSchemeAutoName(form) {
  const roles = getSelectedPromptRoles(form);
  const methodName = form.get("method_name") || "call_model";
  const rolePart = roles.length ? roles.join("+") : "未选择Prompt";
  return `${rolePart} · ${methodName}`.slice(0, 120);
}

function getSelectedPromptRoles(form) {
  return form.getAll("prompt_ids").map((id) => {
    const prompt = state.prompts.find((item) => item.id === id);
    return prompt?.role_name || prompt?.name || id;
  }).filter(Boolean);
}

function updateSchemeAutoNamePreview(form) {
  const node = document.querySelector("#schemeTitleName");
  const input = document.querySelector("#schemeNameInput");
  const autoName = buildSchemeAutoName(form);
  if (input && input.dataset.manual !== "true") {
    input.value = autoName;
    input.classList.add("auto-generated");
  } else if (input) {
    input.classList.remove("auto-generated");
  }
  if (!node) return;
  node.textContent = input?.value?.trim() || autoName;
  node.hidden = false;
}

function updateSchemeExecutionPreview(form) {
  const node = document.querySelector("#schemeExecutionPreview");
  if (!node) return;
  const roles = getSelectedPromptRoles(form);
  const initType = form.get("prompt_init_type") === "custom" ? "自定义初始化" : "自动初始化";
  const methodName = form.get("method_name") || "call_model";
  const concurrency = form.get("concurrency") || "1";
  node.textContent = `${roles.length || 0} 个 Prompt · ${initType} · ${methodName} · 并发 ${concurrency}`;
}

function filterSchemeResourceOptions(input) {
  const keyword = input.value.trim().toLowerCase();
  document.querySelectorAll(`[data-resource-option="${input.dataset.resourceSearch}"]`).forEach((option) => {
    option.hidden = keyword && !option.dataset.resourceText.includes(keyword);
  });
}

function updateSchemeResourceCounts() {
  document.querySelectorAll("[data-resource-count]").forEach((node) => {
    const name = node.dataset.resourceCount;
    const count = document.querySelectorAll(`input[name="${name}"]:checked`).length;
    node.textContent = count ? `已选 ${count} 项` : "未选择";
  });
}

function renderAutoPromptValidation(promptIds, initType = "auto") {
  const panel = document.querySelector("#autoPromptPanel");
  const validation = document.querySelector("#autoPromptValidation");
  if (!panel || !validation) return;
  if (initType === "custom" || !promptIds.length) {
    panel.hidden = true;
    validation.innerHTML = "";
    return;
  }
  const result = analyzeAutoPromptLinks(promptIds);
  const messages = result.errors;
  panel.hidden = messages.length === 0;
  validation.innerHTML = messages.length
    ? `<div class="scheme-validation-list">${messages.map((message) => `<div class="warning">${escapeHtml(message)}</div>`).join("")}</div>`
    : "";
}

function analyzeAutoPromptLinks(promptIds) {
  const prompts = state.prompts.filter((prompt) => promptIds.includes(prompt.id));
  const columns = columnOptions();
  const knowledgeIds = new Set();
  const errorSetIds = new Set();
  const errors = [];
  const warnings = [];
  let useAllKnowledge = false;
  let useAllErrorSets = false;

  if (!prompts.length) {
    errors.push("请先选择至少一个 Prompt。");
  }

  prompts.forEach((prompt) => {
    extractSchemePromptPlaceholders(prompt.content || "").forEach((placeholder) => {
      const key = placeholder.key;
      if (key.startsWith("row.")) {
        const column = key.slice(4).trim();
        if (!columns.includes(column)) errors.push(`${prompt.name} 引用了不存在的数据列：${column}`);
        return;
      }
      if (["knowledge", "知识库"].includes(key)) {
        useAllKnowledge = true;
        return;
      }
      if (["error_sets", "error_set", "fewshots样例", "错题集"].includes(key)) {
        useAllErrorSets = true;
        return;
      }
      const knowledgeName = parseNamedResourceRef(key, ["knowledge", "知识库"]);
      if (knowledgeName) {
        const item = state.knowledge.find((resource) => resource.name === knowledgeName || resource.id === knowledgeName);
        if (item) knowledgeIds.add(item.id);
        else errors.push(`${prompt.name} 引用了不存在的知识库：${knowledgeName}`);
        return;
      }
      const errorSetName = parseNamedResourceRef(key, ["error_sets", "error_set", "fewshots样例", "错题集"]);
      if (errorSetName) {
        const item = state.errorSets.find((resource) => resource.name === errorSetName || resource.id === errorSetName);
        if (item) errorSetIds.add(item.id);
        else errors.push(`${prompt.name} 引用了不存在的fewshots样例：${errorSetName}`);
        return;
      }
      errors.push(`${prompt.name} 存在无法自动替换的占位符：${renderPlaceholderName(key)}`);
    });
  });

  if (useAllKnowledge) {
    state.knowledge.forEach((item) => knowledgeIds.add(item.id));
    warnings.push("检测到 ｛knowledge｝，会自动关联当前场景全部知识库。");
  }
  if (useAllErrorSets) {
    state.errorSets.forEach((item) => errorSetIds.add(item.id));
    warnings.push("检测到 ｛error_sets｝，会自动关联当前场景全部fewshots样例。");
  }

  return {
    knowledge: state.knowledge.filter((item) => knowledgeIds.has(item.id)),
    errorSets: state.errorSets.filter((item) => errorSetIds.has(item.id)),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

function extractSchemePromptPlaceholders(content) {
  const placeholders = [];
  const modern = /｛\s*([^｛｝]+?)\s*｝/g;
  let match;
  while ((match = modern.exec(content))) placeholders.push({ key: match[1].trim(), legacy: false });
  return placeholders;
}

function parseNamedResourceRef(key, prefixes) {
  for (const prefix of prefixes) {
    for (const separator of [".", ":", "："]) {
      const token = `${prefix}${separator}`;
      if (key.startsWith(token)) return key.slice(token.length).trim();
    }
  }
  return "";
}
