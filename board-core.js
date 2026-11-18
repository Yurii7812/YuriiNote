// 盤面（ブレスト・索引の地図・ノートの中の小さなボード）の、画面に依存しない部分
// 盤面の中身（エンジンが扱う形。保存の形は、使う所ごとに下の変換で行き来する）:
//   { n: [{ id, x, y, text, k? }], l: [[id, id], …], s: [[x1, y1, x2, y2, …], …] }
//     n = ノード（k は種類。今は省略 = 文字。あとでカードなどを足す）　l = ノード同士の線（向きなし）　s = ペンの線
// 保存の形 v2（ノートの中の ```board と、ブレストのノートの pkm-data）:
//   { "v": 2, "h": 高さ, "t": [[x, y, "文字", 種類?], …], "l": [[i, j], …], "s": [[…], …] }   i, j は t の何番目か（0 から）
//   v1（{ h, t: [[x, y, "文字"]], s }）は、そのまま読める（線なし）。保存するときに v2 になる
const MIN_H = 220, DEF_H = 320;

const num = v => Math.round(+v || 0);
// 線: 自分自身・無いノード・同じ組（向き違いも）を除く
function cleanLinks(l, ids) {
  const seen = new Set(), out = [];
  for (const a of Array.isArray(l) ? l : []) {
    if (!Array.isArray(a) || a.length < 2) continue;
    const p = +a[0], q = +a[1], k = p < q ? p + ':' + q : q + ':' + p;
    if (p === q || !ids.has(p) || !ids.has(q) || seen.has(k)) continue;
    seen.add(k); out.push([p, q]);
  }
  return out;
}
const cleanStrokes = s => Array.isArray(s) ? s.filter(a => Array.isArray(a) && a.length >= 4).map(a => a.map(num)) : [];

// v1・v2 の JSON（文字でも、もの でも）→ v2 の形
function parseBoard(src) {
  let d = src;
  if (typeof src === 'string') { try { d = JSON.parse(src); } catch { d = null; } }
  if (!d || typeof d !== 'object') d = {};
  const t = Array.isArray(d.t) ? d.t.filter(a => Array.isArray(a) && typeof a[2] === 'string').map(a => a[3] ? [num(a[0]), num(a[1]), a[2], String(a[3])] : [num(a[0]), num(a[1]), a[2]]) : [];
  const idx = new Set(t.map((_, i) => i));
  return { v: 2, h: Math.max(MIN_H, +d.h || DEF_H), t, l: cleanLinks(d.l, idx), s: cleanStrokes(d.s) };
}
const dumpBoard = d => JSON.stringify({ v: 2, h: Math.round(d.h || DEF_H), t: d.t, l: d.l || [], s: d.s || [] });

// 保存の形 ⇄ エンジンの形
function fromBoard(d) {
  const b = parseBoard(d);
  return { n: b.t.map((a, i) => ({ id: i + 1, x: a[0], y: a[1], text: a[2], ...(a[3] ? { k: a[3] } : {}) })), l: b.l.map(([p, q]) => [p + 1, q + 1]), s: b.s };
}
function toBoard(m, h) {
  const c = clean(m), at = new Map(c.n.map((a, i) => [a.id, i]));
  return { v: 2, h: Math.max(MIN_H, +h || DEF_H), t: c.n.map(a => a.k ? [a.x, a.y, a.text, a.k] : [a.x, a.y, a.text]), l: c.l.map(([p, q]) => [at.get(p), at.get(q)]), s: c.s };
}
// 索引の地図（topic-map.js の { v:1, n:[[id,x,y,行]], l }）⇄ エンジンの形
const fromMap = m => clean({ n: (m && m.n || []).map(a => ({ id: a[0], x: a[1], y: a[2], text: a[3] })), l: m && m.l, s: [] });
const toMap = m => { const c = clean(m); return { v: 1, n: c.n.map(a => [a.id, a.x, a.y, a.text]), l: c.l }; };

function clean(m) {
  m = m || {};
  const seen = new Set(), n = [];
  for (const a of Array.isArray(m.n) ? m.n : []) {
    if (!a || typeof a.text !== 'string') continue;
    let id = +a.id || 0; if (!id || seen.has(id)) id = 0;
    n.push({ id, x: num(a.x), y: num(a.y), text: a.text, ...(a.k ? { k: String(a.k) } : {}) }); if (id) seen.add(id);
  }
  let next = Math.max(0, ...seen) + 1; for (const a of n) if (!a.id) { a.id = next++; seen.add(a.id); }
  return { n, l: cleanLinks(m.l, seen), s: cleanStrokes(m.s) };
}
const empty = () => ({ n: [], l: [], s: [] });
const nextId = m => Math.max(0, ...m.n.map(a => a.id)) + 1;
const neighbors = (m, id) => m.l.filter(([p, q]) => p === id || q === id).map(([p, q]) => p === id ? q : p);

// ノードを木の形に並べる（文章に書き出すため）。線には向きがないので、左上のノードから順にたどる
//   根: まだ出していないノードのうち、いちばん左上のもの（線の多いものを先に）。子: つながっていて、まだ出していないもの（上から順）
function tree(m) {
  const c = clean(m), by = new Map(c.n.map(a => [a.id, a])), done = new Set(), out = [];
  const order = (a, b) => a.y - b.y || a.x - b.x || a.id - b.id;
  const deg = id => neighbors(c, id).length;
  const walk = (id, depth) => {
    done.add(id); out.push({ id, depth, text: by.get(id).text });
    for (const k of neighbors(c, id).filter(k => !done.has(k)).map(k => by.get(k)).sort(order)) if (!done.has(k.id)) walk(k.id, depth + 1);
  };
  const rest = () => c.n.filter(a => !done.has(a.id));
  while (rest().length) {
    const r = rest(), linked = r.filter(a => deg(a.id));
    const pick = (linked.length ? linked : r).sort((a, b) => a.x + a.y - (b.x + b.y) || order(a, b))[0];
    walk(pick.id, 0);
  }
  return out;
}
// 木の形の文章（アプリなしで読める・検索に引っかかる）。複数行の文字は、続きの行を字下げする
function treeText(m) {
  return tree(m).filter(r => r.text.trim()).map(r => {
    const pad = '  '.repeat(r.depth), [first, ...more] = r.text.replace(/\s+$/, '').split('\n');
    return [pad + '- ' + first, ...more.map(x => pad + '  ' + x)].join('\n');
  }).join('\n');
}

module.exports = { MIN_H, DEF_H, parseBoard, dumpBoard, fromBoard, toBoard, fromMap, toMap, clean, empty, nextId, neighbors, tree, treeText };
