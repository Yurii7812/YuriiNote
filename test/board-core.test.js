// 盤面の形式 v2（v1 の読み込み）・エンジンの形との行き来・木の形の文章
const test = require('node:test');
const assert = require('node:assert');
const C = require('../board-core');
const L = require('../lib');

test('v1 のボードは、そのまま読めて、保存すると v2（線 l つき）になる', () => {
  const v1 = '{"h":300,"t":[[10,20,"あ"],[30,40,"い"]],"s":[[1,2,3,4]]}';
  const b = C.parseBoard(v1);
  assert.deepStrictEqual(b, { v: 2, h: 300, t: [[10, 20, 'あ'], [30, 40, 'い']], l: [], s: [[1, 2, 3, 4]] });
  assert.strictEqual(C.dumpBoard(b), '{"v":2,"h":300,"t":[[10,20,"あ"],[30,40,"い"]],"l":[],"s":[[1,2,3,4]]}');
  assert.deepStrictEqual(C.parseBoard('こわれた').t, [], '読めないときは空');
});

test('エンジンの形と行き来しても同じ。線は番号で持ち、消したノードの線は消える', () => {
  const b = { v: 2, h: 320, t: [[0, 0, '中心'], [200, 0, '枝', 'card'], [200, 60, '枝2']], l: [[0, 1], [0, 2], [1, 1], [0, 9], [2, 0]], s: [] };
  const m = C.fromBoard(b);
  assert.deepStrictEqual(m.l, [[1, 2], [1, 3]], '自分自身・無いノード・同じ組は除く');
  assert.strictEqual(m.n[1].k, 'card', '種類を保つ');
  m.n = m.n.filter(a => a.id !== 2);
  const back = C.toBoard(m, 320);
  assert.deepStrictEqual(back.t, [[0, 0, '中心'], [200, 60, '枝2']]);
  assert.deepStrictEqual(back.l, [[0, 1]], '番号を詰め直す');
});

test('索引の地図の形とも行き来できる', () => {
  const map = { v: 1, n: [[3, 40, 40, 'ペン 1'], [7, 300, 40, '紙 1a']], l: [[3, 7]] };
  const m = C.fromMap(map);
  assert.deepStrictEqual(C.toMap(m), map);
});

test('木の形の文章: 左上から、線をたどって字下げ。つながっていないノードは、別の根', () => {
  const m = { n: [{ id: 1, x: 0, y: 0, text: '中心' }, { id: 2, x: 200, y: 0, text: '枝 ->1a' }, { id: 3, x: 400, y: 0, text: '葉\n二行目' }, { id: 4, x: 200, y: 80, text: '枝2' }, { id: 5, x: 0, y: 400, text: 'ひとり' }],
    l: [[2, 1], [3, 2], [1, 4]] };
  assert.strictEqual(C.treeText(m), '- 中心\n  - 枝 ->1a\n    - 葉\n      二行目\n  - 枝2\n- ひとり');
});

test('ブレストのノートの本文は、木の形の文章（検索・リンクが効く）', () => {
  const body = L.deriveBody('brainstorm', { v: 2, t: [[0, 0, 'テーマ'], [200, 0, '案 ->1a(2)']], l: [[0, 1]], s: [], title: '題' });
  assert.strictEqual(body, '- テーマ\n  - 案 ->1a(2)');
  assert.ok(L.tokens(body).some(t => t.k === 'ref' && t.id === '1a' && t.n === '2'));
});
