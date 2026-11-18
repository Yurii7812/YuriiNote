// 索引の地図の画面: 開くと地図に作り替える（文字は変えない）・クリックで書く・リストにも切り替えられる
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
const TEXT = '@道具\nペン 1\n紙 1a\n^上の話 1';

async function app() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1', created: '2026-11-10 09:00:00', title: '一', body: 'a' });
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-11 09:00:00', title: '二', body: 'b' });
  store.saveTopic({ name: '道具の索引', entry: { s: 'd', id: '1' }, text: TEXT });
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(300);
  const $ = s => w.document.querySelector(s);
  const openT = async () => { const e = w.document.createElement('span'); e.dataset.topic = '道具の索引'; w.document.body.append(e); e.click(); e.remove(); await tick(300); };
  const ptr = (type, el, x, y, o = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: o.button || 0, ctrlKey: !!o.ctrl }));
  return { w, $, store, openT, ptr, close: () => w.close() };
}

test('リスト型の索引を開くと、地図に作り替えて保存する。索引の文字は変えない', async () => {
  const a = await app();
  try {
    await a.openT();
    const nodes = [...a.w.document.querySelectorAll('.tmap .bb-node')].map(e => e.textContent);
    assert.deepStrictEqual(nodes, ['⭕道具', 'ペン1', '紙1a', '⬆️上の話1']);
    assert.strictEqual(a.w.document.querySelectorAll('.tmap .bb-line').length, 3, '見出しと、その下の行を結ぶ');
    assert.ok(a.$('.tmap .bb-node .chip[data-s="d"][data-id="1a"]'), 'ID はチップ（押すと開く）');
    await tick(600);
    const t = a.store.state().topics.find(x => x.name === '道具の索引');
    assert.ok(t.map && t.map.n.length === 4, '地図を保存した');
    assert.strictEqual(t.text, TEXT, '文字はそのまま');
  } finally { a.close(); }
});

test('空きをクリックして書くと、索引の文字に行が増える。リストに切り替えても同じ中身', async () => {
  const a = await app();
  try {
    await a.openT();
    const cv = a.$('.tmap');
    a.ptr('pointerdown', cv, 500, 300); a.ptr('pointerup', cv, 500, 300); await tick(50);
    const inp = a.$('.tmap .bb-input'); assert.ok(inp, '入力欄が出る');
    inp.value = '消しゴム 1a';
    inp.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick(600);
    const t = a.store.state().topics.find(x => x.name === '道具の索引');
    assert.strictEqual(t.text, TEXT + '\n消しゴム 1a');
    assert.ok([...a.w.document.querySelectorAll('.tmap .bb-node')].some(e => e.textContent === '消しゴム1a'));
    a.$('[data-act="tlistv"]').click(); await tick(200);
    assert.ok(a.$('table.ti'), 'リスト');
    assert.match(a.$('table.ti').textContent, /消しゴム/);
    a.$('[data-act="tmapv"]').click(); await tick(200);
    assert.ok(a.$('.tmap'), '地図に戻る');
  } finally { a.close(); }
});

test('ノードをクリックして直す。空にすると消える', async () => {
  const a = await app();
  try {
    await a.openT();
    const pen = [...a.w.document.querySelectorAll('.tmap .bb-node')].find(e => e.textContent === 'ペン1');
    a.ptr('pointerdown', pen, 10, 10); a.ptr('pointerup', pen, 10, 10); await tick(50);
    const inp = a.$('.tmap .bb-input'); assert.strictEqual(inp.value, 'ペン 1');
    inp.value = ''; inp.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick(600);
    const t = a.store.state().topics.find(x => x.name === '道具の索引');
    assert.strictEqual(t.text, '@道具\n紙 1a\n^上の話 1');
    assert.strictEqual(t.map.l.length, 2, 'ペンへの線も消える');
  } finally { a.close(); }
});
