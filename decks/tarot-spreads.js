// スプレッドのテンプレート: 座標（盤面の中、カードの中心）＋位置名＋意味。
// pos の並びが入力時の移動順（Enter で次へ）・山札から配る順になる。
(function () {
  const R = 330, cx = 500, cy = 500, dx = Math.round(R * Math.cos(Math.PI / 6));
  const SPREADS = [
    {
      id: "hexagram", name: "ヘキサグラム（7枚）", w: 1000, h: 1050, cw: 130,
      pos: [
        { id: "past", name: "過去", x: cx, y: cy - R, hint: "今の状況に至った背景・型" },
        { id: "present", name: "現在", x: cx + dx, y: cy + R / 2, hint: "今の状態" },
        { id: "near", name: "近い未来", x: cx - dx, y: cy + R / 2, hint: "すぐ先に起こること" },
        { id: "self", name: "自分の気持ち", x: cx + dx, y: cy - R / 2, hint: "自分は何を望んでいるか" },
        { id: "other", name: "相手の気持ち", x: cx - dx, y: cy - R / 2, hint: "相手の状態・姿勢" },
        { id: "advice", name: "アドバイス", x: cx, y: cy + R, hint: "どう動くとよいか" },
        { id: "result", name: "結論", x: cx, y: cy, hint: "全体の行き着く先" },
      ],
    },
    {
      id: "three", name: "3枚（過去・現在・未来）", w: 900, h: 470, cw: 150,
      pos: [
        { id: "past", name: "過去", x: 170, y: 200, hint: "ここに至った流れ・原因" },
        { id: "present", name: "現在", x: 450, y: 200, hint: "今の状態・課題" },
        { id: "future", name: "未来", x: 730, y: 200, hint: "このまま進んだ先" },
      ],
    },
    {
      id: "one", name: "1枚", w: 420, h: 460, cw: 180,
      pos: [{ id: "card", name: "カード", x: 210, y: 200, hint: "今いちばん必要な視点" }],
    },
    {
      id: "three-sit", name: "3枚（状況・課題・助言）", w: 650, h: 400, cw: 130,
      pos: [
        { id: "sit", name: "状況", x: 0, y: 0, hint: "今どうなっているか" },
        { id: "issue", name: "課題", x: 175, y: 0, hint: "引っかかっていること・壁" },
        { id: "advice", name: "助言", x: 350, y: 0, hint: "どう動くとよいか" },
      ],
    },
    {
      id: "three-rel", name: "3枚（自分・相手・関係）", w: 650, h: 400, cw: 130,
      pos: [
        { id: "self", name: "自分", x: 0, y: 0, hint: "自分の気持ち・立場" },
        { id: "rel", name: "二人の関係", x: 175, y: 0, hint: "二人の間にあるもの" },
        { id: "other", name: "相手", x: 350, y: 0, hint: "相手の気持ち・立場" },
      ],
    },
    {
      id: "three-mbs", name: "3枚（頭・体・心）", w: 650, h: 400, cw: 130,
      pos: [
        { id: "mind", name: "頭（考え）", x: 0, y: 0, hint: "考えていること" },
        { id: "body", name: "体（行動）", x: 175, y: 0, hint: "体・行動・暮らし" },
        { id: "heart", name: "心（気持ち）", x: 350, y: 0, hint: "本当の気持ち" },
      ],
    },
    {
      id: "diamond", name: "4枚（ダイヤモンドクロス）", w: 650, h: 1040, cw: 130,
      pos: [
        { id: "now", name: "現状", x: 175, y: 0, hint: "今の状態" },
        { id: "block", name: "障害", x: 0, y: 320, hint: "邪魔になっているもの" },
        { id: "way", name: "対策", x: 350, y: 320, hint: "乗り越え方" },
        { id: "result", name: "結果", x: 175, y: 640, hint: "このまま進んだ先" },
      ],
    },
    {
      id: "five", name: "5枚（問題を解く）", w: 650, h: 720, cw: 130,
      pos: [
        { id: "now", name: "現状", x: 350, y: 0, hint: "今の状態" },
        { id: "cause", name: "原因", x: 175, y: 0, hint: "そうなった理由" },
        { id: "hidden", name: "隠れた要因", x: 525, y: 0, hint: "見えていないもの" },
        { id: "advice", name: "助言", x: 262, y: 320, hint: "どう動くとよいか" },
        { id: "result", name: "結果", x: 437, y: 320, hint: "助言どおりに動いた先" },
      ],
    },
    {
      id: "choice", name: "二者択一（5枚）", w: 650, h: 1040, cw: 130,
      pos: [
        { id: "now", name: "今の自分", x: 175, y: 480, hint: "選ぶ前の状態" },
        { id: "a1", name: "A を選ぶと（すぐ）", x: 0, y: 160, hint: "A を選んですぐ起こること" },
        { id: "a2", name: "A を選ぶと（先）", x: 0, y: -160, hint: "A を選んだ先の結果" },
        { id: "b1", name: "B を選ぶと（すぐ）", x: 350, y: 160, hint: "B を選んですぐ起こること" },
        { id: "b2", name: "B を選ぶと（先）", x: 350, y: -160, hint: "B を選んだ先の結果" },
      ],
    },
    {
      id: "horseshoe", name: "ホースシュー（7枚）", w: 1350, h: 826, cw: 130,
      pos: [
        { id: "past", name: "過去", x: 0, y: 0, hint: "ここに至った流れ" },
        { id: "present", name: "現在", x: 175, y: 160, hint: "今の状態" },
        { id: "near", name: "近い未来", x: 350, y: 320, hint: "すぐ先に起こること" },
        { id: "advice", name: "助言", x: 525, y: 426, hint: "どう動くとよいか" },
        { id: "around", name: "周り", x: 700, y: 320, hint: "周りの人・環境" },
        { id: "block", name: "障害", x: 875, y: 160, hint: "邪魔になっているもの" },
        { id: "result", name: "結果", x: 1050, y: 0, hint: "最終的な行き先" },
      ],
    },
    {
      id: "celtic", name: "ケルト十字（10枚）", w: 1100, h: 1400, cw: 130,
      pos: [
        { id: "present", name: "現在", x: 175, y: 320, hint: "今の中心にあること" },
        { id: "cross", name: "障害（交差）", x: 350, y: 320, hint: "現在を横切る壁・試練" },
        { id: "goal", name: "目標（意識）", x: 262, y: 0, hint: "意識している望み・目標" },
        { id: "base", name: "土台（無意識）", x: 262, y: 640, hint: "根っこにあるもの・本音" },
        { id: "past", name: "過去", x: 0, y: 320, hint: "過ぎつつあること" },
        { id: "near", name: "近い未来", x: 525, y: 320, hint: "すぐ先に起こること" },
        { id: "self", name: "自分", x: 787, y: 880, hint: "自分の姿勢" },
        { id: "around", name: "周り", x: 787, y: 560, hint: "周りの人・環境" },
        { id: "hope", name: "願いと恐れ", x: 787, y: 240, hint: "望んでいること・恐れていること" },
        { id: "result", name: "結果", x: 787, y: -80, hint: "最終的な行き先" },
      ],
    },
    {
      id: "tree", name: "生命の樹（10枚）", w: 650, h: 1680, cw: 130,
      pos: [
        { id: "crown", name: "目指すもの", x: 175, y: 0, hint: "いちばん上にある目的" },
        { id: "wisdom", name: "知恵", x: 350, y: 160, hint: "ひらめき・力の源" },
        { id: "under", name: "理解", x: 0, y: 160, hint: "形にする力・制限" },
        { id: "mercy", name: "与えるもの", x: 350, y: 480, hint: "広げる・与える" },
        { id: "severity", name: "厳しさ", x: 0, y: 480, hint: "削る・断つ" },
        { id: "heart", name: "中心（調和）", x: 175, y: 640, hint: "全体の中心・自分らしさ" },
        { id: "victory", name: "気持ち", x: 350, y: 800, hint: "感情・情熱" },
        { id: "glory", name: "考え", x: 0, y: 800, hint: "考え・言葉" },
        { id: "found", name: "土台", x: 175, y: 960, hint: "無意識・習慣" },
        { id: "kingdom", name: "現実", x: 175, y: 1280, hint: "目に見える結果" },
      ],
    },
    {
      id: "year", name: "12か月（1年）", w: 1175, h: 720, cw: 130,
      pos: [
        { id: "m1", name: "1 か月目", x: 0, y: 0, hint: "1 か月目のテーマ" },
        { id: "m2", name: "2 か月目", x: 175, y: 0, hint: "2 か月目のテーマ" },
        { id: "m3", name: "3 か月目", x: 350, y: 0, hint: "3 か月目のテーマ" },
        { id: "m4", name: "4 か月目", x: 525, y: 0, hint: "4 か月目のテーマ" },
        { id: "m5", name: "5 か月目", x: 700, y: 0, hint: "5 か月目のテーマ" },
        { id: "m6", name: "6 か月目", x: 875, y: 0, hint: "6 か月目のテーマ" },
        { id: "m7", name: "7 か月目", x: 0, y: 320, hint: "7 か月目のテーマ" },
        { id: "m8", name: "8 か月目", x: 175, y: 320, hint: "8 か月目のテーマ" },
        { id: "m9", name: "9 か月目", x: 350, y: 320, hint: "9 か月目のテーマ" },
        { id: "m10", name: "10 か月目", x: 525, y: 320, hint: "10 か月目のテーマ" },
        { id: "m11", name: "11 か月目", x: 700, y: 320, hint: "11 か月目のテーマ" },
        { id: "m12", name: "12 か月目", x: 875, y: 320, hint: "12 か月目のテーマ" },
      ],
    },
    {
      id: "horoscope", name: "ホロスコープ（12枚）", w: 1210, h: 1456, cw: 130,
      pos: [
        { id: "h1", name: "自分", x: 0, y: 704, hint: "自分自身・見た目" },
        { id: "h2", name: "お金", x: 61, y: 968, hint: "お金・持ち物" },
        { id: "h3", name: "学び", x: 227, y: 1161, hint: "学び・身近な人" },
        { id: "h4", name: "家", x: 455, y: 1232, hint: "家・家族・土台" },
        { id: "h5", name: "楽しみ", x: 682, y: 1161, hint: "楽しみ・恋・創造" },
        { id: "h6", name: "仕事と健康", x: 849, y: 968, hint: "日々の仕事・健康" },
        { id: "h7", name: "相手", x: 910, y: 704, hint: "相手・パートナー" },
        { id: "h8", name: "分かち合い", x: 849, y: 440, hint: "受け継ぐもの・深い関係" },
        { id: "h9", name: "遠く", x: 683, y: 247, hint: "旅・学問・考え方" },
        { id: "h10", name: "社会", x: 455, y: 176, hint: "仕事・立場・目標" },
        { id: "h11", name: "仲間", x: 227, y: 247, hint: "友人・仲間・願い" },
        { id: "h12", name: "心の奥", x: 61, y: 440, hint: "隠れたもの・休む所" },
      ],
    },
  ];
  window.Spreads = { ALL: SPREADS, BY_ID: Object.fromEntries(SPREADS.map((s) => [s.id, s])) };
})();
