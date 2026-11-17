// グローバルIndex: 紙とデジタルの切り替え（すべて / デジタル / 紙）。「全体を紙だけにする」を外した代わり。Index の中だけ
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

async function app(prefs = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-17 09:00:00', keywords: ['デジタルだけ', '両方'], body: 'デジタル' });
  store.saveNote({ s: 'p', id: '1', created: '2026-11-17 09:00:00', keywords: ['紙だけ', '両方'], body: '紙' });
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) { for (const [k, v] of Object.entries(prefs)) w.localStorage.setItem(k, v); } });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(300);
  w.document.querySelector('#tabs [data-tab="i"], #rail [data-tab="i"], [data-tab="i"]').click(); await tick(300);
  const rows = () => [...w.document.querySelectorAll('#list .ix')].map(e => e.dataset.ixk).sort();
  const click = side => { w.document.querySelector(`#list [data-ixs="${side}"]`).click(); return tick(150); };
  return { w, rows, click, store, close: () => w.close() };
}

test('グローバルIndexに、紙とデジタルの切り替えがある（すべて・デジタル・紙）', async () => {
  const a = await app();
  try {
    assert.ok(a.w.document.querySelector('#list .ixside'), '切り替えが出る');
    assert.deepStrictEqual(a.rows(), ['デジタルだけ', '両方', '紙だけ'], '最初は、すべて');
    await a.click('d'); assert.deepStrictEqual(a.rows(), ['デジタルだけ', '両方'], 'デジタルだけ: 紙のIDしか無いキーワードは出ない');
    assert.ok(![...a.w.document.querySelectorAll('#list .ix .chip.p')].length, 'デジタルだけのとき、紙のIDのチップは出ない');
    await a.click('p'); assert.deepStrictEqual(a.rows(), ['両方', '紙だけ'], '紙だけ');
    assert.ok(![...a.w.document.querySelectorAll('#list .ix .chip.d')].length, '紙だけのとき、デジタルのIDのチップは出ない');
    assert.strictEqual(a.w.localStorage.getItem('yn-ixside'), 'p', '選んだ側を覚える');
    await a.click('all'); assert.deepStrictEqual(a.rows(), ['デジタルだけ', '両方', '紙だけ']);
  } finally { a.close(); }
});

test('グローバルIndex: 前回選んだ側で開く。紙のときの「＋」は、紙のキーワードを作る', async () => {
  const a = await app({ 'yn-ixside': 'p' });
  try {
    assert.deepStrictEqual(a.rows(), ['両方', '紙だけ'], '前回の「紙」で開く');
    assert.ok(a.w.document.querySelector('#list [data-ixs="p"].on'), '紙が選ばれている');
    a.w.document.querySelector('#ix-add').click(); await tick(150);
    assert.match(a.w.document.body.textContent, /紙のキーワードを作る/, '紙のキーワードを作る画面');
    assert.doesNotMatch(a.w.document.body.textContent, /デジタルのキーワードを作る/);
  } finally { a.close(); }
});

test('トピックIndexは、ノート一覧（紙・デジタルのタブ）の 📑＋ から作る。グローバルIndexの「＋」からではない', async () => {
  const a = await app({ 'yn-ixside': 'p' });
  try {
    assert.ok(a.w.document.querySelector('#ti-add').hidden, 'グローバルIndexの画面には、出ない');
    a.w.document.querySelector('#ix-add').click(); await tick(150);
    assert.ok(!a.w.document.querySelector('#ni-topic'), 'Index の「＋」の画面に、トピックIndexの切り替えは無い');
    a.w.document.querySelector('#modal').style.display = 'none';
  } finally { a.close(); }
});

test('紙のタブの 📑＋: 番号を指定して作れる。その番号のノートが無くても作れる（ノートは作らない）', async () => {
  const a = await app();
  try {
    a.w.document.querySelector('#tabs [data-tab="p"]').click(); await tick(200);
    const btn = a.w.document.querySelector('#ti-add'); assert.ok(!btn.hidden, '紙のタブに出る');
    btn.click(); await tick(200);
    assert.strictEqual(a.w.document.querySelector('#tn-s').value, 'p', '紙のタブなので、紙');
    a.w.document.querySelector('#tn-id').value = '9z'; a.w.document.querySelector('#tn-id').dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.match(a.w.document.querySelector('#tn-note').textContent, /ノートは、まだありません/);
    a.w.document.querySelector('#tn-ok').click(); await tick(400);
    const st = a.store.state();
    const t = st.topics.find(x => x.entry && x.entry.s === 'p' && x.entry.id === '9z');
    assert.ok(t, '紙の 9z の索引ができる');
    assert.ok(/^無名9z-/.test(t.name), '名前は、無名で作る: ' + t.name);
    assert.ok(!st.notes.some(n => n.id === '9z'), '番号のノートは、作らない');
  } finally { a.close(); }
});

test('デジタルのタブの 📑＋: ノートの無い番号でも作れる。未整理のタブには出ない', async () => {
  const a = await app();
  try {
    a.w.document.querySelector('#tabs [data-tab="d"]').click(); await tick(200);
    a.w.document.querySelector('#ti-add').click(); await tick(200);
    assert.strictEqual(a.w.document.querySelector('#tn-s').value, 'd');
    a.w.document.querySelector('#tn-id').value = '5c'; a.w.document.querySelector('#tn-id').dispatchEvent(new a.w.Event('input', { bubbles: true }));
    a.w.document.querySelector('#tn-ok').click(); await tick(400);
    const st = a.store.state();
    assert.ok(st.topics.some(x => x.entry && x.entry.s === 'd' && x.entry.id === '5c'));
    assert.ok(!st.notes.some(n => n.s === 'd' && n.id === '5c'), 'デジタルでも、ノートは作らない');
    a.w.document.querySelector('#tabs [data-tab="u"]').click(); await tick(200);
    assert.ok(a.w.document.querySelector('#ti-add').hidden, '未整理（IDなし）のタブには出ない');
  } finally { a.close(); }
});
