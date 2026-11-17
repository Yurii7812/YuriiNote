const test = require('node:test');
const assert = require('node:assert');
const S = require('../stamp');

test('行ごとの日時: 本文のすぐ後ろに付ける・読む・外す（記号は、そのまま）', () => {
  const at = '2026-11-13 13:05';
  const t = S.add('# 題\n- 箇条書き\n- [ ] やること\n> 引用\n1. 番号\n\n本文', at);
  assert.strictEqual(t, '# 題<!--2026-11-13 13:05-->\n- 箇条書き<!--2026-11-13 13:05-->\n- [ ] やること<!--2026-11-13 13:05-->\n> 引用<!--2026-11-13 13:05-->\n1. 番号<!--2026-11-13 13:05-->\n\n本文<!--2026-11-13 13:05-->');
  assert.strictEqual(S.stampOf('- 買い物<!--2026-11-13 13:05-->'), at);
  assert.strictEqual(S.stampOf('本文'), '');
  assert.strictEqual(S.strip(t), '# 題\n- 箇条書き\n- [ ] やること\n> 引用\n1. 番号\n\n本文');
  assert.strictEqual(S.add(t, '2030-01-01 00:00'), t);   // 付いている行は、変えない
  assert.deepStrictEqual(S.parse('- 買い物<!--2026-11-13 13:05-->'), { p: 2, at, cs: 5, ce: 28 });
  assert.strictEqual(S.add('->1a を読む', at), '->1a を読む<!--2026-11-13 13:05-->');   // ->  で始まる行にも、いつも付く
  assert.strictEqual(S.add('文  ', at), '文<!--2026-11-13 13:05-->  ');   // 行末の空白（md の改行）は、コメントの後ろ
  assert.strictEqual(S.line('本文', at), '本文<!--2026-11-13 13:05-->');
});
test('行ごとの日時: コード・ボード・表・区切り線・自動で入る行には付けない／行番号で絞れる', () => {
  const src = '前\n```board\n{"h":320}\n```\n| a | b |\n| - | - |\n---\n## 今日のノート\n[題](20261113130500.md)\n-\n後';
  assert.strictEqual(S.add(src, '2026-11-13 13:05'), '前<!--2026-11-13 13:05-->\n```board\n{"h":320}\n```\n| a | b |\n| - | - |\n---\n## 今日のノート\n[題](20261113130500.md)\n-\n後<!--2026-11-13 13:05-->');
  assert.strictEqual(S.add('```js\nlet a;\n```', '2026-11-13 13:05'), '```js\nlet a;\n```');   // 言語つきのコードには付けない
  assert.strictEqual(S.add('```\n引用の行\n付いている行<!--2026-11-13 10:00-->\n```\n後', '2026-11-13 13:05'), '```\n引用の行<!--2026-11-13 13:05-->\n付いている行<!--2026-11-13 10:00-->\n```\n後<!--2026-11-13 13:05-->');
  assert.strictEqual(S.add('一\n二\n三', '2026-11-13 13:05', new Set([1])), '一\n二<!--2026-11-13 13:05-->\n三');
  assert.strictEqual(S.add('## 今日のチャットメモ一覧', '2026-11-13 13:05'), '## 今日のチャットメモ一覧');   // 自動で入る節の見出しには付けない
});
test('行ごとの日時: 昔の形（行頭・空白つきの行末）も読め、いまの形に直せる', () => {
  const old = '## 2026-11-13 13:05 題\n- 2026-11-13 13:06 本文\n文 <!--2026-11-13 13:07-->\nそのまま';
  assert.strictEqual(S.stampOf('2026-11-13 13:05 本文'), '2026-11-13 13:05');
  assert.strictEqual(S.stampOf('本文 <!--2026-11-13 13:05-->'), '2026-11-13 13:05');
  assert.strictEqual(S.strip(old), '## 題\n- 本文\n文\nそのまま');
  assert.strictEqual(S.migrate(old), '## 題<!--2026-11-13 13:05-->\n- 本文<!--2026-11-13 13:06-->\n文<!--2026-11-13 13:07-->\nそのまま');
  assert.strictEqual(S.migrate(S.migrate(old)), S.migrate(old), '二度かけても同じ');
  assert.strictEqual(S.add('2026-11-13 13:05 本文', '2030-01-01 00:00'), '2026-11-13 13:05 本文');   // 昔の形が付いている行にも、重ねて付けない
});
test('行ごとの日時: 外へ出すときは、行頭の見える形にする', () => {
  assert.strictEqual(S.visible('# 題<!--2026-11-13 13:05:00-->\n- 買い物 ->1a<!--2026-11-13 13:06:00-->\n時刻なし'), '# 2026-11-13 13:05:00 題\n- 2026-11-13 13:06:00 買い物 ->1a\n時刻なし');
});
test('行ごとの日時: 画面に出す形', () => {
  assert.strictEqual(S.show('2026-11-13 13:05', '2026-11-13'), '13:05');
  assert.strictEqual(S.show('2026-11-12 23:50', '2026-11-13'), '2026-11-12 23:50');
  assert.match(S.nowStamp(new Date(2026, 10, 3, 4, 5, 6)), /^2026-11-03 04:05:06$/);
  assert.strictEqual(S.format('2026-11-13 12:54:30', { sec: true }), '2026-11-13 12:54:30'); assert.strictEqual(S.format('2026-11-13 12:54:30', { sec: false }), '2026-11-13 12:54');
  assert.strictEqual(S.format('2026-11-13 12:54:30', { sec: false, short: true }, '2026-11-13'), '12:54'); assert.strictEqual(S.format('2026-11-12 12:54:30', { sec: true, short: true }, '2026-11-13'), '2026-11-12 12:54:30');
  assert.strictEqual(S.format('2026-11-13 12:54', { sec: true }), '2026-11-13 12:54');   // 昔の分までのものは、そのまま
});
test('行ごとの日時: 昔の「13:05 本文」は、その日の年月日つきにする', () => {
  assert.strictEqual(S.adoptTimes('10:35 abc\n- 11:00 箇条書き\n```\n10:35 コード\n```\n12:99 時刻ではない', '2026-11-13'), 'abc<!--2026-11-13 10:35:00-->\n- 箇条書き<!--2026-11-13 11:00:00-->\n```\n10:35 コード\n```\n12:99 時刻ではない');
});

test('行ごとの日時: 秒までの日時も読める。秒の無いものは「:00」を足す', () => {
  assert.strictEqual(S.stampOf('- 買い物<!--2026-11-13 12:54:30-->'), '2026-11-13 12:54:30');
  assert.deepStrictEqual(S.parse('本文<!--2026-11-13 12:54:30-->'), { p: 0, at: '2026-11-13 12:54:30', cs: 2, ce: 28 });
  assert.strictEqual(S.strip('# 題<!--2026-11-13 12:54:30-->\n分まで<!--2026-11-13 12:54-->'), '# 題\n分まで');
  assert.strictEqual(S.add('本文', '2026-11-13 12:54:30'), '本文<!--2026-11-13 12:54:30-->');
  assert.strictEqual(S.secs('分まで<!--2026-11-13 12:54-->\n2026-11-13 12:55 旧形'), '分まで<!--2026-11-13 12:54:00-->\n2026-11-13 12:55:00 旧形');
});
test('行ごとの日時: 時刻の順の場所に入れる（コメントの形でも）', () => {
  const text = '朝<!--2026-11-13 08:00:00-->\n昼<!--2026-11-13 12:00:00-->\n続き';
  assert.strictEqual(S.insertByTime(text, '十時<!--2026-11-13 10:00:00-->', '2026-11-13 10:00:00'), '朝<!--2026-11-13 08:00:00-->\n十時<!--2026-11-13 10:00:00-->\n昼<!--2026-11-13 12:00:00-->\n続き');
  assert.strictEqual(S.insertByTime(text, '夜<!--2026-11-13 20:00:00-->', '2026-11-13 20:00:00'), text + '\n夜<!--2026-11-13 20:00:00-->');
});

test('行ごとの日時: 全部・カスタムの見せ方', () => {
  const at = '2026-11-13 12:54:30', F = f => S.format(at, f, '2026-11-13');
  assert.strictEqual(F({ all: true }), at); assert.strictEqual(F(undefined), at);
  assert.strictEqual(F({ y: false, s: false }), '11-13 12:54');
  assert.strictEqual(F({ y: false, mo: false, d: false, s: false }), '12:54');
  assert.strictEqual(F({ mo: false, d: false, h: false, mi: false, s: false }), '2026');
  assert.strictEqual(F({ dsep: '/', tsep: '.' }), '2026/11/13 12.54.30');
  assert.strictEqual(F({ short: true }), '12:54:30');
  assert.strictEqual(S.format('2026-11-12 12:54:30', { short: true }, '2026-11-13'), '2026-11-12 12:54:30');
  assert.strictEqual(F({ ja: true }), '2026年11月13日 12時54分30秒'); assert.strictEqual(F({ ja: true, y: false, s: false }), '11月13日 12時54分');
  assert.strictEqual(F({ h: false, mi: false, s: false }), '2026-11-13');
  assert.strictEqual(F({ y: false, mo: false, d: false, h: false, mi: false, s: false }), '');
});

test('取り込んだ行は、時刻の順の場所に入る（時刻の無い行は、上の行の続き）', () => {
  const pc = '2026-11-15 09:00:00 朝\n2026-11-15 11:30:00 もとからPCにあった文\n続きの行\n2026-11-15 12:00:00 昼';
  assert.strictEqual(S.insertByTime(pc, '2026-11-15 10:30:00 取り込まれた文', '2026-11-15 10:30:00'),
    '2026-11-15 09:00:00 朝\n2026-11-15 10:30:00 取り込まれた文\n2026-11-15 11:30:00 もとからPCにあった文\n続きの行\n2026-11-15 12:00:00 昼');
  assert.strictEqual(S.insertByTime(pc, '2026-11-15 13:00:00 後', '2026-11-15 13:00:00'), pc + '\n2026-11-15 13:00:00 後');
  assert.strictEqual(S.insertByTime('', '2026-11-15 13:00:00 一つ目', '2026-11-15 13:00:00'), '2026-11-15 13:00:00 一つ目');
  // 秒の無い昔の行とも比べられる
  assert.strictEqual(S.insertByTime('2026-11-15 11:30 古い形', '2026-11-15 11:29:59 前', '2026-11-15 11:29:59'), '2026-11-15 11:29:59 前\n2026-11-15 11:30 古い形');
});

test('秒の無い日時は、秒までにする（コードの中は変えない）', () => {
  assert.strictEqual(S.secs('2026-11-13 12:54 本文\n- 2026-11-13 12:55:10 済み\n```\n2026-11-13 12:56 コード\n```'), '2026-11-13 12:54:00 本文\n- 2026-11-13 12:55:10 済み\n```\n2026-11-13 12:56 コード\n```');
  assert.strictEqual(S.full('2026-11-13 12:54'), '2026-11-13 12:54:00');
});
