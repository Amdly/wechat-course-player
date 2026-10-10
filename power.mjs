import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export async function keepAwake(dir) {
  const stopFile = path.join(dir, 'power.stop');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./keep-awake.ps1', import.meta.url)), '-OwnerId', String(process.pid), '-StopFile', stopFile], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '', errors = '', ended = false, released = false;
  let resolveClosed;
  const closed = new Promise(resolve => resolveClosed = resolve);
  child.once('close', () => {ended = true; resolveClosed();});
  child.stderr.on('data', data => errors += data.toString('utf8'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {child.kill(); reject(new Error('保持唤醒服务启动超时。'));}, 10000);
    const ready = data => {output += data.toString('utf8'); if (output.includes('READY')) {clearTimeout(timer); child.stdout.off('data', ready); resolve();}};
    child.stdout.on('data', ready);
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('close', () => {clearTimeout(timer); reject(new Error(`保持唤醒服务退出：${errors.trim()}`));});
  });
  return {
    assertActive() {if (ended && !released) throw new Error('保持唤醒服务意外退出，已停止操作。');},
    async release() {
      released = true;
      await writeFile(stopFile, 'stop');
      const timer = setTimeout(() => child.kill(), 4000);
      try {await closed;} finally {clearTimeout(timer);}
    }
  };
}
