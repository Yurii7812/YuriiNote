const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), os = require('node:os'), fs = require('node:fs');
// 検索して挿入する画面の、画面に依存しない部分（絞り込み・入れる文字）
test('insert-search: AND検索・リンク・索引・挿入形式', async () => {
  const esbuild = require('esbuild'), out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yn-is-')), 'is.cjs');
  await esbuild.build({ entryPoints: [path.join(__dirname, '../src/insert-search.js')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });
  const { JSDOM } = require('jsdom'), dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  for (const k of ['window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'Node', 'Element', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame']) { try { global[k] = dom.window[k]; } catch { Object.defineProperty(global, k, { value: dom.window[k], configurable: true }); } }
  const IS = require(out);
  assert.deepEqual(IS.terms('A　b  c'), ['a', 'b', 'c']);
  const items = [{ type: 'note', hay: 'りんご\nみかん', x: {} }, { type: 'note', hay: 'りんご', x: {} }];
  assert.equal(IS.search(items, 'りんご みかん').length, 1);
  assert.equal(IS.insertText({ type: 'note', x: { kind: 'note', s: 'd', id: '1a' } }, false), '->1a');
  assert.equal(IS.insertText({ type: 'note', x: { kind: 'note', s: 'd', id: '1a' } }, true), '1a->');
  assert.equal(IS.insertText({ type: 'link', x: { id: 'L1', title: '題' } }), '[題](link:L1)');
  assert.equal(IS.insertText({ type: 'idx', x: { name: 'T', entry: { s: 'd', id: '1-1' } } }, false), '->1-1');
});
