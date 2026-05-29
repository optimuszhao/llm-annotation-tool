import { renderManagePage } from "/pages/manage.js?v=20260529-prompt-placeholder-rules";
import { renderWorkbenchPage, refreshWorkbench } from "/pages/workbench.js?v=20260529-vivid-themes";
import { initComponents } from "/assets/components.js";

export const state = {
  scenes: [],
  datasets: [],
  prompts: [],
  knowledge: [],
  errorSets: [],
  schemes: [],
  activeSceneId: "",
  activeDatasetId: "",
  activeSchemeId: "",
};

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
  state.scenes = await api("/api/scenes");
  state.activeSceneId ||= state.scenes[0]?.id || "";
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

function showPage(name) {
  document.querySelectorAll("[data-page]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === name);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${name}`);
  });
  if (name === "workbench") refreshWorkbench();
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

function applyThemeChoice(theme) {
  if (theme && theme !== "default") {
    document.documentElement.dataset.theme = theme;
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function applyModeChoice(mode) {
  document.documentElement.dataset.mode = mode === "dark" ? "dark" : "light";
}

function setupThemeTools() {
  if (document.documentElement.dataset.themeToolsReady === "true") return;

  const themeButton = document.querySelector("#themeButton");
  const themePopover = document.querySelector("#themePopover");
  const modeToggle = document.querySelector("#modeToggle");

  applyThemeChoice(localStorage.getItem("themeChoice") || "default");
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
      applyThemeChoice(theme);
      localStorage.setItem("themeChoice", theme);
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

async function boot() {
  setupShell();
  setupThemeTools();
  initComponents();
  renderManagePage();
  renderWorkbenchPage();
  try {
    await loadState();
    renderManagePage();
    renderWorkbenchPage();
  } catch (error) {
    toast(error.message);
  }
}

boot();
