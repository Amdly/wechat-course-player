import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('native capture guard rejects uniform black/white frames but accepts a page',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./capture-fixtures.ps1',import.meta.url))],{windowsHide:true});
  assert.deepEqual(JSON.parse(stdout),{black:true,white:true,page:false});
});
