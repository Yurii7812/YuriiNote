const test = require('node:test');
const assert = require('node:assert');
const T = require('../transcriber');

test('文字化: 区切りを段落にし、行頭に「録音を始めた時刻＋経過」の日時（秒まで）を付ける', () => {
  const segs = [{ start: 0.2, end: 2, text: 'こんにちは。' }, { start: 2.3, end: 4, text: '今日は晴れ。' }, { start: 9, end: 11, text: '次の話。' }];
  assert.deepStrictEqual(T.paragraphs(segs, '2026-11-15 10:30:00'), ['2026-11-15 10:30:00 こんにちは。今日は晴れ。', '2026-11-15 10:30:09 次の話。']);
  assert.deepStrictEqual(T.paragraphs(segs, '2026-11-15 23:59:55'), ['2026-11-15 23:59:55 こんにちは。今日は晴れ。', '2026-11-16 00:00:04 次の話。']);   // 日付をまたぐ
  assert.deepStrictEqual(T.paragraphs(segs.slice(0, 1), '2026-11-15 10:30'), ['2026-11-15 10:30:00 こんにちは。']);   // 秒の無い時刻も、秒まで
});

test('文字化: 句読点の無い区切りは「、」でつなぐ', () => {
  assert.deepStrictEqual(T.paragraphs([{ start: 0, end: 1, text: '表札ないわ' }, { start: 1, end: 2, text: '探してます' }], '2026-11-15 10:30:00'), ['2026-11-15 10:30:00 表札ないわ、探してます']);
});

test('文字化: 部品が無ければ、分かる言葉で失敗する（何も動かさない）', async () => {
  const r = await T.run({ py: null, model: null }, '/nonexistent.m4a');
  assert.strictEqual(r.ok, false); assert.match(r.error, /部品/);
});
