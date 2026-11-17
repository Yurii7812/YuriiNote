// スマホの画面（android/app/src/main/assets/phone/index.html）: 全消しボタン・時系列記録の種類の同期（疑似 Native = localStorage で動く）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/phone/index.html'), 'utf8');
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

async function page({ files = {}, meta = {}, prefs = {}, confirmAnswer = true } = {}) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!String(e).includes('Not implemented')) errors.push(String(e)); });
  const dom = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.confirm = () => confirmAnswer; w.alert = () => {}; w.prompt = () => null;
      w.localStorage.setItem('yn:files', JSON.stringify(files));
      for (const [k, v] of Object.entries(meta)) w.localStorage.setItem('yn:meta:' + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(prefs)) w.localStorage.setItem('pref:' + k, v);
    }
  });
  await tick(80);
  const w = dom.window, ls = k => JSON.parse(w.localStorage.getItem(k) || 'null');
  return { w, errors, files: () => ls('yn:files') || {}, pref: k => w.localStorage.getItem('pref:' + k), toast: () => w.document.querySelector('#toast').textContent, close: () => w.close() };
}
const memo = (at, text) => JSON.stringify({ type: 'memo', at, text });

test('全消しボタン: 取り込み済みを、種類をまたいで全部消す。未送信は消さない', async () => {
  const p = await page({
    files: { 'memo-1.json': memo('2026-11-17 10:00:00', 'a'), 'note-2.json': JSON.stringify({ type: 'note', created: '2026-11-17 10:01:00', body: 'b' }), 'memo-3.json': memo('2026-11-17 10:02:00', 'まだ送っていない') },
    meta: { 'imported.json': { names: ['memo-1.json', 'note-2.json'] } }
  });
  try {
    assert.ok(p.w.document.querySelector('#b-clear'), '上のバーに、全消しボタンがある');
    p.w.document.querySelector('#b-clear').click(); await tick();
    assert.deepStrictEqual(Object.keys(p.files()), ['memo-3.json'], '取り込み済みの 2 件だけ消える');
    assert.match(p.toast(), /2 件を、スマホから消しました/);
    assert.deepStrictEqual(p.errors, []);
  } finally { p.close(); }
});

test('全消しボタン: 確認で「いいえ」なら消さない。取り込み済みが無ければ、そう伝える', async () => {
  const p = await page({ files: { 'memo-1.json': memo('2026-11-17 10:00:00', 'a') }, meta: { 'imported.json': { names: ['memo-1.json'] } }, confirmAnswer: false });
  try {
    p.w.document.querySelector('#b-clear').click(); await tick();
    assert.deepStrictEqual(Object.keys(p.files()), ['memo-1.json'], 'やめたら、消えない');
  } finally { p.close(); }
  const q = await page({ files: { 'memo-3.json': memo('2026-11-17 10:02:00', 'x') } });
  try {
    q.w.document.querySelector('#b-clear').click(); await tick();
    assert.match(q.toast(), /取り込み済みのものは、ありません/);
    assert.deepStrictEqual(Object.keys(q.files()), ['memo-3.json']);
  } finally { q.close(); }
});

test('時系列記録の種類: PC の種類（kinds.json）も、スマホの種類の一覧に出る。再起動しても残る', async () => {
  const p = await page({ meta: { 'kinds.json': { version: 4, kinds: ['夢', '仕事'] } } });
  try {
    p.w.document.querySelector('.tabs [data-t="diary"]').click(); await tick();
    const chips = p.w.document.querySelector('#kinds').textContent;
    assert.ok(chips.includes('夢') && chips.includes('仕事'), '種類の一覧に PC の種類が出る: ' + chips);
    assert.deepStrictEqual(JSON.parse(p.pref('pcKinds')), ['夢', '仕事'], 'スマホの設定に覚える');
  } finally { p.close(); }
  const q = await page({ prefs: { pcKinds: JSON.stringify(['夢']) } });   // kinds.json が無い再起動後
  try {
    q.w.document.querySelector('.tabs [data-t="diary"]').click(); await tick();
    assert.ok(q.w.document.querySelector('#kinds').textContent.includes('夢'));
  } finally { q.close(); }
});

test('時系列記録の種類: スマホで作った種類は、項目だけ、PC へ知らせる（増えたときだけ）。取り込み済みの知らせは消す', async () => {
  const p = await page({ prefs: { myKinds: JSON.stringify(['日記', '学び', 'メモ帳']) } });
  try {
    const sent = () => Object.entries(p.files()).filter(([n]) => /^kinds-/.test(n));
    assert.strictEqual(sent().length, 1, '1 つ書く');
    assert.deepStrictEqual(JSON.parse(sent()[0][1]), { type: 'kinds', kinds: ['学び'] }, '日記・メモ帳は固定なので入れない。項目の名前だけ');
    p.w.dispatchEvent(new p.w.Event('focus')); p.w.document.dispatchEvent(new p.w.Event('visibilitychange')); await tick();
    assert.strictEqual(sent().length, 1, '変わらなければ、もう書かない');
    const name = sent()[0][0];
    p.w.localStorage.setItem('yn:meta:imported.json', JSON.stringify({ names: [name] }));   // PC が取り込んだ
    p.w.openPrompt(); await tick();   // 開き直したとき（load）
    assert.ok(!(name in p.files()), '取り込み済みの種類の知らせは、スマホから消える');
    assert.deepStrictEqual(p.errors, []);
  } finally { p.close(); }
});
