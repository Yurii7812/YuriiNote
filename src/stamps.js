// 行ごとの「年月日＋時刻」。本文のすぐ後ろに、見えないコメント「<!--2026-11-13 12:54:30-->」で持つ。画面では、行の頭に薄く小さく出す（オフなら出さない。ファイルには残る）。
// 書いている間も、コメントは消えない・変わらない: カーソルは、コメントの手前にだけ置ける。Delete・行の結合・Enter・範囲削除で外れたら、同じ編集の中で戻す。
// 行を書いたら、自動で付く（書き始めた時刻）。表示のオン・オフは、PC でも スマホでも 1 つの設定
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { StateField, StateEffect, EditorState, EditorSelection, Prec, Transaction } from '@codemirror/state';
import Stamp from '../stamp.js';

const KEY = 'pkm-stamp-show';
let show = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();
// 見せ方: 「全部」か、名前をつけて保存した「カスタム」（Stamp.format）。保存は、いつも「年月日 時:分:秒」
const FMT_KEY = 'pkm-stamp-fmt', PRESETS_KEY = 'pkm-stamp-presets';
let presets = (() => { try { const d = JSON.parse(localStorage.getItem(PRESETS_KEY) || 'null'); if (d && Array.isArray(d.list)) return { current: d.current || 'all', list: d.list.map(x => Stamp.normFmt(x)).filter(x => x.name) }; } catch { }
  // 昔の「秒まで出す・今日は省く」の設定があれば、カスタムとして引き継ぐ
  try { const o = JSON.parse(localStorage.getItem(FMT_KEY) || 'null'); if (o && (o.sec === false || o.short)) return { current: '前の設定', list: [{ ...Stamp.normFmt(o), name: '前の設定' }] }; } catch { }
  return { current: 'all', list: [] }; })();
const curFmt = () => presets.current === 'all' ? Stamp.normFmt(null) : (presets.list.find(x => x.name === presets.current) || Stamp.normFmt(null));
const views = new Set();
const refresh = StateEffect.define();
export const stampsShown = () => show;
// コピーボタンなどで外へ出す文章: 行ごとの時刻を出していないときは、時刻なしのまま出す
export const clipText = text => show ? Stamp.visible(text) : Stamp.strip(text);   // 時刻を出しているときは、行頭の見える形（- 2026-11-13 12:54:30 買い物）。出していないときは、時刻なし
const refreshAll = () => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { } for (const v of views) { try { v.dispatch({ effects: refresh.of(null) }); } catch { } } };
export const stampPresets = () => ({ current: presets.current, list: presets.list.map(x => ({ ...x })) });
export const stampFormat = () => ({ ...curFmt() });
export function useStampPreset(name) { presets.current = name === 'all' || presets.list.some(x => x.name === name) ? name : 'all'; refreshAll(); }
export function saveStampPreset(p) {   // 同じ名前があれば、上書き
  const f = { ...Stamp.normFmt(p), name: String(p.name || '').trim() }; if (!f.name || f.name === 'all') return false;
  presets.list = [...presets.list.filter(x => x.name !== f.name), f]; presets.current = f.name; refreshAll(); return true;
}
export function deleteStampPreset(name) { presets.list = presets.list.filter(x => x.name !== name); if (presets.current === name) presets.current = 'all'; refreshAll(); }
export function setStampsShown(on) {
  show = !!on; try { localStorage.setItem(KEY, show ? '1' : '0'); } catch { }
  for (const v of views) { try { v.dispatch({ effects: refresh.of(null) }); } catch { } }
}

class StampWidget extends WidgetType {
  constructor(at, f) { super(); this.at = at; this.f = JSON.stringify(f); }
  eq(o) { return o.at === this.at && o.f === this.f; }
  toDOM() { const e = document.createElement('span'); e.className = 'stamp'; e.textContent = Stamp.format(this.at, JSON.parse(this.f)); e.title = this.at; return e; }
  ignoreEvent() { return true; }
}
// まだ日時が付いていない行（書いている行・改行したばかりの行）に、あとで入る日時と同じ幅の、見えない場所を、先に取っておく
// （日時が入った瞬間に、本文が右へずれて、画面ががたつくのを防ぐ）
class SpacerWidget extends WidgetType {
  constructor(at, f) { super(); this.at = at; this.f = JSON.stringify(f); }
  eq(o) { return o.f === this.f && o.at.length === this.at.length; }
  toDOM() { const e = document.createElement('span'); e.className = 'stamp spacer'; e.textContent = Stamp.format(this.at, JSON.parse(this.f)); e.setAttribute('aria-hidden', 'true'); return e; }
  ignoreEvent() { return true; }
}
const markHidden = Decoration.replace({});
// 見えている範囲: 行末の日時コメントは隠す（atomic）。日時は、行の頭（記号のあと）に出す（オフなら出さない）
function build(view) {
  const ranges = [], seen = new Set();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const ln = view.state.doc.lineAt(pos); pos = ln.to + 1; if (seen.has(ln.number)) continue; seen.add(ln.number);
      const t = Stamp.parse(ln.text); if (!t) continue;
      ranges.push(markHidden.range(ln.from + t.cs, ln.from + t.ce));
      if (show) ranges.push(Decoration.widget({ widget: new StampWidget(t.at, curFmt()), side: -1 }).range(ln.from));   // 行の一番頭（見出し・箇条書きの記号より前）
    }
  }
  if (show) ranges.push(...spacers(view));
  return Decoration.set(ranges, true);
}
function spacers(view) {
  const st = view.state, doc = st.doc, d = st.field(dirty, false) || [], lines = new Map(), out = [];
  for (const e of d) { const ln = doc.lineAt(Math.min(e.pos, doc.length)); lines.set(ln.number, e.at); }
  const cur = doc.lineAt(st.selection.main.head);
  if (!lines.has(cur.number) && !cur.text.trim()) lines.set(cur.number, Stamp.nowStamp());   // 改行したばかりの、空の行にも
  if (!lines.size) return out;
  const orig = doc.toString().split('\n');
  for (const [n, at] of lines) {
    const ln = doc.line(n); if (Stamp.parse(ln.text)) continue;
    const probe = orig.slice(); if (!ln.text.trim()) probe[n - 1] = 'x';   // 空の行は、字を 1 つ書いたとして、日時が付く行か調べる
    const res = Stamp.add(probe.join('\n'), at, new Set([n - 1])).split('\n');
    if (res[n - 1] === probe[n - 1]) continue;   // 日時が付かない行（囲みの中・表・区切り線など）
    out.push(Decoration.widget({ widget: new SpacerWidget(at, curFmt()), side: -1 }).range(ln.from));
  }
  return out;
}
const display = ViewPlugin.fromClass(class {
  constructor(view) { this.v = view; this.d = build(view); views.add(view); }
  update(u) { if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some(t => t.effects.some(e => e.is(refresh)))) this.d = build(u.view); }
  destroy() { views.delete(this.v); }
}, { decorations: p => p.d, provide: p => EditorView.atomicRanges.of(v => v.plugin(p)?.d || Decoration.none) });

// 行の本文の終わり（行末の空白の手前）。日時コメントを入れる位置
const textEnd = text => text.replace(/[ \t]+$/, '').length;
const ANNO = [Transaction.userEvent.of('stamp'), Transaction.addToHistory.of(false)];

// ---- 日時コメントを、いつも「行の本文のすぐ後ろに、1 つ」に保つ（編集と同じ変更の中で直す）
//  ・本文の途中に残った・2 つ以上ある → いちばん前のものを、行末に 1 つだけ（行をつないだとき、前の行の日時が残る）
//  ・日時だけが残った行（Enter で行末から改行したとき）→ 日時を外し、前の行に日時が無ければ、前の行へ
//  ・消された日時 → その行に本文が残っていれば、前の日時を戻す（Delete・範囲削除でも、時刻は変わらない）
//  ・昔の形（行頭の日時）の文字を貼ったとき → 行末の形に
const fix = EditorState.transactionFilter.of(tr => {
  if (!tr.docChanged || tr.isUserEvent('stamp')) return tr;
  const doc = tr.newDoc, old = tr.startState.doc, lines = new Set(), carry = new Map(), edits = [];
  tr.changes.iterChangedRanges((_fa, _fb, ta, tb) => { for (let n = doc.lineAt(ta).number, e = doc.lineAt(Math.min(tb, doc.length)).number; n <= e; n++) lines.add(n); });
  tr.changes.iterChanges((fa, fb, ta) => {   // 消した範囲に、日時コメントが丸ごと入っていて、その行の本文が手前に残るなら、戻す時刻として覚える
    if (fb <= fa) return;
    const ol = old.lineAt(fa), t = Stamp.parse(ol.text); if (!t) return;
    if (fa > ol.from && fa <= ol.from + t.cs && fb >= ol.from + t.ce && ol.text.slice(Stamp.prefixLen(ol.text), fa - ol.from).trim()) carry.set(doc.lineAt(ta).number, t.at);
  });
  const attach = (n, at) => { const ln = doc.line(n); edits.push({ from: ln.from + textEnd(ln.text), insert: '<!--' + at + '-->' }); };
  for (const n of [...lines].sort((a, b) => a - b)) {
    const ln = doc.line(n), cs = Stamp.all(ln.text);
    if (cs.length) {
      if (Stamp.textless(ln.text)) {   // 日時だけが残った行
        for (const c of cs) edits.push({ from: ln.from + c.from, to: ln.from + c.to });
        if (n > 1) { const pl = doc.line(n - 1); if (!Stamp.parse(pl.text) && !Stamp.textless(pl.text)) { attach(n - 1, cs[0].at); } }
        continue;
      }
      const tail = Stamp.parse(ln.text), ok = cs.length === 1 && tail && tail.cs === cs[0].from;
      if (!ok) { for (const c of cs) edits.push({ from: ln.from + c.from, to: ln.from + c.to }); attach(n, cs[0].at); }
      continue;
    }
    const h = Stamp.parseHead(ln.text);
    if (h) { edits.push({ from: ln.from + h.p, to: ln.from + h.end }); attach(n, h.at); continue; }
    if (carry.has(n) && Stamp.stampable(ln.text)) attach(n, carry.get(n));
  }
  if (!edits.length) return tr;
  // 同じ位置の重なりを避ける（前の行へ付ける印と、その行自身の直しが同じ場所になったとき）
  const seen = new Set(), uniq = edits.filter(e => { const k = e.from + ':' + (e.to ?? '') + ':' + (e.insert || ''); if (seen.has(k)) return false; seen.add(k); return true; });
  return [tr, { changes: uniq, sequential: true }];
});

// カーソル（選択なし）が日時コメントの中・後ろに来たら、コメントの手前（本文の終わり）へ。範囲選択はそのまま（コピーに日時が入るように）
const snap = EditorState.transactionFilter.of(tr => {
  if (!tr.selection && !tr.docChanged) return tr;
  const doc = tr.newDoc, sel = tr.newSelection; let changed = false;
  const ranges = sel.ranges.map(r => {
    if (!r.empty) return r;
    const ln = doc.lineAt(r.head), t = Stamp.parse(ln.text); if (!t) return r;
    const a = ln.from + t.cs;
    if (r.head > a) { changed = true; return EditorSelection.cursor(a); }
    return r;
  });
  return changed ? [tr, { selection: EditorSelection.create(ranges, sel.mainIndex) }] : tr;
});

// ---- まだ日時が無い（書いている）行を覚える。位置は、変更に合わせてずらす
const setDirty = StateEffect.define();
const dirty = StateField.define({
  create: () => [],
  update(v, tr) {
    let out = v.map(d => ({ pos: tr.changes.mapPos(d.pos, -1), at: d.at }));
    for (const e of tr.effects) if (e.is(setDirty)) out = e.value.map(d => ({ pos: tr.changes.mapPos(d.pos, -1), at: d.at }));
    if (tr.docChanged && !tr.isUserEvent('stamp')) {
      const at = Stamp.nowStamp(), doc = tr.state.doc;
      tr.changes.iterChangedRanges((_fa, _fb, ta, tb) => {
        for (let n = doc.lineAt(ta).number, e = doc.lineAt(tb).number; n <= e; n++) {
          const ln = doc.line(n);
          if (ta !== tb && Math.min(tb, ln.to) <= Math.max(ta, ln.from)) continue;   // 改行だけを入れたときの、前の行などは、書いたことにしない
          if (!out.some(d => d.pos === ln.from)) out.push({ pos: ln.from, at });
        }
      });
    }
    return out;
  }
});
function flush(view, keepCurrent) {
  if (view.composing || view.state.readOnly || !view.dom.isConnected) return;
  const st = view.state, d = st.field(dirty, false); if (!d || !d.length) return;
  const doc = st.doc, curLine = doc.lineAt(st.selection.main.head).number, text = doc.toString(), orig = text.split('\n');
  const groups = new Map(), left = [];
  for (const e of d) {
    const ln = doc.lineAt(Math.min(e.pos, doc.length));
    if (keepCurrent && ln.number === curLine) { left.push(e); continue; }
    if (!groups.has(e.at)) groups.set(e.at, new Set()); groups.get(e.at).add(ln.number - 1);
  }
  const changes = [];
  for (const [at, set] of groups) {
    const res = Stamp.add(text, at, set).split('\n');
    for (const i of set) { if (res[i] === orig[i]) continue; changes.push({ from: doc.line(i + 1).from + textEnd(orig[i]), insert: '<!--' + at + '-->' }); }   // 本文のすぐ後ろ
  }
  view.dispatch({ changes, effects: setDirty.of(left), annotations: ANNO });
}
// 昔の形（行頭の日時・空白つきの行末）を、いまの形（本文のすぐ後ろ）に直す。開いたときに 1 度
function normalize(view) {
  if (view.composing || view.state.readOnly || !view.dom.isConnected) return;
  const doc = view.state.doc, changes = [];
  for (let n = 1; n <= doc.lines; n++) {
    const ln = doc.line(n); if (!/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ln.text)) continue;
    const fixed = Stamp.migrate(ln.text); if (fixed !== ln.text) changes.push({ from: ln.from, to: ln.to, insert: fixed });
  }
  if (changes.length) view.dispatch({ changes, annotations: ANNO });
}
const auto = ViewPlugin.fromClass(class {
  constructor(view) { this.v = view; this.t = null; setTimeout(() => normalize(view), 0); }
  update(u) {
    if (u.transactions.some(t => t.isUserEvent('stamp'))) return;
    if (u.docChanged || u.selectionSet) {
      clearTimeout(this.t); const v = this.v;
      setTimeout(() => flush(v, true), 0);   // 別の行へ移ったら、前の行にすぐ付く
      this.t = setTimeout(() => flush(v, false), 1500);   // 書く手が止まったら、いまの行にも付く
    }
  }
  destroy() { clearTimeout(this.t); }
}, { eventHandlers: {
  blur() { const v = this.v; setTimeout(() => flush(v, false), 0); },
  compositionend() { const v = this.v; setTimeout(() => flush(v, true), 0); }
} });

// Delete（行の終わりで）: 日時コメントを消さずに、次の行とつなぐ（つないだ行は、前の行の日時のまま）
const deleteKey = v => {
  const s = v.state.selection.main; if (!s.empty) return false;
  const doc = v.state.doc, ln = doc.lineAt(s.head), t = Stamp.parse(ln.text); if (!t || s.head !== ln.from + t.cs) return false;
  if (ln.number < doc.lines) v.dispatch({ changes: { from: ln.to, to: ln.to + 1 }, userEvent: 'delete.forward' });
  return true;
};
const keys = Prec.highest(keymap.of([{ key: 'Delete', run: deleteKey }, { key: 'Mod-Delete', run: deleteKey }]));
// 時刻の表示がオフのときは、コピー・切り取りした文字にも、時刻を入れない
const clip = EditorView.domEventHandlers({
  copy(e, view) { return clipOut(e, view, false); },
  cut(e, view) { return clipOut(e, view, true); }
});
function clipOut(e, view, cut) {
  if (show || !e.clipboardData) return false;
  const st = view.state, rs = st.selection.ranges.filter(r => !r.empty); if (!rs.length) return false;
  const text = Stamp.strip(rs.map(r => st.sliceDoc(r.from, r.to)).join('\n'));
  e.clipboardData.setData('text/plain', text); e.preventDefault();
  if (cut && !st.readOnly) view.dispatch({ changes: rs.map(r => ({ from: r.from, to: r.to })), scrollIntoView: true, userEvent: 'delete.cut' });
  return true;
}
export const stampExtensions = [keys, fix, snap, dirty, display, auto, clip];
