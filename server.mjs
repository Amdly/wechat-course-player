import http from 'node:http';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile, writeFile, mkdir, appendFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Bridge, readJSON} from './bridge.mjs';
import {analyze} from './recognize.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, 'runtime');
await mkdir(runtime, {recursive: true});
let child = null, current = await readJSON(path.join(runtime, 'last-run.json'));
let inspecting = false;
function json(res, code, data) {res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data));}
async function status() {
  const result = current ? await readJSON(path.join(current.runDir, 'status.json')) : null;
  return {...(result ?? {status: 'idle', completed: 0, skipped: 0, inspected: 0, message: '打开微信课程页后，点击开始运行。'}), active: !!child, runId: current?.id};
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {data += chunk; if (data.length > 4096) throw new Error('请求过长。');}
  return JSON.parse(data || '{}');
}
const server = http.createServer(async (req, res) => {
  try {
    const expected = `http://127.0.0.1:${server.address().port}`;
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || (req.headers.origin && req.headers.origin !== expected)) return json(res, 403, {error: '仅允许本机控制页面访问。'});
    const url = new URL(req.url, expected);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {app: 'wechat-course-player', pid: process.pid});
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, await status());
    if (req.method === 'GET' && url.pathname === '/api/events') {
      let events = [];
      if (current) {try {events = (await readFile(path.join(current.runDir, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).slice(-40).map(line => JSON.parse(line));} catch {}}
      return json(res, 200, events);
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      if (child || inspecting) return json(res, 409, {error: '已有任务运行或正在检查页面，请稍后再试。'});
      const input = await body(req);
      const maxCycles = Number(input.maxCycles), maxMinutes = Number(input.maxMinutes ?? 480);
      if (!Number.isInteger(maxCycles) || maxCycles < 1 || maxCycles > 100 || !Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 1440) return json(res, 400, {error: '循环次数须为 1–100，运行上限须为 1–1440 分钟。'});
      const id = randomUUID(), runDir = path.join(runtime, 'runs', id);
      current = {id, runDir};
      await mkdir(runDir, {recursive: true});
      const config = {maxCycles, maxMinutes, runDir};
      const configFile = path.join(runDir, 'config.json');
      await writeFile(configFile, JSON.stringify(config));
      await writeFile(path.join(runtime, 'last-run.json'), JSON.stringify(current));
      await writeFile(path.join(runDir, 'status.json'), JSON.stringify({status: 'running', completed: 0, skipped: 0, inspected: 0, message: '正在启动', settings: config}));
      const out = createWriteStream(path.join(runDir, 'worker.log'), {flags: 'a'});
      child = spawn(process.execPath, [path.join(root, 'run.mjs'), configFile], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      const worker = child;
      child.stdout.pipe(out, {end: false}); child.stderr.pipe(out, {end: false});
      const finish = async () => {
        out.end(); if (child === worker) child = null;
        const previous = await readJSON(path.join(runDir, 'status.json'));
        if (previous?.status === 'running') await writeFile(path.join(runDir, 'status.json'), JSON.stringify({...previous, status: 'error', message: '运行进程意外退出，记录已保存。'}));
      };
      child.once('close', finish);
      child.once('error', async error => {await appendFile(path.join(runDir, 'worker.log'), error.message);});
      return json(res, 200, {ok: true, id});
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      if (child && current) await writeFile(path.join(current.runDir, 'stop'), 'stop');
      return json(res, 200, {ok: true});
    }
    if (req.method === 'POST' && url.pathname === '/api/inspect') {
      if (child || inspecting) return json(res, 409, {error: '运行中请查看当前状态。'});
      inspecting = true;
      try {
        const snapshot = await new Bridge(path.join(runtime, 'preview')).snapshot();
        const page = analyze(snapshot);
        return json(res, 200, {kind: page.kind, title: page.title, progress: page.progress, glyph: snapshot.glyph, reason: page.reason});
      } finally {inspecting = false;}
    }
    if (req.method === 'GET' && url.pathname === '/api/screenshot') {
      const image = child && current ? path.join(current.runDir, 'latest.png') : url.searchParams.has('preview') ? path.join(runtime, 'preview', 'latest.png') : current ? path.join(current.runDir, 'latest.png') : path.join(runtime, 'preview', 'latest.png');
      try {res.writeHead(200, {'Content-Type': 'image/png', 'Cache-Control': 'no-store'}); res.end(await readFile(image));} catch {if (!res.headersSent) res.writeHead(404); res.end();}
      return;
    }
    const assets = {'/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css']};
    if (req.method === 'GET' && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      res.writeHead(200, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});
      return res.end(await readFile(path.join(root, 'ui', file)));
    }
    json(res, 404, {error: 'Not found'});
  } catch (error) {if (!res.headersSent) json(res, 500, {error: error.message}); else res.end();}
});
for (let port = 18465; port <= 18475; port++) {
  try {await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', () => {server.removeListener('error', reject); resolve();});}); break;}
  catch (e) {if (e.code !== 'EADDRINUSE' || port === 18475) throw e;}
}
const url = `http://127.0.0.1:${server.address().port}`;
await writeFile(path.join(runtime, 'server.json'), JSON.stringify({url, pid: process.pid}));
console.log(url);
async function shutdown() {if (child && current) await writeFile(path.join(current.runDir, 'stop'), 'stop'); server.close();}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
