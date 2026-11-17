const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { openVault } = require('../store');
const { importInbox, summary } = require('../phone-inbox');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-'));
const J = (name, o) => ({ name, buf: Buffer.from(JSON.stringify(o)) });

test('スマホの受信箱: メモ帳・日記・ノート・紙を取り込み、取り込めたものを返す', () => {
  const v = openVault(tmp()), got = [];
  const files = [
    J('memo-1-a.json', { type: 'memo', at: '2026-11-13 08:12', text: '朝の考え', stamp: true }),
    J('memo-2-b.json', { type: 'memo', at: '2026-11-13 10:40', text: '二つ目\nの続き', stamp: true }),
    J('memo-3-c.json', { type: 'memo', at: '2026-11-13 11:00', text: '時刻なし', stamp: false }),
    J('diary-4-d.json', { type: 'diary', kind: '日記', date: '2026-11-13', text: '今日は読書をした。' }),
    J('note-5-e.json', { type: 'note', created: '2026-11-13 13:20', body: '読書メモの書き方を整理したい' }),
    J('paper-6-f.json', { type: 'paper', at: '2026-11-13 14:00', image: 'paper-6-f.jpg' }), { name: 'paper-6-f.jpg', buf: Buffer.from([0xff, 0xd8, 0xff]) },
    { name: 'broken.json', buf: Buffer.from('{') }, J('memo-7-g.json', { type: 'memo', at: '2026-11-13 12:00', text: '   ' })
  ];
  const r = importInbox(v, files, { papers: (name, buf) => got.push([name, buf.length]) });
  assert.deepStrictEqual(r.sum, { memos: 3, diaries: 1, notes: 1, papers: 1, named: 0, pmemos: 0, audios: 0, marks: 0, kinds: 0, skipped: 2, already: 0 });
  const memo = v.state().diaries.find(d => d.kind === 'メモ帳' && d.date === '2026-11-13').body;
  assert.strictEqual(memo, '朝の考え<!--2026-11-13 08:12:00-->\n二つ目 の続き<!--2026-11-13 10:40:00-->\n時刻なし<!--2026-11-13 11:00:00-->');   // いつも秒まで   // 1件1行・改行は空白に・全部に年月日と時刻
  assert.match(v.state().diaries.find(d => d.kind === '日記' && d.date === '2026-11-13').body, /今日は読書をした。<!--\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}-->/);
  const note = v.state().notes.find(n => /読書メモの書き方/.test(n.body));
  assert.ok(note && note.s === 'd' && note.id === note.stem && /^\d{14}$/.test(note.id));   // ID なし（ファイル名が ID 代わり）＝未所属
  assert.deepStrictEqual(got, [['paper-6-f.jpg', 3]]);
  assert.deepStrictEqual(r.done.sort(), ['memo-1-a.json', 'memo-2-b.json', 'memo-3-c.json', 'diary-4-d.json', 'note-5-e.json', 'paper-6-f.json', 'paper-6-f.jpg'].sort());
  assert.deepStrictEqual(r.bad.sort(), ['broken.json', 'memo-7-g.json']);
  assert.strictEqual(summary(r.sum), 'メモ 3 件、日記 1 件、ノート 1 件、紙のカード 1 枚（名前は取り込み画面で）');
});

test('スマホの受信箱: 消さずに残してあるファイルは、二度取り込まない', () => {
  const v = openVault(tmp()), files = [J('memo-1.json', { type: 'memo', at: '2026-11-13 08:12', text: '一度だけ', stamp: true }), J('memo-2.json', { type: 'memo', at: '2026-11-13 09:00', text: '新しい', stamp: true })];
  const first = importInbox(v, files.slice(0, 1));
  const second = importInbox(v, files, { seen: new Set(first.done) });
  assert.strictEqual(second.sum.memos, 1); assert.strictEqual(second.sum.already, 1);
  assert.strictEqual(v.state().diaries.find(d => d.kind === 'メモ帳').body, '一度だけ<!--2026-11-13 08:12:00-->\n新しい<!--2026-11-13 09:00:00-->');
});

test('スマホの受信箱: 時刻の順に入る・分岐/並列の ID・名前つきの紙・紙のメモ帳・録音・メンションの印', () => {
  const v = openVault(tmp());
  v.saveNote({ s: 'd', id: '1', body: '数学' }); v.saveNote({ s: 'd', id: '1a', body: '掛け算' });
  v.appendToDay('メモ帳', '2026-11-15', 'もとからPCにあった文<!--2026-11-15 11:30:00-->');
  const ids = {}, pm = [], au = [], named = [];
  const files = [
    J('memo-1.json', { type: 'memo', at: '2026-11-15 10:30:00', text: '取り込まれた文' }),
    J('note-10.json', { type: 'note', created: '2026-11-15 10:00:00', body: '1a の子', parent: '1a', rel: 'child' }),
    J('note-11.json', { type: 'note', created: '2026-11-15 10:01:00', body: '孫', parentName: 'note-10.json', rel: 'child' }),
    J('note-12.json', { type: 'note', created: '2026-11-15 10:02:00', body: '1a と並列', parent: '1a', rel: 'sibling' }),
    J('paper-20.json', { type: 'paper', at: '2026-11-15 10:00:00', image: 'paper-20.jpg', name: { id: '7b', kws: ['時間'] } }), { name: 'paper-20.jpg', buf: Buffer.from([1]) },
    J('pm-30-l.json', { type: 'pmemo', at: '2026-11-15 10:00:00', book: 'A', page: 13, image: 'pm-30-l.jpg' }), { name: 'pm-30-l.jpg', buf: Buffer.from([2]) },
    J('rec-40.json', { type: 'audio', at: '2026-11-15 10:05', file: 'rec-40.m4a', sec: 30 }), { name: 'rec-40.m4a', buf: Buffer.from([3]) },
    J('mark-50.json', { type: 'mark', kind: 'メモ帳', date: '2026-11-15', at: '2026-11-15 11:30:00', n: 2 })
  ];
  const sug = (base, rel) => require('../id-explorer-core').suggest(v.state().notes, v.state().notes.find(n => n.s === 'd' && n.id === base), rel);
  const r = importInbox(v, files, { ids, suggest: sug, named: d => { named.push(d.name.id); return true; }, pmemo: d => pm.push([d.book, d.page]), audio: d => au.push([d.at, d.sec]) });
  assert.strictEqual(r.sum.notes, 3); assert.strictEqual(r.sum.named, 1); assert.strictEqual(r.sum.pmemos, 1); assert.strictEqual(r.sum.audios, 1); assert.strictEqual(r.sum.marks, 1);
  const memo = v.state().diaries.find(d => d.kind === 'メモ帳' && d.date === '2026-11-15').body;
  assert.strictEqual(memo, '取り込まれた文<!--2026-11-15 10:30:00-->\nもとからPCにあった文 (2)<!--2026-11-15 11:30:00-->');   // 時刻の順・印
  const has = id => v.state().notes.some(n => n.s === 'd' && n.id === id);
  assert.ok(has('1a1') && has('1a1a') && has('1b'), JSON.stringify(v.state().notes.map(n => n.id)));
  assert.deepStrictEqual(ids, { 'note-10.json': '1a1', 'note-11.json': '1a1a', 'note-12.json': '1b' });
  assert.deepStrictEqual(named, ['7b']); assert.deepStrictEqual(pm, [['A', 13]]); assert.deepStrictEqual(au, [['2026-11-15 10:05:00', 30]]);
});

test('スマホの受信箱: メモ帳のページの「撮り直し（replace）」は、そのまま PC へ渡る', () => {
  const v = openVault(tmp()), got = [];
  const files = [
    J('pm-60.json', { type: 'pmemo', at: '2026-11-15 12:00:00', book: 'A', page: 14, image: 'pm-60.jpg', replace: true }), { name: 'pm-60.jpg', buf: Buffer.from([1]) },
    J('pm-61.json', { type: 'pmemo', at: '2026-11-15 12:00:01', book: 'A', page: 15, image: 'pm-61.jpg' }), { name: 'pm-61.jpg', buf: Buffer.from([2]) }
  ];
  const r = importInbox(v, files, { pmemo: d => got.push([d.book, d.page, !!d.replace]) });
  assert.strictEqual(r.sum.pmemos, 2); assert.deepStrictEqual(got, [['A', 14, true], ['A', 15, false]]);
});

test('スマホの受信箱: 時系列記録の種類は、項目だけ取り込む（PC に無いものを足す。あるもの・使えない名前は、そのまま）', () => {
  const v = openVault(tmp()); v.addRecord('仕事');
  const r = importInbox(v, [J('kinds-1-a.json', { type: 'kinds', kinds: ['夢', '仕事', '日記', '', 'a/b', '学び'] }), J('kinds-2-b.json', { type: 'kinds', kinds: ['夢'] })]);
  assert.strictEqual(r.sum.kinds, 2, '夢・学び だけ新しく（仕事は元からあり、日記は固定、空・使えない名前は足さない。2 つ目の 夢 は既にある）');
  assert.deepStrictEqual(v.records().map(x => x.name).sort(), ['メモ帳', '仕事', '学び', '夢', '日記'].sort());
  assert.deepStrictEqual(r.done.sort(), ['kinds-1-a.json', 'kinds-2-b.json'], '取り込み済みの印を返せる（スマホが自分で消す）');
  assert.match(summary(r.sum), /時系列記録の種類 2 件/);
  assert.deepStrictEqual(v.state().diaries, [], '種類を足しても、日・記録のノートは作らない');
});
