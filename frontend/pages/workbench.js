import { api, loadSceneResources, state, toast } from "/assets/app.js";

let table = null;
let searchTimer = 0;
let pendingSource = { sceneId: "", datasetId: "", schemeId: "" };
let pendingResources = { datasets: [], schemes: [] };
let documentMenusBound = false;
let currentTask = null;
let taskEvents = null;
let metricsTimer = 0;
let currentDetailRow = null;
let currentDetailMode = "view";
let currentDetailKind = "row";
let currentCellRawValue = null;
let currentCellContent = "";
let detailEditDirty = false;
let drawerRow = null;
let drawerMode = "view";
let drawerEditDirty = false;
let drawerSelectedColumns = new Set();
let drawerAnalysisRequest = 0;
let drawerAnnotationHistoryRequest = 0;
let drawerResizeCleanup = null;
let statusFilters = new Set();
let availableDatasetColumns = [];
let latestFieldMapping = null;

const defaultColumns = [
  "ID",
  "工单名称",
  "工单类型",
  "工单耗时",
  "COT名称",
  "API Order",
  "API Part 1",
  "API Part 2",
  "API Part 3",
  "API Part 4",
  "API Part 5",
  "API Part 6",
  "API Part 7",
  "Summary",
  "标注数据",
  "情感分类",
  "GPT4_标注",
  "Claude_结果",
];

export function renderWorkbenchPage() {
  document.querySelector("#page-workbench").innerHTML = `
    <div class="workbench-layout workbench-pro">
      <div class="workbench-head">
        <div class="workbench-titleline">
          <h2 id="workbenchTitle">标注工作台</h2>
          <button class="btn quiet-button" type="button" id="sourceSwitchButton">切换数据源与方案</button>
        </div>
      </div>

      <div class="metric-strip" aria-label="数据指标">
        <section class="metric-group metric-group-volume" aria-label="数据量">
          <div><span>总数</span><strong id="metricTotal">0</strong></div>
          <div><span>未标注</span><strong id="metricUnannotated">0</strong></div>
          <div><span>已标注</span><strong id="metricDone">0</strong></div>
          <div><span>排队中</span><strong id="metricQueued">0</strong></div>
          <div><span>标注中</span><strong id="metricRunning">0</strong></div>
        </section>
        <section class="metric-group metric-group-confusion" aria-label="混淆矩阵">
          <div><span>TP</span><strong id="metricTp">0</strong></div>
          <div><span>TN</span><strong id="metricTn">0</strong></div>
          <div><span>FP</span><strong id="metricFp">0</strong></div>
          <div><span>FN</span><strong id="metricFn">0</strong></div>
        </section>
        <section class="metric-group metric-group-rate" aria-label="评估率">
          <div><span>算法准确率</span><strong id="metricAccuracy">--</strong></div>
          <div><span>正确查全率</span><strong id="metricRecall">--</strong></div>
          <div><span>正确查准率</span><strong id="metricPrecision">--</strong></div>
          <div><span>错误查准率</span><strong id="metricSpecificity">--</strong></div>
          <div><span>F1 score</span><strong id="metricF1">--</strong></div>
          <div><span>业务准确率</span><strong id="metricFpr">--</strong></div>
        </section>
      </div>

      <div class="toolbar workbench-toolbar">
        <div class="toolbar-left">
          <label class="checkline">
            <input type="checkbox" id="selectCurrentPage">
            全选当前页
          </label>
          <button class="btn" type="button" id="batchAnnotateButton" disabled>批量标注</button>
          <button class="btn primary" type="button" id="fullAnnotateButton">全量标注</button>
        </div>
        <div class="toolbar-right">
          <button class="btn refresh-table-button" type="button" id="refreshTableButton">刷新列表</button>
          <label class="column-search">
            <input type="search" id="tableSearch" placeholder="搜索当前数据集内容" aria-label="搜索当前数据集内容">
          </label>
          <div class="dropdown-wrap">
            <button class="btn" type="button" id="filterButton" aria-expanded="false">筛选</button>
            <div class="dropdown-menu status-filter-menu" id="statusFilterMenu" hidden>
              ${["未标注", "排队中", "标注中", "TP", "TN", "FP", "FN", "失败", "取消"].map((status) => `
                <label><input type="checkbox" value="${status}"><span>${status}</span></label>
              `).join("")}
              <div class="filter-actions">
                <button type="button" data-filter-action="apply">应用</button>
                <button type="button" data-filter-action="clear">清空</button>
              </div>
            </div>
          </div>
          <div class="dropdown-wrap">
            <button class="btn" type="button" id="globalMoreButton" aria-expanded="false">更多</button>
            <div class="dropdown-menu" id="globalMoreMenu" hidden>
              <button type="button" data-global-action="export">导出</button>
              <button type="button" data-global-action="columns">列设置</button>
              <button type="button" data-global-action="delete">删除数据</button>
              <button type="button" data-global-action="stop">停止未完成标注</button>
            </div>
          </div>
        </div>
      </div>

      <div class="table-shell"><div id="workbenchTable"></div></div>
      <div class="task-strip">
        <div class="task-title">
          <span class="scheme-badge">TASK</span>
          <strong id="taskTitle">任务状态</strong>
          <span class="card-meta" id="taskMeta">暂无运行中的标注任务。</span>
        </div>
        <div class="task-progress-wrap">
          <div class="progress" aria-label="任务进度"><span id="taskProgress" style="--value:0%"></span></div>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="sourceModalBackdrop">
      <section class="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="sourceModalTitle">
        <header class="modal-head">
          <div>
            <p class="eyebrow">数据上下文</p>
            <h2 id="sourceModalTitle">切换数据源与方案</h2>
          </div>
          <button class="icon-btn" type="button" id="sourceModalClose" aria-label="关闭切换弹窗">×</button>
        </header>
        <div class="source-form">
          <label>
            <span>先选择场景</span>
            <select class="select" id="sourceSceneSelect" aria-label="切换场景"></select>
          </label>
          <label>
            <span>再选择数据源</span>
            <select class="select" id="sourceDatasetSelect" aria-label="切换数据源"></select>
          </label>
          <label>
            <span>选择标注方案</span>
            <select class="select" id="sourceSchemeSelect" aria-label="切换标注方案"></select>
          </label>
        </div>
        <div class="source-preview" id="sourcePreview"></div>
        <footer class="modal-actions">
          <button class="btn" type="button" id="sourceModalCancel">取消</button>
          <button class="btn primary" type="button" id="sourceApplyButton">应用并刷新表格</button>
        </footer>
      </section>
    </div>

    <div class="modal-backdrop" id="rowDetailModal">
      <div class="modal row-detail-modal cell-detail-modal">
        <div class="modal-head">
          <div>
            <h2 id="rowDetailTitle">单元格内容</h2>
            <p class="card-meta" id="rowDetailMeta">JSON 内容会自动格式化。</p>
          </div>
          <div class="cell-detail-head-actions">
            <button class="btn" type="button" id="cellFormatButton">格式化 JSON</button>
            <button class="btn primary" type="button" id="cellCopyButton">复制内容</button>
            <button class="icon-btn" id="closeRowDetail">×</button>
          </div>
        </div>
        <div class="modal-body cell-detail-body">
          <pre class="json-view cell-detail-view" id="rowDetailJson">{}</pre>
        </div>
      </div>
    </div>

    <div class="detail-drawer-layer" id="rowDetailDrawer" aria-hidden="true">
      <button class="detail-drawer-scrim" type="button" id="rowDetailDrawerScrim" aria-label="关闭行详情"></button>
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
        <div class="detail-drawer-resizer" id="drawerResizer" role="separator" aria-label="拖动调整详情宽度"></div>
        <header class="detail-drawer-head">
          <div>
            <span class="scheme-badge">ROW</span>
            <h2 id="drawerTitle">行详情</h2>
            <p class="card-meta" id="drawerMeta">查看当前行完整数据。</p>
          </div>
          <button class="icon-btn" type="button" id="drawerClose" aria-label="关闭行详情">×</button>
        </header>
        <div class="detail-drawer-toolbar">
          <div class="drawer-tabs" aria-label="行详情模式">
            <button type="button" data-drawer-mode="view">查看</button>
            <button type="button" data-drawer-mode="result">标注结果</button>
            <button type="button" data-drawer-mode="edit">编辑</button>
            <button type="button" data-drawer-mode="analysis">分析</button>
          </div>
          <div class="drawer-actions" id="drawerEditActions" hidden>
            <button class="btn" type="button" id="drawerExitEdit" hidden>退出编辑</button>
            <button class="btn primary" type="button" id="drawerSave" hidden>保存</button>
          </div>
          <div class="drawer-actions" id="drawerAnalysisActions" hidden>
            <button class="btn primary" type="button" id="drawerReanalyze" hidden>重新分析</button>
          </div>
        </div>
        <div class="detail-drawer-body">
          <section class="drawer-pane" id="drawerViewPane">
            <div class="drawer-section-title">
              <strong>原始数据</strong>
              <span>长文本自动换行展示</span>
            </div>
            <div class="drawer-kv" id="drawerViewKv"></div>
          </section>
          <section class="drawer-pane drawer-edit-pane" id="drawerEditPane" hidden>
            <div class="drawer-section-title">
              <strong>编辑 JSON</strong>
              <span id="drawerEditStatus">修改后点击保存</span>
            </div>
            <textarea class="drawer-json-editor" id="drawerEditor" spellcheck="false"></textarea>
          </section>
          <section class="drawer-pane drawer-result-pane" id="drawerResultPane" hidden>
            <div class="drawer-result-layout">
              <section class="drawer-result-card">
                <div class="drawer-section-title">
                  <strong>标注结果</strong>
                  <span id="drawerResultStatus">最新模型返回</span>
                </div>
                <pre class="drawer-json-view" id="drawerResultJson">{}</pre>
              </section>
              <section class="drawer-result-card">
                <div class="drawer-section-title">
                  <strong>渲染 Prompt</strong>
                  <span>本次标注使用的完整 Prompt</span>
                </div>
                <pre class="drawer-prompt-view" id="drawerPromptText">暂无 Prompt</pre>
              </section>
              <section class="drawer-result-card drawer-history-card">
                <div class="drawer-section-title">
                  <strong>历史标注</strong>
                  <span id="drawerHistoryStatus">按时间倒序</span>
                </div>
                <div class="drawer-history-list" id="drawerHistoryList">
                  <div class="empty">切换到标注结果后加载历史。</div>
                </div>
              </section>
            </div>
          </section>
          <section class="drawer-pane drawer-analysis-pane" id="drawerAnalysisPane" hidden>
            <div class="drawer-analysis-layout">
              <section class="drawer-analysis-card">
                <div class="drawer-section-title">
                  <strong>原始数据</strong>
                  <div class="drawer-field-filter">
                    <button class="btn" type="button" id="drawerFieldFilterButton">显示字段</button>
                    <div class="drawer-field-popover" id="drawerFieldPopover" hidden>
                      <div class="drawer-field-actions">
                        <button type="button" data-drawer-field-action="all">全选</button>
                        <button type="button" data-drawer-field-action="visible">默认列</button>
                        <button type="button" data-drawer-field-action="clear">清空</button>
                      </div>
                      <div class="drawer-field-grid" id="drawerFieldGrid"></div>
                    </div>
                  </div>
                </div>
                <div class="drawer-kv" id="drawerAnalysisRaw"></div>
              </section>
              <section class="drawer-analysis-card">
                <div class="drawer-section-title">
                  <strong>最新分析结果</strong>
                  <span id="drawerAnalysisStatus">未分析</span>
                </div>
                <pre class="drawer-json-view" id="drawerAnalysisJson">{}</pre>
              </section>
            </div>
          </section>
        </div>
      </aside>
    </div>

    <div class="modal-backdrop" id="columnSettingsModal">
      <div class="modal modal-wide">
        <div class="modal-head">
          <div>
            <h2>列设置</h2>
            <p class="card-meta">配置当前场景默认渲染在工作台列表中的列。</p>
          </div>
          <button class="icon-btn" id="closeColumnSettings">×</button>
        </div>
        <div class="modal-body">
          <div class="mapping-title">
            <div>
              <strong>默认渲染列</strong>
              <span>保存后会同步到字段映射配置。</span>
            </div>
            <div class="mapping-actions">
              <button type="button" id="selectAllColumns">全选</button>
              <button type="button" id="clearAllColumns">全不选</button>
            </div>
          </div>
          <div class="column-chip-grid compact" id="columnSettingsGrid"></div>
          <div class="modal-actions">
            <button class="btn" type="button" id="cancelColumnSettings">取消</button>
            <button class="btn primary" type="button" id="saveColumnSettings">保存列设置</button>
          </div>
        </div>
      </div>
    </div>

  `;
  bindWorkbenchEvents();
  refreshWorkbench();
}

function bindWorkbenchEvents() {
  document.querySelector("#sourceSwitchButton").addEventListener("click", openSourceModal);
  document.querySelector("#sourceModalClose").addEventListener("click", closeSourceModal);
  document.querySelector("#sourceModalCancel").addEventListener("click", closeSourceModal);
  document.querySelector("#sourceApplyButton").addEventListener("click", applySourceModal);
  document.querySelector("#sourceSceneSelect").addEventListener("change", async (event) => {
    pendingSource.sceneId = event.target.value;
    await loadPendingResources(pendingSource.sceneId);
    pendingSource.datasetId = pendingResources.datasets[0]?.id || "";
    pendingSource.schemeId = pendingResources.schemes[0]?.id || "";
    fillSourceModalOptions();
  });
  document.querySelector("#sourceDatasetSelect").addEventListener("change", (event) => {
    pendingSource.datasetId = event.target.value;
    updateSourcePreview();
  });
  document.querySelector("#sourceSchemeSelect").addEventListener("change", (event) => {
    pendingSource.schemeId = event.target.value;
    updateSourcePreview();
  });
  document.querySelector("#tableSearch").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => refreshWorkbench(), 260);
  });
  document.querySelector("#refreshTableButton").addEventListener("click", refreshTableData);
  document.querySelector("#selectCurrentPage").addEventListener("change", (event) => {
    selectVisibleRows(event.target.checked);
  });
  document.querySelector("#batchAnnotateButton").addEventListener("click", () => {
    startAnnotationTask("selected");
  });
  document.querySelector("#fullAnnotateButton").addEventListener("click", () => {
    startAnnotationTask("all");
  });
  document.querySelector("#globalMoreButton").addEventListener("click", (event) => {
    toggleGlobalMenu(event.currentTarget);
  });
  document.querySelector("#filterButton").addEventListener("click", (event) => {
    toggleStatusFilterMenu(event.currentTarget);
  });
  document.querySelector("#statusFilterMenu").addEventListener("click", async (event) => {
    const action = event.target.closest("[data-filter-action]")?.dataset.filterAction;
    if (!action) return;
    if (action === "clear") {
      statusFilters = new Set();
      syncStatusFilterMenu();
    } else {
      const checked = [...document.querySelectorAll("#statusFilterMenu input:checked")].map((input) => input.value);
      statusFilters = new Set(checked);
    }
    closeMenus();
    await refreshWorkbench();
  });
  document.querySelector("#globalMoreMenu").addEventListener("click", (event) => {
    const action = event.target.closest("[data-global-action]")?.dataset.globalAction;
    if (!action) return;
    if (action === "stop") {
      stopCurrentTask();
    } else if (action === "delete") {
      deleteSelectedRows();
    } else if (action === "export") {
      exportDataset();
    } else if (action === "columns") {
      openColumnSettings();
    } else {
      toast(`已预留${event.target.textContent}操作`);
    }
    closeMenus();
  });
  document.querySelector("#closeRowDetail").addEventListener("click", closeRowDetail);
  document.querySelector("#cellFormatButton").addEventListener("click", formatCellJsonContent);
  document.querySelector("#cellCopyButton").addEventListener("click", copyCellDetailContent);
  document.querySelector("#rowDetailModal").addEventListener("click", (event) => {
    if (event.target.id === "rowDetailModal") closeRowDetail();
  });
  document.querySelector("#detailEditButton")?.addEventListener("click", () => setDetailMode("edit"));
  document.querySelector("#detailSaveButton")?.addEventListener("click", saveDetailEdit);
  document.querySelector("#detailAnalyzeButton")?.addEventListener("click", analyzeCurrentDetailRow);
  document.querySelector("#detailExportButton")?.addEventListener("click", exportCurrentDetailRow);
  document.querySelector("#detailDeleteButton")?.addEventListener("click", () => {
    if (currentDetailRow?.row_id) deleteRow(currentDetailRow.row_id);
  });
  document.querySelector("#rowDetailEditor")?.addEventListener("input", markDetailEditable);
  document.querySelector("#rowDetailEditor")?.addEventListener("select", markDetailEditable);
  document.querySelector("#drawerClose").addEventListener("click", closeRowDrawer);
  document.querySelector("#rowDetailDrawerScrim").addEventListener("click", closeRowDrawer);
  document.querySelectorAll("[data-drawer-mode]").forEach((button) => {
    button.addEventListener("click", () => setDrawerMode(button.dataset.drawerMode));
  });
  document.querySelector("#drawerSave").addEventListener("click", saveDrawerEdit);
  document.querySelector("#drawerExitEdit").addEventListener("click", () => setDrawerMode("view"));
  document.querySelector("#drawerReanalyze").addEventListener("click", analyzeDrawerRow);
  document.querySelector("#drawerEditor").addEventListener("input", markDrawerDirty);
  document.querySelector("#drawerFieldFilterButton").addEventListener("click", toggleDrawerFieldPopover);
  document.querySelector("#drawerFieldPopover").addEventListener("click", handleDrawerFieldPopoverClick);
  document.querySelector("#rowDetailDrawer").addEventListener("click", handleDrawerKvToggle);
  document.querySelector("#drawerResizer").addEventListener("pointerdown", startDrawerResize);
  document.querySelector("#closeColumnSettings").addEventListener("click", closeColumnSettings);
  document.querySelector("#cancelColumnSettings").addEventListener("click", closeColumnSettings);
  document.querySelector("#columnSettingsModal").addEventListener("click", (event) => {
    if (event.target.id === "columnSettingsModal") closeColumnSettings();
  });
  document.querySelector("#selectAllColumns").addEventListener("click", () => setColumnSettingsChecked(true));
  document.querySelector("#clearAllColumns").addEventListener("click", () => setColumnSettingsChecked(false));
  document.querySelector("#saveColumnSettings").addEventListener("click", saveColumnSettings);
  if (!documentMenusBound) {
    document.addEventListener("pointerdown", stopRowActionPropagation, true);
    document.addEventListener("click", handleRowActionClick, true);
    document.addEventListener("click", handleMoreMenu);
    documentMenusBound = true;
  }
}

async function refreshTableData() {
  const button = document.querySelector("#refreshTableButton");
  if (!button) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "刷新中...";
  try {
    await refreshWorkbench();
    toast("列表已刷新");
  } catch (error) {
    toast(error.message);
  } finally {
    const nextButton = document.querySelector("#refreshTableButton");
    if (nextButton) {
      nextButton.disabled = false;
      nextButton.textContent = originalText || "刷新列表";
    }
  }
}

export async function refreshWorkbench() {
  const container = document.querySelector("#workbenchTable");
  if (!container) return;
  updateWorkbenchTitle();
  if (!state.activeDatasetId) {
    if (table) {
      table.destroy();
      table = null;
    }
    container.innerHTML = `<div class="empty" style="height:100%">请先在数据集与方案管理页创建场景并导入 Excel</div>`;
    document.querySelector("#metricTotal").textContent = "0";
    await refreshMetrics();
    setBatchButtonState();
    return;
  }
  await loadLatestTask();
  const response = await fetch(`/api/datasets/${state.activeDatasetId}/rows?${buildRowsQuery(1, 20)}`).then((res) => res.json());
  document.querySelector("#metricTotal").textContent = response.total.toLocaleString();
  availableDatasetColumns = response.columns.length ? response.columns : defaultColumns;
  const visibleColumns = await resolveVisibleColumns(availableDatasetColumns);
  const columns = buildColumns(visibleColumns, response.data || []);
  if (table) table.destroy();
  table = new Tabulator("#workbenchTable", {
    height: "100%",
    layout: "fitColumns",
    movableColumns: true,
    placeholder: "当前数据集没有数据",
    locale: "zh-cn",
    langs: {
      "zh-cn": {
        pagination: {
          page_size: "每页",
          first: "首页",
          first_title: "第一页",
          last: "末页",
          last_title: "最后一页",
          prev: "上一页",
          prev_title: "上一页",
          next: "下一页",
          next_title: "下一页",
          all: "全部",
          counter: {
            showing: "显示",
            of: "共",
            rows: "行",
            pages: "页",
          },
        },
      },
    },
    pagination: true,
    paginationMode: "remote",
    paginationSize: 20,
    paginationSizeSelector: [20, 50, 100, 200],
    selectableRows: true,
    index: "row_id",
    rowHeight: 42,
    columnDefaults: {
      hozAlign: "center",
      headerHozAlign: "center",
      vertAlign: "middle",
    },
    ajaxURL: `/api/datasets/${state.activeDatasetId}/rows`,
    ajaxURLGenerator(url, config, params) {
      return `${url}?${buildRowsQuery(params.page || 1, params.size || table?.getPageSize?.() || 20)}`;
    },
    ajaxResponse(url, params, payload) {
      document.querySelector("#metricTotal").textContent = payload.total.toLocaleString();
      refreshMetrics();
      setBatchButtonState();
      return payload;
    },
    rowSelectionChanged: setBatchButtonState,
    cellDblClick(event, cell) {
      openCellDetail(cell);
    },
    columns,
  });
  table.on?.("rowSelectionChanged", setBatchButtonState);
  table.on?.("cellDblClick", (event, cell) => openCellDetail(cell));
  document.querySelector("#workbenchTable").ondblclick = handleTableCellDoubleClick;
  await refreshMetrics();
  syncStatusFilterMenu();
  setBatchButtonState();
}

function buildColumns(columns, sampleRows = []) {
  return [
    {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      hozAlign: "center",
      headerSort: false,
      width: 48,
    },
    ...columns.map((column) => dataColumnDef(column, sampleRows)),
    {
      title: "",
      field: "__spacer",
      headerSort: false,
      resizable: false,
      minWidth: 0,
      widthGrow: 1,
      widthShrink: 1,
      formatter: () => "",
      cssClass: "table-spacer-cell",
    },
    {
      title: "状态",
      field: "状态",
      width: 82,
      minWidth: 82,
      maxWidth: 82,
      resizable: false,
      widthGrow: 0,
      widthShrink: 0,
      formatter: (cell) => {
        const value = cell.getValue() || "未标注";
        return formatStatusPill(value);
      },
    },
    {
      title: "操作",
      field: "row_id",
      width: 160,
      minWidth: 160,
      maxWidth: 160,
      resizable: false,
      widthGrow: 0,
      widthShrink: 0,
      headerSort: false,
      formatter: (cell) => {
        const rowData = cell.getData();
        const rowId = rowData.row_id || "";
        const annotateButton = annotationButtonMeta(rowData["状态"]);
        return `
          <div class="row-actions">
            <button class="action-mini ${annotateButton.className}" data-row-action="annotate" data-row-id="${rowId}">${annotateButton.label}</button>
            <button class="action-mini info" data-row-action="view" data-row-id="${rowId}">查看</button>
            <button class="action-mini more" data-row-more data-row-id="${rowId}" aria-expanded="false">更多</button>
          </div>
        `;
      },
    },
  ];
}

function buildRowsQuery(page, pageSize) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  params.set("search", document.querySelector("#tableSearch")?.value || "");
  statusFilters.forEach((status) => params.append("statuses", status));
  return params.toString();
}

async function resolveVisibleColumns(columns) {
  if (!state.activeSceneId) return columns;
  try {
    latestFieldMapping = await api(`/api/field-mapping?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    const visible = latestFieldMapping.visible_columns || [];
    if (!visible.length) return columns;
    const visibleSet = new Set(visible);
    const nextColumns = columns.filter((column) => visibleSet.has(column));
    return nextColumns.length ? nextColumns : columns;
  } catch {
    latestFieldMapping = null;
    return columns;
  }
}

function updateWorkbenchTitle() {
  const scene = state.scenes.find((item) => item.id === state.activeSceneId);
  const dataset = state.datasets.find((item) => item.id === state.activeDatasetId);
  const scheme = state.schemes.find((item) => item.id === state.activeSchemeId);
  document.querySelector("#workbenchTitle").textContent = [
    scene?.name || "未选择场景",
    dataset?.name || "未选择数据集",
    scheme?.name || "未选择方案",
  ].join(" · ");
}

async function openSourceModal() {
  pendingSource = {
    sceneId: state.activeSceneId || state.scenes[0]?.id || "",
    datasetId: state.activeDatasetId || "",
    schemeId: state.activeSchemeId || "",
  };
  await loadPendingResources(pendingSource.sceneId);
  if (!pendingSource.datasetId) pendingSource.datasetId = pendingResources.datasets[0]?.id || "";
  if (!pendingSource.schemeId) pendingSource.schemeId = pendingResources.schemes[0]?.id || "";
  fillSourceModalOptions();
  document.querySelector("#sourceModalBackdrop").classList.add("open");
}

function closeSourceModal() {
  document.querySelector("#sourceModalBackdrop").classList.remove("open");
}

async function loadPendingResources(sceneId) {
  if (!sceneId) {
    pendingResources = { datasets: [], schemes: [] };
    return;
  }
  const param = `?scene_id=${encodeURIComponent(sceneId)}`;
  const [datasets, schemes] = await Promise.all([
    api(`/api/datasets${param}`),
    api(`/api/schemes${param}`),
  ]);
  pendingResources = { datasets, schemes };
}

function fillSourceModalOptions() {
  const sceneSelect = document.querySelector("#sourceSceneSelect");
  const datasetSelect = document.querySelector("#sourceDatasetSelect");
  const schemeSelect = document.querySelector("#sourceSchemeSelect");
  sceneSelect.innerHTML = state.scenes.map((scene) => `<option value="${scene.id}">${scene.name}</option>`).join("") || `<option value="">暂无场景</option>`;
  datasetSelect.innerHTML = pendingResources.datasets.map((dataset) => `<option value="${dataset.id}">${dataset.name}</option>`).join("") || `<option value="">暂无数据集</option>`;
  schemeSelect.innerHTML = pendingResources.schemes.map((scheme) => `<option value="${scheme.id}">${scheme.name}</option>`).join("") || `<option value="">暂无方案</option>`;
  sceneSelect.value = pendingSource.sceneId;
  datasetSelect.value = pendingSource.datasetId;
  schemeSelect.value = pendingSource.schemeId;
  updateSourcePreview();
}

function updateSourcePreview() {
  const scene = state.scenes.find((item) => item.id === pendingSource.sceneId);
  const dataset = pendingResources.datasets.find((item) => item.id === pendingSource.datasetId);
  const scheme = pendingResources.schemes.find((item) => item.id === pendingSource.schemeId);
  document.querySelector("#sourcePreview").innerHTML = `
    <div><span>场景</span><strong>${scene?.name || "暂无"}</strong></div>
    <div><span>数据集</span><strong>${dataset?.name || "暂无"}</strong></div>
    <div><span>方案</span><strong>${scheme?.name || "暂无"}</strong></div>
  `;
}

async function applySourceModal() {
  state.activeSceneId = pendingSource.sceneId;
  await loadSceneResources();
  state.activeDatasetId = pendingSource.datasetId;
  state.activeSchemeId = pendingSource.schemeId;
  closeTaskEvents();
  currentTask = null;
  closeSourceModal();
  await refreshWorkbench();
  toast("数据源与方案已切换");
}

function setBatchButtonState() {
  const selectedCount = table?.getSelectedRows?.().length || 0;
  const button = document.querySelector("#batchAnnotateButton");
  if (button) {
    button.disabled = selectedCount === 0;
    button.textContent = selectedCount > 0 ? `批量标注 ${selectedCount}` : "批量标注";
  }
  const currentPage = document.querySelector("#selectCurrentPage");
  if (currentPage && selectedCount === 0) currentPage.checked = false;
}

function selectVisibleRows(checked) {
  if (!table) return;
  table.getRows("visible").forEach((row) => {
    if (checked) row.select();
    else row.deselect();
  });
  setBatchButtonState();
}

function toggleGlobalMenu(button) {
  const menu = document.querySelector("#globalMoreMenu");
  const shouldOpen = menu.hidden;
  closeMenus();
  menu.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function toggleStatusFilterMenu(button) {
  const menu = document.querySelector("#statusFilterMenu");
  const shouldOpen = menu.hidden;
  closeMenus();
  syncStatusFilterMenu();
  menu.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function syncStatusFilterMenu() {
  document.querySelectorAll("#statusFilterMenu input").forEach((input) => {
    input.checked = statusFilters.has(input.value);
  });
  const button = document.querySelector("#filterButton");
  if (button) {
    button.textContent = statusFilters.size ? `筛选 ${statusFilters.size}` : "筛选";
  }
}

function closeMenus() {
  document.querySelector("#globalMoreMenu")?.setAttribute("hidden", "");
  document.querySelector("#statusFilterMenu")?.setAttribute("hidden", "");
  document.querySelector("#rowMoreMenu")?.classList.remove("open");
  document.querySelectorAll('[aria-expanded="true"]').forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function stopRowActionPropagation(event) {
  if (event.target.closest("[data-row-action], [data-row-more]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function handleRowActionClick(event) {
  const rowAction = event.target.closest("[data-row-action]");
  const more = event.target.closest("[data-row-more]");
  if (!rowAction && !more) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (rowAction && !more) {
    const menu = rowAction.closest("#rowMoreMenu");
    if (menu) closeMenus();
    handleRowAction(rowAction.dataset.rowAction, rowAction.dataset.rowId || menu?.dataset.rowId);
    return;
  }
  openRowMoreMenu(more);
}

function handleMoreMenu(event) {
  const rowAction = event.target.closest("[data-row-action]");
  const more = event.target.closest("[data-row-more]");
  if (rowAction || more) {
    event.preventDefault();
    event.stopPropagation();
  }
  const menu = document.querySelector("#rowMoreMenu");
  if (more) {
    openRowMoreMenu(more);
    return;
  }
  if (event.target.closest("#rowMoreMenu")) {
    menu.classList.remove("open");
    return;
  }
  if (event.target.closest("#filterButton") || event.target.closest("#statusFilterMenu")) {
    return;
  }
  if (!event.target.closest("#globalMoreButton") && !event.target.closest("#globalMoreMenu")) {
    closeMenus();
  }
}

function openRowMoreMenu(more) {
  const menu = document.querySelector("#rowMoreMenu");
  if (!menu || !more) return;
  const rect = more.getBoundingClientRect();
  closeMenus();
  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 116)}px`;
  menu.style.left = `${Math.min(rect.right - 108, window.innerWidth - 120)}px`;
  menu.dataset.rowId = more.dataset.rowId || "";
  menu.classList.add("open");
  more.setAttribute("aria-expanded", "true");
}

async function openRowDetail(rowData, mode = "view") {
  if (!rowData?.row_id) return;
  currentDetailKind = "row";
  setDetailActionsVisible(true);
  document.querySelector("#rowDetailTitle").textContent = `行数据详情 · ${rowData.ID || rowData.row_id || ""}`;
  document.querySelector("#rowDetailJson").textContent = "正在加载完整数据...";
  document.querySelector("#rowAnalysisPane").hidden = true;
  document.querySelector("#rowDetailContent").classList.remove("split");
  document.querySelector("#rowDetailModal").classList.add("open");
  try {
    currentDetailRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowData.row_id}`);
  } catch {
    currentDetailRow = rowData;
  }
  document.querySelector("#rowDetailTitle").textContent = `行数据详情 · ${currentDetailRow.ID || currentDetailRow.row_id || ""}`;
  renderDetailPayload();
  setDetailMode(mode);
}

function openCellDetail(cell) {
  const field = cell.getColumn?.().getField?.();
  if (!field || field === "row_id") return;
  const rowId = cell.getData?.()?.row_id || "";
  openCellValue(field, cell.getValue(), rowId);
}

function handleTableCellDoubleClick(event) {
  if (!table || event.target.closest("button, input, textarea, select")) return;
  const cellElement = event.target.closest(".tabulator-cell");
  const rowElement = event.target.closest(".tabulator-row");
  const field = cellElement?.getAttribute("tabulator-field");
  if (!cellElement || !rowElement || !field || field === "row_id") return;
  const row = table.getRows("visible").find((item) => item.getElement() === rowElement);
  if (!row) return;
  const rowData = row.getData();
  openCellValue(field, rowData[field], rowData.row_id);
}

async function openCellValue(field, value, rowId = "") {
  currentDetailKind = "cell";
  currentDetailRow = null;
  document.querySelector("#rowDetailTitle").textContent = `单元格内容 · ${field}`;
  document.querySelector("#rowDetailJson").hidden = false;
  document.querySelector("#cellFormatButton").disabled = false;
  setCellDetailValue(value);
  document.querySelector("#rowDetailModal").classList.add("open");
  if (rowId && state.activeDatasetId) {
    document.querySelector("#rowDetailMeta").textContent = "正在读取完整单元格内容...";
    try {
      const fullRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}`);
      setCellDetailValue(Object.prototype.hasOwnProperty.call(fullRow, field) ? fullRow[field] : value);
    } catch {
      setCellDetailValue(value);
    }
  }
}

function setCellDetailValue(value) {
  currentCellRawValue = value;
  const parsed = parseJsonLike(value);
  currentCellContent = formatCellRawValue(value);
  document.querySelector("#rowDetailMeta").textContent = parsed.ok ? "检测到 JSON，可点击格式化并高亮显示。" : "按纯文本展示，支持一键复制。";
  renderCellDetailContent(false);
}

function closeRowDetail() {
  document.querySelector("#rowDetailModal")?.classList.remove("open");
}

async function copyCellDetailContent() {
  const content = currentCellContent || document.querySelector("#rowDetailJson")?.textContent || "";
  if (!content) {
    toast("暂无可复制内容");
    return;
  }
  try {
    await navigator.clipboard.writeText(content);
    toast("已复制单元格内容");
  } catch {
    fallbackCopyText(content);
  }
}

function formatCellJsonContent() {
  let parsed = parseJsonLike(currentCellRawValue);
  if (!parsed.ok) parsed = parseJsonLike(currentCellContent);
  if (!parsed.ok) {
    currentCellContent = formatCellRawValue(currentCellRawValue ?? currentCellContent);
    renderCellDetailContent(false);
    toast("当前内容按纯文本换行展示");
    return;
  }
  currentCellContent = JSON.stringify(parsed.value, null, 2);
  renderCellDetailContent(true);
  document.querySelector("#rowDetailMeta").textContent = "JSON 已格式化并高亮显示。";
  toast("JSON 已格式化");
}

function renderCellDetailContent(highlightJson = false) {
  const viewer = document.querySelector("#rowDetailJson");
  if (!viewer) return;
  viewer.scrollTop = 0;
  if (highlightJson) {
    viewer.innerHTML = highlightJsonText(currentCellContent);
  } else {
    viewer.textContent = currentCellContent;
  }
}

function parseJsonLike(value) {
  if (value === null || value === undefined || value === "") return { ok: false, value: null };
  if (typeof value === "object") return { ok: true, value };
  const text = String(value).trim();
  const candidates = [text, unquoteJsonString(text)].filter(Boolean);
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!/^[{\[]/.test(trimmed)) continue;
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch {
      // 继续尝试下一个候选文本。
    }
  }
  return { ok: false, value: text };
}

function unquoteJsonString(text) {
  if (!/^".*"$/.test(text)) return "";
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

function formatCellRawValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function highlightJsonText(text) {
  const pattern = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let result = "";
  let lastIndex = 0;
  text.replace(pattern, (match, _group, _colon, offset) => {
    result += escapeHtml(text.slice(lastIndex, offset));
    let className = "json-number";
    if (match.startsWith('"')) className = /:\s*$/.test(match) ? "json-key" : "json-string";
    else if (match === "true" || match === "false") className = "json-boolean";
    else if (match === "null") className = "json-null";
    result += `<span class="${className}">${escapeHtml(match)}</span>`;
    lastIndex = offset + match.length;
    return match;
  });
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function fallbackCopyText(content) {
  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  toast("已复制单元格内容");
}

async function openRowDrawer(rowData, mode = "view") {
  if (!rowData?.row_id || !state.activeDatasetId) return;
  drawerMode = "view";
  drawerEditDirty = false;
  drawerRow = rowData;
  document.querySelector("#rowDetailDrawer").classList.add("open");
  document.querySelector("#rowDetailDrawer").setAttribute("aria-hidden", "false");
  document.querySelector("#drawerTitle").textContent = `行详情 · ${rowData.ID || rowData.row_id || ""}`;
  document.querySelector("#drawerMeta").textContent = "正在加载完整行数据...";
  document.querySelector("#drawerViewKv").innerHTML = `<div class="empty">正在加载完整数据...</div>`;
  document.querySelector("#drawerAnalysisStatus").textContent = "读取中";
  document.querySelector("#drawerAnalysisJson").textContent = "{}";
  try {
    drawerRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowData.row_id}`);
  } catch {
    drawerRow = rowData;
  }
  initializeDrawerColumns();
  renderDrawerPayload();
  setDrawerMode(mode);
}

function closeRowDrawer() {
  document.querySelector("#rowDetailDrawer")?.classList.remove("open");
  document.querySelector("#rowDetailDrawer")?.setAttribute("aria-hidden", "true");
  document.querySelector("#drawerFieldPopover")?.setAttribute("hidden", "");
  stopDrawerResize();
}

function initializeDrawerColumns() {
  const raw = drawerEditableData();
  const keys = Object.keys(raw);
  const preferred = latestFieldMapping?.visible_columns?.filter((column) => keys.includes(column)) || [];
  const defaults = preferred.length ? preferred : keys.slice(0, Math.min(keys.length, 10));
  drawerSelectedColumns = new Set(defaults);
}

function renderDrawerPayload() {
  if (!drawerRow) return;
  const titleValue = drawerRow.ID || drawerRow["工单名称"] || drawerRow.row_id || "";
  document.querySelector("#drawerTitle").textContent = `行详情 · ${titleValue}`;
  document.querySelector("#drawerMeta").textContent = `状态：${drawerRow["状态"] || "未标注"} · 行号：${drawerRow.row_index || "-"}`;
  document.querySelector("#drawerEditor").value = JSON.stringify(drawerEditableData(), null, 2);
  renderDrawerKeyValues("#drawerViewKv", drawerEditableData());
  renderDrawerFieldGrid();
  renderDrawerResult();
  renderDrawerAnalysisRaw();
  renderDrawerAnalysisResult();
}

function setDrawerMode(mode) {
  if (!drawerRow) return;
  drawerMode = mode;
  drawerEditDirty = false;
  document.querySelector("#drawerViewPane").hidden = mode !== "view";
  document.querySelector("#drawerEditPane").hidden = mode !== "edit";
  document.querySelector("#drawerResultPane").hidden = mode !== "result";
  document.querySelector("#drawerAnalysisPane").hidden = mode !== "analysis";
  setDrawerElementVisible("#drawerEditActions", mode === "edit");
  setDrawerElementVisible("#drawerAnalysisActions", mode === "analysis");
  setDrawerElementVisible("#drawerSave", mode === "edit");
  setDrawerElementVisible("#drawerExitEdit", mode === "edit");
  setDrawerElementVisible("#drawerReanalyze", mode === "analysis");
  document.querySelector("#drawerSave").disabled = true;
  document.querySelector("#drawerFieldPopover")?.setAttribute("hidden", "");
  document.querySelectorAll("[data-drawer-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerMode === mode);
  });
  if (mode === "edit") {
    document.querySelector("#drawerEditor").value = JSON.stringify(drawerEditableData(), null, 2);
    document.querySelector("#drawerEditStatus").textContent = "修改后点击保存";
  }
  if (mode === "analysis") {
    renderDrawerAnalysisRaw();
    renderDrawerAnalysisResult();
  }
  if (mode === "result") {
    renderDrawerResult();
    renderDrawerAnnotationHistory();
  }
}

function setDrawerElementVisible(selector, visible) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

function markDrawerDirty() {
  if (drawerMode !== "edit") return;
  drawerEditDirty = true;
  document.querySelector("#drawerSave").disabled = false;
  document.querySelector("#drawerEditStatus").textContent = "有未保存修改";
}

async function saveDrawerEdit() {
  if (!drawerRow?.row_id || !state.activeDatasetId) return;
  let rawData;
  try {
    rawData = JSON.parse(document.querySelector("#drawerEditor").value || "{}");
  } catch {
    toast("JSON 格式不正确");
    return;
  }
  try {
    const updated = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}`, {
      method: "PUT",
      body: JSON.stringify({ raw_data: rawData }),
    });
    drawerRow = updated;
    currentDetailRow = updated;
    await ensureDynamicResultColumns(updated);
    updateVisibleRow(updated.row_id, updated);
    initializeDrawerColumns();
    renderDrawerPayload();
    setDrawerMode("view");
    scheduleMetricsRefresh();
    toast("行数据已保存");
  } catch (error) {
    toast(error.message);
  }
}

async function analyzeDrawerRow() {
  if (!drawerRow?.row_id || !state.activeDatasetId) return;
  const requestId = ++drawerAnalysisRequest;
  const rowId = drawerRow.row_id;
  document.querySelector("#drawerAnalysisStatus").textContent = "分析中...";
  document.querySelector("#drawerAnalysisJson").textContent = "后台分析中，关闭抽屉不会中断请求。";
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}/analysis`, { method: "POST" });
    const analysisData = result.analysis_data || {};
    if (drawerRow?.row_id === rowId) {
      drawerRow = { ...drawerRow, analysis_data: analysisData, 分析数据: analysisData };
      currentDetailRow = drawerRow;
    }
    await ensureDynamicResultColumns({ 分析数据: analysisData });
    updateVisibleRow(rowId, { 分析数据: analysisData });
    if (requestId === drawerAnalysisRequest && drawerRow?.row_id === rowId) {
      document.querySelector("#drawerAnalysisStatus").textContent = "分析完成";
      renderDrawerAnalysisResult();
    }
    toast("分析数据已写入");
  } catch (error) {
    if (requestId === drawerAnalysisRequest) {
      document.querySelector("#drawerAnalysisStatus").textContent = "分析失败";
      document.querySelector("#drawerAnalysisJson").textContent = error.message;
    }
    toast(error.message);
  }
}

function renderDrawerAnalysisResult() {
  const analysis = drawerRow?.analysis_data || drawerRow?.["分析数据"] || {};
  const hasAnalysis = analysis && typeof analysis === "object" && Object.keys(analysis).length;
  document.querySelector("#drawerAnalysisStatus").textContent = hasAnalysis ? "最新结果" : "暂无结果";
  document.querySelector("#drawerAnalysisJson").textContent = hasAnalysis ? JSON.stringify(analysis, null, 2) : "{}";
}

function renderDrawerResult() {
  const result = drawerRow?.model_result || {};
  const hasResult = result && typeof result === "object" && Object.keys(result).length;
  document.querySelector("#drawerResultStatus").textContent = hasResult ? "最新标注结果" : "暂无标注结果";
  document.querySelector("#drawerResultJson").textContent = hasResult ? JSON.stringify(result, null, 2) : "{}";
  document.querySelector("#drawerPromptText").textContent = formatRenderedPrompts(drawerRow?.rendered_prompt);
}

function formatRenderedPrompts(value) {
  if (!value) return "暂无 Prompt";
  let prompts = value;
  if (typeof value === "string") {
    try {
      prompts = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (!prompts || typeof prompts !== "object") return String(value);
  return Object.entries(prompts).map(([roleName, prompt]) => {
    if (!prompt || typeof prompt !== "object") return `[${roleName}]\n${String(prompt)}`;
    return [
      `[${roleName}] ${prompt.name || ""}`.trim(),
      `prompt_id: ${prompt.prompt_id || ""}`,
      "",
      prompt.content || "",
    ].join("\n");
  }).join("\n\n---\n\n");
}

async function renderDrawerAnnotationHistory() {
  if (!drawerRow?.row_id || !state.activeDatasetId) return;
  const requestId = ++drawerAnnotationHistoryRequest;
  const status = document.querySelector("#drawerHistoryStatus");
  const list = document.querySelector("#drawerHistoryList");
  status.textContent = "加载中";
  list.innerHTML = `<div class="empty">正在读取历史标注...</div>`;
  try {
    const rows = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}/annotation-history`);
    if (requestId !== drawerAnnotationHistoryRequest || drawerMode !== "result") return;
    status.textContent = rows.length ? `${rows.length} 次记录` : "暂无历史";
    list.innerHTML = rows.map((row) => {
      const result = row.model_result && Object.keys(row.model_result).length
        ? JSON.stringify(row.model_result, null, 2)
        : row.error || "暂无返回";
      return `
        <article class="drawer-history-item">
          <div class="drawer-history-head">
            <span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status || "未知")}</span>
            <strong>${escapeHtml(formatHistoryTime(row.finished_at || row.updated_at || row.created_at))}</strong>
          </div>
          <div class="drawer-history-meta">任务 ${escapeHtml(row.task_id || "-")} · 方案 ${escapeHtml(row.scheme_id || "-")}</div>
          <pre>${escapeHtml(result)}</pre>
        </article>
      `;
    }).join("") || `<div class="empty">暂无历史标注记录</div>`;
  } catch (error) {
    if (requestId !== drawerAnnotationHistoryRequest) return;
    status.textContent = "读取失败";
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderDrawerAnalysisRaw() {
  const raw = drawerEditableData();
  const selected = Object.fromEntries(
    Object.entries(raw).filter(([key]) => drawerSelectedColumns.has(key)),
  );
  renderDrawerKeyValues("#drawerAnalysisRaw", selected, "当前未选择字段。");
}

function renderDrawerFieldGrid() {
  const grid = document.querySelector("#drawerFieldGrid");
  const keys = Object.keys(drawerEditableData());
  grid.innerHTML = keys.map((key) => `
    <label class="drawer-field-chip">
      <input type="checkbox" value="${escapeHtml(key)}" ${drawerSelectedColumns.has(key) ? "checked" : ""}>
      <span title="${escapeHtml(key)}">${escapeHtml(key)}</span>
    </label>
  `).join("") || `<div class="empty">暂无可选字段</div>`;
}

function toggleDrawerFieldPopover() {
  const popover = document.querySelector("#drawerFieldPopover");
  popover.hidden = !popover.hidden;
}

function handleDrawerFieldPopoverClick(event) {
  const action = event.target.closest("[data-drawer-field-action]")?.dataset.drawerFieldAction;
  if (action) {
    const keys = Object.keys(drawerEditableData());
    if (action === "all") drawerSelectedColumns = new Set(keys);
    if (action === "clear") drawerSelectedColumns = new Set();
    if (action === "visible") initializeDrawerColumns();
    renderDrawerFieldGrid();
    renderDrawerAnalysisRaw();
    return;
  }
  if (event.target.matches('input[type="checkbox"]')) {
    if (event.target.checked) drawerSelectedColumns.add(event.target.value);
    else drawerSelectedColumns.delete(event.target.value);
    renderDrawerAnalysisRaw();
  }
}

function renderDrawerKeyValues(selector, payload, emptyText = "暂无数据") {
  const container = document.querySelector(selector);
  const entries = Object.entries(payload || {});
  container.innerHTML = entries.map(([key, value]) => {
    const text = formatDisplayValue(value);
    const collapsed = shouldCollapseDrawerValue(text);
    return `
    <article class="drawer-kv-row ${collapsed ? "is-collapsible is-collapsed" : ""}">
      <div class="drawer-kv-key" title="${escapeHtml(key)}">
        <span>${escapeHtml(key)}</span>
        ${collapsed ? `<button class="drawer-kv-toggle" type="button" data-drawer-kv-toggle>展开</button>` : ""}
      </div>
      <div class="drawer-kv-value-wrap">
        <div class="drawer-kv-value">${escapeHtml(text)}</div>
      </div>
    </article>
  `;
  }).join("") || `<div class="empty">${emptyText}</div>`;
}

function drawerEditableData() {
  return editableDetailDataFrom(drawerRow || {});
}

function shouldCollapseDrawerValue(text) {
  const value = String(text || "");
  return value.length > 360 || value.split("\n").length > 8;
}

function handleDrawerKvToggle(event) {
  const button = event.target.closest("[data-drawer-kv-toggle]");
  if (!button) return;
  const row = button.closest(".drawer-kv-row");
  if (!row) return;
  const collapsed = row.classList.toggle("is-collapsed");
  button.textContent = collapsed ? "展开" : "收起";
}

function startDrawerResize(event) {
  const drawer = document.querySelector(".detail-drawer");
  if (!drawer) return;
  event.preventDefault();
  stopDrawerResize();
  document.body.classList.add("is-resizing-drawer");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    const width = window.innerWidth - moveEvent.clientX;
    setDrawerWidth(width);
  };
  const stop = () => stopDrawerResize();
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
  drawerResizeCleanup = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    document.body.classList.remove("is-resizing-drawer");
  };
}

function stopDrawerResize() {
  if (!drawerResizeCleanup) return;
  drawerResizeCleanup();
  drawerResizeCleanup = null;
}

function setDrawerWidth(width) {
  const drawer = document.querySelector(".detail-drawer");
  if (!drawer) return;
  const max = Math.max(window.innerWidth - 56, 360);
  const min = Math.min(620, max);
  const clamped = Math.max(min, Math.min(width, max));
  drawer.style.setProperty("--drawer-width", `${Math.round(clamped)}px`);
}

function renderDetailPayload() {
  const text = JSON.stringify(currentDetailRow || {}, null, 2);
  renderDetailKeyValues(currentDetailRow || {});
  document.querySelector("#rowDetailKv").hidden = false;
  document.querySelector("#rowDetailJson").textContent = text;
  document.querySelector("#rowDetailEditor").value = JSON.stringify(editableDetailData(), null, 2);
  const analysis = currentDetailRow?.analysis_data || currentDetailRow?.["分析数据"];
  document.querySelector("#rowAnalysisJson").textContent = analysis ? JSON.stringify(analysis, null, 2) : "{}";
}

function renderDetailKeyValues(payload) {
  const container = document.querySelector("#rowDetailKv");
  const entries = Object.entries(payload || {});
  container.innerHTML = entries.map(([key, value]) => `
    <div class="kv-row">
      <div class="kv-key" title="${escapeHtml(key)}">${escapeHtml(key)}</div>
      <div class="kv-value">${escapeHtml(formatDisplayValue(value))}</div>
    </div>
  `).join("") || `<div class="empty">暂无数据</div>`;
}

function setDetailMode(mode) {
  if (currentDetailKind !== "row") return;
  currentDetailMode = mode;
  const editing = mode === "edit";
  detailEditDirty = false;
  document.querySelector("#rowDetailKv").hidden = editing;
  document.querySelector("#rowDetailJson").hidden = true;
  document.querySelector("#rowDetailEditor").hidden = !editing;
  document.querySelector("#detailSaveButton").hidden = true;
  document.querySelector("#detailEditButton").hidden = editing;
  document.querySelector("#rowDetailStatus").textContent = editing ? "编辑模式" : "查看模式";
  document.querySelector("#rowDetailMeta").textContent = editing
    ? "编辑 JSON 内容后保存，保存成功会同步更新当前行。"
    : "支持完整 JSON 查看、分析、编辑、删除和导出。";
  document.querySelector("#rowDetailContent").scrollTop = 0;
}

function setDetailActionsVisible(visible) {
  document.querySelector(".row-detail-actions").hidden = !visible;
  if (!visible) {
    document.querySelector("#detailSaveButton").hidden = true;
    document.querySelector("#detailEditButton").hidden = false;
  }
}

function markDetailEditable() {
  if (currentDetailMode !== "edit" || currentDetailKind !== "row") return;
  detailEditDirty = true;
  document.querySelector("#detailSaveButton").hidden = false;
}

function formatDetailValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const text = String(value);
  const trimmed = text.trim();
  if (/^[{\[]/.test(trimmed)) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function formatDisplayValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const text = String(value);
  const trimmed = text.trim();
  if (/^[{\[]/.test(trimmed)) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

async function saveDetailEdit() {
  if (!currentDetailRow?.row_id || !state.activeDatasetId) return;
  if (!detailEditDirty) return;
  let rawData;
  try {
    rawData = JSON.parse(document.querySelector("#rowDetailEditor").value || "{}");
  } catch {
    toast("JSON 格式不正确");
    return;
  }
  try {
    const updated = await api(`/api/datasets/${state.activeDatasetId}/rows/${currentDetailRow.row_id}`, {
      method: "PUT",
      body: JSON.stringify({ raw_data: rawData }),
    });
    currentDetailRow = updated;
    await ensureDynamicResultColumns(updated);
    updateVisibleRow(updated.row_id, updated);
    renderDetailPayload();
    setDetailMode("view");
    scheduleMetricsRefresh();
    toast("行数据已保存");
  } catch (error) {
    toast(error.message);
  }
}

function editableDetailData() {
  return editableDetailDataFrom(currentDetailRow || {});
}

function editableDetailDataFrom(row) {
  const reserved = new Set(["row_id", "row_index", "状态", "model_result", "analysis_data", "rendered_prompt"]);
  return Object.fromEntries(
    Object.entries(row || {}).filter(([key]) => !reserved.has(key)),
  );
}

async function analyzeCurrentDetailRow() {
  if (!currentDetailRow?.row_id) return;
  const pane = document.querySelector("#rowAnalysisPane");
  const content = document.querySelector("#rowDetailContent");
  pane.hidden = false;
  content.classList.add("split");
  document.querySelector("#rowAnalysisStatus").textContent = "分析中...";
  document.querySelector("#rowAnalysisJson").textContent = "后台分析中，关闭窗口不会中断请求。";
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${currentDetailRow.row_id}/analysis`, { method: "POST" });
    const analysisData = result.analysis_data || {};
    currentDetailRow = { ...currentDetailRow, analysis_data: analysisData, 分析数据: analysisData };
    await ensureDynamicResultColumns({ 分析数据: analysisData });
    updateVisibleRow(currentDetailRow.row_id, { 分析数据: analysisData });
    document.querySelector("#rowAnalysisStatus").textContent = "分析完成";
    document.querySelector("#rowAnalysisJson").textContent = JSON.stringify(analysisData, null, 2);
    toast("分析数据已写入");
  } catch (error) {
    document.querySelector("#rowAnalysisStatus").textContent = "分析失败";
    document.querySelector("#rowAnalysisJson").textContent = error.message;
    toast(error.message);
  }
}

function exportCurrentDetailRow() {
  if (!currentDetailRow) return;
  downloadJson(currentDetailRow, `${currentDetailRow.ID || currentDetailRow.row_id || "row-data"}.json`);
}

async function exportDataset() {
  if (!state.activeDatasetId) {
    toast("请先选择数据集");
    return;
  }
  try {
    const payload = await api(`/api/datasets/${state.activeDatasetId}/export`);
    const name = payload.dataset?.name || state.activeDatasetId || "dataset";
    downloadJson(payload, `${sanitizeFileName(name)}.json`);
    toast("当前数据集已导出");
  } catch (error) {
    toast(error.message);
  }
}

function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(value) {
  return String(value || "dataset").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}

async function deleteRow(rowId) {
  if (!state.activeDatasetId || !rowId) return;
  const ok = window.confirm("确认删除这行数据？删除后该行会从当前数据集中移除。");
  if (!ok) return;
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}`, { method: "DELETE" });
    table?.deleteRow?.(rowId);
    closeRowDetail();
    document.querySelector("#metricTotal").textContent = Number(result.row_count || 0).toLocaleString();
    scheduleMetricsRefresh(0);
    toast("行数据已删除");
  } catch (error) {
    toast(error.message);
  }
}

async function deleteSelectedRows() {
  if (!state.activeDatasetId || !table) return;
  const selectedIds = table.getSelectedRows?.().map((row) => row.getData().row_id).filter(Boolean) || [];
  if (!selectedIds.length) {
    toast("请先选择要删除的行");
    return;
  }
  const ok = window.confirm(`确认删除选中的 ${selectedIds.length} 行数据？`);
  if (!ok) return;
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/delete`, {
      method: "POST",
      body: JSON.stringify({ row_ids: selectedIds }),
    });
    for (const rowId of result.row_ids || selectedIds) {
      try {
        table.deleteRow?.(rowId);
      } catch {
        // 当前页不存在该行时无需处理。
      }
    }
    document.querySelector("#selectCurrentPage").checked = false;
    setBatchButtonState();
    document.querySelector("#metricTotal").textContent = Number(result.row_count || 0).toLocaleString();
    scheduleMetricsRefresh(0);
    toast(`已删除 ${result.deleted_count || selectedIds.length} 行`);
  } catch (error) {
    toast(error.message);
  }
}

async function openColumnSettings() {
  if (!state.activeSceneId || !state.activeDatasetId) {
    toast("请先选择场景和数据集");
    return;
  }
  try {
    if (!availableDatasetColumns.length) {
      const payload = await api(`/api/datasets/${state.activeDatasetId}/rows?page=1&page_size=1`);
      availableDatasetColumns = payload.columns || [];
    }
    latestFieldMapping = await api(`/api/field-mapping?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    renderColumnSettings();
    document.querySelector("#columnSettingsModal").classList.add("open");
  } catch (error) {
    toast(error.message);
  }
}

function closeColumnSettings() {
  document.querySelector("#columnSettingsModal")?.classList.remove("open");
}

function renderColumnSettings() {
  const grid = document.querySelector("#columnSettingsGrid");
  const selected = new Set(latestFieldMapping?.visible_columns?.length ? latestFieldMapping.visible_columns : availableDatasetColumns);
  grid.innerHTML = availableDatasetColumns.map((column) => `
    <label class="column-chip">
      <input type="checkbox" value="${escapeHtml(column)}" ${selected.has(column) ? "checked" : ""}>
      <span title="${escapeHtml(column)}">${escapeHtml(column)}</span>
    </label>
  `).join("") || `<div class="empty">当前数据集暂无可配置列</div>`;
}

function setColumnSettingsChecked(checked) {
  document.querySelectorAll("#columnSettingsGrid input[type='checkbox']").forEach((input) => {
    input.checked = checked;
  });
}

async function saveColumnSettings() {
  if (!state.activeSceneId) return;
  const visibleColumns = [...document.querySelectorAll("#columnSettingsGrid input:checked")].map((input) => input.value);
  if (!visibleColumns.length) {
    toast("至少保留一列用于列表展示");
    return;
  }
  const mapping = latestFieldMapping || {
    human_answer_column: "",
    model_answer_column: "",
    annotation_columns: [],
  };
  try {
    latestFieldMapping = await api("/api/field-mapping", {
      method: "PUT",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        human_answer_column: mapping.human_answer_column || "",
        model_answer_column: mapping.model_answer_column || "",
        visible_columns: visibleColumns,
        annotation_columns: mapping.annotation_columns || [],
      }),
    });
    closeColumnSettings();
    await refreshWorkbench();
    toast("列设置已保存");
  } catch (error) {
    toast(error.message);
  }
}

function previewColumn(column) {
  return /API Part|API Order|Summary|标注数据|分析数据|模型说明|raw_output/.test(column);
}

function textPreviewFormatter(cell) {
  const value = cell.getValue();
  if (value === null || value === undefined) return "";
  const text = String(value);
  return `<span title="${escapeHtml(text)}">${escapeHtml(text.length > 72 ? `${text.slice(0, 72)}...` : text)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusClass(value) {
  return { TP: "tp", TN: "tn", FP: "fp", FN: "fn", 标注中: "running", 排队中: "queued", 失败: "failed", 取消: "cancelled" }[value] || "";
}

function formatStatusPill(value) {
  const safeValue = escapeHtml(value || "未标注");
  const loading = value === "标注中" ? `<span class="status-spinner" aria-hidden="true"></span>` : "";
  return `<span class="status-pill ${statusClass(value)}">${loading}<span>${safeValue}</span></span>`;
}

function annotationButtonMeta(status) {
  const freshStatuses = new Set(["未标注", "排队中", "标注中"]);
  if (freshStatuses.has(status || "未标注")) {
    return { label: "标注", className: "primary" };
  }
  return { label: "重新标注", className: "reannotate" };
}

async function startAnnotationTask(mode, rowIds = []) {
  if (!state.activeDatasetId || !state.activeSchemeId) {
    toast("请先选择数据集和标注方案");
    return;
  }
  if (mode === "all") {
    const confirmed = await confirmFullAnnotationTask();
    if (!confirmed) return;
  }
  const selectedIds = rowIds.length
    ? rowIds
    : table?.getSelectedRows?.().map((row) => row.getData().row_id).filter(Boolean) || [];
  if (mode === "selected" && !selectedIds.length) {
    toast("请先选择需要标注的行");
    return;
  }
  const optimisticRowIds = getOptimisticTaskRowIds(mode, selectedIds);
  try {
    const task = await api("/api/annotation-tasks", {
      method: "POST",
      body: JSON.stringify({
        dataset_id: state.activeDatasetId,
        scheme_id: state.activeSchemeId,
        row_ids: selectedIds,
        mode,
      }),
    });
    currentTask = task;
    updateTaskStrip(task);
    markRowsQueuedForTask(optimisticRowIds);
    markInitialRunningRowsForTask(optimisticRowIds, task.concurrency || 1);
    connectTaskEvents(task.id);
    table?.deselectRow?.();
    setBatchButtonState();
    scheduleMetricsRefresh(0);
    toast(mode === "all" ? `全量标注任务已启动，本次 ${task.total_count || 0} 条` : "批量标注任务已启动");
  } catch (error) {
    toast(error.message);
  }
}

async function confirmFullAnnotationTask() {
  try {
    const metrics = await api(`/api/datasets/${state.activeDatasetId}/metrics`);
    const queued = Number(metrics.queued || 0);
    const running = Number(metrics.running || 0);
    const total = Number(metrics.total || 0);
    const available = Math.max(total - queued - running, 0);
    if (!available) {
      toast("当前没有可创建任务的数据行，排队中和标注中的数据会被跳过");
      return false;
    }
    if (!queued && !running) return true;
    return window.confirm(`当前有 ${running} 条标注中、${queued} 条排队中，本次全量标注将跳过这些数据，并重新标注其余 ${available} 条。是否继续？`);
  } catch (error) {
    toast(error.message);
    return false;
  }
}

async function stopCurrentTask() {
  if (!currentTask?.id) {
    await loadLatestTask();
  }
  if (!currentTask?.id) {
    toast("当前没有可停止的标注任务");
    return;
  }
  const queued = currentTask.queued_count || 0;
  const ok = window.confirm(`当前还有 ${queued} 条任务正在排队。确认停止未完成标注？`);
  if (!ok) return;
  try {
    const result = await api(`/api/annotation-tasks/${currentTask.id}/stop-unfinished`, { method: "POST" });
    currentTask = result.task;
    updateTaskStrip(currentTask);
    markRowsCancelled(result.cancelled_row_ids || []);
    scheduleMetricsRefresh(0);
    toast(`已停止 ${result.cancelled_count || queued} 条排队任务`);
  } catch (error) {
    toast(error.message);
  }
}

async function refreshMetrics() {
  const ids = [
    "metricTotal",
    "metricUnannotated",
    "metricDone",
    "metricQueued",
    "metricRunning",
    "metricTp",
    "metricTn",
    "metricFp",
    "metricFn",
    "metricAccuracy",
    "metricPrecision",
    "metricRecall",
    "metricF1",
    "metricSpecificity",
    "metricFpr",
  ];
  if (!ids.every((id) => document.querySelector(`#${id}`))) return;
  if (!state.activeDatasetId) {
    setMetrics({
      total: 0,
      unannotated: 0,
      queued: 0,
      running: 0,
      tp: 0,
      tn: 0,
      fp: 0,
      fn: 0,
      accuracy: null,
      algorithm_accuracy: null,
      correct_recall: null,
      correct_precision: null,
      error_precision: null,
      business_accuracy: null,
      precision: null,
      recall: null,
      f1: null,
      specificity: null,
      false_positive_rate: null,
    });
    return;
  }
  try {
    setMetrics(await api(`/api/datasets/${state.activeDatasetId}/metrics`));
  } catch {
    // 指标接口异常时保持当前表格可用。
  }
}

function setMetrics(metrics) {
  const done = (metrics.tp || 0) + (metrics.fp || 0);
  document.querySelector("#metricTotal").textContent = formatNumber(metrics.total);
  document.querySelector("#metricUnannotated").textContent = formatNumber(metrics.unannotated);
  document.querySelector("#metricDone").textContent = formatNumber(done);
  document.querySelector("#metricQueued").textContent = formatNumber(metrics.queued);
  document.querySelector("#metricRunning").textContent = formatNumber(metrics.running);
  document.querySelector("#metricTp").textContent = formatNumber(metrics.tp);
  document.querySelector("#metricTn").textContent = formatNumber(metrics.tn);
  document.querySelector("#metricFp").textContent = formatNumber(metrics.fp);
  document.querySelector("#metricFn").textContent = formatNumber(metrics.fn);
  document.querySelector("#metricAccuracy").textContent = formatRate(metrics.algorithm_accuracy ?? metrics.accuracy);
  document.querySelector("#metricRecall").textContent = formatRate(metrics.correct_recall ?? metrics.recall);
  document.querySelector("#metricPrecision").textContent = formatRate(metrics.correct_precision ?? metrics.precision);
  document.querySelector("#metricSpecificity").textContent = formatRate(metrics.error_precision ?? metrics.specificity);
  document.querySelector("#metricF1").textContent = formatRate(metrics.f1);
  document.querySelector("#metricFpr").textContent = formatRate(metrics.business_accuracy ?? metrics.false_positive_rate);
}

async function loadLatestTask() {
  if (!state.activeDatasetId) {
    currentTask = null;
    updateTaskStrip(null);
    return;
  }
  try {
    const tasks = await api(`/api/annotation-tasks?dataset_id=${encodeURIComponent(state.activeDatasetId)}`);
    const running = tasks.find((task) => task.status === "queued" || task.status === "running");
    currentTask = running || tasks[0] || null;
    updateTaskStrip(currentTask);
    if (running && (!taskEvents || taskEvents._taskId !== running.id)) {
      connectTaskEvents(running.id);
    }
  } catch {
    currentTask = null;
    updateTaskStrip(null);
  }
}

function connectTaskEvents(taskId) {
  closeTaskEvents();
  taskEvents = new EventSource(`/api/annotation-tasks/${taskId}/events`);
  taskEvents._taskId = taskId;
  taskEvents.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "heartbeat") return;
    if (payload.task) {
      currentTask = payload.task;
      updateTaskStrip(payload.task);
    }
    await applyTaskEventToTable(payload);
    if (payload.metrics) {
      setMetrics(payload.metrics);
    } else if (["row_started", "row_updated", "row_analyzed", "task_stopped", "task_finished"].includes(payload.type)) {
      scheduleMetricsRefresh();
    }
    if (payload.type === "task_finished") {
      closeTaskEvents();
    }
  };
  taskEvents.onerror = () => {
    closeTaskEvents();
  };
}

function closeTaskEvents() {
  if (taskEvents) {
    taskEvents.close();
    taskEvents = null;
  }
}

function scheduleMetricsRefresh(delay = 220) {
  window.clearTimeout(metricsTimer);
  metricsTimer = window.setTimeout(() => refreshMetrics(), delay);
}

function dataColumnDef(column, sampleRows = []) {
  return {
    title: column,
    field: column,
    minWidth: 72,
    width: estimateColumnWidth(column, sampleRows),
    maxWidth: previewColumn(column) ? 320 : 220,
    widthGrow: 0,
    widthShrink: 0,
    formatter: previewColumn(column) ? textPreviewFormatter : undefined,
    cssClass: previewColumn(column) ? "cell-preview" : "",
  };
}

function estimateColumnWidth(column, sampleRows = []) {
  const maxContentUnits = Math.max(
    measureTextUnits(column),
    ...sampleRows.slice(0, 20).map((row) => measureTextUnits(row?.[column])),
  );
  const rawWidth = Math.ceil(maxContentUnits * 7.4 + 28);
  const maxWidth = previewColumn(column) ? 320 : 220;
  const minWidth = compactColumn(column) ? 78 : 92;
  return Math.max(minWidth, Math.min(rawWidth, maxWidth));
}

function measureTextUnits(value) {
  const text = String(value ?? "");
  if (!text) return 0;
  const limited = text.slice(0, 80);
  let units = 0;
  for (const char of limited) {
    units += /[\u4e00-\u9fff\uff00-\uffef]/.test(char) ? 1.7 : 1;
  }
  return units;
}

function compactColumn(column) {
  return ["ID", "状态", "GPT4_标注", "Claude_结果"].includes(column) || /^API Order$/.test(column);
}

function getOptimisticTaskRowIds(mode, selectedIds) {
  if (!table) return [];
  const selectedSet = new Set(selectedIds);
  return table.getRows()
    .map((row) => row.getData())
    .filter((data) => (mode === "all" || selectedSet.has(data.row_id)) && canQueueRow(data))
    .map((data) => data.row_id);
}

function markRowsQueuedForTask(rowIds) {
  if (!table) return;
  const idSet = new Set(rowIds);
  table.getRows().forEach((row) => {
    const data = row.getData();
    if (idSet.has(data.row_id)) {
      updateTableRow(row, { 状态: "排队中" });
    }
  });
}

function markInitialRunningRowsForTask(rowIds, concurrency) {
  if (!table) return;
  const idSet = new Set(rowIds);
  const rows = table.getRows().filter((row) => {
    const data = row.getData();
    return idSet.has(data.row_id);
  });
  rows.slice(0, Math.max(Number(concurrency) || 1, 1)).forEach((row) => {
    updateTableRow(row, { 状态: "标注中" });
  });
}

function canQueueRow(rowData) {
  return !["排队中", "标注中"].includes(rowData?.状态);
}

function markRowsCancelled(rowIds) {
  const idSet = new Set(rowIds);
  if (!table || !idSet.size) return;
  table.getRows().forEach((row) => {
    const data = row.getData();
    if (idSet.has(data.row_id)) updateTableRow(row, { 状态: "取消" });
  });
}

async function applyTaskEventToTable(payload) {
  if (!table || !payload?.type) return;
  if (payload.type === "row_started") {
    updateVisibleRow(payload.row_id, { 状态: payload.status || "标注中" });
    return;
  }
  if (payload.type === "row_updated") {
    const result = payload.model_result || {};
    let status = payload.status || (payload.error ? "失败" : "");
    let fullRow = null;
    if (!status && state.activeDatasetId && payload.row_id) {
      try {
        fullRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${payload.row_id}`);
        status = fullRow?.["状态"] || "";
      } catch {
        status = "";
      }
    }
    await ensureDynamicResultColumns(result);
    updateVisibleRow(payload.row_id, { ...(fullRow || {}), ...result, ...(status ? { 状态: status } : {}) });
    if (drawerRow?.row_id === payload.row_id) {
      const latestResult = Object.keys(result).length ? result : fullRow?.model_result || drawerRow.model_result || {};
      drawerRow = {
        ...drawerRow,
        ...(fullRow || {}),
        ...result,
        ...(status ? { 状态: status } : {}),
        model_result: latestResult,
        rendered_prompt: payload.rendered_prompt || fullRow?.rendered_prompt || drawerRow.rendered_prompt || "",
      };
      if (drawerMode === "result") {
        renderDrawerResult();
        renderDrawerAnnotationHistory();
      }
    }
    return;
  }
  if (payload.type === "row_analyzed") {
    await ensureDynamicResultColumns({ 分析数据: payload.analysis_data || {} });
    updateVisibleRow(payload.row_id, { 分析数据: payload.analysis_data || {} });
    return;
  }
  if (payload.type === "task_stopped") {
    markRowsCancelled(payload.cancelled_row_ids || []);
  }
}

function updateVisibleRow(rowId, patch) {
  if (!table || !rowId || !patch) return;
  try {
    const row = table.getRow(rowId);
    if (row) {
      updateTableRow(row, patch);
      return;
    }
  } catch {
    // 行不在当前页时无需处理，切页时会从后端读取最新状态。
  }
  table.updateData?.([{ row_id: rowId, ...patch }]);
}

function updateTableRow(row, patch) {
  const result = row.update(patch);
  const refresh = () => refreshTableRow(row);
  if (result && typeof result.then === "function") {
    result.then(refresh).catch(refresh);
  } else {
    refresh();
  }
}

function refreshTableRow(row) {
  try {
    row.reformat?.();
    row.normalizeHeight?.();
  } catch {
    // Tabulator 在远程分页切换时可能已移除该行，忽略即可。
  }
}

async function ensureDynamicResultColumns(result) {
  if (!table || !result || typeof result !== "object") return;
  const existing = new Set(
    table.getColumns?.()
      .map((column) => column.getField?.())
      .filter(Boolean) || [],
  );
  for (const key of Object.keys(result)) {
    if (!key || existing.has(key) || key === "row_id" || key === "状态") continue;
    try {
      await table.addColumn(dataColumnDef(key), true, "状态");
      existing.add(key);
    } catch {
      // 当前表格实例不支持动态插列时，下一次切换/搜索会从列结构重建。
    }
  }
}

function updateTaskStrip(task) {
  const title = document.querySelector("#taskTitle");
  const meta = document.querySelector("#taskMeta");
  const progress = document.querySelector("#taskProgress");
  if (!title || !meta || !progress) return;
  if (!task) {
    title.textContent = "任务状态";
    meta.textContent = "暂无运行中的标注任务。";
    progress.style.setProperty("--value", "0%");
    return;
  }
  const finished = (task.done_count || 0) + (task.failed_count || 0) + (task.cancelled_count || 0);
  const total = task.total_count || 0;
  const percent = total ? Math.round((finished / total) * 100) : 0;
  title.textContent = `任务 ${task.status}`;
  meta.textContent = `总数 ${total} · 排队 ${task.queued_count || 0} · 标注中 ${task.running_count || 0} · 完成 ${task.done_count || 0} · 失败 ${task.failed_count || 0}`;
  progress.style.setProperty("--value", `${percent}%`);
}

async function handleRowAction(action, rowId) {
  const rowData = getVisibleRowData(rowId);
  if (action === "view") {
    if (rowData) openRowDrawer(rowData);
    return;
  }
  if (action === "edit") {
    if (rowData) openRowDrawer(rowData, "edit");
    return;
  }
  if (action === "export") {
    await exportRow(rowId);
    return;
  }
  if (action === "delete") {
    await deleteRow(rowId);
    return;
  }
  if (action === "annotate") {
    await startAnnotationTask("selected", [rowId]);
    return;
  }
}

async function exportRow(rowId) {
  if (!state.activeDatasetId || !rowId) return;
  try {
    currentDetailRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}`);
    exportCurrentDetailRow();
  } catch (error) {
    toast(error.message);
  }
}

function getVisibleRowData(rowId) {
  return table?.getRows("visible").find((row) => row.getData().row_id === rowId)?.getData() || null;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatHistoryTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function formatRate(value) {
  return value === null || value === undefined ? "--" : `${Math.round(Number(value) * 100)}%`;
}
