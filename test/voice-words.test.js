'use strict';
const test = require('node:test'), assert = require('node:assert');
const V = require('../voice-words');

test('直した所から、直しと単語を覚える', () => {
  const d = {};
  const got = V.learn(d, '2026-11-15 10:00:00 説一切う部の考え方は、ゆんぐの個性化と似ている。', '2026-11-15 10:00:00 説一切有部の考え方は、ユングの個性化と似ている。', 't');
  assert.deepStrictEqual(got.fixes, [{ from: '説一切う部', to: '説一切有部' }, { from: 'ゆんぐ', to: 'ユング' }]);
  assert.deepStrictEqual(got.words, ['説一切有部', 'ユング']);
  assert.strictEqual(d.words.find(w => w.w === 'ユング').r, 'ゆんぐ');   // かなで出た所を直した → よみ
});
test('句読点・言いよどみを消しただけの直しは、覚えない', () => {
  assert.deepStrictEqual(V.learn({}, 'あの、探してます', '探してます'), { fixes: [], words: [] });
});
test('覚えた直しを、次の文字にかける', () => {
  const d = {}; V.learn(d, '日付けを書く。フォルゲツェッテルの話', '日付を書く。Folgezettelの話');
  assert.strictEqual(V.applyFixes(d, '右上に日付けを、フォルゲツェッテルで'), '右上に日付を、Folgezettelで');
});
test('逆の直しをしたら、前の直しは捨てる', () => {
  const d = {}; V.learn(d, '構成を見る', '校正を見る'); V.learn(d, '校正を見る', '構成を見る');
  assert.deepStrictEqual(d.fixes.map(f => `${f.from}>${f.to}`), ['校正>構成']);
});
test('読みが同じで、いくつにも割れた所を、単語に直す（ふつうの 1 語は直さない）', () => {
  // 小さな読みの辞書で試す（本物は kuromoji）
  const dict = { '説一切有部': [['説一切有部', 'セツイッサイウブ']], 'せつ': [['せつ', 'セツ']], 'いっさい': [['いっさい', 'イッサイ']], 'うぶ': [['うぶ', 'ウブ']], '構成': [['構成', 'コウセイ']], '校正': [['校正', 'コウセイ']] };
  const tokenize = s => { const out = []; let i = 0; const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    while (i < s.length) { const k = keys.find(k => s.startsWith(k, i)); if (k) { out.push({ surface_form: k, reading: dict[k][0][1] }); i += k.length; } else { out.push({ surface_form: s[i], reading: '*' }); i++; } } return out; };
  assert.strictEqual(V.fixByReading(tokenize, 'せついっさいうぶの話', ['説一切有部']), '説一切有部の話');
  assert.strictEqual(V.fixByReading(tokenize, '構成を見る', ['校正']), '構成を見る');
  assert.strictEqual(V.fixByReading(tokenize, 'せついっさいうぶ', ['x'], {}), 'せついっさいうぶ');
});
test('手がかりの語: 手で足した語・直した語 → キーワード → 入っていた用語集。文章の形にする', () => {
  const d = { words: [{ w: '歯科', src: 'seed' }, { w: '共時性', src: 'edit', n: 3 }, { w: '神智学', src: 'manual' }, { w: '使わない', src: 'edit', off: true }] };
  assert.deepStrictEqual(V.promptWords(d, ['索引'], { seeds: ['歯科'] }), ['神智学', '共時性', '索引', '歯科']);
  assert.match(V.promptText(['索引']), /^次は日本語の話し言葉の録音です。.*用語：索引。$/);
  assert.strictEqual(V.promptText([]), '');
});
