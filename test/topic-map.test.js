// トピックインデックスの地図（リスト型から作る・文字との行き来）
const test = require('node:test');
const assert = require('node:assert');
const M = require('../topic-map');

test('字下げのないリストは、縦に並べるだけ（線なし）。文字は同じまま', () => {
  const text = '思考 1a 1b\n\n道具 2\n^上の話 3';
  const m = M.convert(text);
  assert.strictEqual(m.n.length, 3, '空行は置かない');
  assert.deepStrictEqual(m.l, []);
  assert.strictEqual(M.toText(m), '思考 1a 1b\n道具 2\n^上の話 3');
  assert.ok(m.n.every(a => a[1] === m.n[0][1]), '同じ列');
});

test('字下げがあれば、木の形（すぐ上の浅い行と線で結ぶ・深さごとに右へ）', () => {
  const m = M.convert('親 1\n  子 1a\n    孫 1a1\n  子二 1b\n別 2');
  const id = kw => m.n.find(a => a[3].trim().startsWith(kw))[0];
  assert.deepStrictEqual(m.l, [[id('親'), id('子 ')], [id('子 '), id('孫')], [id('親'), id('子二')]]);
  const x = kw => m.n.find(a => a[3].trim().startsWith(kw))[1];
  assert.ok(x('親') < x('子 ') && x('子 ') < x('孫'));
  assert.strictEqual(x('別'), x('親'));
});

test('⭕（@ の見出し）があれば、見出しを左、その下の行を右に置いて結ぶ。まとまりは上から積む', () => {
  const m = M.convert('@道具\nペン 1\n紙 2\n@考え\n問い 3');
  const p = kw => m.n.find(a => a[3].includes(kw));
  assert.ok(p('道具')[1] < p('ペン')[1] && p('ペン')[1] === p('問い')[1], '見出しは左、行は右');
  assert.ok(p('考え')[2] > p('紙')[2], '次のまとまりは下');
  assert.strictEqual(m.l.length, 3);
  assert.strictEqual(M.toText(m), '@道具\nペン 1\n紙 2\n@考え\n問い 3', '行の順は元のまま');
});

test('文字を直しても、同じ行・同じキーワードのノードは位置と線を保つ。消えた行のノードと線はなくなる', () => {
  const m = M.convert('A 1\n  B 2\n  C 3');
  m.n[1][1] = 500; m.n[1][2] = 600;   // B を動かした
  const r = M.reconcile(m, 'A 1\n  B 2 4\nD 5');   // B に ID を足し、C を消し、D を足した
  const b = r.n.find(a => a[3].includes('B'));
  assert.deepStrictEqual([b[1], b[2]], [500, 600], 'ID が増えても、同じノード');
  assert.ok(!r.n.some(a => a[3].includes('C')));
  assert.ok(r.n.some(a => a[3] === 'D 5'), '新しい行');
  assert.deepStrictEqual(r.l, [[m.n[0][0], m.n[1][0]]], 'C への線は消える');
  assert.strictEqual(M.toText(r), 'A 1\n  B 2 4\nD 5');
});

test('同じ行が 2 つあっても、別々のノード。地図がなければ作る', () => {
  const r = M.reconcile(null, 'x 1\nx 1');
  assert.strictEqual(r.n.length, 2); assert.notStrictEqual(r.n[0][0], r.n[1][0]);
  const r2 = M.reconcile(r, 'x 1\nx 1');
  assert.ok(M.same(r, r2), '変わらなければ、同じ');
});
