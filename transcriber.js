'use strict';
// 録音を文字にする（PC の中だけ。外へは送らない）。transcribe/yn_transcribe.py（faster-whisper・kotoba-whisper）を呼ぶ。
//   部品の場所: YURIINOTE_WHISPER_PY / YURIINOTE_WHISPER_MODEL → インストール先の whisper/ → ~/transcribe（もともとの voicetranscriber）
//   PC が固まらないよう、1 件ずつ、スレッド 4 本、nice で動かす
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const Stamp = require('./stamp');

function tools(env = process.env, home = os.homedir()) {
  const root = env.YURIINOTE_ROOT || env.YURIINOTE_SIMPLE_ROOT || path.join(home, '.local/share/YuriiNote');
  const first = list => list.filter(Boolean).find(f => fs.existsSync(f)) || null;
  const py = first([env.YURIINOTE_WHISPER_PY, path.join(root, 'whisper/venv/bin/python'), path.join(home, 'transcribe/.venv/bin/python')]);
  // モデル: large-v3（文が欠けず、句読点が付き、用語の手がかりが効く）を先に。無ければ kotoba-whisper（速いが、手がかりを渡すと何も出なくなる）
  const has = d => d && fs.existsSync(path.join(d, 'model.bin'));
  const cands = [
    env.YURIINOTE_WHISPER_MODEL && { dir: env.YURIINOTE_WHISPER_MODEL, prompt: !/kotoba/i.test(env.YURIINOTE_WHISPER_MODEL) },
    { dir: path.join(root, 'whisper/models/large-v3-faster'), prompt: true }, { dir: path.join(home, 'transcribe/models/large-v3-faster'), prompt: true },
    { dir: path.join(root, 'whisper/models/kotoba-v2.0-faster'), prompt: false }, { dir: path.join(home, 'transcribe/models/kotoba-v2.0-faster'), prompt: false },
  ].filter(Boolean);
  const m = cands.find(c => has(c.dir)) || null, model = m ? m.dir : null, usePrompt = !!(m && m.prompt);
  return { py, model, usePrompt, script: path.join(__dirname, 'transcribe', 'yn_transcribe.py'), ok: !!(py && model) };
}

// 区切り（segs: [{start, end, text}]）を段落にまとめ、行頭に「録音を始めた時刻＋経過」の日時を付ける（保存は、いつも秒まで）
// 1.5 秒より長く黙ったとき・段落が長くなったときに、次の段落にする
function paragraphs(segs, at) {
  const base = new Date(Stamp.full(at).replace(' ', 'T')).getTime(), out = [];
  let cur = null, prevEnd = -1;
  for (const s of segs) {
    const t = String(s.text || '').trim(); if (!t) continue;
    if (!cur || s.start - prevEnd > 1.5 || cur.text.length > 160) { cur = { start: s.start, text: '' }; out.push(cur); }
    if (cur.text && !/[。、，,．.！？!?…」』)）]$/.test(cur.text)) cur.text += '、';   // 区切りに句読点が無いと、つながって読みにくい
    cur.text += t; prevEnd = s.end;
  }
  return out.map(p => `${Stamp.nowStamp(new Date(base + Math.floor(p.start) * 1000))} ${p.text}`);
}

// 1 件を文字にする。onProgress(0〜100)。返り値 { ok, segs, error }
function run(t, file, onProgress = () => { }, { threads = 4, spawn = cp.spawn, prompt = '' } = {}) {
  return new Promise(resolve => {
    if (!t.py || !t.model) return resolve({ ok: false, error: '文字化の部品（faster-whisper とモデル）が見つかりません。YuriiNote --update で入れ直すか、~/transcribe を用意してください' });
    const args = [t.script, file, '--model', t.model, '--threads', String(threads), ...(t.usePrompt && prompt ? ['--prompt', prompt] : [])];
    const useNice = process.platform !== 'win32' && fs.existsSync('/usr/bin/nice');
    const p = spawn(useNice ? '/usr/bin/nice' : t.py, useNice ? ['-n', '10', t.py, ...args] : args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const segs = []; let dur = 0, buf = '', err = '', failed = '';
    p.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1); let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.type === 'info') dur = +o.duration || 0;
        else if (o.type === 'seg') { segs.push(o); if (dur) onProgress(Math.min(99, Math.round(100 * o.end / dur))); }
        else if (o.type === 'error') failed = o.message || 'エラー';
      }
    });
    p.stderr.on('data', d => { err = (err + d).slice(-2000); });
    p.on('error', e => resolve({ ok: false, error: String(e.message || e) }));
    p.on('close', code => resolve(code === 0 && !failed ? { ok: true, segs } : { ok: false, segs, error: failed || err.trim().split('\n').slice(-3).join('\n') || `終了コード ${code}` }));
  });
}

module.exports = { tools, paragraphs, run };
