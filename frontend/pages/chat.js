import { toast } from "/assets/app.js";

let messages = [
  {
    role: "assistant",
    text: "可以直接输入要测试的内容。当前页面调用独立的对话大模型方法，并按流式结果展示。",
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
            <span>独立调用对话 Hook，适合快速测试模型问答、Prompt 表达和流式输出。</span>
          </div>
          <div class="chat-head-actions">
            <div class="chat-method-card">
              <span>调用入口</span>
              <strong>对话流式方法</strong>
              <em>user_hooks.llm_dialog_stream_function</em>
            </div>
            <button class="btn" type="button" id="clearChatButton">清空对话</button>
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
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, model_key: "demo", history }),
    });
    if (!response.ok) {
      throw new Error(await response.text() || response.statusText);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assistantMessage.text += decoder.decode(value, { stream: true });
      renderChatPage();
    }
    assistantMessage.text += decoder.decode();
    if (!assistantMessage.text.trim()) assistantMessage.text = "模型暂未返回内容。";
  } catch (error) {
    assistantMessage.text = `调用失败：${error.message}`;
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
