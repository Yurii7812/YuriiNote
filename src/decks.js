// デッキ（引いて使う道具）: タロット・易・発想カード。盤面からは独立した部品（データは ../decks/ に tarot-brainstorm から写したもの）
// ノードには、カードの名前（と正逆）を文字で書き、どのカードかは種類 k に持つ（vault に画像は入れない。画像はアプリに同梱）
//   k = 'tarot:<カード>:u|r'（正位置・逆位置）／'iching:<卦>:<変わる爻 0-5 を並べたもの>'／'prompt:<カード>'
import '../decks/tarot-cards.js';
import '../decks/tarot-meanings.js';
import '../decks/tarot-spreads.js';
import '../decks/iching.js';
import '../decks/prompts.js';

const Cards = window.Cards, IChing = window.IChing, Prompts = window.Prompts, Spreads = window.Spreads;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 乱数は OS の暗号乱数（毎回まったく別の結果）
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const SPREADS = Spreads.ALL.map(s => ({ id: s.id, name: s.name, pos: s.pos }));
export const PROMPT_SETS = Prompts.SETS.map(s => ({ id: s.id, name: s.name }));

const SCALE = 0.62, CARD_W = 82;   // スプレッドの座標（カード 130px 用）を、盤面のカード（82px）に合わせる
const tarotText = (c, rev, pos) => `${pos ? pos + '：' : ''}${c.ja}${rev ? '（逆位置）' : ''}`;
// タロットを n 枚、またはスプレッド（位置の意味つき）を、まとめて引く。at を左上にして置く。links は、並べたカード同士の番号の組
export function drawTarot({ spread, n = 1 } = {}) {
  const sp = spread && Spreads.BY_ID[spread], k = sp ? sp.pos.length : n;
  const picked = shuffle(Cards.ALL).slice(0, k);
  if (sp) {
    const x0 = Math.min(...sp.pos.map(p => p.x)), y0 = Math.min(...sp.pos.map(p => p.y));
    return { nodes: sp.pos.map((p, i) => { const rev = rnd() < 0.5; return { x: Math.round((p.x - x0) * SCALE), y: Math.round((p.y - y0) * SCALE), text: tarotText(picked[i], rev, p.name), k: `tarot:${picked[i].id}:${rev ? 'r' : 'u'}` }; }), links: [] };
  }
  return { nodes: picked.map((c, i) => { const rev = rnd() < 0.5; return { x: i * (CARD_W + 46), y: 0, text: tarotText(c, rev), k: `tarot:${c.id}:${rev ? 'r' : 'u'}` }; }), links: [] };
}
// 易: コインを 6 回投げて本卦。変わる爻があれば之卦も置いて、線でつなぐ
export function castIChing() {
  const c = IChing.cast(rnd), name = h => `第${h.num}卦 ${h.name}`;
  const nodes = [{ x: 0, y: 0, text: `本卦：${name(c.base)}${c.moving.length ? `（変わる爻 ${c.moving.length} 本）` : ''}`, k: `iching:${c.base.id}:${c.moving.join('')}` }];
  if (c.after) nodes.push({ x: 190, y: 0, text: `之卦：${name(c.after)}`, k: `iching:${c.after.id}:` });
  return { nodes, links: c.after ? [[0, 1]] : [] };
}
// 発想カードを n 枚（組を選べば、その組から）
export function drawPrompts({ set, n = 1 } = {}) {
  const pool = set ? Prompts.ITEMS.filter(x => x.set === set) : Prompts.ITEMS;
  return { nodes: shuffle(pool).slice(0, n).map((p, i) => ({ x: i * 190, y: 0, text: `${p.name}`, k: `prompt:${p.id}` })), links: [] };
}

const parse = k => { const [deck, id, extra = ''] = String(k || '').split(':'); return { deck, id, extra }; };
const hexSvg = (lines, moving) => `<svg class="hex" viewBox="0 0 100 92">${lines.map((v, i) => { const y = 80 - i * 15; return (v ? `<rect x="10" y="${y}" width="80" height="9" rx="1.5"/>` : `<rect x="10" y="${y}" width="35" height="9" rx="1.5"/><rect x="55" y="${y}" width="35" height="9" rx="1.5"/>`) + (moving.includes(i) ? `<circle cx="96" cy="${y + 4.5}" r="3.4" class="mv"/>` : ''); }).join('')}</svg>`;
// カードのノードの中身（絵＋文字）。カードでなければ null
export function cardHtml(k, textHtml) {
  const { deck, id, extra } = parse(k);
  if (deck === 'tarot') { const c = Cards.BY_ID[id]; if (!c) return null; return `<div class="cd tarot"><img src="${esc(Cards.imgUrl(c))}" alt="" draggable="false"${extra === 'r' ? ' class="rev"' : ''}></div><div class="cd-t">${textHtml}</div>`; }
  if (deck === 'iching') { const h = IChing.BY_ID[id]; if (!h) return null; return `<div class="cd iching">${hexSvg(h.lines, [...extra].map(Number))}<b>${esc(h.name)}</b></div><div class="cd-t">${textHtml}</div>`; }
  if (deck === 'prompt') { const p = Prompts.BY_ID[id]; if (!p) return null; return `<div class="cd prompt" style="--pc:${esc(p.color)}"><small>${esc(p.setName)}</small><b>${esc(p.name)}</b><span>${esc(p.question || '')}</span></div>${textHtml.trim() === esc(p.name) ? '' : `<div class="cd-t">${textHtml}</div>`}`; }
  return null;
}
// Space でのぞくときの説明（このアプリ用に書いた短い説明）
export function cardInfo(k) {
  const { deck, id, extra } = parse(k);
  if (deck === 'tarot') { const c = Cards.BY_ID[id]; if (!c) return null; const rev = extra === 'r'; return { title: c.ja + (rev ? '（逆位置）' : ''), sub: c.en, text: [(rev ? c.rvText : c.upText) || '', ...(c.facts || []), c.scene ? '絵の中: ' + c.scene.join('・') : '', c.question ? '問い: ' + c.question : ''].filter(Boolean).join('\n\n') }; }
  if (deck === 'iching') { const h = IChing.BY_ID[id]; if (!h) return null; const mv = [...extra].map(Number); return { title: `第${h.num}卦 ${h.name}`, sub: h.kw || '', text: [h.text || '', h.question ? '問い: ' + h.question : '', ...mv.map(i => '変わる爻: ' + IChing.LINE_POS[i])].filter(Boolean).join('\n\n') }; }
  if (deck === 'prompt') { const p = Prompts.BY_ID[id]; if (!p) return null; return { title: p.name, sub: p.setName, text: p.question || '' }; }
  return null;
}
