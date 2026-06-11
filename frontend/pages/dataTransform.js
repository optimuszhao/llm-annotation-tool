import { api, state, toast } from "/assets/app.js";

const aggregateLabels = {
  direct: "直接取值",
  first: "取第一条",
  join: "拼接",
  unique_join: "去重拼接",
  count: "计数",
  sum: "求和",
  avg: "平均值",
  max: "最大值",
  min: "最小值",
};

let session = null;
let config = { version: 1, granularity_table: "", relations: [], output_fields: [] };
let previewRows = [];
let relationDraft = null;
let selectedFiles = [];
let uploadedFileSummary = "";

export async function renderDataTransformPage() {
  const root = document.querySelector("#page-data-transform");
  if (!root) return;
  root.innerHTML = renderPage();
  bindEvents(root);
  await loadSavedConfig();
  renderWorkspace();
}

function renderPage() {
  return `
    <div class="data-transform-page">
      <section class="transform-upload-hero">
        <div class="transform-head-copy">
          <strong>数据转换</strong>
          <span>把多张 JSONL 表配置成一个可导出的 Excel 转换算法包。</span>
        </div>
        <div class="transform-status-strip" aria-label="转换配置状态">
          <div><span>表</span><strong id="transformStatusTables">0</strong></div>
          <div><span>关系</span><strong id="transformStatusRelations">0</strong></div>
          <div><span>字段</span><strong id="transformStatusFields">0</strong></div>
          <div><span>预览</span><strong id="transformStatusPreview">0</strong></div>
        </div>
        <form id="transformUploadForm" class="transform-upload-form">
          <label class="transform-file-picker" for="transformJsonlFiles">
            <input type="file" id="transformJsonlFiles" name="files" accept=".jsonl" multiple required>
            <span class="transform-file-icon" aria-hidden="true">JSONL</span>
            <span class="transform-file-copy">
              <strong id="transformFileTitle">选择 JSONL 文件</strong>
              <em id="transformFileMeta">支持多个文件，每个文件对应一张表</em>
            </span>
          </label>
          <button class="btn transform-parse-button" type="submit">解析 JSONL</button>
        </form>
        <div class="transform-actions">
          <button class="btn transform-save-button" id="saveTransformConfigButton" type="button">保存配置</button>
          <button class="btn transform-export-button" id="exportTransformPackageButton" type="button">导出算法包</button>
        </div>
      </section>

      <section class="transform-panel source-panel">
        <header>
          <div>
            <h2>设置数据库表关联</h2>
            <span>点击两张表里的字段建立一条关联关系，系统也会自动识别常见外键。</span>
          </div>
          <span id="transformTableCount">未上传</span>
        </header>
        <div class="transform-table-list" id="transformTableList"></div>
        <div class="relation-list" id="relationList"></div>
      </section>

      <div class="transform-config-grid">
        <section class="transform-panel granularity-panel">
          <header>
            <h2>Excel 以哪一个列表数据为基准</h2>
            <span>决定 Excel 的每一行来自哪张表</span>
          </header>
          <select class="select" id="granularitySelect"></select>
        </section>

        <section class="transform-panel output-panel">
          <header>
            <h2>转换后 Excel 包含字段</h2>
            <button class="btn small" id="addOutputFieldButton" type="button">新增字段</button>
          </header>
          <div class="output-field-list" id="outputFieldList"></div>
        </section>
      </div>

      <section class="transform-panel preview-panel">
        <header>
          <h2>转换预览</h2>
          <button class="btn" id="previewTransformButton" type="button">预览前 20 行</button>
        </header>
        <div class="preview-table-wrap" id="transformPreview"></div>
      </section>
    </div>
  `;
}

function bindEvents(root) {
  root.querySelector("#transformUploadForm").addEventListener("submit", handleUpload);
  root.querySelector("#transformJsonlFiles").addEventListener("change", handleFileSelection);
  root.querySelector("#saveTransformConfigButton").addEventListener("click", saveConfig);
  root.querySelector("#exportTransformPackageButton").addEventListener("click", exportPackage);
  root.querySelector("#addOutputFieldButton").addEventListener("click", addOutputField);
  root.querySelector("#previewTransformButton").addEventListener("click", previewTransform);
  root.querySelector("#granularitySelect").addEventListener("change", (event) => {
    config.granularity_table = event.target.value;
    normalizeAggregates();
    renderWorkspace();
  });
}

function handleFileSelection(event) {
  selectedFiles = Array.from(event.target.files || []).map((file) => ({
    name: file.name,
    size: file.size,
  }));
  renderFileSelection();
}

function renderFileSelection() {
  const title = document.querySelector("#transformFileTitle");
  const meta = document.querySelector("#transformFileMeta");
  if (!title || !meta) return;
  if (!selectedFiles.length) {
    title.textContent = uploadedFileSummary || "选择 JSONL 文件";
    meta.textContent = uploadedFileSummary ? "可重新选择文件后再次解析" : "支持多个文件，每个文件对应一张表";
    return;
  }
  title.textContent = `已选择 ${selectedFiles.length} 个 JSONL`;
  const names = selectedFiles.slice(0, 2).map((file) => file.name).join("、");
  const more = selectedFiles.length > 2 ? ` 等 ${selectedFiles.length} 个文件` : "";
  meta.textContent = `${names}${more}`;
}

async function loadSavedConfig() {
  if (!state.activeSceneId) return;
  try {
    const saved = await api(`/api/data-transform/config?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    if (saved.config && Object.keys(saved.config).length) config = saved.config;
  } catch (error) {
    toast(error.message);
  }
}

async function handleUpload(event) {
  event.preventDefault();
  const input = document.querySelector("#transformJsonlFiles");
  if (!input.files.length) return toast("请选择 JSONL 文件");
  const formData = new FormData();
  Array.from(input.files).forEach((file) => formData.append("files", file));
  const button = event.target.querySelector("button");
  button.disabled = true;
  button.textContent = "解析中...";
  try {
    session = await api("/api/data-transform/upload", { method: "POST", body: formData });
    config = mergeConfig(session.default_config || {}, config);
    uploadedFileSummary = `已解析 ${session.tables.length} 张表`;
    event.target.reset();
    selectedFiles = [];
    renderFileSelection();
    renderWorkspace();
    toast(`已解析 ${session.tables.length} 张表`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "解析 JSONL";
  }
}

function mergeConfig(defaultConfig, savedConfig) {
  if (!savedConfig?.granularity_table) return defaultConfig;
  const tableNames = new Set((session?.tables || []).map((table) => table.name));
  if (!tableNames.has(savedConfig.granularity_table)) return defaultConfig;
  return {
    ...defaultConfig,
    ...savedConfig,
    relations: savedConfig.relations?.length ? savedConfig.relations : defaultConfig.relations,
    output_fields: savedConfig.output_fields?.length ? savedConfig.output_fields : defaultConfig.output_fields,
  };
}

function renderWorkspace() {
  renderStatusStrip();
  renderTables();
  renderRelations();
  renderGranularity();
  renderOutputFields();
  renderPreview();
}

function renderStatusStrip() {
  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = String(value);
  };
  setText("#transformStatusTables", tables().length);
  setText("#transformStatusRelations", (config.relations || []).length);
  setText("#transformStatusFields", (config.output_fields || []).length);
  setText("#transformStatusPreview", previewRows.length);
}

function tables() {
  return session?.tables || [];
}

function tableByName(name) {
  return tables().find((table) => table.name === name);
}

function fieldsFor(tableName) {
  return tableByName(tableName)?.fields || [];
}

function renderTables() {
  const list = document.querySelector("#transformTableList");
  const count = document.querySelector("#transformTableCount");
  count.textContent = tables().length ? `${tables().length} 张表` : "未上传";
  if (!tables().length) {
    list.innerHTML = `<div class="transform-empty">上传 JSONL 后展示字段、类型和样例。</div>`;
    return;
  }
  list.innerHTML = `
    <div class="field-column-grid">
      ${tables().map((table) => `
        <article class="field-column">
          <div class="field-column-head">
            <strong>${escapeHtml(table.name)}</strong>
            <span>${table.row_count} 行 · 主键 ${escapeHtml(table.primary_key)}</span>
          </div>
          <div class="field-column-list">
            ${table.fields.map((field) => renderFieldNode(table, field)).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
  list.querySelectorAll("[data-field-node]").forEach((button) => {
    button.addEventListener("click", handleFieldNodeClick);
  });
}

function renderRelations() {
  const list = document.querySelector("#relationList");
  if (!tables().length) {
    list.innerHTML = "";
    return;
  }
  config.relations = config.relations || [];
  const draft = relationDraft
    ? `<div class="relation-draft-tip active"><strong>起点</strong><span>${escapeHtml(relationDraft.table)}.${escapeHtml(relationDraft.field)}</span><em>选择另一张表字段完成关系</em></div>`
    : `<div class="relation-draft-tip"><strong>关系配置</strong><span>选择两个不同表字段</span><em>自动识别结果可继续手动补充</em></div>`;
  const lines = config.relations.map((relation, index) => `
    <div class="relation-line-row">
      <span>${escapeHtml(relation.parent_table)}.${escapeHtml(relation.parent_field)}</span>
      <b>关联</b>
      <span>${escapeHtml(relation.child_table)}.${escapeHtml(relation.child_field)}</span>
      <button class="icon-btn" type="button" data-remove-relation="${index}" aria-label="删除关系"><span class="ui-icon ui-icon-close" aria-hidden="true"></span></button>
    </div>
  `).join("");
  list.innerHTML = `
    ${draft}
    <div class="relation-line-wrap">
      ${lines || `<div class="relation-line-empty">暂无字段关系</div>`}
    </div>
  `;
  list.querySelectorAll("[data-remove-relation]").forEach((button) => {
    button.addEventListener("click", () => {
      config.relations.splice(Number(button.dataset.removeRelation), 1);
      renderWorkspace();
    });
  });
}

function renderFieldNode(table, field) {
  const selected = relationDraft?.table === table.name && relationDraft?.field === field.name;
  const linked = relationUsesField(table.name, field.name);
  return `
    <button
      class="field-node ${selected ? "is-draft" : ""} ${linked ? "is-linked" : ""}"
      type="button"
      data-field-node
      data-table-name="${escapeHtml(table.name)}"
      data-field-name="${escapeHtml(field.name)}"
      title="${escapeHtml(String(field.sample ?? ""))}"
    >
      <span class="field-node-check" aria-hidden="true"></span>
      <strong>${escapeHtml(field.name)}</strong>
      <em>${escapeHtml(field.type)}</em>
    </button>
  `;
}

function relationUsesField(tableName, fieldName) {
  return (config.relations || []).some((relation) => (
    (relation.parent_table === tableName && relation.parent_field === fieldName)
    || (relation.child_table === tableName && relation.child_field === fieldName)
  ));
}

function handleFieldNodeClick(event) {
  const next = {
    table: event.currentTarget.dataset.tableName,
    field: event.currentTarget.dataset.fieldName,
  };
  if (!relationDraft) {
    relationDraft = next;
    renderTables();
    renderRelations();
    return;
  }
  if (relationDraft.table === next.table && relationDraft.field === next.field) {
    relationDraft = null;
    renderTables();
    renderRelations();
    return;
  }
  if (relationDraft.table === next.table) {
    relationDraft = next;
    renderTables();
    renderRelations();
    toast("已切换连线起点，请选择另一张表字段");
    return;
  }
  const exists = (config.relations || []).some((relation) => {
    const sameDirection = relation.parent_table === relationDraft.table
      && relation.parent_field === relationDraft.field
      && relation.child_table === next.table
      && relation.child_field === next.field;
    const reverseDirection = relation.parent_table === next.table
      && relation.parent_field === next.field
      && relation.child_table === relationDraft.table
      && relation.child_field === relationDraft.field;
    return sameDirection || reverseDirection;
  });
  if (!exists) {
    config.relations = config.relations || [];
    config.relations.push({
      parent_table: relationDraft.table,
      parent_field: relationDraft.field,
      child_table: next.table,
      child_field: next.field,
    });
  } else {
    toast("该字段关系已存在");
  }
  relationDraft = null;
  renderWorkspace();
}

function renderGranularity() {
  const select = document.querySelector("#granularitySelect");
  select.innerHTML = tables().map((table) => `<option value="${escapeHtml(table.name)}">${escapeHtml(table.name)}</option>`).join("");
  if (!config.granularity_table && tables()[0]) config.granularity_table = tables()[0].name;
  select.value = config.granularity_table || "";
}

function renderOutputFields() {
  const list = document.querySelector("#outputFieldList");
  if (!tables().length) {
    list.innerHTML = `<div class="transform-empty">上传后配置 Excel 字段。</div>`;
    return;
  }
  config.output_fields = config.output_fields || [];
  const rows = config.output_fields.map((field, index) => {
    const aggregateOptions = Object.entries(aggregateLabels)
      .map(([value, label]) => `<option value="${value}" ${field.aggregate === value ? "selected" : ""}>${label}</option>`)
      .join("");
    return `
      <div class="output-field-row" data-output-index="${index}">
        <label>
          <span>Excel 字段</span>
          <input class="input" data-output-key="name" value="${escapeHtml(field.name || "")}" placeholder="字段名">
        </label>
        <label>
          <span>来源表</span>
          ${tableSelect("source_table", field.source_table)}
        </label>
        <label>
          <span>来源字段</span>
          ${fieldSelect(field.source_table, "source_field", field.source_field)}
        </label>
        <label>
          <span>取值方式</span>
          <select class="select" data-output-key="aggregate">${aggregateOptions}</select>
        </label>
        <button class="icon-btn" type="button" data-remove-output="${index}" aria-label="删除字段"><span class="ui-icon ui-icon-close" aria-hidden="true"></span></button>
      </div>
    `;
  }).join("");
  list.innerHTML = rows || `<div class="transform-empty">点击新增字段开始配置。</div>`;
  list.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("change", handleOutputChange);
    control.addEventListener("input", handleOutputChange);
  });
  list.querySelectorAll("[data-remove-output]").forEach((button) => {
    button.addEventListener("click", () => {
      config.output_fields.splice(Number(button.dataset.removeOutput), 1);
      renderOutputFields();
      renderStatusStrip();
    });
  });
}

function renderPreview() {
  const wrap = document.querySelector("#transformPreview");
  if (!previewRows.length) {
    wrap.innerHTML = `<div class="transform-empty">点击预览后展示转换结果。</div>`;
    return;
  }
  const columns = Object.keys(previewRows[0] || {});
  wrap.innerHTML = `
    <table class="transform-preview-table">
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>
        ${previewRows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column] ?? "")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function tableSelect(key, value) {
  return `
    <select class="select" data-key="${key}">
      ${tables().map((table) => `<option value="${escapeHtml(table.name)}" ${value === table.name ? "selected" : ""}>${escapeHtml(table.name)}</option>`).join("")}
    </select>
  `;
}

function fieldSelect(tableName, key, value) {
  const fields = fieldsFor(tableName);
  return `
    <select class="select" data-key="${key}">
      ${fields.map((field) => `<option value="${escapeHtml(field.name)}" ${value === field.name ? "selected" : ""}>${escapeHtml(field.name)}</option>`).join("")}
    </select>
  `;
}

function handleRelationChange(event) {
  const row = event.target.closest("[data-relation-index]");
  const index = Number(row.dataset.relationIndex);
  const relation = config.relations[index];
  relation[event.target.dataset.key] = event.target.value;
  if (event.target.dataset.key === "parent_table") relation.parent_field = fieldsFor(event.target.value)[0]?.name || "";
  if (event.target.dataset.key === "child_table") relation.child_field = fieldsFor(event.target.value)[0]?.name || "";
  renderRelations();
}

function handleOutputChange(event) {
  const row = event.target.closest("[data-output-index]");
  const index = Number(row.dataset.outputIndex);
  const field = config.output_fields[index];
  const key = event.target.dataset.outputKey || event.target.dataset.key;
  field[key] = event.target.value;
  if (key === "source_table") {
    field.source_field = fieldsFor(event.target.value)[0]?.name || "";
    field.aggregate = event.target.value === config.granularity_table ? "direct" : "first";
    renderOutputFields();
  }
}

function addRelation() {
  const [parent, child] = tables();
  if (!parent || !child) return toast("至少需要两张表才能新增关系");
  config.relations = config.relations || [];
  config.relations.push({
    parent_table: parent.name,
    parent_field: parent.primary_key || parent.fields[0]?.name || "",
    child_table: child.name,
    child_field: child.fields[0]?.name || "",
  });
  renderRelations();
}

function addOutputField() {
  const table = tableByName(config.granularity_table) || tables()[0];
  if (!table) return toast("请先上传 JSONL");
  const field = table.fields[0];
  config.output_fields = config.output_fields || [];
  config.output_fields.push({
    name: field ? `${table.name}.${field.name}` : "新字段",
    source_table: table.name,
    source_field: field?.name || "",
    aggregate: "direct",
  });
  renderOutputFields();
  renderStatusStrip();
}

function normalizeAggregates() {
  (config.output_fields || []).forEach((field) => {
    if (field.source_table === config.granularity_table && field.aggregate === "first") field.aggregate = "direct";
    if (field.source_table !== config.granularity_table && field.aggregate === "direct") field.aggregate = "first";
  });
}

async function saveConfig() {
  if (!state.activeSceneId) return toast("请先选择场景");
  try {
    await api("/api/data-transform/config", {
      method: "PUT",
      body: JSON.stringify({ scene_id: state.activeSceneId, config }),
    });
    toast("数据转换配置已保存");
  } catch (error) {
    toast(error.message);
  }
}

async function previewTransform() {
  if (!session?.session_id) return toast("请先上传 JSONL");
  try {
    const result = await api("/api/data-transform/preview", {
      method: "POST",
      body: JSON.stringify({ session_id: session.session_id, config, limit: 20 }),
    });
    previewRows = result.rows || [];
    renderPreview();
    renderStatusStrip();
    toast(`已生成 ${previewRows.length} 行预览`);
  } catch (error) {
    toast(error.message);
  }
}

async function exportPackage() {
  if (!config.granularity_table || !(config.output_fields || []).length) return toast("请先完成输出配置");
  try {
    const response = await fetch("/api/data-transform/package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "导出失败");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "data_transform_package.zip";
    link.click();
    URL.revokeObjectURL(url);
    toast("算法包已导出");
  } catch (error) {
    toast(error.message);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
