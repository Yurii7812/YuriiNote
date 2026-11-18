#!/usr/bin/env node
// 旧い番号 → 区画とトピックの番号（2026-11-17）。デジタルのノートだけ。紙の番号は古いまま。
//   node scripts/migrate-zk-id.js plan  VAULT   複製の上で対応表を出す（vault は変えない）
//   node scripts/migrate-zk-id.js apply VAULT   アプリを閉じてから。バックアップを取ってから書き換える（一度だけ）
const fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const { openVault } = require('../store');

const [mode, vault] = process.argv.slice(2);
if (!['plan', 'apply'].includes(mode) || !vault || !fs.existsSync(vault)) {
  console.error('使い方: node scripts/migrate-zk-id.js plan|apply VAULT'); process.exit(2);
}

function copyDir(from, to) { fs.mkdirSync(to, { recursive: true }); fs.cpSync(from, to, { recursive: true }); }
function appRunning() {
  try { return execSync('pgrep -f "app-path=" || true', { encoding: 'utf8' }).split('\n').some(l => /YuriiNote|gnosis-work\/ysimple|\/YuriiNote$/.test(l)); }
  catch { return false; }
}
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

if (mode === 'plan') {
  const tmp = path.join(os.tmpdir(), 'zkid-plan-' + stamp());
  copyDir(vault, tmp);
  const r = openVault(tmp).migrateDigitalIds();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify({ changed: r.changed, map: r.map }, null, 2));
  process.exit(0);
}

if (appRunning()) { console.error('YuriiNote が起動中です。閉じてから実行してください。'); process.exit(1); }
const backup = path.join(os.homedir(), 'gnosis-work', 'backup', `yurii-note-before-zk-id-${stamp()}`);
copyDir(vault, backup);
const r = openVault(vault).migrateDigitalIds();
console.log(JSON.stringify({ ok: r.ok, reason: r.reason, changed: r.changed, backup }, null, 2));
