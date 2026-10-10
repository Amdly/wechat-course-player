import {spawn} from 'node:child_process';
import {writeFile, readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export class Bridge {
  constructor(dir) {this.dir = dir; this.renderer = null;}
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
        if (code !== 0) return reject(new Error(error.trim() || `Windows helper exited ${code}`));
        try {resolve(JSON.parse(out.replace(/^\uFEFF/, '').trim()));} catch {reject(new Error(`无法解析识别结果：${out.slice(0, 180)}`));}
      });
    });
  }
  async snapshot() {
    const s = await this.invoke({action: 'snapshot', renderer: this.renderer, image: path.join(this.dir, 'latest.png')});
    this.renderer = s.renderer.handle;
    await writeFile(path.join(this.dir, 'snapshot.json'), JSON.stringify(s), 'utf8');
    return s;
  }
  async input(s, action, p, extra = {}) {
    if (Date.now() - s.capturedAt > 12000) throw new Error('截图已过期，已取消点击。');
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('未定位到有效操作位置。');
    return this.invoke({action, renderer: s.renderer.handle, fingerprint: s.fingerprint, capturedAt: s.capturedAt, x: p.x, y: p.y, ...extra});
  }
}
export async function readJSON(file, fallback = null) {try {return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));} catch {return fallback;}}
