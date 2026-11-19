// 検索して挿入する画面（Ctrl+U）。「:」や「->」を打っても候補は勝手に出さない。ここから探して、選んだものを今の位置に入れる
// 対象: ノート本文・リンク・トピックインデックス。語は空白（全角も）区切り＝すべて含む
// 使い方: 打つ → ↑↓ で選ぶ → Enter（前置 ->ID）／Shift+Enter（後置 ID->）。Tab で、種類（すべて・ノート・リンク・索引）を切り替える
import Core from '../link-core.js';
import L from '../lib.js';
import Stamp from '../stamp.js';
import { ctx, $, esc, dialog } from './shared.js';
import * as LC from './linked-content.js';

const KINDS = [['all', 'すべて'], ['note', 'ノート'], ['link', 'リンク'], ['idx', '索引']];
const lower = v => String(v == null ? '' : v).toLowerCase();
export const terms = q => lower(q).split(/[\s　]+/).filter(Boolean);
export const matches = (hay, ts) => ts.every(t => hay.includes(t));

// 全部の候補。軽くするため、本文は検索のときにだけ見る
export function allItems() {
  const out = [];
  for (const x of ctx.searchReferences('')) {
    if (x.kind === 'memo') continue;
    const head = lower([x.id, x.title, x.date, x.recordKind].join('\n'));
    out.push({ type: 'note', x, label: x.title || x.id, head, sub: x.kind === 'diary' ? '日記 ' + x.date + (x.recordKind && x.recordKind !== '日記' ? ' ' + x.recordKind : '') : (x.s === 'p' ? '紙 ' : '') + (x.id || ''), hay: lower([x.id, x.title, x.text, x.date, x.recordKind, ...(x.keywords || [])].join('\n')) });
  }
  for (const l of LC.allLinks() || []) out.push({ type: 'link', x: l, label: l.title || '(無題のリンク)', head: lower(l.title), sub: 'リンク', hay: lower((l.title || '') + '\n' + (l.targets || []).map(t => t.title || '').join('\n')) });
  for (const t of ctx.topics?.() || []) {
    const kws = (() => { try { return L.mergeTopic(t).rows.map(r => r.kw); } catch { return []; } })();
    out.push({ type: 'idx', x: t, label: t.name, head: lower(t.name), sub: '索引' + (t.entry ? ' ' + t.entry.id + '-' + (t.num || 1) : ''), hay: lower(t.name + '\n' + kws.join('\n')), kws });
  }
  return out;
}
// 並べ方: 題・番号に入っているものを先に（すべての語が題に入っていれば、いちばん上）。そのあとは、元の並び（新しい順）
const score = (it, ts) => !ts.length ? 0 : ts.every(t => (it.head || '').includes(t)) ? 3 : ts.some(t => (it.head || '').includes(t)) ? 2 : 1;
export const search = (items, q, kind = 'all', limit = 80) => {
  const ts = terms(q);
  const hit = items.filter(i => (kind === 'all' || i.type === kind) && (!ts.length ? i.type === 'note' || kind !== 'all' : matches(i.hay, ts)));
  const ranked = ts.length ? hit.map((i, k) => [i, k]).sort((a, b) => score(b[0], ts) - score(a[0], ts) || a[1] - b[1]).map(x => x[0]) : hit;
  return ranked.slice(0, limit);
};
// 入れる文字。前置は ->ID、後置は ID->（ノート）。リンクは [題](link:ID)。索引は、その番号
export function insertText(it, post, space = 'd', curKey = '') {
  const x = it.x;
  if (it.type === 'note') return Core.reference(x, post, space);
  if (it.type === 'link') return `[${Core.safeTitle(x.title) || 'リンク'}](link:${x.id})`;
  if (it.type === 'idx') return x.entry ? Core.reference({ kind: 'note', s: x.entry.s, id: x.entry.id }, post, space) : x.name;
  return '';
}
// 見つけた語を目立たせる（escape したうえで、<mark> を付ける）
export function highlight(text, ts) {
  const src = String(text == null ? '' : text); if (!ts.length) return esc(src);
  const low = src.toLowerCase(), spans = [];
  for (const t of ts) { let i = 0; while ((i = low.indexOf(t, i)) >= 0) { spans.push([i, i + t.length]); i += t.length; } }
  spans.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  for (const [a, b] of spans) { if (b <= at) continue; const from = Math.max(a, at); out += esc(src.slice(at, from)) + '<mark>' + esc(src.slice(from, b)) + '</mark>'; at = b; }
  return out + esc(src.slice(at));
}
function preview(it) {
  const x = it.x;
  if (it.type === 'note') return { head: it.sub, title: x.title || '', body: Stamp.visible(x.text || x.body || '').slice(0, 5000) };
  if (it.type === 'link') return { head: 'リンク', title: x.title || '', body: (x.targets || []).map(t => '・' + (t.title || t.id || t.stem || '')).join('\n') };
  return { head: it.sub, title: x.name, body: (it.kws || []).map(k => '・' + k).join('\n') };
}
const POST = { note: 'ID->', idx: 'ID->' };
// insert を渡すと、本文（view）ではなく、そこへ入れる（盤面のノードの文字欄など）。閉じただけなら insert(null)
export function open({ view, space = 'd', curKey = '', insert } = {}) {
  const items = allItems(); let kind = 'all', at = 0, shown = [];
  const sel = view ? view.state.selection.main : null;
  dialog(`<div class="isr"><div class="isr-top"><input id="isr-q" placeholder="ノート・リンク・索引を探す（空白で区切ると、すべて含む）" autocomplete="off" spellcheck="false" aria-label="探す"></div>
    <div class="isr-k" role="tablist">${KINDS.map(([k, l]) => `<button role="tab" data-k="${k}"${k === 'all' ? ' class="on"' : ''}>${l}<i></i></button>`).join('')}</div>
    <div class="isr-b"><div id="isr-list" role="listbox"></div><div id="isr-pv"></div></div>
    <div class="isr-f"><span class="isr-keys"><kbd>↑</kbd><kbd>↓</kbd> 選ぶ　<kbd>Tab</kbd> 種類　<kbd>Enter</kbd> 入れる　<kbd>Shift+Enter</kbd> 後ろに付く形で入れる　<kbd>Esc</kbd> 閉じる</span><span class="grow"></span><button id="isr-post" title="後ろに付く形（1a->）で入れる">後置で入れる</button><button id="isr-ok" class="p" title="前に付く形（->1a）で入れる（Enter）">入れる</button></div></div>`, close => {
    const q = () => $('#isr-q').value;
    const draw = () => {
      const ts = terms(q());
      shown = search(items, q(), kind); at = Math.min(at, Math.max(0, shown.length - 1));
      $('#isr-list').innerHTML = shown.map((it, i) => `<div class="isr-r${i === at ? ' on' : ''}" role="option" data-i="${i}"><b data-user>${highlight(String(it.label).replace(/\s+/g, ' ').slice(0, 90), ts)}</b><small>${esc(it.sub)}</small></div>`).join('') || `<div class="none">${ts.length ? '見つかりません' : '探したい語を打ってください'}</div>`;
      const sh = shown[at];
      if (sh) { const p = preview(sh); $('#isr-pv').innerHTML = `<div class="pv-head">${esc(p.head)}</div>${p.title ? `<div class="pv-title" data-user>${highlight(p.title, ts)}</div>` : ''}<div class="pv-body" data-user>${highlight(p.body, ts).replace(/\n/g, '<br>')}</div>`; $('#isr-pv .pv-body mark')?.scrollIntoView({ block: 'center' }); }
      else $('#isr-pv').innerHTML = '';
      $('#isr-list .on')?.scrollIntoView({ block: 'nearest' });
      const post = $('#isr-post'); if (post) { post.disabled = !sh || !POST[sh.type]; $('#isr-ok').disabled = !sh; }
      if (ts.length) document.querySelectorAll('.isr-k button').forEach(b => { const n = search(items, q(), b.dataset.k, 9999).length; b.querySelector('i').textContent = n ? n : ''; });
      else document.querySelectorAll('.isr-k button i').forEach(i => { i.textContent = ''; });
    };
    const done = (i, post) => {
      const it = shown[i]; if (!it) return; const t = insertText(it, post, space, curKey) + (it.type === 'link' ? '' : ' '); close();
      if (insert) return insert(t, it);
      if (view && view.dom.isConnected) { view.dispatch({ changes: { from: sel.from, to: sel.to, insert: t }, selection: { anchor: sel.from + t.length } }); view.focus(); }
    };
    const setKind = k => { kind = k; at = 0; document.querySelectorAll('.isr-k button').forEach(x => x.classList.toggle('on', x.dataset.k === k)); draw(); $('#isr-q').focus(); };
    $('#isr-q').oninput = () => { at = 0; draw(); };
    $('#isr-q').onkeydown = e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, Math.min(shown.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))); draw(); }
      else if (e.key === 'Tab') { e.preventDefault(); const ks = KINDS.map(x => x[0]); setKind(ks[(ks.indexOf(kind) + (e.shiftKey ? ks.length - 1 : 1)) % ks.length]); }
      else if (e.key === 'Enter') { e.preventDefault(); done(at, e.shiftKey); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); if (insert) insert(null); else if (view?.dom.isConnected) view.focus(); }
    };
    $('#isr-list').onclick = e => { const r = e.target.closest('[data-i]'); if (r) { at = +r.dataset.i; draw(); $('#isr-q').focus(); } };
    $('#isr-list').ondblclick = e => { const r = e.target.closest('[data-i]'); if (r) done(+r.dataset.i, false); };
    $('#isr-ok').onclick = () => done(at, false);
    $('#isr-post').onclick = () => done(at, true);
    document.querySelector('.isr-k').onclick = e => { const b = e.target.closest('[data-k]'); if (b) setKind(b.dataset.k); };
    draw(); $('#isr-q').focus();
  });
}
