'use strict';
// 音声入力の言葉（VoiceTranscribe と同じ考え方）。
//   - 文字を自分で直して保存すると、直した所を「直し」（前 → 後）として覚え、直した後の語を「単語」として覚える
//   - 次からの文字化: 単語を文字化の手がかり（initial_prompt）に渡し、出てきた文には、覚えた直しと、単語の読みによる直しをかける
// 保存先は vault の K_voicewords.json（{ words: [{ w, src, n, at }], fixes: [{ from, to, n, at }] }）。vault ごと持ち運べる

const KANJI = /[㐀-鿿豈-﫿々〆ヵヶ]/, KATA = /[ァ-ヺーヽヾ]/, LATIN = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/;
const HIRA = /[ぁ-ゟ]/, STOP = /[\s、。，．,.!?！？「」『』（）()\[\]・:：;；…―ー\-]/;
const cls = c => KANJI.test(c) ? 'k' : KATA.test(c) ? 'K' : LATIN.test(c) ? 'a' : HIRA.test(c) ? 'h' : 'x';
const wordy = c => { const k = cls(c); return k === 'k' || k === 'K' || k === 'a'; };

// 文字ごとの差分（LCS）。返り値: [{ a0, a1, b0, b1 }]（a[a0..a1) が b[b0..b1) に変わった所）
function hunks(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 400000) return [{ a0: 0, a1: n, b0: 0, b1: m }];   // 長すぎる行は丸ごと
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0, h = null;
  const flush = () => { if (h) { h.a1 = i; h.b1 = j; out.push(h); h = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; continue; }
    if (!h) h = { a0: i, b0: j };
    if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) j++; else i++;
  }
  flush(); return out;
}
// 直した所を、前後の「語」の切れ目まで広げる（漢字・カタカナ・英数の続き。ひらがなだけの直しは、前後 1 文字）
const touches = (s, a, b) => (a > 0 && wordy(s[a - 1])) || (b < s.length && wordy(s[b])) || [...s.slice(a, b)].some(wordy);
function widen(s, x0, x1, word) {
  let a = x0, b = x1;
  if (word) {
    while (a > 0 && wordy(s[a - 1])) a--;
    while (b < s.length && wordy(s[b])) b++;
  } else {
    if (a > 0 && !STOP.test(s[a - 1])) a--;
    if (b < s.length && !STOP.test(s[b])) b++;
  }
  return [a, b];
}
// 1 行の前後から、直し（前 → 後）と単語を取り出す
function lineChanges(a, b) {
  const fixes = [], words = new Set();
  for (const h of hunks(a, b)) {
    // 前と後で、同じだけ広げる（前後の文脈は同じ文字なので、左右の広がりをそろえる）
    const word = touches(a, h.a0, h.a1) || touches(b, h.b0, h.b1);
    const [pa, pb] = widen(a, h.a0, h.a1, word), [qa, qb] = widen(b, h.b0, h.b1, word);
    const left = Math.max(h.a0 - pa, h.b0 - qa), right = Math.max(pb - h.a1, qb - h.b1);
    const from = a.slice(Math.max(0, h.a0 - left), Math.min(a.length, h.a1 + right)), to = b.slice(Math.max(0, h.b0 - left), Math.min(b.length, h.b1 + right));
    if (from && to && from !== to && !/[、。，．,.!?！？\s]/.test(from + to) && from.length >= 2 && from.length <= 24 && to.length <= 30 && !/[\n]/.test(from + to)) fixes.push({ from: from.trim(), to: to.trim() });
    // 単語: 直した後の文の、直した所に重なる、漢字・カタカナ・英数の続き（2〜20 文字）
    let s = h.b0, e = h.b1; while (s > 0 && wordy(b[s - 1])) s--; while (e < b.length && wordy(b[e])) e++;
    for (const m of b.slice(s, e).matchAll(/[㐀-鿿豈-﫿々〆ヵヶァ-ヺーA-Za-z0-9Ａ-Ｚａ-ｚ０-９]+/g))
      if (m[0].length >= 2 && m[0].length <= 20 && !/^[0-9０-９]+$/.test(m[0])) words.add(m[0]);
  }
  return { fixes: fixes.filter(f => f.from && f.to && f.from !== f.to), words: [...words] };
}
// 行どうしを対応させる（行の LCS。変わった塊は、順に対にする）
function pairLines(A, B) {
  const n = A.length, m = B.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = []; let i = 0, j = 0, ra = [], rb = [];
  const flush = () => { for (let k = 0; k < Math.min(ra.length, rb.length); k++) pairs.push([ra[k], rb[k]]); ra = []; rb = []; };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); i++; j++; continue; }
    if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) rb.push(B[j++]); else ra.push(A[i++]);
  }
  flush(); return pairs;
}
// 文字の前後（before・after は複数行）から覚える。doc を書き換えて、{ fixes, words }（新しく覚えたもの）を返す
function learn(doc, before, after, now = '') {
  doc.words = doc.words || []; doc.fixes = doc.fixes || [];
  const strip = s => String(s || '').split('\n').map(l => l.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?\s*/, ''));
  const got = { fixes: [], words: [] };
  for (const [a, b] of pairLines(strip(before), strip(after))) {
    const c = lineChanges(a, b);
    for (const f of c.fixes) {
      const old = doc.fixes.find(x => x.from === f.from);
      if (old) { if (old.to !== f.to) { old.to = f.to; old.n = 1; } else old.n = (old.n || 1) + 1; old.at = now; }
      else { doc.fixes.push({ ...f, n: 1, at: now }); got.fixes.push(f); }
      // 直しが前の直しと逆（A→B のあと B→A）なら、前のものは捨てる
      doc.fixes = doc.fixes.filter(x => !(x.from === f.to && x.to === f.from));
    }
    const kanaOf = {}; for (const f of c.fixes) if (/^[ぁ-ゖー]+$/.test(f.from) && c.words.includes(f.to)) kanaOf[f.to] = f.from;   // かなで出た所を直した → それが読み
    for (const w of c.words) {
      const old = doc.words.find(x => x.w === w);
      if (kanaOf[w]) { if (old) old.r = old.r || kanaOf[w]; }
      if (old) { old.n = (old.n || 1) + 1; old.at = now; if (old.src !== 'edit' && old.src !== 'manual') old.src = 'edit'; }
      else { doc.words.push({ w, src: 'edit', n: 1, at: now, ...(kanaOf[w] ? { r: kanaOf[w] } : {}) }); got.words.push(w); }
    }
  }
  return got;
}
// 覚えた直しをかける（長いものから。1 回だけ置き換える）
//   ok(f): かけてよいか（ふつうの言葉の直しは、2 回直すまでかけない、など。呼ぶ側が決める）
function applyFixes(doc, text, ok = () => true) {
  const fx = [...((doc && doc.fixes) || [])].filter(f => f.from && f.to !== undefined && !f.off && ok(f)).sort((a, b) => b.from.length - a.from.length);
  if (!fx.length) return text;
  const re = new RegExp(fx.map(f => f.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), map = new Map(fx.map(f => [f.from, f.to]));
  return String(text).replace(re, m => map.has(m) ? map.get(m) : m);
}
const kata = s => String(s || '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
// 読みによる直し: 単語と同じ読みで、辞書に 1 語として無い（いくつにも割れた）並びを、単語に置き換える
//   例: 「説一切有部」が「説一切ウブ」と出た → 読み セツイッサイウブ が同じなので直す。「構成」のような、ふつうの 1 語は直さない
function fixByReading(tokenize, text, terms, readings = {}) {
  const T = [];
  for (const w of terms) {
    if (w.length < 2 || !/[㐀-鿿ァ-ヺ]/.test(w)) continue;
    const rs = new Set([kata(tokenize(w).map(t => t.reading && t.reading !== '*' ? t.reading : t.surface_form).join(''))]);
    for (const x of [].concat(readings[w] || [])) rs.add(kata(x));   // 辞書の読みは、珍しい語ではずれるので、付けた読みも使う
    for (const r of rs) if (/^[ァ-ー]{4,}$/.test(r)) T.push({ w, r });
  }
  if (!T.length) return text;
  const byR = new Map(); for (const t of T) if (!byR.has(t.r) || byR.get(t.r).length < t.w.length) byR.set(t.r, t.w);
  return String(text).split('\n').map(line => {
    const tk = tokenize(line); if (!tk.length) return line;
    const rd = tk.map(t => kata(t.reading && t.reading !== '*' ? t.reading : t.surface_form));
    let out = '', i = 0;
    while (i < tk.length) {
      let hit = 0, word = '';
      for (let k = Math.min(tk.length, i + 6); k > i + 1; k--) {   // 2 語以上に割れた所だけ
        const r = rd.slice(i, k).join(''), w = byR.get(r);
        if (w && tk.slice(i, k).map(t => t.surface_form).join('') !== w) { hit = k; word = w; break; }
      }
      if (hit) { out += word; i = hit; } else { out += tk[i].surface_form; i++; }
    }
    return out;
  }).join('\n');
}
// 文字化に渡す手がかりの語（最大 max 語・合わせて maxChars 文字まで）。直して覚えた語・手で足した語を先に、次に、よく使うキーワード
function promptWords(doc, extra = [], { max = 40, maxChars = 200, seeds = [] } = {}) {
  const own = [...((doc && doc.words) || [])].filter(x => !x.off && x.src !== 'seed').sort((a, b) => (b.src === 'manual') - (a.src === 'manual') || (b.n || 1) - (a.n || 1) || String(b.at || '').localeCompare(String(a.at || '')));
  const out = [], seen = new Set(); let len = 0;
  for (const w of [...own.map(x => x.w), ...extra, ...seeds]) {
    const t = String(w || '').trim(); if (!t || seen.has(t) || t.length > 20) continue;
    if (out.length >= max || len + t.length + 1 > maxChars) break;
    seen.add(t); out.push(t); len += t.length + 1;
  }
  return out;
}
// 文字化の手がかり（語の並びだけだと句読点が消えるので、文章の形にする）
const promptText = words => words.length ? '次は日本語の話し言葉の録音です。句読点（、。）を使って、自然な文章で書いてください。用語：' + words.join('、') + '。' : '';
// 単語の一覧を足す（手で足す・まとめて取り込む）
function addWords(doc, list, src = 'manual', now = '') {
  doc.words = doc.words || []; let n = 0;
  for (const raw of list) {
    const w = String(raw || '').trim(); if (!w || w.length > 20 || /^#/.test(w)) continue;
    const old = doc.words.find(x => x.w === w);
    if (old) { if (src === 'manual') { old.src = 'manual'; delete old.off; } continue; }
    doc.words.push({ w, src, n: 1, at: now }); n++;
  }
  return n;
}

// ふつうの言葉（辞書に 1 語としてある）を別の語に直したものは、1 回だけでは、いつもかけない（その場の言い換えかもしれない）
const fixOk = tokenize => f => { if ((f.n || 1) >= 2 || f.manual) return true; try { const t = tokenize(f.from); return !(t.length === 1 && t[0].word_type === 'KNOWN'); } catch { return true; } };
module.exports = { fixOk, hunks, lineChanges, learn, applyFixes, fixByReading, promptWords, promptText, addWords, kata };
