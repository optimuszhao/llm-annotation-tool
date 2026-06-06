import { api, confirmAction, state, toast } from "/assets/app.js";

let scenes = [];
let datasets = [];
let schemes = [];
let allDatasets = [];
let allSchemes = [];
let evaluationTasks = [];
let evaluationDetail = null;
let candidates = [];
let activeSceneId = "";
let activeDatasetId = "";
let selectedSchemeIds = [];
let activeEvalTaskId = "";
let schemePickerOpen = false;
let addDialogOpen = false;
let loading = false;
let loaded = false;
let refreshTimer = 0;

export function renderEvaluationPage() {
  const root = document.querySelector("#page-evaluation");
  if (!root) return;
  if (!loaded && !loading) {
    loadEvaluationBootstrap();
  }
  root.innerHTML = renderPage();
  bindEvaluationInteractions(root);
  scheduleEvaluationRefresh();
}

function renderPage() {
  if (loading && !loaded) {
    return `
      <div class="evaluation-layout eval-planner">
        <section class="eval-scene-board compact">
          <div class="eval-empty-compare">
            <strong>正在加载评估数据</strong>
            <span>读取场景、数据集、方案和评估任务。</span>
          </div>
        </section>
      </div>
    `;
  }
  if (!scenes.length) {
    return `
      <div class="evaluation-layout eval-planner">
        <section class="eval-scene-board compact">
          <div class="eval-empty-compare">
            <strong>暂无场景</strong>
            <span>请先在数据集与方案管理中创建场景。</span>
          </div>
        </section>
      </div>
    `;
  }
  const scene = getScene();
  const dataset = getDataset();
  const compareItems = evaluationDetail?.items || [];
  return `
    <div class="evaluation-layout eval-planner">
      <section class="eval-scene-board compact">
        <div class="eval-section-head">
          <div>
            <strong>场景切换</strong>
            <span>场景较多时横向滚动，当前场景驱动下方数据集、方案和评估任务。</span>
          </div>
          <span class="eval-count-pill">${scenes.length} 个场景</span>
        </div>
        <div class="eval-scene-rail">
          ${scenes.map(renderScenePill).join("")}
        </div>
      </section>

      <section class="eval-launch-workspace">
        <div class="eval-launch-main">
          <div class="eval-section-head">
            <div>
              <strong>启动评估任务</strong>
              <span>选择一个全量数据集和多个方案，当前数据集无未完成标注任务时可启动。</span>
            </div>
            <button class="btn primary" type="button" id="startEvalTask" ${!activeDatasetId || !selectedSchemeIds.length ? "disabled" : ""}>启动评估</button>
          </div>
          <div class="eval-start-form">
            <label>
              <span>数据集</span>
              <select id="evalDatasetSelect" ${datasets.length ? "" : "disabled"}>
                ${datasets.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === activeDatasetId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
              </select>
            </label>
            <label class="eval-multi-field">
              <span>标注方案</span>
              <button class="eval-multi-trigger" type="button" id="schemePickerToggle" ${schemes.length ? "" : "disabled"}>
                <b>${selectedSchemeIds.length ? selectedSchemeIds.map((id) => schemeName(id)).join(" / ") : "请选择方案"}</b>
              </button>
              <div class="eval-scheme-menu ${schemePickerOpen ? "open" : ""}">
                ${schemes.map(renderSchemeOption).join("")}
              </div>
            </label>
          </div>
        </div>
        <aside class="eval-launch-aside task-picker">
          <label>
            <span>查看评估任务</span>
            <select id="evalTaskSelect" ${evaluationTasks.length ? "" : "disabled"}>
              ${evaluationTasks.map((task) => `<option value="${escapeHtml(task.id)}" ${task.id === activeEvalTaskId ? "selected" : ""}>${escapeHtml(task.name)}</option>`).join("")}
            </select>
          </label>
          <p>${evaluationDetail ? `${formatDate(evaluationDetail.created_at)} / ${evaluationDetail.item_count || 0} 个标注任务` : "当前场景和数据集下暂无评估任务。"}</p>
        </aside>
      </section>

      <section class="eval-compare-board">
        <div class="eval-section-head">
          <div>
            <strong>对比视图</strong>
            <span>${dataset ? `${escapeHtml(dataset.name)} / 最多并列展示 4 个标注任务。` : "请选择数据集。"}</span>
          </div>
          <button class="btn ghost" type="button" id="addCompareItem" ${evaluationDetail ? "" : "disabled"}>添加对比项</button>
        </div>
        ${renderCompareSurface(compareItems)}
      </section>
    </div>
    ${addDialogOpen ? renderAddDialog() : ""}
  `;
}

function bindEvaluationInteractions(root) {
  root.addEventListener("click", (event) => {
    if (schemePickerOpen && !event.target.closest(".eval-multi-field")) {
      schemePickerOpen = false;
      renderEvaluationPage();
    }
  });
  root.querySelectorAll("[data-scene-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      activeSceneId = button.dataset.sceneId;
      activeDatasetId = "";
      selectedSchemeIds = [];
      activeEvalTaskId = "";
      evaluationDetail = null;
      schemePickerOpen = false;
      await loadSceneEvaluationData();
    });
  });
  root.querySelector("#evalDatasetSelect")?.addEventListener("change", async (event) => {
    activeDatasetId = event.target.value;
    activeEvalTaskId = "";
    evaluationDetail = null;
    await loadEvaluationTasksAndDetail();
  });
  root.querySelector("#schemePickerToggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    schemePickerOpen = !schemePickerOpen;
    renderEvaluationPage();
  });
  root.querySelectorAll("[data-scheme-option]").forEach((input) => {
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      const schemeId = input.dataset.schemeOption;
      selectedSchemeIds = input.checked
        ? [...new Set([...selectedSchemeIds, schemeId])].slice(0, 4)
        : selectedSchemeIds.filter((item) => item !== schemeId);
      schemePickerOpen = true;
      renderEvaluationPage();
    });
  });
  root.querySelector("#startEvalTask")?.addEventListener("click", startEvaluationTask);
  root.querySelector("#evalTaskSelect")?.addEventListener("change", async (event) => {
    activeEvalTaskId = event.target.value;
    await loadEvaluationDetail();
  });
  root.querySelector("#addCompareItem")?.addEventListener("click", async () => {
    await openAddDialog();
  });
  root.querySelectorAll("[data-remove-compare]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeEvaluationItem(button.dataset.removeCompare);
    });
  });
  root.querySelectorAll("[data-add-history]").forEach((button) => {
    button.addEventListener("click", async () => {
      await addEvaluationItem(button.dataset.addHistory);
    });
  });
  root.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      addDialogOpen = false;
      renderEvaluationPage();
    });
  });
}

async function loadEvaluationBootstrap() {
  loading = true;
  renderEvaluationPage();
  try {
    [scenes, allDatasets, allSchemes] = await Promise.all([
      state.scenes.length ? Promise.resolve(state.scenes) : api("/api/scenes"),
      api("/api/datasets"),
      api("/api/schemes"),
    ]);
    activeSceneId = activeSceneId || state.activeSceneId || scenes[0]?.id || "";
    await loadSceneEvaluationData(false);
    loaded = true;
  } catch (error) {
    toast(error.message);
  } finally {
    loading = false;
    renderEvaluationPage();
  }
}

async function loadSceneEvaluationData(shouldRender = true) {
  if (!activeSceneId) return;
  const sceneParam = `?scene_id=${encodeURIComponent(activeSceneId)}`;
  try {
    [datasets, schemes] = await Promise.all([
      api(`/api/datasets${sceneParam}`),
      api(`/api/schemes${sceneParam}`),
    ]);
    allDatasets = mergeById(allDatasets, datasets);
    allSchemes = mergeById(allSchemes, schemes);
    if (!datasets.some((item) => item.id === activeDatasetId)) {
      activeDatasetId = datasets[0]?.id || "";
    }
    selectedSchemeIds = selectedSchemeIds.filter((id) => schemes.some((scheme) => scheme.id === id));
    if (!selectedSchemeIds.length) {
      selectedSchemeIds = schemes.slice(0, 2).map((scheme) => scheme.id);
    }
    await loadEvaluationTasksAndDetail(false);
  } catch (error) {
    toast(error.message);
  } finally {
    if (shouldRender) renderEvaluationPage();
  }
}

async function loadEvaluationTasksAndDetail(shouldRender = true) {
  if (!activeSceneId || !activeDatasetId) {
    evaluationTasks = [];
    evaluationDetail = null;
    if (shouldRender) renderEvaluationPage();
    return;
  }
  const params = new URLSearchParams({ scene_id: activeSceneId, dataset_id: activeDatasetId });
  evaluationTasks = await api(`/api/evaluation-tasks?${params.toString()}`);
  if (!evaluationTasks.some((task) => task.id === activeEvalTaskId)) {
    activeEvalTaskId = evaluationTasks[0]?.id || "";
  }
  await loadEvaluationDetail(false);
  if (shouldRender) renderEvaluationPage();
}

async function loadEvaluationDetail(shouldRender = true) {
  if (!activeEvalTaskId) {
    evaluationDetail = null;
    if (shouldRender) renderEvaluationPage();
    return;
  }
  evaluationDetail = await api(`/api/evaluation-tasks/${encodeURIComponent(activeEvalTaskId)}`);
  if (shouldRender) renderEvaluationPage();
}

function scheduleEvaluationRefresh() {
  window.clearTimeout(refreshTimer);
  if (!evaluationDetail) return;
  const active = evaluationDetail.status === "queued"
    || evaluationDetail.status === "running"
    || (evaluationDetail.items || []).some((item) => item.status === "queued" || item.status === "running");
  if (!active) return;
  refreshTimer = window.setTimeout(async () => {
    try {
      await loadEvaluationDetail();
    } catch {
      window.clearTimeout(refreshTimer);
    }
  }, 2000);
}

async function startEvaluationTask() {
  if (!activeSceneId || !activeDatasetId || !selectedSchemeIds.length) {
    toast("请先选择场景、数据集和标注方案");
    return;
  }
  try {
    const blockers = await getActiveAnnotationTasks(activeDatasetId);
    if (blockers.length) {
      toast(`当前数据集还有 ${blockers.length} 个未完成标注任务，完成或停止后再启动评估`);
      return;
    }
    const dataset = getDataset();
    const ok = await confirmAction({
      title: "启动评估任务",
      message: "系统将基于当前数据集，对选中的方案发起全量标注，并生成评估对比视图。",
      details: [
        `数据集：${dataset?.name || activeDatasetId}`,
        `标注方案：${selectedSchemeIds.map((id) => schemeName(id)).join(" / ")}`,
        "前置条件：当前数据集没有排队中或标注中的标注任务",
      ],
      confirmText: "启动评估",
      variant: "primary",
    });
    if (!ok) return;
    const result = await api("/api/evaluation-tasks", {
      method: "POST",
      body: JSON.stringify({
        scene_id: activeSceneId,
        dataset_id: activeDatasetId,
        scheme_ids: selectedSchemeIds,
      }),
    });
    activeEvalTaskId = result.id;
    evaluationDetail = result;
    schemePickerOpen = false;
    await loadEvaluationTasksAndDetail(false);
    toast("评估任务已启动");
  } catch (error) {
    toast(error.message);
  } finally {
    renderEvaluationPage();
  }
}

async function getActiveAnnotationTasks(datasetId) {
  const tasks = await api(`/api/annotation-tasks?dataset_id=${encodeURIComponent(datasetId)}`);
  return tasks.filter((task) => task.status === "queued" || task.status === "running");
}

async function openAddDialog() {
  if (!activeEvalTaskId) return;
  try {
    candidates = await api(`/api/evaluation-tasks/${encodeURIComponent(activeEvalTaskId)}/candidates`);
    addDialogOpen = true;
    renderEvaluationPage();
  } catch (error) {
    toast(error.message);
  }
}

async function addEvaluationItem(annotationTaskId) {
  try {
    evaluationDetail = await api(`/api/evaluation-tasks/${encodeURIComponent(activeEvalTaskId)}/items`, {
      method: "POST",
      body: JSON.stringify({ annotation_task_id: annotationTaskId }),
    });
    addDialogOpen = false;
    await loadEvaluationTasksAndDetail(false);
    toast("已添加对比项");
  } catch (error) {
    toast(error.message);
  } finally {
    renderEvaluationPage();
  }
}

async function removeEvaluationItem(itemId) {
  try {
    evaluationDetail = await api(`/api/evaluation-tasks/${encodeURIComponent(activeEvalTaskId)}/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    await loadEvaluationTasksAndDetail(false);
    toast("已删除对比项");
  } catch (error) {
    toast(error.message);
  } finally {
    renderEvaluationPage();
  }
}

function getScene() {
  return scenes.find((scene) => scene.id === activeSceneId) || scenes[0];
}

function getDataset() {
  return datasets.find((item) => item.id === activeDatasetId) || datasets[0];
}

function schemeName(schemeId) {
  return schemes.find((scheme) => scheme.id === schemeId)?.name || schemeId;
}

function renderScenePill(scene) {
  const active = scene.id === activeSceneId;
  const datasetCount = allDatasets.filter((dataset) => dataset.scene_id === scene.id).length;
  const schemeCount = allSchemes.filter((scheme) => scheme.scene_id === scene.id).length;
  const meta = `${datasetCount} 数据集 / ${schemeCount} 方案`;
  return `
    <button class="eval-scene-pill ${active ? "active" : ""}" type="button" data-scene-id="${escapeHtml(scene.id)}">
      <strong>${escapeHtml(scene.name)}</strong>
      <span>${escapeHtml(scene.description || "场景")}</span>
      <em>${escapeHtml(meta)}</em>
    </button>
  `;
}

function mergeById(existing, incoming) {
  const map = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function renderSchemeOption(scheme) {
  return `
    <label>
      <input type="checkbox" data-scheme-option="${escapeHtml(scheme.id)}" ${selectedSchemeIds.includes(scheme.id) ? "checked" : ""}>
      <span>${escapeHtml(scheme.name)}</span>
    </label>
  `;
}

function renderCompareSurface(items) {
  if (!items.length) return renderEmptyCompare();
  return renderCompareMatrix(items);
}

function renderCompareCard(item) {
  const metrics = item.metrics || {};
  const done = Number(metrics.done || 0);
  return `
    <article class="eval-compare-card">
      <button class="eval-remove-button" type="button" data-remove-compare="${escapeHtml(item.id)}">删除</button>
      <div class="eval-result-head">
        <span>${escapeHtml(formatDate(item.annotation_created_at || item.created_at))}</span>
        <strong>${escapeHtml(item.scheme_name)}</strong>
        <p>${escapeHtml(statusLabel(item.status))}</p>
      </div>
      <div class="eval-result-score">
        <span>准确率</span>
        <strong>${formatRate(metrics.algorithm_accuracy)}</strong>
        <em>已标注 ${formatNumber(done)} / 平均耗时 ${formatSeconds(metrics.avg_duration_seconds)}</em>
      </div>
      <div class="eval-result-groups">
        ${renderMetricGroup("数据量", [
          ["总数", metrics.total, "neutral"],
          ["未标注", metrics.unannotated, "muted"],
          ["已标注", done, "success"],
          ["排队中", metrics.queued, "warning"],
          ["标注中", metrics.running, "info"],
        ])}
        ${renderMetricGroup("混淆矩阵", [
          ["TP", metrics.tp, "success"],
          ["TN", metrics.tn, "success"],
          ["FP", metrics.fp, "danger"],
          ["FN", metrics.fn, "danger"],
        ])}
        ${renderMetricGroup("评估率", [
          ["算法准确率", formatRate(metrics.algorithm_accuracy), "primary"],
          ["业务准确率", formatRate(metrics.business_accuracy), "accent"],
          ["正确查全率", formatRate(metrics.correct_recall), "info"],
          ["错误查全率", formatRate(metrics.error_recall), "warning"],
          ["F1", formatRate(metrics.f1), "primary"],
        ])}
      </div>
    </article>
  `;
}

function renderCompareMatrix(items) {
  return `
    <div class="eval-compare-matrix" style="--compare-count:${items.length}">
      <div class="eval-matrix-head">
        <div class="eval-matrix-corner">
          <strong>${items.length} 组方案</strong>
          <span>按指标横向扫描</span>
        </div>
        ${items.map(renderMatrixTaskHead).join("")}
      </div>
      <div class="eval-matrix-body">
        ${matrixGroups().map((group) => renderMatrixGroup(group, items)).join("")}
      </div>
    </div>
  `;
}

function renderMatrixTaskHead(item, index) {
  const metrics = item.metrics || {};
  const done = Number(metrics.done || 0);
  const status = statusLabel(item.status);
  return `
    <div class="eval-matrix-task">
      <button class="eval-remove-button matrix" type="button" data-remove-compare="${escapeHtml(item.id)}">删除</button>
      <strong title="${escapeHtml(item.scheme_name)}">${escapeHtml(item.scheme_name)}</strong>
      <div class="eval-matrix-task-meta">
        <span class="eval-status-pill ${escapeHtml(statusTone(item.status))}">${escapeHtml(status)}</span>
        ${index === 0 ? `<span class="eval-baseline-pill">基准</span>` : ""}
        <em>${escapeHtml(formatDate(item.annotation_created_at || item.created_at))}</em>
      </div>
      <p>已标注 ${formatNumber(done)} / 准确率 ${formatRate(metrics.algorithm_accuracy)}</p>
    </div>
  `;
}

function renderMatrixGroup(group, items) {
  return `
    <section class="eval-matrix-group">
      ${group.rows.map((row, index) => renderMatrixRow(row, items, group.title, index)).join("")}
    </section>
  `;
}

function renderMatrixRow(row, items, groupTitle, rowIndex) {
  const stats = matrixRowStats(row, items);
  return `
    <div class="eval-matrix-row">
      <div class="eval-matrix-label">
        ${rowIndex === 0 ? `<em>${escapeHtml(groupTitle)}</em>` : ""}
        <strong>${escapeHtml(row.label)}</strong>
        <span>${escapeHtml(row.hint || "")}</span>
      </div>
      ${items.map((item, index) => renderMatrixValue(row, item, index, stats)).join("")}
    </div>
  `;
}

function renderMatrixValue(row, item, index, stats) {
  const metrics = item.metrics || {};
  const rawValue = row.value(metrics);
  const value = formatMatrixValue(row, rawValue);
  const empty = isEmptyMatrixValue(rawValue);
  const classes = [
    `metric-tone-${row.tone || "neutral"}`,
    index === 0 ? "is-baseline" : "",
    empty ? "is-empty" : "",
    stats.bestIndex === index ? "is-best" : "",
    stats.worstIndex === index ? "is-worst" : "",
  ].filter(Boolean).join(" ");
  const delta = index === 0 ? "" : renderMatrixDelta(row, rawValue, stats.baseValue);
  return `
    <div class="eval-matrix-value ${escapeHtml(classes)}">
      <strong>${escapeHtml(value)}</strong>
      ${index === 0 ? "" : delta}
    </div>
  `;
}

function renderMatrixDelta(row, rawValue, baseValue) {
  const value = toComparableNumber(rawValue);
  const base = toComparableNumber(baseValue);
  if (value == null || base == null) return "";
  const delta = value - base;
  if (Math.abs(delta) < 0.000001) return `<small class="delta flat">持平</small>`;
  const good = row.direction === "lower" ? delta < 0 : delta > 0;
  const sign = delta > 0 ? "+" : "";
  const arrow = delta > 0 ? "▲" : "▼";
  const text = row.type === "rate" ? `${arrow} ${sign}${(delta * 100).toFixed(1)}%` : `${arrow} ${sign}${formatNumberDelta(delta)}`;
  return `<small class="delta ${good ? "good" : "bad"}">${escapeHtml(text)}</small>`;
}

function matrixRowStats(row, items) {
  const values = items.map((item) => row.value(item.metrics || {}));
  const numbers = values.map(toComparableNumber);
  const valid = numbers
    .map((value, index) => ({ value, index }))
    .filter((item) => item.value != null);
  if (valid.length < 2) {
    return { baseValue: values[0], bestIndex: -1, worstIndex: -1 };
  }
  const compare = row.direction === "lower"
    ? (a, b) => a.value - b.value
    : (a, b) => b.value - a.value;
  const sorted = [...valid].sort(compare);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const hasUniqueBest = valid.filter((item) => item.value === best.value).length === 1;
  const hasUniqueWorst = valid.filter((item) => item.value === worst.value).length === 1 && best.value !== worst.value;
  return {
    baseValue: values[0],
    bestIndex: hasUniqueBest ? best.index : -1,
    worstIndex: hasUniqueWorst ? worst.index : -1,
  };
}

function formatMatrixValue(row, value) {
  if (row.type === "rate") return formatRate(value);
  if (row.type === "seconds") return formatSeconds(value);
  return formatMetricValue(value);
}

function isEmptyMatrixValue(value) {
  const number = toComparableNumber(value);
  return value == null || value === "" || number === 0;
}

function toComparableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumberDelta(value) {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function matrixGroups() {
  return [
    {
      title: "数据量",
      rows: [
        { label: "总数", value: (metrics) => metrics.total, tone: "neutral", direction: "higher" },
        { label: "已标注", value: (metrics) => metrics.done, tone: "success", direction: "higher" },
        { label: "未标注", value: (metrics) => metrics.unannotated, tone: "muted", direction: "lower" },
        { label: "排队中", value: (metrics) => metrics.queued, tone: "warning", direction: "lower" },
        { label: "标注中", value: (metrics) => metrics.running, tone: "info", direction: "lower" },
      ],
    },
    {
      title: "混淆矩阵",
      rows: [
        { label: "TP", hint: "正确识别为正例", value: (metrics) => metrics.tp, tone: "success", direction: "higher" },
        { label: "TN", hint: "正确识别为负例", value: (metrics) => metrics.tn, tone: "success", direction: "higher" },
        { label: "FP", hint: "误判为正例", value: (metrics) => metrics.fp, tone: "danger", direction: "lower" },
        { label: "FN", hint: "漏判正例", value: (metrics) => metrics.fn, tone: "danger", direction: "lower" },
      ],
    },
    {
      title: "评估率",
      rows: [
        { label: "算法准确率", value: (metrics) => metrics.algorithm_accuracy, tone: "primary", direction: "higher", type: "rate" },
        { label: "业务准确率", value: (metrics) => metrics.business_accuracy, tone: "accent", direction: "higher", type: "rate" },
        { label: "正确查全率", value: (metrics) => metrics.correct_recall, tone: "info", direction: "higher", type: "rate" },
        { label: "错误查全率", value: (metrics) => metrics.error_recall, tone: "warning", direction: "lower", type: "rate" },
        { label: "F1", value: (metrics) => metrics.f1, tone: "primary", direction: "higher", type: "rate" },
      ],
    },
    {
      title: "耗时",
      rows: [
        { label: "平均耗时", value: (metrics) => metrics.avg_duration_seconds, tone: "neutral", direction: "lower", type: "seconds" },
        { label: "总耗时", value: (metrics) => estimatedTotalDuration(metrics), tone: "neutral", direction: "lower", type: "seconds" },
      ],
    },
  ];
}

function estimatedTotalDuration(metrics) {
  if (metrics.total_duration_seconds != null) return metrics.total_duration_seconds;
  if (metrics.avg_duration_seconds == null) return null;
  return Number(metrics.avg_duration_seconds) * Number(metrics.done || 0);
}

function renderMetricGroup(title, items) {
  return `
    <section class="eval-metric-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="eval-metric-row">
        ${items.map(([label, value, tone]) => renderMetricCell(label, value, tone)).join("")}
      </div>
    </section>
  `;
}

function renderMetricCell(label, value, tone = "neutral") {
  return `
    <span class="eval-metric-item metric-tone-${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatMetricValue(value))}</strong>
    </span>
  `;
}

function formatMetricValue(value) {
  if (value == null || value === "") return "-";
  return typeof value === "number" ? value.toLocaleString() : value;
}

function renderEmptyCompare() {
  return `
    <article class="eval-empty-compare">
      <strong>请选择评估任务</strong>
      <span>启动一个新评估，或从右上方选择已有评估任务。</span>
    </article>
  `;
}

function renderAddDialog() {
  const disabled = (evaluationDetail?.items || []).length >= 4;
  return `
    <div class="modal-backdrop open eval-add-backdrop">
      <section class="modal eval-add-dialog" role="dialog" aria-modal="true">
        <header class="modal-head">
          <div class="modal-title-block">
            <h2>添加对比项</h2>
            <p class="card-meta">最多并列展示 4 个任务，候选项来自当前场景和当前数据集。</p>
          </div>
          <button class="icon-btn" type="button" data-close-dialog aria-label="关闭">×</button>
        </header>
        <div class="eval-add-list">
          ${candidates.map((task) => `
            <article>
              <div>
                <strong>${escapeHtml(task.scheme_name)}</strong>
                <span>${escapeHtml(formatDate(task.created_at))} / 准确率 ${formatRate(task.metrics?.algorithm_accuracy)}</span>
              </div>
              <button class="btn primary" type="button" data-add-history="${escapeHtml(task.annotation_task_id)}" ${disabled ? "disabled" : ""}>添加</button>
            </article>
          `).join("") || `<p class="eval-empty-note">当前数据集下暂无更多可添加历史。</p>`}
        </div>
        <footer class="modal-actions">
          <button class="btn" type="button" data-close-dialog>关闭</button>
        </footer>
      </section>
    </div>
  `;
}

function statusLabel(status) {
  const labels = {
    queued: "排队中",
    running: "标注中",
    done: "已完成",
    failed: "失败",
    stopped: "已停止",
    interrupted: "已中断",
  };
  return labels[status] || status || "-";
}

function statusTone(status) {
  if (status === "done") return "done";
  if (status === "stopped" || status === "interrupted") return "stopped";
  if (status === "failed") return "failed";
  if (status === "running" || status === "queued") return "running";
  return "neutral";
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatRate(value) {
  return value == null ? "-" : `${(Number(value) * 100).toFixed(1)}%`;
}

function formatSeconds(value) {
  return value == null ? "-" : `${Number(value).toFixed(2)}s`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
