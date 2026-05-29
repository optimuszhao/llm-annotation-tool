const enhancedSelects = new WeakMap();

export function initComponents() {
  enhanceControls(document);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeydown);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhanceControls(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function enhanceControls(root) {
  root.querySelectorAll?.("select.select, .column-search select").forEach(enhanceSelect);
}

function enhanceSelect(select) {
  if (enhancedSelects.has(select) || select.closest(".ui-select")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "ui-select";
  const trigger = document.createElement("button");
  trigger.className = "ui-select-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const value = document.createElement("span");
  value.className = "ui-select-value";
  const arrow = document.createElement("span");
  arrow.className = "ui-select-arrow";
  arrow.setAttribute("aria-hidden", "true");
  trigger.append(value, arrow);

  const menu = document.createElement("div");
  menu.className = "ui-select-menu";
  menu.setAttribute("role", "listbox");

  select.classList.add("ui-select-native");
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select, trigger, menu);

  const api = { wrapper, trigger, value, menu };
  enhancedSelects.set(select, api);
  renderSelect(select);

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSelect(select);
  });
  select.addEventListener("change", () => renderSelect(select));

  const optionObserver = new MutationObserver(() => renderSelect(select));
  optionObserver.observe(select, { childList: true, subtree: true, attributes: true });
}

function renderSelect(select) {
  const api = enhancedSelects.get(select);
  if (!api) return;
  const selected = select.selectedOptions[0] || select.options[0];
  api.value.textContent = selected?.textContent || "请选择";
  api.wrapper.classList.toggle("disabled", select.disabled);
  api.wrapper.classList.toggle("is-empty", !select.value);
  api.menu.innerHTML = "";

  [...select.options].forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ui-select-option";
    item.textContent = option.textContent;
    item.dataset.value = option.value;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.value === select.value));
    if (option.disabled) item.disabled = true;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeSelect(select);
    });
    api.menu.append(item);
  });
}

function toggleSelect(select) {
  const api = enhancedSelects.get(select);
  if (!api || select.disabled) return;
  const shouldOpen = !api.wrapper.classList.contains("open");
  closeAllSelects();
  if (shouldOpen) {
    api.wrapper.classList.add("open");
    api.trigger.setAttribute("aria-expanded", "true");
  }
}

function closeSelect(select) {
  const api = enhancedSelects.get(select);
  if (!api) return;
  api.wrapper.classList.remove("open");
  api.trigger.setAttribute("aria-expanded", "false");
}

function closeAllSelects() {
  document.querySelectorAll(".ui-select.open").forEach((wrapper) => {
    wrapper.classList.remove("open");
    wrapper.querySelector(".ui-select-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function handleDocumentClick(event) {
  if (!event.target.closest(".ui-select")) closeAllSelects();
}

function handleKeydown(event) {
  if (event.key === "Escape") closeAllSelects();
}
