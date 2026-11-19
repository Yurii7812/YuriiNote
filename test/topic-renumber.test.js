// 索引の番号を変える（区画の番号-何番目）。同じ番号・ノートの ID は断る
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

async function app() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-10 09:00:00', title: '一', body: 'a' });
  store.saveTopic({ name: '全体', entry: { s: 'd', id: '1' }, text: '' });
  store.saveTopic({ name: '別', entry: { s: 'd', id: '1' }, text: '' });
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async () => []; return async (...a) => { const f = store[key]; return typeof f === 'function' ? structuredClone(f.apply(store, a)) : null; }; } });
  w.eval(bundled); await tick(500);
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  return { w, $, $$, store, dir, close: () => w.close() };
}

test('索引の番号は変えられる。同じ番号・ノートの ID は断る', async () => {
  const a = await app();
  try {
    const alerts = []; a.w.alert = m => alerts.push(m);
    a.$('#rail button[data-mode="notes"]').click(); await tick(200);
    a.$('#tabs button[data-tab="d"]').click(); await tick(300);
    const row = a.$$('#list .item.topicrow').find(e => e.textContent.includes('全体')); assert.ok(row, '索引の行がある'); row.click(); await tick(500);
    assert.ok(a.$('#pane .thead .tno'), '番号のボタンがある');
    a.$('#pane [data-act="tconf"]').click(); await tick(300);
    const first = a.$('#t-no').value; assert.match(first, /^1-\d$/);
    const save = async v => { a.$('#t-no').value = v; a.$('#pane [data-act="tsave"]').click(); await tick(500); };
    await save('1a-1'); assert.ok(alerts.pop(), 'ノートの ID は断る');
    const other = a.store.state().topics.find(x => x.name === '別'), no2 = other.entry.id + '-' + other.num;
    await save(no2); assert.ok(alerts.pop(), 'もうある番号は断る');
    await save('1-all');
    const t = a.store.state().topics.find(x => x.name === '全体');
    assert.deepStrictEqual([t.entry.id, String(t.num)], ['1', 'all'], '1-all に変わった');
    a.$('#pane [data-act="tconf"]').click(); await tick(300);
    await save('2-3');
    const t2 = a.store.state().topics.find(x => x.name === '全体');
    assert.deepStrictEqual([t2.entry.id, String(t2.num)], ['2', '3'], '区画も変えられる');
  } finally { a.close(); }
});

test('← で上位へ: ノート → 区画の地図 → 区画 → 0', async () => {
  const a = await app();
  try {
    a.$('#rail button[data-mode="notes"]').click(); await tick(200);
    a.$('#tabs button[data-tab="d"]').click(); await tick(300);
    a.$$('#list .item.note').find(e => e.dataset.id === '1a').click(); await tick(500);
    const press = async k => { a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); await tick(500); };
    const where = () => a.$('#pane .rgh') ? 'region:' + a.$('#pane .tname').textContent.trim().split(/\s/)[0] : a.$('#pane .thead .tno') ? 'topic' : a.$('#pane .ntitle') ? 'note' : '?';
    assert.strictEqual(where(), 'note');
    await press('ArrowLeft'); assert.strictEqual(where(), 'topic', '区画の最初のノート → 区画の地図');
    await press('ArrowLeft'); assert.strictEqual(where(), 'region:1', '地図 → 区画');
    await press('ArrowLeft'); assert.strictEqual(where(), 'region:0', '区画 → 0');
    await press('ArrowRight'); assert.ok(['topic', 'region:0', 'note'].includes(where()));
  } finally { a.close(); }
});
