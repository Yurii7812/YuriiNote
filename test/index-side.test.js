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

const rightClick = (a, sel) => { const el = a.w.document.querySelector(sel); el.dispatchEvent(new a.w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 40 })); return tick(100); };

test('トピックIndexは、紙・デジタルのボタンの右クリックから作る。グローバルIndexの「＋」からではない', async () => {
  const a = await app({ 'yn-ixside': 'p' });
  try {
    a.w.document.querySelector('#ix-add').click(); await tick(150);
    assert.ok(!a.w.document.querySelector('#ni-topic'), 'Index の「＋」の画面に、トピックIndexの切り替えは無い');
    assert.ok(!a.w.document.querySelector('#ti-add'), '📑＋ のボタンは無い');
    a.w.document.querySelector('#modal').style.display = 'none';
    await rightClick(a, '#tabs [data-tab="u"]');
    assert.ok(!a.w.document.querySelector('.popmenu'), '未整理（IDなし）のボタンでは、出ない');
  } finally { a.close(); }
});

test('紙のボタンを右クリック: 番号を指定して作れる。その番号のノートが無くても作れる（ノートは作らない）', async () => {
  const a = await app();
  try {
    await rightClick(a, '#tabs [data-tab="p"]');
    const item = a.w.document.querySelector('.popmenu div'); assert.ok(item, '右クリックのメニューが出る');
    assert.match(item.textContent, /紙のトピックIndexを作る/);
    item.click(); await tick(200);
    assert.strictEqual(a.w.document.querySelector('#tn-s').value, 'p', '紙のボタンなので、紙');
    a.w.document.querySelector('#tn-id').value = '9'; a.w.document.querySelector('#tn-id').dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.match(a.w.document.querySelector('#tn-note').textContent, /ノートは、まだありません/);
    a.w.document.querySelector('#tn-ok').click(); await tick(400);
    const st = a.store.state();
    const t = st.topics.find(x => x.entry && x.entry.s === 'p' && x.entry.id === '9');
    assert.ok(t, '紙の 9 の索引ができる');
    assert.ok(/^無名9-/.test(t.name), '名前は、無名で作る: ' + t.name);
    assert.ok(!st.notes.some(n => n.id === '9'), '番号のノートは、作らない');
  } finally { a.close(); }
});

test('デジタルのボタンを右クリック: ノートの無い番号でも作れる', async () => {
  const a = await app();
  try {
    await rightClick(a, '#tabs [data-tab="d"]');
    a.w.document.querySelector('.popmenu div').click(); await tick(200);
    assert.strictEqual(a.w.document.querySelector('#tn-s').value, 'd');
    a.w.document.querySelector('#tn-id').value = '5'; a.w.document.querySelector('#tn-id').dispatchEvent(new a.w.Event('input', { bubbles: true }));
    a.w.document.querySelector('#tn-ok').click(); await tick(400);
    const st = a.store.state();
    assert.ok(st.topics.some(x => x.entry && x.entry.s === 'd' && x.entry.id === '5'));
    assert.ok(!st.notes.some(n => n.s === 'd' && n.id === '5'), 'デジタルでも、ノートは作らない');
  } finally { a.close(); }
});

test('右クリックしても、いまのタブは変わらない（左クリックだけがタブを切り替える）', async () => {
  const a = await app();
  try {
    a.w.document.querySelector('#tabs [data-tab="d"]').click(); await tick(200);
    await rightClick(a, '#tabs [data-tab="p"]');
    assert.ok(a.w.document.querySelector('#tabs [data-tab="d"].on'), 'デジタルのまま');
  } finally { a.close(); }
});

test('トピックIndexの番号は「区画-何個目」だけ（1-1・5-3）。ノートの ID（1a-1）は断る。既にある番号は断る', async () => {
  const a = await app();
  try {
    await rightClick(a, '#tabs [data-tab="d"]');
    a.w.document.querySelector('.popmenu div').click(); await tick(200);
    const input = a.w.document.querySelector('#tn-id');
    assert.match(input.value, /^\d+-1$/, '最初から「区画-1」の形: ' + input.value);
    const opts = [...a.w.document.querySelectorAll('#tn-ids option')].map(o => o.value);
    assert.ok(opts.length && opts.every(o => /^\d+-\d+$/.test(o)), '候補は区画の番号だけ: ' + opts.join(','));
    // ノートの ID は断る
    input.value = '1a-1'; input.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.match(a.w.document.querySelector('#tn-note').textContent, /区画の番号だけ/);
    const before = a.store.state().topics.length;
    a.w.document.querySelector('#tn-ok').click(); await tick(300);
    assert.equal(a.store.state().topics.length, before, '1a-1 の索引は作られない');
    // 5 の 3 個目を、直接指定
    input.value = '5-3'; input.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.match(a.w.document.querySelector('#tn-note').textContent, /5-3 を作ります/);
    a.w.document.querySelector('#tn-ok').click(); await tick(400);
    let t = a.store.state().topics.find(x => x.entry && x.entry.id === '5');
    assert.ok(t && t.num === 3, '3 個目として作られる（番号 5-3）: ' + JSON.stringify(t && t.num));
    // 同じ番号は、もう一度作れない
    await rightClick(a, '#tabs [data-tab="d"]'); a.w.document.querySelector('.popmenu div').click(); await tick(200);
    const i2 = a.w.document.querySelector('#tn-id'); i2.value = '5-3'; i2.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.match(a.w.document.querySelector('#tn-note').textContent, /5-3 は、もうあります/);
    // 省略すると、次の番号（5-4）
    i2.value = '5'; i2.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    assert.match(a.w.document.querySelector('#tn-note').textContent, /5-4 を作ります/);
  } finally { a.close(); }
});
