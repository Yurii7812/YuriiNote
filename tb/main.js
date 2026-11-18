// 上のバー・キー・起動（YuriiNote 版。元: ~/tarot-brainstorm/app/main.js）
// 親の画面（YuriiNote）が TB.mount(盤面, host, opt) を呼ぶ。host: { change(), title(v), menu(rect), key(e), chip(el, e),
//   renderText(text) → HTML, nodeMenu(node) → [[名前, 関数]], search(insert), anchor(text), peek(text, rect), id }
(function () {
  "use strict";
  const TB = window.TB, { h, $ } = TB;

  TB.renderHeader = () => {
    const b = TB.B(), tpl = TB.TEMPLATES.find((t) => t.id === b.template);
    if (document.activeElement !== $("#title")) $("#title").value = b.title;
    $("#layout-chip").textContent = tpl ? tpl.name : "自由";
    $("#layout-chip").title = (tpl ? tpl.group + ": " + tpl.desc : "") + "（作ったあとは変えられません）";
    $("#nid").textContent = TB.host && TB.host.id ? "🧠 " + TB.host.id : "🧠";
  };
  TB.renderAll = () => { TB.renderHeader(); TB.renderBoard(); TB.renderDrawer({ quiet: true }); };

  // 題（テーマ）。中心のテーマが同じ文なら一緒に変える。ノートの題にもなる
  { let armed = true;
    $("#title").addEventListener("focus", () => { armed = true; });
    $("#title").addEventListener("input", (e) => {
      if (armed) { TB.snap(); armed = false; }
      const b = TB.B(), c = b.nodes.find((n) => n.center);
      if (c && (c.text === b.title || c.text === "テーマ")) { c.text = e.target.value || "テーマ"; TB.renderBoard(); }
      b.title = e.target.value; TB.save(); if (TB.host && TB.host.title) TB.host.title(b.title);
    }); }
  $("#title").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) e.target.blur(); });

  const on = (id, f) => $(id).addEventListener("click", f);
  on("#btn-draw", () => TB.doDraw());
  on("#btn-drawmenu", () => { if ($("#drawopt").hidden) TB.openDrawMenu(); else TB.closeFloats(); });
  on("#btn-undo", () => TB.undo());
  on("#btn-redo", () => TB.redo());
  on("#btn-fit", () => TB.fit());
  on("#btn-new", () => { if (isEmpty()) TB.openNew(); else TB.toast("ひな形は、盤面が空のときだけ選べます（今の盤面は消しません）"); });
  on("#btn-more", (e) => { if (TB.host && TB.host.menu) TB.host.menu(e.currentTarget.getBoundingClientRect()); });
  const isEmpty = () => { const b = TB.B(); return !b.items.length && !b.frames.length && b.nodes.every((n) => n.center && (!n.text || n.text === "テーマ" || n.text === b.title)); };

  // 選んでいるものを消す（スプレッドの枠のカードは中身だけ外す。文字・ペンの線・枠も）
  TB.deleteSelected = () => {
    const b = TB.B(); if (!TB.sel.length) return;
    TB.snap();
    for (const id of TB.sel) {
      const n = TB.node(id);
      if (n && n.t === "card" && n.slot) { n.item = null; n.rev = false; delete n.moving; continue; }
      if (n && n.center) continue;   // テーマは残す（書き換えはできる）
      if (n) { b.nodes = b.nodes.filter((m) => m.id !== id); b.links = b.links.filter((l) => l.a !== id && l.b !== id); continue; }
      b.frames = b.frames.filter((f) => f.id !== id); b.items = b.items.filter((i) => i.id !== id);
    }
    TB.sel = []; TB.save(); TB.renderAll();
  };

  let hover = null;
  $("#board").addEventListener("pointerover", (e) => { const n = e.target.closest(".node"); hover = n ? n.dataset.id : null; });
  $("#board").addEventListener("pointerleave", () => { hover = null; });

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if (TB.dialogOpen()) { if (e.key === "Escape") { e.preventDefault(); TB.closeDialog(); } return; }
    if (e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase(), run = (f) => { e.preventDefault(); e.stopPropagation(); f(); };
      if (k === "z" && !typing) return run(e.shiftKey ? TB.redo : TB.undo);
      if (k === "y" && !typing) return run(TB.redo);
      if (k === "d") return run(() => TB.doDraw());
      if (k === "0") return run(TB.fit);
      if (k === "a" && !typing) return run(TB.selectAll);
      if (["c", "v", "x"].includes(k) && typing) return;   // 書いている途中の写す・貼る
      if (typing && ["arrowleft", "arrowright", "home", "end", "backspace", "delete"].includes(k)) return;
      if (TB.host && TB.host.key) { e.preventDefault(); TB.host.key(e); }   // ほかの Ctrl のキーは YuriiNote に任せる（Ctrl+[ など）
      return;
    }
    if (e.key === "Escape") {
      if (!$("#pop").hidden || !$("#menu").hidden || !$("#drawopt").hidden) { TB.closeFloats(); return; }
      if (typing) { e.target.blur(); return; }
      if (TB.sel.length || TB.selLink) TB.select([]);
      return;
    }
    if (typing || TB.editing) return;
    // ノードに合わせて Space: 文字の中の ID のノートをのぞく
    if (e.key === " " && hover && TB.host && TB.host.peek) {
      const n = TB.node(hover), el = document.querySelector(`.node[data-id="${CSS.escape(hover)}"]`);
      if (n && n.t === "idea" && el) { const r = el.getBoundingClientRect(); if (TB.host.peek(n.text, r)) { e.preventDefault(); return; } }
    }
    const cur = TB.node(TB.sel[TB.sel.length - 1]);
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (TB.selLink) TB.removeLink(TB.selLink); else TB.deleteSelected(); return; }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (dir) { e.preventDefault(); TB.moveSel(...dir); return; }
    if (!cur) return;
    if (e.key === "Tab") { e.preventDefault(); if (cur.t === "idea" || cur.item) TB.newIdea(cur.id); return; }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if (cur.t === "idea") { if (e.key === "Enter" && TB.parentOf(cur.id)) TB.newIdea(TB.parentOf(cur.id).id); else TB.editIdea(cur.id); }
      else if (cur.item) TB.newIdea(cur.id); else { const i = $("#card-input"); if (i) i.focus(); }
      return;
    }
    // 文字を打ち始めたら: アイデアなら書き直し、空のカード枠ならカード名の入力
    if (e.key.length === 1 && !e.metaKey) {
      if (cur.t === "idea") TB.editIdea(cur.id);
      else if (!cur.item) { const i = $("#card-input"); if (i) i.focus(); }
    }
  });

  // ---- 前の形（v2: {t:[[x,y,文字,種類]], l:[[i,j]], s:[線]}）から読み替える ----
  TB.fromV2 = (d) => {
    const b = TB.newBoard({ title: d.title || "", template: "free" }), ids = [];
    for (const a of d.t || []) {
      const [x, y, text, k] = a, m = /^(tarot|iching|prompt):([^:]+)(?::(.*))?$/.exec(k || "");
      let n;
      if (m) n = TB.cardNode(m[1], { item: m[2], rev: m[1] === "tarot" && m[3] === "r", moving: m[1] === "iching" && m[3] ? m[3].split("").map(Number) : undefined, x: Math.round(x * 1.7 + 65), y: Math.round(y * 1.7 + 108), label: /：/.test(text || "") ? text.split("：")[0] : "" });
      else n = TB.ideaNode({ x: Math.round(x * 1.7 + 60), y: Math.round(y * 1.7 + 16), text: String(text || "") });
      b.nodes.push(n); ids.push(n.id);
    }
    for (const [i, j] of d.l || []) if (ids[i] && ids[j]) b.links.push({ id: TB.uid(), a: ids[i], b: ids[j], kind: "line", label: "" });
    for (const f of d.s || []) b.items.push({ id: TB.uid(), type: "stroke", pts: f.map((v) => Math.round(v * 1.7)), color: TB.INK, w: 2.5 });
    return b;
  };
  // ---- 本文（ノートの検索・(n)・バックリンク用）: つながりを木の形の文章に ----
  TB.cardText = (n) => { const it = TB.item(n), name = TB.slotName(n); return it ? `${name}：${TB.deckOf(n).label(it, n.rev)}` : name + "（空）"; };
  TB.bodyText = () => {
    const b = TB.B(), kids = new Map(), hasIn = new Set(), seen = new Set(), out = [];
    for (const l of b.links) { if (!kids.has(l.a)) kids.set(l.a, []); kids.get(l.a).push(l.b); hasIn.add(l.b); }
    const order = (a, c) => (a.y - c.y) || (a.x - c.x);
    const line = (n) => (n.t === "idea" ? n.text : TB.cardText(n)).replace(/\s*\n\s*/g, " ").trim();
    const walk = (n, d) => {
      if (seen.has(n.id)) return; seen.add(n.id);
      const t = line(n); if (t) out.push("  ".repeat(d) + "- " + t);
      for (const k of (kids.get(n.id) || []).map(TB.node).filter(Boolean).sort(order)) walk(k, t ? d + 1 : d);
    };
    const roots = b.nodes.filter((n) => !hasIn.has(n.id)).sort((a, c) => (c.center ? 1 : 0) - (a.center ? 1 : 0) || order(a, c));
    for (const n of roots) walk(n, 0);
    for (const n of b.nodes.slice().sort(order)) walk(n, 0);   // 輪になっているもの
    for (const f of b.frames) if (f.title) out.push("- [" + f.title + "]");
    for (const it of b.items) if (it.type === "text" && it.text.trim()) out.push("- " + it.text.replace(/\s*\n\s*/g, " ").trim());
    if (b.summary && b.summary.trim()) out.push("", b.summary.trim());
    return out.join("\n");
  };

  // ---- 親の画面から開く ----
  TB.mount = (data, host, opt) => {
    opt = opt || {};
    TB.host = host;
    const b = data && Array.isArray(data.nodes) ? JSON.parse(JSON.stringify(data)) : data && (data.t || data.s) ? TB.fromV2(data) : TB.newBoard({ title: (data && data.title) || "" });
    TB.loadBoard(b);
    TB.clearHist(); TB.sel = []; TB.selLink = null; TB.closeFloats();
    if (TB.dialogOpen()) TB.closeDialog();
    TB.renderAll();
    const v = opt.view;
    if (v && isFinite(v.s)) { Object.assign(TB.view, { s: v.s, tx: v.tx, ty: v.ty, auto: false }); TB.renderBoard(); } else TB.fit();
    if (opt.fresh && isEmpty()) TB.openNew();
  };
  TB.board = () => { for (const n of TB.B().nodes) if (n.t === "card") n.cap = TB.cardText(n); return JSON.parse(JSON.stringify(TB.B())); };   // cap: 本文を、盤面の外（lib.js）でも同じに作るため

  TB.init();
  TB.renderAll();
  requestAnimationFrame(() => TB.fit());
  window.parent && window.parent !== window && window.parent.postMessage && window.parent.postMessage({ tb: "ready" }, "*");
})();
