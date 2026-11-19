// 右の詳細・ホバーの説明・メニュー・つながりの吹き出し・一覧表示
(function () {
  "use strict";
  const TB = window.TB, { h, $ } = TB;

  // ================= 小さな部品 =================
  TB.closeFloats = () => {
    for (const s of ["#pop", "#menu", "#drawopt"]) $(s).hidden = true;
    if (TB.selLink) { TB.selLink = null; TB.markSel(); }
  };
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#pop, #menu, #drawopt, #btn-drawmenu, #board")) TB.closeFloats(); });
  TB.menu = (items, x, y) => {
    const m = $("#menu");
    m.replaceChildren(...items.map((it) => it === "-" ? h("hr") : h("button", { type: "button", class: it[2] || null, onclick: () => { TB.closeFloats(); it[1](); } }, it[0])));
    m.hidden = false; m.style.left = Math.min(x, innerWidth - 220) + "px"; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + "px";
  };
  // 書きかけをなくさない入力欄（最初の入力のときだけ元に戻す点を作る）
  const lazy = (set) => { let armed = true; return { onfocus: () => { armed = true; }, oninput: (e) => { if (armed) { TB.snap(); armed = false; } set(e.target.value); TB.save(); } }; };
  const kidsOf = (id) => TB.B().links.filter((l) => l.a === id).map((l) => TB.node(l.b)).filter(Boolean);
  TB.parentOf = (id) => { const l = TB.B().links.find((x) => x.b === id); return l && TB.node(l.a); };
  // 編集に入らずにアイデアを足す（一覧表示・ボタンから）
  TB.addIdea = (parentId, text, kind) => {
    const b = TB.B(), pos = parentId ? TB.placeNear(parentId) : { x: 0, y: 0 };
    const n = TB.ideaNode({ x: pos.x, y: pos.y, text: text || "", kind: kind || "note" });
    b.nodes.push(n); if (parentId) b.links.push({ id: TB.uid(), a: parentId, b: n.id, kind: "line", label: "" });
    TB.save(); return n;
  };
  const nodeLabel = (n) => {
    if (n.t === "idea") return n.text || "（空）";
    const it = TB.item(n); return TB.slotName(n) + (it ? " ・ " + TB.deckOf(n).short(it, n.rev) : "");
  };

  // ================= 易の読み方（本卦＝今 → 変わる爻＝動いている所 → 之卦＝行き先） =================
  TB.ichingGuide = (n) => {
    const I = window.IChing, it = TB.item(n); if (!it) return [];
    // 本卦か之卦か: 之卦なら、これを after に持つ本卦を探す
    const base = n.after !== undefined || n.moving ? n : TB.B().nodes.find((m) => m.deck === "iching" && m.after === n.item && m.id !== n.id) || n;
    const bi = TB.item(base), ai = base.after && I.BY_ID[base.after], mv = base.moving || [];
    const tri = (x) => `上は ${x.upper.glyph}${x.upper.nature}（${x.upper.kw}）、下は ${x.lower.glyph}${x.lower.nature}（${x.lower.kw}）`;
    const step = (no, head, body, on) => h("div", { class: "ic-step" + (on ? " on" : "") }, h("i", { text: no }), h("div", {}, h("b", { text: head }), h("div", { class: "kt", text: body })));
    return [h("div", { class: "ic-guide" },
      h("div", { class: "ic-h", text: "易の読み方" }),
      step("1", `今の状況: 本卦 第${bi.num}卦 ${bi.name} — ${bi.kw}`, `${bi.text}　${tri(bi)}`, base === n),
      step("2", mv.length ? `変わるところ: ${mv.map((i) => I.LINE_POS[i].split("（")[0]).join("・")}` : "変わるところ: なし", mv.length ? mv.map((i) => I.LINE_POS[i]).join("、") + "。ここで状況が動いている。下の爻ほど始まり・内側、上の爻ほど終わり・外側のこと" : "動いている爻がないので、本卦だけを読む（今の状況がしばらく続く）", false),
      ai ? step("3", `行き先: 之卦 第${ai.num}卦 ${ai.name} — ${ai.kw}`, `${ai.text}　${tri(ai)}`, base !== n) : null,
      h("div", { class: "ic-q", text: "問い: " + (base === n ? bi.question : (ai || bi).question) }))];
  };

  // ================= ホバーの説明 =================
  TB.tipBody = (id) => {
    const n = TB.node(id); if (!n || n.t !== "card") return [];
    const it = TB.item(n), out = [h("div", { class: "tt-pos", text: TB.slotName(n) }), n.hint ? h("div", { class: "tt-hint", text: n.hint }) : null];
    if (!it) { out.push(h("div", { class: "tt-note", text: "クリックしてカード名を打つ／「引く」で置く" })); return out; }
    if (n.deck === "tarot") out.push(
      h("div", { class: "tt-card" }, h("b", { text: it.ja }), h("small", { text: "  " + it.en }), h("span", { class: "badge" + (n.rev ? " rev" : ""), text: n.rev ? "逆位置" : "正位置" })),
      h("div", { class: "kw" + (n.rev ? "" : " on") }, h("i", { text: "正" }), it.up), h("div", { class: "kw" + (n.rev ? " on" : "") }, h("i", { text: "逆" }), it.rv));
    else if (n.deck === "iching") out.push(...TB.ichingGuide(n));
    else out.push(h("div", { class: "tt-card" }, h("b", { text: it.name }), h("small", { text: "  " + it.setName })), h("div", { class: "kw on", text: it.question }));
    const nk = kidsOf(id).length; if (nk) out.push(h("div", { class: "tt-note", text: `つながったアイデア ${nk}個` }));
    return out;
  };

  // ================= 右クリックのメニュー =================
  TB.nodeMenu = (id, x, y) => {
    const n = TB.node(id), b = TB.B(), it = TB.item(n), items = [];
    const del = () => { TB.snap(); b.nodes = b.nodes.filter((m) => m.id !== id); b.links = b.links.filter((l) => l.a !== id && l.b !== id); TB.sel = TB.sel.filter((s) => s !== id); TB.save(); TB.renderAll(); };
    if (n.t === "idea") {
      items.push(["書き直す", () => TB.editIdea(id)], ["ここから広げる（Tab）", () => TB.newIdea(id)], ["子を並べ直す", () => TB.arrangeKids(id)]);
      if (!n.center) items.push(["消す", del, "danger"]);
    } else {
      if (it && n.deck === "tarot") items.push([n.rev ? "正位置にする" : "逆位置にする", () => { TB.snap(); n.rev = !n.rev; TB.save(); TB.renderAll(); }]);
      if (it) items.push(["アイデアを足す", () => TB.newIdea(id)], ["子を並べ直す", () => TB.arrangeKids(id)], ["カードを外す", () => { TB.snap(); n.item = null; n.rev = false; delete n.moving; TB.save(); TB.renderAll(); }]);
      if (!n.slot) items.push(["この枠ごと消す", del, "danger"]);
    }
    if (TB.host && TB.host.nodeMenu) { const extra = TB.host.nodeMenu(n); if (extra.length) items.push("-", ...extra); }
    if (TB.sel.length > 1 && TB.sel.includes(id)) items.push("-", [`選んだ ${TB.sel.length} 個をグループにする`, () => TB.groupSel()], [`選んだ ${TB.sel.length} 個を消す（Delete）`, () => TB.deleteSelected(), "danger"]);
    const cut = b.links.filter((l) => l.a === id || l.b === id);
    if (cut.length) items.push("-", [`つながりを全部消す（${cut.length}本）`, () => { TB.snap(); b.links = b.links.filter((l) => !cut.includes(l)); TB.save(); TB.renderAll(); }]);
    TB.menu(items, x, y);
  };
  TB.linkMenu = (id, x, y) => {
    const l = TB.B().links.find((q) => q.id === id);
    TB.menu([["線の上に書く・種類を変える", () => TB.openLinkPop(id, true)], "-",
      ...TB.LINK_KINDS.map(([k, name]) => [(l && TB.linkKind(l) === k ? "✓ " : "　") + name, () => { TB.snap(); l.kind = k; TB.save(); TB.renderBoard(); }]),
      "-", ["消す", () => TB.removeLink(id), "danger"]], x, y);
  };
  TB.frameMenu = (id, x, y) => {
    const b = TB.B();
    TB.menu([["名前を変える", () => TB.editFrameTitle(id)],
      "-", ["枠だけ消す（中身は残す）", () => { TB.snap(); b.frames = b.frames.filter((q) => q.id !== id); TB.save(); TB.renderBoard(); }, "danger"]], x, y);
  };
  TB.removeLink = (id) => { TB.snap(); TB.B().links = TB.B().links.filter((l) => l.id !== id); if (TB.selLink === id) TB.selLink = null; $("#pop").hidden = true; TB.save(); TB.renderBoard(); };

  // ================= つながりの吹き出し =================
  TB.openLinkPop = (id, focus) => {
    const b = TB.B(), l = b.links.find((x) => x.id === id); if (!l) return;
    TB.sel = []; TB.selLink = id; TB.markSel(); TB.renderDrawer({ quiet: true });
    const r = TB.routeLinks(b).find((x) => x.l.id === id); if (!r) return;
    const mid = TB.toScreen(r.g.mid.x, r.g.mid.y), br = $("#board").getBoundingClientRect();
    let armed = true;
    const input = h("input", { value: l.label, placeholder: "線の上に書く（Enter で閉じる）",
      oninput: (e) => { if (armed) { TB.snap(); armed = false; } l.label = e.target.value; TB.save(); TB.renderBoard(); TB.markSel(); },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); TB.closeFloats(); } } });
    const pop = $("#pop");
    const kinds = h("div", { class: "pop-kinds" }, TB.LINK_KINDS.map(([k, name]) => h("button", { type: "button", class: "kind-btn" + (TB.linkKind(l) === k ? " on" : ""), title: name, onclick: () => {
      TB.snap(); l.kind = k; TB.save(); TB.renderBoard(); TB.markSel(); kinds.querySelectorAll(".kind-btn").forEach((b) => b.classList.toggle("on", b.title === name)); input.focus(); } },
      h("svg", { width: 34, height: 14, viewBox: "0 0 34 14", class: "kind-ico k-" + k }, h("line", { x1: 3, y1: 7, x2: 31, y2: 7 }),
        k === "arrow" || k === "both" ? h("polygon", { points: "31,7 24,3 24,11" }) : null, k === "both" ? h("polygon", { points: "3,7 10,3 10,11" }) : null))));
    const flip = h("button", { type: "button", text: "向きを逆に", title: "矢印の向きを入れ替える", onclick: () => { TB.snap(); [l.a, l.b] = [l.b, l.a]; TB.save(); TB.renderBoard(); TB.markSel(); } });
    pop.replaceChildren(input, kinds, flip, h("button", { type: "button", class: "danger", text: "線を消す", title: "Delete", onclick: () => TB.removeLink(id) }));
    pop.hidden = false;
    const hw = pop.offsetWidth / 2 + 8; pop.style.left = Math.max(hw, Math.min(br.width - hw, mid.x - br.left)) + "px";
    pop.style.top = Math.max(4, Math.min(br.height - 60, mid.y - br.top)) + "px";
    if (focus) input.focus();
  };

  // 子を親のまわりに並べ直す
  TB.arrangeKids = (id) => {
    const P = TB.node(id), kids = kidsOf(id).filter((k) => k.t === "idea"); if (!kids.length) return;
    TB.snap();
    const b = TB.B(); const others = new Set(kids.map((k) => k.id));
    const save = b.nodes; b.nodes = b.nodes.filter((n) => !others.has(n.id));
    for (const k of kids) { const p = TB.placeNear(id, TB.rectOf(k)); k.x = p.x; k.y = p.y; b.nodes.push(k); }
    b.nodes = save; void P; TB.save(); TB.renderBoard();
  };

  // ================= 右の詳細 =================
  TB.renderDrawer = (opt) => {
    opt = opt || {};
    const dr = $("#drawer"), ids = TB.sel.filter((id) => TB.node(id) || TB.B().frames.some((f) => f.id === id) || TB.isLinkId(id));
    let parts;
    if (ids.length && ids.every(TB.isLinkId) && !(ids.length === 1 && TB.selLink)) parts = linksPanel(ids);
    else if (ids.length > 1) parts = multi(ids);
    else if (ids.length === 1 && TB.node(ids[0])) parts = TB.node(ids[0]).t === "card" ? cardDetail(TB.node(ids[0]), opt) : ideaDetail(TB.node(ids[0]));
    else if (ids.length === 1) parts = frameDetail(TB.B().frames.find((f) => f.id === ids[0]));
    else parts = [];
    dr.replaceChildren(...parts.flat().filter(Boolean));
    // 右の欄は、何かを選んでいるときだけ（何も選んでいないときは、上の「まとめ」で開ける）
    const show = !!(ids.length > 0 || TB.sel.some((id) => TB.B().items.some((i) => i.id === id)));
    if (dr.hidden === show) { dr.hidden = !show; }
    if (opt.focusCard) { const i = $("#card-input"); if (i) i.focus(); }
  };

  function bigCard(n) {
    const it = TB.item(n);
    if (!it) return h("div", { class: "d-big empty" }, h("span", { text: "?" }));
    if (n.deck === "tarot") return h("div", { class: "d-big" }, h("img", { src: window.Cards.imgUrl(it), alt: "", class: n.rev ? "rev" : null }));
    if (n.deck === "iching") return h("div", { class: "d-big hexcard" }, h("div", { class: "hc-num", text: "第" + it.num + "卦" }), TB.hexSvg(it.lines, n.moving), h("div", { class: "hc-name", text: it.name }));
    return h("div", { class: "d-big pcard", style: `--pc:${it.color}` }, h("div", { class: "pc-set", text: it.setName }), h("div", { class: "pc-name", text: it.name }));
  }
  const chip = (text, on, cls) => h("button", { type: "button", class: "chip" + (cls ? " " + cls : ""), onclick: on }, text);

  function cardDetail(n, opt) {
    const it = TB.item(n), D = TB.deckOf(n);
    const btns = [];
    if (it && n.deck === "tarot") btns.push(h("button", { type: "button", text: n.rev ? "正位置にする" : "逆位置にする", onclick: () => { TB.snap(); n.rev = !n.rev; TB.save(); TB.renderAll(); } }));
    if (it) btns.push(h("button", { type: "button", text: "＋アイデア", title: "このカードから広げる（Tab）", onclick: () => TB.newIdea(n.id) }));
    if (it) btns.push(h("button", { type: "button", text: "替える", onclick: () => { const w = $("#d-in"); w.hidden = !w.hidden; if (!w.hidden) $("#card-input").focus(); } }));
    const head = h("div", { class: "d-head" }, bigCard(n), h("div", { class: "d-meta" },
      h("input", { class: "d-pos", value: TB.slotName(n), title: "位置の名前（変えられる）", ...lazy((v) => { n.label = v; TB.renderBoard(); }) }),
      n.hint ? h("div", { class: "d-hint", text: n.hint }) : null,
      it ? h("div", { class: "d-card" }, D.short(it, false), n.deck === "tarot" ? h("small", { text: it.en }) : null,
        n.deck === "tarot" ? h("span", { class: "badge" + (n.rev ? " rev" : ""), text: n.rev ? "逆位置" : "正位置" }) : null) : h("div", { class: "d-card muted", text: D.name + "のカード未設定" }),
      h("div", { class: "d-btns" }, btns)));
    const parts = [head];
    if (it) parts.push(meaning(n, it));
    parts.push(cardInput(n, !it || opt.focusCard));
    if (it) parts.push(relations(n));
    parts.push(h("label", { text: "この位置での読み" }), h("textarea", { rows: 2, placeholder: `「${TB.slotName(n)}」${n.hint ? "（" + n.hint + "）" : ""}としてどう読むか`, value: n.pos || "", ...lazy((v) => { n.pos = v; TB.renderBoard(); TB.markSel(); }) }),
      h("label", { text: "自分の解釈・まとめ" }), h("textarea", { class: "grow", placeholder: "このカードから見えたこと", value: n.mine || "", ...lazy((v) => { n.mine = v; TB.renderBoard(); TB.markSel(); }) }));
    return parts;
  }
  function meaning(n, it) {
    const box = h("div", { class: "d-mean" });
    const askChip = (q) => chip(q, () => { TB.snap(); const a = TB.addIdea(n.id, q, "ask"); TB.renderBoard(); TB.select(a.id, { quiet: true }); TB.newIdea(a.id); }, "ask");
    if (n.deck === "tarot") {
      box.append(
        h("div", { class: "kw" + (n.rev ? "" : " on") }, h("i", { text: "正" }), h("b", { text: it.up }), h("div", { class: "kt", text: it.upText })),
        h("div", { class: "kw" + (n.rev ? " on" : "") }, h("i", { text: "逆" }), h("b", { text: it.rv }), h("div", { class: "kt", text: it.rvText })),
        h("div", { class: "facts", text: it.facts.join("　") }),
        h("div", { class: "chips" }, h("span", { class: "chips-h", text: "絵の中にあるもの（押すと連想を書く）" }),
          it.scene.map((s) => chip(s, () => { const a = TB.newIdea(n.id); const t = $(`.node[data-id="${a.id}"] .txt`); if (t) { t.textContent = s + "："; const rg = document.createRange(); rg.selectNodeContents(t); rg.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(rg); } }))),
        h("div", { class: "chips" }, askChip(it.question)));
    } else if (n.deck === "iching") {
      box.append(...TB.ichingGuide(n), h("div", { class: "chips" }, chip(it.upper.nature + "から連想する", () => TB.newIdea(n.id)), chip(it.lower.nature + "から連想する", () => TB.newIdea(n.id)), askChip(it.question)));
    } else {
      box.append(h("div", { class: "kw on" }, h("b", { text: it.setName }), h("div", { class: "kt", text: window.Prompts.SETS.find((s) => s.id === it.set).desc })),
        h("div", { class: "chips" }, askChip(it.question)));
    }
    return box;
  }
  function relations(n) {
    const b = TB.B(), out = h("div", { class: "d-rel" }, h("h4", { text: "つながり" }));
    const cardLinks = b.links.filter((l) => (l.a === n.id || l.b === n.id) && TB.node(l.a === n.id ? l.b : l.a)?.t === "card");
    for (const l of cardLinks) {
      const o = TB.node(l.a === n.id ? l.b : l.a);
      out.append(h("button", { type: "button", class: "rel", onclick: () => TB.select(o.id) }, h("b", { text: nodeLabel(o) }), l.label ? h("span", { class: "rl", text: "「" + l.label + "」" }) : null));
    }
    // このカードから広げたアイデア（深さ2まで）
    const kids = kidsOf(n.id).filter((k) => k.t === "idea");
    if (kids.length) {
      for (const k of kids.slice(0, 8)) out.append(h("button", { type: "button", class: "rel idea", onclick: () => { TB.select(k.id); TB.reveal(k); } },
        h("span", { text: k.text + (kidsOf(k.id).length ? `（＋${kidsOf(k.id).length}）` : "") })));
    }
    if (!cardLinks.length && !kids.length) out.append(h("div", { class: "muted", text: "まだありません。カードをクリックすると、つながった入力欄が出ます。別のカードへドラッグするとつながります" }));
    return out;
  }
  function cardInput(n, open) {
    const D = TB.deckOf(n);
    const input = h("input", { id: "card-input", autocomplete: "off", placeholder: n.deck === "tarot" ? "カード名・略号（悪魔 / ワンド10 / w10 / 14r）" : n.deck === "iching" ? "卦の番号か名前（1 / 乾 / 水雷屯）" : "カード名" });
    const list = h("ul", { class: "sugg", hidden: true });
    let items = [], idx = 0, qrev = false;
    const refresh = () => {
      const res = D.search(input.value); items = res.cards; qrev = !!res.rev; idx = 0;
      list.replaceChildren(...items.map((c, i) => h("li", { class: i === 0 ? "on" : null, onmousedown: (ev) => { ev.preventDefault(); pick(c); } },
        h("span", { text: D.label(c, false) }), h("small", { text: (c.ab || "") + (qrev ? " 逆" : "") }))));
      list.hidden = !items.length;
    };
    const pick = (c) => {
      TB.snap(); n.item = c.id; n.rev = qrev; delete n.moving; TB.save();
      const b = TB.B(), cards = b.nodes.filter((m) => m.t === "card");
      const dup = cards.find((m) => m !== n && m.deck === n.deck && m.item === c.id); if (dup) TB.toast(`同じカードが「${TB.slotName(dup)}」にもあります`);
      const nxt = cards.slice(cards.indexOf(n) + 1).find((m) => !m.item && m.deck === n.deck);
      TB.renderBoard();
      if (nxt) TB.select(nxt.id, { focusCard: true }); else TB.select(n.id);
    };
    input.addEventListener("input", refresh);
    input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 120));
    input.addEventListener("keydown", (ev) => {
      if (ev.isComposing) return;
      const mark = () => [...list.children].forEach((li, i) => li.classList.toggle("on", i === idx));
      if (ev.key === "ArrowDown" && items.length) { ev.preventDefault(); idx = (idx + 1) % items.length; mark(); }
      else if (ev.key === "ArrowUp" && items.length) { ev.preventDefault(); idx = (idx - 1 + items.length) % items.length; mark(); }
      else if (ev.key === "Enter" && items.length) { ev.preventDefault(); pick(items[idx]); }
      else if (ev.key === "Escape" && input.value) { ev.stopPropagation(); input.value = ""; refresh(); }
    });
    return h("div", { class: "d-in", id: "d-in", hidden: !open }, input, list);
  }

  // アイデアの枠と色（選んでいる全部に）
  const COLORS = [["", "墨"], ["#c0392b", "赤"], ["#d9822b", "橙"], ["#2f8a3e", "緑"], ["#2f6fd0", "青"], ["#7b4fc0", "紫"], ["#8b909c", "灰"]];
  const same = (arr, f) => (arr.every((x) => (f(x) || "") === (f(arr[0]) || "")) ? f(arr[0]) || "" : null);
  const colRow = (label, cur, on) => h("div", { class: "st-row" }, h("span", { class: "st-l", text: label }), COLORS.map(([v, t]) =>
    h("button", { type: "button", class: "st-col" + (cur === v ? " on" : ""), title: t, "aria-label": t, style: `--c:${v || "#1f1f1e"}`, onclick: () => on(v) })));
  // 文字の色と、枠の色は別（枠の色を決めなければ、文字の色に合わせる）
  function styleBox(ideas) {
    const box = same(ideas, (n) => n.box);
    return h("div", { class: "d-style" },
      h("div", { class: "st-row" }, h("span", { class: "st-l", text: "枠" }), [["", "なし"], ["line", "線"], ["fill", "塗り"]].map(([v, t]) =>
        h("button", { type: "button", class: "st-box b-" + (v || "none") + (box === v ? " on" : ""), text: t, onclick: () => TB.styleSel("box", v) }))),
      colRow("文字", same(ideas, (n) => n.color), (v) => TB.styleSel("color", v)),
      colRow("枠色", same(ideas, (n) => n.bc), (v) => TB.styleSel("bc", v)));
  }
  // 線（いくつでも）: 種類と色をまとめて変える
  function linkStyle(ls) {
    const kind = same(ls, (l) => TB.linkKind(l));
    return h("div", { class: "d-style" },
      h("div", { class: "st-row" }, h("span", { class: "st-l", text: "線" }), TB.LINK_KINDS.map(([k, name]) => h("button", { type: "button", class: "kind-btn" + (kind === k ? " on" : ""), title: name, onclick: () => TB.styleLinks("kind", k) },
        h("svg", { width: 34, height: 14, viewBox: "0 0 34 14", class: "kind-ico k-" + k }, h("line", { x1: 3, y1: 7, x2: 31, y2: 7 }),
          k === "arrow" || k === "both" ? h("polygon", { points: "31,7 24,3 24,11" }) : null, k === "both" ? h("polygon", { points: "3,7 10,3 10,11" }) : null)))),
      colRow("色", same(ls, (l) => l.color), (v) => TB.styleLinks("color", v)));
  }
  function linksPanel(ids) {
    const ls = ids.map((id) => TB.B().links.find((l) => l.id === id)).filter(Boolean);
    return [h("h3", { text: `線 ${ls.length}本を選択中` }), linkStyle(ls),
      h("div", { class: "d-btns" }, h("button", { type: "button", text: "向きを逆に", onclick: () => TB.styleLinks("flip") }),
        h("button", { type: "button", class: "danger", text: "まとめて消す（Delete）", onclick: () => TB.deleteSelected() }), h("button", { type: "button", text: "選択を外す（Esc）", onclick: () => TB.select([]) })),
      h("p", { class: "muted", text: "Ctrl+ドラッグで囲むと、囲んだ線もまとめて選べます。Ctrl+クリックで、線を足す・外す" })];
  }
  // 選んだもののまわりに、発想カードの型を並べる
  function promptRow() {
    return h("div", { class: "d-psets" }, h("h4", { text: "このまわりに並べる" }),
      h("div", { class: "chips" }, ["w5h1", "next", "roles", "scamper", "hats"].map((id) => { const se = window.Prompts.SETS.find((x) => x.id === id); return se && chip(se.name, () => TB.drawPromptSet(id)); }).filter(Boolean),
        chip("1枚", () => TB.doDraw("prompt"))));
  }
  function ideaDetail(n) {
    const par = TB.parentOf(n.id), kids = kidsOf(n.id);
    return [
      h("h3", { text: n.center ? "テーマ" : "アイデア" }),
      h("textarea", { class: "grow", value: n.text, ...lazy((v) => { n.text = v; TB.renderBoard(); TB.markSel(); }) }),
      par ? h("div", { class: "d-rel" }, h("h4", { text: "元" }), h("button", { type: "button", class: "rel", onclick: () => TB.select(par.id) }, h("b", { text: nodeLabel(par) }))) : null,
      kids.length ? h("div", { class: "d-rel" }, h("h4", { text: `ここから（${kids.length}）` }), kids.map((k) => h("button", { type: "button", class: "rel idea", onclick: () => TB.select(k.id) }, h("span", { text: nodeLabel(k) })))) : null,
      styleBox([n]),
      h("div", { class: "d-btns" },
        h("button", { type: "button", text: "＋広げる（Tab）", onclick: () => TB.newIdea(n.id) }),
        h("button", { type: "button", text: "書き直す（Enter・もう一度クリック）", onclick: () => TB.editIdea(n.id) }),
        kids.length ? h("button", { type: "button", text: "子を並べ直す", onclick: () => TB.arrangeKids(n.id) }) : null),
      TB.plain ? null : promptRow(),
    ];
  }
  function frameDetail(f) {
    if (!f) return [];
    return [h("h3", { text: "グループ" }), h("input", { value: f.title, ...lazy((v) => { f.title = v; TB.renderBoard(); TB.markSel(); }) }),
      h("div", { class: "d-style" }, colRow("枠色", f.color && f.color !== TB.FRAME_COLORS[0] ? f.color : "", (v) => { TB.snap(); f.color = v || TB.FRAME_COLORS[0]; TB.save(); TB.renderBoard(); TB.markSel(); TB.renderDrawer({ quiet: true }); })),
      h("p", { class: "muted", text: "見出しをドラッグすると中身ごと動きます。右下の角で大きさを変えられます" })];
  }
  function multi(ids) {
    const ideas = ids.map(TB.node).filter((n) => n && n.t === "idea");
    return [h("h3", { text: `${ids.filter((x) => !TB.isLinkId(x)).length}個を選択中` }),
      h("div", { class: "d-btns" }, h("button", { type: "button", class: "primary", text: "グループにする", title: "選んだものを枠で囲む", onclick: () => TB.groupSel() }),
        h("button", { type: "button", class: "danger", text: "まとめて消す（Delete）", onclick: () => TB.deleteSelected() }), h("button", { type: "button", text: "選択を外す（Esc）", onclick: () => TB.select([]) })),
      ideas.length ? styleBox(ideas) : null,
      TB.selLinks().length ? [h("h4", { text: `つながった線 ${TB.selLinks().length}本` }), linkStyle(TB.selLinks().map((id) => TB.B().links.find((l) => l.id === id)).filter(Boolean))] : null,
      h("p", { class: "muted", text: "Ctrl+ドラッグで、まとめて動かせます。Ctrl+クリックで、選ぶものを足す・外す" })];
  }

})();
