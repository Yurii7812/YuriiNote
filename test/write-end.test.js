// Ctrl+D・Ctrl+K: 書き終わりの場所へ（日記は「本文 / 空行 / カーソル / 空行 / 今日のノート」、ふつうのノートは最後に 1 行あけて）。題の入力欄で Esc → ノーマルモード
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 300) => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

async function app(setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-')), store = openVault(dir); setup(store, todayStr());
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick();
  const key = (code, o = {}) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code, key: o.key || code.replace('Key', '').toLowerCase(), ctrlKey: !!o.ctrl, bubbles: true, cancelable: true }));
  return { w, key, doc: () => w.__pkm.view.state.doc.toString(), head: () => w.__pkm.view.state.selection.main.head, close: () => w.close() };
}
const withSections = (s, today) => {
  s.openDiary(today, '日記'); s.saveDiary({ date: today, kind: '日記', body: '今日の本文\n2つ目の行' });
  s.saveNote({ s: 'd', id: '1a', created: today + ' 10:00:00', title: '今日書いたノート', body: '中身' });
  s.openDiary(today, 'メモ帳'); s.saveDiary({ date: today, kind: 'メモ帳', body: 'メモ' });
};

test('Ctrl+D: 日記の本文の最後に、空行・カーソル・空行をはさんで、自動の節（今日のノート）が続く', async () => {
  const a = await app(withSections);
  try {
    a.key('KeyD', { ctrl: true }); await tick(700);
    const t = a.doc(), at = a.head();
    assert.ok(t.slice(0, at).endsWith('2つ目の行\n\n'), 'カーソルの前: 本文の最後の行 + 空行');
    assert.ok(t.slice(at).startsWith('\n\n## 今日のノート'), 'カーソルの後: 空行 + 今日のノート');
    assert.ok(t.slice(0, at).split('\n').pop() === '', 'カーソルは、空の行の上');
  } finally { a.close(); }
});

test('Ctrl+K: 日記のどこにいても、書き終わりへ戻る。ふつうのノートは、最後に 1 行あけて', async () => {
  const a = await app(withSections);
  try {
    a.key('KeyD', { ctrl: true }); await tick(700);
    const want = a.head();
    a.w.__pkm.view.dispatch({ selection: { anchor: 0 } });
    a.key('KeyK', { ctrl: true }); await tick(100);
    assert.strictEqual(a.head(), want, '日記: 書き終わりの場所へ');
    a.w.document.querySelector('#rail [data-mode="notes"]').click(); await tick(300);
    a.w.document.querySelector('#list .item.note[data-id="1a"]').click(); await tick(600);
    a.key('KeyK', { ctrl: true }); await tick(100);
    assert.strictEqual(a.doc(), '中身\n\n', 'ふつうのノート: 最後の文の下に 1 行あけて');
    assert.strictEqual(a.head(), a.doc().length);
  } finally { a.close(); }
});

test('題の入力欄で Esc: フォーカスが外れて、ノーマルモードになる', async () => {
  const a = await app(withSections);
  try {
    a.key('KeyD', { ctrl: true }); await tick(700);
    const t = a.w.document.querySelector('#d-title'); t.focus();
    assert.strictEqual(a.w.document.activeElement.id, 'd-title');
    t.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await tick(50);
    assert.strictEqual(a.w.document.activeElement, a.w.document.body, '入力欄から出る（キー操作に戻る）');
  } finally { a.close(); }
});
