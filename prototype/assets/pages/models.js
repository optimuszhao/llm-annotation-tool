/* ───────── 模型管理(只读)───────── */
(function () {
  const Page = window.ModelsPage = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    await NX.mountSidebar('models');
    renderTable();
    renderCode();
  }

  function statusBadge (s) {
    if (s === 'ok')   return '<span class="badge badge--green">🟢 可调用</span>';
    if (s === 'fail') return '<span class="badge badge--rose">🔴 抛异常</span>';
    if (s === 'idle') return '<span class="badge badge--slate">⚪ 未测试</span>';
    return s;
  }
  function ms (n) { return n > 0 ? `${(n/1000).toFixed(1)}s` : '—'; }

  function renderTable () {
    document.getElementById('m-tbody').innerHTML = NX.models.map(m => `
      <tr class="tbody-row">
        <td class="border-b border-slate-100 px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/></svg>
            </span>
            <code class="text-violet-700 font-medium">${m.key}</code>
          </div>
        </td>
        <td class="border-b border-slate-100 px-4 py-3">${statusBadge(m.status)}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-500">${m.lastUsed}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-600 font-mono text-xs">${ms(m.avgMs)} / ${ms(m.p95Ms)}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-600">${m.note || '-'}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-right">
          <button onclick="ModelsPage.testConn('${m.key}')" class="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
            🔧 测试连通
          </button>
        </td>
      </tr>
    `).join('');
  }

  Page.testConn = (key) => {
    const m = NX.models.find(x => x.key === key);
    NX.toast(`测试 ${key}…(模拟)`, 'default');
    m.status = 'idle';
    renderTable();
    setTimeout(() => {
      m.status = Math.random() < 0.7 ? 'ok' : 'fail';
      m.lastUsed = '刚刚';
      m.avgMs = m.status === 'ok' ? 5000 + Math.random() * 8000 : 0;
      m.p95Ms = m.status === 'ok' ? m.avgMs * 2.5 : 0;
      NX.toast(m.status === 'ok' ? `${key} 连通正常` : `${key} 调用失败`, m.status === 'ok' ? 'success' : 'error');
      renderTable();
    }, 1500 + Math.random() * 2000);
  };

  function renderCode () {
    const sample = `class UserHooks:
    def __init__(self):
        # ───── 模型注册区 ─────
        self.models = {
            "deepseek-local": self._call_deepseek,
            "qwen-local":     self._call_qwen,
            "llama-local":    self._call_llama,
            # ⬇ 在这里添加你自己的模型
        }

    def _call_deepseek(self, prompt: str, role: str) -> str:
        """调用 DeepSeek,返回 JSON 字符串"""
        # ... 你的实现
        return '{"thinking": "...", "情感分类": "正面"}'

    # ───── 三个钩子方法 ─────
    def translate(self, text: str, target_lang: str = "zh") -> str:
        ...

    def analyze(self, row_data: dict) -> dict:
        ...

    def init_prompt(self, prompt_template: str,
                    row_data: dict,
                    knowledge: list[dict],
                    error_sets: dict[str, list[dict]]) -> str:
        ...
`;
    document.querySelector('#m-code code').textContent = sample;
  }

  Page.copyCode = () => NX.copy(document.querySelector('#m-code code').textContent);
})();
