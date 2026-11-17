'use strict';
// 行ごとの「年月日＋時刻」。行の本文のすぐ後ろに、見えないコメントで持つ: 「本文<!--2026-11-13 12:54:30-->」（2026-11-17 から。md で読んでも本文に混ざらない）。
// 画面では、行の頭に出す（表示のオン・オフは画面だけ）。昔の形（行頭の「2026-11-13 12:54 本文」・行末に空白つきの「 <!--…-->」）も読める。直すのは migrate
//   例:  - 買い物<!--2026-11-13 12:54:30-->      ## まとめ<!--2026-11-13 12:54:30-->
const D = '\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}(?::\\d{2})?';   // 年月日 時:分:秒（昔の「時:分」までも読める）
const TAIL = new RegExp('<!--(' + D + ')-->[ \\t]*$');              // 行末の <!--時刻-->（後ろの空白は、md の改行用）
const LEGACY = new RegExp('[ \\t]*<!--(' + D + ')-->[ \\t]*$');     // 前の空白ごと（外すとき）
const PREFIX = /^(\s*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?)/;
const HEAD = new RegExp('^(' + D + ')(?: |$)');                    // 昔の形: 記号のあと、行頭の日時
const pad = n => String(n).padStart(2, '0');
const nowStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const prefixLen = line => PREFIX.exec(line)[1].length;
// 本文のあとの日時: { p: 画面で日時を出す位置（記号のあと）, at: 日時, cs: コメントの始まり, ce: コメントの終わり } 。無ければ null
function parse(line) {
  line = String(line); const m = TAIL.exec(line); if (!m) return null;
  const cs = m.index, ce = cs + m[0].replace(/[ \t]+$/, '').length;
  return { p: Math.min(prefixLen(line), cs), at: m[1], cs, ce };
}
// 昔の形（行頭）の日時: { p: 記号の長さ, at: 日時, end: 日時（と後ろの空白）の終わり } 。無ければ null
function parseHead(line) {
  const p = prefixLen(line), m = HEAD.exec(String(line).slice(p));
  return m ? { p, at: m[1], end: p + m[0].length } : null;
}
const stampOf = line => { const t = parse(line); if (t) return t.at; const h = parseHead(String(line)); return h ? h.at : ''; };
const TAILX = new RegExp('[ \\t]*<!--(' + D + ')-->([ \\t]*)$');
const stripLine = line => {   // 日時を外す（本文のすぐ後ろのコメントと、昔の行頭の日時）。コメントの後ろの空白（md の改行用）は残す
  line = String(line); const h = parseHead(line);
  return (h ? line.slice(0, h.p) + line.slice(h.end) : line).replace(TAILX, '$2');
};
const strip = text => String(text).split('\n').map(stripLine).join('\n');   // 題・検索・一覧の見出しなど、日時がじゃまなところで使う
const body = line => stripLine(line).trim();   // 日時を除いた中身
const fenceOpen = line => { const m = line.match(/^\s*(`{3,}|~{3,})/); return m ? m[1] : null; };
const fenceInfo = line => { const m = line.match(/^\s*(?:`{3,}|~{3,})\s*(\S*)/); return m ? m[1] : ''; };   // ``` のあとの言語名（無ければ ''）
// 目印を付けられない行: コード・ボード・mermaid の囲みの中、表の行、区切り線、自動で入る行（日記の「## 今日の記録」などの見出し、リンクだけの行、:ID だけの行）
const skipLine = line => /^\s*\|/.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  || /^\s*##\s+(今日の記録|紙の日記|今日のノート|今日のチャットメモ一覧)\s*$/.test(line) || /^\s*(-\s+)?!?\[[^\]]*\]\([^)]*\)\s*$/.test(line) || /^\s*(-\s+)?:[0-9a-z]+\s*$/.test(line)
  || /^\s*([-*+]|\d+[.)])\s*(\[[ xX]\])?\s*$/.test(line);
const stampable = line => line.trim() !== '' && !stampOf(line) && !skipLine(line);
// 行の中の日時コメントを、全部（本文の途中に残ったものも）: [{ at, from, to }]
const all = line => { const rx = new RegExp('<!--(' + D + ')-->', 'g'), out = []; let m; while ((m = rx.exec(String(line)))) out.push({ at: m[1], from: m.index, to: m.index + m[0].length }); return out; };
// 日時を除いた本文（記号のあと）が空か。日時だけが残った行・記号だけの行は、本文が無い
const textless = line => { const bare = String(line).replace(new RegExp('<!--(' + D + ')-->', 'g'), ''); return bare.slice(prefixLen(bare)).trim() === ''; };
// 外へ出す文章（コピー・書き出し）で、時刻を見える形にする: 「- 買い物<!--t-->」→「- t 買い物」（記号のあとに日時）。画面で時刻を出しているときの、見え方
const visible = text => String(text).split('\n').map(l => { const t = parse(l); return t ? l.slice(0, t.p) + t.at + ' ' + l.slice(t.p, t.cs) + l.slice(t.ce) : l; }).join('\n');
// 行に日時を付ける: 本文のすぐ後ろ（行末の空白は、その後ろ）
const tag = (line, at) => { const m = /^([\s\S]*?)([ \t]*)$/.exec(line); return m[1] + '<!--' + at + '-->' + m[2]; };
// 書く側が、1 行ぶんの本文と日時から、行を作る（スマホの取り込み・文字化など）
const line = (text, at) => tag(String(text), at);
// text の中の、まだ日時が無い行すべてに at を付ける（lines: 付ける行番号(0始まり)の集まり。省略で全部。at は、日時か、行番号から日時を返す関数）
function add(text, at, lines) {
  // 囲み（```）の中は、言語名が無い（ふつうの文章の引用）ときだけ、行ごとに付ける。mermaid・board・コードの言語つきには付けない
  const out = text.split('\n'); let fence = null, plain = false;
  for (let i = 0; i < out.length; i++) {
    const f = fenceOpen(out[i]);
    if (fence) { if (f && f[0] === fence[0] && f.length >= fence.length && /^\s*[`~]+\s*$/.test(out[i])) { fence = null; plain = false; continue; } if (!plain) continue; }
    else if (f) { fence = f; plain = fenceInfo(out[i]) === ''; continue; }
    if (lines && !lines.has(i)) continue;
    if (stampable(out[i])) out[i] = tag(out[i], typeof at === 'function' ? at(i) : at);
  }
  return out.join('\n');
}
// 日時が無いまま残っている行（昔の編集・他のソフトで書いた行）に、日時を補う。すぐ前の日時のある行の日時を引き継ぐ（前が無ければ、後ろの行、それも無ければ fallback）
function fill(text, fallback) {
  const lines = String(text).split('\n'), known = lines.map(stampOf), next = new Array(lines.length);
  let nx = ''; for (let i = lines.length - 1; i >= 0; i--) { if (known[i]) nx = known[i]; next[i] = nx; }
  const prevOf = i => { for (let j = i - 1; j >= 0; j--) if (known[j]) return known[j]; return ''; };
  return add(text, i => { const at = prevOf(i) || next[i] || fallback; known[i] = at; return at; });
}
// 昔の形（行頭の日時・行末の空白つきコメント）を、いまの形（本文のすぐ後ろ）に直す
function migrate(text) {
  return String(text).split('\n').map(l => {
    const t = parse(l);
    if (t) { const before = l.slice(0, t.cs); return /[ \t]$/.test(before) ? before.replace(/[ \t]+$/, '') + l.slice(t.cs) : l; }   // コメントの前の空白を詰める
    const h = parseHead(l); if (!h) return l;
    return tag(l.slice(0, h.p) + l.slice(h.end), h.at);
  }).join('\n');
}
// 日記・メモ帳に昔あった「13:05 本文」（時刻だけ）の行を、その日の年月日つきにする（date: その日の 2026-11-13）。コード等の囲みの中は変えない
function adoptTimes(text, date) {
  const out = text.split('\n'); let fence = null;
  for (let i = 0; i < out.length; i++) {
    const f = fenceOpen(out[i]);
    if (fence) { if (f && f[0] === fence[0] && f.length >= fence.length && /^\s*[`~]+\s*$/.test(out[i])) fence = null; continue; }
    if (f) { fence = f; continue; }
    const p = prefixLen(out[i]), m = out[i].slice(p).match(/^([01]\d|2[0-3]):([0-5]\d)(?: |$)/);
    if (m && !stampOf(out[i])) out[i] = tag(out[i].slice(0, p) + out[i].slice(p + 5).replace(/^ /, ''), date + ' ' + m[1] + ':' + m[2] + ':00');   // 保存は、いつも秒まで
  }
  return out.join('\n');
}
// 「時:分」までの日時に「:00」を足して、秒までにする（保存は、いつも秒まで）
const full = at => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(at || '')) ? at + ':00' : String(at || '');
// 本文の日時のうち、秒の無いものを、秒までにする（コード等の囲みの中は変えない）
function secs(text) {
  const out = String(text).split('\n'); let fence = null;
  for (let i = 0; i < out.length; i++) {
    const f = fenceOpen(out[i]);
    if (fence) { if (f && f[0] === fence[0] && f.length >= fence.length && /^\s*[`~]+\s*$/.test(out[i])) fence = null; continue; }
    if (f) { fence = f; continue; }
    const t = parse(out[i]);
    if (t && t.at.length === 16) { out[i] = out[i].slice(0, t.cs) + '<!--' + t.at + ':00-->' + out[i].slice(t.ce); continue; }
    const h = parseHead(out[i]); if (h && h.at.length === 16) out[i] = out[i].slice(0, h.p) + h.at + ':00' + out[i].slice(h.p + 16);
  }
  return out.join('\n');
}
// block（先頭の行の日時が at）を、text の中の時刻の順の場所に入れる。at より後の、最初の日時つきの行の前へ（無ければ末尾）。
// 日時の無い行は、すぐ上の日時の行の続きとみなして、動かさない
function insertByTime(text, block, at) {
  const key = full(at), lines = text ? String(text).split('\n') : []; let fence = null, idx = -1;
  if (key) for (let i = 0; i < lines.length; i++) {
    const f = fenceOpen(lines[i]);
    if (fence) { if (f && f[0] === fence[0] && f.length >= fence.length && /^\s*[`~]+\s*$/.test(lines[i])) fence = null; continue; }
    if (f) { fence = f; continue; }
    const at2 = stampOf(lines[i]); if (at2 && full(at2) > key) { idx = i; break; }
  }
  if (idx < 0) { const t = String(text || '').replace(/\s+$/, ''); return (t ? t + '\n' : '') + block; }
  return [...lines.slice(0, idx), ...String(block).split('\n'), ...lines.slice(idx)].join('\n');
}
// 画面に出すときの形。fmt: 「全部」（保存したとおり）か、「カスタム」:
//   { y, mo, d, h, mi, s: 出す部分（年・月・日・時・分・秒）, dsep: 日付の区切り（既定 -）, tsep: 時刻の区切り（既定 :）, short: 今日の行は日付を省く }
// 昔の { sec, short } も読める（保存は、いつも「年月日 時:分:秒」）
const ALL = { all: true };
const normFmt = f => {
  if (!f || f.all) return ALL;
  if ('sec' in f && !('s' in f)) return { y: true, mo: true, d: true, h: true, mi: true, s: f.sec !== false, dsep: '-', tsep: ':', short: !!f.short };
  const t = k => f[k] !== false;
  return { y: t('y'), mo: t('mo'), d: t('d'), h: t('h'), mi: t('mi'), s: t('s'), dsep: f.dsep ?? '-', tsep: f.tsep ?? ':', short: !!f.short, ja: !!f.ja, name: f.name };
};
const format = (at, fmt, today = nowStamp().slice(0, 10)) => {
  if (!at) return '';
  const f = normFmt(fmt); if (f.all) return at;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(at); if (!m) return at;
  const date = f.ja ? [f.y && m[1] + '年', f.mo && m[2] + '月', f.d && m[3] + '日'].filter(Boolean).join('') : [f.y && m[1], f.mo && m[2], f.d && m[3]].filter(Boolean).join(f.dsep);
  const time = f.ja ? [f.h && m[4] + '時', f.mi && m[5] + '分', f.s && m[6] && m[6] + '秒'].filter(Boolean).join('') : [f.h && m[4], f.mi && m[5], f.s && m[6]].filter(Boolean).join(f.tsep);   // 秒が無い昔の行は、秒を出さない
  return [f.short && at.slice(0, 10) === today ? '' : date, time].filter(Boolean).join(' ');
};
const show = (at, today) => at ? format(at, { sec: false, short: !!today }, today || undefined) : '';

module.exports = { full, secs, insertByTime, LEGACY, nowStamp, parse, parseHead, all, textless, visible, fill, prefixLen, stampOf, stripLine, strip, body, stampable, add, line, tag, adoptTimes, migrate, format, normFmt, show };
