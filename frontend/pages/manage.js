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
  document.querySelector("#addSchemeButton")?.addEventListener("click", () => openSchemeModal());
  document.querySelectorAll("[data-edit-scheme]").forEach((button) => {
    button.addEventListener("click", () => openSchemeModal(button.dataset.editScheme));
  });
  document.querySelectorAll("[data-delete-scheme]").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = window.confirm(`确认删除标注方案“${button.dataset.schemeName}”？删除后该方案关联的资源选择会同步清理。`);
      if (!ok) return;
      await api(`/api/schemes/${encodeURIComponent(button.dataset.deleteScheme)}`, { method: "DELETE" });
      await loadSceneResources();
      renderManagePage();
      toast("标注方案已删除");
    });
  });
  document.querySelector("#closeModal")?.addEventListener("click", closeModalAndRefresh);
}

async function deleteActiveScene() {
  const scene = getActiveScene();
  if (!scene) {
    toast("请先选择场景");
    return;
  }
  const ok = window.confirm(
    `确认删除场景“${scene.name}”？\n\n该操作会关联删除该场景下的所有数据集、Prompt、知识库、错题集、字段映射配置和标注方案。确认后会执行全部删除。`
  );
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
        <p>占位符统一使用全角大括号 <code>｛row.列名｝</code>、<code>｛knowledge.知识名称｝</code>、<code>｛error_sets.错题集名称｝</code>。需要引用全部资源时可用 <code>｛knowledge｝</code>、<code>｛error_sets｝</code>。JSON 返回格式和 <code>{{字段}}</code> 示例会原样保留。</p>
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
            <div class="prompt-menu-card resource-menu-card" role="button" tabindex="0" data-prompt-id="${escapeHtml(item.id)}">
              <div class="resource-menu-text">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.role_name || "未设置角色")} · 点击编辑</span>
              </div>
              <button class="resource-delete-button" type="button" data-delete-prompt="${escapeHtml(item.id)}" data-resource-name="${escapeHtml(item.name)}">删除</button>
            </div>
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
            <div class="prompt-menu-card resource-menu-card" role="button" tabindex="0" data-knowledge-id="${escapeHtml(item.id)}">
              <div class="resource-menu-text">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.created_at || "未记录时间")} · 点击编辑</span>
              </div>
              <button class="resource-delete-button" type="button" data-delete-knowledge="${escapeHtml(item.id)}" data-resource-name="${escapeHtml(item.name)}">删除</button>
            </div>
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
            <div class="prompt-menu-card resource-menu-card" role="button" tabindex="0" data-error-set-id="${escapeHtml(item.id)}">
              <div class="resource-menu-text">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.description || "暂无描述")} · 点击编辑</span>
              </div>
              <button class="resource-delete-button" type="button" data-delete-error-set="${escapeHtml(item.id)}" data-resource-name="${escapeHtml(item.name)}">删除</button>
            </div>
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
  const menuCards = [...document.querySelectorAll("[data-prompt-id]")];

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
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".resource-delete-button")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const item = state.prompts.find((prompt) => prompt.id === card.dataset.promptId);
      if (item) setMode(item);
    });
  });
  document.querySelectorAll("[data-delete-prompt]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = window.confirm(`确认删除 Prompt“${button.dataset.resourceName}”？关联方案中的该 Prompt 引用也会同步移除。`);
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
      const ok = window.confirm(`以下占位符没有对应的映射值：${missing.map(renderPlaceholderName).join("、")}。点击“确定”继续保存，点击“取消”返回编辑。`);
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
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".resource-delete-button")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const item = state.knowledge.find((knowledge) => knowledge.id === card.dataset.knowledgeId);
      if (item) setMode(item);
    });
  });
  document.querySelectorAll("[data-delete-knowledge]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = window.confirm(`确认删除知识“${button.dataset.resourceName}”？关联方案中的该知识引用也会同步移除。`);
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
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".resource-delete-button")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const item = state.errorSets.find((errorSet) => errorSet.id === card.dataset.errorSetId);
      if (item) setMode(item);
    });
  });
  document.querySelectorAll("[data-delete-error-set]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const ok = window.confirm(`确认删除错题集“${button.dataset.resourceName}”？关联方案中的该错题集引用也会同步移除。`);
      if (!ok) return;
      await api(`/api/error-sets/${encodeURIComponent(button.dataset.deleteErrorSet)}`, { method: "DELETE" });
      await loadSceneResources();
      openErrorSetModal();
      toast("错题集已删除");
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
    promptInitMethods = { custom_default: { name: "自定义 Prompt 初始化", method_name: "build_prompts_custom" } };
  }
  const initType = editingScheme?.prompt_init_type || "auto";
  openModal(editingScheme ? "编辑方案" : "添加方案", "选择 Prompt、初始化方式和标注方法，系统自动生成方案名称。", `
    <form id="schemeForm" class="scheme-form-v2 labeled-form">
      <div class="scheme-two-column-layout">
        <div class="scheme-column scheme-column-prompt">
          ${renderSchemePromptPicker(state.prompts, selectedResources.prompt)}

          <section class="scheme-config-card">
            <div class="scheme-config-title">
              <strong>Prompt 初始化</strong>
              <span>决定 Prompt 中占位符的处理方式。</span>
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
          </section>

          <section class="scheme-config-card" id="customPromptPanel" hidden>
            <div class="scheme-config-title">
              <strong>自定义初始化</strong>
              <span>手动选择初始化方法、知识库和错题集。</span>
            </div>
            ${renderSchemeSelect("prompt_init_method_name", "promptInitMethod", promptInitMethods, editingScheme?.prompt_init_method_name, "选择 Prompt 初始化后台方法")}
            <div class="scheme-method-help" id="promptInitMethodHelp"></div>
            <div class="scheme-custom-resource-grid">
              ${renderSchemeResourcePicker("知识库", "knowledge_ids", state.knowledge, "content", selectedResources.knowledge, { searchable: true, compact: true })}
              ${renderSchemeResourcePicker("错题集", "error_set_ids", state.errorSets, "description", selectedResources.error_set, { searchable: true, compact: true })}
            </div>
          </section>
        </div>

        <div class="scheme-column scheme-column-execution">
          <section class="scheme-config-card" id="autoPromptPanel">
            <div class="scheme-config-title">
              <strong>占位符检查</strong>
              <span>保存前会检查字段和资源引用。</span>
            </div>
            <div id="autoPromptValidation"></div>
            <div class="auto-linked-resources" id="autoLinkedResources"></div>
          </section>

          <section class="scheme-config-card">
            <div class="scheme-config-title">
              <strong>执行配置</strong>
              <span>选择标注后台方法和并发数量。</span>
            </div>
            <div class="scheme-method-grid">
              ${renderSchemeSelect("method_name", "schemeMethod", methods, editingScheme?.method_name || "call_model", "选择标注后台方法", true)}
              <label class="scheme-concurrency-field">
                <span>并发数量</span>
                <input class="input" type="number" min="1" max="20" name="concurrency" value="${escapeHtml(editingScheme?.concurrency || 5)}" required>
              </label>
            </div>
            <div class="scheme-method-help" id="schemeMethodHelp"></div>
          </section>

        </div>
      </div>

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
        name: buildSchemeAutoName(form),
        model_key: editingScheme?.model_key || "configured",
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

function renderSchemeSelect(name, id, items, selectedValue = "", label = "", required = false) {
  const entries = Object.entries(items);
  const selected = selectedValue || entries[0]?.[1]?.method_name || "";
  return `
    <label class="scheme-select-field">
      <span>${escapeHtml(label)}</span>
      <select class="select" name="${name}" id="${id}" ${required ? "required" : ""}>
        ${entries.map(([key, item]) => `<option value="${escapeHtml(item.method_name)}" ${item.method_name === selected ? "selected" : ""} data-method-key="${escapeHtml(key)}">${escapeHtml(item.name || key)} · ${escapeHtml(item.method_name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderSchemePromptPicker(items, selected = new Set()) {
  const selectedItems = items.filter((item) => selected.has(item.id));
  return `
    <section class="scheme-prompt-picker scheme-config-card" data-scheme-resource-picker="prompt_ids">
      <div class="scheme-config-title">
        <div>
          <strong>Prompt 角色</strong>
          <span>一个方案可选择多个角色 Prompt。</span>
        </div>
        <span>按角色名快速选择。</span>
      </div>
      <div class="scheme-prompt-toolbar">
        <div class="scheme-prompt-selected" id="schemePromptSelected">
          <strong>已选 ${selectedItems.length} 个</strong>
          <div>
            ${selectedItems.map((item) => `<span>${escapeHtml(item.role_name || item.name)}</span>`).join("") || `<em>选择后会在这里显示角色</em>`}
          </div>
        </div>
        <input class="input scheme-prompt-search" type="search" placeholder="搜索 Prompt / 角色" data-resource-search="prompt_ids">
      </div>
      <div class="scheme-prompt-list">
        ${items.map((item) => {
          const roleLabel = item.role_name || item.name || "未设置角色";
          const promptLabel = item.name && item.name !== roleLabel ? item.name : "";
          return `
          <label class="scheme-prompt-option" data-resource-option="prompt_ids" data-resource-text="${escapeHtml(`${item.name} ${item.role_name || ""}`.toLowerCase())}">
            <input type="checkbox" name="prompt_ids" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""}>
            <span class="scheme-prompt-check"></span>
            <span class="scheme-prompt-copy">
              <em>${escapeHtml(roleLabel)}</em>
              ${promptLabel ? `<strong>${escapeHtml(promptLabel)}</strong>` : ""}
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
  const selectedItems = items.filter((item) => selected.has(item.id));
  return `
    <section class="scheme-resource-picker ${compact}" data-scheme-resource-picker="${name}">
      <details class="scheme-resource-dropdown">
        <summary>
          <span>
            <strong>${escapeHtml(title)}</strong>
            <em>${selectedItems.length ? `已选 ${selectedItems.length} 项` : `选择${escapeHtml(title)}`}</em>
          </span>
          <b>⌄</b>
        </summary>
        ${searchable ? `<input class="input scheme-resource-search" type="search" placeholder="搜索${escapeHtml(title)}" data-resource-search="${name}">` : ""}
        <div class="scheme-resource-grid">
          ${items.map((item) => `
            <label class="column-chip scheme-resource-option" data-resource-option="${name}" data-resource-text="${escapeHtml(`${item.name} ${item[metaField] || ""}`.toLowerCase())}">
              <input type="checkbox" name="${name}" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""}>
              <span>${escapeHtml(item.name)}${metaField && item[metaField] ? ` · ${escapeHtml(String(item[metaField]).slice(0, 24))}` : ""}</span>
            </label>
          `).join("") || `<div class="empty">当前场景暂无${title}资源。</div>`}
        </div>
      </details>
    </section>
  `;
}

function bindSchemeModalControls(methods, promptInitMethods) {
  const form = document.querySelector("#schemeForm");
  const refresh = () => {
    const formData = new FormData(form);
    const initType = formData.get("prompt_init_type") || "auto";
    const isCustom = initType === "custom";
    document.querySelector("#autoPromptPanel").hidden = isCustom;
    document.querySelector("#customPromptPanel").hidden = !isCustom;
    renderAutoPromptValidation(formData.getAll("prompt_ids"));
    updateSchemePromptSummary();
    updateSchemeAutoNamePreview(formData);
    updateSchemeExecutionPreview(formData);
    updateSchemeMethodHelp("#schemeMethod", "#schemeMethodHelp", methods);
    updateSchemeMethodHelp("#promptInitMethod", "#promptInitMethodHelp", promptInitMethods);
  };
  form.querySelectorAll('input[name="prompt_init_type"], input[name="prompt_ids"]').forEach((input) => {
    input.addEventListener("change", refresh);
  });
  form.querySelector('input[name="concurrency"]')?.addEventListener("input", refresh);
  form.querySelector("#schemeMethod")?.addEventListener("change", refresh);
  form.querySelector("#promptInitMethod")?.addEventListener("change", refresh);
  form.querySelectorAll("[data-resource-search]").forEach((input) => {
    input.addEventListener("input", () => filterSchemeResourceOptions(input));
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
  if (!node) return;
  node.textContent = buildSchemeAutoName(form);
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

function updateSchemePromptSummary() {
  const summary = document.querySelector("#schemePromptSelected");
  if (!summary) return;
  const checked = [...document.querySelectorAll('input[name="prompt_ids"]:checked')];
  const names = checked.map((input) => {
    const card = input.closest(".scheme-prompt-option");
    return card?.querySelector(".scheme-prompt-copy em")?.textContent?.trim()
      || card?.querySelector(".scheme-prompt-copy strong")?.textContent?.trim()
      || input.value;
  });
  summary.innerHTML = `
    <strong>已选 ${checked.length} 个</strong>
    <div>
      ${names.map((name) => `<span>${escapeHtml(name)}</span>`).join("") || `<em>选择后会在这里显示角色</em>`}
    </div>
  `;
}

function updateSchemeMethodHelp(selectSelector, helpSelector, items) {
  const select = document.querySelector(selectSelector);
  const help = document.querySelector(helpSelector);
  if (!select || !help) return;
  const item = Object.values(items).find((method) => method.method_name === select.value);
  help.innerHTML = item
    ? `<strong>${escapeHtml(item.name || select.value)}</strong><span>${escapeHtml(item.description || "暂无说明")}</span>`
    : `<span>暂无方法说明。</span>`;
}

function filterSchemeResourceOptions(input) {
  const keyword = input.value.trim().toLowerCase();
  document.querySelectorAll(`[data-resource-option="${input.dataset.resourceSearch}"]`).forEach((option) => {
    option.hidden = keyword && !option.dataset.resourceText.includes(keyword);
  });
}

function renderAutoPromptValidation(promptIds) {
  const result = analyzeAutoPromptLinks(promptIds);
  const validation = document.querySelector("#autoPromptValidation");
  const linked = document.querySelector("#autoLinkedResources");
  if (!validation || !linked) return;
  const messages = [
    ...result.errors.map((message) => ({ type: "error", message })),
    ...result.warnings.map((message) => ({ type: "warning", message })),
  ];
  validation.innerHTML = messages.length
    ? `<div class="scheme-validation-list">${messages.map((item) => `<div class="${item.type}">${escapeHtml(item.message)}</div>`).join("")}</div>`
    : `<div class="scheme-validation-ok">占位符检查通过。自动模式会按引用关联知识库和错题集。</div>`;
  linked.innerHTML = `
    ${renderAutoLinkedCard("关联知识库", result.knowledge)}
    ${renderAutoLinkedCard("关联错题集", result.errorSets)}
  `;
}

function renderAutoLinkedCard(title, items) {
  return `
    <section class="auto-linked-card">
      <div><strong>${title}</strong><span>${items.length} 项</span></div>
      <div class="auto-linked-list">
        ${items.map((item) => `<span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`).join("") || `<em>当前 Prompt 未引用</em>`}
      </div>
    </section>
  `;
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
      if (["error_sets", "error_set", "错题集"].includes(key)) {
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
      const errorSetName = parseNamedResourceRef(key, ["error_sets", "error_set", "错题集"]);
      if (errorSetName) {
        const item = state.errorSets.find((resource) => resource.name === errorSetName || resource.id === errorSetName);
        if (item) errorSetIds.add(item.id);
        else errors.push(`${prompt.name} 引用了不存在的错题集：${errorSetName}`);
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
    warnings.push("检测到 ｛error_sets｝，会自动关联当前场景全部错题集。");
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
