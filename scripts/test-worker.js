'use strict';
// 隔离测试 Windows 缩略图工作器：加载 server.js 里同一份 PS 脚本，连发两个请求看响应
const { spawn } = require('child_process');
const path = require('path');

// 从 server.js 抠出 WIN_THUMB_PS（按标记索引，兼容 CRLF/LF）
const src = require('fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const a = src.indexOf('const WIN_THUMB_PS = `');
const b = src.indexOf('`;', a);
if (a < 0 || b < 0) { console.error('抠脚本失败'); process.exit(1); }
const PS = src.slice(a + 'const WIN_THUMB_PS = `'.length, b);

const w = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', Buffer.from(PS, 'utf16le').toString('base64')],
  { stdio: ['pipe', 'pipe', 'pipe'] });
w.stderr.on('data', (d) => console.error('[ps-err]', String(d).slice(0, 300)));
w.on('exit', (c) => console.error('[ps-exit]', c));

let buf = '';
w.stdout.on('data', (d) => {
  buf += String(d);
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    console.log('[ps-out]', line);
    if (line.includes('"id":2')) { console.log('=== 两个请求都完成，测试通过 ==='); w.kill(); process.exit(0); }
  }
});

const req = (id, p) => JSON.stringify({ id, src: Buffer.from(p, 'utf8').toString('base64'), out: Buffer.from(path.join(require('os').tmpdir(), `wtest-${id}.png`), 'utf8').toString('base64'), size: 240, png: 1 });
w.stdin.write(req(1, 'D:/codes/fanbox/build/icon-1024.png') + '\n');
setTimeout(() => { console.log('--- 发第二个请求 ---'); w.stdin.write(req(2, 'D:/codes/fanbox/public/assets/agents/hermes.png') + '\n'); }, 3000);
setTimeout(() => { console.error('=== 15s 超时，卡住 ==='); w.kill(); process.exit(1); }, 15000);
