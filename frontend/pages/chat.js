import { api, toast } from "/assets/app.js";

let messages = [
  {
    role: "assistant",
    text: "可以直接输入要测试的内容。当前页面默认调用项目里的默认标注方法，并返回字典结果。",
    result: null,
  },
];
let sending = false;

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
            <span>默认走当前项目的默认标注方法，适合快速测试 Prompt、模型返回和字典结构。</span>
          </div>
          <div class="chat-method-card">
            <span>调用入口</span>
            <strong>默认标注方法</strong>
            <em>user_hooks.llm_chat_function</em>
          </div>
        </header>

        <div class="chat-body" id="chatBody">
          ${renderMessages()}
        </div>

        <form class="chat-input-bar" id="chatForm">
          <textarea id="chatInput" rows="1" placeholder="输入要发送给大模型的内容，Enter 发送，Shift + Enter 换行"></textarea>
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
        ${message.result ? `
          <pre class="chat-result">${escapeHtml(JSON.stringify(message.result, null, 2))}</pre>
        ` : ""}
      </div>
    </article>
  `).join("");
}

function bindChatEvents() {
  const form = document.querySelector("#chatForm");
  const input = document.querySelector("#chatInput");
  if (!form || !input || form.dataset.ready === "true") return;
  form.dataset.ready = "true";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
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

async function sendMessage() {
  const input = document.querySelector("#chatInput");
  const text = input?.value.trim() || "";
  if (!text || sending) return;
  messages.push({ role: "user", text, result: null });
  input.value = "";
  input.style.height = "auto";
  sending = true;
  renderChatPage();
  try {
    const payload = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, model_key: "demo" }),
    });
    messages.push({
      role: "assistant",
      text: payload.reply || "已返回标注结果。",
      result: payload.result || {},
    });
  } catch (error) {
    messages.push({ role: "assistant", text: `调用失败：${error.message}`, result: null });
    toast(error.message);
  } finally {
    sending = false;
    renderChatPage();
  }
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
