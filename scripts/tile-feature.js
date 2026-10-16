'use strict';
// 终端多窗平铺:单窗(现状) → 左右双窗 → 四宫格
// 设计:slots 数组持有可见会话 id;点标签换入当前格;窗格带窄标题条(不包裹 xterm 节点,绝对定位覆盖);
// fitActive 语义扩展为「平铺时 fit 所有可见」,一处改动覆盖全部既有 fit 调用点。
const fs = require('fs');
const f = 'D:/codes/fanbox/public/app.js';
let s = fs.readFileSync(f, 'utf8');
function rep(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.error(`[FAIL] ${label} 命中 ${n} 次`); process.exitCode = 1; return; }
  s = s.replace(from, to);
  console.log('[ok]', label);
}

// ---------- 1) 状态 ----------
rep(
  "sessions: [], seq: 0, active: null, maximized: false,\n  dock: localStorage.getItem('fb_term_dock') || 'right',",
  "sessions: [], seq: 0, active: null, maximized: false,\n  dock: localStorage.getItem('fb_term_dock') || 'right',\n  tile: { mode: [1, 2, 4].includes(Number(localStorage.getItem('fb_term_tiles'))) ? Number(localStorage.getItem('fb_term_tiles')) : 1, slots: [] }, // 平铺:mode 1=单窗 2=左右 4=四宫格,slots=各格会话 id",
  'tile 状态');

// ---------- 2) 新方法群(visibleSessions/normalizeSlots/tileRects/applyTiles/setTileMode) ----------
const METHODS = [
  "  visibleSessions() {",
  "    return this.tile.slots.map((id) => this.sessions.find((s) => s.id === id)).filter(Boolean);",
  "  },",
  "  normalizeSlots() {",
  "    const valid = this.tile.slots.filter((x) => x && this.sessions.some((s) => s.id === x)).slice(0, this.tile.mode);",
  "    const rest = this.sessions.filter((s) => !valid.includes(s.id)).map((s) => s.id);",
  "    while (valid.length < Math.min(this.tile.mode, this.sessions.length) && rest.length) valid.push(rest.shift());",
  "    this.tile.slots = valid;",
  "  },",
  "  tileRects(n) {",
  "    const host = $('#xterm-host');",
  "    const W = host.clientWidth, H = host.clientHeight, g = 6;",
  "    if (n <= 1 || this.tile.mode === 1) return [{ x: 0, y: 0, w: W, h: H }];",
  "    if (this.tile.mode === 2) {",
  "      const w = (W - g) / 2;",
  "      return [{ x: 0, y: 0, w, h: H }, { x: w + g, y: 0, w: W - w - g, h: H }];",
  "    }",
  "    const w = (W - g) / 2, h = (H - g) / 2;",
  "    return [",
  "      { x: 0, y: 0, w, h },",
  "      { x: w + g, y: 0, w: W - w - g, h },",
  "      { x: 0, y: h + g, w, h: H - h - g },",
  "      { x: w + g, y: h + g, w: W - w - g, h: H - h - g },",
  "    ].slice(0, n);",
  "  },",
  "  // 平铺布局:实例内联定位 + 窄标题条 + 逐格 fit。mode 1 时完全回到单窗现状。onlyLayout=true 时不重建标题文字之外的东西",
  "  applyTiles(onlySize) {",
  "    const host = $('#xterm-host');",
  "    if (this.tile.mode === 1 || this.sessions.length <= 1) {",
  "      host.querySelectorAll('.tile-head').forEach((el) => el.remove());",
  "      this.sessions.forEach((s) => { s.host.classList.toggle('show', s.id === this.active); s.host.style.cssText = ''; });",
  "      return;",
  "    }",
  "    this.normalizeSlots();",
  "    const vis = this.visibleSessions();",
  "    const rects = this.tileRects(vis.length);",
  "    const HEAD = 20;",
  "    const shown = new Set();",
  "    vis.forEach((s, i) => {",
  "      const rc = rects[i];",
  "      shown.add(s.id);",
  "      s.host.classList.add('show');",
  "      s.host.style.cssText = 'left:' + rc.x + 'px;top:' + (rc.y + HEAD) + 'px;width:' + rc.w + 'px;height:' + Math.max(60, rc.h - HEAD) + 'px;';",
  "    });",
  "    this.sessions.forEach((s) => { if (!shown.has(s.id)) { s.host.classList.remove('show'); s.host.style.cssText = ''; } });",
  "    let heads = host.querySelector('.tile-heads');",
  "    if (!heads) { heads = document.createElement('div'); heads.className = 'tile-heads'; host.appendChild(heads); }",
  "    if (!onlySize) {",
  "      heads.innerHTML = vis.map((s, i) => {",
  "        const dot = s.dead ? 'dead' : (s.status === 'busy' ? 'busy' : 'idle');",
  "        return '<div class=\"tile-head' + (s.id === this.active ? ' active' : '') + '\" data-id=\"' + s.id + '\" style=\"left:' + rects[i].x + 'px;top:' + rects[i].y + 'px;width:' + rects[i].w + 'px\">' +",
  "          '<span class=\"tab-dot ' + dot + '\"></span><span class=\"tile-title\">' + escapeHtml(s.title || 'shell') + '</span>' +",
  "          '<span class=\"tile-x\" title=\"关闭\">✕</span></div>';",
  "      }).join('');",
  "    }",
  "    requestAnimationFrame(() => vis.forEach((s) => { try { s.fit && s.fit.fit(); } catch { /* */ } }));",
  "  },",
  "  setTileMode(mode) {",
  "    this.tile.mode = mode;",
  "    localStorage.setItem('fb_term_tiles', String(mode));",
  "    if (mode > 1) {",
  "      const btn = $('#btn-term-tiles'); if (btn) btn.classList.add('on');",
  "      this.normalizeSlots();",
  "      this.applyTiles();",
  "      toast(mode === 2 ? '终端:左右双窗 · 点标签换入当前格' : '终端:四宫格 · 点标签换入当前格');",
  "    } else {",
  "      const btn = $('#btn-term-tiles'); if (btn) btn.classList.remove('on');",
  "      this.applyTiles();",
  "      this.fitActive();",
  "      toast('终端:单窗');",
  "    }",
  "  },",
  "  fitActive() {",
].join('\n');
rep(
  "  fitActive() {\n    const s = this.sessions.find((x) => x.id === this.active);",
  METHODS + "\n    const s = this.sessions.find((x) => x.id === this.active);",
  '新方法群 + fitActive 开头');

// fitActive 主体:平铺时 fit 所有可见
rep(
  "    const s = this.sessions.find((x) => x.id === this.active);\n    if (!s || !s.fit) return;\n    requestAnimationFrame(() => { try { s.fit.fit(); } catch { /* */ } });\n  },",
  "    if (this.tile.mode > 1) { const vis = this.visibleSessions(); requestAnimationFrame(() => vis.forEach((s) => { try { s.fit && s.fit.fit(); } catch { /* */ } })); return; }\n" +
  "    const s = this.sessions.find((x) => x.id === this.active);\n    if (!s || !s.fit) return;\n    requestAnimationFrame(() => { try { s.fit.fit(); } catch { /* */ } });\n  },",
  'fitActive 平铺分支');

// ---------- 3) activate:slots 换入逻辑 + applyTiles ----------
rep(
  "activate(id) {\n    this.active = id;\n    this.sessions.forEach((s) => s.host.classList.toggle('show', s.id === id));",
  "activate(id) {\n" +
  "    if (this.tile.mode > 1 && !this.tile.slots.includes(id)) {\n" +
  "      // 「点标签进当前格」:进原活动会话所在的格;有空格先填空格\n" +
  "      let target = this.tile.slots.findIndex((x) => !x || !this.sessions.some((s) => s.id === x));\n" +
  "      if (target < 0) target = this.tile.slots.indexOf(this.active);\n" +
  "      if (target < 0) target = this.tile.slots.length < this.tile.mode ? this.tile.slots.length : 0;\n" +
  "      this.tile.slots[target] = id;\n" +
  "    }\n" +
  "    this.active = id;\n    this.applyTiles();",
  'activate 换入逻辑');

// ---------- 4) closeTab:slots 清理 + 补位 ----------
rep(
  "    s.host.remove();\n    this.sessions.splice(i, 1);\n    updateWatches(); // 该终端的项目目录不再需要监听\n    if (!this.sessions.length) { this.close(); roster.render(); return; } // 不经 renderTabs，角标得在这清零\n    if (this.active === id) this.activate(this.sessions[Math.max(0, i - 1)].id);\n    else this.renderTabs();\n  },",
  "    s.host.remove();\n    this.sessions.splice(i, 1);\n    this.normalizeSlots(); // 窗格移除该会话,空格拉入下一个不可见会话补位\n    updateWatches(); // 该终端的项目目录不再需要监听\n    if (!this.sessions.length) { this.close(); roster.render(); return; } // 不经 renderTabs，角标得在这清零\n    if (this.active === id) this.activate(this.sessions[Math.max(0, i - 1)].id);\n    else { this.renderTabs(); this.applyTiles(); }\n  },",
  'closeTab 补位');

// ---------- 5) renderTabs 末尾:标题条状态随标签状态刷新 ----------
rep(
  "    roster.render(); // 标签的每次变化指挥台都跟着重画（状态/标题/增删）\n  },",
  "    if (this.tile.mode > 1) this.applyTiles(); // 标题条的状态点/标题跟标签状态走\n    roster.render(); // 标签的每次变化指挥台都跟着重画（状态/标题/增删）\n  },",
  'renderTabs 联动标题条');

// ---------- 6) restore:按快照顺序填格 ----------
rep(
  "    await Promise.all((saved.tabs || []).slice(0, 8).map((t) => this.newTab(t.cwd || undefined)));\n    const want = this.sessions[saved.active];",
  "    await Promise.all((saved.tabs || []).slice(0, 8).map((t) => this.newTab(t.cwd || undefined)));\n    this.normalizeSlots(); // 按快照顺序填窗格\n    const want = this.sessions[saved.active];",
  'restore 填格');

// ---------- 7) newTab:host 标记 data-id(窗格点击委托用) ----------
rep(
  "    host.classList.add('show'); // 先可见再 open/fit：display:none 下 fit 量不出尺寸，PTY 会以 80 列出生",
  "    host.dataset.id = id;\n    host.classList.add('show'); // 先可见再 open/fit：display:none 下 fit 量不出尺寸，PTY 会以 80 列出生",
  'host data-id');

// ---------- 8) host mousedown 委托(窗格点击聚焦/标题条动作) + RO 改走 applyTiles ----------
rep(
  "  if (window.ResizeObserver) new ResizeObserver(() => term.fitActive()).observe($('#xterm-host'));",
  "  if (window.ResizeObserver) new ResizeObserver(() => term.applyTiles(true)).observe($('#xterm-host')); // host 尺寸变 → 重算各格矩形并逐格 fit\n" +
  "  $('#xterm-host').addEventListener('mousedown', (e) => {\n" +
  "    const head = e.target.closest('.tile-head');\n" +
  "    if (head) {\n" +
  "      const sid = head.dataset.id;\n" +
  "      if (e.target.classList.contains('tile-x')) { term.closeTab(sid); return; }\n" +
  "      if (sid && sid !== term.active) term.activate(sid);\n" +
  "      return;\n" +
  "    }\n" +
  "    const inst = e.target.closest('.xterm-instance');\n" +
  "    if (inst && inst.dataset.id && inst.dataset.id !== term.active) term.activate(inst.dataset.id);\n" +
  "  });",
  'host 委托 + RO');

// ---------- 9) 分屏按钮绑定(挂在 term-newtab 绑定旁) ----------
rep(
  "  $('#term-newtab').onclick = () => { wechatView.close(); term.newTab(); };",
  "  $('#btn-term-tiles').onclick = () => term.setTileMode(term.tile.mode === 4 ? 1 : (term.tile.mode === 2 ? 4 : 2));\n  $('#term-newtab').onclick = () => { wechatView.close(); term.newTab(); };",
  '分屏按钮绑定');

fs.writeFileSync(f, s);
console.log(process.exitCode ? '有失败项！' : '平铺功能补丁完成');
