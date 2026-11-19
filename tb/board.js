// 盤面: 描画と操作（ブレスト本体）
(function () {
  "use strict";
  const TB = window.TB, { h, $ } = TB;
  const board = $("#board"), world = $("#world");
  const view = (TB.view = { s: 1, tx: 0, ty: 0, auto: true });
  TB.sel = []; TB.selLink = null; TB.editing = null;
  const dealing = (TB.dealing = new Map());
  let pending = false;

  // ================= 表示の位置・拡大 =================
  const applyView = () => { world.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`; };
  TB.toWorld = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s }; };
  TB.toScreen = (x, y) => { const r = board.getBoundingClientRect(); return { x: r.left + view.tx + x * view.s, y: r.top + view.ty + y * view.s }; };
  function bounds() {
    const b = TB.B(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (a, c, d, e) => { x0 = Math.min(x0, a); y0 = Math.min(y0, c); x1 = Math.max(x1, d); y1 = Math.max(y1, e); };
    for (const n of b.nodes) { const r = TB.rectOf(n); add(r.x - r.w / 2, r.y - r.h / 2, r.x + r.w / 2, r.y + r.h / 2 + (n.t === "card" ? 56 : 0)); }
    for (const f of b.frames) add(f.x, f.y - 30, f.x + f.w, f.y + f.h);
    for (const it of b.items) {
      if (it.type === "text") { const ls = it.text.split("\n"); add(it.x, it.y, it.x + Math.max(...ls.map((l) => l.length)) * 23 + 10, it.y + ls.length * 31); }
      else for (let i = 0; i < it.pts.length; i += 2) add(it.pts[i], it.pts[i + 1], it.pts[i], it.pts[i + 1]);
    }
    if (x0 > x1) { x0 = -400; y0 = -300; x1 = 400; y1 = 300; }
    return { x0, y0, x1, y1 };
  }
  TB.bounds = bounds;
  TB.fit = () => {
    const bb = bounds(), W = board.clientWidth, H = board.clientHeight, pad = 46;
    if (!W || !H) return;
    view.s = Math.min((W - pad * 2) / Math.max(200, bb.x1 - bb.x0), (H - pad * 2) / Math.max(200, bb.y1 - bb.y0), 1.3);
    view.tx = (W - (bb.x1 - bb.x0) * view.s) / 2 - bb.x0 * view.s;
    view.ty = (H - (bb.y1 - bb.y0) * view.s) / 2 - bb.y0 * view.s;
    view.auto = true; applyView();
  };
  new ResizeObserver(() => { if (view.auto) TB.fit(); }).observe(board);
  // 見えていない所にあるものを、見える所に入る分だけ動かす（大きく動かすと他を見失う）
  TB.reveal = (n) => {
    const r = TB.boxOf(n), b = board.getBoundingClientRect(), m = 30;
    const a = TB.toScreen(r.x - r.w / 2, r.y - r.h / 2), z = TB.toScreen(r.x + r.w / 2, r.y + r.h / 2);
    let dx = 0, dy = 0;
    if (a.x < b.left + m) dx = b.left + m - a.x; else if (z.x > b.right - m) dx = b.right - m - z.x;
    if (a.y < b.top + m) dy = b.top + m - a.y; else if (z.y > b.bottom - m) dy = b.bottom - m - z.y;
    if (dx || dy) { view.tx += dx; view.ty += dy; view.auto = false; applyView(); }
  };

  // ================= 描く =================
  function thin(f) {
    const out = []; let lx = null, ly = null;
    for (let i = 0; i < f.length; i += 2) {
      const x = Math.round(f[i]), y = Math.round(f[i + 1]);
      if (lx === null || i >= f.length - 2 || Math.hypot(x - lx, y - ly) >= 3) { out.push(x, y); lx = x; ly = y; }
    }
    return out;
  }
  TB.smooth = (f) => {
    const p = []; for (let i = 0; i + 1 < f.length; i += 2) p.push([f[i], f[i + 1]]);
    if (p.length < 3) return "M" + p.map((q) => q.join(" ")).join(" L");
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
    const l = p[p.length - 1]; return d + ` L${l[0]} ${l[1]}`;
  };
  // 易の卦の絵（下から6本。動く爻には印）
  TB.hexSvg = (lines, moving) => {
    const s = h("svg", { viewBox: "0 0 100 92", class: "hex" });
    lines.forEach((v, i) => {
      const y = 80 - i * 15;
      if (v) s.append(h("rect", { x: 10, y, width: 80, height: 9, rx: 1.5 }));
      else s.append(h("rect", { x: 10, y, width: 35, height: 9, rx: 1.5 }), h("rect", { x: 55, y, width: 35, height: 9, rx: 1.5 }));
      if (moving && moving.includes(i)) s.append(h("circle", { cx: 96, cy: y + 4.5, r: 3.4, class: "mv" }));
    });
    return s;
  };
  function cardInner(n) {
    const it = TB.item(n);
    if (!it) return h("div", { class: "slot-in" }, h("span", { text: n.deck === "iching" ? "卦" : n.deck === "prompt" ? "？" : "?" }));
    if (n.deck === "tarot") return h("div", { class: "face" }, h("img", { src: window.Cards.imgUrl(it), alt: "", draggable: "false", class: n.rev ? "rev" : null }));
    if (n.deck === "iching") return h("div", { class: "face hexcard" },
      h("div", { class: "hc-num", text: "第" + it.num + "卦" }), TB.hexSvg(it.lines, n.moving),
      h("div", { class: "hc-name", text: it.name }), h("div", { class: "hc-tri", text: `${it.upper.glyph}${it.upper.nature} の下に ${it.lower.glyph}${it.lower.nature}` }), h("div", { class: "hc-kw", text: it.kw.split("・")[0] }),
      n.moving && n.moving.length ? h("div", { class: "hc-mv", text: "● 変わる爻 " + n.moving.length + "本" }) : null);
    return h("div", { class: "face pcard", style: `--pc:${it.color}` }, h("div", { class: "pc-set", text: it.setName }),
      h("div", { class: "pc-name", text: it.name }), h("div", { class: "pc-q", text: it.question }));
  }
  function nodeEl(n) {
    const sel = TB.sel.includes(n.id) ? " sel" : "";
    if (n.t === "card") {
      const D = TB.deckOf(n), it = TB.item(n);
      const el = h("div", { class: `node card deck-${n.deck}${it ? "" : " empty"}${sel}`, "data-id": n.id, style: `left:${n.x - D.w / 2}px;top:${n.y - D.h / 2}px;width:${D.w}px;height:${D.h}px` },
        cardInner(n), n.deck === "prompt" && it && !(n.pos && n.pos.trim()) && !(n.mine && n.mine.trim()) ? null : h("div", { class: "plaque" }, h("b", { text: TB.slotName(n) }), it ? h("span", { text: D.short(it, n.rev) }) : null,
          n.pos && n.pos.trim() ? h("div", { class: "reading", text: n.pos.trim() }) : null,
          n.mine && n.mine.trim() ? h("div", { class: "reading mine", text: n.mine.trim() }) : null));
      const k = dealing.get(n.id);
      if (k) { el.classList.add("deal"); el.style.setProperty("--dx", k.dx + "px"); el.style.setProperty("--dy", k.dy + "px"); el.style.setProperty("--dly", k.i * 140 + "ms"); }
      return el;
    }
    const box = n.box === "line" || n.box === "fill" ? " box-" + n.box : "", col = (n.color ? `;--ic:${n.color}` : "") + (n.bc ? `;--bc:${n.bc}` : "");
    return h("div", { class: `node idea${n.center ? " center" : ""}${box}${n.color ? " colored" : ""}${sel}`, "data-id": n.id, style: `left:${n.x}px;top:${n.y}px${col}` },
      ideaTxt(n));
  }
  // YuriiNote: アイデアの文字の中の ID（->1a・1a(2) など）はチップにする（押すとそのノートを開く）
  function ideaTxt(n) {
    const el = h("span", { class: "txt" });
    if (TB.host && TB.host.renderText) el.innerHTML = TB.host.renderText(n.text); else el.textContent = n.text;
    return el;
  }
  const frameEl = (f) => h("div", { class: "frame" + (f.shape === "round" ? " round" : "") + (TB.sel.includes(f.id) ? " sel" : ""), "data-frame": f.id, style: `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px` + (f.color && f.color !== TB.FRAME_COLORS[0] ? `;--fc:${f.color}` : "") },
    h("div", { class: "frame-title", text: f.title || "グループ" }), h("div", { class: "frame-resize", title: "大きさを変える" }));
  const textEl = (t) => h("div", { class: "note" + (TB.sel.includes(t.id) ? " sel" : ""), "data-text": t.id, style: `left:${t.x}px;top:${t.y}px;color:${TB.ink(t.color)}`, text: t.text });

  TB.renderBoard = () => {
    { const hb = document.getElementById("hint"), b0 = TB.B(); if (hb) hb.hidden = b0.nodes.length > 0 || b0.items.length > 0; }   // 操作の説明は、白紙のときだけ（ほかは右の「操作とキー」）
    if (TB.editing) { pending = true; return; }
    pending = false;
    const b = TB.B();
    const links = h("svg", { class: "layer links", width: 1, height: 1 });
    const pen = h("svg", { class: "layer pen", width: 1, height: 1 });
    const nodes = b.nodes.map(nodeEl);
    world.replaceChildren(...b.frames.map(frameEl), links, ...nodes, pen, ...b.items.filter((t) => t.type === "text").map(textEl));
    for (const el of nodes) if (el.classList.contains("idea")) TB.sizes[el.dataset.id] = { w: el.offsetWidth, h: el.offsetHeight };
    drawLinks(links, b);
    for (const it of b.items) if (it.type === "stroke") {
      const d = TB.smooth(it.pts);
      pen.append(h("path", { class: "stroke" + (TB.sel.includes(it.id) ? " sel" : ""), "data-sid": it.id, d, stroke: TB.ink(it.color), "stroke-width": 2.5 }), h("path", { class: "stroke-hit", d, "data-stroke": it.id }));
    }
    applyView(); TB.renderDeckCount && TB.renderDeckCount();
  };
  // 線はどれも同じ細い線（向きと種類は持たない）。ひとことがあれば線の上に
  function drawLinks(svg, b) {
    for (const { l, g } of TB.routeLinks(b)) {
      const k = TB.linkKind(l);
      const gr = h("g", { class: `link k-${k}` + (TB.selLink === l.id || TB.sel.includes(l.id) ? " on" : ""), "data-link": l.id, style: l.color ? `--lc:${l.color}` : null },
        h("path", { class: "link-hit", d: g.d }), h("path", { class: "link-line", d: g.d }));
      const head = (p, ang) => { const a = 11, w = 0.42; return h("polygon", { class: "link-head", points: [[p.x, p.y], [p.x - a * Math.cos(ang - w), p.y - a * Math.sin(ang - w)], [p.x - a * Math.cos(ang + w), p.y - a * Math.sin(ang + w)]].map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ") }); };
      if (k === "arrow" || k === "both") gr.append(head(g.p1, g.ang1));
      if (k === "both") gr.append(head(g.p0, g.ang0));
      if (g.lab) gr.append(h("rect", { class: "link-lbg", x: g.lab.x - g.lab.w / 2, y: g.lab.y - 13, width: g.lab.w, height: 26, rx: 6 }),
        h("text", { class: "link-label", x: g.lab.x, y: g.lab.y + 5, text: l.label }));
      svg.append(gr);
    }
  }
  // 線の種類（前の形の flow は矢印に読み替える）
  TB.LINK_KINDS = [["line", "線"], ["arrow", "矢印 →"], ["both", "両矢印 ↔"], ["dashed", "点線（弱いつながり）"], ["bold", "太線（強いつながり）"], ["clash", "対立"]];
  TB.linkKind = (l) => (l.kind === "flow" ? "arrow" : TB.LINK_KINDS.some((x) => x[0] === l.kind) ? l.kind : "line");
  TB.markSel = () => {
    world.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
    for (const id of TB.sel) { const el = world.querySelector(`[data-id="${CSS.escape(id)}"],[data-frame="${CSS.escape(id)}"],[data-text="${CSS.escape(id)}"],[data-sid="${CSS.escape(id)}"]`); if (el) el.classList.add("sel"); }
    world.querySelectorAll(".link.on").forEach((x) => x.classList.remove("on"));
    if (TB.selLink) { const g = world.querySelector(`.link[data-link="${CSS.escape(TB.selLink)}"]`); if (g) g.classList.add("on"); }
    for (const id of TB.sel) { const g = world.querySelector(`.link[data-link="${CSS.escape(id)}"]`); if (g) g.classList.add("on"); }   // 範囲で選んだ線
  };
  TB.isLinkId = (id) => TB.B().links.some((l) => l.id === id);
  TB.selLinks = () => TB.sel.filter(TB.isLinkId);
  TB.select = (ids, opt) => {
    TB.sel = ids ? [].concat(ids) : []; TB.selLink = null; $("#pop").hidden = true;
    TB.markSel(); TB.renderDrawer(opt);
  };

  // ================= 操作の部品 =================
  function drag(e, { move, up }) {
    const sx = e.clientX, sy = e.clientY; let moved = false;
    const mv = (ev) => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; if (move) move(ev, moved); };
    const u = (ev) => { if (ev.button !== e.button) return; window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", u, true); if (up) up(ev, moved); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", u, true);
  }
  function hit(e) {
    const t = e.target;
    const n = t.closest(".node"); if (n) return { type: "node", id: n.dataset.id };
    const x = t.closest(".note"); if (x) return { type: "text", id: x.dataset.text };
    const rz = t.closest(".frame-resize"); if (rz) return { type: "frameResize", id: rz.parentNode.dataset.frame };
    const ft = t.closest(".frame-title"); if (ft) return { type: "frame", id: ft.parentNode.dataset.frame };
    const l = t.closest(".link"); if (l) return { type: "link", id: l.dataset.link };
    const s = t.closest(".stroke-hit"); if (s) return { type: "stroke", id: s.dataset.stroke };
    return { type: "empty" };
  }
  const nodeAt = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY); const n = el && el.closest("#world .node"); return n && n.dataset.id; };
  const frameOf = (id) => TB.B().frames.find((f) => f.id === id);
  const textOf = (id) => TB.B().items.find((t) => t.id === id);

  board.addEventListener("contextmenu", (e) => e.preventDefault());
  board.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#pop")) return;   // 線の上の文字・種類の吹き出しの中は、そのまま押せる
    TB.hideTip(); TB.closeFloats();
    if (TB.editing) { const ed = world.querySelector("[contenteditable]"); if (ed && !ed.contains(e.target)) { e.preventDefault(); ed.blur(); } return; }
    const t = hit(e);
    const chipEl = e.target.closest(".chip");
    if (chipEl && e.button === 0 && !e.ctrlKey && TB.host && TB.host.chip) { e.preventDefault(); TB.host.chip(chipEl, e); return; }
    if (e.button === 2) { e.preventDefault(); rightDown(e, t); return; }
    if (e.button === 1) { e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;
    e.preventDefault();
    if (document.activeElement && document.activeElement !== document.body && !board.contains(document.activeElement)) document.activeElement.blur();
    if (e.ctrlKey && t.type === "link") { return drag(e, { up: (ev, m) => { if (!m) TB.toggleSel(t.id); } }); }
    if (e.ctrlKey && ["node", "text", "frame", "stroke"].includes(t.type)) { startMove(e, t); return; }
    if (e.ctrlKey) { lasso(e); return; }
    if (t.type === "node") return nodeDown(e, t.id);
    if (t.type === "text") return drag(e, { up: (ev, m) => { if (m) return; if (TB.sel.length === 1 && TB.sel[0] === t.id) editText(t.id); else TB.select(t.id); } });   // 1 回目で選ぶ・選んでいるものをもう一度押すと書き直す
    if (t.type === "frame") { // 見出しをドラッグ＝枠ごと動かす／クリック＝名前を変える
      let op = null;
      return drag(e, { move: (ev, m) => { if (!m) return; if (!op) op = beginMove(t, e); op.step(ev); }, up: () => { if (op && op.moved) op.end(); else { TB.select(t.id); editFrameTitle(t.id); } } });
    }
    if (t.type === "frameResize") return resizeFrame(e, t.id);
    if (t.type === "link") return drag(e, { up: (ev, m) => { if (!m) TB.openLinkPop(t.id, true); } });
    if (TB.sel.length || TB.selLink) TB.select([]);
    penOrText(e);
  });

  // ---- 右ボタン: 短く押すとメニュー。カード・文字・枠・ペンの線の上でドラッグすると動かす（選んでいれば、まとめて）。空きでドラッグすると画面を動かす ----
  function rightDown(e, t) {
    { const c = e.target.closest(".chip"); if (c && TB.host && TB.host.chipMenu) { TB.host.chipMenu(c, e); return; } }
    const movable = ["node", "text", "frame", "stroke"].includes(t.type);
    let pan = null, op = null;
    drag(e, {
      move: (ev, m) => {
        if (!m) return;
        if (movable) { if (!op) op = beginMove(t, e); op.step(ev); return; }
        if (!pan) pan = startPanFrom(e); pan(ev);
      },
      up: (ev, m) => { board.classList.remove("grabbing"); if (op) { if (op.moved) op.end(); return; } if (pan || m) return; contextAction(t, ev); },
    });
  }
  function startPanFrom(e) { const tx = view.tx, ty = view.ty; board.classList.add("grabbing"); return (ev) => { view.tx = tx + ev.clientX - e.clientX; view.ty = ty + ev.clientY - e.clientY; view.auto = false; applyView(); }; }
  function startPan(e) { const step = startPanFrom(e); drag(e, { move: step, up: () => board.classList.remove("grabbing") }); }
  board.addEventListener("pointerup", () => board.classList.remove("grabbing"));
  board.addEventListener("wheel", (e) => {
    e.preventDefault(); TB.hideTip();
    const r = board.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const s = Math.min(4, Math.max(0.12, view.s * Math.exp(-e.deltaY * 0.0015)));
    view.tx = mx - ((mx - view.tx) * s) / view.s; view.ty = my - ((my - view.ty) * s) / view.s; view.s = s; view.auto = false; applyView();
  }, { passive: false });

  // ---- 移動（Ctrl+ドラッグ） ----
  function beginMove(t, e) {
    const b = TB.B(), p0 = TB.toWorld(e.clientX, e.clientY), list = [];
    const addNode = (n) => list.push({ o: n, x: n.x, y: n.y });
    if (t.type !== "frame" || TB.sel.includes(t.id)) { // 選んでいるものはまとめて動かす
      const ids = TB.sel.includes(t.id) ? TB.sel : [t.id];
      for (const id of ids) {
        const n = TB.node(id); if (n) addNode(n); const f = frameOf(id); if (f) list.push({ o: f, x: f.x, y: f.y });
        const x = textOf(id); if (x) list.push({ o: x, x: x.x, y: x.y, pts: x.pts && x.pts.slice() });
      }
    }
    else { // 枠と、その中にあるもの全部
      const f = frameOf(t.id); list.push({ o: f, x: f.x, y: f.y });
      const inF = (x, y) => x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h;
      for (const n of b.nodes) if (inF(n.x, n.y)) addNode(n);
      for (const it of b.items) if (it.type === "text" ? inF(it.x, it.y) : inF(it.pts[0], it.pts[1])) list.push({ o: it, x: it.x, y: it.y, pts: it.pts && it.pts.slice() });
    }
    let snapped = false;
    const op = {
      moved: false,
      step(ev) {
        if (!snapped) { TB.snap(); snapped = true; }
        op.moved = true; TB.hideTip();
        const p = TB.toWorld(ev.clientX, ev.clientY), dx = Math.round(p.x - p0.x), dy = Math.round(p.y - p0.y);
        for (const m of list) {
          if (m.pts) m.o.pts = m.pts.map((v, i) => v + (i % 2 ? dy : dx));
          else { m.o.x = m.x + dx; m.o.y = m.y + dy; }
        }
        TB.renderBoard();
      },
      end() { const ids = list.filter((m) => m.o.t).map((m) => m.o.id); if (t.type !== "frame") TB.resolveOverlap(ids); TB.save(); TB.renderBoard(); },
    };
    return op;
  }
  function startMove(e, t) {
    let op = null;
    drag(e, { move: (ev, m) => { if (!m) return; if (!op) op = beginMove(t, e); op.step(ev); }, up: () => { if (op && op.moved) op.end(); else TB.toggleSel(t.id); } });
  }
  // ---- 選ぶ（Ctrl+クリックで足す・外す／Ctrl+空きをドラッグで囲む） ----
  TB.toggleSel = (id) => { TB.select(TB.sel.includes(id) ? TB.sel.filter((x) => x !== id) : [...TB.sel, id], { quiet: true }); };
  TB.selectAll = () => { const b = TB.B(); TB.select([...b.nodes.map((n) => n.id), ...b.links.map((l) => l.id), ...b.frames.map((f) => f.id), ...b.items.map((i) => i.id)], { quiet: true }); };
  function lasso(e) {
    const box = $("#lasso"), r0 = board.getBoundingClientRect(), keep = TB.sel.slice();
    const rectOf = (ev) => ({ x0: Math.min(e.clientX, ev.clientX), y0: Math.min(e.clientY, ev.clientY), x1: Math.max(e.clientX, ev.clientX), y1: Math.max(e.clientY, ev.clientY) });
    const inRect = (ev) => {
      const q = rectOf(ev), a = TB.toWorld(q.x0, q.y0), z = TB.toWorld(q.x1, q.y1), b = TB.B(), out = [];
      const hitR = (x0, y0, x1, y1) => x0 < z.x && x1 > a.x && y0 < z.y && y1 > a.y;
      for (const n of b.nodes) { const r = TB.rectOf(n); if (hitR(r.x - r.w / 2, r.y - r.h / 2, r.x + r.w / 2, r.y + r.h / 2)) out.push(n.id); }
      for (const f of b.frames) if (f.x >= a.x && f.y >= a.y && f.x + f.w <= z.x && f.y + f.h <= z.y) out.push(f.id);
      const nodeIn = new Set(out);
      for (const l of b.links) {   // 線: 両端のノードが囲みの中、または線の途中が囲みに入る
        if (nodeIn.has(l.a) && nodeIn.has(l.b)) { out.push(l.id); continue; }
        const A = TB.node(l.a), B = TB.node(l.b); if (!A || !B) continue;
        for (let i = 1; i < 12; i++) { const px = A.x + (B.x - A.x) * i / 12, py = A.y + (B.y - A.y) * i / 12; if (px > a.x && px < z.x && py > a.y && py < z.y) { out.push(l.id); break; } }
      }
      for (const it of b.items) {
        if (it.type === "text") { const el = world.querySelector(`[data-text="${CSS.escape(it.id)}"]`), w = el ? el.offsetWidth : 40, hh = el ? el.offsetHeight : 29; if (hitR(it.x, it.y, it.x + w, it.y + hh)) out.push(it.id); }
        else { for (let i = 0; i + 1 < it.pts.length; i += 2) if (it.pts[i] > a.x && it.pts[i] < z.x && it.pts[i + 1] > a.y && it.pts[i + 1] < z.y) { out.push(it.id); break; } }
      }
      return out;
    };
    drag(e, {
      move: (ev, m) => {
        if (!m) return; const q = rectOf(ev);
        box.hidden = false; Object.assign(box.style, { left: q.x0 - r0.left + "px", top: q.y0 - r0.top + "px", width: q.x1 - q.x0 + "px", height: q.y1 - q.y0 + "px" });
        TB.sel = [...new Set([...keep, ...inRect(ev)])]; TB.markSel();
      },
      up: (ev, m) => { box.hidden = true; if (!m) { if (TB.sel.length) TB.select([]); return; } TB.select([...new Set([...keep, ...inRect(ev)])], { quiet: true }); },
    });
  }

  // ---- 右クリック（短く） ----
  function contextAction(t, ev) {
    const b = TB.B();
    if (t.type === "text" || t.type === "stroke") {
      const del = () => { TB.snap(); b.items = b.items.filter((i) => i.id !== t.id); TB.sel = TB.sel.filter((x) => x !== t.id); TB.save(); TB.renderBoard(); };
      const items = t.type === "text" ? [["書き直す", () => editText(t.id)], ["消す", del, "danger"]] : [["消す", del, "danger"]];
      if (TB.sel.length > 1 && TB.sel.includes(t.id)) items.push("-", [`選んだ ${TB.sel.length} 個を消す（Delete）`, () => TB.deleteSelected(), "danger"]);
      return TB.menu(items, ev.clientX, ev.clientY);
    }
    if (t.type === "link") return TB.linkMenu(t.id, ev.clientX, ev.clientY);
    if (t.type === "node") return TB.nodeMenu(t.id, ev.clientX, ev.clientY);
    if (t.type === "frame") return TB.frameMenu(t.id, ev.clientX, ev.clientY);
  }

  // ---- ノード（カード・アイデア）: クリック＝選ぶ／ドラッグ＝つなぐ（空きに離すと新しいアイデア） ----
  function nodeDown(e, id) {
    const n = TB.node(id); let tmp = null;
    const clearT = () => world.querySelectorAll(".node.target").forEach((x) => x.classList.remove("target"));
    drag(e, {
      move: (ev, m) => {
        if (!m) return;
        const p = TB.toWorld(ev.clientX, ev.clientY);
        if (!tmp) { tmp = h("path", { class: "link-tmp" }); world.querySelector("svg.links").append(tmp); TB.hideTip(); }
        tmp.setAttribute("d", `M${n.x} ${n.y} L${p.x} ${p.y}`);
        clearT(); const t = nodeAt(ev); if (t && t !== id) world.querySelector(`.node[data-id="${CSS.escape(t)}"]`).classList.add("target");
      },
      up: (ev, m) => {
        if (tmp) tmp.remove(); clearT();
        if (!m) { nodeClick(id); return; }
        const t = nodeAt(ev);
        if (t && t !== id) {
          TB.snap(); TB.B().links.push({ id: TB.uid(), a: id, b: t, kind: "line", label: "" }); TB.save(); TB.renderBoard();
        } else if (!t) { const p = TB.toWorld(ev.clientX, ev.clientY); TB.newIdea(id, { x: Math.round(p.x), y: Math.round(p.y) }); }
      },
    });
  }
  // クリック＝選ぶ（右の欄が出る）。選んでいるアイデアをもう一度押す・ダブルクリック＝書き直す。カードのダブルクリック＝つないで書く
  let lastClick = { id: null, at: 0 };
  function nodeClick(id) {
    const n = TB.node(id); if (!n) return;
    const again = TB.sel.length === 1 && TB.sel[0] === id, dbl = lastClick.id === id && Date.now() - lastClick.at < 380;
    lastClick = { id, at: Date.now() };
    if (n.t === "idea") { if (again || dbl) TB.editIdea(id); else TB.select(id); return; }
    if (!n.item) { TB.select(id, { focusCard: true }); return; }
    if (dbl) { TB.newIdea(id); return; }
    TB.select(id);
  }

  // ================= アイデア（枠つきの短い文） =================
  // parentId から線でつながった新しいアイデアを作って、すぐ書けるようにする
  TB.newIdea = (parentId, at, o) => {
    TB.snap();
    const b = TB.B(), pos = at || (parentId ? TB.placeNear(parentId) : { x: 0, y: 0 });
    const n = TB.ideaNode(Object.assign({ x: pos.x, y: pos.y }, o || {}));
    b.nodes.push(n);
    if (parentId) b.links.push({ id: TB.uid(), a: parentId, b: n.id, kind: "line", label: "" });
    TB.renderBoard(); TB.reveal(n);
    TB.editIdea(n.id, true);
    return n;
  };
  // 検索して挿入する画面（親の画面）から選んだものを、新しい文字として足す（選んでいるものがあれば、それにつなぐ）
  TB.searchAdd = () => {
    if (!TB.host || !TB.host.search) return;
    const par = TB.node(TB.sel[TB.sel.length - 1]), parent = par && par.t === "idea" ? par.id : null;
    TB.host.search((t) => {
      const text = String(t == null ? "" : t).replace(/\s+$/, ""); if (!text) return;
      TB.snap();
      const b = TB.B(), pos = parent ? TB.placeNear(parent) : (() => { const r = board.getBoundingClientRect(), c = TB.toWorld(r.left + r.width / 2, r.top + r.height / 2); return { x: Math.round(c.x), y: Math.round(c.y) }; })();
      const n = TB.ideaNode({ x: pos.x, y: pos.y, text });
      b.nodes.push(n); if (parent) b.links.push({ id: TB.uid(), a: parent, b: n.id, kind: "line", label: "" });
      TB.save(); TB.renderBoard(); TB.select(n.id); TB.reveal(n);
    });
  };
  const parentOf = (id) => { const l = TB.B().links.find((x) => x.b === id); return l && l.a; };
  TB.editIdea = (id, isNew) => {
    const el = world.querySelector(`.node[data-id="${CSS.escape(id)}"] .txt`); if (!el) return;
    if (!isNew) TB.snap();
    { const n0 = TB.node(id); if (n0) el.textContent = n0.text; }
    TB.editing = id; el.contentEditable = "plaintext-only"; el.parentNode.classList.add("editing"); el.focus();
    const rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
    let next = null;
    const key = (ev) => {
      if (ev.isComposing) return;
      if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && (ev.code === "KeyU" || ev.code === "KeyM") && TB.host) {
        ev.preventDefault(); ev.stopPropagation();
        const ins = (t) => { el.focus(); if (t) document.execCommand("insertText", false, t); };
        if (ev.code === "KeyU" && TB.host.search) { const rg = getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : null; TB.holdEdit = true; TB.host.search((t) => { TB.holdEdit = false; el.focus(); if (rg) { const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(rg); } ins(t); }); }
        if (ev.code === "KeyM" && TB.host.anchor) ins(TB.host.anchor(el.innerText));
        return;
      }
      if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey) { ev.preventDefault(); next = "sibling"; el.blur(); }
      else if (ev.key === "Tab") { ev.preventDefault(); next = ev.shiftKey ? "parent" : "child"; el.blur(); }
      else if (ev.key === "Escape" || (ev.key === "Enter" && ev.ctrlKey)) { ev.preventDefault(); ev.stopPropagation(); next = "stay"; el.blur(); }
      else return;
      ev.stopPropagation();
    };
    const done = () => {
      if (TB.holdEdit) return; // 探す画面（Ctrl+U）を開いている間は、書きかけのまま
      el.removeEventListener("blur", done); el.removeEventListener("keydown", key, true);
      const b = TB.B(), n = TB.node(id), t = el.innerText.replace(/\n+$/, "");
      let gone = false;
      if (n && !t.trim() && !n.center) {
        b.nodes = b.nodes.filter((x) => x.id !== id); b.links = b.links.filter((l) => l.a !== id && l.b !== id); gone = true;
        if (isNew) TB.unsnap();
      } else if (n) n.text = t;
      TB.editing = null; TB.save(); TB.renderBoard();
      if (!gone && n) TB.reveal(n);
      const par = parentOf(id);
      if (gone) { if (TB.sel.includes(id)) TB.select(par ? [par] : []); return; }
      if (next === "sibling") TB.newIdea(par || null, par ? null : TB.placeNear(id));
      else if (next === "child") TB.newIdea(id);
      else if (next === "parent" && par) TB.select(par);
      else { TB.select(id, { quiet: true }); }
    };
    el.addEventListener("blur", done); el.addEventListener("keydown", key, true);
  };
  // ---- 文字（箱なし）とペン ----
  function penOrText(e) {
    const pts = []; let path = null; const color = TB.INK;
    const add = (ev) => { const p = TB.toWorld(ev.clientX, ev.clientY); pts.push(p.x, p.y); };
    add(e);
    drag(e, {
      move: (ev, m) => {
        if (!m) return; add(ev);
        if (!path) { path = h("path", { class: "stroke", stroke: color, "stroke-width": 2.5 }); world.querySelector("svg.pen").append(path); }
        path.setAttribute("d", TB.smooth(thin(pts)));
      },
      up: (ev, m) => {
        if (m && pts.length >= 4) { TB.snap(); TB.B().items.push({ id: TB.uid(), type: "stroke", pts: thin(pts), color, w: 2.5 }); TB.save(); TB.renderBoard(); }
        else { if (path) path.remove(); const p = TB.toWorld(ev.clientX, ev.clientY); TB.newIdea(null, { x: Math.round(p.x), y: Math.round(p.y) }); }   // 空きをクリック＝その場に文字（選べる・つなげる・枠や色を付けられる）
      },
    });
  }
  function newText(p) {
    TB.snap();
    const t = { id: TB.uid(), type: "text", x: Math.round(p.x), y: Math.round(p.y - 16), text: "", color: TB.INK };
    TB.B().items.push(t); TB.renderBoard(); editText(t.id, true);
  }
  function editText(id, isNew) {
    const el = world.querySelector(`.note[data-text="${CSS.escape(id)}"]`); if (!el) return;
    if (!isNew) TB.snap();
    TB.editing = "text:" + id; el.contentEditable = "plaintext-only"; el.classList.add("editing"); el.focus();
    const rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
    const key = (ev) => { if (ev.key === "Escape" || (ev.key === "Enter" && ev.ctrlKey)) { ev.preventDefault(); ev.stopPropagation(); el.blur(); } };
    const done = () => {
      el.removeEventListener("blur", done); el.removeEventListener("keydown", key);
      const b = TB.B(), t = el.innerText.replace(/\n+$/, ""), x = textOf(id);
      if (!t.trim()) { b.items = b.items.filter((i) => i.id !== id); if (isNew) TB.unsnap(); } else if (x) x.text = t;
      TB.editing = null; TB.save(); TB.renderBoard();
    };
    el.addEventListener("blur", done); el.addEventListener("keydown", key);
  }

  // ---- 枠（グループ） ----
  function editFrameTitle(id) {
    const el = world.querySelector(`.frame[data-frame="${CSS.escape(id)}"] .frame-title`); if (!el) return;
    TB.snap(); TB.editing = "frame:" + id; el.contentEditable = "plaintext-only"; el.focus();
    const rg = document.createRange(); rg.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
    const key = (ev) => { if (ev.key === "Enter" || ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); el.blur(); } };
    const done = () => { el.removeEventListener("blur", done); el.removeEventListener("keydown", key); const f = frameOf(id); if (f) f.title = el.innerText.trim() || "グループ"; TB.editing = null; TB.save(); TB.renderBoard(); };
    el.addEventListener("blur", done); el.addEventListener("keydown", key);
  }
  TB.editFrameTitle = editFrameTitle;
  // 選んでいるものを、グループ（枠）で囲む
  TB.ungroup = (ids) => { const b = TB.B(), set = new Set(ids || TB.sel); if (!b.frames.some((f) => set.has(f.id))) return false; TB.snap(); b.frames = b.frames.filter((f) => !set.has(f.id)); TB.sel = TB.sel.filter((i) => !set.has(i)); TB.save(); TB.renderBoard(); TB.renderDrawer({ quiet: true }); return true; };
  TB.reshapeFrame = (id, shape) => { const f = TB.B().frames.find((q) => q.id === id); if (!f || (f.shape || "rect") === shape) return; TB.snap(); const cx = f.x + f.w / 2, cy = f.y + f.h / 2, k = shape === "round" ? Math.SQRT2 : 1 / Math.SQRT2; f.w = Math.round(f.w * k); f.h = Math.round(f.h * k); f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2); if (shape === "round") f.shape = "round"; else delete f.shape; TB.save(); TB.renderBoard(); TB.markSel(); TB.renderDrawer({ quiet: true }); };
  TB.groupSel = (shape) => {
    const b = TB.B(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (a, c, d, e) => { x0 = Math.min(x0, a); y0 = Math.min(y0, c); x1 = Math.max(x1, d); y1 = Math.max(y1, e); };
    for (const id of TB.sel) {
      const n = TB.node(id); if (n) { const r = TB.rectOf(n); add(r.x - r.w / 2, r.y - r.h / 2, r.x + r.w / 2, r.y + r.h / 2 + (n.t === "card" ? 56 : 0)); continue; }
      const it = textOf(id); if (it && it.type === "text") { const el = world.querySelector(`[data-text="${CSS.escape(id)}"]`); add(it.x, it.y, it.x + (el ? el.offsetWidth : 60), it.y + (el ? el.offsetHeight : 30)); }
      else if (it) for (let i = 0; i + 1 < it.pts.length; i += 2) add(it.pts[i], it.pts[i + 1], it.pts[i], it.pts[i + 1]);
    }
    if (x0 > x1) return;
    TB.snap();
    const f = { id: TB.uid(), x: Math.round(x0 - 28), y: Math.round(y0 - 24), w: Math.round(x1 - x0 + 56), h: Math.round(y1 - y0 + 48), title: "グループ", color: TB.FRAME_COLORS[0] };
    if (shape === "round") { const cx = f.x + f.w / 2, cy = f.y + f.h / 2; f.w = Math.round(f.w * Math.SQRT2); f.h = Math.round(f.h * Math.SQRT2); f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2); f.shape = "round"; }
    b.frames.push(f); TB.save(); TB.renderBoard(); TB.select(f.id); editFrameTitle(f.id);
  };
  // アイデアの見た目: 枠（なし・線・塗り）と色
  // 選んでいる線の種類・色・向きを、まとめて変える
  TB.styleLinks = (k, v) => {
    const ls = TB.selLinks().map((id) => TB.B().links.find((l) => l.id === id)).filter(Boolean); if (!ls.length) return;
    TB.snap();
    for (const l of ls) { if (k === "flip") [l.a, l.b] = [l.b, l.a]; else if (v) l[k] = v; else delete l[k]; }
    TB.save(); TB.renderBoard(); TB.markSel(); TB.renderDrawer({ quiet: true });
  };
  TB.styleSel = (k, v) => {
    const ideas = TB.sel.map(TB.node).filter((n) => n && n.t === "idea"); if (!ideas.length) return;
    TB.snap(); for (const n of ideas) { if (v) n[k] = v; else delete n[k]; } TB.save(); TB.renderBoard(); TB.markSel(); TB.renderDrawer({ quiet: true });
  };
  function resizeFrame(e, id) {
    const f = frameOf(id), w = f.w, hh = f.h, p0 = TB.toWorld(e.clientX, e.clientY); let snapped = false;
    drag(e, { move: (ev, m) => { if (!m) return; if (!snapped) { TB.snap(); snapped = true; } const p = TB.toWorld(ev.clientX, ev.clientY); f.w = Math.max(160, Math.round(w + p.x - p0.x)); f.h = Math.max(100, Math.round(hh + p.y - p0.y)); TB.renderBoard(); }, up: () => TB.save() });
  }
  // ---- 矢印キーで近くのノードへ ----
  TB.moveSel = (dx, dy) => {
    const b = TB.B(), cur = TB.node(TB.sel[TB.sel.length - 1]);
    if (!cur) { const c = b.nodes.find((n) => n.center) || b.nodes[0]; if (c) TB.select(c.id); return; }
    let best = null;
    for (const n of b.nodes) {
      if (n.id === cur.id) continue;
      const vx = n.x - cur.x, vy = n.y - cur.y, d = Math.hypot(vx, vy), cos = (vx * dx + vy * dy) / (d || 1);
      if (cos < 0.5) continue;
      const score = d * (2 - cos);
      if (!best || score < best.s) best = { n, s: score };
    }
    if (best) { TB.select(best.n.id); TB.reveal(best.n); }
  };

  // ---- ホバーの説明 ----
  const tip = $("#tip"); let tipT = null, mouse = { x: 0, y: 0 };
  const placeTip = () => {
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = mouse.x + 18, y = mouse.y + 18;
    if (x + w > innerWidth - 8) x = mouse.x - w - 14;
    if (y + hh > innerHeight - 8) y = innerHeight - hh - 8;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  };
  TB.hideTip = () => { clearTimeout(tipT); tip.hidden = true; };
  board.addEventListener("pointermove", (e) => { mouse = { x: e.clientX, y: e.clientY }; if (!tip.hidden) placeTip(); });
  board.addEventListener("pointerover", (e) => {
    const c = e.target.closest(".node.card"); if (!c || e.buttons || TB.editing) return;
    clearTimeout(tipT);
    tipT = setTimeout(() => { const body = TB.tipBody(c.dataset.id); if (!body.length) return; tip.replaceChildren(...body); tip.hidden = false; placeTip(); }, 220);
  });
  board.addEventListener("pointerout", (e) => { const c = e.target.closest(".node.card"); if (c && !c.contains(e.relatedTarget)) TB.hideTip(); });

  TB.flushPending = () => { if (pending && !TB.editing) TB.renderBoard(); };
})();
