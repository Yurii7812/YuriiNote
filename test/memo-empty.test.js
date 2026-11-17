// 何も書いていない日・記録（日記・メモ帳・夢…）は作らない（開いただけでは作らない）。書けば作る。消せば消える。閉じて空なら記録ごと消す
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { openVault } = require('../store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'memo-'));
const mdFiles = dir => fs.readdirSync(dir).filter(f => /^\d{14}\.md$/.test(f));
const stemOf = (v, kind, date) => v.state().diaries.find(d => d.kind === kind && d.date === date).stem;
const KINDS = ['日記', 'メモ帳', '夢'];

for (const kind of KINDS) {
  test(`${kind}を開いただけでは、ファイルを作らない`, () => {
    const dir = tmp(), v = openVault(dir), date = '2026-11-17', before = mdFiles(dir);
    assert.ok(v.openDiary(date, kind), '開く操作そのものはできる（画面に出す）');
    assert.deepStrictEqual(mdFiles(dir), before, 'ファイルは増えない');
  });

  test(`${kind}に書けば、ファイルができる。全部消せば、また無くなる`, () => {
    const dir = tmp(), v = openVault(dir), date = '2026-11-17';
    v.openDiary(date, kind);
    v.saveDiary({ date, kind, body: '書いた' });
    const f = stemOf(v, kind, date) + '.md';
    assert.ok(fs.existsSync(path.join(dir, f)), '書いたらできる');
    v.saveDiary({ date, kind, body: '' });
    assert.ok(!fs.existsSync(path.join(dir, f)), '全部消したら、ファイルは無くなる（ごみ箱へ）');
  });

  test(`${kind}: 閉じて空なら、記録ごと消す。中身があれば消さない`, () => {
    const dir = tmp(), v = openVault(dir);
    v.openDiary('2026-11-17', kind);
    assert.strictEqual(v.dropEmptyDay('2026-11-17', kind), true);
    assert.ok(!v.state().diaries.some(d => d.kind === kind && d.date === '2026-11-17'), '一覧にも残らない');
    v.openDiary('2026-11-18', kind); v.saveDiary({ date: '2026-11-18', kind, body: 'ある' });
    assert.strictEqual(v.dropEmptyDay('2026-11-18', kind), false);
    assert.ok(v.state().diaries.some(d => d.kind === kind && d.date === '2026-11-18'));
  });
}

test('空のメモ帳・夢には、日記からのリンクを張らない。書けば、日記にリンクが出る', () => {
  const dir = tmp(), v = openVault(dir), date = '2026-11-17';
  v.openDiary(date, '日記'); v.openDiary(date, 'メモ帳'); v.openDiary(date, '夢');
  const diaryText = () => fs.existsSync(path.join(dir, stemOf(v, '日記', date) + '.md')) ? fs.readFileSync(path.join(dir, stemOf(v, '日記', date) + '.md'), 'utf8') : '';
  assert.ok(!diaryText().includes('今日の記録'), '空なら、リンクは出ない（日記も作られない）');
  v.saveDiary({ date, kind: 'メモ帳', body: '書いた' });
  const f = stemOf(v, 'メモ帳', date) + '.md';
  assert.ok(diaryText().includes(f), '書いたら、日記にリンクが出る（日記も、リンクのために作られる）');
});

test('以前に作られた空のファイルは、開くと片づく', () => {
  const dir = tmp(); let v = openVault(dir); const date = '2026-11-16';
  v.openDiary(date, '夢'); v.saveDiary({ date, kind: '夢', body: 'a' });
  const p = path.join(dir, stemOf(v, '夢', date) + '.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/<!-- body -->[\s\S]*<!-- nav -->/, '<!-- body -->\n\n<!-- nav -->'));   // 空にしたファイル
  v = openVault(dir); v.openDiary('2026-11-17', '夢');
  assert.ok(!fs.existsSync(p), '空のファイルは、ごみ箱へ移る');
});
