import {spawn} from 'node:child_process';
import {writeFile, readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export class NativeError extends Error {
  constructor(code, detail) {
    const messages = {
      WINDOW_UNAVAILABLE: '暂时找不到或无法恢复微信课程窗口，请保持微信打开并解锁电脑。',
      WINDOW_AMBIGUOUS: '检测到多个微信网页窗口，请保留课程窗口后重试。',
      CAPTURE_BLANK: '微信窗口返回黑图或空白截图，正在等待画面恢复。'
    };
    super(messages[code] ?? detail);this.code=code;this.detail=detail;
  }
}
export function decodeNativeResult(output, error, code) {
  let parsed;
  try {parsed=JSON.parse(output.replace(/^\uFEFF/,'').trim());} catch {}
  if(parsed?.error)throw new NativeError(parsed.error.code,parsed.error.message);
  if(code!==0)throw new Error(error.trim().split(/\r?\n/)[0] || `Windows helper exited ${code}`);
  if(!parsed)throw new Error(`无法解析识别结果：${output.slice(0,180)}`);
  return parsed;
}
export class Bridge {
  constructor(dir) {this.dir = dir; this.renderer = null; this.window = {};}
  async invoke(request) {
    await mkdir(this.dir, {recursive: true});
    const file = path.join(this.dir, 'request.json');
    await writeFile(file, JSON.stringify(request), 'utf8');
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'native.ps1'), '-RequestFile', file], {windowsHide: true});
      let out = '', error = '';
      const timeout = setTimeout(() => {child.kill(); reject(new Error('Windows 识别操作超时。'));}, 25000);
      child.stdout.on('data', d => out += d.toString('utf8'));
      child.stderr.on('data', d => error += d.toString('utf8'));
      child.on('error', e => {clearTimeout(timeout); reject(e);});
      child.on('close', code => {
        clearTimeout(timeout);
        try {resolve(decodeNativeResult(out,error,code));} catch(e) {reject(e);}
      });
    });
  }
  async snapshot() {
    const s = await this.invoke({action: 'snapshot', renderer: this.renderer, ...this.window, image: path.join(this.dir, 'latest.png')});
    this.renderer = s.renderer.handle;
    this.window = {browser:s.browser.handle,root:s.root,rootPid:s.rootPid};
    await writeFile(path.join(this.dir, 'snapshot.json'), JSON.stringify(s), 'utf8');
    return s;
  }
  async input(s, action, p, extra = {}) {
    if (Date.now() - s.capturedAt > 12000) throw new Error('截图已过期，已取消点击。');
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('未定位到有效操作位置。');
    return this.invoke({action, renderer: s.renderer.handle, browser:s.browser.handle,root:s.root,rootPid:s.rootPid,fingerprint: s.fingerprint, capturedAt: s.capturedAt, x: p.x, y: p.y, ...extra});
  }
}
export async function readJSON(file, fallback = null) {try {return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));} catch {return fallback;}}
