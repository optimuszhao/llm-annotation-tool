import { state, toast } from "/assets/app.js";

let table = null;
let searchTimer = 0;

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
    <div class="workbench-layout">
      <div class="metric-groups">
        <div class="metric-group">
          <div class="mini-metric"><label>总数</label><strong id="metricTotal">0</strong></div>
          <div class="mini-metric todo"><label>待标注</label><strong>0</strong></div>
          <div class="mini-metric done"><label>已标注</label><strong>0</strong></div>
          <div class="mini-metric running-card"><label>标注中</label><strong>0</strong></div>
        </div>
        <div class="metric-group">
          <div class="mini-metric tp"><label>TP</label><strong>0</strong></div>
          <div class="mini-metric tn"><label>TN</label><strong>0</strong></div>
          <div class="mini-metric fp"><label>FP</label><strong>0</strong></div>
          <div class="mini-metric fn"><label>FN</label><strong>0</strong></div>
        </div>
        <div class="metric-group">
          <div class="mini-metric rate"><label>准确率</label><strong>--</strong></div>
          <div class="mini-metric rate"><label>精确率</label><strong>--</strong></div>
          <div class="mini-metric rate"><label>召回率</label><strong>--</strong></div>
          <div class="mini-metric rate"><label>F1</label><strong>--</strong></div>
          <div class="mini-metric rate"><label>特异度</label><strong>--</strong></div>
          <div class="mini-metric rate"><label>误报率</label><strong>--</strong></div>
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="select" id="workbenchScene"></select>
          <select class="select" id="workbenchDataset"></select>
          <select class="select" id="workbenchScheme"></select>
          <select class="select"><option>对照角色：质检</option></select>
        </div>
        <div class="toolbar-right">
          <button class="btn primary" id="startAnnotate">开始标注</button>
          <input class="input" id="tableSearch" placeholder="搜索 ID、工单名称、Summary、标注数据">
          <button class="btn">筛选</button>
          <button class="btn">导出</button>
          <button class="icon-btn" title="列设置">⚙</button>
        </div>
      </div>
      <div class="table-shell"><div id="workbenchTable"></div></div>
      <div class="task-strip">
        <div class="task-title">
          <span class="scheme-badge">TASK</span>
          <strong>任务预留</strong>
          <span class="card-meta">第一阶段展示数据</span>
        </div>
        <div class="task-progress-wrap">
          <div class="progress" aria-label="任务进度"><span style="--value:0%"></span></div>
        </div>
        <div class="task-count" id="pageInfo">0 / 0</div>
      </div>
    </div>
    <div class="modal-backdrop" id="rowDetailModal">
      <div class="modal row-detail-modal">
        <div class="modal-head">
          <div>
            <h2 id="rowDetailTitle">行数据详情</h2>
            <p class="card-meta">双击表格行打开，支持查看格式化数据和预留操作。</p>
          </div>
          <button class="icon-btn" id="closeRowDetail">×</button>
        </div>
        <div class="modal-body">
          <div class="row-detail-actions">
            <button class="btn primary">标注</button>
            <button class="btn">编辑</button>
            <button class="btn">分析</button>
            <button class="btn">导出</button>
          </div>
          <pre class="json-view" id="rowDetailJson">{}</pre>
        </div>
      </div>
    </div>
  `;
  bindWorkbenchEvents();
  fillSelectors();
  refreshWorkbench();
}

function bindWorkbenchEvents() {
  document.querySelector("#workbenchScene").addEventListener("change", (event) => {
    state.activeSceneId = event.target.value;
    state.activeDatasetId = "";
    toast("请到数据集与方案管理页加载该场景资源");
  });
  document.querySelector("#workbenchDataset").addEventListener("change", (event) => {
    state.activeDatasetId = event.target.value;
    refreshWorkbench();
  });
  document.querySelector("#workbenchScheme").addEventListener("change", (event) => {
    state.activeSchemeId = event.target.value;
  });
  document.querySelector("#tableSearch").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => refreshWorkbench(), 260);
  });
  document.querySelector("#startAnnotate").addEventListener("click", () => {
    toast("第一阶段已预留标注入口，真实任务在第二阶段接入。");
  });
  document.querySelector("#closeRowDetail").addEventListener("click", closeRowDetail);
  document.querySelector("#rowDetailModal").addEventListener("click", (event) => {
    if (event.target.id === "rowDetailModal") closeRowDetail();
  });
  document.addEventListener("click", handleMoreMenu);
}

function fillSelectors() {
  const scene = document.querySelector("#workbenchScene");
  const dataset = document.querySelector("#workbenchDataset");
  const scheme = document.querySelector("#workbenchScheme");
  if (!scene || !dataset || !scheme) return;
  scene.innerHTML = state.scenes.map((item) => `<option value="${item.id}">场景：${item.name}</option>`).join("") || `<option>暂无场景</option>`;
  dataset.innerHTML = state.datasets.map((item) => `<option value="${item.id}">数据集：${item.name}</option>`).join("") || `<option value="">暂无数据集</option>`;
  scheme.innerHTML = state.schemes.map((item) => `<option value="${item.id}">方案：${item.name}</option>`).join("") || `<option value="">暂无方案</option>`;
  scene.value = state.activeSceneId;
  dataset.value = state.activeDatasetId;
  scheme.value = state.activeSchemeId;
}

export async function refreshWorkbench() {
  const container = document.querySelector("#workbenchTable");
  if (!container) return;
  fillSelectors();
  if (!state.activeDatasetId) {
    if (table) {
      table.destroy();
      table = null;
    }
    container.innerHTML = `<div class="empty" style="height:100%">请先在数据集与方案管理页创建场景并导入 Excel</div>`;
    document.querySelector("#metricTotal").textContent = "0";
    document.querySelector("#pageInfo").textContent = "0 / 0";
    return;
  }
  const search = encodeURIComponent(document.querySelector("#tableSearch")?.value || "");
  const response = await fetch(`/api/datasets/${state.activeDatasetId}/rows?page=1&page_size=50&search=${search}`).then((res) => res.json());
  document.querySelector("#metricTotal").textContent = response.total.toLocaleString();
  document.querySelector("#pageInfo").textContent = `${response.data.length} / ${response.total}`;
  const columns = buildColumns(response.columns.length ? response.columns : defaultColumns);
  if (table) table.destroy();
  table = new Tabulator("#workbenchTable", {
    height: "100%",
    layout: "fitDataStretch",
    movableColumns: true,
    placeholder: "当前数据集没有数据",
    pagination: true,
    paginationMode: "remote",
    paginationSize: 50,
    paginationSizeSelector: [50, 100, 200],
    ajaxURL: `/api/datasets/${state.activeDatasetId}/rows`,
    ajaxParams: () => ({
      page_size: table?.getPageSize?.() || 50,
      search: document.querySelector("#tableSearch")?.value || "",
    }),
    ajaxResponse(url, params, payload) {
      document.querySelector("#metricTotal").textContent = payload.total.toLocaleString();
      document.querySelector("#pageInfo").textContent = `${payload.data.length} / ${payload.total}`;
      return payload;
    },
    rowDblClick(event, row) {
      openRowDetail(row.getData());
    },
    cellDblClick(event, cell) {
      openRowDetail(cell.getRow().getData());
    },
    columns,
  });
  document.querySelector("#workbenchTable").ondblclick = (event) => {
    const rowElement = event.target.closest(".tabulator-row");
    if (!rowElement || !table) return;
    const matchedRow = table.getRows("visible").find((row) => row.getElement() === rowElement);
    if (matchedRow) openRowDetail(matchedRow.getData());
  };
}

function buildColumns(columns) {
  const base = [
    {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      hozAlign: "center",
      headerSort: false,
      width: 46,
      frozen: true,
    },
    ...columns.map((column) => ({
      title: column,
      field: column,
      minWidth: previewColumn(column) ? 180 : 110,
      width: previewColumn(column) ? 220 : undefined,
      hozAlign: "center",
      headerHozAlign: "center",
    })),
    {
      title: "状态",
      field: "状态",
      width: 108,
      frozen: true,
      hozAlign: "center",
      headerHozAlign: "center",
      formatter: (cell) => {
        const value = cell.getValue() || "未标注";
        return `<span class="status-pill ${statusClass(value)}">${value}</span>`;
      },
    },
    {
      title: "操作",
      field: "row_id",
      width: 216,
      frozen: true,
      hozAlign: "center",
      headerHozAlign: "center",
      headerSort: false,
      formatter: () => `
        <div class="row-actions">
          <button class="action-mini primary" data-row-action="annotate">标注</button>
          <button class="action-mini info" data-row-action="view">查看</button>
          <button class="action-mini warning" data-row-action="analyze">分析</button>
          <button class="action-mini more" data-row-more>更多</button>
        </div>
      `,
    },
  ];
  return base;
}

function openRowDetail(rowData) {
  document.querySelector("#rowDetailTitle").textContent = `行数据详情 · ${rowData.ID || rowData.row_id || ""}`;
  document.querySelector("#rowDetailJson").textContent = JSON.stringify(rowData, null, 2);
  document.querySelector("#rowDetailModal").classList.add("open");
}

function closeRowDetail() {
  document.querySelector("#rowDetailModal")?.classList.remove("open");
}

function previewColumn(column) {
  return /API Part|API Order|Summary|标注数据/.test(column);
}

function statusClass(value) {
  return { TP: "tp", TN: "tn", FP: "fp", FN: "fn", 标注中: "running" }[value] || "";
}

function handleMoreMenu(event) {
  const menu = document.querySelector("#rowMoreMenu");
  const more = event.target.closest("[data-row-more]");
  if (more) {
    const rect = more.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(12, rect.right - 96)}px`;
    menu.classList.add("open");
    return;
  }
  if (event.target.closest("#rowMoreMenu")) {
    toast(`已预留${event.target.textContent}操作`);
    menu.classList.remove("open");
    return;
  }
  menu.classList.remove("open");
}
