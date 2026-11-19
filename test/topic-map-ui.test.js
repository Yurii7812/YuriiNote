// 索引の地図の画面（ブレストと同じ盤面）: 開くと地図に作り替える（文字は変えない）・書く・つなぐ・グループ・線の色・リストにも切り替えられる
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');
const { openVault } = require('../store');

const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css' };
const files = requestInterceptor(req => { const u = new URL(req.url), f = path.join(__dirname, '..', decodeURIComponent(u.pathname)), ext = (f.match(/\.(\w+)$/) || [])[1]; const ok = u.host === 'localhost' && TYPES[ext] && fs.existsSync(f); return new Response(ok ? fs.readFileSync(f) : '', { status: 200, headers: { 'Content-Type': TYPES[ext] || 'text/plain' } }); });
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/<script src="dist\/app.js"><\/script>/, '');
const bundled = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/app.js')], bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
const TEXT = '@道具\nペン 1\n紙 1a\n^上の話 1';

async function app() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-')), store = openVault(dir);
  store.saveDoc('K_settings', { lang: 'ja' });
  store.saveNote({ s: 'd', id: '1', created: '2026-11-10 09:00:00', title: '一', body: 'a' });
  store.saveNote({ s: 'd', id: '1a', created: '2026-11-11 09:00:00', title: '二', body: 'b' });
  store.saveTopic({ name: '道具の索引', entry: { s: 'd', id: '1' }, text: TEXT });
  const dom = new JSDOM(html, { url: 'http://localhost/index.html', runScripts: 'dangerously', resources: { interceptors: [files] }, pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  w.confirm = () => true; w.alert = () => {};
  w.api = new Proxy({}, { get(_, key) { if (String(key).startsWith('on')) return () => {}; if (key === 'load' || key === 'state') return async () => structuredClone(store.state()); if (key === 'suggest') return async k => k; if (typeof store[key] === 'function') return async (...a) => structuredClone(store[key](...a)); return async () => null; } });
  w.eval(bundled); await tick(300);
  const $ = s => w.document.querySelector(s);
  const openT = async () => { const e = w.document.createElement('span'); e.dataset.topic = '道具の索引'; w.document.body.append(e); e.click(); e.remove(); await tick(300); };
  const tb = async () => { for (let i = 0; i < 200; i++) { const f = w.document.querySelector('#tbframe'), T = f && f.contentWindow && f.contentWindow.TB; if (T && T.host && T.B && T.plain) { const fw = f.contentWindow; if (!fw.crypto || !fw.crypto.subtle) Object.defineProperty(fw, 'crypto', { value: require('crypto').webcrypto, configurable: true }); if (!fw.TextEncoder) fw.TextEncoder = TextEncoder; return T; } await tick(25); } throw new Error('盤面が開かない'); };
  const topic = () => store.state().topics.find(x => x.name === '道具の索引');
  return { w, $, store, openT, tb, topic, close: () => w.close() };
}

test('リスト型の索引を開くと、地図に作り替えて保存する。索引の文字は変えない。引く道具は出さない', async () => {
  const a = await app();
  try {
    await a.openT(); const T = await a.tb(), d = a.$('#tbframe').contentWindow.document;
    assert.strictEqual(T.B().nodes.map(n => n.text).join('|'), '@道具|ペン 1|紙 1a|^上の話 1');
    assert.strictEqual(T.B().links.length, 3, '見出しと、その下の行を結ぶ');
    assert.ok(d.querySelector('.node .chip[data-s="d"][data-id="1a"]'), 'ID はチップ（押すと開く）');
    assert.ok(d.body.classList.contains('plain'), '索引の地図（引く道具は出さない）');
    await tick(600);
    const t = a.topic();
    assert.ok(t.map && t.map.n.length === 4, '地図を保存した');
    assert.strictEqual(t.text, TEXT, '文字はそのまま');
  } finally { a.close(); }
});

test('地図で足す・直す・消す: 索引の文字に反映する。リストに切り替えても同じ中身', async () => {
  const a = await app();
  try {
    await a.openT(); const T = await a.tb();
    T.newIdea(null, { x: 500, y: 300 }, { text: '消しゴム 1a' }); T.save(); await tick(600);
    assert.strictEqual(a.topic().text, TEXT + '\n消しゴム 1a', '新しいノードは、最後の行');
    const pen = T.B().nodes.find(n => n.text === 'ペン 1'); pen.text = 'ペン 1 1a'; T.save(); await tick(600);
    assert.match(a.topic().text, /ペン 1 1a/, '直すと、その行が変わる');
    T.select(pen.id); T.deleteSelected(); await tick(600);
    assert.ok(!/ペン/.test(a.topic().text), '消すと行が無くなる');
    assert.strictEqual(a.topic().map.l.length, 2, 'ペンへの線も消える');
    a.$('[data-act="tlistv"]').click(); await tick(200);
    assert.ok(a.$('table.ti'), 'リスト');
    assert.match(a.$('table.ti').textContent, /消しゴム/);
    a.$('[data-act="tmapv"]').click(); await tick(200);
    assert.ok(a.$('#tmap'), '地図に戻る');
  } finally { a.close(); }
});

test('ふつうのブレストと同じに: 線のひとこと・種類・色、グループの枠と色、文字と枠の色が別。保存して開き直しても残る', async () => {
  const a = await app();
  try {
    await a.openT(); const T = await a.tb();
    const [h, pen, paper] = T.B().nodes;
    const link = T.B().links.find(l => l.b === pen.id); link.label = '道具の種類'; link.kind = 'arrow'; link.color = '#c0392b';
    T.select(paper.id); T.styleSel('color', '#2f6fd0'); T.styleSel('box', 'line'); T.styleSel('bc', '#c0392b');
    T.select([h.id, pen.id]); T.groupSel(); const fr = T.B().frames[0]; fr.title = '道具'; fr.color = '#2f8a3e'; T.save(); await tick(600);
    const m = a.topic().map;
    assert.strictEqual(JSON.stringify(m.l.find(x => x[1] === 2)[2]), JSON.stringify({ kind: 'arrow', label: '道具の種類', color: '#c0392b' }), '線の見た目');
    assert.strictEqual(JSON.stringify(m.n[2][4]), JSON.stringify({ box: 'line', color: '#2f6fd0', bc: '#c0392b' }), 'ノードの色（文字と枠は別）');
    assert.strictEqual(m.f.length, 1); assert.strictEqual(m.f[0].color, '#2f8a3e');
    assert.strictEqual(a.topic().text, TEXT, '見た目を変えても、索引の文字は変わらない');
    a.$('[data-act="tlistv"]').click(); await tick(300); a.$('[data-act="tmapv"]').click(); await tick(300);
    const T2 = await a.tb(); const n2 = T2.B().nodes.find(n => n.text === '紙 1a');
    assert.strictEqual(n2.bc, '#c0392b'); assert.strictEqual(T2.B().frames[0].title, '道具'); assert.strictEqual(T2.B().links.find(l => l.label === '道具の種類').kind, 'arrow');
  } finally { a.close(); }
});

test('Ctrl+U: 地図で、ノートを探して、新しい行として足せる（選んでいる行につなぐ）', async () => {
  const a = await app();
  try {
    await a.openT(); const T = await a.tb(), fw = a.$('#tbframe').contentWindow, d = fw.document;
    const paper = T.B().nodes.find(n => n.text === '紙 1a'); T.select(paper.id);
    d.dispatchEvent(new fw.KeyboardEvent('keydown', { key: 'u', code: 'KeyU', ctrlKey: true, bubbles: true, cancelable: true })); await tick(200);
    const q = a.$('#isr-q'); assert.ok(q, '検索の画面が開く');
    q.value = '二'; q.dispatchEvent(new a.w.Event('input', { bubbles: true })); await tick(100);
    q.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick(600);
    assert.ok(T.B().nodes.some(n => /^二 1a$/.test(n.text)), '題をキーワードにして、ID を書いた行が増える: ' + T.B().nodes.map(n => n.text).join('|'));
    const nn = T.B().nodes.find(n => n.text === '二 1a');
    assert.ok(T.B().links.some(l => l.a === paper.id && l.b === nn.id), '選んでいた行につながる');
    assert.match(a.topic().text, /二 1a/, '索引の文字にも入る');
  } finally { a.close(); }
});
