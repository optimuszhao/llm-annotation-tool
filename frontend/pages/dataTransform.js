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
      <section class="data-transform-head">
        <div>
          <p class="eyebrow">JSONL TO EXCEL</p>
          <h1>数据转换</h1>
          <p>上传多个 JSONL 表数据，配置字段映射、输出颗粒度和聚合方式，导出可运行的 Python 转换算法包。</p>
        </div>
        <div class="transform-actions">
          <button class="btn" id="saveTransformConfigButton" type="button">保存配置</button>
          <button class="btn primary" id="exportTransformPackageButton" type="button">导出算法包</button>
        </div>
      </section>

      <section class="transform-upload-panel">
        <div>
          <strong>上传 JSONL 表数据</strong>
          <span>每个文件代表一张表，系统会按文件名生成表名并自动识别外键关系。</span>
        </div>
        <form id="transformUploadForm">
          <input type="file" id="transformJsonlFiles" name="files" accept=".jsonl" multiple required>
          <button class="btn primary" type="submit">解析 JSONL</button>
        </form>
      </section>

      <div class="transform-grid">
        <section class="transform-panel">
          <header>
            <h2>1. 表与字段</h2>
            <span id="transformTableCount">未上传</span>
          </header>
          <div class="transform-table-list" id="transformTableList"></div>
        </section>

        <section class="transform-panel">
          <header>
            <h2>2. 字段关系</h2>
            <button class="btn small" id="addRelationButton" type="button">新增关系</button>
          </header>
          <div class="relation-list" id="relationList"></div>
        </section>

        <section class="transform-panel">
          <header>
            <h2>3. 输出颗粒度</h2>
            <span>决定 Excel 一行代表哪张表的一条数据</span>
          </header>
          <select class="select" id="granularitySelect"></select>
        </section>

        <section class="transform-panel output-panel">
          <header>
            <h2>4. Excel 输出字段</h2>
            <button class="btn small" id="addOutputFieldButton" type="button">新增字段</button>
          </header>
          <div class="output-field-list" id="outputFieldList"></div>
        </section>
      </div>

      <section class="transform-panel preview-panel">
        <header>
          <h2>5. 结果预览</h2>
          <button class="btn" id="previewTransformButton" type="button">预览前 20 行</button>
        </header>
        <div class="preview-table-wrap" id="transformPreview"></div>
      </section>
    </div>
  `;
}

function bindEvents(root) {
  root.querySelector("#transformUploadForm").addEventListener("submit", handleUpload);
  root.querySelector("#saveTransformConfigButton").addEventListener("click", saveConfig);
  root.querySelector("#exportTransformPackageButton").addEventListener("click", exportPackage);
  root.querySelector("#addRelationButton").addEventListener("click", addRelation);
  root.querySelector("#addOutputFieldButton").addEventListener("click", addOutputField);
  root.querySelector("#previewTransformButton").addEventListener("click", previewTransform);
  root.querySelector("#granularitySelect").addEventListener("change", (event) => {
    config.granularity_table = event.target.value;
    normalizeAggregates();
    renderWorkspace();
  });
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
  renderTables();
  renderRelations();
  renderGranularity();
  renderOutputFields();
  renderPreview();
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
  list.innerHTML = tables().map((table) => `
    <article class="transform-table-card">
      <div class="transform-table-title">
        <strong>${escapeHtml(table.name)}</strong>
        <span>${table.row_count} 行 · 主键 ${escapeHtml(table.primary_key)}</span>
      </div>
      <div class="field-chip-list">
        ${table.fields.map((field) => `
          <span class="field-chip" title="${escapeHtml(String(field.sample ?? ""))}">
            ${escapeHtml(field.name)} <em>${escapeHtml(field.type)}</em>
          </span>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function renderRelations() {
  const list = document.querySelector("#relationList");
  if (!tables().length) {
    list.innerHTML = `<div class="transform-empty">上传后自动识别表名_id 关系。</div>`;
    return;
  }
  config.relations = config.relations || [];
  list.innerHTML = config.relations.map((relation, index) => `
    <div class="relation-row" data-relation-index="${index}">
      ${tableSelect("parent_table", relation.parent_table)}
      ${fieldSelect(relation.parent_table, "parent_field", relation.parent_field)}
      <span>一对多</span>
      ${tableSelect("child_table", relation.child_table)}
      ${fieldSelect(relation.child_table, "child_field", relation.child_field)}
      <button class="icon-btn" type="button" data-remove-relation="${index}" aria-label="删除关系">×</button>
    </div>
  `).join("") || `<div class="transform-empty">暂未识别到关系，可以手动新增。</div>`;
  list.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", handleRelationChange);
  });
  list.querySelectorAll("[data-remove-relation]").forEach((button) => {
    button.addEventListener("click", () => {
      config.relations.splice(Number(button.dataset.removeRelation), 1);
      renderWorkspace();
    });
  });
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
        <input class="input" data-output-key="name" value="${escapeHtml(field.name || "")}" placeholder="Excel 字段名">
        ${tableSelect("source_table", field.source_table)}
        ${fieldSelect(field.source_table, "source_field", field.source_field)}
        <select class="select" data-output-key="aggregate">${aggregateOptions}</select>
        <button class="icon-btn" type="button" data-remove-output="${index}" aria-label="删除字段">×</button>
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
