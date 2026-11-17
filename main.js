const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } = require('electron');
const {externalUri} = require('./url-links');
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');
const upd = require('./update');
const { requestFlush, guardClose } = require('./save-lifecycle');

// ===== コマンド: YuriiNote --update / --check / --version / --install =====
// 開発用のフォルダ（git）か、AppImage か。どちらでもなければ（Windows / Mac のインストーラー版）更新はページを開くだけ
const argv = process.argv.slice(app.isPackaged ? 1 : 2);
const info = () => ({
  version: process.env.YURIINOTE_VERSION || process.env.YURIIKASTEN_VERSION || app.getVersion(), platform: process.platform, arch: process.arch,
  appImage: process.env.APPIMAGE || null, devDir: !app.isPackaged && fs.existsSync(path.join(__dirname, '.git')) ? __dirname : null
});
if (argv.includes('--version')) { console.log(`YuriiNote ${app.getVersion()}`); app.exit(0); }
else if (argv.includes('--update') || argv.includes('--check')) {
  (async () => {
    const i = info(), say = t => console.log(t);
    try {
      const c = await upd.check(i);
      if (c.none) return say('まだ公開されたバージョンがありません。');
      if (!c.newer) return say(`最新です（${c.current}）`);
      say(i.devDir ? `新しい変更があります（${c.latest}）` : `新しいバージョンがあります: ${c.current} → ${c.latest}`);
      if (argv.includes('--check')) return say('更新するには: YuriiNote --update');
      const r = await upd.apply(i, c, say); say(r.message); if (r.manual) say(r.url);
    } catch (e) { console.error('更新できませんでした: ' + e.message); process.exitCode = 1; }
  })().finally(() => app.exit(process.exitCode || 0));
}

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const readCfg = () => {
  for (const f of [cfgFile(), path.join(app.getPath('appData'), 'YuriiKasten', 'config.json'), path.join(app.getPath('appData'), 'paper-pkm', 'config.json')]) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { } }
  return {};
};
const writeCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); };

// 保存先: 環境変数 → 設定。どちらも無い（初めて起動した）ときは、画面で選ぶ（既存のフォルダを開く／新しく作る）
const suggestVault = () => path.join(os.homedir(), 'YuriiNote');
const foundVaults = () => ['YuriiNote', 'YuriiKasten', 'PaperPKM'].map(n => path.join(os.homedir(), n)).filter(p => { try { return fs.statSync(p).isDirectory() && fs.readdirSync(p).some(f => /^\d{14}\.md$|^D_|^\.pkm-layout$/.test(f)); } catch { return false; } });
let vault = process.env.YURIINOTE_VAULT || process.env.YURIIKASTEN_VAULT || process.env.PAPER_PKM_VAULT || readCfg().vault || null;
if (process.platform === 'linux' && process.env.APPIMAGE) app.commandLine.appendSwitch('no-sandbox'); // AppImage ではサンドボックス用の権限が付けられない
let v = null, urlPreviews = null;
const open = () => { v = store.openVault(vault); urlPreviews = require('./url-preview').createService(v, { fetcher: url => require('./url-preview').fetchMetadata(url, { thumbnailer: bytes => { const image = nativeImage.createFromBuffer(bytes), size = image.getSize(); if (!size.width || !size.height) throw new Error('画像を読めません'); return image.resize(size.width >= size.height ? { width: Math.min(128, size.width) } : { height: Math.min(128, size.height) }).toPNG(); } }), onProgress: p => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('urlProgress', p); } }); const service = urlPreviews; setTimeout(() => service.refresh().catch(() => {}), 0); recResume(); return v.state(); };   // 文字化が途中のもの・待っているものを、続ける

ipcMain.handle('load', () => vault ? open() : { firstRun: true, suggest: suggestVault(), found: foundVaults() });
// 初めて起動したとき: 選んだフォルダ（無ければ作る）を保存先にする
ipcMain.handle('useVault', (_e, p) => { if (!p || typeof p !== 'string') return null; vault = path.resolve(p.replace(/^~/, os.homedir())); fs.mkdirSync(vault, { recursive: true }); writeCfg({ ...readCfg(), vault }); return open(); });
ipcMain.handle('state', () => v.state());
ipcMain.handle('trashList', () => v.trashList());
ipcMain.handle('trashRestore', (_e, f) => { const ok = v.trashRestore(f); return ok ? open() : false; });

// ===== 同期（ラズパイの同期サーバーと。設定が無ければ何もしない）=====
let mainWin = null;
const flushRenderer = () => requestFlush(mainWin, ipcMain);

// スマホで撮った紙のカード（取り込み済みの写真）。PC の紙の取り込み画面で、番号を付けて、ノートにする
const papersDir = () => path.join(vault, '.phone-papers');
ipcMain.handle('phonePapers', () => {
  try { return fs.readdirSync(papersDir()).filter(f => /^[\w.-]+\.(jpe?g|png)$/i.test(f)).sort().map(name => ({ name, bytes: fs.readFileSync(path.join(papersDir(), name)) })); } catch { return []; }
});
ipcMain.handle('phonePapersCount', () => { try { return fs.readdirSync(papersDir()).filter(f => /^[\w.-]+\.(jpe?g|png)$/i.test(f)).length; } catch { return 0; } });
// 捨てた写真は、ごみ箱（.trash）へ（あとで戻せる）
ipcMain.handle('phonePaperTrash', (_e, name) => { try { const n = String(name); if (!/^[\w.-]+$/.test(n)) return false; const t = path.join(vault, '.trash'); fs.mkdirSync(t, { recursive: true }); fs.renameSync(path.join(papersDir(), n), path.join(t, `${Date.now()}-${n}`)); return true; } catch { return false; } });
ipcMain.handle('phonePaperDone', (_e, name) => { try { if (/^[\w.-]+$/.test(String(name))) fs.unlinkSync(path.join(papersDir(), String(name))); return true; } catch { return false; } });
// ===== 意味の見方（AI）: モデルのダウンロードと、ノートのベクトル（ai-embed.js）=====
let aiEmb = null, aiIdx = null, aiIdxVault = '';
const aiMod = () => require('./ai-embed');
const aiEmbedder = () => { if (!aiEmb) aiEmb = new (aiMod().Embedder)(path.join(app.getPath('userData'), 'ai-models', 'multilingual-e5-small')); return aiEmb; };
const aiSend = m => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('aiMsg', m); };
// HTMLの書き出し: 保存先を選んでもらって、1 つのファイルとして書く
ipcMain.handle('saveHtml', async (_e, name, html) => {
  if (typeof html !== 'string' || !html) return null;
  const base = String(name || 'YuriiNote').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80);
  if (process.env.YURIINOTE_TEST_SAVE_DIR) { const f = path.join(process.env.YURIINOTE_TEST_SAVE_DIR, base + '.html'); fs.writeFileSync(f, html); return f; }   // 試験用: 選ぶ画面を出さずに書く
  const r = await dialog.showSaveDialog(mainWin && !mainWin.isDestroyed() ? mainWin : undefined, { title: 'HTMLで保存', defaultPath: path.join(app.getPath('desktop'), base + '.html'), filters: [{ name: 'HTML', extensions: ['html'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, html);
  return r.filePath;
});
ipcMain.handle('aiStatus', () => ({ installed: aiEmbedder().installed() }));
ipcMain.handle('aiInstall', async () => { try { await aiEmbedder().install(p => aiSend({ kind: 'download', ...p })); return { ok: true }; } catch (e) { return { ok: false, message: String(e.message || e) }; } });
ipcMain.handle('aiVectors', async (_e, notes) => {
  try {
    const A = aiMod();
    if (!aiIdx || aiIdxVault !== vault) { aiIdxVault = vault; aiIdx = new A.Index(path.join(app.getPath('userData'), 'ai-cache', require('crypto').createHash('sha1').update(String(vault)).digest('hex').slice(0, 12) + '.json'), aiEmbedder()); }
    return { ok: true, vectors: await aiIdx.vectors(notes, p => aiSend({ kind: 'embed', ...p })) };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
});
// ===== 紙のメモ帳（スマホで撮った見開き → ページ）。画像は vault の P_memo-<記号>-<ページ>.jpg、一覧は K_pmemo.json =====
const pmemoDoc = () => (v && v.getDoc('K_pmemo')) || { pages: [] };
function pmemoBooks() { const b = {}; for (const p of pmemoDoc().pages || []) b[p.book] = Math.max(b[p.book] || 0, +p.page || 0); return b; }
function pmemoAdd(list) {
  const doc = pmemoDoc(); doc.pages = doc.pages || [];
  for (const { d, buf } of list) {
    if (d.replace) {   // 撮り直し: 同じ記号・番号の古いページは、ごみ箱へ
      for (const old of doc.pages.filter(y => y.book === d.book && y.page === +d.page)) { try { const t = path.join(vault, '.trash'); fs.mkdirSync(t, { recursive: true }); fs.renameSync(path.join(vault, old.image), path.join(t, `${Date.now()}-${old.image}`)); } catch { } }
      doc.pages = doc.pages.filter(y => !(y.book === d.book && y.page === +d.page));
    }
    let name = `P_memo-${d.book}-${+d.page}.jpg`, i = 2; while (fs.existsSync(path.join(vault, name))) name = `P_memo-${d.book}-${+d.page}_${i++}.jpg`;
    fs.writeFileSync(path.join(vault, name), buf);
    doc.pages.push({ book: d.book, page: +d.page, image: name, at: require('./stamp').full(d.at || '') });
  }
  v.saveDoc('K_pmemo', doc);
}
ipcMain.handle('pmemoList', () => pmemoDoc().pages || []);
ipcMain.handle('pmemoImage', (_e, name) => { if (!/^P_memo-[A-Z]+-\d+(?:_\d+)?\.jpg$/.test(String(name))) return null; try { return fs.readFileSync(path.join(vault, name)); } catch { return null; } });
// 番号を直す・ごみ箱へ（画像は .trash へ）
ipcMain.handle('pmemoEdit', (_e, image, x) => { const doc = pmemoDoc(), p = (doc.pages || []).find(y => y.image === image); if (!p) return false; if (x && x.remove) { try { const t = path.join(vault, '.trash'); fs.mkdirSync(t, { recursive: true }); fs.renameSync(path.join(vault, image), path.join(t, `${Date.now()}-${image}`)); } catch { } doc.pages = doc.pages.filter(y => y !== p); } else { if (/^[A-Z]+$/.test(x.book)) p.book = x.book; if (+x.page > 0) p.page = +x.page; } v.saveDoc('K_pmemo', doc); return true; });

// ===== 録音と文字化（PC のマイク・スマホの録音）。音声は vault/.recordings、一覧と文字は K_recordings.json =====
//   ノートを開いて PC で録ったものは、文字にしたあと、そのノートの末尾へ。それ以外（スマホの録音も）は、録音の一覧へ
const recDir = () => path.join(vault, '.recordings');
const recDoc = () => (v && v.getDoc('K_recordings')) || { items: [] };
const recSave = doc => v.saveDoc('K_recordings', doc);
const recSend = m => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('recUpdate', m); };
function recAdd({ at, sec, buf, ext, src, target }) {
  fs.mkdirSync(recDir(), { recursive: true });
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, file = id + (ext || '.webm'), S = require('./stamp');
  fs.writeFileSync(path.join(recDir(), file), buf);
  const doc = recDoc(); doc.items = doc.items || [];
  doc.items.push({ id, at: S.full(at || '') || S.nowStamp(), sec: +sec || 0, file, src, target: target || null, status: 'queued' });
  recSave(doc); return id;
}
let recBusy = false, recNow = null;
async function recPump() {
  if (recBusy || !v) return;
  const doc = recDoc(), it = (doc.items || []).find(x => x.status === 'queued'); if (!it) return;
  const T = require('./transcriber'), t = T.tools();
  recBusy = true; recNow = { id: it.id, pct: 0 }; it.status = 'running'; recSave(doc); recSend({ id: it.id, pct: 0 });
  try { recLearnNotes(); } catch { }   // ノートで直した所を、先に覚える
  const words = vwDoc(), prompt = VW.promptText(VW.promptWords(words, vwKeywords(), { seeds: vwSeeds(words) }));
  let r; try { r = await T.run(t, path.join(recDir(), it.file), pct => { recNow = { id: it.id, pct }; recSend({ id: it.id, pct }); }, { prompt }); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
  const d2 = recDoc(), x = (d2.items || []).find(y => y.id === it.id); let state = null;
  if (x) {
    if (r.ok) {
      x.lines = await vwFix(T.paragraphs(r.segs || [], x.at)); x.raw = undefined; x.status = 'done'; x.done = require('./stamp').nowStamp();
      if (x.target && x.lines.length && await recPlace(x)) { x.placed = true; state = v.state(); }
    } else { x.status = 'error'; x.err = r.error; }
    recSave(d2);
  }
  recBusy = false; recNow = null; recSend({ id: it.id, done: true, ok: !!r.ok, state });
  if (!r.ok && !t.ok) return;   // 部品が無ければ、ほかも同じなので続けない
  recPump();
}
async function recPlace(x) {
  await flushRenderer();
  const n = v.state().notes.find(m => m.s === x.target.s && m.id === x.target.id); if (!n) return false;
  const body = String(n.body || '').replace(/\s+$/, '');
  v.saveNote({ s: n.s, id: n.id, body: (body ? body + '\n\n' : '') + require('./stamp').migrate(x.lines.join('\n')) }); return true;   // 録音の行は、内部では行頭の日時。ノートには、本文のすぐ後ろの形で入れる
}
// ===== 音声入力の言葉（voice-words.js）。直したら覚える・次から使う。K_voicewords.json =====
const VW = require('./voice-words');
const vwDoc = () => { const d = (v && v.getDoc('K_voicewords')) || null; if (d) return d; const n = { words: [], fixes: [] }; vwSeedInit(n); return n; };
const vwSave = d => v.saveDoc('K_voicewords', d);
// 最初の 1 回: 入っている用語集（transcribe/words-ja.txt）と、~/transcribe の用語集を、単語に入れる
function vwSeedInit(d) {
  const lines = [];
  for (const f of [path.join(__dirname, 'transcribe', 'words-ja.txt'), path.join(require('os').homedir(), 'transcribe', 'glossary.txt')]) { try { lines.push(...fs.readFileSync(f, 'utf8').split('\n')); } catch { } }
  for (const l of lines) { const [w, r] = l.trim().split(/\s+/); if (!w || w.startsWith('#') || d.words.some(x => x.w === w)) continue; d.words.push({ w, src: 'seed', n: 0, ...(r ? { r } : {}) }); }
}
const vwSeeds = d => (d.words || []).filter(x => x.src === 'seed' && !x.off).map(x => x.w);
// ノートのキーワード（よく使う順）。文字化の手がかり・読みによる直しに使う
function vwKeywords() {
  const c = new Map(); for (const n of v.state().notes || []) for (const k of n.keywords || []) c.set(k, (c.get(k) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
async function vwFix(lines) {
  const d = vwDoc(), st = v.state(), readings = { ...(st.readings || {}) };
  for (const x of d.words || []) if (x.r) readings[x.w] = [].concat(readings[x.w] || [], x.r);
  const terms = [...new Set([...(d.words || []).filter(x => !x.off).map(x => x.w), ...vwKeywords()])];
  let tk = null; try { const t = await tokenizer(); tk = s => t.tokenize(s); } catch { }
  return lines.map(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} )([\s\S]*)$/), head = m ? m[1] : '', body = m ? m[2] : l;
    let out = VW.applyFixes(d, body, tk ? VW.fixOk(tk) : undefined); if (tk) { try { out = VW.fixByReading(tk, out, terms, readings); } catch { } } return head + out; });
}
function vwLearn(before, after) {
  const d = vwDoc(), got = VW.learn(d, before, after, require('./stamp').nowStamp());
  if (got.fixes.length || got.words.length) vwSave(d); return got;
}
// ノートに入れた録音の文字を、ノートで直していたら覚える（行頭の日時で、同じ段落を探す）
function recLearnNotes() {
  const doc = recDoc(); let ch = false; const st = v.state();
  for (const x of doc.items || []) {
    if (!x.placed || !x.target || !x.lines) continue;
    const n = st.notes.find(m => m.s === x.target.s && m.id === x.target.id); if (!n) continue;
    const body = String(n.body || '').split('\n');
    const S = require('./stamp'), head = b => { const at = S.stampOf(b); return at ? at + ' ' + S.stripLine(b).replace(/\s+$/, '') : b; };   // ノートの行（日時は後ろ）を、内部の形（行頭）に戻して比べる
    const now = x.lines.map(l => { const sp = l.slice(0, 19), hit = body.find(b => S.stampOf(b) === sp); return hit ? head(hit) : l; });
    if (now.join('\n') !== x.lines.join('\n')) { vwLearn(x.lines.join('\n'), now.join('\n')); x.lines = now; ch = true; }
  }
  if (ch) recSave(doc);
}
ipcMain.handle('recEdit', (_e, id, text) => {
  const d = recDoc(), x = (d.items || []).find(y => y.id === id); if (!x || !x.lines) return null;
  const stamps = x.lines.map(l => l.slice(0, 19)), plain = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const before = x.lines.map(l => l.slice(20)).join('\n');
  const got = vwLearn(before, plain.join('\n'));
  x.lines = plain.map((l, i) => `${stamps[Math.min(i, stamps.length - 1)] || require('./stamp').full(x.at)} ${l}`); x.edited = true;
  recSave(d); return got;
});
ipcMain.handle('recWords', () => { try { recLearnNotes(); } catch { } const d = vwDoc(); return { ...d, keywords: vwKeywords().slice(0, 60), prompt: VW.promptWords(d, vwKeywords(), { seeds: vwSeeds(d) }) }; });
ipcMain.handle('recWordsSave', (_e, x) => {
  const d = vwDoc(), now = require('./stamp').nowStamp();
  if (Array.isArray(x.words)) {   // 「単語 よみ」の行。消した単語は、捨てる（入っていた用語集のものは、使わない印だけ付ける）
    const keep = new Map(); for (const l of x.words) { const [w, r] = String(l).trim().split(/\s+/); if (w && !w.startsWith('#')) keep.set(w, r); }
    const out = [];
    for (const o of d.words || []) { if (keep.has(o.w)) { const r = keep.get(o.w); out.push({ ...o, ...(r ? { r } : {}), off: undefined }); keep.delete(o.w); } else if (o.src === 'seed') out.push({ ...o, off: true }); }
    for (const [w, r] of keep) out.push({ w, src: 'manual', n: 1, at: now, ...(r ? { r } : {}) });
    d.words = out;
  }
  if (Array.isArray(x.fixes)) d.fixes = x.fixes.map(l => String(l).split(/\s*(?:→|->)\s*/)).filter(p => p.length === 2 && p[0].trim().length >= 1).map(([a, b]) => { const o = (d.fixes || []).find(f => f.from === a.trim() && f.to === b.trim()); return o || { from: a.trim(), to: b.trim(), n: 1, at: now, manual: true }; });
  vwSave(d); return true;
});
ipcMain.handle('recDeleteAll', () => {   // 全部消す（文字にしている途中のものは残す）。音声は .trash へ
  const d = recDoc(), keep = [], t = path.join(vault, '.trash');
  for (const x of d.items || []) { if (x.status === 'running') { keep.push(x); continue; } if (!x.audioGone) { try { fs.mkdirSync(t, { recursive: true }); fs.renameSync(path.join(recDir(), x.file), path.join(t, `${Date.now()}-${x.file}`)); } catch { } } }
  const n = (d.items || []).length - keep.length; d.items = keep; recSave(d); return n;
});
function recResume() { if (!v) return; const d = recDoc(); let ch = false; for (const x of d.items || []) if (x.status === 'running') { x.status = 'queued'; ch = true; } if (ch) recSave(d); setTimeout(recPump, 4000); }
ipcMain.handle('recSave', (_e, bytes, meta = {}) => { const id = recAdd({ at: meta.at, sec: meta.sec, buf: Buffer.from(bytes), ext: '.webm', src: 'pc', target: meta.target }); recPump(); return id; });
ipcMain.handle('recList', () => { const t = require('./transcriber').tools(); return { items: recDoc().items || [], now: recNow, tools: t.ok }; });
ipcMain.handle('recRetry', (_e, id) => { const d = recDoc(), x = (d.items || []).find(y => y.id === id); if (!x || x.audioGone) return false; x.status = 'queued'; delete x.err; recSave(d); recPump(); return true; });
// 消す: 音声は .trash へ。keepText なら、文字は一覧に残す
ipcMain.handle('recDelete', (_e, id, keepText) => {
  const d = recDoc(), x = (d.items || []).find(y => y.id === id); if (!x || x.status === 'running') return false;
  if (!x.audioGone) { try { const t = path.join(vault, '.trash'); fs.mkdirSync(t, { recursive: true }); fs.renameSync(path.join(recDir(), x.file), path.join(t, `${Date.now()}-${x.file}`)); } catch { } }
  if (keepText && x.lines) x.audioGone = true; else d.items = d.items.filter(y => y !== x);
  recSave(d); return true;
});
// ===== スマホ（USB・adb）=====
ipcMain.handle('phoneInstall', async () => require('./phone').install({}, m => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('phoneMsg', m); }));
// スマホのメモを取り込む（Gnosis の \M と同じ）。取り込んだら、スマホへ「取り込み済み」の印を返す
// 取り込み（手動・自動 共通）
async function runPhoneImport() {
  await flushRenderer();
  const P = require('./phone'), I = require('./phone-inbox');
  const r = await P.pullInbox(); if (!r.ok) return { ok: false, message: r.message };
  const seenFile = path.join(app.getPath('userData'), 'phone-seen.json');
  let seen = new Set(); try { seen = new Set(JSON.parse(fs.readFileSync(seenFile, 'utf8')).names || []); } catch { }
  const papersDir = path.join(vault, '.phone-papers'), X = require('./id-explorer-core');
  const idsFile = path.join(app.getPath('userData'), 'phone-ids.json');   // スマホのノートのファイル名 → PC で付けた ID（あとから届く子・並列の親をたどる）
  let ids = {}; try { ids = JSON.parse(fs.readFileSync(idsFile, 'utf8')) || {}; } catch { }
  const named = [], pmemos = [];
  const out = I.importInbox(v, r.files, {
    seen, ids,
    papers: (name, buf) => { fs.mkdirSync(papersDir, { recursive: true }); fs.writeFileSync(path.join(papersDir, name), buf); },
    // スマホで付けた名前（ID・キーワード）: PC でまだ使っていない ID なら、そのまま紙のノートにする（使っていれば、取り込み画面へ回す）
    named: (d, buf) => { const id = String(d.name.id).toLowerCase(); if (!require('./lib').isId(id) || v.state().notes.some(n => n.s === 'p' && n.id === id)) return false; v.saveImage('p', id, buf); named.push({ id, kws: (d.name.kws || []).map(String) }); v.saveNote({ s: 'p', id, keywords: (d.name.kws || []).map(String), body: '' }); return true; },
    pmemo: (d, buf) => pmemos.push({ d, buf }),
    audio: (d, buf) => recAdd({ at: d.at, sec: +d.sec || 0, buf, ext: path.extname(d.file) || '.m4a', src: 'phone' }),
    suggest: (base, rel) => { const ns = v.state().notes, b = ns.find(n => n.s === 'd' && n.id === base && !n.noid); return b ? X.suggest(ns, b, rel) : null; }
  });
  fs.writeFileSync(idsFile, JSON.stringify(ids));
  for (const { kws } of named) for (const k of kws) if (!(v.state().readings || {})[k]) { try { const t = await tokenizer(); v.setReading(k, require('./lib').toHira(t.tokenize(k).map(x => x.reading && x.reading !== '*' ? x.reading : x.surface_form).join(''))); } catch { } }
  if (pmemos.length) pmemoAdd(pmemos);
  for (const n of out.done) seen.add(n);
  const present = new Set(r.files.map(f => f.name)), keep = [...seen].filter(n => present.has(n));   // スマホに残っているものだけ覚える（消されたら忘れる）
  fs.writeFileSync(seenFile, JSON.stringify({ names: keep }));
  const m1 = await P.markInbox(keep);
  const st = v.state();
  // PC のノート・メモ帳の最後のページは、スマホへは送らない（スマホに映さない）。返すのは、取り込み済みの印と、時系列記録の種類（項目の名前だけ。2026-11-17 に、利用者が同期を指示）
  const m2 = await P.sendKinds(v.records().map(x => x.name).filter(k => k !== '日記' && k !== 'メモ帳'));
  recPump();
  const sum = { ...out.sum, chats: out.sum.memos, days: out.sum.diaries, scans: out.sum.papers };
  const msg = I.summary(out.sum) ? 'スマホから取り込みました: ' + I.summary(out.sum) : 'スマホに、新しいものはありませんでした';
  return { ok: true, state: st, sum, message: msg + (out.sum.already ? `（取り込み済みで残っているもの ${out.sum.already} 件）` : '') + (m1.ok && m2.ok ? '' : '\n（スマホへ、取り込み済みの印か一覧を返せませんでした）') };
}
ipcMain.handle('phoneImport', () => runPhoneImport());
ipcMain.handle('urlTitle', async (_e, url) => { try { return (await urlPreviews.get(String(url || ''))).title || ''; } catch { return ''; } });
ipcMain.handle('urlPreview', (_e, url, force) => urlPreviews.get(String(url || ''), !!force));
ipcMain.handle('urlRefresh', () => urlPreviews.refresh(true));
ipcMain.handle('urlStatus', () => urlPreviews.status());   // リンクの表示名を、ページの題から自動で
// スマホが USB でつながったら、自動で: アプリが古ければ更新 → メモを取り込む（設定の「スマホ」でオフにできる）
let phoneBusy = false, phoneSeen = null;
async function phoneTick() {
  if (phoneBusy || !mainWin || mainWin.isDestroyed() || !v) return;
  const st = (v.state().docs || {})['K_settings'] || {}; if (st.autoPhone === false) return;
  const P = require('./phone'), devs = await P.listDevices(), dev = devs.find(d => d.state === 'device');
  if (!dev) { phoneSeen = null; return; }
  if (phoneSeen === dev.serial) return;   // つないだままの間は、1 回だけ（外して、また挿すと、もう一度）
  phoneBusy = true; phoneSeen = dev.serial;
  const send = x => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('phoneAuto', x); };
  try {
    send({ say: 'スマホがつながりました。自動で取り込みます…' });
    let updated = false, updateFail = '';
    const sha = P.apkSha(), cfg = readCfg(), have = sha ? await P.installedSha(dev.serial) : null;
    // スマホに本当に入っているアプリと比べる（読めないときだけ、前に入れた印で判断する）
    if (sha && (have !== null ? have !== sha : (cfg.phoneSha || {})[dev.serial] !== sha)) {
      send({ say: 'スマホのアプリを更新しています…' });
      const r = await P.install({ open: false, serial: dev.serial });
      if (r.ok) { writeCfg({ ...readCfg(), phoneSha: { ...(readCfg().phoneSha || {}), [dev.serial]: sha } }); updated = true; }
      else updateFail = 'スマホのアプリを更新できませんでした。' + r.message;
    }
    const r = await runPhoneImport();
    const got = r.ok && r.sum && (r.sum.chats || r.sum.days || r.sum.scans || r.sum.notes || r.sum.papers);
    send({ ok: r.ok, state: r.ok ? r.state : null, message: [updated ? 'スマホのアプリを更新しました。' : '', updateFail, r.ok ? (got ? r.message.split('\n')[0] : '') : ''].filter(Boolean).join(' '), quiet: !updated && !updateFail && !got });
  } catch (e) { send({ ok: false, message: 'スマホの自動取り込みでエラー: ' + e.message }); }
  finally { phoneBusy = false; }
}
ipcMain.handle('saveNote', (_e, n) => v.saveNote(n));
ipcMain.handle('createNote', (_e, x) => v.createNote(x));
ipcMain.handle('addPaperIndex', (_e, x) => v.addPaperIndex(x));
ipcMain.handle('dropEmptyDay', (_e, date, kind) => v.dropEmptyDay(date, kind));
ipcMain.handle('saveRegion', (_e, n, name, keywords) => v.saveRegion(n, name, keywords));
ipcMain.handle('removePaperIndex', (_e, x) => v.removePaperIndex(x));
ipcMain.handle('clearId', (_e, sp, id) => v.clearId(sp, id));
ipcMain.handle('rename', (_e, s, a, b) => v.rename(s, a, b));
ipcMain.handle('saveImage', (_e, s, id, bytes) => v.saveImage(s, id, Buffer.from(bytes)));
ipcMain.handle('saveTopic', (_e, t, old) => v.saveTopic(t, old));
ipcMain.handle('deleteTopic', (_e, name) => v.deleteTopic(name));
ipcMain.handle('deleteNotes', (_e, items) => v.deleteNotes(items));
ipcMain.handle('addFiles', (_e, list) => {
  const names = v.addFiles(list), dups = v.takeFileDups();
  if (dups.length && mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('fileDup', dups);   // 「既にあります」を画面に出す
  return names;
});
ipcMain.handle('deleteFile', (_e, name) => v.deleteFile(name));
ipcMain.handle('filePreview', (_e, name) => v.filePreview(name));
ipcMain.handle('filesInfo', () => v.filesInfo());
ipcMain.handle('setFileInfo', (_e, name, info) => v.setFileInfo(name, info));
// 本文のリンクを開く。ファイルは OS の既定のビューアーで、http(s) は既定のブラウザで
ipcMain.handle('openPath', (_e, rel) => {
  if (process.env.YURIINOTE_OPENLOG || process.env.YURIIKASTEN_OPENLOG) { fs.appendFileSync(process.env.YURIINOTE_OPENLOG || process.env.YURIIKASTEN_OPENLOG, decodeURIComponent(rel) + '\n'); return ''; } // 試験用: 開かず記録だけ
  const external = externalUri(rel);
  if (external) return shell.openExternal(external);
  const root = path.resolve(vault), full = path.resolve(root, decodeURIComponent(rel));
  if (!full.startsWith(root + path.sep)) return 'blocked';
  return shell.openPath(full);
});
ipcMain.handle('diaryState', () => v.diaryState());
ipcMain.handle('openDiary', (_e, date, kind) => v.openDiary(date, kind));
ipcMain.handle('saveDiary', (_e, d) => v.saveDiary(d));
ipcMain.handle('deleteDiary', (_e, date, kind) => v.deleteDiary(date, kind));
ipcMain.handle('appendToDay', (_e, kind, date, text) => v.appendToDay(kind, date, text));
ipcMain.handle('recordOp', (_e, op, ...a) => ['addRecord', 'setRecordParent', 'setDayParent', 'renameRecord', 'deleteRecord', 'mergeRecords'].includes(op) ? v[op](...a) : false);
ipcMain.handle('addDiaryScan', (_e, date, bytes) => v.addDiaryScan(date, Buffer.from(bytes)));
ipcMain.handle('saveDoc', (_e, name, obj) => v.saveDoc(name, obj));
ipcMain.handle('deleteDoc', (_e, name) => v.deleteDoc(name));
ipcMain.handle('setReading', (_e, k, r) => v.setReading(k, r));
// 読みの候補（kuromoji。最初の1回だけ辞書を読む）
let tk = null;
const tokenizer = () => tk || (tk = new Promise((ok, ng) => require('kuromoji')
  .builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) })
  .build((e, t) => e ? ng(e) : ok(t))));
ipcMain.handle('suggest', async (_e, text) => {
  const t = await tokenizer();
  return require('./lib').toHira(t.tokenize(text).map(x => x.reading && x.reading !== '*' ? x.reading : x.surface_form).join(''));
});
ipcMain.handle('chooseVault', async () => {
  const r = await dialog.showOpenDialog({ title: 'ノートを保存するフォルダ', defaultPath: vault || suggestVault(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return null;
  await flushRenderer(); // Also flush edits made while the folder picker was open.
  vault = r.filePaths[0]; writeCfg({ ...readCfg(), vault }); return open();
});

// ===== ショートカット（デスクトップ）とコマンド =====
//  Windows: インストーラーが、デスクトップとスタートメニューに作る
//  Mac: アプリをデスクトップに置くショートカット（エイリアス）を作る
//  Linux: AppImage を ~/.local/share/YuriiNote に置き、アプリ一覧・デスクトップのショートカットと `YuriiNote` コマンドを作る
function installShortcuts() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const exe = app.getPath('exe'), bundle = exe.includes('.app/') ? exe.slice(0, exe.indexOf('.app/') + 4) : null;
    if (!bundle) return '開発中は作れません';
    const link = path.join(home, 'Desktop', 'YuriiNote');
    try { fs.rmSync(link, { force: true }); fs.symlinkSync(bundle, link); } catch (e) { return 'ショートカットを作れませんでした: ' + e.message; }
    return `デスクトップに YuriiNote のショートカットを作りました`;
  }
  if (process.platform === 'win32') return 'Windows は、インストーラーがデスクトップとスタートメニューに作ります';
  const dir = path.join(home, '.local', 'share', 'YuriiNote'), bin = path.join(home, '.local', 'bin');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(bin, { recursive: true });
  let exec;
  if (process.env.APPIMAGE) { // AppImage: 決まった場所へ置く
    exec = path.join(dir, 'YuriiNote.AppImage');
    if (path.resolve(process.env.APPIMAGE) !== exec) { fs.copyFileSync(process.env.APPIMAGE, exec); fs.chmodSync(exec, 0o755); }
    fs.copyFileSync(path.join(__dirname, 'update.js'), path.join(dir, 'update.js'));
    fs.writeFileSync(path.join(dir, 'install.json'), JSON.stringify({ appImage: exec, version: app.getVersion() }));
    fs.writeFileSync(path.join(bin, 'YuriiNote'), `#!/bin/sh
# YuriiNote のコマンド。--update / --check / --version は、画面なしで動く
case "$1" in
  --update|--check|--version) exec env ELECTRON_RUN_AS_NODE=1 "${exec}" "${path.join(dir, 'update.js')}" "$@" ;;
  *) exec "${exec}" "$@" ;;
esac
`, { mode: 0o755 });
  } else { // 開発用のフォルダ: そのまま起動する
    exec = path.join(__dirname, 'yuriinote.sh');
    fs.writeFileSync(path.join(bin, 'YuriiNote'), `#!/bin/sh
exec "${exec}" "$@"
`, { mode: 0o755 });
  }

  // 古いコマンド名は既存インストールの互換性のためのみ保持。新規ショートカットはYuriiNote。
  for (const old of [path.join(home, '.local', 'share', 'applications', 'YuriiKasten.desktop'), path.join(home, 'Desktop', 'YuriiKasten.desktop')]) { try { fs.rmSync(old, { force: true }); } catch { } }
  const icon = path.join(dir, 'icon.png'); try { fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), icon); } catch { }
  const entry = `[Desktop Entry]\nType=Application\nName=YuriiNote\nComment=紙のPKM（ツェッテルカステン）をデジタルで\nExec="${exec}" %U\nIcon=${icon}\nTerminal=false\nCategories=Office;\n`.replace(/\\n/g, '\n');
  const apps = path.join(home, '.local', 'share', 'applications'); fs.mkdirSync(apps, { recursive: true });
  fs.writeFileSync(path.join(apps, 'YuriiNote.desktop'), entry, { mode: 0o755 });
  const desk = path.join(home, 'Desktop'); let onDesk = false;
  if (fs.existsSync(desk)) { const f = path.join(desk, 'YuriiNote.desktop'); fs.writeFileSync(f, entry, { mode: 0o755 }); onDesk = true; try { require('child_process').execFileSync('gio', ['set', f, 'metadata::trusted', 'true'], { stdio: 'ignore' }); } catch { } }
  return `アプリ一覧${onDesk ? 'と、デスクトップ' : ''}にショートカットを作りました。端末では YuriiNote で開けます（更新は YuriiNote --update）`;
}
if (argv.includes('--install') || argv.includes('--install-shortcuts')) { app.whenReady().then(() => { console.log(installShortcuts()); app.exit(0); }); }

// アプリの情報・更新（ユーザーが押したときだけ。自動では確認も更新もしない）
ipcMain.handle('appInfo', () => ({ version: app.getVersion(), platform: process.platform, selfUpdate: !!(process.env.APPIMAGE || info().devDir), mode: info().devDir ? 'git' : process.env.APPIMAGE ? 'appimage' : 'installer' }));
ipcMain.handle('checkUpdate', async () => { try { const c = await upd.check(info()); return { ok: true, ...c, release: undefined, asset: c.asset && c.asset.name }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('doUpdate', async () => {
  try {
    const i = info(), c = await upd.check(i), r = await upd.apply(i, c);
    if (r.manual) shell.openExternal(r.url);
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('installShortcuts', () => installShortcuts());
ipcMain.handle('openUrl', (_e, url) => /^https:\/\/github\.com\/Yurii7812\//.test(url) ? shell.openExternal(url) : null);

if (!argv.some(a => ['--version', '--update', '--check', '--install'].includes(a))) app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('jp.yurii.yuriinote');
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({
    width: 1200, height: 800, title: 'YuriiNote', backgroundColor: '#ffffff', show: false, icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  // 外部Webサイトはアプリの中へ遷移させず、OSの既定ブラウザーで開く。
  w.webContents.setWindowOpenHandler(({url}) => {
    const target=externalUri(url); if(target) void shell.openExternal(target);
    return {action:'deny'};
  });
  w.webContents.on('will-navigate',(event,url)=>{
    if(url===w.webContents.getURL()) return;
    event.preventDefault();
    const target=externalUri(url); if(target) void shell.openExternal(target);
  });
  // A failed write or timeout must leave the editor open with its input intact.
  guardClose(w, flushRenderer, error => {
    dialog.showMessageBox(w, { type: 'error', title: '保存が完了していません', message: '入力内容を残すため、アプリを開いたままにしています。', detail: error.message + '\n保存先を確認してから、もう一度閉じてください。' });
  });
  mainWin = w; setInterval(phoneTick, 6000); setTimeout(phoneTick, 3000); w.maximize(); w.once('ready-to-show', () => w.show()); w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
