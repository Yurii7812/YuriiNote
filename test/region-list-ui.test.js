// 左の一覧の区画: 0（全体の目次）・区画の下に n-all／n-0／n-1 …・昔の ID の番号の索引（1a-1）を区画の番号に付け直す
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

async function app() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-10 09:00:00', title: '一', body: 'a' });
  store.saveNote({ s: 'd', id: '1a2', created: '2026-11-11 09:00:00', title: '二', body: 'b' });
  store.saveTopic({ name: '全体', entry: { s: 'd', id: '1' }, text: '' });
  store.saveTopic({ name: '昔の索引', entry: { s: 'd', id: '1a2' }, text: '語 1a' });   // ノートの ID で番号が付いた、昔の索引（1a2-1）
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(500);
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  return { w, $, $$, store, dir, close: () => w.close() };
}

test('0 は「全体の目次」。区画の行の下に、その区画の索引（n-all・n-0 は、まだ無くても行が出る）。昔の 1a2-1 は 1-2 に付け直す', async () => {
  const a = await app();
  try {
    a.$('#rail button[data-mode="notes"]').click(); await tick(200);
    a.$('#tabs button[data-tab="d"]').click(); await tick(300);
    const rows = a.$$('#list > .item').map(e => e.className.includes('region') ? 'R:' + e.textContent.trim().replace(/\s+/g, ' ') : e.className.includes('vtopic') ? 'V:' + e.querySelector('.nt').textContent : e.className.includes('topicrow') ? 'T:' + e.querySelector('.nt').textContent : 'N:' + e.querySelector('.nid').textContent);
    assert.strictEqual(rows[0], 'R:0 全体の目次', '0 の区画');
    const i1 = rows.findIndex(r => r.startsWith('R:1'));
    assert.deepStrictEqual(rows.slice(i1 + 1, i1 + 5), ['V:1-all', 'V:1-0', 'T:1-1 全体', 'T:1-2 昔の索引'], '区画の行の下に、all → 0 → 1 → 2');
    const old = a.store.state().topics.find(t => t.name === '昔の索引');
    assert.deepStrictEqual([old.entry.id, old.num], ['1', 2], '昔の ID の番号の索引は、区画の番号に（中身・名前はそのまま）');
    assert.strictEqual(old.text.trim(), '語 1a');
    a.$('#list .vtopic[data-vtopic="1|all"]').click(); await tick(500);
    assert.ok(a.store.state().topics.some(t => t.entry.id === '1' && String(t.num) === 'all'), '押すと 1-all を作る');
    a.$('#list .item.region[data-region="0"]').click(); await tick(300);
    a.$('#pane [data-act="rgmk"]').click(); await tick(500);
    assert.ok(a.store.state().topics.some(t => t.entry.id === '0'), '0 の索引も作れる');
  } finally { a.close(); }
});
