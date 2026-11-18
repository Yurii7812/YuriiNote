// トピックインデックスの地図（ブレスト型）の盤面。中身の形は ../topic-map.js
// 操作（YuriiNote のボードと同じ考え）:
//   空きをクリック → キーワードを書く（「キーワード ID ID …」。今までの索引と同じ書き方）
//   ノードをクリック → 直す（空にすると消える）　ID のチップをクリック → そのノートを開く
//   ノードから別のノードへドラッグ → 線でつなぐ（もう一度すると外す）
//   Ctrl+ドラッグ・右ボタンでドラッグ → 動かす（空きを右ボタンでドラッグすると、盤面ごと動く）
//   右クリック → メニュー（直す・消す / 線を消す）　Ctrl+Z・Ctrl+Y → 元に戻す・やり直す
import M from '../topic-map.js';
import { popMenu } from './shared.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 240, DRAG = 4;

export function mountMap(root, { map, render, onChange, placeholder = 'キーワード ID ID …' }) {
  let st = M.clean(map) || { v: 1, n: [], l: [] };
  const undo = [], redo = [];
  root.classList.add('tmap'); root.tabIndex = 0;
  root.innerHTML = '<div class="tm-canvas"><svg class="tm-lines"></svg><div class="tm-nodes"></div></div><div class="tm-hint">クリック＝書く　ノードからドラッグ＝つなぐ　Ctrl+ドラッグ／右ドラッグ＝動かす　右クリック＝メニュー</div>';
  const canvas = root.querySelector('.tm-canvas'), svg = root.querySelector('.tm-lines'), box = root.querySelector('.tm-nodes');
  const scroller = () => root.closest('#pane') || root.parentElement;
  const byId = id => st.n.find(a => a[0] === id);
  const elOf = id => box.querySelector(`.tm-node[data-n="${id}"]`);

  const commit = (fn) => {   // 変更の前の形を、元に戻す用に積む
    const before = JSON.stringify(st); fn();
    if (JSON.stringify(st) === before) return;
    undo.push(before); if (undo.length > 100) undo.shift(); redo.length = 0;
    draw(); onChange(M.clean(st));
  };
  const back = (from, to) => { if (!from.length) return; to.push(JSON.stringify(st)); st = JSON.parse(from.pop()); draw(); onChange(M.clean(st)); };

  function size() {
    let w = 0, h = 0;
    for (const a of st.n) { const e = elOf(a[0]); w = Math.max(w, a[1] + (e ? e.offsetWidth : 200)); h = Math.max(h, a[2] + (e ? e.offsetHeight : 40)); }
    const p = scroller();
    canvas.style.width = (w + PAD) + 'px';   // 狭いときは、CSS の min-width:100% で画面の幅
    canvas.style.height = Math.max(h + PAD, p ? p.clientHeight - root.offsetTop - 60 : 0) + 'px';
  }
  const mid = id => { const a = byId(id), e = elOf(id); return a ? [a[1] + (e ? e.offsetWidth / 2 : 60), a[2] + (e ? e.offsetHeight / 2 : 16)] : [0, 0]; };
  function drawLines() {
    svg.innerHTML = st.l.map(([a, b], i) => { const [x1, y1] = mid(a), [x2, y2] = mid(b); return `<line class="tm-hit" data-l="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="tm-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }).join('');
  }
  function draw() {
    box.innerHTML = st.n.map(a => `<div class="tm-node" data-n="${a[0]}" style="left:${a[1]}px;top:${a[2]}px">${render(a[3])}</div>`).join('')
      || '<div class="tm-empty">まだ空です。空いている所をクリックして、キーワードを書きます</div>';
    size(); drawLines();
  }

  // 書く・直す（1 行の入力欄）
  let editing = null;
  function edit(x, y, id) {
    finish();
    const a = id ? byId(id) : null, inp = document.createElement('input');
    inp.className = 'tm-input'; inp.value = a ? a[3] : ''; inp.placeholder = placeholder; inp.spellcheck = false;
    inp.style.left = (a ? a[1] : x) + 'px'; inp.style.top = (a ? a[2] : y) + 'px';
    if (a) { const e = elOf(id); if (e) e.style.visibility = 'hidden'; }
    canvas.append(inp); inp.focus(); if (a) inp.select();
    editing = { inp, id, x, y };
    inp.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(true); root.focus(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (editing && editing.inp === inp) finish(); }, 0));
  }
  function finish(cancel) {
    const ed = editing; if (!ed) return; editing = null;
    const v = ed.inp.value.replace(/\s+$/, ''); ed.inp.remove();
    if (cancel) return draw();
    commit(() => {
      if (ed.id) {
        if (!v.trim()) { st.n = st.n.filter(a => a[0] !== ed.id); st.l = st.l.filter(([p, q]) => p !== ed.id && q !== ed.id); }
        else byId(ed.id)[3] = v;
      } else if (v.trim()) st.n.push([Math.max(0, ...st.n.map(a => a[0])) + 1, Math.round(ed.x), Math.round(ed.y), v]);
    });
    draw();
  }
  const remove = id => commit(() => { st.n = st.n.filter(a => a[0] !== id); st.l = st.l.filter(([p, q]) => p !== id && q !== id); });
  const toggleLink = (a, b) => commit(() => {
    const i = st.l.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a));
    if (i >= 0) st.l.splice(i, 1); else st.l.push([a, b]);
  });

  const at = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let drag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.target.closest('.tm-input')) return;
    const chip = e.target.closest('.chip'), node = e.target.closest('.tm-node'), id = node ? +node.dataset.n : 0;
    if (chip && e.button === 0 && !e.ctrlKey) return;   // ID のチップ: いつもの「開く」に任せる
    if (editing) finish();
    const [x, y] = at(e), p = scroller();
    drag = { x0: e.clientX, y0: e.clientY, x, y, id, btn: e.button, ctrl: e.ctrlKey || e.metaKey, moved: false,
      sx: p ? p.scrollLeft : 0, sy: p ? p.scrollTop : 0, line: e.target.closest('.tm-hit'), chip: !!chip };
    if (id) { const a = byId(id); drag.ax = a[1]; drag.ay = a[2]; }
    try { canvas.setPointerCapture(e.pointerId); } catch { } e.preventDefault(); root.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG) return;
    drag.moved = true;
    if (drag.id && (drag.ctrl || drag.btn === 2)) {   // 動かす
      const a = byId(drag.id), el = elOf(drag.id);
      if (!drag.started) { drag.started = JSON.stringify(st); }
      a[1] = Math.max(0, Math.round(drag.ax + dx)); a[2] = Math.max(0, Math.round(drag.ay + dy));
      if (el) { el.style.left = a[1] + 'px'; el.style.top = a[2] + 'px'; }
      drawLines();
    } else if (!drag.id && drag.btn === 2) {   // 盤面ごと動かす
      const p = scroller(); if (p) { p.scrollLeft = drag.sx - dx; p.scrollTop = drag.sy - dy; }
    } else if (drag.id && drag.btn === 0) {   // つなぐ線を引いている途中
      const [x2, y2] = at(e), [x1, y1] = mid(drag.id);
      let g = svg.querySelector('.tm-temp'); if (!g) { g = document.createElementNS(NS, 'line'); g.setAttribute('class', 'tm-temp'); svg.append(g); }
      g.setAttribute('x1', x1); g.setAttribute('y1', y1); g.setAttribute('x2', x2); g.setAttribute('y2', y2);
      box.querySelectorAll('.tm-node.target').forEach(n => n.classList.remove('target'));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.tm-node'); if (over && +over.dataset.n !== drag.id) over.classList.add('target');
    }
  });
  canvas.addEventListener('pointerup', e => {
    const d = drag; drag = null; if (!d) return;
    svg.querySelector('.tm-temp')?.remove(); box.querySelectorAll('.tm-node.target').forEach(n => n.classList.remove('target'));
    if (d.started) {   // 動かし終わり: 1 回の「元に戻す」にまとめる
      const now = JSON.stringify(st); if (now !== d.started) { undo.push(d.started); redo.length = 0; size(); onChange(M.clean(st)); }
      return;
    }
    if (d.moved && d.id && d.btn === 0 && !d.ctrl) {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.tm-node'), to = over ? +over.dataset.n : 0;
      if (to && to !== d.id) toggleLink(d.id, to);
      return;
    }
    if (d.moved) return;
    if (d.btn === 2) {   // 右クリック: メニュー
      if (d.chip) return;   // ID のチップの右クリックは、索引の画面のメニュー（赤い点）に任せる
      if (d.id) return popMenu(e, [['直す', () => edit(0, 0, d.id)], ['消す', () => remove(d.id), true]]);
      if (d.line) { const i = +d.line.dataset.l; return popMenu(e, [['線を消す', () => commit(() => st.l.splice(i, 1)), true]]); }
      return;
    }
    if (d.btn !== 0) return;
    if (d.id) return edit(0, 0, d.id);
    edit(d.x - 8, d.y - 14);
  });
  root.addEventListener('keydown', e => {
    if (editing || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.stopPropagation(); back(undo, redo); }
    else if (k === 'y') { e.preventDefault(); e.stopPropagation(); back(redo, undo); }
  });
  draw();
  return {
    get map() { return M.clean(st); },
    set(m) { st = M.clean(m) || st; draw(); },
    redraw: draw,
  };
}
