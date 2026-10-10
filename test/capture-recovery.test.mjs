import test from 'node:test';
import assert from 'node:assert/strict';
import {CaptureRecovery} from '../capture-recovery.mjs';
import {NativeError,decodeNativeResult} from '../bridge.mjs';
test('a temporary missing course window waits and can resume without restarting the run',()=>{
  const r=new CaptureRecovery(),error=new NativeError('WINDOW_UNAVAILABLE','native detail');
  assert.equal(r.failed(error,0).type,'wait');
  assert.equal(r.failed(error,110000).type,'wait');
  assert.equal(r.recovered(),true);assert.equal(r.recovered(),false);
  assert.equal(r.failed(error,200000).type,'wait');
});
test('alternating missing windows and black captures cannot extend the recovery deadline forever',()=>{
  const r=new CaptureRecovery();
  assert.equal(r.failed(new NativeError('WINDOW_UNAVAILABLE',''),0).type,'wait');
  assert.equal(r.failed(new NativeError('CAPTURE_BLANK',''),80000).type,'wait');
  const end=r.failed(new NativeError('WINDOW_UNAVAILABLE',''),120000);
  assert.equal(end.type,'stop');assert.match(end.reason,/2 分钟/);
});
test('ambiguous windows and unrelated errors are not retried as recoverable capture failures',()=>{
  const r=new CaptureRecovery();
  assert.throws(()=>r.failed(new NativeError('WINDOW_AMBIGUOUS','')),e=>e.code==='WINDOW_AMBIGUOUS');
  assert.throws(()=>r.failed(new Error('invalid input point')),/invalid input point/);
});
test('structured native errors show a concise localized reason instead of a PowerShell stack trace',()=>{
  assert.throws(()=>decodeNativeResult(JSON.stringify({error:{code:'CAPTURE_BLANK',message:'Black frame'}}),'PowerShell stack trace',2),e=>e.code==='CAPTURE_BLANK'&&e.message.includes('黑图')&&!e.message.includes('stack'));
  assert.deepEqual(decodeNativeResult('\uFEFF{"ok":true}','',0),{ok:true});
  assert.throws(()=>decodeNativeResult('','First error\r\nprivate stack path',1),e=>e.message==='First error');
});
