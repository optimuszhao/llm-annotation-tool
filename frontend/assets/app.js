import { renderManagePage } from "/pages/manage.js?v=20260605-compact-metrics";
import { renderWorkbenchPage, refreshWorkbench } from "/pages/workbench.js?v=20260605-compact-metrics";
import { renderChatPage } from "/pages/chat.js?v=20260602-chat-stream";
import { initComponents } from "/assets/components.js";

export const state = {
  scenes: [],
  datasets: [],
  prompts: [],
  knowledge: [],
  errorSets: [],
  schemes: [],
  analysisMethods: {},
  activeSceneId: "",
  activeDatasetId: "",
  activeSchemeId: "",
};

const defaultPage = "workbench";

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
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
  return response.json();
}

export function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("open");
  window.clearTimeout(node.dataset.timer);
  node.dataset.timer = window.setTimeout(() => node.classList.remove("open"), 2600);
}

export async function loadState() {
  const [scenes, analysisMethods, savedSource] = await Promise.all([
    api("/api/scenes"),
    api("/api/schemes/analysis-methods").catch(() => ({})),
    api("/api/preferences/workbench-source").catch(() => ({})),
  ]);
  state.scenes = scenes;
  state.analysisMethods = analysisMethods;
  state.activeSceneId = validStateId(state.scenes, savedSource.scene_id || state.activeSceneId);
  state.activeDatasetId = savedSource.dataset_id || state.activeDatasetId;
  state.activeSchemeId = savedSource.scheme_id || state.activeSchemeId;
  await loadSceneResources();
}

export async function loadSceneResources() {
  const sceneParam = state.activeSceneId ? `?scene_id=${encodeURIComponent(state.activeSceneId)}` : "";
  const [datasets, prompts, knowledge, errorSets, schemes] = await Promise.all([
    api(`/api/datasets${sceneParam}`),
    api(`/api/prompts${sceneParam}`),
    api(`/api/knowledge${sceneParam}`),
    api(`/api/error-sets${sceneParam}`),
    api(`/api/schemes${sceneParam}`),
  ]);
  state.datasets = datasets;
  state.prompts = prompts;
  state.knowledge = knowledge;
  state.errorSets = errorSets;
  state.schemes = schemes;
  if (!state.datasets.some((item) => item.id === state.activeDatasetId)) {
    state.activeDatasetId = state.datasets[0]?.id || "";
  }
  if (!state.schemes.some((item) => item.id === state.activeSchemeId)) {
    state.activeSchemeId = state.schemes[0]?.id || "";
  }
}

function validStateId(items, preferredId) {
  return preferredId && items.some((item) => item.id === preferredId) ? preferredId : items[0]?.id || "";
}

function showPage(name) {
  document.querySelectorAll("[data-page]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === name);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${name}`);
  });
  if (name === "workbench") refreshWorkbench();
  if (name === "chat") renderChatPage();
}

function setupShell() {
  document.querySelectorAll("[data-page]").forEach((tab) => {
    tab.addEventListener("click", () => showPage(tab.dataset.page));
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-button]");
    if (button) showPage(button.dataset.pageButton);
  });
}

function normalizeThemeChoice(theme) {
  const aliases = { default: "white", cobalt: "blue", teal: "green", indigo: "purple", emerald: "green", graphite: "black", berry: "purple", coral: "orange", lime: "green", sky: "blue", rose: "red" };
  const allowed = new Set(["white", "blue", "purple", "orange", "green", "black", "red"]);
  const normalized = aliases[theme] || theme || "white";
  return allowed.has(normalized) ? normalized : "white";
}

function applyThemeChoice(theme) {
  const normalized = normalizeThemeChoice(theme);
  document.documentElement.dataset.theme = normalized;
  return normalized;
}

function applyModeChoice(mode) {
  document.documentElement.dataset.mode = mode === "dark" ? "dark" : "light";
}

function setupThemeTools() {
  if (document.documentElement.dataset.themeToolsReady === "true") return;

  const themeButton = document.querySelector("#themeButton");
  const themePopover = document.querySelector("#themePopover");
  const modeToggle = document.querySelector("#modeToggle");

  const normalizedTheme = applyThemeChoice(localStorage.getItem("themeChoice") || "white");
  localStorage.setItem("themeChoice", normalizedTheme);
  applyModeChoice(localStorage.getItem("modeChoice") || document.documentElement.dataset.mode || "light");

  if (!themeButton || !themePopover || !modeToggle) return;

  themeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    themePopover.classList.toggle("open");
  });
  themePopover.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => themePopover.classList.remove("open"));
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.themeChoice;
      const normalized = applyThemeChoice(theme);
      localStorage.setItem("themeChoice", normalized);
      themePopover.classList.remove("open");
    });
  });
  modeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.mode;
    const next = current === "dark" ? "light" : "dark";
    applyModeChoice(next);
    localStorage.setItem("modeChoice", next);
  });
  document.documentElement.dataset.themeToolsReady = "true";
}

function setupLagHelper() {
  const button = document.querySelector("#lagHelperButton");
  if (!button || button.dataset.ready === "true") return;
  button.dataset.ready = "true";
  button.addEventListener("click", openLagHelper);
}

function ensureLagHelperModal() {
  let backdrop = document.querySelector("#lagHelperModal");
  if (backdrop) return backdrop;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop lag-helper-backdrop" id="lagHelperModal">
      <section class="modal lag-helper-modal" role="dialog" aria-modal="true" aria-labelledby="lagHelperTitle">
        <header class="modal-head">
          <div class="modal-title-block">
            <h2 id="lagHelperTitle">卡顿助手</h2>
            <p class="card-meta">为已导入的老数据生成列表预览缓存，提升列表、查看和双击单元格的响应速度。</p>
          </div>
          <button class="icon-btn" type="button" data-lag-helper-close aria-label="关闭">×</button>
        </header>
        <div class="modal-body lag-helper-body">
          <div class="lag-helper-note">
            <strong>优化内容</strong>
            <span>扫描已有场景数据，基于完整行数据生成短文本预览和大字段标记。原始数据完整保留。</span>
          </div>
          <div class="lag-helper-note lag-helper-danger-zone">
            <strong>历史瘦身</strong>
            <span>删除旧历史记录，并为每行保留最近一条标注历史、每个分析方法保留最近一条分析历史。当前列表最新结果会保留。</span>
            <div class="lag-helper-clean-actions">
              <button class="btn danger-soft" id="lagHelperPruneAnnotationButton" type="button">清理历史标注数据</button>
              <button class="btn danger-soft" id="lagHelperPruneAnalysisButton" type="button">清理历史分析数据</button>
            </div>
          </div>
          <div class="lag-helper-result" id="lagHelperResult">
            <span>建议在空闲时执行一次。数据量较大时需要等待一会儿。</span>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" data-lag-helper-close>关闭</button>
            <button class="btn primary" id="lagHelperRunButton" type="button">开始优化老数据</button>
          </div>
        </div>
      </section>
    </div>
  `);
  backdrop = document.querySelector("#lagHelperModal");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-lag-helper-close]")) {
      closeLagHelper();
    }
  });
  backdrop.querySelector("#lagHelperRunButton").addEventListener("click", runLagHelper);
  backdrop.querySelector("#lagHelperPruneAnnotationButton").addEventListener("click", () => runLagHistoryCleanup("annotation"));
  backdrop.querySelector("#lagHelperPruneAnalysisButton").addEventListener("click", () => runLagHistoryCleanup("analysis"));
  return backdrop;
}

function openLagHelper() {
  const backdrop = ensureLagHelperModal();
  backdrop.classList.add("open");
}

function closeLagHelper() {
  document.querySelector("#lagHelperModal")?.classList.remove("open");
}

function renderLagHelperResult(result) {
  const node = document.querySelector("#lagHelperResult");
  if (!node) return;
  const scenes = (result.scenes || [])
    .filter((scene) => scene.checked_rows || scene.updated_rows || scene.ready_rows)
    .slice(0, 6)
    .map((scene) => `
      <div>
        <strong>${escapeHtml(scene.scene_name || scene.scene_id)}</strong>
        <span>检查 ${scene.checked_rows} 行 · 更新 ${scene.updated_rows} 行 · 已就绪 ${scene.ready_rows} 行</span>
      </div>
    `).join("");
  node.innerHTML = `
    <section class="lag-helper-summary">
      <div><span>本次检查</span><strong>${result.checked_rows || 0}</strong></div>
      <div><span>完成回填</span><strong>${result.updated_rows || 0}</strong></div>
      <div><span>已具备缓存</span><strong>${result.skipped_rows || 0}</strong></div>
      <div><span>异常行</span><strong>${result.failed_rows || 0}</strong></div>
    </section>
    <section class="lag-helper-scenes">
      ${scenes || "<span>当前没有需要回填的老数据。</span>"}
    </section>
  `;
}

async function runLagHelper() {
  const runButton = document.querySelector("#lagHelperRunButton");
  const resultNode = document.querySelector("#lagHelperResult");
  runButton.disabled = true;
  runButton.textContent = "优化中...";
  resultNode.innerHTML = `<span class="lag-helper-loading">正在扫描并生成预览缓存...</span>`;
  try {
    const result = await api("/api/maintenance/preview-backfill", {
      method: "POST",
      body: JSON.stringify({}),
    });
    renderLagHelperResult(result);
    toast(`卡顿助手完成：更新 ${result.updated_rows || 0} 行`);
    if (document.querySelector("#page-workbench.active")) refreshWorkbench();
  } catch (error) {
    resultNode.innerHTML = `<span class="lag-helper-error">${escapeHtml(error.message)}</span>`;
    toast(error.message);
  } finally {
    runButton.disabled = false;
    runButton.textContent = "再次优化";
  }
}

async function runLagHistoryCleanup(type) {
  const config = type === "annotation"
    ? {
        button: "#lagHelperPruneAnnotationButton",
        endpoint: "/api/maintenance/annotation-history/prune",
        confirmText: "确认清理历史标注数据？系统会保留每行每方案最近一条标注历史，删除更早的历史记录。",
        runningText: "清理标注中...",
        doneText: "清理历史标注数据",
        toastText: "历史标注数据已清理",
      }
    : {
        button: "#lagHelperPruneAnalysisButton",
        endpoint: "/api/maintenance/analysis-history/prune",
        confirmText: "确认清理历史分析数据？系统会保留每行每分析方法最近一条分析历史，删除更早的历史记录。",
        runningText: "清理分析中...",
        doneText: "清理历史分析数据",
        toastText: "历史分析数据已清理",
      };
  if (!window.confirm(config.confirmText)) return;
  const button = document.querySelector(config.button);
  const resultNode = document.querySelector("#lagHelperResult");
  button.disabled = true;
  button.textContent = config.runningText;
  resultNode.innerHTML = `<span class="lag-helper-loading">${escapeHtml(config.runningText)}</span>`;
  try {
    const result = await api(config.endpoint, { method: "POST", body: JSON.stringify({}) });
    renderLagCleanupResult(result);
    toast(`${config.toastText}：删除 ${result.deleted_count || 0} 条`);
    if (document.querySelector("#page-workbench.active")) refreshWorkbench();
  } catch (error) {
    resultNode.innerHTML = `<span class="lag-helper-error">${escapeHtml(error.message)}</span>`;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = config.doneText;
  }
}

function renderLagCleanupResult(result) {
  const node = document.querySelector("#lagHelperResult");
  if (!node) return;
  node.innerHTML = `
    <section class="lag-helper-summary">
      <div><span>清理前</span><strong>${result.before_count || 0}</strong></div>
      <div><span>已删除</span><strong>${result.deleted_count || 0}</strong></div>
      <div><span>保留</span><strong>${result.remaining_count || 0}</strong></div>
      <div><span>规则</span><strong>最新</strong></div>
    </section>
    <section class="lag-helper-scenes">
      <span>${escapeHtml(result.keep_rule || "保留最近一条历史记录")}</span>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function boot() {
  setupShell();
  setupThemeTools();
  setupLagHelper();
  initComponents();
  renderManagePage();
  renderWorkbenchPage();
  renderChatPage();
  showPage(defaultPage);
  try {
    await loadState();
    renderManagePage();
    renderWorkbenchPage();
    renderChatPage();
    showPage(defaultPage);
  } catch (error) {
    toast(error.message);
  }
}

boot();
