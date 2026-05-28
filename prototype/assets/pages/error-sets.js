/* ───────── 错题集管理页(双栏)───────── */
(function () {
  const Page = window.ErrorSetsPage = {};
  const state = { scene: '', currentSet: null, currentEntry: null, selectedEntries: new Set() };

  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    NX.mountSidebar('error-sets');
    NX.scenes.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; document.getElementById('es-scene-filter').appendChild(o); });
    document.getElementById('es-scene-filter').addEventListener('change', e => { state.scene = e.target.value; renderLeft(); });
    document.getElementById('es-merge-btn').addEventListener('click', openMergeModal);

    // 默认选第一个错题集
    if (NX.errorSets.length > 0) {
      state.currentSet = NX.errorSets[0].id;
    }
    renderLeft();
    renderDetail();
  }

  function renderLeft () {
    const sets = NX.errorSets.filter(s => !state.scene || s.scene === state.scene);
    const orphans = NX.errorEntries.filter(e => !e.setId && (!state.scene || e.scene === state.scene));

    const list = document.getElementById('es-left-list');
    const countTotal = sets.length + orphans.length;
    document.getElementById('es-count-badge').textContent = `${sets.length} 集合 · ${orphans.length} 散`;

    let html = '';
    if (sets.length) {
      html += `<div class="px-2 pt-1 pb-2 text-[11px] font-semibold uppercase text-slate-400">错题集 (${sets.length})</div>`;
      html += sets.map(setRowHTML).join('');
    }
    if (orphans.length) {
      html += `<div class="px-2 pt-3 pb-2 text-[11px] font-semibold uppercase text-slate-400">散错题(尚未归集 ${orphans.length})</div>`;
      html += orphans.map(orphanRowHTML).join('');
    }
    if (countTotal === 0) html = `<div class="px-3 py-8 text-center text-sm text-slate-400">暂无错题</div>`;
    list.innerHTML = html;

    // 事件
    list.querySelectorAll('[data-set]').forEach(el => {
      el.addEventListener('click', () => { state.currentSet = el.dataset.set; state.currentEntry = null; renderDetail(); refreshActiveLeft(); });
    });
    list.querySelectorAll('[data-entry]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.matches('input[type="checkbox"]')) return;
        state.currentEntry = el.dataset.entry; state.currentSet = null; renderDetail(); refreshActiveLeft();
      });
    });
    list.querySelectorAll('input[data-sel]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = cb.dataset.sel;
        if (cb.checked) state.selectedEntries.add(id); else state.selectedEntries.delete(id);
        updateMergeBtn();
      });
    });
    refreshActiveLeft();
    updateMergeBtn();
  }

  function setRowHTML (s) {
    const count = NX.errorEntries.filter(e => e.setId === s.id).length;
    return `
      <button data-set="${s.id}" class="left-row w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center justify-between">
        <span class="flex items-center gap-2 min-w-0">
          <svg class="h-4 w-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"/></svg>
          <span class="truncate text-sm font-medium text-slate-800">${escapeHTML(s.name)}</span>
        </span>
        <span class="ml-2 inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700">${count}</span>
      </button>`;
  }
  function orphanRowHTML (e) {
    const summary = Object.values(e.content)[0] || '';
    return `
      <div data-entry="${e.id}" class="left-row group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100 cursor-pointer">
        <input type="checkbox" data-sel="${e.id}" ${state.selectedEntries.has(e.id) ? 'checked' : ''} class="rounded border-slate-300" onclick="event.stopPropagation()" />
        <div class="flex-1 min-w-0">
          <div class="truncate text-xs font-mono text-slate-700">${escapeHTML(e.id)} · ${escapeHTML(e.sourceRowId)}</div>
          <div class="truncate text-xs text-slate-500">${escapeHTML(String(summary))}</div>
        </div>
      </div>`;
  }
  function refreshActiveLeft () {
    document.querySelectorAll('.left-row').forEach(el => {
      el.classList.remove('bg-emerald-50', 'ring-1', 'ring-emerald-300');
    });
    if (state.currentSet) {
      const el = document.querySelector(`[data-set="${state.currentSet}"]`);
      el?.classList.add('bg-emerald-50', 'ring-1', 'ring-emerald-300');
    }
    if (state.currentEntry) {
      const el = document.querySelector(`[data-entry="${state.currentEntry}"]`);
      el?.classList.add('bg-emerald-50', 'ring-1', 'ring-emerald-300');
    }
  }
  function updateMergeBtn () {
    const btn = document.getElementById('es-merge-btn');
    const n = state.selectedEntries.size;
    document.getElementById('es-sel-count').textContent = n;
    if (n >= 1) {
      btn.disabled = false;
      btn.classList.remove('text-slate-400');
      btn.classList.add('text-emerald-700');
    } else {
      btn.disabled = true;
      btn.classList.add('text-slate-400');
      btn.classList.remove('text-emerald-700');
    }
  }

  function renderDetail () {
    const el = document.getElementById('es-detail');
    if (state.currentSet) {
      const s = NX.errorSets.find(x => x.id === state.currentSet);
      const entries = NX.errorEntries.filter(e => e.setId === s.id);
      el.innerHTML = `
        <div class="border-b border-slate-200 px-6 py-4">
          <div class="flex items-center justify-between">
            <input id="es-set-name" value="${escapeHTML(s.name)}" class="text-lg font-semibold text-slate-900 outline-none bg-transparent border-b border-transparent focus:border-emerald-400 px-1" />
            <div class="flex items-center gap-2">
              <button onclick="ErrorSetsPage.exportSet('${s.id}')" class="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">⬇ 导出 JSON</button>
              <button onclick="ErrorSetsPage.deleteSet('${s.id}')" class="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-600 hover:bg-rose-50">🗑 删除错题集</button>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span><code class="text-violet-600">{{错题集.${escapeHTML(s.name)}}}</code></span>
            <span>·</span>
            <span>${entries.length} 条错题</span>
            <span>·</span>
            <span>${escapeHTML(s.description || '无备注')}</span>
          </div>
        </div>
        <div class="px-6 py-4 space-y-3">
          ${entries.map(e => entryCard(e, true)).join('') || '<div class="text-sm text-slate-400 text-center py-8">这个错题集还没有错题</div>'}
        </div>
      `;
      // 绑定 set 名称保存
      const inp = el.querySelector('#es-set-name');
      inp.addEventListener('blur', () => { s.name = inp.value.trim() || s.name; NX.toast('已更新名称'); renderLeft(); });
    } else if (state.currentEntry) {
      const e = NX.errorEntries.find(x => x.id === state.currentEntry);
      el.innerHTML = `
        <div class="border-b border-slate-200 px-6 py-4">
          <div class="text-base font-semibold text-slate-800">错题详情 · ${escapeHTML(e.id)}</div>
          <div class="mt-1 text-xs text-slate-500">来自行 ${escapeHTML(e.sourceRowId)} · ${escapeHTML(e.createdAt)} · 场景 ${escapeHTML(e.scene)}</div>
        </div>
        <div class="px-6 py-4 space-y-3">
          ${entryCard(e, true)}
        </div>
      `;
    } else {
      el.innerHTML = `<div class="flex items-center justify-center h-full text-sm text-slate-400">← 在左侧选择错题集或散错题</div>`;
    }
  }

  function entryCard (e, editable) {
    return `
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs text-slate-500">
            <code class="text-slate-700">${escapeHTML(e.id)}</code>
            <span class="ml-2">来自行 ${escapeHTML(e.sourceRowId)} · ${escapeHTML(e.createdAt)}</span>
          </div>
          <div class="flex items-center gap-1">
            <button class="text-xs text-emerald-600 hover:underline" onclick="ErrorSetsPage.editEntry('${e.id}')">编辑</button>
            <span class="text-slate-300 mx-1">|</span>
            ${e.setId ? `<button class="text-xs text-slate-600 hover:underline" onclick="ErrorSetsPage.detachEntry('${e.id}')">移出集合</button>` : ''}
            ${e.setId ? '<span class="text-slate-300 mx-1">|</span>' : ''}
            <button class="text-xs text-rose-600 hover:underline" onclick="ErrorSetsPage.deleteEntry('${e.id}')">删除</button>
          </div>
        </div>
        <pre class="json-view">${NX.renderJSON(e.content)}</pre>
      </div>`;
  }

  Page.editEntry = (id) => {
    const e = NX.errorEntries.find(x => x.id === id);
    const next = prompt('粘贴新的 JSON 内容(原型简化:文本输入)', JSON.stringify(e.content, null, 2));
    if (next == null) return;
    try { e.content = JSON.parse(next); NX.toast('已更新', 'success'); renderDetail(); }
    catch { NX.toast('JSON 解析失败', 'error'); }
  };
  Page.detachEntry = (id) => {
    const e = NX.errorEntries.find(x => x.id === id);
    e.setId = null;
    NX.toast('已移出集合', 'success');
    renderLeft(); renderDetail();
  };
  Page.deleteEntry = (id) => {
    if (!confirm('确认删除该错题?')) return;
    NX.errorEntries.splice(NX.errorEntries.findIndex(x => x.id === id), 1);
    state.selectedEntries.delete(id);
    NX.toast('已删除', 'success');
    renderLeft(); renderDetail();
  };
  Page.exportSet = (id) => {
    const s = NX.errorSets.find(x => x.id === id);
    const entries = NX.errorEntries.filter(e => e.setId === id);
    NX.downloadJSON({ name: s.name, entries: entries.map(e => e.content) }, `${s.name}.json`);
    NX.toast('已导出', 'success');
  };
  Page.deleteSet = (id) => {
    if (!confirm('删除错题集?其中的错题将变为散错题')) return;
    NX.errorEntries.filter(e => e.setId === id).forEach(e => e.setId = null);
    NX.errorSets.splice(NX.errorSets.findIndex(s => s.id === id), 1);
    state.currentSet = null;
    NX.toast('已删除错题集', 'success');
    renderLeft(); renderDetail();
  };

  function openMergeModal () {
    if (state.selectedEntries.size === 0) return;
    document.getElementById('es-merge-name').value = '';
    document.getElementById('es-merge-desc').value = '';
    NX.openModal(document.getElementById('es-merge-modal'));
  }
  Page.confirmMerge = function () {
    const name = document.getElementById('es-merge-name').value.trim();
    if (!name) { NX.toast('请填写名称', 'error'); return; }
    const desc = document.getElementById('es-merge-desc').value.trim();
    const ids  = [...state.selectedEntries];
    const newId = 'es-' + Math.random().toString(36).slice(2, 6);
    NX.errorSets.unshift({
      id: newId, name, scene: NX.errorEntries.find(e => e.id === ids[0]).scene,
      description: desc, createdAt: new Date().toISOString().slice(0,10), entryCount: ids.length,
    });
    ids.forEach(id => { const e = NX.errorEntries.find(x => x.id === id); e.setId = newId; });
    state.selectedEntries.clear();
    state.currentSet = newId;
    NX.closeModal(document.getElementById('es-merge-modal'));
    NX.toast(`已合并 ${ids.length} 条 → 「${name}」`, 'success');
    renderLeft(); renderDetail();
  };

  function escapeHTML (s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
