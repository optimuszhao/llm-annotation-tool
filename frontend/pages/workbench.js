import { api, confirmAction, loadSceneResources, state, toast } from "/assets/app.js";

let table = null;
let tableBuildKey = "";
let refreshToken = 0;
let pendingSource = { sceneId: "", datasetId: "", schemeId: "" };
let pendingResources = { datasets: [], schemes: [] };
let documentMenusBound = false;
let currentTask = null;
let taskEvents = null;
let metricsTimer = 0;
let tableReadyForRealtime = false;
let tableAjaxReadyResolver = null;
let tableScrollStateCleanup = null;
let tableLayoutRepairTimer = null;
let currentDetailRow = null;
let currentDetailMode = "view";
let currentDetailKind = "row";
let currentCellRawValue = null;
let currentCellContent = "";
let currentCellField = "";
let currentCellRowId = "";
let detailEditDirty = false;
let drawerRow = null;
let drawerMode = "view";
let drawerEditDirty = false;
let drawerSelectedColumns = new Set();
let drawerAnalysisHistoryRows = [];
let drawerSelectedAnalysisIds = new Set();
let drawerFullFields = new Set();
let drawerAnalysisRequest = 0;
let drawerAnalysisHistoryRequest = 0;
let drawerAnnotationHistoryRequest = 0;
let drawerResizeCleanup = null;
let drawerAnalysisSplitCleanup = null;
let statusFilters = new Set();
let favoriteOnlyFilter = false;
let rootCauseFilters = { positive: new Set(), negative: new Set() };
let rootCauseSummaryCache = null;
let columnFilter = { column: "", value: "", empty: false };
let activeSort = { column: "", dir: "" };
let availableDatasetColumns = [];
let availableModelResultColumns = [];
let latestFieldMapping = null;
const ROLE_RESULT_KEY = "角色标注结果";
let tableFontSize = normalizeTableFontSize(localStorage.getItem("llm-table-font-size") || "medium");
let columnSettingsOriginalFontSize = tableFontSize;
let tableFocusMode = false;
let distillationCandidates = [];

const tableFontSizeLabels = {
  small: "小",
  medium: "中",
  large: "大",
};

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

const statusOptions = ["未标注", "排队中", "标注中", "TP", "TN", "FP", "FN", "失败", "取消"];
const ANALYSIS_RESULT_COLUMN_PREFIX = "分析结果｜";

function renderAnalysisMethodOptions() {
  const entries = Object.entries(state.analysisMethods || {});
  return entries.map(([key, item]) => {
    const value = item.method_name || key;
    const text = item.name || key;
    return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
  }).join("") || `<option value="default_analysis">默认分析</option>`;
}

function renderDistillationMethodOptions() {
  const entries = Object.entries(state.distillationMethods || {});
  return entries.map(([key, item]) => {
    const value = item.method_name || key;
    const text = item.name || key;
    return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
  }).join("") || `<option value="mock_distill">示例蒸馏</option>`;
}

export function renderWorkbenchPage() {
  document.querySelector("#page-workbench").innerHTML = `
    <div class="workbench-layout workbench-pro">
      <div class="workbench-head">
        <div class="workbench-titleline">
          <button class="workbench-source-title" id="workbenchSourceButton" type="button" title="切换数据集与方案">
            <span class="source-title-kicker">当前数据源</span>
            <span class="source-title-main" id="workbenchTitle">标注工作台</span>
          </button>
        </div>
      </div>

      <div class="metric-strip" aria-label="数据指标">
        <section class="metric-group metric-group-rate" aria-label="准确率板块">
          <div class="metric-panel-name">准确率</div>
          <div class="metric-item rate metric-item-hero" title="算法准确率：整体判断正确比例。公式：(TP + TN) / (TP + TN + FP + FN)。"><span>算法准确率</span><strong id="metricAccuracy">--</strong></div>
          <div class="metric-item rate" title="业务准确率：模型标为是的占比。公式：(TP + FP) / (TP + TN + FP + FN)。"><span>业务准确率</span><strong id="metricFpr">--</strong></div>
          <div class="metric-item rate" title="正确查全率：人工为是的数据中，被模型标为是的比例。公式：TP / (TP + FN)。"><span>正确查全率</span><strong id="metricRecall">--</strong></div>
          <div class="metric-item rate" title="错误查全率：人工为否的数据中，被模型标为否的比例。公式：TN / (TN + FP)。"><span>错误查全率</span><strong id="metricSpecificity">--</strong></div>
          <div class="metric-item rate" title="F1 score：正向判断综合指标。公式：(2 × TP) / (2 × TP + FP + FN)。"><span>F1 score</span><strong id="metricF1">--</strong></div>
        </section>
        <section class="metric-group metric-group-confusion" aria-label="结果数量板块">
          <div class="metric-panel-name">结果数量</div>
          <div class="metric-item primary" title="TP：人工答案为是，模型标注为是。"><span>TP</span><strong id="metricTp">0</strong></div>
          <div class="metric-item primary" title="TN：人工答案为否，模型标注为否。"><span>TN</span><strong id="metricTn">0</strong></div>
          <div class="metric-item primary" title="FP：人工答案为否，模型标注为是。"><span>FP</span><strong id="metricFp">0</strong></div>
          <div class="metric-item primary" title="FN：人工答案为是，模型标注为否。"><span>FN</span><strong id="metricFn">0</strong></div>
        </section>
        <section class="metric-group metric-group-volume" aria-label="任务状态统计板块">
          <div class="metric-panel-name">任务状态</div>
          <div class="metric-item muted" title="当前数据集总行数。"><span>总数</span><strong id="metricTotal">0</strong></div>
          <div class="metric-item muted" title="当前方案下尚未产生标注结果的行数。"><span>未标注</span><strong id="metricUnannotated">0</strong></div>
          <div class="metric-item muted" title="已完成评估的行数，计算公式：TP + TN + FP + FN。"><span>已标注</span><strong id="metricDone">0</strong></div>
          <div class="metric-item muted" title="已创建任务、等待执行的行数。"><span>排队中</span><strong id="metricQueued">0</strong></div>
          <div class="metric-item muted" title="当前正在调用标注方法的行数。"><span>标注中</span><strong id="metricRunning">0</strong></div>
        </section>
      </div>

      <div class="toolbar workbench-toolbar">
        <div class="toolbar-left">
          <label class="checkline">
            <input type="checkbox" id="selectCurrentPage">
            全选当前页
          </label>
          <button class="btn" type="button" id="batchAnnotateButton" disabled>批量标注</button>
          <button class="btn distill-button" type="button" id="modelDistillButton" disabled>知识蒸馏</button>
          <button class="btn primary" type="button" id="fullAnnotateButton">全量标注</button>
        </div>
        <div class="toolbar-right">
          <button class="btn refresh-table-button" type="button" id="refreshTableButton">刷新</button>
          <div class="dropdown-wrap">
            <button class="btn root-cause-filter-button" type="button" id="rootCauseFilterButton" aria-expanded="false">根因分析筛选</button>
            <div class="dropdown-menu root-cause-filter-menu" id="rootCauseFilterMenu" hidden>
              <div class="root-cause-filter-loading">正在读取根因统计...</div>
            </div>
          </div>
          <button class="btn favorite-filter-button" type="button" id="favoriteFilterButton">只看收藏</button>
          <div class="dropdown-wrap">
            <button class="btn status-filter-button" type="button" id="statusFilterButton" aria-expanded="false">状态筛选</button>
            <div class="dropdown-menu status-filter-menu" id="statusFilterMenu" hidden>
              <div class="status-filter-list">
                ${statusOptions.map((status) => `
                  <label>
                    <input type="checkbox" value="${status}">
                    <span>${status}</span>
                  </label>
                `).join("")}
              </div>
              <div class="filter-actions">
                <button type="button" data-status-filter-action="all">全选</button>
                <button type="button" data-status-filter-action="clear">清空</button>
                <button type="button" data-status-filter-action="apply">应用</button>
              </div>
            </div>
          </div>
          <div class="dropdown-wrap">
            <button class="btn" type="button" id="globalMoreButton" aria-expanded="false">更多</button>
            <div class="dropdown-menu" id="globalMoreMenu" hidden>
              <button type="button" data-global-action="batch-analysis">批量分析</button>
              <button type="button" data-global-action="delete-analysis">批量删除分析数据</button>
              <button type="button" data-global-action="favorite">批量添加收藏</button>
              <button type="button" data-global-action="clear-favorite">批量取消收藏</button>
              <hr>
              <button type="button" data-global-action="columns">列设置</button>
              <button type="button" data-global-action="reindex">刷新序号</button>
              <button type="button" data-global-action="stop">停止未完成标注</button>
              <hr>
              <button type="button" data-global-action="export">导出</button>
              <button type="button" data-global-action="delete">删除数据</button>
            </div>
          </div>
        </div>
      </div>

      <div class="table-shell">
        <div id="workbenchTable"></div>
        <div class="table-loading-mask" id="tableLoadingMask" hidden>
          <div class="table-loading-card">
            <span class="table-loading-spinner" aria-hidden="true"></span>
            <strong id="tableLoadingText">正在刷新列表...</strong>
          </div>
        </div>
      </div>
      <div class="column-filter-popover" id="columnFilterPopover" hidden>
        <strong id="columnFilterTitle">列筛选</strong>
        <input class="input" type="search" id="columnFilterInput" placeholder="输入关键词">
        <label class="column-empty-filter">
          <input type="checkbox" id="columnFilterEmpty">
          <span>筛选空值</span>
        </label>
        <div class="filter-actions">
          <button type="button" data-column-filter-action="clear">清空</button>
          <button type="button" data-column-filter-action="apply">应用</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="sourceModalBackdrop">
      <section class="modal source-modal source-modal-v2" role="dialog" aria-modal="true" aria-labelledby="sourceModalTitle">
        <header class="modal-head">
          <div class="source-modal-title-row">
            <p class="eyebrow" id="sourceModalTitle">切换数据源与方案</p>
          </div>
          <button class="icon-btn" type="button" id="sourceModalClose" aria-label="关闭切换弹窗">×</button>
        </header>
        <div class="source-modal-body">
          <div class="source-flow-bar" aria-label="选择流程">
            <span>选择场景</span>
            <i>→</i>
            <span>选择数据源</span>
            <i>→</i>
            <span>选择方案</span>
            <i>→</i>
            <span>刷新表格数据</span>
          </div>
          <div class="source-step-grid">
            <section class="source-step-card">
              <div class="source-option-list" id="sourceSceneList"></div>
            </section>
            <section class="source-step-card">
              <div class="source-option-list" id="sourceDatasetList"></div>
            </section>
            <section class="source-step-card">
              <div class="source-option-list" id="sourceSchemeList"></div>
            </section>
          </div>
        </div>
        <footer class="modal-actions">
          <button class="btn" type="button" id="sourceModalCancel">取消</button>
          <button class="btn primary" type="button" id="sourceApplyButton">应用并刷新表格</button>
        </footer>
      </section>
    </div>

    <div class="modal-backdrop" id="batchAnalysisModal">
      <section class="modal batch-analysis-modal" role="dialog" aria-modal="true" aria-labelledby="batchAnalysisTitle">
        <header class="modal-head">
          <div>
            <p class="eyebrow">批量分析</p>
            <h2 id="batchAnalysisTitle">批量执行分析方法</h2>
            <p class="card-meta">后台会按单线程顺序处理，不显示任务进度。</p>
          </div>
          <button class="icon-btn" type="button" id="batchAnalysisClose" aria-label="关闭批量分析弹窗">×</button>
        </header>
        <div class="batch-analysis-body">
          <label class="batch-analysis-method">
            <span>分析方法</span>
            <select class="select" id="batchAnalysisMethodSelect" aria-label="选择批量分析方法">
              ${renderAnalysisMethodOptions()}
            </select>
          </label>
          <section class="batch-analysis-scope">
            <label>
              <input type="radio" name="batchAnalysisScope" value="all" checked>
              <span>
                <strong>全部分析</strong>
                <em>分析当前数据集下的全部行。</em>
              </span>
            </label>
            <label>
              <input type="radio" name="batchAnalysisScope" value="statuses">
              <span>
                <strong>按状态筛选分析</strong>
                <em>只分析勾选状态的数据行。</em>
              </span>
            </label>
          </section>
          <section class="batch-analysis-status-box" id="batchAnalysisStatusBox" hidden>
            <div class="drawer-field-actions">
              <button type="button" data-batch-status-action="current">使用当前筛选</button>
              <button type="button" data-batch-status-action="all">全选</button>
              <button type="button" data-batch-status-action="clear">清空</button>
            </div>
            <div class="batch-analysis-status-grid" id="batchAnalysisStatusGrid">
              ${statusOptions.map((status) => `
                <label class="drawer-field-chip">
                  <input type="checkbox" value="${status}">
                  <span>${status}</span>
                </label>
              `).join("")}
            </div>
          </section>
          <section class="batch-analysis-warning">
            <strong>执行说明</strong>
            <p>批量分析默认单线程顺序执行；当前没有任务进度条。需要查看某一行是否已有分析结果，请打开该行的“查看”抽屉并切换到“分析”。</p>
            <p>如果当前正在运行多线程标注任务，建议等待标注结束后再启动批量分析，避免同时读写同一批数据。</p>
          </section>
          <footer class="modal-actions">
            <button class="btn" type="button" id="batchAnalysisCancel">取消</button>
            <button class="btn primary" type="button" id="batchAnalysisStart">开始批量分析</button>
          </footer>
        </div>
      </section>
    </div>

    <div class="modal-backdrop" id="modelDistillationModal">
      <section class="modal batch-analysis-modal model-distillation-modal" role="dialog" aria-modal="true" aria-labelledby="modelDistillationTitle">
        <header class="modal-head">
          <div>
            <p class="eyebrow">知识蒸馏</p>
            <h2 id="modelDistillationTitle">知识蒸馏</h2>
            <p class="card-meta">调用后台自定义方法返回列表，经人工判断后快速插入知识库。</p>
          </div>
          <button class="icon-btn" type="button" id="modelDistillationClose" aria-label="关闭知识蒸馏弹窗">×</button>
        </header>
        <div class="batch-analysis-body model-distillation-body">
          <label class="batch-analysis-method">
            <span>蒸馏方法</span>
            <select class="select" id="modelDistillationMethodSelect" aria-label="选择知识蒸馏方法">
              ${renderDistillationMethodOptions()}
            </select>
          </label>
          <section class="batch-analysis-warning">
            <strong>执行说明</strong>
            <p id="modelDistillationHint">已选择 0 行。蒸馏期间请保持弹框打开，完成后可勾选候选知识并写入当前场景知识库。</p>
          </section>
          <section class="model-distillation-result" id="modelDistillationResult">
            <div class="empty">点击“开始蒸馏”后，这里会展示后台返回的候选知识。</div>
          </section>
          <footer class="modal-actions">
            <button class="btn" type="button" id="modelDistillationCancel">取消</button>
            <button class="btn" type="button" id="modelDistillationStart">开始蒸馏</button>
            <button class="btn primary" type="button" id="modelDistillationSave" disabled>加入知识库</button>
          </footer>
        </div>
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
            <button class="btn primary" type="button" id="cellSaveButton">保存修改</button>
            <button class="icon-btn" id="closeRowDetail">×</button>
          </div>
        </div>
        <div class="modal-body cell-detail-body">
          <pre class="json-view cell-detail-view" id="rowDetailJson">{}</pre>
          <textarea class="textarea cell-detail-editor" id="cellDetailEditor" spellcheck="false"></textarea>
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
            <button type="button" data-drawer-mode="result">标注结果</button>
            <button type="button" data-drawer-mode="analysis">分析</button>
          </div>
          <div class="drawer-actions" id="drawerEditActions" hidden>
            <button class="btn" type="button" id="drawerExitEdit" hidden>退出编辑</button>
            <button class="btn primary" type="button" id="drawerSave" hidden>保存</button>
          </div>
          <div class="drawer-actions" id="drawerAnalysisActions" hidden>
            <label class="drawer-analysis-method-select">
              <span>分析方法</span>
              <select class="select" id="drawerAnalysisMethodSelect" aria-label="选择分析方法">
                ${renderAnalysisMethodOptions()}
              </select>
            </label>
            <button class="btn drawer-favorite-button" type="button" id="drawerFavoriteButton" hidden>收藏</button>
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
            <div class="drawer-edit-layout">
              <textarea class="drawer-json-editor" id="drawerEditor" spellcheck="false"></textarea>
              <section class="drawer-edit-analysis-card">
                <div class="drawer-section-title">
                  <strong>最新分析结果</strong>
                  <span id="drawerEditAnalysisStatus">只读预览</span>
                </div>
                <pre class="drawer-json-view" id="drawerEditAnalysisJson">{}</pre>
              </section>
            </div>
          </section>
          <section class="drawer-pane drawer-result-pane" id="drawerResultPane" hidden>
            <div class="drawer-result-layout">
              <section class="drawer-result-card">
                <div class="drawer-section-title">
                  <strong>标注结果</strong>
                  <span id="drawerResultStatus">最新模型返回</span>
                </div>
                <div class="drawer-copy-block">
                  <pre class="drawer-json-view" id="drawerResultJson">{}</pre>
                  <button class="drawer-kv-copy drawer-block-copy" type="button" data-drawer-copy-block="#drawerResultJson" title="复制标注结果" aria-label="复制标注结果">⧉</button>
                </div>
              </section>
              <section class="drawer-result-card">
                <div class="drawer-section-title">
                  <strong>渲染 Prompt</strong>
                  <span id="drawerPromptSize">0 KB</span>
                </div>
                <div class="drawer-copy-block">
                  <div class="drawer-prompt-view" id="drawerPromptText">暂无 Prompt</div>
                  <button class="drawer-kv-copy drawer-block-copy" type="button" data-drawer-copy-block="#drawerPromptText" title="复制渲染 Prompt" aria-label="复制渲染 Prompt">⧉</button>
                </div>
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
              <div class="drawer-split-resizer" id="drawerAnalysisSplitResizer" role="separator" aria-label="拖动调整原始数据和分析结果宽度"></div>
              <section class="drawer-analysis-card">
                <div class="drawer-section-title">
                  <strong>分析结果</strong>
                  <div class="drawer-field-filter">
                    <button class="btn" type="button" id="drawerAnalysisResultFilterButton">显示结果</button>
                    <div class="drawer-field-popover drawer-analysis-result-popover" id="drawerAnalysisResultPopover" hidden>
                      <div class="drawer-field-actions">
                        <button type="button" data-analysis-result-action="all">全选</button>
                        <button type="button" data-analysis-result-action="latest">最新</button>
                        <button type="button" data-analysis-result-action="clear">清空</button>
                      </div>
                      <div class="drawer-field-grid" id="drawerAnalysisResultGrid"></div>
                    </div>
                  </div>
                </div>
                <div class="drawer-analysis-status" id="drawerAnalysisStatus">未分析</div>
                <div class="drawer-analysis-results" id="drawerAnalysisResults"></div>
              </section>
            </div>
          </section>
        </div>
      </aside>
    </div>

    <div class="modal-backdrop" id="columnSettingsModal">
      <div class="modal modal-wide column-settings-modal">
        <div class="modal-head">
          <div>
            <h2>列设置</h2>
            <p class="card-meta">配置当前场景默认渲染在工作台列表中的列。</p>
          </div>
          <button class="icon-btn" id="closeColumnSettings">×</button>
        </div>
        <div class="modal-body">
          <div class="column-settings-toolbar">
            <div class="mapping-title">
              <div>
                <strong>默认渲染列</strong>
                <span>保存后同步到字段映射配置。</span>
              </div>
            </div>
            <div class="column-settings-toolbar-actions">
              <div class="table-font-setting" aria-label="列表字体大小">
                <strong>列表字体</strong>
                <div class="table-font-segment" id="tableFontSizeSegment">
                  <label>
                    <input type="radio" name="tableFontSize" value="small">
                    <span>小</span>
                  </label>
                  <label>
                    <input type="radio" name="tableFontSize" value="medium">
                    <span>中</span>
                  </label>
                  <label>
                    <input type="radio" name="tableFontSize" value="large">
                    <span>大</span>
                  </label>
                </div>
              </div>
              <div class="mapping-actions">
                <button type="button" id="selectAllColumns">全选</button>
                <button type="button" id="clearAllColumns">全不选</button>
              </div>
            </div>
          </div>
          <div class="column-chip-grid compact" id="columnSettingsGrid"></div>
          <div class="column-settings-loading" id="columnSettingsLoading" hidden>
            <span class="loading-spinner" aria-hidden="true"></span>
            <strong>正在加载列信息</strong>
            <em>正在同步 Excel 列、标注返回列和字段映射配置...</em>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" id="cancelColumnSettings">取消</button>
            <button class="btn primary" type="button" id="saveColumnSettings">保存列设置</button>
          </div>
        </div>
      </div>
    </div>

  `;
  bindWorkbenchEvents();
}

function bindWorkbenchEvents() {
  document.querySelector("#workbenchSourceButton").addEventListener("click", openSourceModal);
  document.querySelector("#sourceModalClose").addEventListener("click", closeSourceModal);
  document.querySelector("#sourceModalCancel").addEventListener("click", closeSourceModal);
  document.querySelector("#sourceApplyButton").addEventListener("click", applySourceModal);
  document.querySelector("#batchAnalysisClose").addEventListener("click", closeBatchAnalysisModal);
  document.querySelector("#batchAnalysisCancel").addEventListener("click", closeBatchAnalysisModal);
  document.querySelector("#batchAnalysisModal").addEventListener("click", (event) => {
    if (event.target.id === "batchAnalysisModal") closeBatchAnalysisModal();
  });
  document.querySelectorAll('input[name="batchAnalysisScope"]').forEach((input) => {
    input.addEventListener("change", syncBatchAnalysisScope);
  });
  document.querySelector("#batchAnalysisStatusBox").addEventListener("click", handleBatchAnalysisStatusActions);
  document.querySelector("#batchAnalysisStart").addEventListener("click", startBatchAnalysis);
  document.querySelector("#modelDistillationClose").addEventListener("click", closeModelDistillationModal);
  document.querySelector("#modelDistillationCancel").addEventListener("click", closeModelDistillationModal);
  document.querySelector("#modelDistillationModal").addEventListener("click", (event) => {
    if (event.target.id === "modelDistillationModal") closeModelDistillationModal();
  });
  document.querySelector("#modelDistillationStart").addEventListener("click", startModelDistillation);
  document.querySelector("#modelDistillationSave").addEventListener("click", saveDistillationKnowledge);
  document.querySelector("#modelDistillationResult").addEventListener("change", syncDistillationSaveButton);
  document.querySelector("#sourceModalBackdrop").addEventListener("click", handleSourceModalClick);
  document.querySelector("#refreshTableButton").addEventListener("click", refreshTableData);
  document.querySelector("#rootCauseFilterButton").addEventListener("click", (event) => {
    toggleRootCauseFilterMenu(event.currentTarget);
  });
  document.querySelector("#rootCauseFilterMenu").addEventListener("click", handleRootCauseFilterMenuClick);
  document.querySelector("#favoriteFilterButton").addEventListener("click", toggleFavoriteFilter);
  document.querySelector("#tableFocusButton").addEventListener("click", toggleTableFocusMode);
  document.querySelector("#columnFilterPopover").addEventListener("click", handleColumnFilterPopoverClick);
  document.querySelector("#columnFilterInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyColumnFilter();
    if (event.key === "Escape") closeMenus();
  });
  document.querySelector("#statusFilterButton").addEventListener("click", (event) => {
    toggleStatusFilterMenu(event.currentTarget);
  });
  document.querySelector("#statusFilterMenu").addEventListener("click", handleStatusFilterMenuClick);
  document.querySelector("#selectCurrentPage").addEventListener("change", (event) => {
    selectVisibleRows(event.target.checked);
  });
  document.querySelector("#batchAnnotateButton").addEventListener("click", () => {
    startAnnotationTask("selected");
  });
  document.querySelector("#modelDistillButton").addEventListener("click", openModelDistillationModal);
  document.querySelector("#fullAnnotateButton").addEventListener("click", () => {
    startAnnotationTask(hasActiveWorkbenchFilters() ? "filtered" : "all");
  });
  document.querySelector("#globalMoreButton").addEventListener("click", (event) => {
    toggleGlobalMenu(event.currentTarget);
  });
  document.querySelector("#globalMoreMenu").addEventListener("click", (event) => {
    const action = event.target.closest("[data-global-action]")?.dataset.globalAction;
    if (!action) return;
    if (action === "stop") {
      stopCurrentTask();
    } else if (action === "batch-analysis") {
      openBatchAnalysisModal();
    } else if (action === "delete-analysis") {
      deleteBatchAnalysisData();
    } else if (action === "favorite") {
      favoriteRows(true);
    } else if (action === "clear-favorite") {
      favoriteRows(false);
    } else if (action === "delete") {
      deleteSelectedRows();
    } else if (action === "export") {
      exportDataset();
    } else if (action === "columns") {
      openColumnSettings();
    } else if (action === "reindex") {
      reindexRows();
    } else {
      toast(`已预留${event.target.textContent}操作`);
    }
    closeMenus();
  });
  document.querySelector("#closeRowDetail").addEventListener("click", closeRowDetail);
  document.querySelector("#cellFormatButton").addEventListener("click", formatCellJsonContent);
  document.querySelector("#cellCopyButton").addEventListener("click", copyCellDetailContent);
  document.querySelector("#cellSaveButton").addEventListener("click", saveCellDetailValue);
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
  document.querySelector("#drawerFavoriteButton").addEventListener("click", toggleDrawerFavorite);
  document.querySelector("#drawerEditor").addEventListener("input", markDrawerDirty);
  document.querySelector("#drawerFieldFilterButton").addEventListener("click", toggleDrawerFieldPopover);
  document.querySelector("#drawerFieldPopover").addEventListener("click", handleDrawerFieldPopoverClick);
  document.querySelector("#drawerAnalysisResultFilterButton").addEventListener("click", toggleDrawerAnalysisResultPopover);
  document.querySelector("#drawerAnalysisResultPopover").addEventListener("click", handleDrawerAnalysisResultPopoverClick);
  document.querySelector("#rowDetailDrawer").addEventListener("click", handleDrawerKvToggle);
  document.querySelector("#drawerResizer").addEventListener("pointerdown", startDrawerResize);
  document.querySelector("#drawerAnalysisSplitResizer").addEventListener("pointerdown", startDrawerAnalysisSplitResize);
  document.querySelector("#closeColumnSettings").addEventListener("click", closeColumnSettings);
  document.querySelector("#cancelColumnSettings").addEventListener("click", closeColumnSettings);
  document.querySelector("#columnSettingsModal").addEventListener("click", (event) => {
    if (event.target.id === "columnSettingsModal") closeColumnSettings();
  });
  document.querySelector("#selectAllColumns").addEventListener("click", () => setColumnSettingsChecked(true));
  document.querySelector("#clearAllColumns").addEventListener("click", () => setColumnSettingsChecked(false));
  document.querySelector("#saveColumnSettings").addEventListener("click", saveColumnSettings);
  document.querySelector("#tableFontSizeSegment").addEventListener("change", handleTableFontSizeChange);
  applyTableFontSize();
  applyTableFocusMode();
  if (!documentMenusBound) {
    document.addEventListener("pointerdown", stopRowActionPropagation, true);
    document.addEventListener("pointerdown", stopColumnFilterHeaderEvents, true);
    document.addEventListener("pointerdown", stopColumnSortHeaderEvents, true);
    document.addEventListener("click", handleRowActionClick, true);
    document.addEventListener("click", handleMoreMenu);
    document.addEventListener("click", handleColumnFilterClick, true);
    document.addEventListener("click", handleColumnSortClick, true);
    document.addEventListener("click", handleCompactPaginationClick);
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
  const token = ++refreshToken;
  const horizontalScroll = getTableHorizontalScroll();
  showTableLoading("正在刷新列表...");
  try {
    await refreshWorkbenchInner(token, horizontalScroll);
  } finally {
    if (token === refreshToken) hideTableLoading();
  }
}

async function refreshWorkbenchInner(token, horizontalScroll = 0) {
  const container = document.querySelector("#workbenchTable");
  if (!container) return;
  updateWorkbenchTitle();
  closeTaskEvents();
  tableReadyForRealtime = false;
  if (!state.activeDatasetId) {
    if (table) {
      if (tableScrollStateCleanup) {
        tableScrollStateCleanup();
        tableScrollStateCleanup = null;
      }
      clearTableLayoutRepair();
      table.destroy();
      table = null;
      tableBuildKey = "";
    }
    container.innerHTML = `<div class="empty" style="height:100%">请先在数据集与方案管理页创建场景并导入 Excel</div>`;
    document.querySelector("#metricTotal").textContent = "0";
    await refreshMetrics();
    syncFullAnnotateButton();
    setBatchButtonState();
    return;
  }
  const response = await api(`/api/datasets/${state.activeDatasetId}/rows?${buildRowsQuery(1, table?.getPageSize?.() || 20)}`);
  if (token !== refreshToken) return;
  document.querySelector("#metricTotal").textContent = response.total.toLocaleString();
  availableDatasetColumns = response.columns.length ? response.columns : defaultColumns;
  availableModelResultColumns = Array.isArray(response.model_result_columns) ? response.model_result_columns : [];
  fillSearchColumnOptions(allConfigurableColumns());
  const visibleColumns = await resolveVisibleColumns(allConfigurableColumns());
  const columns = buildColumns(visibleColumns, response.data || []);
  const pageButtonCount = paginationButtonCountFor(response.last_page);
  const nextBuildKey = [
    state.activeDatasetId,
    state.activeSceneId,
    state.activeSchemeId,
    visibleColumns.join("\u001f"),
    fixedMappingColumns(allConfigurableColumns()).join("\u001f"),
    pageButtonCount,
    `${columnFilter.column}\u001f${columnFilter.value}\u001f${columnFilter.empty ? "empty" : ""}`,
    rootCauseFilterKey(),
    workbenchFilterKey(),
  ].join("\u001e");
  if (table && tableBuildKey === nextBuildKey) {
    const tableReady = waitForNextTableAjax();
    await reloadCurrentTableData();
    await tableReady;
    if (token !== refreshToken) return;
    bindTableScrollState();
    restoreTableHorizontalScroll(horizontalScroll);
    syncRightFrozenColumns();
    updateSortButtons();
    await refreshMetrics();
    syncStatusFilterMenu();
    syncRootCauseFilterButton();
    syncFavoriteFilterButton();
    syncFullAnnotateButton();
    setBatchButtonState();
    await loadLatestTask();
    return;
  }
  if (tableScrollStateCleanup) {
    tableScrollStateCleanup();
    tableScrollStateCleanup = null;
  }
  clearTableLayoutRepair();
  if (table) table.destroy();
  tableBuildKey = nextBuildKey;
  const tableReady = waitForNextTableAjax();
  table = new Tabulator("#workbenchTable", {
    height: "100%",
    renderHorizontal: "virtual",
    layout: "fitColumns",
    movableColumns: true,
    nestedFieldSeparator: false,
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
    sortMode: "remote",
    paginationCounter(pageSize, currentRow, currentPage, totalRows, totalPages) {
      const safePageSize = Number(pageSize || table?.getPageSize?.() || 20) || 20;
      const safeTotal = Number(totalRows || 0) || 0;
      const safePage = Number(currentPage || table?.getPage?.() || 1) || 1;
      const safePages = Number(totalPages || Math.max(Math.ceil(safeTotal / safePageSize), 1)) || 1;
      return `第 ${safePage} / ${safePages} 页 · 共 ${safeTotal.toLocaleString()} 条`;
    },
    paginationSize: 20,
    paginationSizeSelector: [20, 50, 100, 200],
    paginationButtonCount: pageButtonCount,
    dataReceiveParams: {
      data: "data",
      last_page: "last_page",
    },
    selectableRows: "highlight",
    index: "row_id",
    rowHeight: 42,
    columnDefaults: {
      hozAlign: "center",
      headerHozAlign: "center",
      vertAlign: "middle",
    },
    ajaxURL: `/api/datasets/${state.activeDatasetId}/rows`,
    ajaxURLGenerator(url, config, params) {
      return `${url}?${buildRowsQuery(params.page || 1, params.size || table?.getPageSize?.() || 20, params)}`;
    },
    ajaxResponse(url, params, payload) {
      document.querySelector("#metricTotal").textContent = payload.total.toLocaleString();
      if (Array.isArray(payload.columns)) {
        availableDatasetColumns = payload.columns.length ? payload.columns : availableDatasetColumns;
        availableModelResultColumns = Array.isArray(payload.model_result_columns) ? payload.model_result_columns : availableModelResultColumns;
        fillSearchColumnOptions(allConfigurableColumns());
      }
      scheduleCompactPagination();
      refreshMetrics();
      syncFullAnnotateButton();
      setBatchButtonState();
      resolveTableAjaxReady();
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
  table.on?.("pageLoaded", () => {
    scheduleCompactPagination();
    window.requestAnimationFrame(syncRightFrozenColumns);
  });
  table.on?.("dataLoaded", () => {
    scheduleCompactPagination();
    window.requestAnimationFrame(syncRightFrozenColumns);
  });
  document.querySelector("#workbenchTable").ondblclick = handleTableCellDoubleClick;
  await tableReady;
  if (token !== refreshToken) return;
  bindTableScrollState();
  restoreTableHorizontalScroll(horizontalScroll);
  updateSortButtons();
  scheduleCompactPagination();
  tableReadyForRealtime = true;
  await refreshMetrics();
  syncStatusFilterMenu();
  syncRootCauseFilterButton();
  syncFavoriteFilterButton();
  syncFullAnnotateButton();
  setBatchButtonState();
  await loadLatestTask();
}

function showTableLoading(message = "正在刷新列表...") {
  const mask = document.querySelector("#tableLoadingMask");
  const text = document.querySelector("#tableLoadingText");
  if (!mask) return;
  if (text) text.textContent = message;
  mask.hidden = false;
  window.requestAnimationFrame(() => mask.classList.add("open"));
}

function hideTableLoading() {
  const mask = document.querySelector("#tableLoadingMask");
  if (!mask) return;
  mask.classList.remove("open");
  window.setTimeout(() => {
    if (!mask.classList.contains("open")) mask.hidden = true;
  }, 160);
}

function paginationButtonCountFor(lastPage) {
  const pageCount = Number(lastPage || 1) || 1;
  if (pageCount <= 1) return 1;
  return Math.min(pageCount, 9);
}

function scheduleCompactPagination() {
  window.requestAnimationFrame(() => window.requestAnimationFrame(renderCompactPagination));
}

function renderCompactPagination() {
  if (!table) return;
  const pagesNode = document.querySelector("#workbenchTable .tabulator-pages");
  if (!pagesNode) return;
  const currentPage = Number(table.getPage?.() || 1) || 1;
  const maxPage = Number(table.getPageMax?.() || 1) || 1;
  const items = compactPaginationItems(currentPage, maxPage);
  pagesNode.classList.add("compact-pagination-pages");
  pagesNode.innerHTML = items.map((item) => {
    if (item === "...") return `<span class="tabulator-page-ellipsis" aria-hidden="true">...</span>`;
    const page = Number(item);
    const active = page === currentPage ? " active" : "";
    return `<button class="tabulator-page compact-pagination-button${active}" type="button" role="button" aria-label="第 ${page} 页" title="第 ${page} 页" data-compact-page="${page}">${page}</button>`;
  }).join("");
}

function compactPaginationItems(currentPage, maxPage) {
  if (maxPage <= 9) return Array.from({ length: maxPage }, (_, index) => index + 1);
  const pages = new Set([1, maxPage]);
  const start = Math.max(2, currentPage - 2);
  const end = Math.min(maxPage - 1, currentPage + 2);
  for (let page = start; page <= end; page += 1) pages.add(page);
  if (currentPage <= 4) {
    for (let page = 2; page <= 6; page += 1) pages.add(page);
  }
  if (currentPage >= maxPage - 3) {
    for (let page = maxPage - 5; page <= maxPage - 1; page += 1) {
      if (page > 1) pages.add(page);
    }
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (const page of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1) result.push("...");
    result.push(page);
  }
  return result;
}

async function handleCompactPaginationClick(event) {
  const button = event.target.closest("[data-compact-page]");
  if (!button || !table) return;
  event.preventDefault();
  event.stopPropagation();
  const page = Number(button.dataset.compactPage || 1) || 1;
  const currentPage = Number(table.getPage?.() || 1) || 1;
  if (page === currentPage) return;
  await table.setPage?.(page);
  scheduleCompactPagination();
}

function getTableHolder() {
  return document.querySelector("#workbenchTable .tabulator-tableholder");
}

function getTableHorizontalScroll() {
  return getTableHolder()?.scrollLeft || 0;
}

function restoreTableHorizontalScroll(scrollLeft = 0) {
  if (!scrollLeft) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const holder = getTableHolder();
      if (holder) {
        holder.scrollLeft = scrollLeft;
        syncRightFrozenColumns();
      }
    });
  });
}

function bindTableScrollState() {
  if (tableScrollStateCleanup) {
    tableScrollStateCleanup();
    tableScrollStateCleanup = null;
  }
  const holder = getTableHolder();
  if (!holder) return;
  const onScroll = () => syncRightFrozenColumns();
  holder.addEventListener("scroll", onScroll, { passive: true });
  tableScrollStateCleanup = () => holder.removeEventListener("scroll", onScroll);
  syncRightFrozenColumns();
}

function syncRightFrozenColumns() {
  const root = document.querySelector("#workbenchTable");
  const holder = getTableHolder();
  if (!root || !holder) return;
  const maxScrollLeft = Math.max(0, holder.scrollWidth - holder.clientWidth);
  const remainingRight = Math.max(0, maxScrollLeft - holder.scrollLeft);
  const statusWidth = document.querySelector('#workbenchTable .tabulator-col[tabulator-field="状态"]')?.getBoundingClientRect?.().width || 88;
  const correction = Math.max(0, Math.min(statusWidth, statusWidth - remainingRight));
  root.style.setProperty("--right-frozen-correction", `${correction.toFixed(2)}px`);
  root.classList.toggle("table-scroll-at-right-edge", correction > 0.5);
}

function scheduleTableLayoutRepair(delay = 80) {
  window.clearTimeout(tableLayoutRepairTimer);
  tableLayoutRepairTimer = window.setTimeout(() => {
    if (!table) return;
    const scrollLeft = getTableHorizontalScroll();
    try {
      table.redraw?.(true);
    } catch {
      // 表格切页或销毁过程中无需处理。
    }
    restoreTableHorizontalScroll(scrollLeft);
    window.requestAnimationFrame(syncRightFrozenColumns);
  }, delay);
}

function clearTableLayoutRepair() {
  window.clearTimeout(tableLayoutRepairTimer);
  tableLayoutRepairTimer = null;
}

async function reloadCurrentTableData() {
  if (!table) return;
  tableReadyForRealtime = false;
  try {
    const currentPage = Number(table.getPage?.() || 1);
    let result = null;
    if (currentPage !== 1 && typeof table.setPage === "function") {
      result = table.setPage(1);
    } else if (typeof table.replaceData === "function") {
      result = table.replaceData();
    } else if (typeof table.setData === "function") {
      result = table.setData();
    }
    if (result && typeof result.then === "function") await result;
  } finally {
    tableReadyForRealtime = true;
    scheduleTableLayoutRepair(0);
  }
}

function waitForNextTableAjax(timeout = 6000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (tableAjaxReadyResolver === finish) tableAjaxReadyResolver = null;
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    };
    const timer = window.setTimeout(finish, timeout);
    tableAjaxReadyResolver = finish;
  });
}

function resolveTableAjaxReady() {
  tableAjaxReadyResolver?.();
}

function buildColumns(columns, sampleRows = []) {
  return [
    {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      hozAlign: "center",
      headerSort: false,
      width: 48,
      frozen: true,
    },
    {
      title: "序号",
      titleFormatter: () => rowIndexHeaderHtml(),
      field: "display_index",
      hozAlign: "center",
      headerHozAlign: "center",
      headerSort: false,
      width: 64,
      minWidth: 64,
      maxWidth: 64,
      resizable: false,
      frozen: true,
      cssClass: "row-index-cell",
      formatter: (cell) => `<span class="row-index-pill">${escapeHtml(cell.getValue() || "-")}</span>`,
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
      titleFormatter: () => `<span class="fixed-header-title">状态</span>`,
      width: 88,
      minWidth: 88,
      maxWidth: 88,
      resizable: false,
      widthGrow: 0,
      widthShrink: 0,
      frozen: true,
      headerSort: false,
      formatter: (cell) => {
        const value = cell.getValue() || "未标注";
        return formatStatusPill(value);
      },
    },
    {
      title: "操作",
      field: "row_id",
      width: 204,
      minWidth: 204,
      maxWidth: 204,
      resizable: false,
      widthGrow: 0,
      widthShrink: 0,
      headerSort: false,
      frozen: true,
      formatter: (cell) => {
        const rowData = cell.getData();
        const rowId = rowData.row_id || "";
        const annotateButton = annotationButtonMeta(rowData["状态"]);
        const favoriteButton = favoriteButtonMeta(rowData);
        const annotateDisabled = annotateButton.disabled ? "disabled aria-disabled=\"true\"" : "";
        return `
          <div class="row-actions">
            <button class="action-mini ${annotateButton.className}" data-row-action="annotate" data-row-id="${rowId}" ${annotateDisabled}>${annotateButton.label}</button>
            <button class="action-mini info" data-row-action="view" data-row-id="${rowId}">查看</button>
            <button class="action-mini ${favoriteButton.className}" data-row-action="favorite" data-row-id="${rowId}">${favoriteButton.label}</button>
            <button class="action-mini more" data-row-more data-row-id="${rowId}" aria-label="更多操作" aria-expanded="false">⋯</button>
          </div>
        `;
      },
    },
  ];
}

function buildRowsQuery(page, pageSize, tableParams = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  params.set("search", columnFilter.value || "");
  params.set("search_column", columnFilter.column || "");
  if (columnFilter.empty) params.set("empty", "true");
  if (state.activeSchemeId) params.set("scheme_id", state.activeSchemeId);
  rootCauseFilters.positive.forEach((value) => params.append("root_cause_positive", value));
  rootCauseFilters.negative.forEach((value) => params.append("root_cause_negative", value));
  statusFilters.forEach((status) => params.append("statuses", status));
  if (favoriteOnlyFilter) params.set("favorite", "true");
  if (activeSort.column) {
    params.set("sort_field", activeSort.column);
    params.set("sort_dir", activeSort.dir || "asc");
  }
  return params.toString();
}

function buildAnnotationFilterPayload() {
  return {
    search: columnFilter.value || "",
    search_column: columnFilter.column || "",
    empty: Boolean(columnFilter.empty),
    statuses: [...statusFilters],
    favorite: Boolean(favoriteOnlyFilter),
    root_cause_positive: [...rootCauseFilters.positive],
    root_cause_negative: [...rootCauseFilters.negative],
  };
}

function hasActiveWorkbenchFilters() {
  return Boolean(
    columnFilter.column && (columnFilter.value || columnFilter.empty)
  ) || statusFilters.size > 0 || favoriteOnlyFilter || rootCauseFilterCount() > 0;
}

function workbenchFilterKey() {
  const payload = buildAnnotationFilterPayload();
  return [
    `${payload.search_column}\u001f${payload.search}\u001f${payload.empty ? "empty" : ""}`,
    payload.statuses.slice().sort().join(","),
    payload.favorite ? "favorite" : "",
    payload.root_cause_positive.slice().sort().join(","),
    payload.root_cause_negative.slice().sort().join(","),
  ].join("\u001e");
}

function syncFullAnnotateButton() {
  const button = document.querySelector("#fullAnnotateButton");
  if (!button) return;
  button.textContent = hasActiveWorkbenchFilters() ? "全量标注(已筛选)" : "全量标注";
}

function schemeQuery(prefix = "?") {
  return state.activeSchemeId ? `${prefix}scheme_id=${encodeURIComponent(state.activeSchemeId)}` : "";
}

function fillSearchColumnOptions(columns) {
  if (columnFilter.column && !["状态", "display_index", ...columns].includes(columnFilter.column)) {
    columnFilter = { column: "", value: "", empty: false };
  }
  if (activeSort.column && !columns.includes(activeSort.column)) {
    activeSort = { column: "", dir: "" };
  }
}

function allConfigurableColumns() {
  return uniqueColumns([...(availableDatasetColumns || []), ...(availableModelResultColumns || [])]);
}

function uniqueColumns(columns) {
  const seen = new Set();
  const result = [];
  for (const column of columns || []) {
    if (!column || seen.has(column)) continue;
    seen.add(column);
    result.push(column);
  }
  return result;
}

async function resolveVisibleColumns(columns) {
  if (!state.activeSceneId) return columns;
  try {
    latestFieldMapping = await api(`/api/field-mapping?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    const visible = latestFieldMapping.visible_columns || [];
    if (!visible.length) return prioritizeMappingColumns(columns);
    const visibleSet = new Set([...visible, ...fixedMappingColumns(columns)]);
    const nextColumns = columns.filter((column) => visibleSet.has(column));
    return prioritizeMappingColumns(nextColumns.length ? nextColumns : columns);
  } catch {
    latestFieldMapping = null;
    return columns;
  }
}

function prioritizeMappingColumns(columns) {
  const fixed = fixedMappingColumns(columns);
  return [...fixed, ...columns.filter((column) => !fixed.includes(column))];
}

function fixedMappingColumns(columns = allConfigurableColumns()) {
  const selected = [
    latestFieldMapping?.human_answer_column,
    latestFieldMapping?.model_answer_column,
  ].filter(Boolean);
  return [...new Set(selected)].filter((column) => columns.includes(column));
}

function updateWorkbenchTitle() {
  const scene = state.scenes.find((item) => item.id === state.activeSceneId);
  const dataset = state.datasets.find((item) => item.id === state.activeDatasetId);
  const scheme = state.schemes.find((item) => item.id === state.activeSchemeId);
  const title = [
    dataset?.name || "未选择数据集",
    scheme?.name || "未选择方案",
  ].join(" · ");
  document.querySelector("#workbenchTitle").textContent = title;
  const sourceButton = document.querySelector("#workbenchSourceButton");
  if (sourceButton) sourceButton.title = `切换数据源与方案：${scene?.name || "未选择场景"} · ${title}`;
}

async function openSourceModal() {
  await refreshSourceScenes();
  pendingSource = {
    sceneId: state.activeSceneId || state.scenes[0]?.id || "",
    datasetId: state.activeDatasetId || "",
    schemeId: state.activeSchemeId || "",
  };
  await loadPendingResources(pendingSource.sceneId);
  pendingSource.datasetId = validResourceId(pendingResources.datasets, pendingSource.datasetId);
  pendingSource.schemeId = validResourceId(pendingResources.schemes, pendingSource.schemeId);
  fillSourceModalOptions();
  document.querySelector("#sourceModalBackdrop").classList.add("open");
}

function closeSourceModal() {
  document.querySelector("#sourceModalBackdrop").classList.remove("open");
}

async function handleSourceModalClick(event) {
  if (event.target.id === "sourceModalBackdrop") {
    closeSourceModal();
    return;
  }
  const option = event.target.closest("[data-source-type]");
  if (!option) return;
  const type = option.dataset.sourceType;
  const id = option.dataset.sourceId || "";
  if (type === "scene") {
    if (pendingSource.sceneId === id) return;
    pendingSource.sceneId = id;
    await loadPendingResources(pendingSource.sceneId);
    pendingSource.datasetId = validResourceId(pendingResources.datasets, "");
    pendingSource.schemeId = validResourceId(pendingResources.schemes, "");
    fillSourceModalOptions();
    return;
  }
  if (type === "dataset") {
    pendingSource.datasetId = id;
    fillSourceModalOptions();
    return;
  }
  if (type === "scheme") {
    pendingSource.schemeId = id;
    fillSourceModalOptions();
  }
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

async function refreshSourceScenes() {
  try {
    state.scenes = await api("/api/scenes");
    if (!state.scenes.some((scene) => scene.id === state.activeSceneId)) {
      state.activeSceneId = state.scenes[0]?.id || "";
      state.activeDatasetId = "";
      state.activeSchemeId = "";
      await loadSceneResources();
    }
  } catch (error) {
    toast(error.message);
  }
}

function validResourceId(items, preferredId) {
  if (preferredId && items.some((item) => item.id === preferredId)) return preferredId;
  return items[0]?.id || "";
}

function fillSourceModalOptions() {
  document.querySelector("#sourceSceneList").innerHTML = sourceOptionListHtml(
    "scene",
    state.scenes,
    pendingSource.sceneId,
    "暂无场景，请先到数据集与方案管理页创建场景。",
  );
  document.querySelector("#sourceDatasetList").innerHTML = sourceOptionListHtml(
    "dataset",
    pendingResources.datasets,
    pendingSource.datasetId,
    "当前场景暂无数据集。",
  );
  document.querySelector("#sourceSchemeList").innerHTML = sourceOptionListHtml(
    "scheme",
    pendingResources.schemes,
    pendingSource.schemeId,
    "当前场景暂无标注方案。",
  );
  updateSourcePreview();
}

function sourceOptionListHtml(type, items, selectedId, emptyText) {
  if (!items.length) return `<div class="empty source-empty">${emptyText}</div>`;
  return items.map((item) => {
    const selected = item.id === selectedId;
    return `
      <button class="source-option-card ${selected ? "active" : ""}" type="button" data-source-type="${type}" data-source-id="${escapeHtml(item.id)}">
        <span class="source-option-copy">
          <strong>${escapeHtml(item.name || item.id)}</strong>
          <em>${escapeHtml(sourceOptionMeta(type, item))}</em>
        </span>
      </button>
    `;
  }).join("");
}

function sourceOptionMeta(type, item) {
  if (type === "scene") return item.description || item.created_at || "资源隔离场景";
  if (type === "dataset") {
    const rows = Number(item.row_count || item.total_rows || item.rows || 0);
    return rows ? `${rows.toLocaleString()} 行数据` : item.created_at || "Excel 数据集";
  }
  if (type === "scheme") {
    const model = item.model_key || item.method_name || item.annotation_method_name || "";
    const concurrency = item.concurrency ? `并发 ${item.concurrency}` : "";
    return [model, concurrency].filter(Boolean).join(" · ") || item.created_at || "标注方案";
  }
  return "";
}

function updateSourcePreview() {
  const title = document.querySelector("#sourceModalTitle");
  if (title) title.textContent = "切换数据源与方案";
}

async function applySourceModal() {
  const nextSceneId = pendingSource.sceneId;
  if (!nextSceneId) {
    toast("请先选择场景");
    return;
  }
  await loadPendingResources(nextSceneId);
  const nextDatasetId = validResourceId(pendingResources.datasets, pendingSource.datasetId);
  const nextSchemeId = validResourceId(pendingResources.schemes, pendingSource.schemeId);
  const changed = state.activeSceneId !== nextSceneId
    || state.activeDatasetId !== nextDatasetId
    || state.activeSchemeId !== nextSchemeId;
  state.activeSceneId = nextSceneId;
  state.activeDatasetId = nextDatasetId;
  state.activeSchemeId = nextSchemeId;
  await loadSceneResources();
  state.activeDatasetId = validResourceId(state.datasets, nextDatasetId);
  state.activeSchemeId = validResourceId(state.schemes, nextSchemeId);
  await saveWorkbenchSourcePreference();
  if (changed) resetWorkbenchQueryState();
  closeTaskEvents();
  currentTask = null;
  closeSourceModal();
  await refreshWorkbench();
  toast("数据源与方案已切换");
}

async function saveWorkbenchSourcePreference() {
  try {
    await api("/api/preferences/workbench-source", {
      method: "PUT",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        dataset_id: state.activeDatasetId,
        scheme_id: state.activeSchemeId,
      }),
    });
  } catch (error) {
    toast(`数据源偏好保存失败：${error.message}`);
  }
}

function resetWorkbenchQueryState() {
  statusFilters = new Set();
  favoriteOnlyFilter = false;
  rootCauseFilters = { positive: new Set(), negative: new Set() };
  rootCauseSummaryCache = null;
  columnFilter = { column: "", value: "", empty: false };
  syncFavoriteFilterButton();
  syncRootCauseFilterButton();
  syncFullAnnotateButton();
  const selectCurrentPage = document.querySelector("#selectCurrentPage");
  if (selectCurrentPage) selectCurrentPage.checked = false;
  tableBuildKey = "";
}

function openBatchAnalysisModal() {
  if (!state.activeDatasetId) {
    toast("请先选择数据集");
    return;
  }
  const modal = document.querySelector("#batchAnalysisModal");
  const methodSelect = document.querySelector("#batchAnalysisMethodSelect");
  if (methodSelect) methodSelect.value = defaultAnalysisMethodName();
  const useStatuses = statusFilters.size > 0;
  document.querySelector(`input[name="batchAnalysisScope"][value="${useStatuses ? "statuses" : "all"}"]`).checked = true;
  setBatchAnalysisStatuses(useStatuses ? [...statusFilters] : []);
  syncBatchAnalysisScope();
  modal.classList.add("open");
}

function closeBatchAnalysisModal() {
  document.querySelector("#batchAnalysisModal")?.classList.remove("open");
}

function openModelDistillationModal() {
  if (!state.activeDatasetId || !state.activeSceneId) {
    toast("请先选择场景和数据集");
    return;
  }
  const selectedIds = selectedRowIds();
  if (!selectedIds.length) {
    toast("请先勾选需要蒸馏的数据行");
    return;
  }
  distillationCandidates = [];
  const modal = document.querySelector("#modelDistillationModal");
  document.querySelector("#modelDistillationMethodSelect").innerHTML = renderDistillationMethodOptions();
  document.querySelector("#modelDistillationHint").textContent = `已选择 ${selectedIds.length} 行。蒸馏期间请保持弹框打开，完成后可勾选候选知识并写入当前场景知识库。`;
  document.querySelector("#modelDistillationResult").innerHTML = `<div class="empty">点击“开始蒸馏”后，这里会展示后台返回的候选知识。</div>`;
  document.querySelector("#modelDistillationSave").disabled = true;
  modal.classList.add("open");
}

function closeModelDistillationModal() {
  document.querySelector("#modelDistillationModal")?.classList.remove("open");
}

async function startModelDistillation() {
  const selectedIds = selectedRowIds();
  if (!selectedIds.length) {
    toast("请先勾选需要蒸馏的数据行");
    return;
  }
  const startButton = document.querySelector("#modelDistillationStart");
  const resultNode = document.querySelector("#modelDistillationResult");
  startButton.disabled = true;
  startButton.textContent = "蒸馏中...";
  document.querySelector("#modelDistillationSave").disabled = true;
  resultNode.innerHTML = `
    <div class="model-distillation-loading">
      <span class="table-loading-spinner" aria-hidden="true"></span>
      <strong>正在调用后台蒸馏方法，请保持弹框打开...</strong>
    </div>
  `;
  try {
    const result = await api("/api/model-distillation/run", {
      method: "POST",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        dataset_id: state.activeDatasetId,
        scheme_id: state.activeSchemeId || "",
        method_name: document.querySelector("#modelDistillationMethodSelect")?.value || "mock_distill",
        row_ids: selectedIds,
      }),
    });
    distillationCandidates = result.items || [];
    renderDistillationCandidates();
    toast(`蒸馏完成：返回 ${distillationCandidates.length} 条候选知识`);
  } catch (error) {
    distillationCandidates = [];
    resultNode.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
    toast(error.message);
  } finally {
    startButton.disabled = false;
    startButton.textContent = "重新蒸馏";
    syncDistillationSaveButton();
  }
}

function renderDistillationCandidates() {
  const resultNode = document.querySelector("#modelDistillationResult");
  if (!distillationCandidates.length) {
    resultNode.innerHTML = `<div class="empty">当前蒸馏方法没有返回候选知识。</div>`;
    return;
  }
  resultNode.innerHTML = `
    <div class="model-distillation-result-head">
      <strong>${distillationCandidates.length} 条候选知识</strong>
      <span>勾选后点击“加入知识库”。</span>
    </div>
    <div class="model-distillation-list">
      ${distillationCandidates.map((item, index) => `
        <label class="model-distillation-card">
          <input type="checkbox" value="${index}" checked>
          <span>
            <strong>${escapeHtml(item.name)}</strong>
            <em>${escapeHtml(item.content)}</em>
          </span>
        </label>
      `).join("")}
    </div>
  `;
}

function syncDistillationSaveButton() {
  const checked = document.querySelectorAll("#modelDistillationResult input[type='checkbox']:checked").length;
  const button = document.querySelector("#modelDistillationSave");
  if (button) {
    button.disabled = checked === 0;
    button.textContent = checked > 0 ? `加入知识库 ${checked}` : "加入知识库";
  }
}

async function saveDistillationKnowledge() {
  if (!state.activeSceneId) {
    toast("请先选择场景");
    return;
  }
  const selected = [...document.querySelectorAll("#modelDistillationResult input[type='checkbox']:checked")]
    .map((input) => distillationCandidates[Number(input.value)])
    .filter(Boolean);
  if (!selected.length) {
    toast("请选择要加入知识库的候选项");
    return;
  }
  const ok = await confirmAction({
    title: "加入知识库",
    message: `确认将 ${selected.length} 条蒸馏结果加入当前场景知识库？`,
    details: ["入库后可在“数据集与方案管理”的知识库弹窗中继续编辑。"],
    confirmText: "加入知识库",
    variant: "primary",
  });
  if (!ok) return;
  const button = document.querySelector("#modelDistillationSave");
  button.disabled = true;
  button.textContent = "写入中...";
  try {
    for (const item of selected) {
      await api("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          scene_id: state.activeSceneId,
          name: item.name,
          content: item.content,
          source_file: "model_distillation",
        }),
      });
    }
    await loadSceneResources();
    closeModelDistillationModal();
    toast(`已加入知识库：${selected.length} 条`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    syncDistillationSaveButton();
  }
}

function syncBatchAnalysisScope() {
  const scope = document.querySelector('input[name="batchAnalysisScope"]:checked')?.value || "all";
  document.querySelector("#batchAnalysisStatusBox").hidden = scope !== "statuses";
}

function setBatchAnalysisStatuses(values) {
  const selected = new Set(values);
  document.querySelectorAll("#batchAnalysisStatusGrid input").forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function handleBatchAnalysisStatusActions(event) {
  const action = event.target.closest("[data-batch-status-action]")?.dataset.batchStatusAction;
  if (!action) return;
  if (action === "current") setBatchAnalysisStatuses([...statusFilters]);
  if (action === "all") setBatchAnalysisStatuses(statusOptions);
  if (action === "clear") setBatchAnalysisStatuses([]);
}

async function startBatchAnalysis() {
  if (!state.activeDatasetId) {
    toast("请先选择数据集");
    return;
  }
  const scope = document.querySelector('input[name="batchAnalysisScope"]:checked')?.value || "all";
  const statuses = [...document.querySelectorAll("#batchAnalysisStatusGrid input:checked")].map((input) => input.value);
  if (scope === "statuses" && !statuses.length) {
    toast("请选择要分析的状态");
    return;
  }
  const ok = await confirmAction({
    title: "开始批量分析",
    message: "确认启动批量分析？",
    details: [
      scope === "statuses" ? `范围：${statuses.join("、")}` : "范围：当前数据集全部行",
      "后台会按单线程顺序处理。",
    ],
    confirmText: "开始分析",
    variant: "primary",
  });
  if (!ok) return;
  const button = document.querySelector("#batchAnalysisStart");
  button.disabled = true;
  button.textContent = "启动中...";
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/analysis-batch`, {
      method: "POST",
      body: JSON.stringify({
        scheme_id: state.activeSchemeId || "",
        method_name: document.querySelector("#batchAnalysisMethodSelect")?.value || defaultAnalysisMethodName(),
        scope,
        statuses,
      }),
    });
    closeBatchAnalysisModal();
    toast(`批量分析已启动：${result.total_count || 0} 行，后台顺序执行`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "开始批量分析";
  }
}

async function deleteBatchAnalysisData() {
  if (!state.activeDatasetId) {
    toast("请先选择数据集");
    return;
  }
  const scope = statusFilters.size ? "statuses" : "all";
  const hint = scope === "statuses"
    ? `当前状态筛选：${[...statusFilters].join("、")}`
    : "当前数据集全部行";
  const ok = await confirmAction({
    title: "删除分析数据",
    message: "确认删除分析数据？",
    details: [`范围：${hint}`, "行详情中的分析结果和分析历史会被清空。"],
    confirmText: "删除分析数据",
    variant: "danger",
  });
  if (!ok) return;
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/analysis-batch/delete`, {
      method: "POST",
      body: JSON.stringify({
        scheme_id: state.activeSchemeId || "",
        scope,
        statuses: [...statusFilters],
      }),
    });
    for (const rowId of result.row_ids || []) {
      updateVisibleRow(rowId, { "分析数据": {}, analysis_data: {} });
    }
    if (drawerRow && result.row_ids?.includes(drawerRow.row_id)) {
      drawerRow = { ...drawerRow, analysis_data: {}, "分析数据": {} };
      if (drawerMode === "analysis") renderDrawerAnalysisHistory();
      if (drawerMode === "edit") renderDrawerEditAnalysis();
    }
    await refreshTableData({ keepPage: true });
    toast(`已删除 ${result.deleted_count || 0} 行分析数据`);
  } catch (error) {
    toast(error.message);
  }
}

function syncFavoriteFilterButton() {
  const button = document.querySelector("#favoriteFilterButton");
  if (!button) return;
  button.classList.toggle("active", favoriteOnlyFilter);
  button.textContent = favoriteOnlyFilter ? "已筛收藏" : "只看收藏";
}

async function toggleFavoriteFilter() {
  favoriteOnlyFilter = !favoriteOnlyFilter;
  syncFavoriteFilterButton();
  syncFullAnnotateButton();
  await refreshWorkbench();
}

async function clearFavoriteRows() {
  return favoriteRows(false);
}

async function favoriteRows(isFavorite) {
  if (!state.activeDatasetId) {
    toast("请先选择数据集");
    return;
  }
  const selectedIds = table?.getSelectedRows?.().map((row) => row.getData().row_id).filter(Boolean) || [];
  const actionText = isFavorite ? "添加收藏" : "取消收藏";
  const scopeText = selectedIds.length
    ? `当前选中的 ${selectedIds.length} 行`
    : (isFavorite ? "当前数据集全部行" : (favoriteOnlyFilter ? "当前收藏筛选结果" : "当前数据集全部收藏行"));
  const ok = await confirmAction({
    title: actionText,
    message: `确认${actionText}？`,
    details: [`范围：${scopeText}`],
    confirmText: actionText,
    variant: isFavorite ? "primary" : "warning",
  });
  if (!ok) return;
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/favorite/batch`, {
      method: "POST",
      body: JSON.stringify({
        row_ids: selectedIds,
        is_favorite: isFavorite,
        favorite_only: !isFavorite,
      }),
    });
    applyFavoritePatch(result.row_ids || [], isFavorite);
    if (favoriteOnlyFilter && !isFavorite) await refreshTableData({ keepPage: true });
    toast(`已${actionText} ${result.updated_count || 0} 行`);
  } catch (error) {
    toast(error.message);
  }
}

function applyFavoritePatch(rowIds, isFavorite) {
  const favoriteText = isFavorite ? "是" : "否";
  for (const rowId of rowIds || []) {
    updateVisibleRow(rowId, { is_favorite: isFavorite, 收藏: favoriteText });
  }
  if (drawerRow && rowIds?.includes(drawerRow.row_id)) {
    drawerRow = { ...drawerRow, is_favorite: isFavorite, 收藏: favoriteText };
    syncDrawerFavoriteButton();
  }
}

function isFavoriteValue(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "是", "已收藏", "已藏"].includes(text);
}

async function toggleRowFavorite(rowId) {
  if (!state.activeDatasetId || !rowId) return;
  const rowData = getVisibleRowData(rowId);
  const nextFavorite = !(isFavoriteValue(rowData?.is_favorite) || isFavoriteValue(rowData?.收藏));
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}/favorite`, {
      method: "POST",
      body: JSON.stringify({ is_favorite: nextFavorite }),
    });
    applyFavoritePatch([rowId], result.is_favorite);
    if (favoriteOnlyFilter && !result.is_favorite) await refreshTableData({ keepPage: true });
    toast(result.is_favorite ? "已收藏这条数据" : "已取消收藏");
  } catch (error) {
    toast(error.message);
  }
}

function setBatchButtonState() {
  const selectedCount = table?.getSelectedRows?.().length || 0;
  const button = document.querySelector("#batchAnnotateButton");
  if (button) {
    button.disabled = selectedCount === 0;
    button.textContent = selectedCount > 0 ? `批量标注 ${selectedCount}` : "批量标注";
  }
  const distillButton = document.querySelector("#modelDistillButton");
  if (distillButton) {
    distillButton.disabled = selectedCount === 0;
    distillButton.textContent = selectedCount > 0 ? `知识蒸馏 ${selectedCount}` : "知识蒸馏";
  }
  const currentPage = document.querySelector("#selectCurrentPage");
  if (currentPage && selectedCount === 0) currentPage.checked = false;
}

function selectedRowIds() {
  return table?.getSelectedRows?.().map((row) => row.getData().row_id).filter(Boolean) || [];
}

function toggleTableFocusMode() {
  if (!document.querySelector(".workbench-pro")) return;
  tableFocusMode = !tableFocusMode;
  applyTableFocusMode();
  window.requestAnimationFrame(() => table?.redraw?.(true));
}

function applyTableFocusMode() {
  const root = document.querySelector(".workbench-pro");
  if (root) root.classList.toggle("table-focus-mode", tableFocusMode);
  document.body.classList.toggle("table-focus-active", Boolean(root && tableFocusMode));
  const button = document.querySelector("#tableFocusButton");
  if (button) {
    const active = Boolean(root && tableFocusMode);
    button.classList.toggle("primary", active);
    button.setAttribute("aria-label", active ? "退出全屏" : "全屏表格");
    button.setAttribute("title", active ? "退出全屏" : "全屏表格");
  }
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

function syncStatusFilterMenu() {
  const button = document.querySelector("#statusFilterButton");
  const menu = document.querySelector("#statusFilterMenu");
  if (!button || !menu) return;
  menu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = statusFilters.has(input.value);
  });
  const count = statusFilters.size;
  button.textContent = count ? `状态筛选 ${count}` : "状态筛选";
  button.classList.toggle("active", count > 0);
}

async function toggleRootCauseFilterMenu(button) {
  const menu = document.querySelector("#rootCauseFilterMenu");
  if (!menu) return;
  const shouldOpen = menu.hidden;
  closeMenus();
  if (!shouldOpen) return;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  await loadRootCauseFilterMenu();
}

async function loadRootCauseFilterMenu() {
  const menu = document.querySelector("#rootCauseFilterMenu");
  if (!menu) return;
  if (!state.activeSceneId) {
    menu.innerHTML = `<div class="root-cause-filter-empty">请先选择场景</div>`;
    return;
  }
  menu.innerHTML = `<div class="root-cause-filter-loading">正在读取根因统计...</div>`;
  const params = new URLSearchParams({ scene_id: state.activeSceneId });
  if (state.activeDatasetId) params.set("dataset_id", state.activeDatasetId);
  if (state.activeSchemeId) params.set("scheme_id", state.activeSchemeId);
  try {
    rootCauseSummaryCache = await api(`/api/root-cause/summary?${params.toString()}`);
    menu.innerHTML = rootCauseFilterMenuHtml(rootCauseSummaryCache);
  } catch (error) {
    menu.innerHTML = `<div class="root-cause-filter-empty">${escapeHtml(error.message)}</div>`;
  }
}

function rootCauseFilterMenuHtml(summary) {
  if (!summary?.root_cause_column) {
    return `<div class="root-cause-filter-empty">请先配置根因分类列</div>`;
  }
  const positive = summary.positive || [];
  const negative = summary.negative || [];
  return `
    <div class="root-cause-filter-head">
      <span>${escapeHtml(summary.root_cause_column)}</span>
      <button type="button" data-root-cause-action="clear">清空</button>
    </div>
    <div class="root-cause-filter-columns">
      ${rootCauseFilterColumnHtml("positive", "正例", positive)}
      ${rootCauseFilterColumnHtml("negative", "反例", negative)}
    </div>
    <div class="root-cause-filter-actions">
      <button type="button" data-root-cause-action="baseline">一键添加根因基线</button>
      <button type="button" data-root-cause-action="apply">筛选数据</button>
    </div>
  `;
}

function rootCauseFilterColumnHtml(polarity, title, items) {
  const selected = rootCauseFilters[polarity] || new Set();
  return `
    <section class="root-cause-filter-column">
      <div class="root-cause-filter-column-title">
        <strong>${title}</strong>
        <span>${items.length} 项</span>
      </div>
      <div class="root-cause-filter-list">
        ${items.map((item) => `
          <label class="${selected.has(item.name) ? "active" : ""}">
            <input type="checkbox" value="${escapeHtml(item.name)}" data-root-cause-choice="${polarity}" ${selected.has(item.name) ? "checked" : ""}>
            <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            <strong>${Number(item.count || 0).toLocaleString()}</strong>
          </label>
        `).join("") || `<div class="root-cause-filter-empty">暂无${title}根因</div>`}
      </div>
    </section>
  `;
}

async function handleRootCauseFilterMenuClick(event) {
  const checkbox = event.target.closest("[data-root-cause-choice]");
  if (checkbox) {
    const polarity = checkbox.dataset.rootCauseChoice;
    if (checkbox.checked) rootCauseFilters[polarity].add(checkbox.value);
    else rootCauseFilters[polarity].delete(checkbox.value);
    checkbox.closest("label")?.classList.toggle("active", checkbox.checked);
    syncRootCauseFilterButton();
    syncFullAnnotateButton();
    return;
  }
  const action = event.target.closest("[data-root-cause-action]")?.dataset.rootCauseAction;
  if (!action) return;
  event.preventDefault();
  if (action === "clear") {
    rootCauseFilters = { positive: new Set(), negative: new Set() };
    await loadRootCauseFilterMenu();
    syncRootCauseFilterButton();
    syncFullAnnotateButton();
    return;
  }
  if (action === "baseline") {
    await addSelectedRootCauseBaselines();
    return;
  }
  closeMenus();
  syncRootCauseFilterButton();
  await refreshWorkbench();
}

function syncRootCauseFilterButton() {
  const button = document.querySelector("#rootCauseFilterButton");
  if (!button) return;
  const count = rootCauseFilterCount();
  button.textContent = count ? `根因筛选 ${count}` : "根因分析筛选";
  button.classList.toggle("active", count > 0);
}

function rootCauseFilterCount() {
  return rootCauseFilters.positive.size + rootCauseFilters.negative.size;
}

function rootCauseFilterKey() {
  return [
    [...rootCauseFilters.positive].sort().join(","),
    [...rootCauseFilters.negative].sort().join(","),
  ].join("|");
}

async function addSelectedRootCauseBaselines() {
  if (!state.activeSceneId) {
    toast("请先选择场景");
    return;
  }
  const items = [
    ...[...rootCauseFilters.positive].map((name) => ({ polarity: "positive", name })),
    ...[...rootCauseFilters.negative].map((name) => ({ polarity: "negative", name })),
  ];
  if (!items.length) {
    toast("请先选择要加入基线的根因");
    return;
  }
  await api("/api/root-cause/baselines/bulk", {
    method: "POST",
    body: JSON.stringify({ scene_id: state.activeSceneId, items }),
  });
  toast(`已加入 ${items.length} 个根因基线`);
}

function toggleStatusFilterMenu(button) {
  const menu = document.querySelector("#statusFilterMenu");
  if (!menu) return;
  const shouldOpen = menu.hidden;
  closeMenus();
  if (!shouldOpen) return;
  syncStatusFilterMenu();
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
}

function setStatusFilterMenuValues(values) {
  const selected = new Set(values);
  document.querySelectorAll('#statusFilterMenu input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function handleStatusFilterMenuClick(event) {
  const action = event.target.closest("[data-status-filter-action]")?.dataset.statusFilterAction;
  if (!action) return;
  event.preventDefault();
  if (action === "all") {
    setStatusFilterMenuValues(statusOptions);
    return;
  }
  if (action === "clear") {
    setStatusFilterMenuValues([]);
    return;
  }
  applyStatusFilters();
}

async function applyStatusFilters() {
  const checked = [...document.querySelectorAll('#statusFilterMenu input[type="checkbox"]:checked')].map((input) => input.value);
  statusFilters = new Set(checked);
  syncFullAnnotateButton();
  closeMenus();
  try {
    await refreshWorkbench();
  } finally {
    syncStatusFilterMenu();
    closeMenus();
  }
}

function closeMenus() {
  document.querySelector("#globalMoreMenu")?.setAttribute("hidden", "");
  document.querySelector("#statusFilterMenu")?.setAttribute("hidden", "");
  document.querySelector("#rootCauseFilterMenu")?.setAttribute("hidden", "");
  document.querySelector("#columnFilterPopover")?.setAttribute("hidden", "");
  document.querySelector("#rowMoreMenu")?.classList.remove("open");
  document.querySelectorAll('[aria-expanded="true"]').forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function handleColumnFilterClick(event) {
  const button = event.target.closest("[data-column-filter]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openColumnFilterPopover(button);
}

function stopColumnFilterHeaderEvents(event) {
  if (!event.target.closest("[data-column-filter]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function stopColumnSortHeaderEvents(event) {
  if (!event.target.closest("[data-column-sort]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

async function handleColumnSortClick(event) {
  const button = event.target.closest("[data-column-sort]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const column = button.dataset.columnSort || "";
  if (!column) return;
  closeMenus();
  activeSort = nextSortState(column);
  updateSortButtons();
  try {
    await refreshWorkbench();
  } finally {
    updateSortButtons();
  }
}

function nextSortState(column) {
  if (activeSort.column !== column) return { column, dir: "asc" };
  if (activeSort.dir === "asc") return { column, dir: "desc" };
  if (activeSort.dir === "desc") return { column: "", dir: "" };
  return { column, dir: "asc" };
}

function updateSortButtons() {
  document.querySelectorAll("[data-column-sort]").forEach((button) => {
    const column = button.dataset.columnSort || "";
    const dir = activeSort.column === column ? activeSort.dir : "";
    button.dataset.sortDir = dir;
    button.classList.toggle("active", Boolean(dir));
    button.classList.toggle("asc", dir === "asc");
    button.classList.toggle("desc", dir === "desc");
    const label = dir === "asc" ? "升序排序" : (dir === "desc" ? "降序排序" : "未排序");
    button.setAttribute("aria-label", `${column}：${label}`);
    button.setAttribute("title", `${column}：${label}`);
    button.closest(".tabulator-col")?.setAttribute("aria-sort", dir === "asc" ? "ascending" : (dir === "desc" ? "descending" : "none"));
  });
}

function openColumnFilterPopover(button) {
  const popover = document.querySelector("#columnFilterPopover");
  const input = document.querySelector("#columnFilterInput");
  const emptyInput = document.querySelector("#columnFilterEmpty");
  const title = document.querySelector("#columnFilterTitle");
  if (!popover || !input || !emptyInput || !title) return;
  const column = button.dataset.columnFilter || "";
  const rect = button.getBoundingClientRect();
  closeMenus();
  popover.dataset.column = column;
  title.textContent = `筛选：${column}`;
  input.value = columnFilter.column === column ? columnFilter.value : "";
  emptyInput.checked = columnFilter.column === column ? Boolean(columnFilter.empty) : false;
  popover.hidden = false;
  const width = 220;
  popover.style.left = `${Math.min(Math.max(rect.left - width + rect.width, 12), window.innerWidth - width - 12)}px`;
  popover.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 150)}px`;
  button.setAttribute("aria-expanded", "true");
  window.setTimeout(() => input.focus(), 0);
}

function handleColumnFilterPopoverClick(event) {
  const action = event.target.closest("[data-column-filter-action]")?.dataset.columnFilterAction;
  if (!action) return;
  event.preventDefault();
  if (action === "clear") {
    clearColumnFilter();
  } else {
    applyColumnFilter();
  }
}

async function applyColumnFilter() {
  const popover = document.querySelector("#columnFilterPopover");
  const input = document.querySelector("#columnFilterInput");
  const emptyInput = document.querySelector("#columnFilterEmpty");
  const column = popover?.dataset.column || "";
  columnFilter = { column, value: input?.value.trim() || "", empty: Boolean(emptyInput?.checked) };
  if (!columnFilter.value && !columnFilter.empty) columnFilter = { column: "", value: "", empty: false };
  syncFullAnnotateButton();
  closeMenus();
  try {
    await refreshWorkbench();
  } finally {
    closeMenus();
  }
}

async function clearColumnFilter() {
  columnFilter = { column: "", value: "", empty: false };
  syncFullAnnotateButton();
  const input = document.querySelector("#columnFilterInput");
  const emptyInput = document.querySelector("#columnFilterEmpty");
  if (input) input.value = "";
  if (emptyInput) emptyInput.checked = false;
  closeMenus();
  try {
    await refreshWorkbench();
  } finally {
    closeMenus();
  }
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
  if (event.target.closest("[data-column-filter]") || event.target.closest("#columnFilterPopover")) {
    return;
  }
  if (event.target.closest("#statusFilterButton") || event.target.closest("#statusFilterMenu")) {
    return;
  }
  if (event.target.closest("#rootCauseFilterButton") || event.target.closest("#rootCauseFilterMenu")) {
    return;
  }
  if (!event.target.closest("#globalMoreButton") && !event.target.closest("#globalMoreMenu")) {
    closeMenus();
  }
}

function openRowMoreMenu(more) {
  const menu = document.querySelector("#rowMoreMenu");
  if (!menu || !more) return;
  const rowId = more.dataset.rowId || "";
  const isSameMenuOpen = menu.classList.contains("open") && menu.dataset.rowId === rowId;
  if (isSameMenuOpen) {
    closeMenus();
    return;
  }
  const rect = more.getBoundingClientRect();
  closeMenus();
  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 116)}px`;
  menu.style.left = `${Math.min(rect.right - 108, window.innerWidth - 120)}px`;
  menu.dataset.rowId = rowId;
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
  if (!isOpenableCellField(field)) return;
  const rowId = cell.getData?.()?.row_id || "";
  openCellValue(field, cell.getValue(), rowId);
}

function handleTableCellDoubleClick(event) {
  if (!table || event.target.closest("button, input, textarea, select")) return;
  const cellElement = event.target.closest(".tabulator-cell");
  const rowElement = event.target.closest(".tabulator-row");
  const field = cellElement?.getAttribute("tabulator-field");
  if (!cellElement || !rowElement || !isOpenableCellField(field)) return;
  const row = table.getRows("visible").find((item) => item.getElement() === rowElement);
  if (!row) return;
  const rowData = row.getData();
  openCellValue(field, rowData[field], rowData.row_id);
}

function isOpenableCellField(field) {
  if (!field) return false;
  if (["row_id", "__spacer", "状态"].includes(field)) return false;
  return true;
}

function isEditableCellField(field) {
  if (!field) return false;
  if (["row_id", "__spacer", "状态"].includes(field)) return false;
  if (isAnalysisResultColumn(field)) return false;
  if (field === latestFieldMapping?.model_answer_column) return false;
  return true;
}

function isAnalysisResultColumn(column) {
  return String(column || "").startsWith(ANALYSIS_RESULT_COLUMN_PREFIX);
}

async function openCellValue(field, value, rowId = "") {
  currentDetailKind = "cell";
  currentDetailRow = null;
  currentCellField = field;
  currentCellRowId = rowId;
  const editable = isEditableCellField(field);
  document.querySelector("#rowDetailTitle").textContent = `单元格内容 · ${field}`;
  document.querySelector("#cellFormatButton").disabled = false;
  document.querySelector("#cellSaveButton").hidden = !editable;
  document.querySelector("#cellSaveButton").disabled = !editable || !rowId || !state.activeDatasetId;
  setCellDetailValue(value);
  document.querySelector("#rowDetailModal").classList.add("open");
  if (rowId && state.activeDatasetId) {
    document.querySelector("#rowDetailMeta").textContent = "正在读取完整单元格内容...";
    try {
      const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}/fields/${encodeURIComponent(field)}${schemeQuery()}`);
      setCellDetailValue(result.exists ? result.value : value);
    } catch {
      setCellDetailValue(value);
    }
  }
}

function setCellDetailValue(value) {
  currentCellRawValue = value;
  const parsed = parseJsonLike(value);
  currentCellContent = parsed.ok ? JSON.stringify(parsed.value, null, 2) : formatCellRawValue(value);
  const editable = isEditableCellField(currentCellField);
  document.querySelector("#rowDetailMeta").textContent = editable
    ? (parsed.ok ? "JSON 已格式化，可直接编辑后保存。" : "按纯文本展示，可直接编辑后保存。")
    : (parsed.ok ? "JSON 已格式化，只读展示。" : "按纯文本只读展示。");
  renderCellDetailContent(parsed.ok, editable);
}

function closeRowDetail() {
  document.querySelector("#rowDetailModal")?.classList.remove("open");
}

async function copyCellDetailContent() {
  const content = document.querySelector("#cellDetailEditor")?.value || currentCellContent || "";
  if (!content) {
    toast("暂无可复制内容");
    return;
  }
  await copyTextToClipboard(content, "已复制单元格内容");
}

async function copyTextToClipboard(content, message = "已复制内容") {
  try {
    await navigator.clipboard.writeText(content);
    toast(message);
  } catch {
    fallbackCopyText(content, message);
  }
}

function formatCellJsonContent() {
  const editor = document.querySelector("#cellDetailEditor");
  let parsed = parseJsonLike(editor?.value ?? currentCellContent);
  if (!parsed.ok) {
    currentCellContent = formatCellRawValue(editor?.value ?? currentCellRawValue ?? currentCellContent);
    renderCellDetailContent(false);
    toast("当前内容按纯文本换行展示");
    return;
  }
  currentCellContent = JSON.stringify(parsed.value, null, 2);
  renderCellDetailContent(true);
  document.querySelector("#rowDetailMeta").textContent = isEditableCellField(currentCellField)
    ? "JSON 已格式化，可继续编辑后保存。"
    : "JSON 已格式化，只读展示。";
  toast("JSON 已格式化");
}

function renderCellDetailContent(highlightJson = false, editable = isEditableCellField(currentCellField)) {
  const viewer = document.querySelector("#rowDetailJson");
  const editor = document.querySelector("#cellDetailEditor");
  if (!viewer) return;
  viewer.scrollTop = 0;
  if (highlightJson) {
    viewer.innerHTML = highlightJsonText(currentCellContent);
  } else {
    viewer.textContent = currentCellContent;
  }
  viewer.hidden = editable;
  if (editor) {
    editor.hidden = !editable;
    editor.value = currentCellContent;
    if (editable) window.requestAnimationFrame(() => editor.focus());
  }
}

async function saveCellDetailValue() {
  if (!isEditableCellField(currentCellField)) {
    toast("当前单元格为只读内容");
    return;
  }
  if (!state.activeDatasetId || !currentCellRowId || !currentCellField) {
    toast("当前单元格缺少保存上下文");
    return;
  }
  const editor = document.querySelector("#cellDetailEditor");
  const saveButton = document.querySelector("#cellSaveButton");
  const nextText = editor?.value ?? "";
  const nextValue = parseEditedCellValue(nextText);
  const oldText = saveButton?.textContent || "保存修改";
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "保存中...";
  }
  try {
    const fullRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${currentCellRowId}`);
    const rawData = editableDetailDataFrom(fullRow || {});
    rawData[currentCellField] = nextValue;
    const updated = await api(`/api/datasets/${state.activeDatasetId}/rows/${currentCellRowId}${schemeQuery()}`, {
      method: "PUT",
      body: JSON.stringify({ raw_data: rawData }),
    });
    currentCellRawValue = nextValue;
    currentCellContent = nextText;
    await ensureDynamicResultColumns(updated);
    updateVisibleRow(updated.row_id, updated);
    await refreshMetrics();
    toast("单元格已保存");
  } catch (error) {
    toast(error.message);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = oldText;
    }
  }
}

function parseEditedCellValue(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  if (/^[{\[]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
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

function fallbackCopyText(content, message = "已复制单元格内容") {
  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  toast(message);
}

async function openRowDrawer(rowData, mode = "result") {
  if (!rowData?.row_id || !state.activeDatasetId) return;
  drawerMode = "result";
  drawerEditDirty = false;
  drawerRow = { ...rowData, __is_full: false };
  drawerFullFields = new Set();
  drawerAnalysisHistoryRows = [];
  drawerSelectedAnalysisIds = new Set();
  resetDrawerWidth();
  document.querySelector("#rowDetailDrawer").classList.add("open");
  document.querySelector("#rowDetailDrawer").setAttribute("aria-hidden", "false");
  document.querySelector("#drawerTitle").textContent = `行详情 · ${rowData.ID || rowData.row_id || ""}`;
  document.querySelector("#drawerMeta").textContent = "预览数据已加载，大字段可按需展开。";
  document.querySelector("#drawerViewKv").innerHTML = `<div class="empty">正在渲染预览数据...</div>`;
  document.querySelector("#drawerAnalysisStatus").textContent = "读取中";
  document.querySelector("#drawerAnalysisResults").innerHTML = `<div class="empty">正在读取分析结果...</div>`;
  initializeDrawerColumns();
  renderDrawerPayload();
  await setDrawerMode(normalizeDrawerMode(mode));
}

function closeRowDrawer() {
  document.querySelector("#rowDetailDrawer")?.classList.remove("open");
  document.querySelector("#rowDetailDrawer")?.setAttribute("aria-hidden", "true");
  document.querySelector("#drawerFieldPopover")?.setAttribute("hidden", "");
  document.querySelector("#drawerAnalysisResultPopover")?.setAttribute("hidden", "");
  stopDrawerResize();
  stopDrawerAnalysisSplitResize();
}

function initializeDrawerColumns() {
  const raw = drawerEditableData();
  const keys = Object.keys(raw);
  const resultColumns = new Set([...(availableModelResultColumns || []), ...keys.filter((key) => key.startsWith(ANALYSIS_RESULT_COLUMN_PREFIX))]);
  const excelColumns = new Set((availableDatasetColumns || []).filter((column) => !resultColumns.has(column)));
  const excelKeys = keys.filter((key) => excelColumns.has(key));
  const preferred = latestFieldMapping?.visible_columns?.filter((column) => keys.includes(column) && excelColumns.has(column)) || [];
  const defaults = preferred.length ? preferred : excelKeys.slice(0, Math.min(excelKeys.length, 10));
  drawerSelectedColumns = new Set(defaults);
}

function normalizeDrawerMode(mode) {
  return ["result", "analysis"].includes(mode) ? mode : "result";
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
  renderDrawerEditAnalysis();
}

async function setDrawerMode(mode) {
  if (!drawerRow) return;
  mode = normalizeDrawerMode(mode);
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
  setDrawerElementVisible("#drawerFavoriteButton", mode === "analysis");
  syncDrawerFavoriteButton();
  document.querySelector("#drawerSave").disabled = true;
  document.querySelector("#drawerFieldPopover")?.setAttribute("hidden", "");
  document.querySelector("#drawerAnalysisResultPopover")?.setAttribute("hidden", "");
  document.querySelectorAll("[data-drawer-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerMode === mode);
  });
  if (["result"].includes(mode) && !drawerRow.__is_full) {
    await ensureDrawerFullRow();
    if (drawerMode !== mode) return;
  }
  if (mode === "analysis") {
    renderDrawerAnalysisRaw();
    renderDrawerAnalysisResult();
    renderDrawerAnalysisHistory();
  }
  if (mode === "result") {
    renderDrawerResult();
    renderDrawerAnnotationHistory();
  }
}

async function ensureDrawerFullRow() {
  if (!drawerRow?.row_id || !state.activeDatasetId || drawerRow.__is_full) return;
  const fullRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}${schemeQuery()}`);
  drawerRow = { ...fullRow, __is_full: true };
  currentDetailRow = drawerRow;
  drawerFullFields = new Set(Object.keys(drawerEditableData()));
  initializeDrawerColumns();
  renderDrawerPayload();
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
    const updated = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}${schemeQuery()}`, {
      method: "PUT",
      body: JSON.stringify({ raw_data: rawData }),
    });
    drawerRow = { ...updated, __is_full: true };
    currentDetailRow = updated;
    drawerFullFields = new Set(Object.keys(drawerEditableData()));
    await ensureDynamicResultColumns(updated);
    updateVisibleRow(updated.row_id, updated);
    initializeDrawerColumns();
    renderDrawerPayload();
    setDrawerMode("view");
    await refreshMetrics();
    toast("行数据已保存");
  } catch (error) {
    toast(error.message);
  }
}

async function analyzeDrawerRow() {
  if (!drawerRow?.row_id || !state.activeDatasetId) return;
  const requestId = ++drawerAnalysisRequest;
  const rowId = drawerRow.row_id;
  const methodName = document.querySelector("#drawerAnalysisMethodSelect")?.value || defaultAnalysisMethodName();
  const statusNode = document.querySelector("#drawerAnalysisStatus");
  const resultsNode = document.querySelector("#drawerAnalysisResults");
  const hasExistingResults = drawerAnalysisHistoryRows.length > 0 || Boolean(resultsNode.textContent.trim() && !resultsNode.querySelector(".empty"));
  statusNode.textContent = hasExistingResults ? "分析中，已保留当前结果" : "分析中...";
  if (!hasExistingResults) {
    resultsNode.innerHTML = `<div class="empty">后台分析中，关闭抽屉不会中断请求。</div>`;
  }
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${rowId}/analysis${analysisQuery(methodName)}`, { method: "POST" });
    const analysisData = result.analysis_data || {};
    if (drawerRow?.row_id === rowId) {
      drawerRow = { ...drawerRow, analysis_data: analysisData, 分析数据: analysisData };
      currentDetailRow = drawerRow;
    }
    await ensureDynamicResultColumns({ 分析数据: analysisData });
    updateVisibleRow(rowId, { 分析数据: analysisData });
    await refreshWorkbench();
    if (requestId === drawerAnalysisRequest && drawerRow?.row_id === rowId) {
      document.querySelector("#drawerAnalysisStatus").textContent = `${result.method_label || "分析"}完成`;
      await renderDrawerAnalysisHistory({ selectLatest: true });
    }
    toast("分析数据已写入");
  } catch (error) {
    if (requestId === drawerAnalysisRequest) {
      statusNode.textContent = `分析失败：${error.message}`;
      if (!hasExistingResults) {
        resultsNode.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      }
    }
    toast(error.message);
  }
}

function syncDrawerFavoriteButton() {
  const button = document.querySelector("#drawerFavoriteButton");
  if (!button || !drawerRow) return;
  const isFavorite = isFavoriteValue(drawerRow.is_favorite) || isFavoriteValue(drawerRow["收藏"]);
  button.classList.toggle("active", isFavorite);
  button.textContent = isFavorite ? "已收藏" : "收藏";
  button.title = isFavorite ? "点击取消收藏" : "点击收藏这条数据";
}

async function toggleDrawerFavorite() {
  if (!drawerRow?.row_id || !state.activeDatasetId) return;
  const nextFavorite = !(isFavoriteValue(drawerRow.is_favorite) || isFavoriteValue(drawerRow["收藏"]));
  const button = document.querySelector("#drawerFavoriteButton");
  if (button) button.disabled = true;
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}/favorite`, {
      method: "POST",
      body: JSON.stringify({ is_favorite: nextFavorite }),
    });
    drawerRow = { ...drawerRow, ...result };
    currentDetailRow = drawerRow;
    updateVisibleRow(drawerRow.row_id, result);
    syncDrawerFavoriteButton();
    toast(nextFavorite ? "已收藏这条数据" : "已取消收藏");
    if (favoriteOnlyFilter && !nextFavorite) await refreshTableData({ keepPage: true });
  } catch (error) {
    toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderDrawerAnalysisResult() {
  const analysis = drawerRow?.analysis_data || drawerRow?.["分析数据"] || {};
  const hasAnalysis = analysis && typeof analysis === "object" && Object.keys(analysis).length;
  document.querySelector("#drawerAnalysisStatus").textContent = hasAnalysis ? "最新结果" : "暂无结果";
  document.querySelector("#drawerAnalysisResults").innerHTML = hasAnalysis
    ? analysisResultArticleHtml({ id: "latest", method_label: "最新分析", analysis_data: analysis, created_at: "" })
    : `<div class="empty">暂无分析结果</div>`;
  renderDrawerEditAnalysis();
}

function defaultAnalysisMethodName() {
  const first = Object.values(state.analysisMethods || {})[0];
  return first?.method_name || "default_analysis";
}

function analysisQuery(methodName = "") {
  const params = new URLSearchParams();
  if (state.activeSchemeId) params.set("scheme_id", state.activeSchemeId);
  if (methodName) params.set("method_name", methodName);
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function renderDrawerAnalysisHistory(options = {}) {
  if (!drawerRow?.row_id || !state.activeDatasetId || drawerMode !== "analysis") return;
  const requestId = ++drawerAnalysisHistoryRequest;
  const status = document.querySelector("#drawerAnalysisStatus");
  const results = document.querySelector("#drawerAnalysisResults");
  status.textContent = "加载中";
  results.innerHTML = `<div class="empty">正在读取分析历史...</div>`;
  try {
    const rows = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}/analysis-history`);
    if (requestId !== drawerAnalysisHistoryRequest || drawerMode !== "analysis") return;
    drawerAnalysisHistoryRows = rows;
    if (options.selectLatest && rows[0]?.id) {
      drawerSelectedAnalysisIds = new Set([rows[0].id]);
    } else {
      syncSelectedAnalysisRows(rows);
    }
    renderDrawerAnalysisResultFilter();
    renderDrawerAnalysisResultList();
  } catch (error) {
    if (requestId !== drawerAnalysisHistoryRequest) return;
    status.textContent = "读取失败";
    results.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function syncSelectedAnalysisRows(rows) {
  const ids = new Set(rows.map((row) => row.id));
  drawerSelectedAnalysisIds = new Set([...drawerSelectedAnalysisIds].filter((id) => ids.has(id)));
  if (!drawerSelectedAnalysisIds.size && rows.length) {
    rows.forEach((row) => drawerSelectedAnalysisIds.add(row.id));
  }
}

function renderDrawerAnalysisResultFilter() {
  const grid = document.querySelector("#drawerAnalysisResultGrid");
  if (!grid) return;
  grid.innerHTML = drawerAnalysisHistoryRows.map((row, index) => `
    <label class="drawer-field-chip">
      <input type="checkbox" value="${escapeHtml(row.id)}" ${drawerSelectedAnalysisIds.has(row.id) ? "checked" : ""}>
      <span title="${escapeHtml(row.method_label || row.method_name || "分析结果")}">${escapeHtml(row.method_label || row.method_name || `分析 ${index + 1}`)} · ${escapeHtml(formatHistoryTime(row.created_at))}</span>
    </label>
  `).join("") || `<div class="empty">暂无分析结果</div>`;
}

function renderDrawerAnalysisResultList() {
  const rows = drawerAnalysisHistoryRows.filter((row) => drawerSelectedAnalysisIds.has(row.id));
  document.querySelector("#drawerAnalysisStatus").textContent = drawerAnalysisHistoryRows.length
    ? `${rows.length} / ${drawerAnalysisHistoryRows.length} 个结果`
    : "暂无结果";
  document.querySelector("#drawerAnalysisResults").innerHTML = rows.map(analysisResultArticleHtml).join("")
    || `<div class="empty">当前未选择分析结果</div>`;
}

function analysisResultArticleHtml(row) {
  return `
    <article class="drawer-analysis-result-item">
      <div class="drawer-history-head">
        <span class="scheme-badge">${escapeHtml(row.method_label || row.method_name || "分析")}</span>
        <strong>${escapeHtml(row.created_at ? formatHistoryTime(row.created_at) : "最新")}</strong>
      </div>
      <div class="drawer-kv drawer-analysis-result-kv">
        ${drawerKeyValueRowsHtml(row.analysis_data || {}, "暂无分析数据")}
      </div>
    </article>
  `;
}

function renderDrawerEditAnalysis() {
  const element = document.querySelector("#drawerEditAnalysisJson");
  if (!element) return;
  const analysis = drawerRow?.analysis_data || drawerRow?.["分析数据"] || {};
  const hasAnalysis = analysis && typeof analysis === "object" && Object.keys(analysis).length;
  document.querySelector("#drawerEditAnalysisStatus").textContent = hasAnalysis ? "最新结果" : "暂无结果";
  renderHighlightedJson("#drawerEditAnalysisJson", hasAnalysis ? analysis : {});
}

function renderDrawerResult() {
  const result = drawerRow?.model_result || {};
  const hasResult = result && typeof result === "object" && Object.keys(result).length;
  document.querySelector("#drawerResultStatus").textContent = hasResult ? "最新标注结果" : "暂无标注结果";
  renderHighlightedJson("#drawerResultJson", hasResult ? result : {});
  const promptItems = renderedPromptItems(drawerRow?.rendered_prompt);
  const promptText = formatRenderedPromptItems(promptItems);
  document.querySelector("#drawerPromptText").innerHTML = promptItems.length
    ? promptItems.map(renderPromptItemHtml).join("")
    : `<div class="empty">暂无 Prompt</div>`;
  document.querySelector("#drawerPromptSize").textContent = promptSizeSummaryLabel(promptItems, promptText);
}

function renderedPromptItems(value) {
  if (!value) return [];
  let prompts = value;
  if (typeof value === "string") {
    try {
      prompts = JSON.parse(value);
    } catch {
      return [{ roleName: "Prompt", name: "原始 Prompt", promptId: "", content: value }];
    }
  }
  if (!prompts || typeof prompts !== "object") {
    return [{ roleName: "Prompt", name: "原始 Prompt", promptId: "", content: String(value) }];
  }
  return Object.entries(prompts).map(([roleName, prompt]) => {
    if (!prompt || typeof prompt !== "object") {
      return { roleName, name: "", promptId: "", content: String(prompt) };
    }
    return {
      roleName,
      name: prompt.name || "",
      promptId: prompt.prompt_id || "",
      content: prompt.content || "",
    };
  });
}

function formatRenderedPromptItems(items) {
  return (items || []).map((item) => [
    `[${item.roleName}] ${item.name || ""}`.trim(),
    `prompt_id: ${item.promptId || ""}`,
    "",
    item.content || "",
  ].join("\n")).join("\n\n---\n\n") || "暂无 Prompt";
}

function renderPromptItemHtml(item) {
  const title = `[${item.roleName}] ${item.name || ""}`.trim();
  const content = item.content || "";
  return `
    <article class="drawer-prompt-item">
      <div class="drawer-prompt-item-head">
        <strong>${escapeHtml(title || "Prompt")}</strong>
        <span>${promptSizeLabel(content)}</span>
      </div>
      ${item.promptId ? `<p class="drawer-prompt-id">prompt_id: ${escapeHtml(item.promptId)}</p>` : ""}
      <pre>${escapeHtml(content || "暂无 Prompt 内容")}</pre>
    </article>
  `;
}

function promptSizeSummaryLabel(items, text) {
  const count = items.length;
  const total = promptSizeLabel(text);
  return count > 1 ? `总 ${total} · ${count} 个 Prompt` : total;
}

function promptSizeLabel(text) {
  const value = text && text !== "暂无 Prompt" ? String(text) : "";
  const bytes = new TextEncoder().encode(value).length;
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
}

async function renderDrawerAnnotationHistory() {
  if (!drawerRow?.row_id || !state.activeDatasetId) return;
  const requestId = ++drawerAnnotationHistoryRequest;
  const status = document.querySelector("#drawerHistoryStatus");
  const list = document.querySelector("#drawerHistoryList");
  status.textContent = "加载中";
  list.innerHTML = `<div class="empty">正在读取历史标注...</div>`;
  try {
    const rows = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}/annotation-history${schemeQuery()}`);
    if (requestId !== drawerAnnotationHistoryRequest || drawerMode !== "result") return;
    status.textContent = rows.length ? `${rows.length} 次记录` : "暂无历史";
    list.innerHTML = rows.map((row) => {
      const hasResult = row.model_result && Object.keys(row.model_result).length;
      const result = hasResult ? JSON.stringify(row.model_result, null, 2) : row.error || "暂无返回";
      const resultHtml = hasResult ? highlightJsonText(result) : escapeHtml(result);
      return `
        <article class="drawer-history-item">
          <div class="drawer-history-head">
            <span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status || "未知")}</span>
            <strong>${escapeHtml(formatHistoryTime(row.finished_at || row.updated_at || row.created_at))}</strong>
          </div>
          <div class="drawer-history-meta">任务 ${escapeHtml(row.task_id || "-")} · 方案 ${escapeHtml(row.scheme_id || "-")}</div>
          <pre class="${hasResult ? "json-highlight" : ""}">${resultHtml}</pre>
        </article>
      `;
    }).join("") || `<div class="empty">暂无历史标注记录</div>`;
  } catch (error) {
    if (requestId !== drawerAnnotationHistoryRequest) return;
    status.textContent = "读取失败";
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderHighlightedJson(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  element.innerHTML = highlightJsonText(text || "{}");
}

function formatDisplayPayload(value) {
  const parsed = parseJsonLike(value);
  if (parsed.ok) {
    const text = JSON.stringify(parsed.value, null, 2);
    return { text, html: highlightJsonText(text), isJson: true };
  }
  const text = formatDisplayValue(value);
  return { text, html: escapeHtml(text), isJson: false };
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

function toggleDrawerAnalysisResultPopover() {
  const popover = document.querySelector("#drawerAnalysisResultPopover");
  popover.hidden = !popover.hidden;
}

function handleDrawerAnalysisResultPopoverClick(event) {
  const action = event.target.closest("[data-analysis-result-action]")?.dataset.analysisResultAction;
  if (action) {
    if (action === "all") {
      drawerSelectedAnalysisIds = new Set(drawerAnalysisHistoryRows.map((row) => row.id));
    }
    if (action === "clear") {
      drawerSelectedAnalysisIds = new Set();
    }
    if (action === "latest") {
      drawerSelectedAnalysisIds = new Set(drawerAnalysisHistoryRows[0]?.id ? [drawerAnalysisHistoryRows[0].id] : []);
    }
    renderDrawerAnalysisResultFilter();
    renderDrawerAnalysisResultList();
    return;
  }
  if (event.target.matches('input[type="checkbox"]')) {
    if (event.target.checked) drawerSelectedAnalysisIds.add(event.target.value);
    else drawerSelectedAnalysisIds.delete(event.target.value);
    renderDrawerAnalysisResultList();
  }
}

function renderDrawerKeyValues(selector, payload, emptyText = "暂无数据") {
  const container = document.querySelector(selector);
  container.innerHTML = drawerKeyValueRowsHtml(payload, emptyText);
}

function drawerKeyValueRowsHtml(payload, emptyText = "暂无数据") {
  const entries = Object.entries(payload || {});
  return entries.map(([key, value]) => {
    const display = formatDisplayPayload(value);
    const needsFullLoad = drawerFieldNeedsFullLoad(key);
    const collapsed = needsFullLoad || shouldCollapseDrawerValue(display.text);
    return `
    <article class="drawer-kv-row ${collapsed ? "is-collapsible is-collapsed" : ""}" data-drawer-field="${escapeHtml(key)}">
      <div class="drawer-kv-key" title="${escapeHtml(key)}">
        <span>${escapeHtml(key)}</span>
        ${collapsed ? `<button class="drawer-kv-toggle" type="button" data-drawer-kv-toggle>${needsFullLoad ? "加载完整" : "展开"}</button>` : ""}
      </div>
      <div class="drawer-kv-value-wrap">
        <div class="drawer-kv-value ${display.isJson ? "json-highlight" : ""}">${display.html}</div>
        <button class="drawer-kv-copy" type="button" data-drawer-kv-copy title="复制值" aria-label="复制值">⧉</button>
      </div>
    </article>
  `;
  }).join("") || `<div class="empty">${emptyText}</div>`;
}

function drawerFieldNeedsFullLoad(key) {
  const largeFields = drawerRow?.__large_fields || [];
  return Array.isArray(largeFields) && largeFields.includes(key) && !drawerFullFields.has(key);
}

async function loadDrawerFieldValue(key) {
  if (!drawerRow?.row_id || !state.activeDatasetId || !key) return false;
  const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${drawerRow.row_id}/fields/${encodeURIComponent(key)}${schemeQuery()}`);
  drawerRow = { ...drawerRow, [key]: result.value };
  drawerFullFields.add(key);
  return result.exists;
}

function drawerEditableData() {
  return editableDetailDataFrom(drawerRow || {});
}

function shouldCollapseDrawerValue(text) {
  const value = String(text || "");
  return value.length > 360 || value.split("\n").length > 8;
}

async function handleDrawerKvToggle(event) {
  const blockCopyButton = event.target.closest("[data-drawer-copy-block]");
  if (blockCopyButton) {
    await handleDrawerBlockCopy(blockCopyButton);
    return;
  }
  const copyButton = event.target.closest("[data-drawer-kv-copy]");
  if (copyButton) {
    await handleDrawerKvCopy(copyButton);
    return;
  }
  const button = event.target.closest("[data-drawer-kv-toggle]");
  if (!button) return;
  const row = button.closest(".drawer-kv-row");
  if (!row) return;
  const key = row.dataset.drawerField || "";
  if (drawerFieldNeedsFullLoad(key)) {
    button.disabled = true;
    button.textContent = "读取中";
    try {
      await loadDrawerFieldValue(key);
      const display = formatDisplayPayload(drawerRow?.[key]);
      const valueNode = row.querySelector(".drawer-kv-value");
      if (valueNode) {
        valueNode.classList.toggle("json-highlight", display.isJson);
        valueNode.innerHTML = display.html;
      }
      row.classList.remove("is-collapsed");
      button.disabled = false;
      button.textContent = "收起";
    } catch (error) {
      button.disabled = false;
      button.textContent = "加载完整";
      toast(error.message);
    }
    return;
  }
  const collapsed = row.classList.toggle("is-collapsed");
  button.textContent = collapsed ? "展开" : "收起";
}

async function handleDrawerBlockCopy(button) {
  const targetSelector = button.dataset.drawerCopyBlock || "";
  const target = targetSelector ? document.querySelector(targetSelector) : null;
  const content = target?.textContent || "";
  if (!content.trim()) {
    toast("暂无可复制内容");
    return;
  }
  button.disabled = true;
  try {
    await copyTextToClipboard(content, "已复制内容");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleDrawerKvCopy(button) {
  const row = button.closest(".drawer-kv-row");
  if (!row) return;
  const key = row.dataset.drawerField || "";
  const valueNode = row.querySelector(".drawer-kv-value");
  try {
    if (drawerFieldNeedsFullLoad(key)) {
      button.disabled = true;
      await loadDrawerFieldValue(key);
      const display = formatDisplayPayload(drawerRow?.[key]);
      if (valueNode) {
        valueNode.classList.toggle("json-highlight", display.isJson);
        valueNode.innerHTML = display.html;
      }
      row.classList.remove("is-collapsed");
      const toggle = row.querySelector("[data-drawer-kv-toggle]");
      if (toggle) toggle.textContent = "收起";
    }
    const content = valueNode?.textContent || "";
    if (!content.trim()) {
      toast("暂无可复制内容");
      return;
    }
    await copyTextToClipboard(content, "已复制内容");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
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

function resetDrawerWidth() {
  document.querySelector(".detail-drawer")?.style.removeProperty("--drawer-width");
}

function startDrawerAnalysisSplitResize(event) {
  const layout = document.querySelector(".drawer-analysis-layout");
  if (!layout) return;
  event.preventDefault();
  stopDrawerAnalysisSplitResize();
  document.body.classList.add("is-resizing-drawer-split");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    const rect = layout.getBoundingClientRect();
    const gutter = 12;
    const minLeft = Math.min(360, Math.max(220, rect.width * 0.24));
    const minRight = Math.min(380, Math.max(260, rect.width * 0.28));
    const maxLeft = rect.width - minRight - gutter;
    const nextLeft = moveEvent.clientX - rect.left;
    const clamped = Math.max(minLeft, Math.min(nextLeft, maxLeft));
    layout.style.setProperty("--analysis-left", `${Math.round(clamped)}px`);
  };
  const stop = () => stopDrawerAnalysisSplitResize();
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
  drawerAnalysisSplitCleanup = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    document.body.classList.remove("is-resizing-drawer-split");
  };
}

function stopDrawerAnalysisSplitResize() {
  if (!drawerAnalysisSplitCleanup) return;
  drawerAnalysisSplitCleanup();
  drawerAnalysisSplitCleanup = null;
}

function renderDetailPayload() {
  const text = JSON.stringify(currentDetailRow || {}, null, 2);
  renderDetailKeyValues(currentDetailRow || {});
  document.querySelector("#rowDetailKv").hidden = false;
  renderHighlightedJson("#rowDetailJson", text);
  document.querySelector("#rowDetailEditor").value = JSON.stringify(editableDetailData(), null, 2);
  const analysis = currentDetailRow?.analysis_data || currentDetailRow?.["分析数据"];
  renderHighlightedJson("#rowAnalysisJson", analysis || {});
}

function renderDetailKeyValues(payload) {
  const container = document.querySelector("#rowDetailKv");
  const entries = Object.entries(payload || {});
  container.innerHTML = entries.map(([key, value]) => {
    const display = formatDisplayPayload(value);
    return `
      <div class="kv-row">
        <div class="kv-key" title="${escapeHtml(key)}">${escapeHtml(key)}</div>
        <div class="kv-value ${display.isJson ? "json-highlight" : ""}">${display.html}</div>
      </div>
    `;
  }).join("") || `<div class="empty">暂无数据</div>`;
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
    const updated = await api(`/api/datasets/${state.activeDatasetId}/rows/${currentDetailRow.row_id}${schemeQuery()}`, {
      method: "PUT",
      body: JSON.stringify({ raw_data: rawData }),
    });
    currentDetailRow = updated;
    await ensureDynamicResultColumns(updated);
    updateVisibleRow(updated.row_id, updated);
    renderDetailPayload();
    setDetailMode("view");
    await refreshMetrics();
    toast("行数据已保存");
  } catch (error) {
    toast(error.message);
  }
}

function editableDetailData() {
  return editableDetailDataFrom(currentDetailRow || {});
}

function editableDetailDataFrom(row) {
  const reserved = new Set(["row_id", "row_index", "display_index", "状态", "model_result", "analysis_data", "rendered_prompt"]);
  return Object.fromEntries(
    Object.entries(row || {}).filter(([key]) => !reserved.has(key) && !key.startsWith("__")),
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
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/${currentDetailRow.row_id}/analysis${schemeQuery()}`, { method: "POST" });
    const analysisData = result.analysis_data || {};
    currentDetailRow = { ...currentDetailRow, analysis_data: analysisData, 分析数据: analysisData };
    await ensureDynamicResultColumns({ 分析数据: analysisData });
    updateVisibleRow(currentDetailRow.row_id, { 分析数据: analysisData });
    await refreshWorkbench();
    document.querySelector("#rowAnalysisStatus").textContent = "分析完成";
    renderHighlightedJson("#rowAnalysisJson", analysisData);
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

async function reindexRows() {
  if (!state.activeDatasetId) {
    toast("请先选择数据集");
    return;
  }
  const datasetName = state.datasets.find((item) => item.id === state.activeDatasetId)?.name || "当前数据集";
  const ok = await confirmAction({
    title: "刷新序号",
    message: `确认刷新“${datasetName}”的序号？`,
    details: ["系统会按当前数据集的入库顺序重新写入序号，从 1 开始连续排列。"],
    confirmText: "刷新序号",
    variant: "warning",
  });
  if (!ok) return;
  showTableLoading("正在刷新序号...");
  try {
    const result = await api(`/api/datasets/${state.activeDatasetId}/rows/reindex`, { method: "POST" });
    document.querySelector("#selectCurrentPage").checked = false;
    table?.deselectRow?.();
    setBatchButtonState();
    await refreshWorkbench();
    scheduleMetricsRefresh(0);
    toast(`序号已刷新：共 ${Number(result.row_count || 0).toLocaleString()} 行，更新 ${Number(result.updated_count || 0).toLocaleString()} 行`);
  } catch (error) {
    toast(error.message);
  } finally {
    hideTableLoading();
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
  const ok = await confirmAction({
    title: "删除行数据",
    message: "确认删除这行数据？",
    details: ["该行会从当前数据集中移除。"],
    confirmText: "删除行",
    variant: "danger",
  });
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
  const ok = await confirmAction({
    title: "删除选中数据",
    message: `确认删除选中的 ${selectedIds.length} 行数据？`,
    details: ["删除后这些行会从当前数据集中移除。"],
    confirmText: "删除选中行",
    variant: "danger",
  });
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
  columnSettingsOriginalFontSize = tableFontSize;
  setColumnSettingsLoading(true);
  document.querySelector("#columnSettingsModal").classList.add("open");
  try {
    await refreshAvailableDatasetColumns();
    latestFieldMapping = await api(`/api/field-mapping?scene_id=${encodeURIComponent(state.activeSceneId)}`);
    renderColumnSettings();
  } catch (error) {
    closeColumnSettings();
    toast(error.message);
  } finally {
    setColumnSettingsLoading(false);
  }
}

function setColumnSettingsLoading(loading) {
  const grid = document.querySelector("#columnSettingsGrid");
  const loadingPanel = document.querySelector("#columnSettingsLoading");
  const saveButton = document.querySelector("#saveColumnSettings");
  const selectAllButton = document.querySelector("#selectAllColumns");
  const clearAllButton = document.querySelector("#clearAllColumns");
  if (grid) {
    grid.hidden = loading;
    if (loading) grid.innerHTML = "";
  }
  if (loadingPanel) loadingPanel.hidden = !loading;
  [saveButton, selectAllButton, clearAllButton].forEach((button) => {
    if (button) button.disabled = loading;
  });
}

async function refreshAvailableDatasetColumns() {
  if (!state.activeDatasetId) return;
  const payload = await api(`/api/datasets/${state.activeDatasetId}/rows?page=1&page_size=1${state.activeSchemeId ? `&scheme_id=${encodeURIComponent(state.activeSchemeId)}` : ""}`);
  if (Array.isArray(payload.columns) && payload.columns.length) {
    mergeAvailableDatasetColumns(payload.columns);
  }
  if (Array.isArray(payload.model_result_columns)) {
    mergeAvailableModelResultColumns(payload.model_result_columns);
  }
}

function mergeAvailableDatasetColumns(columns) {
  let changed = false;
  for (const column of columns || []) {
    if (!column || availableDatasetColumns.includes(column)) continue;
    availableDatasetColumns.push(column);
    changed = true;
  }
  if (changed) fillSearchColumnOptions(allConfigurableColumns());
}

function mergeAvailableModelResultColumns(columns) {
  let changed = false;
  for (const column of columns || []) {
    if (!column || availableModelResultColumns.includes(column)) continue;
    availableModelResultColumns.push(column);
    changed = true;
  }
  if (changed) fillSearchColumnOptions(allConfigurableColumns());
}

function closeColumnSettings() {
  if (document.querySelector("#columnSettingsModal")?.classList.contains("open")) {
    tableFontSize = columnSettingsOriginalFontSize;
    applyTableFontSize();
  }
  document.querySelector("#columnSettingsModal")?.classList.remove("open");
}

function renderColumnSettings() {
  const grid = document.querySelector("#columnSettingsGrid");
  const configurableColumns = allConfigurableColumns();
  const selected = new Set(latestFieldMapping?.visible_columns?.length ? latestFieldMapping.visible_columns : configurableColumns);
  const fixedColumns = new Set(fixedMappingColumns(configurableColumns));
  fixedColumns.forEach((column) => selected.add(column));
  const resultColumns = uniqueColumns(availableModelResultColumns);
  const resultColumnSet = new Set(resultColumns);
  const excelColumns = availableDatasetColumns.filter((column) => !resultColumnSet.has(column));
  grid.innerHTML = `
    ${columnSettingsSectionHtml("Excel 原始列", "来自导入 Excel 和字段映射的基础列。人工、标注固定列默认保留。", excelColumns, selected, "excel", fixedColumns)}
    ${columnSettingsSectionHtml("标注返回列", "标注方法返回 dict 的 key。标注答案列默认保留，其余字段按需显示。", resultColumns, selected, "result", fixedColumns)}
  `;
  syncTableFontSizeSegment();
}

function columnSettingsSectionHtml(title, description, columns, selected, type = "", fixedColumns = new Set()) {
  return `
    <section class="column-settings-section ${type ? `column-settings-section-${type}` : ""}">
      <div class="column-settings-section-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <div class="column-chip-grid compact">
        ${columns.map((column) => {
          const fixed = fixedColumns.has(column);
          return `
    <label class="column-chip ${fixed ? "locked" : ""}">
      <input type="checkbox" value="${escapeHtml(column)}" ${selected.has(column) ? "checked" : ""} ${fixed ? "disabled data-fixed-column=\"true\"" : ""}>
      <span title="${escapeHtml(column)}">${escapeHtml(columnSettingsDisplayName(column, type))}</span>
      ${fixed ? `<em>固定</em>` : ""}
    </label>
        `;
        }).join("") || `<div class="empty">暂无可配置列</div>`}
      </div>
    </section>
  `;
}

function columnSettingsDisplayName(column, type = "") {
  if (type !== "result") return column;
  return String(column || "")
    .replace(/^标注结果[｜.]/, "")
    .replace(/^角色标注结果[｜.]/, "");
}

function setColumnSettingsChecked(checked) {
  document.querySelectorAll("#columnSettingsGrid input[type='checkbox']").forEach((input) => {
    if (input.dataset.fixedColumn === "true") {
      input.checked = true;
      return;
    }
    input.checked = checked;
  });
}

async function saveColumnSettings() {
  if (!state.activeSceneId) return;
  const fixedColumns = fixedMappingColumns(allConfigurableColumns());
  const visibleColumns = uniqueColumns([
    ...fixedColumns,
    ...[...document.querySelectorAll("#columnSettingsGrid input:checked")].map((input) => input.value),
  ]);
  if (!visibleColumns.length) {
    toast("至少保留一列用于列表展示");
    return;
  }
    const mapping = latestFieldMapping || {
      human_answer_column: "",
      model_answer_column: "",
      root_cause_column: "",
      annotation_columns: [],
    };
  try {
    localStorage.setItem("llm-table-font-size", tableFontSize);
    latestFieldMapping = await api("/api/field-mapping", {
      method: "PUT",
      body: JSON.stringify({
        scene_id: state.activeSceneId,
        human_answer_column: mapping.human_answer_column || "",
        model_answer_column: mapping.model_answer_column || "",
        root_cause_column: mapping.root_cause_column || "",
        visible_columns: visibleColumns,
        annotation_columns: mapping.annotation_columns || [],
      }),
    });
    columnSettingsOriginalFontSize = tableFontSize;
    closeColumnSettings();
    await refreshWorkbench();
    toast("列设置已保存");
  } catch (error) {
    toast(error.message);
  }
}

function normalizeTableFontSize(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function handleTableFontSizeChange(event) {
  const input = event.target.closest('input[name="tableFontSize"]');
  if (!input) return;
  tableFontSize = normalizeTableFontSize(input.value);
  applyTableFontSize();
  table?.redraw?.(true);
}

function syncTableFontSizeSegment() {
  document.querySelectorAll('input[name="tableFontSize"]').forEach((input) => {
    input.checked = input.value === tableFontSize;
  });
  const label = tableFontSizeLabels[tableFontSize] || tableFontSizeLabels.medium;
  document.querySelector("#tableFontSizeSegment")?.setAttribute("aria-label", `列表字体大小：${label}`);
}

function applyTableFontSize() {
  const size = normalizeTableFontSize(tableFontSize);
  document.documentElement.dataset.tableFontSize = size;
  document.querySelector(".workbench-pro")?.setAttribute("data-table-font-size", size);
  syncTableFontSizeSegment();
}

function previewColumn(column) {
  const text = String(column || "");
  const compact = text.toLowerCase().replace(/[\s_-]+/g, "");
  return (
    isAnalysisResultColumn(text)
    || /API Part|API Order|Summary|标注数据|分析数据|模型说明|raw_output|抽检人/.test(text)
    || compact.includes("apiorder")
    || compact.includes("apiorderinfo")
    || /^api数据part[1-7]$/.test(compact)
    || /^apidata(part)?[1-7]$/.test(compact)
    || compact.includes("rootcause")
    || compact.includes("jbreport")
  );
}

function textPreviewFormatter(cell) {
  const value = cell.getValue();
  if (value === null || value === undefined) return "";
  const text = String(value);
  const preview = text.length > 72 ? `${text.slice(0, 72)}...` : text;
  return `
    <span class="cell-preview-text" title="${escapeHtml(text)}">
      <i class="cell-preview-dot" aria-hidden="true"></i>
      <span>${escapeHtml(preview)}</span>
    </span>
  `;
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
  if (status === "排队中") {
    return { label: "排队中", className: "queued", disabled: true };
  }
  if (status === "标注中") {
    return { label: "标注中", className: "running", disabled: true };
  }
  if ((status || "未标注") === "未标注") {
    return { label: "标注", className: "primary" };
  }
  return { label: "重新标注", className: "reannotate" };
}

function favoriteButtonMeta(rowData) {
  const isFavorite = isFavoriteValue(rowData?.is_favorite) || isFavoriteValue(rowData?.收藏);
  return isFavorite
    ? { label: "已藏", className: "favorite active" }
    : { label: "收藏", className: "favorite" };
}

async function startAnnotationTask(mode, rowIds = []) {
  if (!state.activeDatasetId || !state.activeSchemeId) {
    toast("请先选择数据集和标注方案");
    return;
  }
  if (mode === "all" || mode === "filtered") {
    const confirmed = await confirmFullAnnotationTask(mode);
    if (!confirmed) return;
  }
  const selectedIds = rowIds.length
    ? rowIds
    : table?.getSelectedRows?.().map((row) => row.getData().row_id).filter(Boolean) || [];
  if (mode === "selected" && !selectedIds.length) {
    toast("请先选择需要标注的行");
    return;
  }
  if (mode === "selected" && !rowIds.length) {
    const ok = await confirmAction({
      title: "开始批量标注",
      message: `确认开始批量标注选中的 ${selectedIds.length} 行？`,
      details: ["排队中和标注中的数据会被跳过。"],
      confirmText: "开始标注",
      variant: "primary",
    });
    if (!ok) return;
  }
  const optimisticRowIds = getOptimisticTaskRowIds(mode, selectedIds);
  const optimisticStatuses = captureVisibleRowStatuses(optimisticRowIds);
  markRowsQueuedForTask(optimisticRowIds);
  try {
    const task = await api("/api/annotation-tasks", {
      method: "POST",
      body: JSON.stringify({
        dataset_id: state.activeDatasetId,
        scheme_id: state.activeSchemeId,
        row_ids: selectedIds,
        mode,
        filters: mode === "filtered" ? buildAnnotationFilterPayload() : {},
      }),
    });
    currentTask = task;
    updateTaskStrip(task);
    markInitialRunningRowsForTask(optimisticRowIds, task.concurrency || 1);
    connectTaskEvents(task.id);
    table?.deselectRow?.();
    setBatchButtonState();
    scheduleMetricsRefresh(0);
    const taskLabel = mode === "filtered" ? "筛选数据标注任务" : "全量标注任务";
    toast(mode === "all" || mode === "filtered" ? `${taskLabel}已启动，本次 ${task.total_count || 0} 条` : "批量标注任务已启动");
  } catch (error) {
    restoreRowsStatus(optimisticStatuses);
    toast(error.message);
  }
}

async function confirmFullAnnotationTask(mode = "all") {
  const isFiltered = mode === "filtered";
  try {
    let totalCount = 0;
    let queued = 0;
    let running = 0;
    if (isFiltered) {
      const preview = await api("/api/annotation-tasks/preview", {
        method: "POST",
        body: JSON.stringify({
          dataset_id: state.activeDatasetId,
          scheme_id: state.activeSchemeId,
          row_ids: [],
          mode,
          filters: buildAnnotationFilterPayload(),
        }),
      });
      totalCount = Number(preview.total_count || 0);
      queued = Number(preview.skipped_queued_count || 0);
      running = Number(preview.skipped_running_count || 0);
    } else {
      const metrics = await api(`/api/datasets/${state.activeDatasetId}/metrics${schemeQuery()}`);
      queued = Number(metrics.queued || 0);
      running = Number(metrics.running || 0);
      const total = Number(metrics.total || 0);
      totalCount = Math.max(total - queued - running, 0);
    }
    if (!totalCount) {
      toast("当前没有可创建任务的数据行，排队中和标注中的数据会被跳过");
      return false;
    }
    const details = [
      `本次将标注 ${totalCount} 条数据。`,
      `当前有 ${running} 条标注中、${queued} 条排队中，会自动跳过。`,
    ];
    return confirmAction({
      title: isFiltered ? "全量标注(已筛选)" : "开始全量标注",
      message: isFiltered ? "确认标注当前筛选条件下的全部数据？" : "确认开始全量标注？",
      details,
      confirmText: isFiltered ? "开始标注筛选数据" : "开始全量标注",
      variant: "primary",
    });
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
  const running = currentTask.running_count || 0;
  const ok = await confirmAction({
    title: "停止未完成标注",
    message: "确认停止未完成标注？",
    details: [`当前还有 ${queued} 条排队中、${running} 条标注中。`, "标注中的调用会在返回后丢弃结果并保持取消状态。"],
    confirmText: "停止任务",
    variant: "warning",
  });
  if (!ok) return;
  try {
    const result = await api(`/api/annotation-tasks/${currentTask.id}/stop-unfinished`, { method: "POST" });
    currentTask = result.task;
    updateTaskStrip(currentTask);
    markRowsCancelled(result.cancelled_row_ids || []);
    scheduleMetricsRefresh(0);
    toast(`已停止 ${result.cancelled_count || queued + running} 条未完成标注`);
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
      error_recall: null,
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
    setMetrics(await api(`/api/datasets/${state.activeDatasetId}/metrics${schemeQuery()}`));
  } catch {
    // 指标接口异常时保持当前表格可用。
  }
}

function setMetrics(metrics) {
  const done = (metrics.tp || 0) + (metrics.tn || 0) + (metrics.fp || 0) + (metrics.fn || 0);
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
  document.querySelector("#metricSpecificity").textContent = formatRate(metrics.error_recall ?? metrics.specificity ?? metrics.error_precision);
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
    const params = new URLSearchParams({ dataset_id: state.activeDatasetId });
    if (state.activeSchemeId) params.set("scheme_id", state.activeSchemeId);
    const tasks = await api(`/api/annotation-tasks?${params.toString()}`);
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
    if (payload.task?.scheme_id && state.activeSchemeId && payload.task.scheme_id !== state.activeSchemeId) return;
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
    if (payload.type === "task_finished" || isTaskTerminal(payload.task)) {
      closeTaskEvents();
      await refreshWorkbench();
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

function isTaskTerminal(task) {
  return ["done", "failed", "cancelled", "stopped"].includes(task?.status);
}

function scheduleMetricsRefresh(delay = 220) {
  window.clearTimeout(metricsTimer);
  metricsTimer = window.setTimeout(() => refreshMetrics(), delay);
}

function dataColumnDef(column, sampleRows = []) {
  const mappedAnswer = fixedMappingColumns().includes(column);
  const title = mappedAnswerTitle(column) || column;
  return {
    title,
    titleFormatter: () => columnHeaderHtml(title, column),
    field: column,
    minWidth: mappedAnswer ? 96 : 104,
    width: mappedAnswer ? 96 : estimateColumnWidth(column, sampleRows),
    maxWidth: mappedAnswer ? 108 : (previewColumn(column) ? 320 : 220),
    widthGrow: 0,
    widthShrink: 0,
    frozen: mappedAnswer,
    headerSort: false,
    formatter: mappedAnswer ? answerValueFormatter : (previewColumn(column) ? textPreviewFormatter : undefined),
    cssClass: [mappedAnswer ? "answer-cell" : "", previewColumn(column) ? "cell-preview" : ""].filter(Boolean).join(" "),
  };
}

function columnHeaderHtml(title, column) {
  const active = columnFilter.column === column && (columnFilter.value || columnFilter.empty);
  const mappedAnswer = fixedMappingColumns().includes(column);
  return `
    <span class="column-title-wrap">
      <span class="column-title-text" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
      ${mappedAnswer ? "" : `
        <button class="column-filter-button ${active ? "active" : ""}" type="button" data-column-filter="${escapeHtml(column)}" aria-label="筛选 ${escapeHtml(title)}" aria-expanded="false"></button>
        <button class="column-sort-button ${activeSort.column === column ? `active ${activeSort.dir}` : ""}" type="button" data-column-sort="${escapeHtml(column)}" data-sort-dir="${escapeHtml(activeSort.column === column ? activeSort.dir : "")}" aria-label="${escapeHtml(title)}：${activeSort.column === column ? (activeSort.dir === "asc" ? "升序排序" : "降序排序") : "未排序"}"></button>
      `}
    </span>
  `;
}

function rowIndexHeaderHtml() {
  const active = columnFilter.column === "display_index" && (columnFilter.value || columnFilter.empty);
  return `
    <span class="column-title-wrap row-index-title-wrap">
      <span class="column-title-text" title="序号">序号</span>
      <button class="column-filter-button ${active ? "active" : ""}" type="button" data-column-filter="display_index" aria-label="筛选序号" aria-expanded="false"></button>
    </span>
  `;
}

function mappedAnswerTitle(column) {
  if (column && column === latestFieldMapping?.human_answer_column) return "人工答案";
  if (column && column === latestFieldMapping?.model_answer_column) return "标注答案";
  return "";
}

function answerValueFormatter(cell) {
  const rawValue = cell.getValue();
  const text = String(rawValue ?? "").trim();
  const normalized = normalizeAnswerValue(text);
  const className = normalized === "是" ? "yes" : (normalized === "否" ? "no" : "neutral");
  const label = normalized || text || "-";
  return `<span class="answer-pill ${className}" title="${escapeHtml(text)}">${escapeHtml(label)}</span>`;
}

function normalizeAnswerValue(value) {
  let text = String(value ?? "").trim();
  if (!text) return "";
  text = text.replace(/^mock[_\-:：\s]*/i, "").trim();
  const compact = text.toLowerCase().replace(/\s+/g, "");
  if (["1", "true", "yes", "y", "positive", "pos", "是", "有", "正", "正例", "阳性", "命中"].includes(compact)) return "是";
  if (["0", "false", "no", "n", "negative", "neg", "否", "无", "负", "负例", "阴性", "未命中"].includes(compact)) return "否";
  return text;
}

function estimateColumnWidth(column, sampleRows = []) {
  const maxContentUnits = Math.max(
    measureTextUnits(column),
    ...sampleRows.slice(0, 20).map((row) => measureTextUnits(row?.[column])),
  );
  const headerWidth = Math.ceil(measureTextUnits(mappedAnswerTitle(column) || column) * 7.4 + 112);
  const rawWidth = Math.ceil(maxContentUnits * 7.4 + 78);
  const maxWidth = previewColumn(column) ? 320 : 220;
  const minWidth = compactColumn(column) ? 104 : 116;
  return Math.max(minWidth, Math.min(Math.max(rawWidth, headerWidth), maxWidth));
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
    .filter((data) => (mode === "all" || mode === "filtered" || selectedSet.has(data.row_id)) && canQueueRow(data))
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

function captureVisibleRowStatuses(rowIds) {
  if (!table) return new Map();
  const idSet = new Set(rowIds);
  const statuses = new Map();
  table.getRows().forEach((row) => {
    const data = row.getData();
    if (idSet.has(data.row_id)) {
      statuses.set(data.row_id, data["状态"] || "未标注");
    }
  });
  return statuses;
}

function restoreRowsStatus(statuses) {
  if (!table || !statuses?.size) return;
  table.getRows().forEach((row) => {
    const data = row.getData();
    if (statuses.has(data.row_id)) {
      updateTableRow(row, { 状态: statuses.get(data.row_id) });
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
  if (!table || !payload?.type || !tableReadyForRealtime) return;
  if (payload.type === "row_started") {
    updateVisibleRow(payload.row_id, { 状态: payload.status || "标注中" });
    return;
  }
    if (payload.type === "row_updated") {
      const result = payload.model_result || {};
      const flattenedResult = flattenModelResultForDisplay(result);
      let status = payload.status || (payload.error ? "失败" : "");
    let fullRow = null;
    if (!status && state.activeDatasetId && payload.row_id) {
      try {
        fullRow = await api(`/api/datasets/${state.activeDatasetId}/rows/${payload.row_id}${schemeQuery()}`);
        status = fullRow?.["状态"] || "";
      } catch {
        status = "";
      }
    }
    await ensureDynamicResultColumns(result);
    updateVisibleRow(payload.row_id, { ...(fullRow || {}), ...result, ...flattenedResult, ...(status ? { 状态: status } : {}) });
    if (drawerRow?.row_id === payload.row_id) {
      const latestResult = Object.keys(result).length ? result : fullRow?.model_result || drawerRow.model_result || {};
      drawerRow = {
        ...drawerRow,
        ...(fullRow || {}),
        ...result,
        ...flattenedResult,
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
    await refreshWorkbench();
    if (drawerRow?.row_id === payload.row_id) {
      drawerRow = { ...drawerRow, analysis_data: payload.analysis_data || {}, 分析数据: payload.analysis_data || {} };
      if (drawerMode === "analysis") renderDrawerAnalysisHistory();
      if (drawerMode === "edit") renderDrawerEditAnalysis();
    }
    return;
  }
  if (payload.type === "task_stopped") {
    markRowsCancelled(payload.cancelled_row_ids || []);
  }
}

function updateVisibleRow(rowId, patch) {
  if (!table || !rowId || !patch) return;
  try {
    const row = (table.getRows?.("visible") || table.getRows?.() || [])
      .find((item) => item.getData?.()?.row_id === rowId);
    if (row) {
      updateTableRow(row, patch);
    }
  } catch {
    // 行不在当前页时无需处理，切页时会从后端读取最新状态。
  }
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
    scheduleTableLayoutRepair();
  } catch {
    // Tabulator 在远程分页切换时可能已移除该行，忽略即可。
  }
}

async function ensureDynamicResultColumns(result) {
  if (!result || typeof result !== "object") return;
  const dynamicColumns = modelResultDisplayColumns(result);
  mergeAvailableDatasetColumns(dynamicColumns);
  mergeAvailableModelResultColumns(dynamicColumns);
  scheduleTableLayoutRepair();
}

function modelResultDisplayColumns(result) {
  return Object.keys(flattenModelResultForDisplay(result));
}

function flattenRoleModelResult(result) {
  const roleResults = result?.[ROLE_RESULT_KEY];
  if (!roleResults || typeof roleResults !== "object" || Array.isArray(roleResults)) return {};
  const flattened = {};
  Object.entries(roleResults).forEach(([roleName, roleResult]) => {
    if (!roleResult || typeof roleResult !== "object" || Array.isArray(roleResult)) return;
    Object.entries(flattenLeafValues(roleResult)).forEach(([key, value]) => {
      flattened[`${roleName}.${key}`] = value;
    });
  });
  return flattened;
}

function flattenModelResultForDisplay(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return {};
  const roleResult = flattenRoleModelResult(result);
  if (Object.keys(roleResult).length) return roleResult;
  return flattenLeafValues(
    Object.fromEntries(
      Object.entries(result).filter(([key]) => key !== ROLE_RESULT_KEY && key !== "角色标注答案"),
    ),
  );
}

function flattenLeafValues(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (!key) return acc;
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return { ...acc, ...flattenLeafValues(item, nextPrefix) };
    }, {});
  }
  return prefix ? { [prefix]: value } : {};
}

function updateTaskStrip(task) {
}

async function handleRowAction(action, rowId) {
  const rowData = getVisibleRowData(rowId);
  if (action === "view") {
    if (rowData) openRowDrawer(rowData, "result");
    return;
  }
  if (action === "edit") {
    if (rowData) openRowDrawer(rowData, "result");
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
  if (action === "favorite") {
    await toggleRowFavorite(rowId);
    return;
  }
  if (action === "stop") {
    await stopRowTask(rowId);
    return;
  }
  if (action === "annotate") {
    if (!canQueueRow(rowData)) {
      toast(`当前行${rowData?.状态 || "正在处理"}，请等待任务完成`);
      return;
    }
    await startAnnotationTask("selected", [rowId]);
    return;
  }
}

async function stopRowTask(rowId) {
  if (!state.activeDatasetId || !rowId) return;
  const rowData = getVisibleRowData(rowId);
  const status = rowData?.["状态"] || "";
  const ok = await confirmAction({
    title: "停止当前行任务",
    message: "确认停止当前行所属任务的未完成标注？",
    details: [`当前行状态：${status || "未知"}`, "排队中和标注中的数据都会进入取消状态。"],
    confirmText: "停止任务",
    variant: "warning",
  });
  if (!ok) return;
  try {
    const params = new URLSearchParams({ dataset_id: state.activeDatasetId });
    if (state.activeSchemeId) params.set("scheme_id", state.activeSchemeId);
    const result = await api(`/api/annotation-tasks/rows/${encodeURIComponent(rowId)}/stop-unfinished?${params.toString()}`, { method: "POST" });
    markRowsCancelled(result.cancelled_row_ids || []);
    await refreshMetrics();
    if (currentTask?.id === result.task?.id) updateTaskStrip(result.task);
    toast(`已停止 ${result.cancelled_count || 0} 条未完成标注`);
  } catch (error) {
    toast(error.message);
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
