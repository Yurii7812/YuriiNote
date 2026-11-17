// 区画とトピックの番号（2026-11-17）: 旧→新の対応・新しい区画・区画だけのノートは作らない・移行（デジタルだけ）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const L = require('../lib');
const X = require('../id-explorer-core');
const { openVault } = require('../store');

test('旧い番号は新しい番号へ（1 → 1a、1a → 1a1、1d1 → 1a4a、1b3 → 1a2c）、親子は保たれる', () => {
  assert.equal(L.zkMigrate('1'), '1a');
  assert.equal(L.zkMigrate('1a'), '1a1');
  assert.equal(L.zkMigrate('1b'), '1a2');
  assert.equal(L.zkMigrate('1a1'), '1a1a');
  assert.equal(L.zkMigrate('1d1'), '1a4a');
  assert.equal(L.zkMigrate('1b3'), '1a2c');
  assert.equal(L.zkMigrate('10'), '10a');
  // 旧の親（1a）の子（1a1）は、新でも親（1a）の子（1a1）の関係のまま
  assert.equal(L.parentIn(L.zkMigrate('1a1'), id => id === L.zkMigrate('1a')), L.zkMigrate('1a'));
  assert.throws(() => L.zkMigrate('a1'));
});

test('新しい区画は次の番号の最初のノート（Na）。区画だけの番号（1）にはノートを置かない', () => {
  assert.equal(X.nextRoot([], 'd'), '1a');
  assert.equal(X.nextRoot([{ s: 'd', id: '1a' }, { s: 'd', id: '2a1' }], 'd'), '3a');
  assert.equal(X.available([], '1', null, 'd'), false);
  assert.equal(X.available([], '1a', null, 'd'), true);
});

test('移行: 旧い番号のノート・本文の ->ID を新しい番号にそろえる。紙は触らない。2 回目は何もしない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkid-'));
  const v = openVault(dir);
  v.createNote({ id: '1', created: '2026-10-10 11:12:30', body: '親 ->1a' }); // 旧い vault の 1（区画の番号の旧いノート）。saveNote は拒否する
  v.saveNote({ s: 'd', id: '1a', created: '2026-10-10 11:13:00', body: '子 ->1a1' });
  v.saveNote({ s: 'd', id: '1a1', created: '2026-10-10 11:14:00', body: '孫' });
  v.saveNote({ s: 'p', id: '1', created: '2026-10-10 11:15:00', body: '紙 ->1a' });
  const first = v.migrateDigitalIds();
  assert.equal(first.ok, true);
  assert.equal(first.changed, 3);
  const st = v.state();
  const at = (s, id) => st.notes.find(n => n.s === s && n.id === id);
  assert.match(at('d', '1a').body, /親 ->1a1/);      // 旧 1 の本文の ->1a（旧 1a）は 1a1 へ
  assert.match(at('d', '1a1').body, /子 ->1a1a/);
  assert.ok(at('d', '1a1a'), '旧 1a1 は 1a1a');
  assert.ok(at('p', '1'), '紙の番号は変えない');
  assert.equal(v.migrateDigitalIds().ok, false, '2 回目は何もしない（印があるので動かない）');
});

test('区画: 番号と名前だけ。名前が無くても区画は出る。区画の索引（1-1）はノートを作らずに作れる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkreg-'));
  const v = openVault(dir);
  v.saveNote({ s: 'd', id: '1a', created: '2026-11-17 10:00:00', body: '本文' });
  assert.deepStrictEqual(v.state().regions.map(r => r.n), ['1'], 'ノート 1a から区画 1 が出る');
  const st = v.saveRegion('1', '仏教');
  assert.equal(st.regions.find(r => r.n === '1').name, '仏教');
  assert.equal(v.saveRegion('2', '').regions.map(r => r.n).join(','), '1,2', '名前が空でも区画は残る');
  v.saveTopic({ name: '仏教の索引', entry: { s: 'd', id: '1' }, keyword: '', text: '' });
  const t = v.state().topics.find(x => x.name === '仏教の索引');
  assert.ok(t && t.entry.id === '1');
  assert.equal(v.state().notes.some(n => n.s === 'd' && n.id === '1'), false, '索引を作ってもノート 1 は増えない');
  assert.equal(v.saveRegion('1a', 'x'), false, '区画の番号の形でないものは不可');
});
