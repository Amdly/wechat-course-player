import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, copyFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clean} from '../recognize.mjs';
import {existsSync} from 'node:fs';
const exec=promisify(execFile);
test('Windows OCR reads both clock values from the optional local failure image', {skip:process.platform!=='win32'||!existsSync(new URL('./player-clock.png',import.meta.url)),timeout:30000}, async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'course-clock-test-'));
  try {
    const image=path.join(dir,'player.png');await copyFile(new URL('./player-clock.png',import.meta.url),image);
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../player-controls.ps1',import.meta.url)),'-Image',image,'-TitleY','1065'],{windowsHide:true});
    const result=JSON.parse(stdout.replace(/^\uFEFF/,''));
    assert.ok(result.lines.some(l=>clean(l.text)==='1:38/42:31'));
  }finally{
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'course-clock-test-'));
    await rm(dir,{recursive:true,force:true});
  }
});
