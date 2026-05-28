/* ───────── 数据集管理页 ───────── */
(function () {
  const Page = window.DatasetsPage = {};
  let state = { search: '', scene: '', selected: new Set(), editingId: null };

  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    NX.mountSidebar('datasets');
    initSceneFilter();
    bindEvents();
    render();
  }

  function initSceneFilter () {
    const filter = document.getElementById('ds-scene-filter');
    NX.scenes.forEach(s => {
      const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
      filter.appendChild(opt);
    });
    const upScene = document.getElementById('upload-scene');
    NX.scenes.forEach(s => {
      const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
      upScene.appendChild(opt);
    });
  }

  function bindEvents () {
    document.getElementById('ds-search').addEventListener('input', NX.debounce((e) => {
      state.search = e.target.value.trim().toLowerCase();
      render();
    }, 150));
    document.getElementById('ds-scene-filter').addEventListener('change', (e) => {
      state.scene = e.target.value;
      render();
    });
    document.getElementById('ds-select-all').addEventListener('change', (e) => {
      const visible = filtered();
      if (e.target.checked) visible.forEach(d => state.selected.add(d.id));
      else                  visible.forEach(d => state.selected.delete(d.id));
      render();
    });
    document.getElementById('ds-upload-btn').addEventListener('click', () => {
      NX.openModal(document.getElementById('upload-modal'));
    });
    document.getElementById('ds-merge-btn').addEventListener('click', mergeSelected);
  }

  function filtered () {
    return NX.datasets.filter(d => {
      if (state.scene && d.scene !== state.scene) return false;
      if (state.search && !d.name.toLowerCase().includes(state.search)) return false;
      return true;
    });
  }

  function render () {
    const list = filtered();
    document.getElementById('ds-count-badge').textContent = `共 ${list.length} 个`;
    const tbody = document.getElementById('ds-tbody');
    tbody.innerHTML = list.map(rowHTML).join('') || `
      <tr><td colspan="7" class="px-4 py-10 text-center text-slate-400 text-sm">暂无数据集 — 点右上「上传 Excel」</td></tr>
    `;
    list.forEach(d => {
      const cb = tbody.querySelector(`input[data-id="${d.id}"]`);
      if (cb) cb.addEventListener('change', () => {
        if (cb.checked) state.selected.add(d.id); else state.selected.delete(d.id);
        renderMergeBtn();
      });
    });
    renderMergeBtn();
  }

  function rowHTML (d) {
    const checked = state.selected.has(d.id) ? 'checked' : '';
    const mappingBadge = d.mappingDone
      ? `<span class="badge badge--green">✅ 已配置</span>`
      : `<span class="badge badge--amber">⚠ 未配置</span>`;
    return `
      <tr class="tbody-row">
        <td class="border-b border-slate-100 px-4 py-3">
          <input type="checkbox" data-id="${d.id}" ${checked} class="rounded border-slate-300" />
        </td>
        <td class="border-b border-slate-100 px-4 py-3">
          <div class="flex items-center gap-2">
            ${d.merged
              ? `<span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7H6a2 2 0 0 0-2 2v9h7"/><path d="M16 7h2a2 2 0 0 1 2 2v9h-7"/><path d="m11 14 3 4 3-4"/></svg></span>`
              : `<span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 10h8M8 14h6"/></svg></span>`}
            <span class="font-medium">${d.name}</span>
            ${d.merged ? '<span class="badge badge--violet">合并集</span>' : ''}
          </div>
        </td>
        <td class="border-b border-slate-100 px-4 py-3"><span class="badge badge--sky">${d.scene}</span></td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-600">${d.rowCount.toLocaleString()} / ${d.colCount}</td>
        <td class="border-b border-slate-100 px-4 py-3">${mappingBadge}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-slate-600">${d.createdAt}</td>
        <td class="border-b border-slate-100 px-4 py-3 text-right">
          <button onclick="DatasetsPage.openMapping('${d.id}')" class="text-sm font-medium text-emerald-600 hover:underline">编辑映射</button>
          <span class="text-slate-300 mx-2">|</span>
          <a href="workbench.html?ds=${d.id}" class="text-sm font-medium text-slate-700 hover:underline">进入标注</a>
        </td>
      </tr>
    `;
  }

  function renderMergeBtn () {
    const btn = document.getElementById('ds-merge-btn');
    const cnt = state.selected.size;
    document.getElementById('ds-selected-count').textContent = `(${cnt})`;
    if (cnt >= 2) {
      btn.disabled = false;
      btn.classList.remove('text-slate-400');
      btn.classList.add('text-slate-700', 'hover:bg-slate-50');
    } else {
      btn.disabled = true;
      btn.classList.add('text-slate-400');
      btn.classList.remove('text-slate-700', 'hover:bg-slate-50');
    }
  }

  /* ─── 字段映射 ─── */
  Page.openMapping = function (id) {
    state.editingId = id;
    const d = NX.datasets.find(x => x.id === id);
    if (!d) return;
    document.getElementById('mapping-modal-title').textContent = `字段映射 — ${d.name}`;
    const body = document.getElementById('mapping-modal-body');
    body.innerHTML = `
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">默认显示列(多选)</label>
        <div class="flex flex-wrap gap-2" id="m-default-cols"></div>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">标注参考列(多选,Prompt 占位符变量源)</label>
        <div class="flex flex-wrap gap-2" id="m-ref-cols"></div>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">答案列(单选 · Ground Truth) <span class="text-rose-500">*</span></label>
        <select id="m-gt-col" class="block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400">
          ${d.columns.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <div class="text-xs text-slate-400 mt-1">此列字段名会出现在 Prompt 编辑器的"输出建议"中</div>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">预测列(单选)</label>
        <select id="m-pred-col" class="block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400">
          ${d.columns.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    `;
    const m = d.mapping || { defaultCols: [], refCols: [], gtCol: d.columns[d.columns.length - 2], predCol: d.columns[d.columns.length - 1] };
    body.querySelector('#m-default-cols').innerHTML = d.columns.map(c => colChip('default', c, m.defaultCols.includes(c))).join('');
    body.querySelector('#m-ref-cols').innerHTML     = d.columns.map(c => colChip('ref',     c, m.refCols.includes(c))).join('');
    body.querySelector('#m-gt-col').value   = m.gtCol;
    body.querySelector('#m-pred-col').value = m.predCol;

    body.querySelectorAll('[data-chip]').forEach(el => {
      el.addEventListener('click', () => el.classList.toggle('chip-on'));
    });

    NX.openModal(document.getElementById('mapping-modal'));
  };

  function colChip (kind, name, active) {
    return `<button data-chip="${kind}" data-name="${name}" class="chip ${active ? 'chip-on' : ''} inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">${name}</button>`;
  }

  Page.saveMapping = function () {
    const d = NX.datasets.find(x => x.id === state.editingId);
    if (!d) return;
    const body = document.getElementById('mapping-modal-body');
    const defaultCols = [...body.querySelectorAll('[data-chip="default"].chip-on')].map(el => el.dataset.name);
    const refCols     = [...body.querySelectorAll('[data-chip="ref"].chip-on')].map(el => el.dataset.name);
    const gtCol       = body.querySelector('#m-gt-col').value;
    const predCol     = body.querySelector('#m-pred-col').value;
    d.mapping = { defaultCols, refCols, gtCol, predCol };
    d.mappingDone = true;
    NX.closeModal(document.getElementById('mapping-modal'));
    NX.toast(`已保存「${d.name}」的字段映射`, 'success');
    render();
  };

  /* ─── 上传 ─── */
  Page.confirmUpload = function () {
    const scene = document.getElementById('upload-scene').value;
    const id = 'ds-' + Math.random().toString(36).slice(2, 7);
    NX.datasets.unshift({
      id, name: `新建数据集_${id}.xlsx`, scene,
      rowCount: 100 + Math.floor(Math.random() * 800),
      colCount: 6 + Math.floor(Math.random() * 4),
      mappingDone: false, createdAt: new Date().toISOString().slice(0, 10),
      columns: ['ID', '内容', '渠道', '答案列', '预测列'], mapping: null,
    });
    NX.closeModal(document.getElementById('upload-modal'));
    NX.toast('上传成功(mock),请配置字段映射', 'success');
    render();
  };

  /* ─── 合并 ─── */
  function mergeSelected () {
    if (state.selected.size < 2) return;
    const ids = [...state.selected];
    const sources = NX.datasets.filter(d => ids.includes(d.id));
    const id = 'ds-' + Math.random().toString(36).slice(2, 7);
    const allCols = [...new Set(sources.flatMap(s => s.columns))];
    NX.datasets.unshift({
      id, name: `合并_${sources.map(s => s.name.replace('.xlsx', '')).join('+')}`, scene: sources[0].scene,
      merged: true, parentIds: ids,
      rowCount: sources.reduce((a, b) => a + b.rowCount, 0),
      colCount: allCols.length,
      mappingDone: false,
      createdAt: new Date().toISOString().slice(0, 10),
      columns: allCols, mapping: null,
    });
    state.selected.clear();
    NX.toast(`已合并 ${ids.length} 份数据集`, 'success');
    render();
  }
})();
