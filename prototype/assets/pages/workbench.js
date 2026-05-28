/* ───────── 标注工作台(核心页) ─────────
   设计要点:
   - 表格渲染:一次性 innerHTML;事件委托,避免逐行 addEventListener
   - 选中状态:维护 Set,行内只切 class,不全表重渲
   - 抽屉/弹窗:全局单例,内容按需填充
   - TP/TN/FP/FN:人工答案 vs 模型答案,均为 是/否 二值
*/
(function () {
  const Page = window.WorkbenchPage = {};

  const state = {
    dsId: null,
    schemeId: null,
    rows: [],
    visibleRows: [],
    selected: new Set(),
    view: 'all',
    search: '',
    contrastRole: null,
    rowFilterFromMetric: null,
    drawerRowId: null,
    drawerTab: 'current',
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    await NX.mountSidebar('workbench');
    initToolbar();
    initSchemeAndDataset();
    initStartModal();
    bindInnerTabs();
    bindViewTabs();
    bindBatchBar();
    bindGlobals();
    renderAll();
  }

  /* ───────── Toolbar ───────── */
  function initToolbar () {
    const dsSel = document.getElementById('tb-dataset');
    NX.datasets.filter(d => d.mappingDone).forEach(d => {
      const o = document.createElement('option'); o.value = d.id;
      o.textContent = `${d.name} (${d.scene})`; dsSel.appendChild(o);
    });
    dsSel.addEventListener('change', () => { state.dsId = dsSel.value; refreshScheme(); renderAll(); });

    const schSel = document.getElementById('tb-scheme');
    schSel.addEventListener('change', () => { state.schemeId = schSel.value; refreshContrastRoles(); renderAll(); });

    const ctSel = document.getElementById('tb-contrast');
    ctSel.addEventListener('change', () => { state.contrastRole = ctSel.value; renderAll(); });

    document.getElementById('tb-search').addEventListener('input', NX.debounce((e) => {
      state.search = e.target.value.trim().toLowerCase(); renderAll();
    }, 150));

    // 开始标注 → 弹出配置弹窗
    document.getElementById('tb-start').addEventListener('click', Page.openStartModal);
  }

  function initSchemeAndDataset () {
    const firstDs = NX.datasets.find(d => d.mappingDone);
    if (firstDs) { state.dsId = firstDs.id; document.getElementById('tb-dataset').value = firstDs.id; }
    refreshScheme();
  }

  function refreshScheme () {
    const sel = document.getElementById('tb-scheme');
    sel.innerHTML = '';
    NX.schemes.forEach(s => {
      const o = document.createElement('option'); o.value = s.id;
      o.textContent = `${s.name} · ${s.promptIds.length} Prompt`;
      sel.appendChild(o);
    });
    state.schemeId = NX.schemes[0]?.id || null;
    sel.value = state.schemeId;
    refreshContrastRoles();
  }

  function refreshContrastRoles () {
    const sch = NX.schemes.find(s => s.id === state.schemeId);
    const sel = document.getElementById('tb-contrast');
    sel.innerHTML = '';
    if (!sch) return;
    sch.promptIds.forEach(pid => {
      const p = NX.prompts.find(x => x.id === pid); if (!p) return;
      const o = document.createElement('option'); o.value = p.role;
      o.textContent = `对照:${p.role}`; sel.appendChild(o);
    });
    state.contrastRole = NX.prompts.find(x => x.id === sch.promptIds[0])?.role || null;
    sel.value = state.contrastRole || '';
  }

  /* ───────── 开始标注配置弹窗 ───────── */
  function initStartModal () {
    // 填充弹窗里的 dataset / scheme 下拉
    const smDs = document.getElementById('sm-dataset');
    const smSch = document.getElementById('sm-scheme');
    NX.datasets.filter(d => d.mappingDone).forEach(d => {
      const o = document.createElement('option'); o.value = d.id;
      o.textContent = d.name; smDs.appendChild(o);
    });
    NX.schemes.forEach(s => {
      const o = document.createElement('option'); o.value = s.id;
      o.textContent = s.name; smSch.appendChild(o);
    });
  }

  Page.openStartModal = function () {
    // 同步当前工具栏选项
    document.getElementById('sm-dataset').value    = state.dsId || '';
    document.getElementById('sm-scheme').value     = state.schemeId || '';
    document.getElementById('sm-concurrency').value = '5';

    const selCount     = state.selected.size;
    const pendingCount = state.rows.filter(r => r.status === 'pending').length;
    document.getElementById('sm-sel-count').textContent     = selCount + ' 行';
    document.getElementById('sm-pending-count').textContent = pendingCount + ' 行';

    // 默认范围:有选中用选中,否则用未标注
    const radioSelected = document.querySelector('input[name="sm-scope"][value="selected"]');
    const radioPending  = document.querySelector('input[name="sm-scope"][value="pending"]');
    if (selCount > 0) radioSelected.checked = true;
    else              radioPending.checked  = true;

    NX.openModal(document.getElementById('start-modal'));
  };

  Page.confirmStart = function () {
    const scope = document.querySelector('input[name="sm-scope"]:checked')?.value;
    let rowIds;
    if (scope === 'selected') {
      rowIds = [...state.selected];
      if (rowIds.length === 0) { NX.toast('请先勾选行', 'error'); return; }
    } else if (scope === 'pending') {
      rowIds = state.rows.filter(r => r.status === 'pending').map(r => r.id);
      if (rowIds.length === 0) { NX.toast('没有待标注的行', 'error'); return; }
    } else {
      rowIds = state.rows.map(r => r.id);
    }
    NX.closeModal(document.getElementById('start-modal'));
    simulateAnnotate(rowIds);
  };

  /* ───────── 内部 Tab / 视图 Tab ───────── */
  function bindInnerTabs () {
    document.querySelectorAll('.tab-inner').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-inner').forEach(t => { t.classList.remove('active','font-semibold'); t.classList.add('font-medium'); });
        tab.classList.add('active','font-semibold'); tab.classList.remove('font-medium');
        const key = tab.dataset.inner;
        ['annotate','schemes','tasks'].forEach(k => {
          const p = document.getElementById('pane-' + k);
          if (k === key) { p.classList.remove('hidden'); p.classList.add('flex'); }
          else            { p.classList.add('hidden');    p.classList.remove('flex'); }
        });
        if (key === 'schemes') renderSchemes();
        if (key === 'tasks')   renderTasks();
      });
    });
  }

  function bindViewTabs () {
    document.querySelectorAll('.tab-view').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-view').forEach(t => { t.classList.remove('active','font-semibold'); t.classList.add('font-medium'); });
        tab.classList.add('active','font-semibold'); tab.classList.remove('font-medium');
        state.view = tab.dataset.view || 'all';
        state.rowFilterFromMetric = null;
        renderAll();
      });
    });
  }

  function bindBatchBar () {
    document.getElementById('batch-clear').addEventListener('click', () => {
      state.selected.clear(); updateBatchBar(); updateRowSelectionUI();
    });
  }

  function bindGlobals () {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        Page.closeDrawer();
        NX.closeModal(document.getElementById('start-modal'));
        NX.closeModal(document.getElementById('add-error-modal'));
        NX.closeModal(document.getElementById('analyze-modal'));
      }
    });
    document.getElementById('drawer-mask').addEventListener('click', Page.closeDrawer);
  }

  /* ───────── 渲染总控 ───────── */
  function renderAll () {
    state.rows = NX.annotationRows;
    applyFilters();
    renderMetricBar();
    renderTable();
    updateBatchBar();
  }

  function applyFilters () {
    let rows = state.rows;
    const gtCol = getCurrentDataset()?.mapping?.gtCol || '情感分类';
    const role  = state.contrastRole || '初审';

    if (state.view !== 'all') {
      rows = rows.filter(r => {
        if (state.view === 'pending')  return r.status === 'pending';
        if (state.view === 'done')     return r.status === 'done';
        if (state.view === 'failed')   return r.status === 'failed';
        if (state.view === 'mismatch') {
          if (r.status !== 'done') return false;
          return r.results[`[${role}]_${gtCol}`] !== r.data[gtCol];
        }
        return true;
      });
    }
    if (state.rowFilterFromMetric === 'tp') rows = rows.filter(r => classify(r) === 'tp');
    if (state.rowFilterFromMetric === 'tn') rows = rows.filter(r => classify(r) === 'tn');
    if (state.rowFilterFromMetric === 'fp') rows = rows.filter(r => classify(r) === 'fp');
    if (state.rowFilterFromMetric === 'fn') rows = rows.filter(r => classify(r) === 'fn');
    if (state.rowFilterFromMetric === 'done')    rows = rows.filter(r => r.status === 'done');
    if (state.rowFilterFromMetric === 'pending') rows = rows.filter(r => r.status === 'pending');
    if (state.rowFilterFromMetric === 'running') rows = rows.filter(r => r.status === 'running');
    if (state.rowFilterFromMetric === 'failed')  rows = rows.filter(r => r.status === 'failed');

    if (state.search) {
      const s = state.search;
      rows = rows.filter(r => Object.values(r.data).some(v => String(v).toLowerCase().includes(s)));
    }
    state.visibleRows = rows;
  }

  /* TP/TN/FP/FN:人工答案 vs 模型答案,均为 是/否 */
  function classify (r) {
    if (r.status !== 'done') return null;
    const role  = state.contrastRole || '初审';
    const gtCol = getCurrentDataset()?.mapping?.gtCol || '情感分类';
    const pred  = r.results[`[${role}]_${gtCol}`];
    const gt    = r.data[gtCol];
    if (pred == null || gt == null) return null;
    if (pred === '是' && gt === '是') return 'tp';
    if (pred === '否' && gt === '否') return 'tn';
    if (pred === '是' && gt === '否') return 'fp';
    if (pred === '否' && gt === '是') return 'fn';
    return null;
  }

  /* ───────── 指标条(单行) ───────── */
  function renderMetricBar () {
    const rows  = state.visibleRows;
    const total = rows.length;
    const cnt   = { done:0, running:0, pending:0, failed:0 };
    rows.forEach(r => { if (r.status in cnt) cnt[r.status]++; });

    const conf = { tp:0, tn:0, fp:0, fn:0 };
    rows.forEach(r => { const c = classify(r); if (c) conf[c]++; });
    const tot  = conf.tp + conf.tn + conf.fp + conf.fn;
    const acc  = tot                ? (conf.tp + conf.tn) / tot            : 0;
    const prec = (conf.tp+conf.fp)  ? conf.tp / (conf.tp + conf.fp)        : 0;
    const rec  = (conf.tp+conf.fn)  ? conf.tp / (conf.tp + conf.fn)        : 0;
    const f1   = (prec+rec)         ? 2 * prec * rec / (prec + rec)        : 0;
    const spec = (conf.tn+conf.fp)  ? conf.tn / (conf.tn + conf.fp)        : 0;

    const sep = '<span class="h-3.5 w-px bg-slate-200 mx-1 shrink-0"></span>';

    document.getElementById('mb-bar').innerHTML = [
      metricChip('总数',   total,       'slate', null),
      metricChip('已标注', cnt.done,    'green', 'done'),
      metricChip('未标注', cnt.pending, 'slate', 'pending'),
      metricChip('进行中', cnt.running, 'amber', 'running'),
      metricChip('失败',   cnt.failed,  'rose',  'failed'),
      sep,
      confChip('TP', conf.tp, 'violet', 'tp'),
      confChip('TN', conf.tn, 'sky',    'tn'),
      confChip('FP', conf.fp, 'amber',  'fp'),
      confChip('FN', conf.fn, 'rose',   'fn'),
      sep,
      pctChip('准确率', acc),
      pctChip('精确率', prec),
      pctChip('召回率', rec),
      pctChip('F1',     f1),
      pctChip('特异度', spec),
    ].join('');

    // 绑定点击筛选
    document.querySelectorAll('[data-metric]').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.metric;
        state.rowFilterFromMetric = state.rowFilterFromMetric === key ? null : key;
        applyFilters(); renderTable(); updateBatchBar();
        document.querySelectorAll('[data-metric]').forEach(b =>
          b.classList.remove('ring-2','ring-emerald-400','ring-offset-1'));
        if (state.rowFilterFromMetric) el.classList.add('ring-2','ring-emerald-400','ring-offset-1');
      });
    });
  }

  function metricChip (label, value, color, key) {
    const cls = {
      slate: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
      green: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
      rose:  'bg-rose-50 text-rose-700 hover:bg-rose-100',
    }[color] || 'bg-slate-100 text-slate-700';
    return `<button ${key ? `data-metric="${key}"` : ''} class="inline-flex items-center gap-1 rounded-md ${cls} px-2 py-0.5 text-xs transition-colors ${key ? 'cursor-pointer' : 'cursor-default'}">
      <span class="text-[11px] opacity-70">${label}</span>
      <span class="font-semibold">${value.toLocaleString()}</span>
    </button>`;
  }
  function confChip (label, value, color, key) {
    const cls = {
      violet: 'bg-violet-50 text-violet-700 hover:bg-violet-100',
      sky:    'bg-sky-50 text-sky-700 hover:bg-sky-100',
      amber:  'bg-amber-50 text-amber-700 hover:bg-amber-100',
      rose:   'bg-rose-50 text-rose-700 hover:bg-rose-100',
    }[color];
    return `<button data-metric="${key}" class="inline-flex items-center gap-1 rounded-md ${cls} px-2 py-0.5 text-xs cursor-pointer transition-colors">
      <span class="font-mono font-semibold">${label}</span>
      <span class="font-bold">${value}</span>
    </button>`;
  }
  function pctChip (label, value) {
    return `<span class="inline-flex items-center gap-1 text-xs whitespace-nowrap">
      <span class="text-slate-400">${label}</span>
      <span class="font-semibold text-slate-800">${(value*100).toFixed(1)}%</span>
    </span>`;
  }

  /* ───────── 表格 ───────── */
  function getCurrentScheme  () { return NX.schemes.find(s => s.id === state.schemeId); }
  function getCurrentPrompts () {
    const sc = getCurrentScheme(); if (!sc) return [];
    return sc.promptIds.map(pid => NX.prompts.find(p => p.id === pid)).filter(Boolean);
  }
  function getCurrentDataset () { return NX.datasets.find(d => d.id === state.dsId); }
  function getDisplayCols () {
    const d = getCurrentDataset();
    return d?.mapping?.defaultCols || NX.workbenchDefaultCols || ['ID', '用户反馈'];
  }

  function renderTable () {
    const cols    = getDisplayCols();
    const prompts = getCurrentPrompts();
    const ds      = getCurrentDataset();
    const gtCol   = ds?.mapping?.gtCol || '情感分类';
    const thead   = document.getElementById('anno-thead');
    const tbody   = document.getElementById('anno-tbody');

    thead.innerHTML = `
      <tr class="text-left text-[12px] font-medium text-slate-400">
        <th class="w-8 border-b border-slate-200 px-3 py-2.5">
          <input type="checkbox" id="hd-select-all" class="rounded border-slate-300" />
        </th>
        <th class="w-10 border-b border-slate-200 px-2 py-2.5">#</th>
        <th class="w-20 border-b border-slate-200 px-3 py-2.5">状态</th>
        ${cols.map(c => `<th class="border-b border-slate-200 px-3 py-2.5 whitespace-nowrap">${c}</th>`).join('')}
        ${prompts.flatMap(p => [
          `<th class="border-b border-slate-200 px-3 py-2.5 whitespace-nowrap text-violet-500">[${p.role}]_${gtCol}</th>`,
          `<th class="border-b border-slate-200 px-3 py-2.5 whitespace-nowrap text-violet-300">[${p.role}]_thinking</th>`,
        ]).join('')}
        <th class="border-b border-slate-200 px-3 py-2.5 whitespace-nowrap text-emerald-600">GT (${gtCol})</th>
        <th class="sticky-action-col w-28 border-b border-slate-200 px-2 py-2.5"></th>
      </tr>`;

    const html = state.visibleRows.map(r => rowHTML(r, cols, prompts, gtCol)).join('');
    tbody.innerHTML = html || `<tr><td colspan="20" class="px-4 py-16 text-center text-sm text-slate-400">无匹配行 — 调整筛选或视图</td></tr>`;

    tbody.onclick    = onTableClick;
    tbody.ondblclick = onTableDblClick;
    document.getElementById('hd-select-all').onclick = (e) => {
      if (e.target.checked) state.visibleRows.forEach(r => state.selected.add(r.id));
      else                  state.visibleRows.forEach(r => state.selected.delete(r.id));
      updateBatchBar(); updateRowSelectionUI();
    };
  }

  function rowHTML (r, cols, prompts, gtCol) {
    const selected = state.selected.has(r.id);
    const cls = classify(r);
    const clsBadge = cls
      ? `<span class="ml-1 inline-flex items-center rounded bg-slate-100 px-1 text-[10px] font-mono uppercase text-slate-400">${cls}</span>`
      : '';
    return `
      <tr class="tbody-row ${selected ? 'bg-emerald-50/40' : ''}" data-rid="${r.id}">
        <td class="border-b border-slate-100 px-3 py-2">
          <input type="checkbox" data-action="select" ${selected ? 'checked' : ''} class="rounded border-slate-300" />
        </td>
        <td class="border-b border-slate-100 px-2 py-2 text-slate-400 text-xs">${r.no}</td>
        <td class="border-b border-slate-100 px-3 py-2">${statusCell(r)}${clsBadge}</td>
        ${cols.map(c => `<td class="border-b border-slate-100 px-3 py-2 max-w-[220px] text-truncate text-xs">${escapeHTML(String(r.data[c] ?? ''))}</td>`).join('')}
        ${prompts.flatMap(p => [
          `<td class="border-b border-slate-100 px-3 py-2">${cellPred(r, p, gtCol)}</td>`,
          `<td class="border-b border-slate-100 px-3 py-2 max-w-[200px] text-truncate text-xs text-slate-400">${cellThinking(r, p)}</td>`,
        ]).join('')}
        <td class="border-b border-slate-100 px-3 py-2 font-semibold text-emerald-700 text-xs">${escapeHTML(String(r.data[gtCol] ?? '-'))}</td>
        <td class="sticky-action-col border-b border-slate-100 px-2 py-2">
          <div class="flex items-center justify-end gap-0.5">
            <!-- 常用:标注 / 详情 / 分析 -->
            <button data-action="annotate" title="标注"
              class="inline-flex h-6 w-6 items-center justify-center rounded text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button data-action="detail" title="详情"
              class="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button data-action="analyze" title="分析(UserHooks.analyze)"
              class="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            <!-- 更多 -->
            <button data-action="menu" title="更多"
              class="inline-flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-500">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }

  function statusCell (r) {
    if (r.status === 'running') return `<span class="inline-flex items-center gap-1 text-amber-600 text-xs"><span class="spinner"></span>进行中</span>`;
    return NX.statusBadge(r.status);
  }
  function cellPred (r, p, gtCol) {
    const v = r.results[`[${p.role}]_${gtCol}`];
    if (r.status === 'running') return `<span class="inline-flex items-center gap-1 text-amber-500 text-xs"><span class="spinner"></span></span>`;
    if (r.status === 'failed')  return `<span class="text-rose-500 text-xs">✕</span>`;
    if (v == null) return `<span class="text-slate-200">—</span>`;
    const gt = r.data[gtCol];
    const ok = v === gt;
    return `<span class="badge ${ok ? 'badge--green' : 'badge--rose'}">${escapeHTML(String(v))}</span>`;
  }
  function cellThinking (r, p) {
    const v = r.results[`[${p.role}]_thinking`];
    if (!v) return `<span class="text-slate-200">—</span>`;
    return `<span title="${escapeHTML(v)}">${escapeHTML(v)}</span>`;
  }
  function escapeHTML (s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ───────── 事件委托 ───────── */
  function onTableClick (e) {
    const tr = e.target.closest('tr[data-rid]'); if (!tr) return;
    const rid    = tr.dataset.rid;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'select') {
      if (e.target.checked) state.selected.add(rid); else state.selected.delete(rid);
      tr.classList.toggle('bg-emerald-50/40', e.target.checked);
      updateBatchBar();
    } else if (action === 'annotate') {
      simulateAnnotate([rid]);
    } else if (action === 'detail') {
      Page.openDrawer(rid, 'current');
    } else if (action === 'analyze') {
      analyzeRow(rid);
    } else if (action === 'menu') {
      openRowMenu(e.target.closest('[data-action]'), rid);
    }
  }
  function onTableDblClick (e) {
    const tr = e.target.closest('tr[data-rid]');
    if (!tr || e.target.closest('[data-action]')) return;
    Page.openDrawer(tr.dataset.rid);
  }

  /* 右键下拉:仅次要操作 */
  function openRowMenu (anchor, rid) {
    NX.openActionMenu(anchor, [
      { icon:'🕘', label:'标注历史', onClick: () => Page.openDrawer(rid, 'history') },
      { icon:'✎',  label:'编辑行',   onClick: () => editRow(rid) },
      { icon:'➕', label:'加入错题本', onClick: () => { state.selected.add(rid); updateBatchBar(); updateRowSelectionUI(); Page.openAddError(); } },
      { icon:'⬇',  label:'导出行',   onClick: () => exportRow(rid) },
      '-',
      { icon:'🗑', label:'删除',     onClick: () => deleteRow(rid), danger: true },
    ]);
  }

  /* ───────── 选中 / 批量栏 ───────── */
  function updateBatchBar () {
    const bar = document.getElementById('batch-bar');
    document.getElementById('batch-count').textContent = state.selected.size;
    if (state.selected.size > 0) { bar.classList.remove('hidden'); bar.classList.add('flex'); }
    else                          { bar.classList.add('hidden');    bar.classList.remove('flex'); }
  }
  function updateRowSelectionUI () {
    document.querySelectorAll('tr[data-rid]').forEach(tr => {
      const cb = tr.querySelector('input[data-action="select"]');
      const on = state.selected.has(tr.dataset.rid);
      if (cb) cb.checked = on;
      tr.classList.toggle('bg-emerald-50/40', on);
    });
  }

  /* ───────── 模拟标注 ───────── */
  function simulateAnnotate (rowIds) {
    const gtCol   = getCurrentDataset()?.mapping?.gtCol || '情感分类';
    const prompts = getCurrentPrompts();
    rowIds.forEach(rid => {
      const r = state.rows.find(x => x.id === rid); if (!r) return;
      r.status = 'running';
    });
    renderAll();
    NX.toast(`开始标注 ${rowIds.length} 行(模拟)…`, 'success');

    rowIds.forEach((rid, idx) => {
      const delay = 1500 + Math.random() * 4000;
      setTimeout(() => {
        const r = state.rows.find(x => x.id === rid); if (!r) return;
        const rand = Math.random();
        if (rand < 0.1) {
          r.status = 'failed';
        } else {
          prompts.forEach(p => {
            const gt   = r.data[gtCol];    // 是 / 否
            const pred = Math.random() < 0.85 ? gt : (gt === '是' ? '否' : '是');
            r.results[`[${p.role}]_${gtCol}`]    = pred;
            r.results[`[${p.role}]_thinking`]     = `${p.role}综合上下文判断为「${pred}」。`;
          });
          r.status = rand < 0.2 ? 'partial' : 'done';
        }
        renderAll();
      }, delay + idx * 100);
    });
  }

  /* ───────── 行操作 ───────── */
  function editRow (rid)   { NX.toast('编辑行 — 原型简化,待实现'); }
  function analyzeRow (rid) {
    const r = state.rows.find(x => x.id === rid); if (!r) return;
    const result = {
      summary: `行 ${rid} 分析摘要(mock)`,
      key_signals: ['反馈含情感词', 'GT 与预测' + (classify(r) === 'tp' || classify(r) === 'tn' ? '一致' : '不一致')],
      score: +(Math.random() * 0.4 + 0.6).toFixed(2),
      breakdown: { 是: +(Math.random()).toFixed(2), 否: +(Math.random()).toFixed(2) },
    };
    document.getElementById('analyze-result').innerHTML = NX.renderJSON(result);
    NX.openModal(document.getElementById('analyze-modal'));
  }
  function exportRow (rid) {
    const r = state.rows.find(x => x.id === rid); if (!r) return;
    NX.downloadJSON({ id:r.id, data:r.data, results:r.results, status:r.status }, `${rid}.json`);
    NX.toast('已导出 ' + rid, 'success');
  }
  function deleteRow (rid) {
    if (!confirm('确认删除该行?')) return;
    const i = state.rows.findIndex(x => x.id === rid);
    if (i >= 0) state.rows.splice(i, 1);
    state.selected.delete(rid); renderAll(); NX.toast('已删除', 'success');
  }

  Page.openExport = function () {
    NX.downloadJSON(state.visibleRows.map(r => ({ id:r.id, data:r.data, results:r.results, status:r.status })), 'export.json');
    NX.toast(`已导出 ${state.visibleRows.length} 行`, 'success');
  };

  /* ───────── 批量操作 ───────── */
  Page.bulkAnnotate = function () { simulateAnnotate([...state.selected]); };
  Page.bulkExport   = function () {
    const data = [...state.selected].map(id => state.rows.find(r => r.id === id)).filter(Boolean);
    NX.downloadJSON(data, `selected-${data.length}-rows.json`);
    NX.toast(`已导出 ${data.length} 行`, 'success');
  };
  Page.bulkDelete = function () {
    if (!state.selected.size) return;
    if (!confirm(`确认删除 ${state.selected.size} 行?`)) return;
    state.rows = state.rows.filter(r => !state.selected.has(r.id));
    state.selected.clear(); renderAll(); NX.toast('已批量删除', 'success');
  };

  /* ───────── 添加错题弹窗 ───────── */
  Page.openAddError = function () {
    if (!state.selected.size) { NX.toast('请先勾选至少一行'); return; }
    document.getElementById('ae-count').textContent = state.selected.size;
    const ds     = getCurrentDataset();
    const gtCol  = ds?.mapping?.gtCol || '情感分类';
    const refRole = state.contrastRole || getCurrentPrompts()[0]?.role;
    const baseCols   = [...(ds?.mapping?.defaultCols || []), gtCol];
    const promptCols = getCurrentPrompts().flatMap(p => [`[${p.role}]_${gtCol}`, `[${p.role}]_thinking`]);
    const allCols    = [...new Set([...baseCols, ...promptCols])];
    const defaultPicked = new Set([gtCol, refRole ? `[${refRole}]_${gtCol}` : null].filter(Boolean));

    const colsEl = document.getElementById('ae-cols');
    colsEl.innerHTML = allCols.map(c => `
      <label class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs hover:bg-slate-50 cursor-pointer">
        <input type="checkbox" data-col="${c}" ${defaultPicked.has(c) ? 'checked' : ''} class="rounded border-slate-300" />
        <span>${escapeHTML(c)}</span>
      </label>`).join('');
    colsEl.onchange = updateAddErrorPreview;
    updateAddErrorPreview();
    NX.openModal(document.getElementById('add-error-modal'));
  };
  function updateAddErrorPreview () {
    const picked = [...document.querySelectorAll('#ae-cols input:checked')].map(c => c.dataset.col);
    const ids = [...state.selected];
    const first = state.rows.find(r => r.id === ids[0]);
    if (!first || !picked.length) {
      document.getElementById('ae-preview').textContent = '请至少选择一列';
      document.getElementById('ae-preview-hint').textContent = '';
      return;
    }
    const obj = {};
    picked.forEach(c => { obj[c] = c.startsWith('[') ? first.results[c] : first.data[c]; });
    document.getElementById('ae-preview').innerHTML = NX.renderJSON(obj);
    document.getElementById('ae-preview-hint').textContent = `共生成 ${ids.length} 条错题,默认进入「散错题」`;
  }
  Page.confirmAddError = function () {
    const picked = [...document.querySelectorAll('#ae-cols input:checked')].map(c => c.dataset.col);
    if (!picked.length) { NX.toast('请至少选一列', 'error'); return; }
    const ids = [...state.selected];
    NX.closeModal(document.getElementById('add-error-modal'));
    NX.toast(`已将 ${ids.length} 行加入错题本`, 'success');
    ids.forEach(id => {
      const r = state.rows.find(x => x.id === id); if (!r) return;
      const content = {}; picked.forEach(c => { content[c] = c.startsWith('[') ? r.results[c] : r.data[c]; });
      if (window.NX.errorEntries) {
        window.NX.errorEntries.unshift({
          id: 'err-' + Math.random().toString(36).slice(2, 7),
          scene: getCurrentDataset()?.scene || 'SPN',
          setId: null,
          sourceRowId: id,
          createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          content,
        });
      }
    });
  };

  /* ───────── 抽屉 ───────── */
  Page.openDrawer = function (rid, defaultTab) {
    state.drawerRowId = rid;
    state.drawerTab   = defaultTab || 'current';
    document.querySelectorAll('.drawer-tab').forEach(t => {
      const active = t.dataset.dtab === state.drawerTab;
      t.classList.toggle('active', active);
      t.classList.toggle('text-emerald-600', active);
      t.classList.toggle('font-semibold', active);
      t.classList.toggle('border-emerald-500', active);
      t.classList.toggle('text-slate-500', !active);
      t.classList.toggle('border-transparent', !active);
      t.onclick = () => { state.drawerTab = t.dataset.dtab; Page.openDrawer(rid, state.drawerTab); };
    });
    document.getElementById('drawer-title').textContent = `行详情 · ${rid}`;
    renderDrawerBody();
    NX.openDrawer(document.getElementById('row-drawer'), document.getElementById('drawer-mask'));
  };
  Page.closeDrawer = function () {
    NX.closeDrawer(document.getElementById('row-drawer'), document.getElementById('drawer-mask'));
  };
  function renderDrawerBody () {
    const body = document.getElementById('drawer-body');
    const r = state.rows.find(x => x.id === state.drawerRowId);
    if (!r) { body.innerHTML = '<div class="text-slate-400">行不存在</div>'; return; }

    if (state.drawerTab === 'current') {
      const ds      = getCurrentDataset();
      const gtCol   = ds?.mapping?.gtCol || '情感分类';
      const prompts = getCurrentPrompts();
      body.innerHTML = `
        <section>
          <div class="text-xs font-semibold text-slate-500 mb-2">📄 原始字段</div>
          <pre class="json-view">${NX.renderJSON(r.data)}</pre>
        </section>
        <section>
          <div class="text-xs font-semibold text-slate-500 mb-2">🧩 渲染后 Prompt(第一个角色示例)</div>
          <pre class="json-view">${escapeHTML(renderPromptExample(r, prompts[0]))}</pre>
        </section>
        ${prompts.map(p => `
          <section>
            <div class="text-xs font-semibold text-violet-600 mb-2">🤖 [${p.role}] 模型返回</div>
            <pre class="json-view">${NX.renderJSON({
              thinking: r.results[`[${p.role}]_thinking`] || '-',
              [gtCol]:  r.results[`[${p.role}]_${gtCol}`] || '-',
            })}</pre>
            <div class="text-xs text-slate-400 mt-1">模型 = ${p.defaultModel} · 状态 = ${r.status}</div>
          </section>`).join('')}`;
    } else {
      const hist = (NX.rowHistory && NX.rowHistory[r.id]) || [];
      if (!hist.length) {
        body.innerHTML = `<div class="text-sm text-slate-400 py-6 text-center">暂无历史记录(原型仅 r-1003 含 mock 历史)</div>`;
        return;
      }
      body.innerHTML = hist.map((h, idx) => `
        <section class="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-slate-800">🕒 ${h.time} · ${h.schemeName}</div>
            <div class="text-xs text-slate-400">${h.taskId}</div>
          </div>
          <div class="mt-2 space-y-1.5 text-xs">
            ${h.roles.map(role => `
              <div class="flex items-center gap-2">
                <span class="font-medium text-violet-600">[${role.role}]</span>
                <span class="text-slate-400">→</span>
                <span class="font-semibold text-slate-800">${role.parsed['情感分类'] || '-'}</span>
                <span class="text-slate-400">· ${role.model} · ${(role.elapsedMs/1000).toFixed(1)}s</span>
              </div>`).join('')}
            <div class="text-slate-500 mt-1">GT = <span class="text-emerald-700 font-medium">${h.gt}</span> · ${verdictBadge(h.verdict)}</div>
          </div>
        </section>`).join('');
    }
  }
  function verdictBadge (v) {
    if (v === 'both-correct') return '<span class="badge badge--green">✅ 都对</span>';
    if (v === 'wrong')         return '<span class="badge badge--rose">❌ 错</span>';
    if (v === 'partial')       return '<span class="badge badge--amber">🟡 部分</span>';
    return v;
  }
  function renderPromptExample (r, p) {
    if (!p) return '(无 Prompt)';
    return p.template
      .replace(/\{\{用户反馈\}\}/g,   r.data['用户反馈'] || '')
      .replace(/\{\{期望\}\}/g,       r.data['期望'] || '')
      .replace(/\{\{故障描述\}\}/g,   r.data['故障描述'] || '')
      .replace(/\{\{设备\}\}/g,       r.data['设备'] || '')
      .replace(/\{\{级别\}\}/g,       r.data['级别'] || '')
      .replace(/\{\{知识库\.[^}]+\}\}/g, '<< 知识库片段 >>')
      .replace(/\{\{错题集\.[^}]+\}\}/g, '<< 错题集 JSON >>');
  }

  Page.drawerCopy = function () {
    const r = state.rows.find(x => x.id === state.drawerRowId); if (!r) return;
    NX.copy(JSON.stringify({ data:r.data, results:r.results, status:r.status }, null, 2));
  };
  Page.drawerExport = function () {
    const r = state.rows.find(x => x.id === state.drawerRowId); if (!r) return;
    NX.downloadJSON({ id:r.id, data:r.data, results:r.results, status:r.status }, `${r.id}.json`);
    NX.toast('已导出', 'success');
  };
  Page.drawerTranslate = function () {
    NX.toast('翻译(mock):UserHooks.translate 返回翻译结果', 'default', 3000);
  };

  /* ───────── 方案管理 Tab(紧凑) ───────── */
  Page.newScheme = function () { NX.toast('原型:方案新建表单待实现'); };
  Page.startFromScheme = function (schemeId) {
    state.schemeId = schemeId;
    document.getElementById('tb-scheme').value = schemeId;
    refreshContrastRoles();
    // 切换回标注 Tab
    document.querySelector('.tab-inner[data-inner="annotate"]').click();
    Page.openStartModal();
  };
  function renderSchemes () {
    document.getElementById('schemes-tbody').innerHTML = NX.schemes.map(s => {
      const roleList = s.promptIds.map(pid => NX.prompts.find(p => p.id === pid)?.role || '?').join(' / ');
      return `
        <tr class="tbody-row">
          <td class="border-b border-slate-100 px-4 py-2 font-medium text-sm">${escapeHTML(s.name)}</td>
          <td class="border-b border-slate-100 px-4 py-2"><span class="badge badge--sky">${s.scene}</span></td>
          <td class="border-b border-slate-100 px-4 py-2 text-slate-600 text-xs">${escapeHTML(roleList)}</td>
          <td class="border-b border-slate-100 px-4 py-2 text-slate-500 text-xs">${s.concurrency}</td>
          <td class="border-b border-slate-100 px-4 py-2 text-slate-400 text-xs">${s.lastUsed}</td>
          <td class="border-b border-slate-100 px-4 py-2 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="WorkbenchPage.startFromScheme('${s.id}')"
                class="h-7 px-2.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brandDark">▶ 标注</button>
              <button onclick="NX.toast('原型:编辑方案表单待实现')"
                class="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">编辑</button>
              <button onclick="NX.toast('原型:删除方案待接')"
                class="h-7 px-2.5 rounded-lg border border-rose-100 text-rose-500 text-xs hover:bg-rose-50">删除</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  /* ───────── 任务面板 Tab(紧凑) ───────── */
  function renderTasks () {
    document.getElementById('tasks-tbody').innerHTML = NX.tasks.map(t => {
      const pct = Math.round(t.progress.done / t.progress.total * 100);
      const statusHtml = t.status === 'running'
        ? `<div class="flex items-center gap-2">
             <span class="badge badge--amber">进行中</span>
             <div class="h-1.5 w-28 rounded-full bg-slate-100 overflow-hidden">
               <div class="h-full bg-amber-400 transition-all" style="width:${pct}%"></div>
             </div>
             <span class="text-xs text-slate-400">${t.progress.done}/${t.progress.total}</span>
           </div>`
        : t.status === 'done'
        ? `<span class="badge badge--green">✅ 完成</span><span class="ml-1.5 text-xs text-slate-400">准确率 ${(t.accuracy*100).toFixed(1)}%</span>`
        : t.status === 'failed'
        ? `<span class="badge badge--rose">失败</span><span class="ml-1.5 text-xs text-slate-400">${t.errMsg||''}</span>`
        : t.status === 'cancelled'
        ? `<span class="badge badge--slate">已取消</span>`
        : `<span class="badge badge--slate">${t.status}</span>`;
      const actionHtml = t.status === 'running'
        ? `<button onclick="NX.toast('原型:取消任务')" class="text-xs text-rose-500 hover:underline">取消</button>`
        : t.status === 'failed'
        ? `<button onclick="NX.toast('原型:重跑失败行')" class="text-xs text-emerald-600 hover:underline">重跑</button>`
        : `<button onclick="NX.toast('原型:任务详情')" class="text-xs text-slate-500 hover:underline">详情</button>`;
      return `
        <tr class="tbody-row">
          <td class="border-b border-slate-100 px-4 py-2 font-mono text-xs text-slate-500">${t.id}</td>
          <td class="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">${t.triggeredAt}</td>
          <td class="border-b border-slate-100 px-4 py-2 text-xs">${escapeHTML(t.datasetName)}</td>
          <td class="border-b border-slate-100 px-4 py-2"><span class="badge badge--sky">${escapeHTML(t.schemeName)}</span></td>
          <td class="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">${t.rowCount}</td>
          <td class="border-b border-slate-100 px-4 py-2">${statusHtml}</td>
          <td class="border-b border-slate-100 px-4 py-2 text-right">${actionHtml}</td>
        </tr>`;
    }).join('');
  }
})();
