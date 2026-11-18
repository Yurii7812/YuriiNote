// トピックインデックスの地図（ブレスト型）。画面に依存しない部分
// 索引の文字（1 行 = 「キーワード ID ID …」、^ _ @ + などの印も今まで通り）が中身の元。地図は、その行を盤面に置いた位置と、行どうしの線だけを持つ
// 形: { v: 1, n: [[番号, x, y, 行の文字], …], l: [[番号, 番号], …] }
//   - 行の文字が変わっても（ID の付け替え・文字での編集）、同じ行・同じキーワードのノードは位置を保つ（reconcile）
//   - 地図で直したら、ノードの並び順に行をつなげたものが、索引の文字になる（toText）
const L = require('./lib.js');

const COL_W = 260, ROW_H = 46, X0 = 40, Y0 = 40, PER_COL = 18;

const indentOf = line => { const m = line.match(/^[ \t　]*/)[0]; return [...m].reduce((a, c) => a + (c === '\t' ? 4 : c === '　' ? 2 : 1), 0); };
// 行の「名前」（キーワード・印つきの名前）。文字での編集や ID の付け替えのあとも、同じノードだと見分けるため
function keyOf(line) {
  const r = L.topicLine(line);
  const name = r.mark !== undefined ? '@' + r.mark : r.up !== undefined ? '^' + r.up : r.down !== undefined ? '_' + r.down : r.before !== undefined ? '<' + r.before
    : r.ref ? '>' + r.ref.label : r.rel ? '+' + r.rel.kw : r.star !== undefined ? '*' + r.star : r.kw || '';
  return name.trim() || line.trim();
}
const lines = text => String(text || '').split('\n').filter(x => x.trim());
const isMark = line => { const r = L.topicLine(line); return r.mark !== undefined && !(r.ids || []).length; };

// 今のリスト型の索引から、地図を作る
//   - 字下げがあれば、木の形（字下げの浅い、すぐ上の行と線で結ぶ。深さごとに右へ）
//   - 字下げがなく、⭕（@ の見出し）があれば、見出しごとに列を分け、見出しと、その下の行を線で結ぶ
//   - どちらもなければ、縦に並べる（PER_COL 行ごとに次の列）
function convert(text) {
  const ls = lines(text), n = [], l = [];
  const depths = ls.map(indentOf), levels = [...new Set(depths)].sort((a, b) => a - b);
  if (levels.length > 1) {
    const stack = [];   // [深さ, 番号]
    ls.forEach((line, i) => {
      const d = depths[i], lv = levels.indexOf(d);
      while (stack.length && stack[stack.length - 1][0] >= d) stack.pop();
      if (stack.length) l.push([stack[stack.length - 1][1], i + 1]);
      stack.push([d, i + 1]);
      n.push([i + 1, X0 + lv * COL_W, Y0 + i * ROW_H, line]);
    });
  } else if (ls.some(isMark)) {   // 見出しを左に、その下の行を右の列に。見出しのまとまりは、上から順に積む
    let y = Y0, head = null, members = [];
    const flush = () => {
      if (head) n.push([head.i + 1, X0, members.length ? y + Math.floor((members.length - 1) / 2) * ROW_H : y, head.line]);
      members.forEach((m, k) => { n.push([m.i + 1, X0 + (head ? COL_W : 0), y + k * ROW_H, m.line]); if (head) l.push([head.i + 1, m.i + 1]); });
      if (head || members.length) y += Math.max(1, members.length) * ROW_H + ROW_H / 2;
      head = null; members = [];
    };
    ls.forEach((line, i) => { if (isMark(line)) { flush(); head = { i, line }; } else members.push({ i, line }); });
    flush();
    n.sort((a, b) => a[0] - b[0]);
  } else {
    ls.forEach((line, i) => n.push([i + 1, X0 + Math.floor(i / PER_COL) * COL_W, Y0 + (i % PER_COL) * ROW_H, line]));
  }
  return { v: 1, n, l };
}

const clean = m => m && Array.isArray(m.n) ? {
  v: 1,
  n: m.n.filter(a => Array.isArray(a) && a.length >= 4 && typeof a[3] === 'string').map(a => [+a[0] || 0, Math.round(+a[1] || 0), Math.round(+a[2] || 0), a[3]]),
  l: Array.isArray(m.l) ? m.l.filter(a => Array.isArray(a) && a.length >= 2).map(a => [+a[0] || 0, +a[1] || 0]) : []
} : null;

// 索引の文字に合わせて、地図を直す（行の順・中身は文字のとおり。位置と線は、できるだけ残す）
function reconcile(map, text) {
  const m = clean(map); if (!m) return convert(text);
  const ls = lines(text), used = new Set(), out = [];
  let next = Math.max(0, ...m.n.map(a => a[0])) + 1, prev = null;
  const take = f => { const a = m.n.find(x => !used.has(x[0]) && f(x)); if (a) used.add(a[0]); return a; };
  const hit = ls.map(line => take(x => x[3] === line));   // まず、まったく同じ行。次に、同じ名前の行
  ls.forEach((line, i) => { if (!hit[i]) hit[i] = take(x => keyOf(x[3]) === keyOf(line)); });
  ls.forEach((line, i) => {
    const a = hit[i] ? [hit[i][0], hit[i][1], hit[i][2], line]
      : [next++, prev ? prev[1] : X0, prev ? prev[2] + ROW_H : Y0 + out.length * ROW_H, line];   // 新しい行: 直前の行の下に
    out.push(a); prev = a;
  });
  const ids = new Set(out.map(a => a[0]));
  const seen = new Set(), l = m.l.filter(([a, b]) => { const k = a < b ? a + ':' + b : b + ':' + a; if (a === b || !ids.has(a) || !ids.has(b) || seen.has(k)) return false; seen.add(k); return true; });
  return { v: 1, n: out, l };
}

const toText = map => (clean(map) || { n: [] }).n.map(a => a[3]).join('\n');
const same = (a, b) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));

module.exports = { convert, reconcile, toText, keyOf, clean, same, COL_W, ROW_H };
