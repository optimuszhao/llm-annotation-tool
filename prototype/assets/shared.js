/* ───────────── shared.js ─────────────
   全部页面共享的工具函数与 Sidebar 注入。
   纯静态原型,无后端,数据全部来自 assets/mock/*.js
*/

window.NX = window.NX || {};

/* ─────────── Sidebar HTML (内联,同步注入,消除导航闪烁) ─────────── */
NX._SIDEBAR_HTML = `
<aside class="flex h-full w-64 shrink-0 flex-col text-slate-300" style="background:#0B1220">

  <!-- Brand -->
  <div class="flex items-center justify-between px-4 pt-5 pb-4">
    <div class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/90">
        <svg class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="2.2"/>
          <path d="M7.5 7.5a6 6 0 0 0 0 9"/><path d="M16.5 7.5a6 6 0 0 1 0 9"/>
          <path d="M4.5 4.5a10 10 0 0 0 0 15"/><path d="M19.5 4.5a10 10 0 0 1 0 15"/>
        </svg>
      </div>
      <span class="text-lg font-semibold text-white">标注 Lab</span>
    </div>
  </div>

  <!-- 主导航 -->
  <nav class="flex-1 space-y-1 overflow-y-auto px-3 pt-2 scroll-thin">
    <a href="datasets.html" data-key="datasets"
       class="nav-item relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-white/5">
      <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>
      <span>数据集管理</span>
    </a>

    <a href="workbench.html" data-key="workbench"
       class="nav-item relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-white/5">
      <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>
      <span class="flex-1">标注工作台</span>
      <span class="text-[10px] text-emerald-400">⭐</span>
    </a>

    <a href="prompts.html" data-key="prompts"
       class="nav-item relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-white/5">
      <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><path d="M8 13h8M8 17h6"/></svg>
      <span>Prompt 管理</span>
    </a>

    <a href="knowledge.html" data-key="knowledge"
       class="nav-item relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-white/5">
      <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2.5 2.5 0 0 1 2.5-2.5H20v17H6.5A2.5 2.5 0 0 0 4 22"/><path d="M9 7h7M9 11h5"/></svg>
      <span>知识管理</span>
    </a>

    <a href="error-sets.html" data-key="error-sets"
       class="nav-item relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-white/5">
      <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
      <span>错题集管理</span>
    </a>

    <a href="models.html" data-key="models"
       class="nav-item relative flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-white/5">
      <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
      <span>模型管理</span>
    </a>
  </nav>

</aside>
`;

/* ─────────── Sidebar 注入 + 当前菜单高亮 ─────────── */
/* 同步注入,不使用 fetch,彻底消除导航时的侧边栏闪白 */
NX.mountSidebar = function (currentKey) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;
  root.innerHTML = NX._SIDEBAR_HTML;
  root.querySelectorAll('.nav-item').forEach((el) => {
    if (el.dataset.key === currentKey) el.classList.add('active');
  });
};

/* ─────────── Toast ─────────── */
NX.toast = function (msg, kind = 'default', duration = 2500) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const div = document.createElement('div');
  div.className = `toast ${kind === 'success' ? 'toast--success' : kind === 'error' ? 'toast--error' : ''}`;
  div.textContent = msg;
  root.appendChild(div);
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity 200ms';
    setTimeout(() => div.remove(), 220);
  }, duration);
};

/* ─────────── JSON 高亮渲染 ─────────── */
NX.renderJSON = function (obj, indent = 2) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, indent);
  // 简易语法高亮
  const escaped = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d*)?([eE][+\-]?\d+)?)/g,
    (m) => {
      let cls = 'n';
      if (/^"/.test(m))       cls = /:$/.test(m) ? 'k' : 's';
      else if (/true|false/.test(m)) cls = 'b';
      else if (/null/.test(m))       cls = 'null';
      return `<span class="${cls}">${m}</span>`;
    }
  );
};

/* ─────────── 相对时间 ─────────── */
NX.relativeTime = function (date) {
  const d = date instanceof Date ? date : new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)      return `${Math.floor(diff)} 秒前`;
  if (diff < 3600)    return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400*30) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 86400*365) return `${Math.floor(diff / 86400 / 30)} 个月前`;
  return `${Math.floor(diff / 86400 / 365)} 年前`;
};

/* ─────────── 防抖 / 节流 ─────────── */
NX.debounce = function (fn, ms = 200) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

/* ─────────── 复制到剪贴板 ─────────── */
NX.copy = async function (text) {
  try {
    await navigator.clipboard.writeText(text);
    NX.toast('已复制', 'success', 1200);
  } catch {
    NX.toast('复制失败', 'error');
  }
};

/* ─────────── 下载文件 ─────────── */
NX.downloadJSON = function (data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* ─────────── 通用 Modal 控制 ─────────── */
NX.openModal = function (modalEl) { modalEl.classList.add('open'); };
NX.closeModal = function (modalEl) { modalEl.classList.remove('open'); };

/* ─────────── 通用 Drawer 控制 ─────────── */
NX.openDrawer = function (drawerEl, maskEl) {
  drawerEl.classList.add('open');
  maskEl.classList.add('open');
};
NX.closeDrawer = function (drawerEl, maskEl) {
  drawerEl.classList.remove('open');
  maskEl.classList.remove('open');
};

/* ─────────── 行操作菜单(单例) ─────────── */
NX.openActionMenu = function (anchorEl, items) {
  document.querySelectorAll('.action-menu').forEach(el => el.remove());
  const rect = anchorEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'action-menu';
  menu.style.top  = rect.bottom + 4 + 'px';
  menu.style.left = (rect.right - 168) + 'px';
  items.forEach((item) => {
    if (item === '-') {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#E2E8F0;margin:4px 6px';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    if (item.danger) btn.classList.add('danger');
    btn.innerHTML = `<span class="action-icon">${item.icon || ''}</span><span>${item.label}</span>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.remove();
      item.onClick && item.onClick();
    };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  // 点击外部关闭
  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    document.addEventListener('click', close);
  }, 0);
};

/* ─────────── 简单状态徽章渲染 ─────────── */
NX.statusBadge = function (status) {
  const map = {
    done:        { cls: 'green',  text: '已完成', icon: '🟢' },
    running:     { cls: 'amber',  text: '进行中', icon: '⏳' },
    pending:     { cls: 'slate',  text: '未标注', icon: '⚪' },
    failed:      { cls: 'rose',   text: '失败',   icon: '🔴' },
    partial:     { cls: 'yellow', text: '部分完成', icon: '🟡' },
  };
  const m = map[status] || map.pending;
  return `<span class="badge badge--${m.cls}">${m.text}</span>`;
};
