// 引く: タロット・易・発想カード。乱数の元と混ぜ方は設定で選ぶ
(function () {
  "use strict";
  const TB = window.TB, { h, $ } = TB;
  const POOLS = { all: "78枚", major: "大アルカナ", minor: "小アルカナ" };
  const METHODS = {
    crypto: ["おまかせ", "OS の暗号乱数。毎回まったく別の結果"],
    word: ["言葉から", "同じ言葉なら同じ結果（再現できる）"],
    mouse: ["かき混ぜる", "マウスの動きを乱数の元にする"],
    time: ["時刻", "押した瞬間のミリ秒を元にする"],
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const defaultSeed = () => `${TB.B().title.trim() || "（無題）"}｜${today()}`;
  TB.drawText = (dr) => {
    const m = METHODS[dr.method] ? METHODS[dr.method][0] : dr.method;
    const deck = TB.DECKS[dr.deck] ? TB.DECKS[dr.deck].name : "";
    const sh = dr.deck === "tarot" ? (dr.shuffle === "riffle" ? `・リフル${dr.riffles}回＋カット` : "・完全に混ぜる") + `・逆位置${dr.revOn ? dr.revProb + "%" : "なし"}` : "";
    return `${deck}・${m}${sh}（種: ${String(dr.seed).slice(0, 24)}）`;
  };

  // 引いたカードを置く先: 空いた枠 → 選んでいるノードのそば → テーマのそば → 真ん中
  function anchor() {
    const b = TB.B(), s = TB.node(TB.sel[TB.sel.length - 1]);
    return s || b.nodes.find((n) => n.center) || null;
  }
  function placeCard(deck, parent) {
    const b = TB.B(), D = TB.DECKS[deck];
    let pos;
    if (parent) pos = deck === "prompt" ? TB.placeNear(parent.id, { w: D.w, h: D.h + 8 }, 2) : TB.placeNear(parent.id, { w: Math.max(D.w, 150), h: D.h + 56 }, 28);
    else {   // 選んでいるものが無い: 見ている真ん中。重なるなら右へずらす
      const r = $("#board").getBoundingClientRect(), c = TB.toWorld(r.left + r.width / 2, r.top + r.height / 2); pos = { x: Math.round(c.x), y: Math.round(c.y) };
      const boxes = b.nodes.map(TB.boxOf), me = () => ({ x: pos.x, y: pos.y + 28, w: Math.max(D.w, 150), h: D.h + 56 });
      for (let i = 0; i < 40 && boxes.some((q) => TB.overlaps(q, me(), 14)); i++) pos.x += Math.max(D.w, 150) + 30;
    }
    const n = TB.cardNode(deck, { x: pos.x, y: pos.y, hint: deck === "prompt" ? "発想のきっかけ" : "引いたカード" });
    b.nodes.push(n);
    if (parent) b.links.push({ id: TB.uid(), a: parent.id, b: n.id, kind: "line", label: "" });
    return n;
  }

  // ---- 占う前に「何を占うか」を書く画面。書いた問いは盤面に文字（アイデア）として置き、引いたカードをそこにつなぐ ----
  TB.askQuestion = (what) => new Promise((ok) => {
    const b = TB.B(), s0 = TB.node(TB.sel[TB.sel.length - 1]);
    const pre = s0 && s0.t === "idea" ? s0.text : b.title || "";
    const input = h("textarea", { class: "q-in", rows: 2, placeholder: "例: この仕事を続けるべきか／あの人との関係はどうなるか", value: pre });
    let done = false;
    const fin = (v) => { if (done) return; done = true; TB.closeDialog(); ok(v); };
    const go = () => fin({ q: input.value.trim() });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
    TB.openDialog("ask", h("h2", { text: "何を占いますか" }), h("p", { class: "muted", text: what }), input,
      h("div", { class: "q-bar" }, h("button", { type: "button", text: "問いを書かずに引く", onclick: () => fin({ q: "" }) }), h("span", { class: "grow" }),
        h("button", { type: "button", text: "やめる", onclick: () => fin(null) }), h("button", { type: "button", class: "primary", text: "引く（Enter）", onclick: go })));
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const watch = setInterval(() => { if (!TB.dialogOpen()) { clearInterval(watch); fin(null); } }, 200);
  });
  // 問いを盤面に置く（選んでいるアイデアが同じ文なら、それを使う）。戻り値: 問いのノード（無ければ null）
  function questionNode(q) {
    if (!q) return null;
    const b = TB.B(), s0 = TB.node(TB.sel[TB.sel.length - 1]);
    if (s0 && s0.t === "idea" && s0.text.trim() === q) return s0;
    const ex = b.nodes.find((n) => n.t === "idea" && n.kind === "ask" && n.text.trim() === q); if (ex) return ex;
    let pos;
    if (s0) pos = TB.placeNear(s0.id);
    else { const r = $("#board").getBoundingClientRect(), c = TB.toWorld(r.left + r.width / 2, r.top + r.height / 3); pos = { x: Math.round(c.x), y: Math.round(c.y) }; const boxes = b.nodes.map(TB.boxOf); for (let i = 0; i < 40 && boxes.some((x) => TB.overlaps(x, { x: pos.x, y: pos.y, w: 240, h: 40 }, 20)); i++) pos.y += 60; }
    const n = TB.ideaNode({ x: pos.x, y: pos.y, text: q, kind: "ask", box: "line" });
    b.nodes.push(n); if (s0) b.links.push({ id: TB.uid(), a: s0.id, b: n.id, kind: "line", label: "" });
    if (!b.title.trim()) { b.title = q; TB.renderHeader(); if (TB.host && TB.host.title) TB.host.title(q); }
    return n;
  }

  // deckId を省くと: 空いた枠があればそれを埋める。なければ盤面のデッキ（なければ発想カード）を1枚
  TB.doDraw = async (deckId, o) => {
    o = o || {};
    if (!deckId && !TB.B().nodes.some((n) => n.t === "card" && !n.item)) return TB.drawLast();
    if ((deckId === "tarot" || deckId === "iching") && !o.asked) {
      const a = await TB.askQuestion(deckId === "tarot" ? "タロットを 1 枚引きます" : "易の卦を立てます（コインを 6 回 → 本卦と之卦）");
      if (!a) return; o = { ...o, asked: true, q: a.q };
      if (a.q) { TB.snap(); const qn = questionNode(a.q); TB.save(); TB.renderBoard(); if (qn) TB.sel = [qn.id]; }
    }
    const b = TB.B(), st = TB.store.settings;
    const empties = b.nodes.filter((n) => n.t === "card" && !n.item && (!deckId || n.deck === deckId));
    if (!deckId) deckId = empties.length ? empties[0].deck : b.layout ? TB.LAYOUTS[b.layout].deck : "prompt";
    const targets = empties.filter((n) => n.deck === deckId);
    let samples = null;
    if (st.method === "mouse") { samples = await mixByMouse(); if (!samples) return; }
    const text = st.seedText.trim() || defaultSeed();
    const par = anchor();
    let placed = [];
    if (deckId === "iching") {
      const { rnd, seed } = await window.Rng.makeRnd({ method: st.method, text, samples });
      const c = window.IChing.cast(rnd);
      TB.snap();
      let base = targets.find((n) => n.slot === "base") || targets[0], after = targets.find((n) => n.slot === "after");
      if (!base) { base = placeCard("iching", par); base.label = "本卦（今）"; base.hint = "コインで立てた卦。今の状況・出発点"; }
      base.item = c.base.id; base.moving = c.moving; base.after = c.after ? c.after.id : null; placed.push(base);
      if (c.after) {
        if (!after) { after = placeCard("iching", base); after.label = "之卦（行き先）"; after.hint = "変わる爻が動いた先。これから向かう方向"; const l = b.links.find((x) => x.b === after.id); if (l) { l.kind = "arrow"; l.label = "変わる爻 " + c.moving.length + "本"; } }
        after.item = c.after.id; after.moving = null; placed.push(after);
      } else if (after) after.hint = "変わる爻がないので之卦はなし（本卦だけを読む）";
      b.draws.push({ at: Date.now(), deck: "iching", method: st.method, seed, n: 1, q: o.q || "" });
      TB.toast(c.moving.length ? `第${c.base.num}卦 ${c.base.name} → 第${c.after.num}卦 ${c.after.name}（変わる爻 ${c.moving.length}本）` : `第${c.base.num}卦 ${c.base.name}（変わる爻なし）`);
    } else {
      const D = TB.DECKS[deckId];
      let pool = D.all();
      if (deckId === "tarot") pool = pool.filter((c) => st.pool === "all" || (st.pool === "major" ? c.major : !c.major));
      if (deckId === "prompt") pool = pool.filter((c) => (o.sets || st.promptSets).includes(c.set));
      const used = new Set(b.nodes.filter((n) => n.deck === deckId && n.item).map((n) => n.item));
      const ids = pool.map((c) => c.id).filter((id) => !used.has(id));
      const count = targets.length || 1;
      if (ids.length < count) { TB.toast("山札が足りません"); return; }
      const res = await window.Rng.draw({ ids, count, method: st.method, text, samples, shuffle: deckId === "tarot" ? st.shuffle : "fy", riffles: st.riffles, revOn: deckId === "tarot" && st.revOn, revProb: st.revProb });
      TB.snap();
      const into = targets.length ? targets : [placeCard(deckId, par)];
      into.forEach((n, i) => { n.item = res.picks[i].id; n.rev = res.picks[i].rev; placed.push(n); });
      b.draws.push({ at: Date.now(), deck: deckId, method: st.method, seed: res.seed, shuffle: st.shuffle, riffles: st.riffles, revOn: st.revOn, revProb: st.revProb, pool: st.pool, n: count });
    }
    // 山札から配る動き
    const dk = $("#board").getBoundingClientRect(), from = TB.toWorld(dk.left + dk.width / 2, dk.top - 40);
    placed.forEach((n, i) => TB.dealing.set(n.id, { i, dx: from.x - n.x, dy: from.y - n.y }));
    TB.save(); TB.renderBoard(); if (TB.view.auto) TB.fit();
    setTimeout(() => TB.dealing.clear(), 200);
    if (placed.length === 1) { TB.select(placed[0].id); TB.reveal(placed[0]); } else TB.renderDrawer({ quiet: true });
    if (!targets.length) remember(o.last || deckId);
  };

  // ---- 型で一度に並べる: タロットのスプレッド（位置の名前と意味つき）。今ある中身の右に置き、枠で囲む ----
  TB.drawSpread = async (lid, o) => {
    o = o || {};
    if (!o.asked) { const a = await TB.askQuestion(`${TB.LAYOUTS[lid].name}（${TB.LAYOUTS[lid].pos.length} 枚）で引きます`); if (!a) return; o.q = a.q; }
    const L = TB.LAYOUTS[lid], b = TB.B(), st = TB.store.settings, D = TB.DECKS[L.deck];
    const hasAny = b.nodes.length || b.items.length || b.frames.length, bb = hasAny ? TB.bounds() : null;
    const xs = L.pos.map((p) => p.x), ys = L.pos.map((p) => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const ox = bb ? bb.x1 + 140 + D.w / 2 - x0 : -x0, oy = bb ? Math.round((bb.y0 + bb.y1) / 2 - (y0 + y1) / 2) : -Math.round((y0 + y1) / 2);
    let samples = null;
    if (st.method === "mouse") { samples = await mixByMouse(); if (!samples) return; }
    const pool = D.all().filter((c) => st.pool === "all" || (st.pool === "major" ? c.major : !c.major)).map((c) => c.id);
    const res = await window.Rng.draw({ ids: pool, count: L.pos.length, method: st.method, text: st.seedText.trim() || defaultSeed(), samples, shuffle: st.shuffle, riffles: st.riffles, revOn: st.revOn, revProb: st.revProb });
    TB.snap();
    const placed = L.pos.map((p, i) => { const n = TB.cardNode(L.deck, { x: Math.round(p.x + ox), y: Math.round(p.y + oy), label: p.name, hint: p.hint, item: res.picks[i].id, rev: res.picks[i].rev }); b.nodes.push(n); return n; });
    const fx0 = Math.min(...placed.map((n) => n.x)) - 110, fy0 = Math.min(...placed.map((n) => n.y)) - D.h / 2 - 50, fx1 = Math.max(...placed.map((n) => n.x)) + 110, fy1 = Math.max(...placed.map((n) => n.y)) + D.h / 2 + 90;
    b.frames.push({ id: TB.uid(), x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0, title: o.q ? `${o.q}（${L.name}）` : L.name, color: TB.FRAME_COLORS[0] });
    if (o.q && !b.title.trim()) { b.title = o.q; TB.renderHeader(); if (TB.host && TB.host.title) TB.host.title(o.q); }
    b.draws.push({ at: Date.now(), deck: "tarot", method: st.method, seed: res.seed, shuffle: st.shuffle, riffles: st.riffles, revOn: st.revOn, revProb: st.revProb, pool: st.pool, n: L.pos.length, spread: lid });
    deal(placed); remember("spread:" + lid);
  };
  // 発想カードの型を一度に並べる（5W1H・SCAMPER など）: 選んでいるもの（なければテーマ）のまわりに、全部つないで置く
  TB.drawPromptSet = (setId) => {
    const set = window.Prompts.SETS.find((x) => x.id === setId), b = TB.B(), par = anchor();
    TB.snap();
    const D = TB.DECKS.prompt, its = window.Prompts.ITEMS.filter((it) => it.set === setId);
    // 小さな表（3 列）にまとめて置く。選んでいるものの下。ほかと重なるなら下へずらす。何も選んでいなければ、盤面の右
    const cols = its.length <= 3 ? its.length : its.length === 4 ? 2 : 3, rows = Math.ceil(its.length / cols), gx = D.w + 14, gy = D.h + 16;
    const hasAny = b.nodes.length || b.items.length || b.frames.length, bb = hasAny ? TB.bounds() : null;
    const base = par ? { x: par.x, y: par.y + (TB.rectOf(par).h || 50) / 2 + 60 + D.h / 2 } : { x: bb ? bb.x1 + 80 + ((cols - 1) * gx + D.w) / 2 : 0, y: bb ? bb.y0 + D.h / 2 : 0 };
    const boxes = b.nodes.map(TB.boxOf), at = (y0) => its.map((_, i) => ({ x: Math.round(base.x - ((cols - 1) * gx) / 2 + (i % cols) * gx), y: Math.round(y0 + Math.floor(i / cols) * gy) }));
    let y0 = base.y; for (let t = 0; t < 30; t++, y0 += 40) if (!at(y0).some((p) => boxes.some((q) => TB.overlaps(q, { x: p.x, y: p.y, w: D.w, h: D.h }, 12)))) break;
    if (y0 > base.y + 30 * 40 - 40) y0 = base.y;
    const pos = at(y0);
    const placed = its.map((it, i) => {
      const n = TB.cardNode("prompt", { x: pos[i].x, y: pos[i].y }); b.nodes.push(n);
      n.item = it.id; n.hint = set.desc;
      return n;
    });
    // 線: 1 段目は選んだものから、2 段目からは、すぐ上のカードから（長い回り道の線にならないように）
    if (par) placed.forEach((n, i) => b.links.push({ id: TB.uid(), a: i < cols ? par.id : placed[i - cols].id, b: n.id, kind: "line", label: "" }));
    void rows;
    b.draws.push({ at: Date.now(), deck: "prompt", method: "set", seed: setId, n: placed.length });
    deal(placed); remember("pset:" + setId);
  };
  function deal(placed) {
    const dk = $("#board").getBoundingClientRect(), from = TB.toWorld(dk.left + dk.width / 2, dk.top - 40);
    placed.forEach((n, i) => TB.dealing.set(n.id, { i, dx: from.x - n.x, dy: from.y - n.y }));
    TB.save(); TB.sel = []; TB.renderAll(); TB.fit();
    setTimeout(() => TB.dealing.clear(), 200 + placed.length * 140);
  }
  // 最後に使った引き方を覚えて、「引く」（Ctrl+D）で同じものを
  const LAST = { tarot: "タロットを1枚", iching: "易（本卦と之卦）", prompt: "発想カードを1枚", random: "完全にランダムな発想カード" };
  const lastName = (k) => LAST[k] || (k.startsWith("spread:") ? TB.LAYOUTS["tarot:" + k.slice(7)]?.name : k.startsWith("pset:") ? window.Prompts.SETS.find((x) => x.id === k.slice(5))?.name + "（全部並べる）" : "") || LAST.tarot;
  function remember(k) { TB.store.settings.lastDraw = k; TB.persist(); const bt = $("#btn-draw"); if (bt) bt.title = `引く（Ctrl+D）: ${lastName(k)}。▾ で種類を選ぶ`; }
  TB.drawLast = () => {
    const k = TB.store.settings.lastDraw || "tarot";
    if (k.startsWith("spread:")) return TB.drawSpread("tarot:" + k.slice(7));
    if (k.startsWith("pset:")) return TB.drawPromptSet(k.slice(5));
    if (k === "random") return TB.doDraw("prompt", { sets: window.Prompts.SETS.map((x) => x.id), last: k });
    return TB.doDraw(k);
  };
  TB.rememberDraw = remember; TB.lastDrawName = () => lastName(TB.store.settings.lastDraw || "tarot");

  function mixByMouse() {
    return new Promise((ok) => {
      const ov = $("#mix"), bar = ov.querySelector(".mix-bar i"), imgs = [...ov.querySelectorAll(".mix-deck img")], samples = [], N = 240;
      let lastX = null; bar.style.width = "0";
      const mv = (e) => {
        samples.push(`${e.clientX},${e.clientY},${Math.round(performance.now() * 1000)}`);
        bar.style.width = Math.min(100, (samples.length / N) * 100) + "%";
        if (lastX != null) { const dx = Math.max(-30, Math.min(30, e.clientX - lastX)); imgs.forEach((im, i) => { im.style.transform = `translateX(${dx * (i - 1) * 1.6}px) rotate(${dx * (i - 1) * 0.5}deg)`; }); }
        lastX = e.clientX;
        if (samples.length >= N) end(samples);
      };
      const key = (e) => { if (e.key === "Escape") { e.preventDefault(); end(null); } };
      function end(v) { ov.removeEventListener("pointermove", mv); document.removeEventListener("keydown", key, true); imgs.forEach((im) => (im.style.transform = "")); ov.hidden = true; ok(v); }
      ov.addEventListener("pointermove", mv); document.addEventListener("keydown", key, true);
      ov.querySelector(".cancel").onclick = () => end(null);
      ov.hidden = false;
    });
  }

  // ---- 引くメニュー（デッキを選ぶ・設定） ----
  const seg = (opts, val, on) => h("div", { class: "seg" }, opts.map(([v, t]) => h("button", { type: "button", class: v === val ? "on" : null, text: t, onclick: () => on(v) })));
  // 型の小さな図（カードの並びを縮めて描く）
  function mini(L) {
    const xs = L.pos.map((p) => p.x), ys = L.pos.map((p) => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = 72, H = 46, cw = 7, ch = 11, sx = (W - cw) / Math.max(1, x1 - x0), sy = (H - ch) / Math.max(1, y1 - y0), k = Math.min(sx, sy, 0.09);
    const ox = (W - (x1 - x0) * k - cw) / 2, oy = (H - (y1 - y0) * k - ch) / 2;
    return h("svg", { class: "dm-mini", viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true" },
      L.pos.map((p) => h("rect", { x: (ox + (p.x - x0) * k).toFixed(1), y: (oy + (p.y - y0) * k).toFixed(1), width: cw, height: ch, rx: 1.5 })));
  }
  TB.openDrawMenu = () => {
    const st = TB.store.settings, pop = $("#drawopt"), tab = st.drawTab || "tarot";
    const set = (k, v, re) => { st[k] = v; TB.persistSoon(); TB.renderHeader(); if (re) TB.openDrawMenu(); };
    const range = (k, min, max, unit) => h("input", { type: "range", min, max, value: st[k], oninput: (e) => { set(k, +e.target.value); e.target.nextSibling.textContent = e.target.value + unit; } });
    const sel = (k, opts, re) => h("select", { onchange: (e) => set(k, e.target.value, re) }, opts.map(([v, t]) => h("option", { value: v, selected: st[k] === v, text: t })));
    const field = (label, ...kids) => h("label", { class: "dm-field" }, h("span", { text: label }), ...kids);
    const run = (f) => () => { TB.closeFloats(); f(); };
    const tile = (o) => h("button", { type: "button", class: "dm-tile" + (o.big ? " big" : ""), onclick: run(o.f), title: o.title || "" },
      o.pic || null, h("span", { class: "dm-tx" }, h("b", { text: o.name }), o.sub ? h("small", { text: o.sub }) : null), o.n ? h("i", { class: "dm-n", text: o.n }) : null);
    const tabs = [["tarot", "タロット"], ["iching", "易"], ["prompt", "発想カード"], ["set", "設定"]];
    const head = h("div", { class: "dm-tabs", role: "tablist" }, tabs.map(([k, t]) => h("button", { type: "button", role: "tab", "aria-selected": String(k === tab), class: k === tab ? "on" : null, text: t, onclick: () => set("drawTab", k, true) })));
    let body;
    if (tab === "tarot") {
      const groups = [["1〜3 枚", ["three", "three-sit", "three-rel", "three-mbs"]], ["4〜7 枚", ["diamond", "five", "choice", "hexagram", "horseshoe"]], ["たくさん", ["celtic", "tree", "year", "horoscope"]]];
      body = [tile({ big: true, name: "1 枚引く", sub: "まず問いを書いて、1 枚。選んでいるものがあれば、それにつなぐ", pic: h("span", { class: "dm-card1" }), f: () => TB.doDraw("tarot") }),
        ...groups.map(([g, ids]) => [h("div", { class: "dm-h", text: g }), h("div", { class: "dm-grid" }, ids.filter((id) => TB.LAYOUTS["tarot:" + id]).map((id) => { const L = TB.LAYOUTS["tarot:" + id]; return tile({ name: L.name, sub: L.pos.map((p) => p.name).join("・"), pic: mini(L), n: L.pos.length + "枚", f: () => TB.drawSpread("tarot:" + id) }); }))])];
    } else if (tab === "iching") {
      body = [tile({ big: true, name: "卦を立てる", sub: "まず問いを書く → コインを 6 回 → 本卦（今）と之卦（行き先）を並べる", pic: TB.hexSvg([1, 0, 1, 1, 0, 1], [2]), f: () => TB.doDraw("iching") }),
        h("ol", { class: "dm-steps" }, h("li", {}, h("b", { text: "本卦" }), " 今の状況・出発点"), h("li", {}, h("b", { text: "変わる爻" }), " 赤い印。状況が動いているところ"), h("li", {}, h("b", { text: "之卦" }), " 変わった先。これから向かう方向"))];
    } else if (tab === "prompt") {
      const pset = ["w5h1", "next", "roles", "scamper", "hats"];
      const anc = anchor();
      body = [h("div", { class: "dm-grid" },
          tile({ name: "1 枚", sub: "実用の種類から（設定で選べる）", pic: h("span", { class: "dm-card1 p" }), f: () => TB.doDraw("prompt") }),
          tile({ name: "完全にランダム", sub: "全部の種類から（ランダムな言葉も）", pic: h("span", { class: "dm-card1 r" }), f: () => TB.doDraw("prompt", { sets: window.Prompts.SETS.map((x) => x.id), last: "random" }) })),
        h("div", { class: "dm-h", text: anc ? `全部並べる（「${(anc.t === "idea" ? anc.text : TB.slotName(anc)).slice(0, 14)}」のまわりに）` : "全部並べる（文字を選んでおくと、そのまわりに）" }),
        h("div", { class: "dm-grid" }, pset.map((id) => { const se = window.Prompts.SETS.find((x) => x.id === id); if (!se) return null; const its = window.Prompts.ITEMS.filter((it) => it.set === id);
          return tile({ name: se.name, sub: its.map((it) => it.name).join("・"), n: its.length + "枚", pic: h("span", { class: "dm-sw", style: `--pc:${its[0] ? its[0].color : "#8b909c"}` }), f: () => TB.drawPromptSet(id) }); }).filter(Boolean))];
    } else {
      body = [
        h("label", { class: "dm-check" }, h("span", { text: "逆位置を出す（タロット）" }), h("input", { type: "checkbox", checked: st.revOn, onchange: (e) => set("revOn", e.target.checked, true) })),
        st.revOn ? h("div", { class: "row" }, h("span", { class: "muted", text: "出やすさ" }), range("revProb", 1, 99, "%"), h("span", { class: "muted", text: st.revProb + "%", style: "min-width:34px;text-align:right" })) : null,
        field("使うカード（タロット）", sel("pool", [["all", "78枚すべて"], ["major", "大アルカナだけ"], ["minor", "小アルカナだけ"]])),
        field("混ぜ方（タロット）", sel("shuffle", [["fy", "完全に混ぜる"], ["riffle", "リフル＋カット（手で切る再現）"]], true)),
        st.shuffle === "riffle" ? h("div", { class: "row" }, h("span", { class: "muted", text: "リフルの回数" }), range("riffles", 1, 12, "回"), h("span", { class: "muted", text: st.riffles + "回", style: "min-width:34px;text-align:right" })) : null,
        field("乱数の元", sel("method", Object.entries(METHODS).map(([k, [t, d]]) => [k, `${t}（${d}）`]), true)),
        st.method === "word" ? h("input", { value: st.seedText, placeholder: "空なら: " + defaultSeed(), oninput: (e) => set("seedText", e.target.value) }) : null,
        h("div", { class: "dm-h", text: "発想カード「1 枚」で使う種類" }),
        h("div", { class: "checks" }, window.Prompts.SETS.map((x) => h("label", {}, h("input", { type: "checkbox", checked: st.promptSets.includes(x.id), onchange: (e) => set("promptSets", e.target.checked ? [...st.promptSets, x.id] : st.promptSets.filter((y) => y !== x.id)) }), x.name)))];
    }
    pop.replaceChildren(head, h("div", { class: "dm-body" }, ...body.flat().filter(Boolean)));
    pop.hidden = false;
    const b = $("#btn-drawmenu").getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(b.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + "px"; pop.style.top = b.bottom + 6 + "px";
  };

})();
