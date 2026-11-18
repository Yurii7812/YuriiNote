// 盤面のエンジン（ブレストのノート・索引の地図で共通）。中身の形と保存の形は ../board-core.js
// 操作（YuriiNote のボードに合わせる）:
//   空きをクリック → 書く　ノードをクリック → 直す（空にすると消える）　ID のチップ → そのノートを開く
//   書いている途中: Enter → 確定して、すぐ下に次（同じ親につなぐ）　Tab → 確定して、右に広げる（このノードにつなぐ）
//                   Shift+Enter → 改行　Esc → 確定して抜ける　Ctrl+U → 探して入れる　Ctrl+M → 次の (n)
//   ノードから別のノードへドラッグ → 線でつなぐ（もう一度で外す）　ノードから空きへドラッグ → そこに、つながった次のノード
//   空きをドラッグ → ペン（pen: false の盤面では、盤面ごと動く）
//   Ctrl+ドラッグ・右ボタンでドラッグ → ノードを動かす（空きなら、盤面ごと動く）
//   ホイール → 上下左右に動く　Ctrl+ホイール → 拡大・縮小　Ctrl+0 → 全体を見る
//   右クリック → メニュー　Ctrl+Z・Ctrl+Y → 元に戻す・やり直す　ノードに合わせて Space → のぞく（peek を渡したとき）
import C from '../board-core.js';
import { popMenu } from './shared.js';

const NS = 'http://www.w3.org/2000/svg';
const DRAG = 4, GAP = 12, STEP_X = 48, DEF_W = 150, DEF_H = 32;

const smooth = f => {
  const p = []; for (let i = 0; i + 1 < f.length; i += 2) p.push([f[i], f[i + 1]]);
  if (p.length < 3) return 'M' + p.map(q => q.join(' ')).join(' L');
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
  const l = p[p.length - 1]; return d + ` L${l[0]} ${l[1]}`;
};
const thin = pts => { const out = []; let last = null; pts.forEach((q, i) => { const r = [Math.round(q[0]), Math.round(q[1])]; if (!last || i === pts.length - 1 || Math.hypot(r[0] - last[0], r[1] - last[1]) >= 3) { out.push(r); last = r; } }); return out.flat(); };

export function mountBoard(root, o) {
  const opt = { pen: true, placeholder: '書く', hint: '', render: t => escHtml(t), onChange() {}, ...o };
  let st = C.clean(opt.model), view = opt.view && isFinite(opt.view.s) ? { ...opt.view } : null;
  const undo = [], redo = [], parentOf = new Map();   // parentOf: Enter・Tab・ドラッグで作ったノードの親（Enter の「次」を同じ親につなぐため）
  root.classList.add('bb'); root.tabIndex = 0;
  root.innerHTML = `<div class="bb-world"><svg class="bb-lines"></svg><svg class="bb-pen"></svg><div class="bb-nodes"></div></div>${opt.hint ? `<div class="bb-hint">${opt.hint}</div>` : ''}`;
  const world = root.querySelector('.bb-world'), lines = root.querySelector('.bb-lines'), pen = root.querySelector('.bb-pen'), box = root.querySelector('.bb-nodes');
  const byId = id => st.n.find(a => a.id === id);
  const elOf = id => box.querySelector(`.bb-node[data-n="${id}"]`);
  const sizeOf = id => { const e = elOf(id); return [e && e.offsetWidth || DEF_W, e && e.offsetHeight || DEF_H]; };

  // ---- 見る位置（拡大率と位置）
  const apply = () => { world.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`; root.style.setProperty('--bb-s', view.s); };
  const viewChanged = () => { apply(); opt.onView && opt.onView({ ...view }); };
  const toWorld = (cx, cy) => { const r = root.getBoundingClientRect(); return [(cx - r.left - view.tx) / view.s, (cy - r.top - view.ty) / view.s]; };
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const a of st.n) { const [w, h] = sizeOf(a.id); x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + w); y1 = Math.max(y1, a.y + h); }
    for (const f of st.s) for (let i = 0; i + 1 < f.length; i += 2) { x0 = Math.min(x0, f[i]); y0 = Math.min(y0, f[i + 1]); x1 = Math.max(x1, f[i]); y1 = Math.max(y1, f[i + 1]); }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }
  function fit() {
    const b = bounds(), W = root.clientWidth, H = root.clientHeight, pad = 40;
    if (!b || !W || !H) { view = { s: 1, tx: pad, ty: pad }; return viewChanged(); }
    const s = Math.max(0.2, Math.min(1, (W - pad * 2) / Math.max(1, b.x1 - b.x0), (H - pad * 2) / Math.max(1, b.y1 - b.y0)));
    view = { s, tx: Math.round((W - (b.x1 - b.x0) * s) / 2 - b.x0 * s), ty: Math.round(Math.min(pad, (H - (b.y1 - b.y0) * s) / 2) - b.y0 * s) };
    viewChanged();
  }
  const zoomAt = (cx, cy, k) => {
    const r = root.getBoundingClientRect(), s = Math.max(0.2, Math.min(3, view.s * k)), px = cx - r.left, py = cy - r.top;
    view = { s, tx: px - (px - view.tx) * s / view.s, ty: py - (py - view.ty) * s / view.s }; viewChanged();
  };
  // 見えていない所のノードを、見える所に入る分だけ動かす
  function reveal(id) {
    const a = byId(id); if (!a) return; const [w, h] = sizeOf(id), W = root.clientWidth, H = root.clientHeight, m = 30;
    if (!W || !H) return;
    const x0 = view.tx + a.x * view.s, y0 = view.ty + a.y * view.s, x1 = x0 + w * view.s, y1 = y0 + h * view.s;
    let dx = 0, dy = 0;
    if (x0 < m) dx = m - x0; else if (x1 > W - m) dx = W - m - x1;
    if (y0 < m) dy = m - y0; else if (y1 > H - m) dy = H - m - y1;
    if (dx || dy) { view.tx += dx; view.ty += dy; viewChanged(); }
  }

  // ---- 描く
  const mid = id => { const a = byId(id), [w, h] = sizeOf(id); return a ? [a.x + w / 2, a.y + h / 2] : [0, 0]; };
  function drawLines() {
    lines.innerHTML = st.l.map(([a, b], i) => { const [x1, y1] = mid(a), [x2, y2] = mid(b); return `<line class="bb-hit" data-l="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="bb-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }).join('');
  }
  const drawPen = () => { pen.innerHTML = st.s.map((f, i) => `<path class="bb-stroke" d="${smooth(f)}"/><path class="bb-shit" data-s="${i}" d="${smooth(f)}"/>`).join(''); };
  function draw() {
    box.innerHTML = st.n.map(a => `<div class="bb-node${a.k ? ' k-' + a.k : ''}" data-n="${a.id}" style="left:${a.x}px;top:${a.y}px">${opt.render(a.text, a)}</div>`).join('');
    root.classList.toggle('empty', !st.n.length && !st.s.length);
    drawLines(); drawPen();
    if (editing) placeInput();
  }

  // ---- 変更（元に戻す用に、前の形を積む）
  const snap = () => JSON.stringify(st);
  const changed = before => {
    if (snap() === before) return false;
    undo.push(before); if (undo.length > 150) undo.shift(); redo.length = 0;
    draw(); opt.onChange(C.clean(st)); return true;
  };
  const commit = fn => { const before = snap(); fn(); return changed(before); };
  const back = (from, to) => { if (!from.length) return; finish(true); to.push(snap()); st = JSON.parse(from.pop()); draw(); opt.onChange(C.clean(st)); };
  const removeNode = id => { st.n = st.n.filter(a => a.id !== id); st.l = st.l.filter(([p, q]) => p !== id && q !== id); };
  const linkToggle = (a, b) => { const i = st.l.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a)); if (i >= 0) st.l.splice(i, 1); else st.l.push([a, b]); };

  // ---- 書く・直す（textarea。書いた分だけ広がる）
  let editing = null, hold = false;
  function placeInput() { const e = editing; if (!e) return; const a = e.id ? byId(e.id) : null; e.inp.style.left = (a ? a.x : e.x) + 'px'; e.inp.style.top = (a ? a.y : e.y) + 'px'; }
  function edit(id, at) {   // id: 直すノード。at: { x, y, link }（新しいノードの場所と、つなぐ先）
    finish();
    const a = id ? byId(id) : null; if (id && !a) return;
    const inp = document.createElement('textarea');
    inp.className = 'bb-input'; inp.rows = 1; inp.spellcheck = false; inp.placeholder = opt.placeholder; inp.value = a ? a.text : '';
    world.append(inp);
    editing = { inp, id: a ? a.id : 0, x: at ? at.x : 0, y: at ? at.y : 0, link: at ? at.link || 0 : 0, parent: at ? at.parent || 0 : 0 };
    placeInput();
    if (a) { const e = elOf(a.id); if (e) { e.classList.add('editing'); inp.style.minWidth = e.offsetWidth + 'px'; } }
    const grow = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
    inp.addEventListener('input', grow);
    inp.focus({ preventScroll: true }); if (a) inp.select(); grow();
    if (editing.id) reveal(editing.id); else revealAt(editing.x, editing.y);
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      if (ctrl && e.code === 'KeyU' && opt.search) { e.preventDefault(); hold = true; const s0 = inp.selectionStart, s1 = inp.selectionEnd; opt.search(t => { hold = false; if (t != null) { inp.setRangeText(t, s0, s1, 'end'); grow(); } if (inp.isConnected) inp.focus(); }); return; }
      if (ctrl && e.code === 'KeyM' && opt.anchor) { e.preventDefault(); inp.setRangeText(opt.anchor(inp.value), inp.selectionStart, inp.selectionEnd, 'end'); grow(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); next('below'); }
      else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); next('right'); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(); root.focus({ preventScroll: true }); }
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (!hold && editing && editing.inp === inp && document.activeElement !== inp) finish(); }, 0));
  }
  const revealAt = (x, y) => { const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return; const sx = view.tx + x * view.s, sy = view.ty + y * view.s; let dx = 0, dy = 0; if (sx < 30) dx = 30 - sx; else if (sx > W - 200) dx = W - 200 - sx; if (sy < 30) dy = 30 - sy; else if (sy > H - 60) dy = H - 60 - sy; if (dx || dy) { view.tx += dx; view.ty += dy; viewChanged(); } };
  // 書いたものを確定する。新しいノードなら、その番号を返す
  function finish(cancel) {
    const ed = editing; if (!ed) return 0; editing = null; hold = false;
    const v = ed.inp.value.replace(/\s+$/, ''); ed.inp.remove();
    const e = ed.id && elOf(ed.id); if (e) e.classList.remove('editing');
    if (cancel) return ed.id;
    let made = 0;
    commit(() => {
      if (ed.id) { if (!v.trim()) removeNode(ed.id); else byId(ed.id).text = v; return; }
      if (!v.trim()) return;
      made = C.nextId(st); st.n.push({ id: made, x: Math.round(ed.x), y: Math.round(ed.y), text: v });
      if (ed.link && byId(ed.link)) st.l.push([ed.link, made]);
      if (ed.parent) parentOf.set(made, ed.parent);
    });
    return ed.id && byId(ed.id) ? ed.id : made;
  }
  const rect = id => { const a = byId(id), [w, h] = sizeOf(id); return { x: a.x, y: a.y, w, h }; };
  const free = (x, y, skip) => {   // 重なるなら、下へずらす
    const w = DEF_W, h = DEF_H;
    for (let i = 0; i < 60; i++) {
      const hit = st.n.find(a => a.id !== skip && (() => { const r = rect(a.id); return x < r.x + r.w + 6 && r.x < x + w && y < r.y + r.h + 6 && r.y < y + h; })());
      if (!hit) return [x, y]; y = rect(hit.id).y + rect(hit.id).h + GAP;
    }
    return [x, y];
  };
  const parentGuess = id => {
    if (parentOf.has(id) && byId(parentOf.get(id))) return parentOf.get(id);
    const a = byId(id), ps = C.neighbors(st, id).map(byId).filter(b => b && b.x < a.x - 10).sort((p, q) => q.x - p.x || Math.abs(p.y - a.y) - Math.abs(q.y - a.y));
    return ps[0] ? ps[0].id : 0;
  };
  function next(dir) {
    const ed = editing; if (!ed) return;
    const empty = !ed.inp.value.trim();
    const parentOfNew = ed.id ? 0 : ed.link;   // まだ確定していないノードの親
    const id = finish(); if (!id) { if (!empty) return; root.focus({ preventScroll: true }); return; }
    const r = rect(id);
    if (dir === 'below') {
      const p = parentOfNew || parentGuess(id), [x, y] = free(r.x, r.y + r.h + GAP);
      edit(0, { x, y, link: p, parent: p });
    } else {
      const kids = C.neighbors(st, id).map(byId).filter(b => b && b.x > r.x + 10);
      const y0 = kids.length ? Math.max(...kids.map(k => rect(k.id).y + rect(k.id).h + GAP)) : r.y;
      const [x, y] = free(r.x + r.w + STEP_X, y0);
      edit(0, { x, y, link: id, parent: id });
    }
  }

  // ---- 指の操作
  let drag = null, hover = 0;
  root.addEventListener('contextmenu', e => { if (e.target.closest('.bb-input')) return; e.preventDefault(); });
  root.addEventListener('pointerover', e => { const n = e.target.closest && e.target.closest('.bb-node'); hover = n ? +n.dataset.n : 0; });
  root.addEventListener('pointerleave', () => { hover = 0; });
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.bb-input') || e.target.closest('.bb-hint')) return;
    const chip = e.target.closest('.chip'), node = e.target.closest('.bb-node'), id = node ? +node.dataset.n : 0;
    if (chip && e.button === 0 && !e.ctrlKey && !e.metaKey) return;   // ID のチップ: いつもの「開く」に任せる
    if (e.button === 1) return;
    if (editing) finish();
    const [x, y] = toWorld(e.clientX, e.clientY);
    drag = { x0: e.clientX, y0: e.clientY, x, y, id, btn: e.button, ctrl: e.ctrlKey || e.metaKey, moved: false, tx: view.tx, ty: view.ty,
      line: e.target.closest('.bb-hit'), stroke: e.target.closest('.bb-shit'), chip: !!chip, pts: [[x, y]] };
    if (id) { const a = byId(id); drag.ax = a.x; drag.ay = a.y; }
    try { root.setPointerCapture(e.pointerId); } catch { }
    e.preventDefault(); root.focus({ preventScroll: true });
  });
  root.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG) return;
    drag.moved = true;
    const mode = drag.mode || (drag.mode = drag.id && (drag.ctrl || drag.btn === 2) ? 'move' : drag.id ? 'link' : drag.btn === 2 || drag.ctrl || !opt.pen ? 'pan' : 'pen');
    if (mode === 'move') {
      const a = byId(drag.id), el = elOf(drag.id);
      if (!drag.before) drag.before = snap();
      a.x = Math.round(drag.ax + dx / view.s); a.y = Math.round(drag.ay + dy / view.s);
      if (el) { el.style.left = a.x + 'px'; el.style.top = a.y + 'px'; el.classList.add('moving'); }
      drawLines();
    } else if (mode === 'pan') { view.tx = drag.tx + dx; view.ty = drag.ty + dy; apply(); }
    else if (mode === 'link') {
      const [x2, y2] = toWorld(e.clientX, e.clientY), [x1, y1] = mid(drag.id);
      let g = lines.querySelector('.bb-temp'); if (!g) { g = document.createElementNS(NS, 'line'); g.setAttribute('class', 'bb-temp'); lines.append(g); }
      g.setAttribute('x1', x1); g.setAttribute('y1', y1); g.setAttribute('x2', x2); g.setAttribute('y2', y2);
      box.querySelectorAll('.bb-node.target').forEach(n => n.classList.remove('target'));
      const over = overNode(e); if (over && over !== drag.id) elOf(over)?.classList.add('target');
    } else if (mode === 'pen') {
      drag.pts.push(toWorld(e.clientX, e.clientY));
      let live = pen.querySelector('.bb-live'); if (!live) { live = document.createElementNS(NS, 'path'); live.setAttribute('class', 'bb-stroke bb-live'); pen.append(live); }
      live.setAttribute('d', smooth(drag.pts.flat()));
    }
  });
  const overNode = e => { const t = document.elementFromPoint(e.clientX, e.clientY), n = t && t.closest ? t.closest('.bb-node') : null; return n && root.contains(n) ? +n.dataset.n : 0; };
  root.addEventListener('pointercancel', () => { drag = null; pen.querySelector('.bb-live')?.remove(); lines.querySelector('.bb-temp')?.remove(); });
  root.addEventListener('pointerup', e => {
    const d = drag; drag = null; if (!d) return;
    lines.querySelector('.bb-temp')?.remove(); pen.querySelector('.bb-live')?.remove();
    box.querySelectorAll('.bb-node.target,.bb-node.moving').forEach(n => n.classList.remove('target', 'moving'));
    if (d.mode === 'move') { if (d.before) changed(d.before); return; }
    if (d.mode === 'pan') return viewChanged();
    if (d.mode === 'pen') { const f = thin(d.pts); if (f.length >= 4) commit(() => st.s.push(f)); return; }
    if (d.mode === 'link') {
      const to = overNode(e);
      if (to && to !== d.id) commit(() => linkToggle(d.id, to));
      else if (!to) { const [x, y] = toWorld(e.clientX, e.clientY); edit(0, { x: x - 8, y: y - 14, link: d.id, parent: d.id }); }
      return;
    }
    if (d.btn === 2) return menu(e, d);
    if (d.btn !== 0) return;
    if (d.id) return edit(d.id);
    edit(0, { x: d.x - 8, y: d.y - 14 });
  });
  function menu(e, d) {
    if (d.chip && opt.chipMenu === false) return;   // ID のチップの右クリックは、使う所のメニューに任せる
    if (d.id) {
      const a = byId(d.id);
      return popMenu(e, [['✏️ 直す', () => edit(d.id)], ...(opt.nodeMenu ? opt.nodeMenu(a, api) : []), ['🗑️ 消す', () => commit(() => removeNode(d.id)), true]]);
    }
    if (d.line) { const i = +d.line.dataset.l; return popMenu(e, [['🗑️ 線を消す', () => commit(() => st.l.splice(i, 1)), true]]); }
    if (d.stroke) { const i = +d.stroke.dataset.s; return popMenu(e, [['🗑️ ペンの線を消す', () => commit(() => st.s.splice(i, 1)), true]]); }
    popMenu(e, [['✏️ ここに書く', () => edit(0, { x: d.x - 8, y: d.y - 14 })], ['🔍 全体を見る（Ctrl+0）', fit], ...(undo.length ? [['↶ 元に戻す（Ctrl+Z）', () => back(undo, redo)]] : [])]);
  }
  root.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    else { view.tx -= e.deltaX; view.ty -= e.deltaY; viewChanged(); }
  }, { passive: false });
  root.addEventListener('keydown', e => {
    if (editing || e.target !== root) return;
    const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.stopPropagation(); back(undo, redo); }
    else if (ctrl && e.code === 'KeyY') { e.preventDefault(); e.stopPropagation(); back(redo, undo); }
    else if (ctrl && (e.key === '0' || e.code === 'Digit0')) { e.preventDefault(); e.stopPropagation(); fit(); }
    else if (e.key === ' ' && !e.ctrlKey && hover && opt.peek) { e.preventDefault(); e.stopPropagation(); const el = elOf(hover); opt.peek(byId(hover), el); }
  });

  draw();
  if (view) apply(); else requestAnimationFrame(() => { if (!view) fit(); }), setTimeout(() => { if (!view) fit(); }, 0);
  const api = {
    get model() { return C.clean(st); },
    set(m) { st = C.clean(m); draw(); },
    get view() { return view ? { ...view } : null; },
    setView(v) { if (v && isFinite(v.s)) { view = { s: v.s, tx: v.tx, ty: v.ty }; apply(); } },
    fit, redraw: draw, edit, reveal,
    focusNode(id, cls = 'bb-focus') { const e = elOf(id); if (!e) return; box.querySelectorAll('.' + cls).forEach(x => x.classList.remove(cls)); e.classList.add(cls); reveal(id); },
    update(id, text) { commit(() => { const a = byId(id); if (a) a.text = text; }); },
    nodeEl: elOf,
  };
  return api;
}
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
