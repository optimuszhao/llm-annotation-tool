const tasks = [
  {
    id: "TASK-20260531-004",
    name: "错题集增强后全量标注",
    mode: "全量标注",
    dataset: "SPN_测试数据.xlsx",
    scheme: "质检员 + 复核员 · call_model",
    time: "05-31 18:20",
    status: "已完成",
    total: 12840,
    unannotated: 0,
    done: 12840,
    queued: 0,
    running: 0,
    tp: 5236,
    tn: 6548,
    fp: 496,
    fn: 560,
    algorithmAccuracy: 91.8,
    correctRecall: 90.4,
    correctPrecision: 91.3,
    errorPrecision: 92.9,
    f1: 90.8,
    businessAccuracy: 93.0,
  },
  {
    id: "TASK-20260531-003",
    name: "知识库规则 v3 批量回归",
    mode: "批量标注",
    dataset: "SPN_测试数据.xlsx",
    scheme: "质检员 + 复核员 · call_model",
    time: "05-31 15:42",
    status: "已完成",
    total: 12840,
    unannotated: 0,
    done: 12840,
    queued: 0,
    running: 0,
    tp: 5048,
    tn: 6281,
    fp: 742,
    fn: 769,
    algorithmAccuracy: 88.2,
    correctRecall: 86.8,
    correctPrecision: 87.2,
    errorPrecision: 89.4,
    f1: 87.0,
    businessAccuracy: 90.1,
  },
  {
    id: "TASK-20260530-009",
    name: "Prompt 角色裁判优化",
    mode: "批量标注",
    dataset: "售后审核_抽样集.xlsx",
    scheme: "裁判角色 · build_prompts_custom",
    time: "05-30 21:10",
    status: "已完成",
    total: 3200,
    unannotated: 0,
    done: 3200,
    queued: 0,
    running: 0,
    tp: 1196,
    tn: 1582,
    fp: 210,
    fn: 212,
    algorithmAccuracy: 86.8,
    correctRecall: 84.9,
    correctPrecision: 85.1,
    errorPrecision: 88.3,
    f1: 85.0,
    businessAccuracy: 88.5,
  },
  {
    id: "TASK-20260530-006",
    name: "基线方案 v1 全量标注",
    mode: "全量标注",
    dataset: "SPN_测试数据.xlsx",
    scheme: "质检员 + 复核员 · call_model",
    time: "05-30 13:05",
    status: "基线",
    total: 12840,
    unannotated: 0,
    done: 12840,
    queued: 0,
    running: 0,
    tp: 4811,
    tn: 6156,
    fp: 892,
    fn: 981,
    algorithmAccuracy: 85.4,
    correctRecall: 83.1,
    correctPrecision: 84.6,
    errorPrecision: 87.3,
    f1: 83.8,
    businessAccuracy: 87.7,
  },
];

const currentTask = tasks[0];
const previousTask = tasks[1];

const workbenchMetricGroups = [
  {
    title: "数据量",
    items: [
      ["总数", "total", "number"],
      ["未标注", "unannotated", "number"],
      ["已标注", "done", "number"],
      ["排队中", "queued", "number"],
      ["标注中", "running", "number"],
    ],
  },
  {
    title: "混淆矩阵",
    items: [
      ["TP", "tp", "number"],
      ["TN", "tn", "number"],
      ["FP", "fp", "number"],
      ["FN", "fn", "number"],
    ],
  },
  {
    title: "评估率",
    items: [
      ["算法准确率", "algorithmAccuracy", "rate"],
      ["正确查全率", "correctRecall", "rate"],
      ["正确查准率", "correctPrecision", "rate"],
      ["错误查准率", "errorPrecision", "rate"],
      ["F1 score", "f1", "rate"],
      ["业务准确率", "businessAccuracy", "rate"],
    ],
  },
];

export function renderEvaluationPage() {
  const root = document.querySelector("#page-evaluation");
  if (!root) return;
  root.innerHTML = `
    <div class="evaluation-layout evaluation-task-history">
      <header class="evaluation-head">
        <div>
          <p class="eyebrow">算法评估</p>
          <h1>查看历史标注任务，并对比两次任务结果</h1>
          <span>每次全量、批量或单条标注都会沉淀为任务；默认将最新任务和上一次任务进行指标对比。</span>
        </div>
        <div class="evaluation-head-actions">
          <button class="btn ghost" type="button">导出对比报告</button>
          <button class="btn primary" type="button">新增标注任务</button>
        </div>
      </header>

      <section class="evaluation-compare-hero">
        <article class="compare-task-card before">
          <span>对比基准</span>
          <strong>${previousTask.name}</strong>
          <p>${previousTask.id} · ${previousTask.time} · ${previousTask.mode}</p>
        </article>
        <div class="compare-arrow">对比</div>
        <article class="compare-task-card after">
          <span>当前任务</span>
          <strong>${currentTask.name}</strong>
          <p>${currentTask.id} · ${currentTask.time} · ${currentTask.mode}</p>
        </article>
      </section>

      <section class="evaluation-overview">
        ${renderSummaryStat("算法准确率", currentTask.algorithmAccuracy, previousTask.algorithmAccuracy, "rate")}
        ${renderSummaryStat("已标注", currentTask.done, previousTask.done, "number")}
        ${renderSummaryStat("FP", currentTask.fp, previousTask.fp, "number", true)}
        ${renderSummaryStat("FN", currentTask.fn, previousTask.fn, "number", true)}
      </section>

      <div class="evaluation-main-grid task-history-grid">
        <section class="evaluation-panel task-panel">
          <div class="evaluation-panel-head">
            <div>
              <strong>历史标注任务</strong>
              <span>选择任意两次已完成任务，即可查看任务结果对比。</span>
            </div>
            <button class="btn ghost" type="button">筛选任务</button>
          </div>
          <div class="task-list task-history-list">
            ${tasks.map((task, index) => renderTaskItem(task, index)).join("")}
          </div>
        </section>

        <section class="evaluation-panel task-detail-panel">
          <div class="evaluation-panel-head">
            <div>
              <strong>默认对比逻辑</strong>
              <span>任务完成后默认和上一次同场景、同方案任务比较。</span>
            </div>
          </div>
          <div class="task-compare-note">
            <div>
              <span>同数据集</span>
              <strong>${currentTask.dataset}</strong>
            </div>
            <div>
              <span>同方案</span>
              <strong>${currentTask.scheme}</strong>
            </div>
            <div>
              <span>本次变化</span>
              <strong>${formatDelta(currentTask.algorithmAccuracy - previousTask.algorithmAccuracy, "rate")}</strong>
            </div>
          </div>
          <div class="task-mini-table">
            <div><span>任务</span><span>总数</span><span>已标注</span><span>算法准确率</span></div>
            ${[previousTask, currentTask].map((task) => `
              <div>
                <strong>${task.name}</strong>
                <span>${formatNumber(task.total)}</span>
                <span>${formatNumber(task.done)}</span>
                <span>${formatRate(task.algorithmAccuracy)}</span>
              </div>
            `).join("")}
          </div>
        </section>
      </div>

      <section class="evaluation-panel compare-panel">
        <div class="evaluation-panel-head">
          <div>
            <strong>标注任务指标对比</strong>
            <span>指标口径直接沿用标注工作台：数据量、混淆矩阵和评估率。</span>
          </div>
          <div class="compare-selects">
            <select class="select"><option>${previousTask.name}</option></select>
            <span>对比</span>
            <select class="select"><option>${currentTask.name}</option></select>
          </div>
        </div>

        <div class="workbench-metric-compare">
          ${workbenchMetricGroups.map(renderMetricGroupCompare).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderSummaryStat(title, current, previous, type, lowerIsBetter = false) {
  const delta = Number(current) - Number(previous);
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return `
    <article class="evaluation-stat">
      <span>${title}</span>
      <strong>${formatValue(current, type)}</strong>
      <em class="${improved ? "good" : "bad"}">${formatDelta(delta, type)}</em>
      <p>对比上一次任务：${formatValue(previous, type)}</p>
    </article>
  `;
}

function renderTaskItem(task, index) {
  const selected = index <= 1;
  return `
    <article class="task-item ${index === 0 ? "active" : ""}">
      <label class="task-compare-check">
        <input type="checkbox" ${selected ? "checked" : ""}>
      </label>
      <div class="task-main">
        <strong>${task.name}</strong>
        <span>${task.id} · ${task.dataset} · ${task.scheme}</span>
      </div>
      <div class="task-tags">
        <span>${task.mode}</span>
        <span>${task.status}</span>
      </div>
      <div class="task-score">
        <strong>${formatRate(task.algorithmAccuracy)}</strong>
        <em>${task.time}</em>
      </div>
    </article>
  `;
}

function renderMetricGroupCompare(group) {
  return `
    <section class="metric-compare-section">
      <h3>${group.title}</h3>
      <div class="metric-compare-rows">
        ${group.items.map(([label, key, type]) => renderMetricRow(label, key, type)).join("")}
      </div>
    </section>
  `;
}

function renderMetricRow(label, key, type) {
  const before = previousTask[key];
  const after = currentTask[key];
  const delta = Number(after) - Number(before);
  const lowerIsBetter = ["unannotated", "queued", "running", "fp", "fn"].includes(key);
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return `
    <article class="metric-compare-row ${improved ? "improved" : "declined"}">
      <span>${label}</span>
      <strong>${formatValue(before, type)}</strong>
      <i>→</i>
      <strong>${formatValue(after, type)}</strong>
      <em>${formatDelta(delta, type)}</em>
    </article>
  `;
}

function formatValue(value, type) {
  return type === "rate" ? formatRate(value) : formatNumber(value);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatRate(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDelta(value, type) {
  const sign = value > 0 ? "+" : "";
  return type === "rate"
    ? `${sign}${Number(value || 0).toFixed(1)}%`
    : `${sign}${Number(value || 0).toLocaleString()}`;
}
