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
  const tb = async () => { for (let i = 0; i < 200; i++) { const f = w.document.querySelector('#tbframe'), T = f && f.contentWindow && f.contentWindow.TB; if (T && T.host && T.B) return T; await tick(25); } throw new Error('盤面が開かない'); };
  return { w, $, $$, store, dir, ptr, key, write, menu, open, bs, tb, close: () => w.close() };
}


test('➕ から「ブレスト」: 盤面が画面いっぱいに開き、ひな形を選べる。中心テーマから書いて広げると、本文は木の形の文章', async () => {
  const a = await app();
  try {
    a.$('#new').click(); await a.menu('ブレスト');
    const T = await a.tb();
    assert.ok(a.$('#bstage #tbframe'), '盤面の枠');
    assert.ok(a.$('main > aside').hidden, '左の一覧は、自動でたたむ');
    assert.ok(T.dialogOpen(), '作ったばかりは、ひな形を選ぶ画面');
    const d = T.host && a.$('#tbframe').contentWindow.document;
    const title = d.querySelector('#dlg input.big'); title.value = '来年';
    [...d.querySelectorAll('#dlg .tpl')].find(b => b.textContent.includes('中心テーマから')).click(); await tick(100);
    assert.ok(!T.dialogOpen());
    const c = T.B().nodes.find(n => n.center); assert.strictEqual(c.text, '来年');
    const x = T.newIdea(c.id); x.text = '旅行'; const y = T.newIdea(x.id); y.text = '国内'; T.editing = null; T.save(); await tick(700);
    const n = a.bs()[0]; assert.ok(n, 'ブレストのノートができた');
    assert.strictEqual(n.data.v, 3); assert.strictEqual(n.title, '来年');
    assert.match(n.body, /^- 来年\n {2}- 旅行\n {4}- 国内$/m, '本文は木の形の文章');
    const file = fs.readdirSync(a.dir).find(f => f.startsWith(n.stem)); const md = fs.readFileSync(path.join(a.dir, file), 'utf8');
    assert.match(md, /kind: "brainstorm"/); assert.match(md, /<!-- pkm-data \{.*"nodes":\[/);
    await a.open('d', '1');
    assert.ok(!a.$('main > aside').hidden, 'ほかのノートへ移ると、一覧が戻る');
    assert.ok(a.$('#ed'), 'ふつうのノート');
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
    await a.tb(); assert.ok(a.$('main > aside').hidden, '戻るとブレスト');
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

