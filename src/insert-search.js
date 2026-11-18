// 検索して挿入する画面（Ctrl+U）。「:」や「->」を打っても候補は勝手に出さない。ここから探して、選んだものを今の位置に入れる
// 対象: ノート本文・小ノート（(n) で区切った単位）・リンク・トピックインデックス。語は空白（全角も）区切り＝すべて含む
import Core from '../link-core.js';
import L from '../lib.js';
import Stamp from '../stamp.js';
import { ctx, $, esc, dialog } from './shared.js';
import { anchorChoices, plainDoc } from './reference-picker.js';
import * as LC from './linked-content.js';

const KINDS = [['all', 'すべて'], ['note', 'ノート'], ['sub', '小ノート'], ['link', 'リンク'], ['idx', '索引']];
const lower = v => String(v == null ? '' : v).toLowerCase();
export const terms = q => lower(q).split(/[\s　]+/).filter(Boolean);
export const matches = (hay, ts) => ts.every(t => hay.includes(t));

// 全部の候補。軽くするため、本文は検索のときにだけ見る
export function allItems(curId = '') {
  const out = [];
  for (const x of ctx.searchReferences('')) {
    if (x.kind === 'memo') continue;
    out.push({ type: 'note', x, label: x.title || x.id, sub: x.kind === 'diary' ? '📔 ' + x.date + (x.recordKind && x.recordKind !== '日記' ? ' ' + x.recordKind : '') : (x.s === 'p' ? '📜 ' : '📝 ') + (x.id || ''), hay: lower([x.id, x.title, x.text, x.date, x.recordKind, ...(x.keywords || [])].join('\n')) });
  }
  for (const n of ctx.notes()) {
    if (n.noid || !n.body) continue;
    for (const a of anchorChoices(plainDoc(n.body), '', n.id)) out.push({ type: 'sub', x: { ...a, s: n.s }, label: a.text, sub: `🔖 ${n.id}(${a.n}) ${n.title || ''}`, hay: lower(a.text + '\n' + (n.title || '')) });
  }
  for (const l of LC.allLinks() || []) out.push({ type: 'link', x: l, label: l.title || '(無題のリンク)', sub: '🔗 リンク', hay: lower((l.title || '') + '\n' + (l.targets || []).map(t => t.title || '').join('\n')) });
  for (const t of ctx.topics?.() || []) {
    const kws = (() => { try { return L.mergeTopic(t).rows.map(r => r.kw); } catch { return []; } })();
    out.push({ type: 'idx', x: t, label: t.name, sub: '🗺️ トピックインデックス' + (t.entry ? ' ' + t.entry.id : ''), hay: lower(t.name + '\n' + kws.join('\n')), kws });
  }
  return out;
}
export const search = (items, q, kind = 'all', limit = 80) => {
  const ts = terms(q);
  return items.filter(i => (kind === 'all' || i.type === kind) && (!ts.length ? i.type === 'note' || kind !== 'all' : matches(i.hay, ts))).slice(0, limit);
};
// 入れる文字。前置は ->ID、後置は ID->（ノート）。小ノートは ->ID(n)。リンクは [題](link:ID)。索引は、その番号
export function insertText(it, post, space = 'd', curKey = '') {
  const x = it.x;
  if (it.type === 'note') return Core.reference(x, post, space);
  if (it.type === 'sub') { const own = curKey && curKey === x.s + ':' + x.noteId, id = own ? '' : x.noteId + (x.s !== space ? `(${x.s})` : ''); const t = `${id}(${x.n})`; return post ? t + '->' : '->' + t; }
  if (it.type === 'link') return `[${Core.safeTitle(x.title) || 'リンク'}](link:${x.id})`;
  if (it.type === 'idx') return x.entry ? Core.reference({ kind: 'note', s: x.entry.s, id: x.entry.id }, post, space) : x.name;
  return '';
}
function preview(it) {
  const x = it.x;
  if (it.type === 'note') return `${it.sub}\n${x.title || ''}\n\n${Stamp.visible(x.text || x.body || '').slice(0, 4000)}`;
  if (it.type === 'sub') return `${it.sub}\n\n${x.text}`;
  if (it.type === 'link') return `${x.title || ''}\n\n` + (x.targets || []).map(t => '・' + (t.title || t.id || t.stem || '')).join('\n');
  return `${x.name}${x.entry ? '（' + x.entry.id + '）' : ''}\n\n` + (it.kws || []).map(k => '・' + k).join('\n');
}
// insert を渡すと、本文（view）ではなく、そこへ入れる（盤面のノードの文字欄など）。閉じただけなら insert(null)
export function open({ view, space = 'd', curKey = '', insert } = {}) {
  const items = allItems(); let kind = 'all', at = 0, shown = [];
  const sel = view ? view.state.selection.main : null;
  dialog(`<div class="isr"><div class="isr-h"><input id="isr-q" placeholder="探す（空白で区切ると、すべて含む）" autocomplete="off" spellcheck="false"><div class="isr-k">${KINDS.map(([k, l]) => `<button data-k="${k}"${k === 'all' ? ' class="on"' : ''}>${l}</button>`).join('')}</div></div>
    <div class="isr-b"><div id="isr-list"></div><pre id="isr-pv" data-user></pre></div><div class="isr-f">↑↓ 選ぶ　Enter 前置（->ID）　Shift+Enter 後置（ID->）　Esc 閉じる</div></div>`, close => {
    const draw = () => {
      shown = search(items, $('#isr-q').value, kind); at = Math.min(at, Math.max(0, shown.length - 1));
      $('#isr-list').innerHTML = shown.map((it, i) => `<div class="isr-r${i === at ? ' on' : ''}" data-i="${i}"><b data-user>${esc(String(it.label).slice(0, 80))}</b><small>${esc(it.sub)}</small></div>`).join('') || '<div class="none">見つかりません</div>';
      $('#isr-pv').textContent = shown[at] ? preview(shown[at]) : '';
      $('#isr-list .on')?.scrollIntoView({ block: 'nearest' });
    };
    const done = (i, post) => {
      const it = shown[i]; if (!it) return; const t = insertText(it, post, space, curKey) + (it.type === 'link' ? '' : ' '); close();
      if (insert) return insert(t);
      if (view && view.dom.isConnected) { view.dispatch({ changes: { from: sel.from, to: sel.to, insert: t }, selection: { anchor: sel.from + t.length } }); view.focus(); }
    };
    $('#isr-q').oninput = () => { at = 0; draw(); };
    $('#isr-q').onkeydown = e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, Math.min(shown.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); done(at, e.shiftKey); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); if (insert) insert(null); else if (view?.dom.isConnected) view.focus(); }
    };
    $('#isr-list').onclick = e => { const r = e.target.closest('[data-i]'); if (r) { at = +r.dataset.i; draw(); } };
    $('#isr-list').ondblclick = e => { const r = e.target.closest('[data-i]'); if (r) done(+r.dataset.i, false); };
    document.querySelector('.isr-k').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; document.querySelectorAll('.isr-k button').forEach(x => x.classList.toggle('on', x === b)); at = 0; draw(); $('#isr-q').focus(); };
    draw(); $('#isr-q').focus();
  });
}
