// 地図（索引）の番号: 1-0（雑の地図）・1-all（地図の地図）・1-1-2（続き）・1-1a（掘り下げ）。区画の番号だけで作る
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const L = require('../lib');
const { openVault } = require('../store');

test('番号の形と並び: all → 0 → 1 → 1-2 → 1a → 2', () => {
  for (const n of [1, 3, '0', 'all', '1-2', '1a', '1-1-2', 'all-2', '2a1']) assert.ok(L.isTopicNum(n), String(n));
  for (const n of [0, -1, 'x', '1-', 'a1', '']) assert.ok(!L.isTopicNum(n), String(n));
  assert.deepStrictEqual([2, '1a', '1-2', 1, 'all', '0', 'all-2', 10].sort(L.cmpTopicNum), ['all', 'all-2', '0', 1, '1-2', '1a', 2, 10]);
});

test('索引の行の終わりの番号（その地図へのリンク）: 1-1-2・1-1a・1-all も。日付は番号にしない', () => {
  const r = L.topicLine('関係 1a 1-1-2 1-1a 1-all');
  assert.deepStrictEqual(r.tnos.map(x => x.tno), ['1-1-2', '1-1a', '1-all']);
  assert.deepStrictEqual(L.topicLine('記録 2026-11-19').tnos, []);
});

test('文字の番号は、保存しても付け直さない。重なったら次の数', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-')), st = openVault(dir);
  st.saveNote({ s: 'd', id: '1', created: '2026-11-10 09:00:00', body: 'a' });
  for (const [name, num] of [['雑', '0'], ['全体', 'all'], ['話', 1], ['続き', '1-2'], ['掘', '1a']]) st.saveTopic({ name, entry: { s: 'd', id: '1' }, num, text: '' });
  st.saveTopic({ name: 'かぶり', entry: { s: 'd', id: '1' }, num: '1a', text: '' });
  const nums = Object.fromEntries(openVault(dir).state().topics.map(t => [t.name, t.num]));
  assert.deepStrictEqual(nums, { 雑: '0', 全体: 'all', 話: 1, 続き: '1-2', 掘: 2, かぶり: '1a' }, '重なったら、名前の順で後のものに次の数（今までと同じ決まり）');
});
