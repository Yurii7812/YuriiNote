// ひな形を選ぶ（YuriiNote: 盤面はノート 1 つに 1 枚。空のときだけ、ひな形から作り直せる。一覧・写真は使わない）
(function () {
  "use strict";
  const TB = window.TB, { h, $ } = TB;
  const dlg = $("#dlg");
  let onClose = null;
  TB.openDialog = (cls, ...kids) => {
    dlg.replaceChildren(h("div", { class: "dlg-box " + cls }, h("button", { type: "button", class: "dlg-x icon", title: "閉じる（Esc）", text: "✕", onclick: TB.closeDialog }), ...kids));
    dlg.hidden = false;
  };
  TB.closeDialog = () => { dlg.hidden = true; dlg.replaceChildren(); if (onClose) { const f = onClose; onClose = null; f(); } };
  TB.dialogOpen = () => !dlg.hidden;
  dlg.addEventListener("pointerdown", (e) => { if (e.target === dlg) TB.closeDialog(); });

  TB.switchBoard = () => { TB.clearHist(); TB.sel = []; TB.selLink = null; TB.view.auto = true; TB.renderAll(); TB.fit(); };
  TB.addBoard = (b) => { const old = TB.B(); b.id = old.id; b.created = old.created; TB.store.boards[b.id] = b; TB.store.current = b.id; TB.save(); TB.switchBoard(); if (TB.host && TB.host.title) TB.host.title(b.title); };

  // ================= 新規作成（ひな形・スプレッドはここでだけ選ぶ） =================
  TB.openNew = () => {
    const title = h("input", { class: "big", value: TB.B().title || "", placeholder: "テーマ・問い（例: 来年やりたいこと／相手との関係をどうするか）" });
    const make = async (tid) => {
      const b = TB.build(tid, title.value.trim()); TB.closeDialog(); TB.addBoard(b);
      if (tid === "prompts3") { const c = b.nodes.find((n) => n.center); for (let i = 0; i < 3; i++) { TB.sel = [c.id]; await TB.doDraw("prompt"); } TB.select([]); TB.fit(); }
      else if (tid === "center") { const c = b.nodes.find((n) => n.center); TB.select(c.id); if (!b.title) TB.editIdea(c.id); else TB.newIdea(c.id); }
    };
    title.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); make("center"); } });
    const groups = {};
    for (const t of TB.TEMPLATES) (groups[t.group] ||= []).push(t);
    TB.openDialog("new", h("h2", { text: "新しく作る" }), title,
      h("div", { class: "tpl-groups" }, Object.entries(groups).map(([g, list]) => h("section", {}, h("h3", { text: g }),
        h("div", { class: "tpl-list" }, list.map((t) => h("button", { type: "button", class: "tpl", onclick: () => make(t.id) }, h("b", { text: t.name }), h("small", { text: t.desc }))))))),
      h("p", { class: "muted", text: "Enter で「中心テーマから」。Esc で閉じると「自由」（何もない盤面）のまま書けます" }));
    title.focus();
  };

})();
