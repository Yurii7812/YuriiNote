// 画面ごとの位置の復元・左の一覧のたたみ（Ctrl+[）・集中表示（Ctrl+]）・今いる場所（来た道）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

async function app(prefs = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1', created: '2026-11-10 09:00:00', title: '一', body: '長い行\n'.repeat(200) });
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-11 09:00:00', title: '二', body: '二の本文' });
  store.saveNote({ s: 'd', id: '2', created: '2026-11-12 09:00:00', title: '三', body: '三の本文' });
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) { for (const [k, v] of Object.entries(prefs)) w.localStorage.setItem(k, v); } });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  // jsdom は、スクロールしない。#pane の scrollTop だけ、値を覚えるようにする
  const pane = w.document.querySelector('#pane'); let st = 0; Object.defineProperty(pane, 'scrollTop', { get: () => st, set: v => { st = v; }, configurable: true });
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(300);
  w.document.querySelector('#rail [data-mode="notes"]').click(); await tick(100);
  const $ = s => w.document.querySelector(s);
  const open = async id => { [...w.document.querySelectorAll('#list .item.note')].find(e => e.dataset.id === id).click(); await tick(200); };
  const key = async (k, code) => { w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, code, ctrlKey: true, bubbles: true, cancelable: true })); await tick(50); };
  return { w, $, open, key, pane, close: () => w.close() };
}

test('戻る・一覧から開き直す: 最後に見ていたスクロールとカーソルに戻る', async () => {
  const a = await app();
  try {
    await a.open('1');
    a.w.__pkm.view.dispatch({ selection: { anchor: 300 } }); a.pane.scrollTop = 900;
    await a.open('1a'); a.pane.scrollTop = 40;
    a.$('#nav-back').click(); await tick(250);
    assert.strictEqual(a.w.__pkm.cur.id, '1');
    assert.strictEqual(a.pane.scrollTop, 900, '戻ると、前のスクロール');
    assert.strictEqual(a.w.__pkm.view.state.selection.main.head, 300, '戻ると、前のカーソル');
    a.$('#nav-fwd').click(); await tick(250);
    assert.strictEqual(a.pane.scrollTop, 40, '進むでも');
    await a.open('2'); a.pane.scrollTop = 0;
    await a.open('1'); assert.strictEqual(a.pane.scrollTop, 900, '一覧から開き直しても');
    assert.strictEqual(a.w.__pkm.view.state.selection.main.head, 300);
  } finally { a.close(); }
});

test('Ctrl+[ で左の一覧、Ctrl+] で集中表示（左の一覧と右パネル）。本文の字下げにはならない', async () => {
  const a = await app({ 'pkm-mgn-hidden': '0' });
  try {
    await a.open('1a');
    const body = () => a.w.__pkm.view.state.doc.toString();
    a.w.__pkm.view.focus(); const before = body();
    await a.key('[', 'BracketLeft');
    assert.ok(a.$('main>aside').hidden, '一覧がたたまれる'); assert.strictEqual(body(), before, '字下げしない');
    assert.strictEqual(a.w.localStorage.getItem('yn-list-hidden'), '1', '覚える');
    await a.key('[', 'BracketLeft'); assert.ok(!a.$('main>aside').hidden);
    await a.key(']', 'BracketRight');
    assert.ok(a.$('main>aside').hidden && a.$('.stage.nomgn'), '両方たたむ');
    await a.key(']', 'BracketRight');
    assert.ok(!a.$('main>aside').hidden && !a.$('.stage.nomgn'), '両方出す');
    await a.key('[', 'BracketLeft'); a.$('#rail [data-tab="s"]').click(); await tick(50);
    assert.ok(!a.$('main>aside').hidden, 'たたんでいても、レールの検索を押すと開く');
  } finally { a.close(); }
});

test('今いる場所: 来た道を並べ、押すとそこまで戻る', async () => {
  const a = await app();
  try {
    await a.open('1'); await a.open('1a'); await a.open('2');
    const crumbs = () => [...a.w.document.querySelectorAll('#crumbs .crumb')].map(e => e.textContent);
    assert.deepStrictEqual(crumbs(), ['1 一', '1a 二', '2 三']);
    a.$('#crumbs [data-crumb="2"]').click(); await tick(250);
    assert.strictEqual(a.w.__pkm.cur.id, '1');
    assert.deepStrictEqual(crumbs(), ['1 一']);
    a.$('#nav-fwd').click(); await tick(250);
    assert.strictEqual(a.w.__pkm.cur.id, '1a', '進むで、途中のページへ');
  } finally { a.close(); }
});

test('日記も、ノートと同じ形（小さな行＋大きな題）', async () => {
  const a = await app();
  try {
    a.$('#rail [data-mode="diary"]').click(); await tick(400);
    assert.ok(a.$('#pane .stage.diary .idline.dline'), '小さな行');
    assert.strictEqual(a.$('#d-title').tagName, 'TEXTAREA'); assert.ok(a.$('#d-title').classList.contains('ntitle'), '大きな題');
  } finally { a.close(); }
});
