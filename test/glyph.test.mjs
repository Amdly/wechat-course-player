import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
test('native control detection is independent of clock text and rejects hidden/solid controls',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'course-glyph-test-'));
  try{
    const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./glyph-fixtures.ps1',import.meta.url)),'-Directory',dir],{windowsHide:true});
    const samples=Object.fromEntries(JSON.parse(stdout).map(s=>[s.sample,s.control.glyph]));
    assert.deepEqual(samples,{playing:'playing',paused:'paused',hidden:'unknown',solid:'unknown'});
  }finally{
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'course-glyph-test-'));
    await rm(dir,{recursive:true,force:true});
  }
});
