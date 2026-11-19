// ブレストのノート（盤面は tarot-brainstorm と同じ tb/index.html を枠の中に開く）: 作る入口・画面いっぱい・ひな形・木の形の文章・複数選択・ノートにする・(n) へのリンク・前の形 v2 の読み替え
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');
// http://localhost/… をアプリのフォルダのファイルとして読む（盤面の枠 tb/index.html とその JS・CSS）。ほかは空
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css' };
const files = requestInterceptor(req => { const u = new URL(req.url), f = path.join(__dirname, '..', decodeURIComponent(u.pathname)), ext = (f.match(/\.(\w+)$/) || [])[1]; const ok = u.host === 'localhost' && TYPES[ext] && fs.existsSync(f); return new Response(ok ? fs.readFileSync(f) : '', { status: 200, headers: { 'Content-Type': TYPES[ext] || 'text/plain' } }); });
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/<script src="dist\/app.js"><\/script>/, '');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

async function app(setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1', created: '2026-11-10 09:00:00', title: 'ふつう', body: 'a' });
  if (setup) setup(store);
  const vc = new VirtualConsole(); if (process.env.BS_DEBUG) vc.on('jsdomError', e => console.log('JSDOM', e.message)); const dom = new JSDOM(html, { url: 'http://localhost/index.html', runScripts: 'dangerously', resources: { interceptors: [files] }, pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {}; w.Element.prototype.setPointerCapture = () => {}; if (!w.crypto || !w.crypto.getRandomValues) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(300);
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  const ptr = (type, el, x, y, o = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: o.button || 0, ctrlKey: !!o.ctrl }));
  const key = (el, k, o = {}) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, code: o.code, bubbles: true, cancelable: true, ctrlKey: !!o.ctrl }));
  const write = async (text, k = 'Enter') => { const inp = $('#bboard .bb-input'); assert.ok(inp, '入力欄がある'); inp.value = text; key(inp, k); await tick(80); };
  const menu = async label => { const m = $$('.popmenu div').find(d => d.textContent.includes(label)); assert.ok(m, 'メニュー: ' + label); m.click(); await tick(300); };
  const open = async (s, id) => { const e = w.document.createElement('span'); e.className = 'chip'; e.dataset.s = s; e.dataset.id = id; w.document.body.append(e); e.click(); e.remove(); await tick(300); };
  const bs = () => store.state().notes.filter(n => n.kind === 'brainstorm');
  // 盤面の枠（tb/index.html）が読み込まれるまで待つ
  const tb = async () => { for (let i = 0; i < 200; i++) { const f = w.document.querySelector('#tbframe'), T = f && f.contentWindow && f.contentWindow.TB; if (T && T.host && T.B) { const fw = f.contentWindow; if (!fw.crypto || !fw.crypto.subtle) Object.defineProperty(fw, 'crypto', { value: require('crypto').webcrypto, configurable: true }); if (!fw.TextEncoder) fw.TextEncoder = TextEncoder; return T; } await tick(25); } throw new Error('盤面が開かない'); };
  return { w, $, $$, store, dir, ptr, key, write, menu, open, bs, tb, close: () => w.close() };
}


test('➕ から「ブレスト」: 白紙の盤面が開く（ひな形の画面は出さない・左の一覧はそのまま）。書いて広げると、本文は木の形の文章', async () => {
  const a = await app();
  try {
    a.$('#new').click(); await a.menu('ブレスト');
    const T = await a.tb();
    assert.ok(a.$('#bstage #tbframe'), '盤面の枠');
    assert.ok(!a.$('main > aside').hidden, '左の一覧は、たたまない');
    assert.ok(!T.dialogOpen(), 'ひな形の画面は出さない'); assert.strictEqual(T.B().nodes.length, 0, '白紙');
    const fd = a.$('#tbframe').contentWindow.document; assert.ok(!fd.querySelector('#btn-new'), 'ひな形のボタンも無い');
    const c = T.newIdea(null); c.text = '来年'; const x = T.newIdea(c.id); x.text = '旅行'; const y = T.newIdea(x.id); y.text = '国内'; T.editing = null; T.save(); await tick(700);
    const n = a.bs()[0]; assert.ok(n, 'ブレストのノートができた');
    assert.strictEqual(n.data.v, 3);
    assert.match(n.body, /^- 来年\n {2}- 旅行\n {4}- 国内$/m, '本文は木の形の文章');
    const file = fs.readdirSync(a.dir).find(f => f.startsWith(n.stem)); const md = fs.readFileSync(path.join(a.dir, file), 'utf8');
    assert.match(md, /kind: "brainstorm"/); assert.match(md, /<!-- pkm-data \{.*"nodes":\[/);
    await a.open('d', '1');
    assert.ok(a.$('#ed'), 'ふつうのノート');
  } finally { a.close(); }
});

test('引く: タロットの型（ケルト十字など）を位置の名前と意味つきで一度に並べ、枠で囲む。易は本卦（今）と之卦（行き先）。発想カードの型を全部並べる。線に文字と種類', async () => {
  const data = { v: 3, title: '問い', nodes: [{ id: 'c', t: 'idea', x: 0, y: 0, text: '問い', center: true }], links: [], frames: [], items: [] };
  const a = await app(st => st.saveNote({ s: 'd', id: '6', created: '2026-11-12 09:00:00', title: '問い', body: '', kind: 'brainstorm', data }));
  try {
    await a.open('d', '6'); const T = await a.tb();
    assert.ok(Object.keys(T.LAYOUTS).filter(k => k.startsWith('tarot:')).length >= 14, '基本の型');
    const fd0 = a.$('#tbframe').contentWindow.document;
    const sp = T.drawSpread('tarot:celtic'); await tick(200);
    assert.ok(T.dialogOpen(), '占う前に、問いを書く画面'); const qi = fd0.querySelector('.dlg-box.ask .q-in'); qi.value = '仕事をどうするか';
    fd0.querySelector('.dlg-box.ask .q-bar .primary').click(); await sp; await tick(600);
    const cards = T.B().nodes.filter(n => n.deck === 'tarot');
    assert.strictEqual(cards.length, 10); assert.ok(cards.every(n => n.item && n.label && n.hint), '位置の名前と意味');
    assert.strictEqual(T.B().frames[0].title, '仕事をどうするか（ケルト十字（10枚））', '枠の名前に問い');
    T.select('c'); await T.doDraw('iching', { asked: true }); await tick(300);
    const ic = T.B().nodes.filter(n => n.deck === 'iching');
    assert.ok(ic[0].label.startsWith('本卦'));
    assert.match(T.ichingGuide(ic[0]).map(x => x.textContent).join(''), /今の状況.*変わるところ/);
    T.select('c'); T.drawPromptSet('w5h1'); await tick(300);
    assert.strictEqual(T.B().nodes.filter(n => n.deck === 'prompt').length, 6, '5W1H を全部');
    assert.ok(!T.store.settings.promptSets.includes('word'), '発想カードの既定は実用の種類だけ');
    const l = T.B().links.find(x => x.a === 'c'); T.openLinkPop(l.id, true);
    const fd = a.$('#tbframe').contentWindow.document;
    const inp = fd.querySelector('#pop input'); inp.value = 'きっかけ'; inp.dispatchEvent(new (a.$('#tbframe').contentWindow.Event)('input'));
    fd.querySelector('#pop .kind-btn[title^="矢印"]').click(); await tick(600);
    const saved = a.bs()[0].data.links.find(x => x.id === l.id);
    assert.deepStrictEqual([saved.label, saved.kind], ['きっかけ', 'arrow']);
    assert.ok(fd.querySelector(`.link[data-link="${l.id}"] .link-head`), '矢印の先');
    const k = cards[0]; T.select(k.id); const ta = [...fd.querySelectorAll('#drawer textarea')][0]; ta.value = '今は待つ'; ta.dispatchEvent(new (a.$('#tbframe').contentWindow.Event)('input')); await tick(600);
    assert.strictEqual(fd.querySelector(`.node[data-id="${k.id}"] .reading`).textContent, '今は待つ', '書いた読みが盤面に出る');
    assert.match(a.bs()[0].body, /今は待つ/);
    const md = fs.readFileSync(path.join(a.dir, fs.readdirSync(a.dir).find(f => f.startsWith(a.bs()[0].stem))), 'utf8');
    assert.ok(!/\.jpg/.test(md), 'vault に画像のファイル名を書かない');
  } finally { a.close(); }
});

test('複数選択: Ctrl+A で全部、Delete でまとめて消す（テーマは残す）。Ctrl+クリックで足す・外す。Ctrl+Z で戻る', async () => {
  const data = { v: 3, title: '盤', nodes: [{ id: 'c', t: 'idea', x: 0, y: 0, text: '盤', center: true }, { id: 'a', t: 'idea', x: 200, y: 0, text: 'A' }, { id: 'b', t: 'idea', x: 400, y: 0, text: 'B' }], links: [{ id: 'l', a: 'c', b: 'a', kind: 'line', label: '' }], frames: [], items: [{ id: 't', type: 'text', x: 0, y: 200, text: 'メモ' }, { id: 's', type: 'stroke', pts: [0, 300, 50, 320] }] };
  const a = await app(st => st.saveNote({ s: 'd', id: '2', created: '2026-11-12 09:00:00', title: '盤', body: '', kind: 'brainstorm', data }));
  try {
    await a.open('d', '2'); const T = await a.tb(), fw = a.$('#tbframe').contentWindow, d = fw.document;
    const ctrlClick = el => { el.dispatchEvent(new fw.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true, clientX: 1, clientY: 1 })); fw.dispatchEvent(new fw.MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 1, clientY: 1 })); };
    ctrlClick(d.querySelector('.node[data-id="a"]')); ctrlClick(d.querySelector('.node[data-id="b"]'));
    assert.deepStrictEqual([...T.sel], ['a', 'b'], 'Ctrl+クリックで足す');
    ctrlClick(d.querySelector('.node[data-id="a"]')); assert.deepStrictEqual([...T.sel], ['b'], 'もう一度で外す');
    d.dispatchEvent(new fw.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
    assert.strictEqual(T.sel.length, 5, 'Ctrl+A で全部（文字・ペンの線も）');
    d.body.dispatchEvent(new fw.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await tick(600);
    assert.deepStrictEqual([...T.B().nodes].map(n => n.id), ['c'], 'テーマだけ残る');
    assert.strictEqual(T.B().items.length, 0);
    assert.deepStrictEqual(a.bs()[0].data.nodes.map(n => n.id), ['c'], '保存された');
    d.dispatchEvent(new fw.KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true })); await tick(600);
    assert.strictEqual(T.B().nodes.length, 3, 'Ctrl+Z で戻る'); assert.strictEqual(a.bs()[0].data.items.length, 2);
  } finally { a.close(); }
});

test('右クリックの「ノートにする」で分岐のノートができ、アイデアに ->ID が付いてチップになる', async () => {
  const data = { v: 3, title: '考え', nodes: [{ id: 'c', t: 'idea', x: 0, y: 0, text: '中心', center: true }, { id: 'a', t: 'idea', x: 200, y: 0, text: 'よい案 (1)' }], links: [{ id: 'l', a: 'c', b: 'a', kind: 'line', label: '' }], frames: [], items: [] };
  const a = await app(st => st.saveNote({ s: 'd', id: '2', created: '2026-11-12 09:00:00', title: '考え', body: '', kind: 'brainstorm', data }));
  try {
    await a.open('d', '2'); const T = await a.tb(), d = a.$('#tbframe').contentWindow.document;
    assert.ok(d.querySelector('.node[data-id="a"] .bb-anc'), '(n) は目立たせる');
    T.nodeMenu('a', 10, 10);
    [...d.querySelectorAll('#menu button')].find(b => b.textContent.includes('ノートにする')).click(); await tick(600);
    const made = a.store.state().notes.find(n => n.id === '2a');
    assert.ok(made, '分岐の ID のノート'); assert.strictEqual(made.title, 'よい案 (1)');
    assert.strictEqual(a.bs()[0].data.nodes[1].text, 'よい案 (1) ->2a');
    assert.ok(d.querySelector('.node[data-id="a"] .chip[data-id="2a"]'), 'ID はチップ');
    assert.match(a.bs()[0].body, /- よい案 \(1\) ->2a/);
  } finally { a.close(); }
});

test('並列・分岐のボタンを右クリックして「ブレスト」。空のノートは 🧠 でブレストにできる', async () => {
  const a = await app();
  try {
    await a.open('d', '1');
    const sib = a.$('#pane [data-act="sib"]');
    sib.dispatchEvent(new a.w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await a.menu('並列のブレスト');
    assert.ok(a.bs().some(n => n.id === '2'), '並列の ID（2）のブレスト');
    await a.tb(); assert.ok(a.$('#tbframe'));
    a.key(a.w.document.body, 'n', { ctrl: true, code: 'KeyN' }); await tick(400);
    const btn = a.$('#to-bs'); assert.ok(btn, '空のノートに 🧠'); btn.click(); await tick(400);
    assert.strictEqual(a.bs().length, 2); await a.tb();
  } finally { a.close(); }
});

test('前の形（v2）を読み替える: カードはカードに、(n) へのリンクで開くとそのアイデアを選ぶ', async () => {
  const data = { v: 2, t: [[40, 40, 'あ (1)'], [40, 400, 'い (2)'], [300, 40, '過去：塔（逆位置）', 'tarot:m16:r']], l: [[0, 1]], s: [[0, 0, 10, 10]] };
  const a = await app(st => st.saveNote({ s: 'd', id: '3', created: '2026-11-12 09:00:00', title: '盤', body: '', kind: 'brainstorm', data }));
  try {
    const e = a.w.document.createElement('span'); e.className = 'chip'; e.dataset.s = 'd'; e.dataset.id = '3'; e.dataset.n = '2'; a.w.document.body.append(e); e.click(); e.remove();
    const T = await a.tb(); await tick(100);
    const card = T.B().nodes.find(n => n.t === 'card');
    assert.deepStrictEqual([card.deck, card.item, card.rev, card.label].map(x => x), ['tarot', 'm16', true, '過去']);
    assert.strictEqual(T.B().links.length, 1); assert.strictEqual(T.B().items.length, 1);
    assert.deepStrictEqual([...T.sel].map(id => T.node(id).text), ['い (2)'], '(2) のアイデアを選ぶ');
    assert.match(T.tipBody(card.id).map(x => x && x.textContent).join(' '), /塔/, 'カードの上に、カードの意味');
    await a.open('d', '1');
    a.$('#nav-back').click(); await tick(300);
    await a.tb(); assert.ok(a.$('#tbframe'), '戻るとブレスト');
  } finally { a.close(); }
});

test('ノートの中の小さなボード: v1 を読み、文字同士をつなぐと v2 で書く', async () => {
  const a = await app(st => st.saveNote({ s: 'd', id: '5', created: '2026-11-12 09:00:00', title: '中', body: 'はじめ\n```board\n{"h":300,"t":[[10,10,"x"],[100,10,"y"],[200,10,"z"]],"s":[]}\n```\nおわり' }));
  try {
    await a.open('d', '5'); await tick(200);
    const ts = () => a.$$('.bd .bd-t');
    assert.strictEqual(ts().length, 3, 'v1 を読めた');
    const st = a.$('.bd .bd-stage'); st.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 300, width: 600, height: 300 });
    const ev = (type, x) => st.dispatchEvent(new a.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 15, button: 0 }));
    a.w.document.elementFromPoint = () => ts()[1]; ev('pointerdown', 105);
    a.w.document.elementFromPoint = () => ts()[2]; ev('pointermove', 205); ev('pointerup', 205);
    await tick(600);
    const body = a.store.state().notes.find(n => n.id === '5').body;
    assert.match(body, /\{"v":2,"h":\d+,"t":\[\[10,10,"x"\],\[100,10,"y"\],\[200,10,"z"\]\],"l":\[\[1,2\]\],"s":\[\]\}/);
  } finally { a.close(); }
});


test('ふつうの文字: クリックで選ぶ（右の欄は選んだときだけ）・もう一度で書き直す・枠と色・グループ・選んだ文字のまわりに 5W1H', async () => {
  const data = { v: 3, title: '盤', nodes: [{ id: 'a', t: 'idea', x: 0, y: 0, text: 'A' }, { id: 'b', t: 'idea', x: 300, y: 0, text: 'B' }], links: [], frames: [], items: [] };
  const a = await app(st => st.saveNote({ s: 'd', id: '4', created: '2026-11-12 09:00:00', title: '盤', body: '', kind: 'brainstorm', data }));
  try {
    await a.open('d', '4'); const T = await a.tb(), fw = a.$('#tbframe').contentWindow, d = fw.document;
    assert.ok(d.querySelector('#drawer').hidden, '何も選んでいないときは、右の欄を出さない');
    const click = el => { el.dispatchEvent(new fw.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 1, clientY: 1 })); fw.dispatchEvent(new fw.MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 1, clientY: 1 })); };
    click(d.querySelector('.node[data-id="a"]')); await tick(100);
    assert.deepStrictEqual([...T.sel], ['a'], 'クリックで選ぶ'); assert.ok(!T.editing, 'まだ書き直さない'); assert.ok(!d.querySelector('#drawer').hidden, '選ぶと右の欄');
    T.styleSel('box', 'line'); T.styleSel('color', '#c0392b'); await tick(100);
    assert.ok(d.querySelector('.node[data-id="a"]').classList.contains('box-line'), '枠'); assert.strictEqual(T.node('a').color, '#c0392b', '色');
    T.drawPromptSet('w5h1'); await tick(300);
    assert.strictEqual(T.B().links.filter(l => l.a === 'a').length, 6, '選んだ文字のまわりに 5W1H をつないで置く');
    T.select(['a', 'b']); T.groupSel(); await tick(100);
    assert.strictEqual(T.B().frames.length, 1, 'グループ（枠）'); const f = T.B().frames[0]; assert.ok(f.x < 0 && f.x + f.w > 300, '選んだものを囲む');
    d.querySelector('.frame .frame-title').dispatchEvent(new fw.Event('blur')); await tick(50);
    T.select('a'); click(d.querySelector('.node[data-id="a"]')); await tick(50);
    assert.strictEqual(T.editing, 'a', '選んでいる文字をもう一度押すと書き直す');
    d.querySelector('.node[data-id="a"] .txt').dispatchEvent(new fw.Event('blur')); await tick(50);
    T.select([]); await tick(50); assert.ok(d.querySelector('#drawer').hidden, '選択を外すと、右の欄はしまう ' + JSON.stringify([T.sel, T.editing, T.drawerPinned, T.selLink]));
  } finally { a.close(); }
});
