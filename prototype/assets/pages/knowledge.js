/* ───────── 知识管理页 ───────── */
(function () {
  const Page = window.KnowledgePage = {};
  const state = { search: '', scene: '', editingId: null };

  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    NX.mountSidebar('knowledge');
    NX.scenes.forEach(s => {
      ['k-scene-filter', 'ke-scene'].forEach(id => {
        const o = document.createElement('option'); o.value = s; o.textContent = s;
        document.getElementById(id).appendChild(o);
      });
    });
    document.getElementById('k-search').addEventListener('input', NX.debounce(e => { state.search = e.target.value.toLowerCase(); render(); }, 150));
    document.getElementById('k-scene-filter').addEventListener('change', e => { state.scene = e.target.value; render(); });
    document.getElementById('k-new').addEventListener('click', () => openEditor(null));
    render();
  }

  function render () {
    const list = NX.knowledge.filter(k => {
      if (state.scene && k.scene !== state.scene) return false;
      const q = state.search;
      if (q && !(k.name.toLowerCase().includes(q) || k.content.toLowerCase().includes(q) || (k.tags || []).join(',').toLowerCase().includes(q))) return false;
      return true;
    });
    document.getElementById('k-count-badge').textContent = `共 ${list.length} 条`;
    document.getElementById('k-list').innerHTML = list.map(cardHTML).join('') || `
      <div class="col-span-2 py-12 text-center text-sm text-slate-400">暂无知识片段</div>
    `;
  }

  function cardHTML (k) {
    return `
      <div class="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow">
        <div class="flex items-start justify-between mb-2">
          <div>
            <div class="text-sm font-semibold text-slate-900">${escapeHTML(k.name)}</div>
            <div class="mt-1 flex items-center gap-1.5">
              <span class="badge badge--sky">${k.scene}</span>
              ${(k.tags || []).map(t => `<span class="badge badge--slate">${escapeHTML(t)}</span>`).join('')}
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button class="text-xs text-emerald-600 hover:underline" onclick="KnowledgePage.edit('${k.id}')">编辑</button>
            <span class="text-slate-300">|</span>
            <button class="text-xs text-rose-600 hover:underline" onclick="KnowledgePage.del('${k.id}')">删除</button>
          </div>
        </div>
        <pre class="json-view max-h-32 overflow-hidden">${escapeHTML(k.content)}</pre>
        <div class="mt-2 flex items-center justify-between text-xs">
          <code class="text-violet-600">{{知识库.${escapeHTML(k.name)}}}</code>
          <span class="text-slate-400">最近 ${k.updatedAt}</span>
        </div>
      </div>
    `;
  }

  function openEditor (id) {
    state.editingId = id;
    const k = id ? NX.knowledge.find(x => x.id === id) : null;
    document.getElementById('k-editor-title').textContent = k ? `编辑 — ${k.name}` : '新建知识片段';
    document.getElementById('ke-name').value = k?.name || '';
    document.getElementById('ke-scene').value = k?.scene || NX.scenes[0];
    document.getElementById('ke-tags').value = (k?.tags || []).join(', ');
    document.getElementById('ke-content').value = k?.content || '';
    NX.openModal(document.getElementById('k-editor'));
  }
  Page.edit = (id) => openEditor(id);
  Page.del = (id) => {
    if (!confirm('确认删除?')) return;
    NX.knowledge.splice(NX.knowledge.findIndex(x => x.id === id), 1);
    NX.toast('已删除', 'success');
    render();
  };

  Page.save = function () {
    const name = document.getElementById('ke-name').value.trim();
    if (!name) { NX.toast('名称不能为空', 'error'); return; }
    const scene = document.getElementById('ke-scene').value;
    const tags = document.getElementById('ke-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const content = document.getElementById('ke-content').value;
    const now = new Date().toISOString().slice(0, 10);
    if (state.editingId) {
      const k = NX.knowledge.find(x => x.id === state.editingId);
      Object.assign(k, { name, scene, tags, content, updatedAt: now });
    } else {
      NX.knowledge.unshift({ id: 'kb-' + Math.random().toString(36).slice(2,6), name, scene, tags, content, updatedAt: now });
    }
    NX.closeModal(document.getElementById('k-editor'));
    NX.toast('已保存', 'success');
    render();
  };

  function escapeHTML (s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
