/* ───────── Prompt 管理页 ───────── */
(function () {
  const Page = window.PromptsPage = {};
  const state = { search: '', scene: '', mode: '', editingId: null };

  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    await NX.mountSidebar('prompts');
    initFilters();
    bindEvents();
    render();
  }

  function initFilters () {
    const sf = document.getElementById('p-scene-filter');
    NX.scenes.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sf.appendChild(o); });

    const escene = document.getElementById('e-scene');
    NX.scenes.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; escene.appendChild(o); });
    const emodel = document.getElementById('e-model');
    NX.models.forEach(m => { const o = document.createElement('option'); o.value = m.key; o.textContent = m.key; emodel.appendChild(o); });
  }

  function bindEvents () {
    document.getElementById('p-search').addEventListener('input', NX.debounce(e => { state.search = e.target.value.trim().toLowerCase(); render(); }, 150));
    document.getElementById('p-scene-filter').addEventListener('change', e => { state.scene = e.target.value; render(); });
    document.getElementById('p-mode-filter').addEventListener('change', e => { state.mode = e.target.value; render(); });
    document.getElementById('p-new').addEventListener('click', () => openEditor(null));
    document.querySelectorAll('input[name="e-mode"]').forEach(r => r.addEventListener('change', updateModeUI));
    document.getElementById('e-scene').addEventListener('change', updateSuggestionAndVars);
  }

  function render () {
    const list = NX.prompts.filter(p => {
      if (state.scene && p.scene !== state.scene) return false;
      if (state.mode && p.mode !== state.mode) return false;
      if (state.search && !p.role.toLowerCase().includes(state.search)) return false;
      return true;
    });
    document.getElementById('p-count-badge').textContent = `共 ${list.length} 张`;
    document.getElementById('p-tbody').innerHTML = list.map(rowHTML).join('') || `
      <tr><td colspan="7" class="px-4 py-10 text-center text-sm text-slate-400">暂无 Prompt — 右上「新建 Prompt」</td></tr>
    `;
  }

  function rowHTML (p) {
    const modeBadge = p.mode === 'auto'
      ? '<span class="badge badge--green">自动</span>'
      : '<span class="badge badge--violet">自定义</span>';
    return `
      <tr class="tbody-row">
        <td class="border-b border-slate-100 px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>
            </span>
            <span class="font-medium">${p.role}</span>
          </div>
        </td>
        <td class="border-b border-slate-100 px-4 py-3"><span class="badge badge--sky">${p.scene}</span></td>
        <td class="border-b border-slate-100 px-4 py-3">${modeBadge}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-600 font-mono text-xs">${p.defaultModel}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-600">${p.refSchemeCount} 个</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-500">${p.updatedAt}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-right">
          <button onclick="PromptsPage.editPrompt('${p.id}')" class="text-sm font-medium text-emerald-600 hover:underline">编辑</button>
          <span class="text-slate-300 mx-2">|</span>
          <button onclick="PromptsPage.copyPrompt('${p.id}')" class="text-sm font-medium text-slate-700 hover:underline">复制</button>
          <span class="text-slate-300 mx-2">|</span>
          <button onclick="PromptsPage.deletePrompt('${p.id}')" class="text-sm font-medium text-rose-600 hover:underline">删除</button>
        </td>
      </tr>
    `;
  }

  function openEditor (id) {
    state.editingId = id;
    const p = id ? NX.prompts.find(x => x.id === id) : null;
    document.getElementById('editor-title').textContent = p ? `编辑 Prompt — ${p.role}` : '新建 Prompt';
    document.getElementById('e-role').value     = p?.role     || '';
    document.getElementById('e-scene').value    = p?.scene    || NX.scenes[0];
    document.getElementById('e-model').value    = p?.defaultModel || NX.models[0].key;
    document.getElementById('e-template').value = p?.template || '';
    document.querySelector(`input[name="e-mode"][value="${p?.mode || 'auto'}"]`).checked = true;
    updateModeUI();
    updateSuggestionAndVars();
    NX.openModal(document.getElementById('editor-mask'));
  }

  Page.editPrompt = (id) => openEditor(id);
  Page.copyPrompt = (id) => {
    const p = NX.prompts.find(x => x.id === id); if (!p) return;
    const copy = { ...p, id: 'p-' + Math.random().toString(36).slice(2,6), role: p.role + ' (副本)', refSchemeCount: 0, updatedAt: new Date().toISOString().slice(0,10) };
    NX.prompts.unshift(copy);
    NX.toast('已复制 Prompt', 'success');
    render();
  };
  Page.deletePrompt = (id) => {
    const p = NX.prompts.find(x => x.id === id); if (!p) return;
    if (p.refSchemeCount > 0) {
      if (!confirm(`该 Prompt 被 ${p.refSchemeCount} 个方案引用,确认删除?`)) return;
    } else if (!confirm('确认删除?')) return;
    NX.prompts.splice(NX.prompts.findIndex(x => x.id === id), 1);
    NX.toast('已删除', 'success');
    render();
  };

  Page.savePrompt = function () {
    const role = document.getElementById('e-role').value.trim();
    if (!role) { NX.toast('角色名不能为空', 'error'); return; }
    const scene = document.getElementById('e-scene').value;
    const model = document.getElementById('e-model').value;
    const tmpl  = document.getElementById('e-template').value;
    const mode  = document.querySelector('input[name="e-mode"]:checked').value;
    if (state.editingId) {
      const p = NX.prompts.find(x => x.id === state.editingId);
      Object.assign(p, { role, scene, defaultModel: model, template: tmpl, mode, updatedAt: new Date().toISOString().slice(0,10) });
    } else {
      NX.prompts.unshift({ id: 'p-' + Math.random().toString(36).slice(2,6), role, scene, defaultModel: model, template: tmpl, mode, refSchemeCount: 0, updatedAt: new Date().toISOString().slice(0,10) });
    }
    NX.closeModal(document.getElementById('editor-mask'));
    NX.toast('已保存 Prompt', 'success');
    render();
  };

  Page.insertSuggestion = function () {
    const sug = document.getElementById('e-suggestion').textContent;
    const ta = document.getElementById('e-template');
    ta.value = ta.value.trimEnd() + '\n\n' + sug + '\n';
    NX.toast('已插入', 'success');
  };

  function updateModeUI () {
    const mode = document.querySelector('input[name="e-mode"]:checked').value;
    const panel = document.getElementById('vars-panel');
    panel.style.opacity = mode === 'auto' ? '1' : '0.4';
    panel.style.pointerEvents = mode === 'auto' ? 'auto' : 'none';
  }

  function updateSuggestionAndVars () {
    const scene = document.getElementById('e-scene').value;
    // 找该场景下任一数据集的答案列
    const ds = NX.datasets.find(d => d.scene === scene && d.mapping);
    const gtCol = ds?.mapping?.gtCol || '答案列字段名';
    const refCols = ds?.mapping?.refCols || [];

    const sug = `请严格按以下 JSON 格式返回:\n{\n  "thinking": "你的推理过程",\n  "${gtCol}": "你的判定结果"\n}`;
    document.getElementById('e-suggestion').textContent = sug;

    // 右侧侧栏 - 行字段
    document.getElementById('vp-rowcols').innerHTML = (refCols.length ? refCols : ['(请先在数据集管理中配置该场景的字段映射)']).map(c => {
      const isHint = c.startsWith('(');
      return isHint
        ? `<div class="text-xs text-slate-400 px-2 py-1">${c}</div>`
        : `<button class="block w-full text-left text-xs font-mono rounded px-2 py-1 hover:bg-slate-100 text-slate-700" onclick="PromptsPage.insertVar('{{${c}}}')">{{${c}}}</button>`;
    }).join('');
    document.getElementById('vp-knowledge').innerHTML = NX.knowledge.filter(k => !k.scene || k.scene === scene).map(k => {
      return `<button class="block w-full text-left text-xs font-mono rounded px-2 py-1 hover:bg-slate-100 text-slate-700" onclick="PromptsPage.insertVar('{{知识库.${k.name}}}')">{{知识库.${k.name}}}</button>`;
    }).join('') || `<div class="text-xs text-slate-400 px-2 py-1">无</div>`;
    document.getElementById('vp-errorsets').innerHTML = NX.errorSets.filter(e => !e.scene || e.scene === scene).map(e => {
      return `<button class="block w-full text-left text-xs font-mono rounded px-2 py-1 hover:bg-slate-100 text-slate-700" onclick="PromptsPage.insertVar('{{错题集.${e.name}}}')">{{错题集.${e.name}}}</button>`;
    }).join('') || `<div class="text-xs text-slate-400 px-2 py-1">无</div>`;
  }

  Page.insertVar = function (text) {
    const ta = document.getElementById('e-template');
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + text.length;
  };
})();
