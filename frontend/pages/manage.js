import { api, loadSceneResources, loadState, state, toast } from "/assets/app.js";

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
          <p>场景驱动资源沉淀，组合 Prompt、知识库、错题集和数据集后形成标注方案。</p>
        </div>
      </section>
      <div class="ref-scene-tabs" role="tablist" aria-label="场景列表">
        <div class="ref-scene-tab-list">
          ${state.scenes.map((scene) => `<button class="scene-tab ${scene.id === state.activeSceneId ? "active" : ""}" type="button" data-scene-id="${scene.id}">${escapeHtml(scene.name)}</button>`).join("")}
        </div>
        <button class="scene-create" id="addSceneButton" type="button" aria-label="新增场景"><span aria-hidden="true">+</span> 新增场景</button>
      </div>
      ${activeScene ? renderSceneContent(activeScene) : renderEmptyScene()}
    </div>
    ${renderModal()}
  `;
  bindManageEvents();
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
  const cards = [
    { key: "datasets", title: "数据集", action: "导入数据集", meta: "Excel 文件入库后，工作台按页读取。", count: state.datasets.length },
    { key: "prompts", title: "Prompt", action: "新增 Prompt", meta: "支持角色名、名称和提示词正文。", count: state.prompts.length },
    { key: "knowledge", title: "知识库", action: "导入知识", meta: "保存业务规则、上下文和补充说明。", count: state.knowledge.length },
    { key: "errorSets", title: "错题集", action: "整理错题", meta: "第一阶段保留结构和基础管理。", count: state.errorSets.length },
    { key: "fieldMapping", title: "字段映射配置", action: "配置字段", meta: "选择答案列、列表展示列和标注上下文字段。", count: columnOptions().length },
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
              <span><strong>${card.count}</strong> ${resourceUnit(card.key)}</span>
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
              <span class="status-pill tp">可用</span>
            </article>
          `).join("") || `<div class="empty">当前场景暂无标注方案。</div>`}
        </div>
      </section>
    </div>
  `;
}

function resourceIcon(key) {
  return { datasets: "DS", prompts: "PT", knowledge: "KB", errorSets: "ER", fieldMapping: "FM" }[key] || "RS";
}

function resourceUnit(key) {
  return { datasets: "个文件", prompts: "条", knowledge: "条", errorSets: "个集合", fieldMapping: "个字段" }[key] || "项";
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
          <div><h2 id="modalTitle">资源管理</h2><p class="card-meta" id="modalMeta">当前场景资源</p></div>
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
  document.querySelectorAll("[data-resource-card]").forEach((card) => {
    const open = () => {
      if (!state.activeSceneId) {
        toast("请先创建或选择场景");
        return;
      }
      if (card.dataset.resourceCard === "fieldMapping") {
        openFieldMappingModal();
      } else {
        openResourceModal(card.dataset.resourceCard);
      }
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open();
    });
  });
  document.querySelector("#addSchemeButton")?.addEventListener("click", openSchemeModal);
  document.querySelector("#closeModal")?.addEventListener("click", closeModal);
}

function openModal(title, meta, body, size = "") {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalMeta").textContent = meta;
  document.querySelector("#modalBody").innerHTML = body;
  document.querySelector("#manageModalDialog").className = `modal ${size}`.trim();
  document.querySelector("#manageModal").classList.add("open");
}

function closeModal() {
  document.querySelector("#manageModal").classList.remove("open");
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

  openModal("字段映射配置", "配置当前场景数据集的答案列、列表展示列和标注上下文字段。", `
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
  openModal("数据集", "查看当前场景已导入的数据集，也可以继续导入单个或多个 Excel 文件。", `
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
      const ok = window.confirm(`确认删除数据集“${button.dataset.datasetName}”？删除后该数据集行数据也会同步删除。`);
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
      <section class="prompt-rule-box prompt-rule-strip">
        <strong>Prompt 规范</strong>
        <p>大模型输出必须是可以被 JSON 化的内容。占位符使用双大括号：<code>{{row.列名}}</code>、<code>{{knowledge}}</code>、<code>{{error_sets}}</code>。</p>
      </section>
      <aside class="prompt-sidebar" aria-label="已添加 Prompt">
        <div class="prompt-sidebar-head">
          <div>
            <strong>已添加 Prompt</strong>
            <span>${state.prompts.length} 条 · 点击名称可编辑</span>
          </div>
          <button class="ghost-button" type="button" id="newPromptButton">新增</button>
        </div>
        <div class="prompt-menu-list">
          ${state.prompts.map((item) => `
            <button class="prompt-menu-card" type="button" data-prompt-id="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.role_name || "未设置角色")} · 点击编辑</span>
            </button>
          `).join("") || `<div class="empty">当前场景暂无 Prompt。</div>`}
        </div>
      </aside>
      <form id="promptForm" class="prompt-editor-form labeled-form">
        <input type="hidden" name="id" id="promptId">
        <div class="prompt-editor-head">
          <div>
            <strong id="promptFormTitle">新增 Prompt</strong>
            <span id="promptFormMeta">填写名称、角色名和 Prompt 内容。</span>
          </div>
        </div>
        <div class="prompt-field-grid">
          <label><span>Prompt 名称</span><input class="input" name="name" placeholder="Prompt 名称" required></label>
          <label><span>角色名</span><input class="input" name="role_name" placeholder="例如：质检员 / 分析师" required></label>
        </div>
        <label class="prompt-content-field">
          <span>Prompt 内容</span>
          <textarea class="textarea rich-textarea prompt-editor-textarea" name="content" placeholder="Prompt 内容" required></textarea>
          <em class="prompt-placeholder-warning" id="promptPlaceholderWarning" hidden></em>
        </label>
        <button class="btn primary full" type="submit" id="promptSubmitButton">新增 Prompt</button>
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
          <button class="ghost-button" type="button" id="newKnowledgeButton">新增</button>
        </div>
        <div class="prompt-menu-list">
          ${state.knowledge.map((item) => `
            <button class="prompt-menu-card" type="button" data-knowledge-id="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.created_at || "未记录时间")} · 点击编辑</span>
            </button>
          `).join("") || `<div class="empty">当前场景暂无知识。</div>`}
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
        <button class="btn primary full" type="submit" id="knowledgeSubmitButton">新增知识</button>
      </form>
    </div>
  `, "modal-xl prompt-modal");
  bindKnowledgeEditor();
}

function openErrorSetModal() {
  openModal("错题集", "当前场景独立维护错题集名称和描述。点击左侧错题集名称后，可以在右侧直接编辑保存。", `
    <div class="prompt-editor-layout">
      <aside class="prompt-sidebar" aria-label="已添加错题集">
        <div class="prompt-sidebar-head">
          <div>
            <strong>已添加错题集</strong>
            <span>${state.errorSets.length} 个 · 点击名称可编辑</span>
          </div>
          <button class="ghost-button" type="button" id="newErrorSetButton">新增</button>
        </div>
        <div class="prompt-menu-list">
          ${state.errorSets.map((item) => `
            <button class="prompt-menu-card" type="button" data-error-set-id="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.description || "暂无描述")} · 点击编辑</span>
            </button>
          `).join("") || `<div class="empty">当前场景暂无错题集。</div>`}
        </div>
      </aside>
      <form id="errorSetForm" class="prompt-editor-form labeled-form">
        <input type="hidden" name="id" id="errorSetId">
        <div class="prompt-editor-head">
          <div>
            <strong id="errorSetFormTitle">新增错题集</strong>
            <span id="errorSetFormMeta">填写错题集名称和描述。</span>
          </div>
        </div>
        <div class="prompt-field-grid one">
          <label><span>错题集名称</span><input class="input" name="name" placeholder="错题集名称" required></label>
        </div>
        <label class="prompt-content-field">
          <span>描述</span>
          <textarea class="textarea rich-textarea prompt-editor-textarea" name="description" placeholder="描述"></textarea>
        </label>
        <button class="btn primary full" type="submit" id="errorSetSubmitButton">新增错题集</button>
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
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
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
    "错题集",
  ]);
  columnOptions().forEach((column) => {
    values.add(column);
    values.add(`row.${column}`);
    values.add(`dataset.${column}`);
  });
  state.knowledge.forEach((item) => {
    if (item.name) values.add(item.name);
  });
  state.errorSets.forEach((item) => {
    if (item.name) values.add(item.name);
  });
  return values;
}

function findUnmappedPromptPlaceholders(content) {
  const candidates = promptPlaceholderCandidates();
  return extractPromptPlaceholders(content).filter((name) => !candidates.has(name));
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
  const menuCards = [...document.querySelectorAll("[data-prompt-id]")];

  const updatePlaceholderWarning = () => {
    const missing = findUnmappedPromptPlaceholders(contentInput.value);
    warningNode.hidden = missing.length === 0;
    warningNode.textContent = missing.length
      ? `未找到映射值：${missing.map((item) => `{{${item}}}`).join("、")}`
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
    menuCards.forEach((card) => {
      card.classList.toggle("active", item?.id === card.dataset.promptId);
    });
    updatePlaceholderWarning();
  };

  contentInput.addEventListener("input", updatePlaceholderWarning);
  newButton?.addEventListener("click", () => setMode());
  menuCards.forEach((card) => {
    card.addEventListener("click", () => {
      const item = state.prompts.find((prompt) => prompt.id === card.dataset.promptId);
      if (item) setMode(item);
    });
  });

  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const missing = updatePlaceholderWarning();
    if (missing.length) {
      const ok = window.confirm(`以下占位符没有对应的映射值：${missing.map((item) => `{{${item}}}`).join("、")}。点击“确定”继续保存，点击“取消”返回编辑。`);
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
  const menuCards = [...document.querySelectorAll("[data-knowledge-id]")];

  const setMode = (item = null) => {
    idInput.value = item?.id || "";
    nameInput.value = item?.name || "";
    contentInput.value = item?.content || "";
    titleNode.textContent = item ? "编辑知识" : "新增知识";
    metaNode.textContent = item ? "已载入历史内容，可直接修改后保存。" : "填写知识名称和知识内容。";
    submitButton.textContent = item ? "保存知识" : "新增知识";
    menuCards.forEach((card) => {
      card.classList.toggle("active", item?.id === card.dataset.knowledgeId);
    });
  };

  newButton?.addEventListener("click", () => setMode());
  menuCards.forEach((card) => {
    card.addEventListener("click", () => {
      const item = state.knowledge.find((knowledge) => knowledge.id === card.dataset.knowledgeId);
      if (item) setMode(item);
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

  const setMode = (item = null) => {
    idInput.value = item?.id || "";
    nameInput.value = item?.name || "";
    descriptionInput.value = item?.description || "";
    titleNode.textContent = item ? "编辑错题集" : "新增错题集";
    metaNode.textContent = item ? "已载入历史描述，可直接修改后保存。" : "填写错题集名称和描述。";
    submitButton.textContent = item ? "保存错题集" : "新增错题集";
    menuCards.forEach((card) => {
      card.classList.toggle("active", item?.id === card.dataset.errorSetId);
    });
  };

  newButton?.addEventListener("click", () => setMode());
  menuCards.forEach((card) => {
    card.addEventListener("click", () => {
      const item = state.errorSets.find((errorSet) => errorSet.id === card.dataset.errorSetId);
      if (item) setMode(item);
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
    toast(errorSetId ? "错题集已保存" : "错题集已新增");
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

async function openSchemeModal() {
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
    promptInitMethods = { custom_default: { name: "自定义 Prompt 初始化", method_name: "build_prompt_custom" } };
  }
  openModal("添加方案", "方案会保存当前场景的资源、Prompt 初始化方式、后台方法和并发数。", `
    <form id="schemeForm" class="form-grid labeled-form">
      <label>
        <span>方案名称</span>
        <input class="input" name="name" placeholder="例如：双角色情感分类" required>
      </label>
      <label>
        <span>后台方法名</span>
        <select class="select" name="method_name" required>
          ${Object.entries(methods).map(([key, item]) => `<option value="${escapeHtml(item.method_name)}">${escapeHtml(item.name || key)} · ${escapeHtml(item.method_name)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Prompt 初始化类型</span>
        <select class="select" name="prompt_init_type" id="promptInitType">
          <option value="auto">自动替换占位符</option>
          <option value="custom">自定义处理（后台方法）</option>
        </select>
      </label>
      <label>
        <span>Prompt 初始化后台方法</span>
        <select class="select" name="prompt_init_method_name" id="promptInitMethod">
          ${Object.entries(promptInitMethods).map(([key, item]) => `<option value="${escapeHtml(item.method_name)}">${escapeHtml(item.name || key)} · ${escapeHtml(item.method_name)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>并发数量</span>
        <input class="input" type="number" min="1" max="20" name="concurrency" value="4" required>
      </label>
      ${renderSchemeResourcePicker("Prompt", "prompt_ids", state.prompts, "role_name")}
      ${renderSchemeResourcePicker("知识库", "knowledge_ids", state.knowledge, "content")}
      ${renderSchemeResourcePicker("错题集", "error_set_ids", state.errorSets, "description")}
      <button class="btn primary full" type="submit">保存方案</button>
    </form>
  `, "modal-xl");
  document.querySelector("#schemeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/schemes", {
      method: "POST",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        name: form.get("name"),
        method_name: form.get("method_name"),
        prompt_init_type: form.get("prompt_init_type"),
        prompt_init_method_name: form.get("prompt_init_method_name"),
        concurrency: Number(form.get("concurrency") || 1),
        prompt_ids: form.getAll("prompt_ids"),
        knowledge_ids: form.getAll("knowledge_ids"),
        error_set_ids: form.getAll("error_set_ids"),
      }),
    });
    await loadSceneResources();
    closeModal();
    renderManagePage();
    toast("方案已创建");
  });
}

function renderSchemeResourcePicker(title, name, items, metaField) {
  return `
    <section class="scheme-resource-picker full">
      <div class="mapping-title">
        <div>
          <strong>${title}</strong>
          <span>选择该方案要关联的${title}资源。</span>
        </div>
      </div>
      <div class="scheme-resource-grid">
        ${items.map((item) => `
          <label class="column-chip">
            <input type="checkbox" name="${name}" value="${escapeHtml(item.id)}">
            <span>${escapeHtml(item.name)}${metaField && item[metaField] ? ` · ${escapeHtml(String(item[metaField]).slice(0, 24))}` : ""}</span>
          </label>
        `).join("") || `<div class="empty">当前场景暂无${title}资源。</div>`}
      </div>
    </section>
  `;
}
