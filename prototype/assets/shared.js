/* ───────────── shared.js ─────────────
   全部页面共享的工具函数与 Sidebar 注入。
   纯静态原型,无后端,数据全部来自 assets/mock/*.js
*/

window.NX = window.NX || {};

/* ─────────── Sidebar 注入 + 当前菜单高亮 ─────────── */
NX.mountSidebar = async function (currentKey) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;
  const res  = await fetch('../partials/sidebar.html');
  const html = await res.text();
  root.innerHTML = html;
  // 高亮
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
    btn.innerHTML = `<span>${item.icon || ''}</span>${item.label}`;
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
