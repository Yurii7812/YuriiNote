// ブレストのノート: 作る入口・画面いっぱいの盤面・書く（Enter・Tab）・木の形の文章・ノードをノートにする・(n) へのリンク
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

async function app(setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1', created: '2026-11-10 09:00:00', title: 'ふつう', body: 'a' });
  if (setup) setup(store);
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {}; w.Element.prototype.setPointerCapture = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(300);
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  const ptr = (type, el, x, y, o = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: o.button || 0, ctrlKey: !!o.ctrl }));
  const key = (el, k, o = {}) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, code: o.code, bubbles: true, cancelable: true, ctrlKey: !!o.ctrl }));
  const write = async (text, k = 'Enter') => { const inp = $('#bboard .bb-input'); assert.ok(inp, '入力欄がある'); inp.value = text; key(inp, k); await tick(80); };
  const menu = async label => { const m = $$('.popmenu div').find(d => d.textContent.includes(label)); assert.ok(m, 'メニュー: ' + label); m.click(); await tick(300); };
  const open = async (s, id) => { const e = w.document.createElement('span'); e.className = 'chip'; e.dataset.s = s; e.dataset.id = id; w.document.body.append(e); e.click(); e.remove(); await tick(300); };
  const bs = () => store.state().notes.filter(n => n.kind === 'brainstorm');
  return { w, $, $$, store, dir, ptr, key, write, menu, open, bs, close: () => w.close() };
}

test('➕ から「ブレスト」: 何もない盤面が画面いっぱいに開き、すぐ書ける。Enter で下に次、Tab で右に広げてつなぐ', async () => {
  const a = await app();
  try {
    a.$('#new').click(); await a.menu('ブレスト');
    assert.ok(a.$('#bboard.bb'), '盤面');
    assert.ok(a.$('main > aside').hidden, '左の一覧は、自動でたたむ');
    await a.write('テーマ');
    await a.write('案', 'Tab');
    await a.write('細かい', 'Escape');
    await tick(700);
    const n = a.bs()[0]; assert.ok(n, 'ブレストのノートができた');
    assert.deepStrictEqual(n.data.t.map(x => x[2]), ['テーマ', '案', '細かい']);
    assert.deepStrictEqual(n.data.l, [[1, 2]], 'Tab で広げたノードだけ、つなぐ');
    assert.match(n.body, /^- 案\n {2}- 細かい$/m, '本文は木の形の文章');
    assert.match(n.body, /^- テーマ$/m);
    const file = fs.readdirSync(a.dir).find(f => f.startsWith(n.stem)); const md = fs.readFileSync(path.join(a.dir, file), 'utf8');
    assert.match(md, /kind: "brainstorm"/); assert.match(md, /<!-- pkm-data \{.*"v":2/); assert.match(md, /- テーマ/);
    await a.open('d', '1');
    assert.ok(!a.$('main > aside').hidden, 'ほかのノートへ移ると、一覧が戻る');
    assert.ok(a.$('#ed'), 'ふつうのノート');
  } finally { a.close(); }
});

test('ノードをクリックして直す。右クリックの「ノートにする」で分岐のノートができ、ノードに ->ID が付く', async () => {
  const a = await app(st => st.saveNote({ s: 'd', id: '2', created: '2026-11-12 09:00:00', title: '考え', body: '', kind: 'brainstorm', data: { v: 2, t: [[40, 40, '中心'], [240, 40, 'よい案 (1)']], l: [[0, 1]], s: [] } }));
  try {
    await a.open('d', '2');
    const node = a.$$('#bboard .bb-node').find(e => e.textContent.startsWith('よい案'));
    assert.ok(node.querySelector('.bb-anc'), '(n) は小さく');
    a.ptr('pointerdown', node, 10, 10, { button: 2 }); a.ptr('pointerup', node, 10, 10, { button: 2 });
    await a.menu('ノートにする'); await tick(500);
    const made = a.store.state().notes.find(n => n.id === '2a');
    assert.ok(made, '分岐の ID のノート'); assert.strictEqual(made.title, 'よい案 (1)');
    const b = a.bs()[0]; assert.strictEqual(b.data.t[1][2], 'よい案 (1) ->2a');
    assert.ok(a.$('#bboard .bb-node .chip[data-id="2a"]'), 'ID はチップ');
    // ノードを直す
    const c = a.$$('#bboard .bb-node').find(e => e.textContent === '中心');
    a.ptr('pointerdown', c, 5, 5); a.ptr('pointerup', c, 5, 5); await tick(50);
    assert.strictEqual(a.$('#bboard .bb-input').value, '中心');
    await a.write('まんなか', 'Escape'); await tick(600);
    assert.strictEqual(a.bs()[0].data.t[0][2], 'まんなか');
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
    assert.ok(a.$('#bboard'));
    // Ctrl+N で作った空のノート → 🧠
    a.key(a.w.document.body, 'n', { ctrl: true, code: 'KeyN' }); await tick(400);
    const btn = a.$('#to-bs'); assert.ok(btn, '空のノートに 🧠'); btn.click(); await tick(400);
    assert.strictEqual(a.bs().length, 2); assert.ok(a.$('#bboard'));
  } finally { a.close(); }
});

test('(n) へのリンクで開くと、そのノードを示す。戻ると、ふつうのノートと同じに戻る', async () => {
  const a = await app(st => st.saveNote({ s: 'd', id: '3', created: '2026-11-12 09:00:00', title: '盤', body: '', kind: 'brainstorm', data: { v: 2, t: [[40, 40, 'あ (1)'], [40, 400, 'い (2)']], l: [], s: [] } }));
  try {
    const e = a.w.document.createElement('span'); e.className = 'chip'; e.dataset.s = 'd'; e.dataset.id = '3'; e.dataset.n = '2'; a.w.document.body.append(e); e.click(); e.remove(); await tick(400);
    const f = a.$('#bboard .bb-node.bb-focus'); assert.ok(f && f.textContent.startsWith('い'), '(2) のノード');
    await a.open('d', '1');
    a.$('#nav-back').click(); await tick(300);
    assert.ok(a.$('#bboard'), '戻るとブレスト');
    assert.ok(a.$('main > aside').hidden);
  } finally { a.close(); }
});

test('ノードから別のノードへドラッグでつなぐ（もう一度で外す）。右ドラッグで動かす', async () => {
  const a = await app(st => st.saveNote({ s: 'd', id: '4', created: '2026-11-12 09:00:00', title: '線', body: '', kind: 'brainstorm', data: { v: 2, t: [[40, 40, 'A'], [300, 40, 'B']], l: [], s: [] } }));
  try {
    await a.open('d', '4');
    const node = i => a.$$('#bboard .bb-node')[i];
    const B = node(1); a.w.document.elementFromPoint = () => B;
    a.ptr('pointerdown', node(0), 10, 10); a.ptr('pointermove', node(0), 200, 10); a.ptr('pointerup', node(0), 200, 10); await tick(600);
    assert.deepStrictEqual(a.bs()[0].data.l, [[0, 1]]);
    assert.match(a.bs()[0].body, /- A\n {2}- B/);
    const B2 = node(1); a.w.document.elementFromPoint = () => B2;
    a.ptr('pointerdown', node(0), 10, 10); a.ptr('pointermove', node(0), 200, 10); a.ptr('pointerup', node(0), 200, 10); await tick(600);
    assert.deepStrictEqual(a.bs()[0].data.l, [], 'もう一度で外す');
    a.ptr('pointerdown', node(0), 10, 10, { button: 2 }); a.ptr('pointermove', node(0), 60, 90, { button: 2 }); a.ptr('pointerup', node(0), 60, 90, { button: 2 }); await tick(600);
    assert.deepStrictEqual(a.bs()[0].data.t[0].slice(0, 2), [90, 120], '右ドラッグで動いた');
    assert.ok(!a.$('.popmenu'), '動かしたときはメニューを出さない');
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
