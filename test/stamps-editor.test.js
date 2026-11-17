// 行ごとの日時（本文のすぐ後ろの <!--日時-->）: 画面（CodeMirror）で書いても、消えない・変わらない・付き忘れない
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { openVault } = require('../store');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const T1 = '2026-11-17 10:00:00', T2 = '2026-11-17 10:01:00', T3 = '2026-11-17 10:02:00';
const c = t => `<!--${t}-->`;

async function editor(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-')), store = openVault(dir);
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-17 09:00:00', body });
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...structuredClone(a))); return async () => null; } });
  w.eval(bundled); await tick(300);
  w.document.querySelector('#list .item.note[data-id="1a"]').click(); await tick(400);
  const v = w.__pkm.view, doc = () => v.state.doc.toString(), line = n => v.state.doc.line(n);
  return { w, v, doc, line, store, tick, close: () => w.close(),
    key: (key, o = {}) => v.contentDOM.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o })),
    blur: async () => { v.contentDOM.dispatchEvent(new w.FocusEvent('blur')); await tick(50); } };
}
const base = `一行目${c(T1)}\n二行目${c(T2)}\n三行目${c(T3)}`;

test('コメントは画面では隠れ、行の頭に時刻が出る。カーソルは、コメントの手前にしか置けない', async () => {
  const e = await editor(base);
  try {
    assert.ok(!e.v.contentDOM.textContent.includes('<!--'), '見えない');
    assert.ok(e.w.document.querySelectorAll('.cm-content .stamp').length >= 3, '行頭に時刻の表示が出る');
    e.v.dispatch({ selection: { anchor: e.line(1).to } });   // 行の終わりを指定しても
    assert.strictEqual(e.v.state.selection.main.head, e.line(1).from + '一行目'.length, '本文の終わり（コメントの手前）に寄る');
  } finally { e.close(); }
});

test('行の終わりに書く: 文字は、いつもコメントの手前に入る。時刻は変わらない', async () => {
  const e = await editor(base);
  try {
    e.v.dispatch({ selection: { anchor: e.line(1).to } });
    e.v.dispatch(e.v.state.replaceSelection('追記'));
    assert.strictEqual(e.line(1).text, `一行目追記${c(T1)}`);
  } finally { e.close(); }
});

test('Enter（行の終わりで）: 日時は元の行に残り、新しい行は空。Enter（途中で）でも、日時コメントは、どの行も行末に 1 つ', async () => {
  const e = await editor(base);
  try {
    e.v.dispatch({ selection: { anchor: e.line(1).to } });
    e.v.dispatch({ changes: { from: e.v.state.selection.main.head, insert: '\n' }, selection: { anchor: e.v.state.selection.main.head + 1 } });
    assert.strictEqual(e.line(1).text, `一行目${c(T1)}`, '元の行に時刻が残る');
    assert.strictEqual(e.line(2).text, '', '新しい行は、日時だけを残さない');
    assert.strictEqual(e.line(3).text, `二行目${c(T2)}`);
    // 本文の途中（「三」と「行目」の間）で Enter: 日時コメントは、どの行も行末に 1 つだけ（途中や行頭に残らない）
    const l4 = e.line(4), at = l4.from + 1;
    e.v.dispatch({ changes: { from: at, insert: '\n' }, selection: { anchor: at + 1 } });
    await e.blur();
    for (let n = 1; n <= e.v.state.doc.lines; n++) { const tx = e.line(n).text, cs = (tx.match(/<!--/g) || []).length; assert.ok(cs <= 1 && (cs === 0 || /<!--[^>]*-->$/.test(tx)), `${n} 行目: ${tx}`); }
    assert.ok(e.line(4).text.startsWith('三') && e.line(5).text.startsWith('行目'));
  } finally { e.close(); }
});

test('Delete（行の終わりで）・行の頭の Backspace: 行をつないでも、前の行の時刻が残り、コメントは行末に 1 つ', async () => {
  const e = await editor(base);
  try {
    e.v.dispatch({ selection: { anchor: e.line(1).to } });
    e.key('Delete');
    assert.strictEqual(e.line(1).text, `一行目二行目${c(T1)}`);
    e.v.dispatch({ changes: { from: e.line(1).to, to: e.line(1).to + 1 } });   // 次の行の頭で Backspace（改行を消す）と同じ
    assert.strictEqual(e.line(1).text, `一行目二行目三行目${c(T1)}`);
    assert.strictEqual(e.v.state.doc.lines, 1);
  } finally { e.close(); }
});

test('範囲を選んで消す: 行の終わりまで消しても、その行の時刻は戻る。行ごと消せば、行も時刻も無くなる', async () => {
  const e = await editor(base);
  try {
    const l2 = e.line(2);
    e.v.dispatch({ changes: { from: l2.from + 1, to: l2.to } });   // 「二」の後ろから、行末（コメントごと）まで
    assert.strictEqual(e.line(2).text, `二${c(T2)}`, '時刻は元のまま');
    e.v.dispatch({ changes: { from: e.line(3).from - 1, to: e.line(3).to } });   // 3 行目を、行ごと
    assert.strictEqual(e.v.state.doc.lines, 2);
  } finally { e.close(); }
});

test('新しい行は、書き終えると（フォーカスが外れると）時刻が付く。付いている行には重ねない', async () => {
  const e = await editor(base);
  try {
    e.v.dispatch({ changes: { from: e.v.state.doc.length, insert: '\n->1a を読む' }, selection: { anchor: e.v.state.doc.length + 8 } });
    await e.blur();
    const last = e.line(e.v.state.doc.lines).text;
    assert.match(last, /^->1a を読む<!--\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}-->$/, '「->」で始まる行にも付く');
    assert.strictEqual(e.line(1).text, `一行目${c(T1)}`, '前の行は変わらない');
  } finally { e.close(); }
});

test('昔の形（行頭の日時）の文字を貼ると、行末の形に直る', async () => {
  const e = await editor(base);
  try {
    e.v.dispatch({ changes: { from: e.v.state.doc.length, insert: '\n2026-11-17 09:00:00 古い行\n- 2026-11-17 09:01:00 箇条書き' } });
    assert.strictEqual(e.line(4).text, `古い行${c('2026-11-17 09:00:00')}`);
    assert.strictEqual(e.line(5).text, `- 箇条書き${c('2026-11-17 09:01:00')}`);
  } finally { e.close(); }
});

test('「7->」「->3a」など、リンクで始まる行・見出しの下の行にも、書き終えれば時刻が付く（付き忘れない）', async () => {
  const e = await editor(base);
  try {
    const add = t => { const at = e.v.state.doc.length; e.v.dispatch({ changes: { from: at, insert: t }, selection: { anchor: at + t.length } }); };
    add('\n## 見出し'); add('\n7a-> １週間に１回って決めたけど、結局した。'); add('\n->3a10 を読んだ');
    await e.blur();
    for (let n = 4; n <= e.v.state.doc.lines; n++) assert.match(e.line(n).text, /<!--\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}-->$/, `${n} 行目に時刻が無い: ${e.line(n).text}`);
  } finally { e.close(); }
});

test('時刻は、行の一番頭に出る（見出し・箇条書きの記号より前）', async () => {
  const e = await editor(`## 見出し${c(T1)}\n- 箇条書き${c(T2)}\n普通の行${c(T3)}`);
  try {
    const lines = [...e.w.document.querySelectorAll('.cm-content .cm-line')];
    assert.strictEqual(lines.length, 3);
    for (const [i, mark] of [[0, '##'], [1, '-'], [2, '普通']]) {
      const first = lines[i].firstElementChild || lines[i].firstChild;
      assert.ok(first.classList && first.classList.contains('stamp'), `${i + 1} 行目の最初が時刻の表示: ${lines[i].innerHTML.slice(0, 120)}`);
      const text = lines[i].textContent; assert.ok(text.indexOf(mark) > text.indexOf('11-17') || text.indexOf('2026') < text.indexOf(mark), `時刻のあとに ${mark}: ${text}`);
    }
  } finally { e.close(); }
});
