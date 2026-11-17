'use strict';
// スマホ（WebView版）から届く「受信箱」を取り込む。スマホは、既存のファイルを書き換えず、新しいファイルだけを書く:
//   memo-*.json   {"type":"memo","at":"2026-11-13 13:05","text":"…"}      → メモ帳（その日）へ1行追記。行の先頭に「年月日 時刻 」が付く（表示するかは、画面の設定）
//   diary-*.json  {"type":"diary","kind":"日記","date":"2026-11-13","text":"…"}        → その日の日記／時系列記録の本文へ追記
//   note-*.json   {"type":"note","created":"2026-11-13 13:20","body":"…"}              → IDなしのノート（未所属）を新しく作る
//   paper-*.json  {"type":"paper","at":"…","image":"paper-….jpg","name"?:{id,kws}} と画像  → 紙のカードの写真。スマホで名前（ID）を付けてあれば、そのまま紙のノートに。無ければ PC の紙の取り込み画面で
//   pm-*.json     {"type":"pmemo","book":"A","page":13,"image":"pm-….jpg"} と画像        → 紙のメモ帳のページ（P_memo-A-13.jpg）
//   rec-*.json    {"type":"audio","at":"…","file":"rec-….m4a","sec":12} と音声            → 録音。PC で文字にする（録音の一覧へ）
//   kinds-*.json  {"type":"kinds","kinds":["夢","仕事"]}            → スマホで作った時系列記録の種類（項目だけ。PC に無いものを足す。中身は送らない）
//   mark-*.json   {"type":"mark","kind":"メモ帳","date":"…","at":"…","n":3}              → 取り込み済みの吹き出しにメンションした: その行に (3) を付ける
//   note-*.json の parent / parentName と rel（child|sibling）               → その子（分岐）・並列の ID で作る
// 取り込めたファイルの名前を返す。呼び出し側は、その名前のファイルをスマホから消す（取り込んだら消える）
const L = require('./lib'), Stamp = require('./stamp');

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dateOf = at => String(at || '').slice(0, 10);
const stampAt = at => { const m = String(at || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/); return m ? Stamp.full(m[1] + ' ' + m[2]) : Stamp.nowStamp(); };   // いつも秒まで
const oneLine = t => String(t).replace(/\r?\n+/g, ' ').trim();

// files: [{name, buf}]（buf は Buffer）。papers: 紙の写真の保存先を決める関数 (name, buf) => 保存した名前（省略時は保存しない）
function importInbox(v, files, { papers, seen, named, pmemo, audio, suggest, ids } = {}) {   // ids: スマホのノートのファイル名 → 付けた ID（子・並列の親をたどるため。呼び出し側が覚える）   // seen: すでに取り込んだファイル名の集まり（消さずに残してあるものを、二度取り込まない）
  const sum = { memos: 0, diaries: 0, notes: 0, papers: 0, named: 0, pmemos: 0, audios: 0, marks: 0, kinds: 0, skipped: 0, already: 0 };
  const done = [], bad = [];
  const by = new Map(files.map(f => [f.name, f]));
  const sorted = files.filter(f => /\.json$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));   // 名前に時刻が入っているので、書いた順
  for (const f of sorted) {
    if (seen && seen.has(f.name)) { sum.already++; continue; }
    let d; try { d = JSON.parse(f.buf.toString('utf8')); } catch { bad.push(f.name); sum.skipped++; continue; }
    try {
      if (d.type === 'memo' && String(d.text || '').trim()) {
        const at = stampAt(d.at), date = at.slice(0, 10);
        v.appendToDay('メモ帳', date, Stamp.line(oneLine(d.text), at)); sum.memos++; done.push(f.name);   // 日時は、本文のすぐ後ろ（<!--…-->）
      } else if (d.type === 'diary' && isDate(d.date) && String(d.text || '').trim()) {
        v.appendToDay(d.kind || '日記', d.date, Stamp.add(String(d.text).replace(/\s+$/, ''), stampAt(d.at))); sum.diaries++; done.push(f.name);
      } else if (d.type === 'note' && String(d.body || '').trim()) {
        const base = d.parentName ? (ids && ids[d.parentName]) : d.parent;
        const id = base && (d.rel === 'child' || d.rel === 'sibling') && suggest ? suggest(base, d.rel) || undefined : undefined;
        const n = v.createNote({ kind: 'text', id, created: d.created || undefined, body: String(d.body).replace(/\s+$/, '') }); sum.notes++; done.push(f.name);
        if (ids && n && n.id && !n.noid) ids[f.name] = n.id;
      } else if (d.type === 'paper' && d.image && by.has(d.image)) {
        const buf = by.get(d.image).buf;
        if (d.name && d.name.id && named && named(d, buf)) sum.named++;   // スマホで付けた ID が、PC でまだ使われていなければ、そのまま紙のノートに
        else { if (papers) papers(d.image, buf, d); sum.papers++; }
        done.push(f.name, d.image);
      } else if (d.type === 'pmemo' && d.image && by.has(d.image) && /^[A-Z]+$/.test(String(d.book || '')) && +d.page > 0) {
        if (pmemo) pmemo(d, by.get(d.image).buf); sum.pmemos++; done.push(f.name, d.image);
      } else if (d.type === 'audio' && d.file && by.has(d.file)) {
        if (audio) audio({ ...d, at: stampAt(d.at) }, by.get(d.file).buf); sum.audios++; done.push(f.name, d.file);
      } else if (d.type === 'kinds' && Array.isArray(d.kinds)) {   // 項目だけ。PC に無い種類を足す（あるもの・使えない名前は、そのまま）
        for (const k of d.kinds) if (typeof k === 'string' && k.trim() && v.addRecord && v.addRecord(k.trim())) sum.kinds++;
        done.push(f.name);
      } else if (d.type === 'mark' && isDate(d.date) && +d.n > 0) {
        if (v.markLine) v.markLine(d.kind || '日記', d.date, stampAt(d.at), +d.n); sum.marks++; done.push(f.name);
      } else { bad.push(f.name); sum.skipped++; }
    } catch { bad.push(f.name); sum.skipped++; }
  }
  return { sum, done, bad };
}
const summary = s => [s.memos && `メモ ${s.memos} 件`, s.diaries && `日記 ${s.diaries} 件`, s.notes && `ノート ${s.notes} 件`, s.named && `名前つきの紙 ${s.named} 枚`, s.papers && `紙のカード ${s.papers} 枚（名前は取り込み画面で）`, s.pmemos && `紙のメモ帳 ${s.pmemos} ページ`, s.audios && `録音 ${s.audios} 件（文字にします）`, s.kinds && `時系列記録の種類 ${s.kinds} 件`, s.marks && `メンションの印 ${s.marks} 件`].filter(Boolean).join('、');

module.exports = { importInbox, summary };
