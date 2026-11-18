// トピックインデックスの地図（ブレスト型）の盤面。盤面そのものは共通のエンジン（./board-engine.js）、中身の形は ../topic-map.js
// 地図だけの決まり: ペンはない（空きをドラッグすると盤面ごと動く）。ID のチップの右クリックは、索引の画面のメニュー（赤い点）に任せる
import C from '../board-core.js';
import { mountBoard } from './board-engine.js';

export function mountMap(root, { map, render, onChange, placeholder = 'キーワード ID ID …', ...rest }) {
  root.classList.add('tmap');
  const b = mountBoard(root, {
    ...rest, model: C.fromMap(map), pen: false, chipMenu: false, placeholder,
    render: text => render(text),
    onChange: m => onChange(C.toMap(m)),
    hint: 'クリック＝書く　Enter＝下に次　Tab＝右に広げる　ノードからドラッグ＝つなぐ　Ctrl+ドラッグ／右ドラッグ＝動かす　Ctrl+ホイール＝拡大',
  });
  return { get map() { return C.toMap(b.model); }, set(m) { b.set(C.fromMap(m)); }, redraw: b.redraw, fit: b.fit, focusNode: b.focusNode, engine: b };
}
