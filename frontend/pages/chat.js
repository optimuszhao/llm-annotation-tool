import { api, state, toast } from "/assets/app.js";

let messages = [
  {
    role: "assistant",
    text: "可以直接输入要测试的内容。当前页面调用独立的对话大模型方法，并返回完整回复。",
  },
];
let sending = false;
let selectedModelKey = "local:core_model";

export function renderChatPage() {
  const root = document.querySelector("#page-chat");
  if (!root) return;
  root.innerHTML = `
    <div class="chat-page">
      <section class="chat-shell">
        <header class="chat-head">
          <div>
            <p class="eyebrow">MODEL CHAT</p>
            <h1>对话大模型</h1>
            <span>独立调用对话 Hook，适合快速测试模型问答和 Prompt 表达。</span>
          </div>
          <div class="chat-head-actions">
            <label class="chat-model-field">
              <span>对话模型</span>
              <select class="select" id="chatModelSelect">
                ${renderModelOptions()}
              </select>
            </label>
            <button class="btn" type="button" id="clearChatButton">清空对话</button>
          </div>
        </header>

        <div class="chat-body" id="chatBody">
          ${renderMessages()}
        </div>

        <form class="chat-input-bar" id="chatForm">
          <textarea id="chatInput" rows="1" placeholder="输入要发送给大模型的内容"></textarea>
          <button class="btn primary chat-send-button" type="submit" ${sending ? "disabled" : ""}>${sending ? "发送中" : "发送"}</button>
        </form>
      </section>
    </div>
  `;
  bindChatEvents();
  scrollChatToBottom();
}

function renderMessages() {
  return messages.map((message) => `
    <article class="chat-message ${message.role}">
      <div class="chat-avatar">${message.role === "user" ? "我" : "AI"}</div>
      <div class="chat-bubble">
        <div class="chat-message-text">${escapeHtml(message.text).replaceAll("\n", "<br>")}</div>
      </div>
    </article>
  `).join("");
}

function bindChatEvents() {
  const form = document.querySelector("#chatForm");
  const input = document.querySelector("#chatInput");
  if (!form || !input || form.dataset.ready === "true") return;
  form.dataset.ready = "true";
  const modelSelect = document.querySelector("#chatModelSelect");
  modelSelect?.addEventListener("change", () => {
    selectedModelKey = modelSelect.value || "local:core_model";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
  document.querySelector("#clearChatButton")?.addEventListener("click", clearChatHistory);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  });
}

function clearChatHistory() {
  if (sending) return;
  messages = [
    {
      role: "assistant",
      text: "已清空历史对话。可以继续输入新的内容。",
    },
  ];
  renderChatPage();
}

async function sendMessage() {
  const input = document.querySelector("#chatInput");
  const text = input?.value.trim() || "";
  if (!text || sending) return;
  messages.push({ role: "user", text });
  const history = messages
    .filter((message) => message.text)
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.text,
    }));
  const assistantMessage = { role: "assistant", text: "" };
  messages.push(assistantMessage);
  input.value = "";
  input.style.height = "auto";
  sending = true;
  renderChatPage();
  try {
    const payload = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify(buildChatPayload(text, history)),
    });
    assistantMessage.text = payload.text || payload.message || "";
    if (!assistantMessage.text.trim()) assistantMessage.text = "模型暂未返回内容。";
  } catch (error) {
    assistantMessage.text = `调用失败：${error.message}`;
    toast(error.message);
  } finally {
    sending = false;
    renderChatPage();
  }
}

function renderModelOptions() {
  const localOptions = [
    { value: "local:core_model", label: "本地调用 · Local Model" },
    { value: "local:del_model", label: "本地调用 · Del Model" },
  ];
  const marketOptions = (state.modelMarketConfigs || []).map((item) => ({
    value: `market:${item.id}`,
    label: `模型市场 · ${item.name}`,
  }));
  const groups = [
    ["本地调用", localOptions],
    ["模型市场", marketOptions],
  ];
  const allOptions = [...localOptions, ...marketOptions];
  if (!allOptions.some((item) => item.value === selectedModelKey)) {
    selectedModelKey = allOptions[0]?.value || "local:core_model";
  }
  return groups.map(([label, options]) => `
    <optgroup label="${escapeHtml(label)}">
      ${options.length
        ? options.map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selectedModelKey ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")
        : `<option value="" disabled>暂无模型市场配置</option>`}
    </optgroup>
  `).join("");
}

function buildChatPayload(text, history) {
  const [modelType, modelKey] = String(selectedModelKey || "local:core_model").split(":");
  return {
    message: text,
    history,
    model_type: modelType || "local",
    model_key: modelKey || "core_model",
  };
}

function scrollChatToBottom() {
  const body = document.querySelector("#chatBody");
  if (body) body.scrollTop = body.scrollHeight;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
