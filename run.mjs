import {readFile, writeFile, appendFile, mkdir, rename, access, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {Bridge} from './bridge.mjs';
import {Controller} from './controller.mjs';
import {analyze} from './recognize.mjs';
import {keepAwake} from './power.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const dir = config.runDir;
await mkdir(dir, {recursive: true});
const bridge = new Bridge(dir);
const controller = new Controller(config);
let stopRequested = false, lastMessage = '', status = 'running';
let power = null, lastDiagnostic = 0, lastSnapshot = null, lastDecision = null;
process.on('SIGTERM', () => stopRequested = true);
process.on('SIGINT', () => stopRequested = true);
async function stopped() {
  try {await access(path.join(dir, 'stop')); stopRequested = true;} catch {}
  return stopRequested;
}
async function publish(message) {
  const record = {...controller.state, status, message, settings: config, updatedAt: Date.now()};
  await writeFile(path.join(dir, 'status.tmp'), JSON.stringify(record, null, 2), 'utf8');
  await rename(path.join(dir, 'status.tmp'), path.join(dir, 'status.json'));
  if (message !== lastMessage) {
    await appendFile(path.join(dir, 'events.jsonl'), JSON.stringify({time: Date.now(), status, message, completed: record.completed, course: record.current?.title, page: record.page, videoTime: record.videoTime, videoDuration: record.videoDuration, keepAwake: record.keepAwake}) + '\n');
    console.log(message); lastMessage = message;
  }
}
async function diagnose(snapshot, decision) {
  lastSnapshot = snapshot; lastDecision = decision;
  if (Date.now() - lastDiagnostic < 30000 && decision.type !== 'stop') return;
  lastDiagnostic = Date.now();
  await appendFile(path.join(dir, 'diagnostics.jsonl'), JSON.stringify({time: lastDiagnostic, page: decision.page.kind, action: decision.type, reason: decision.reason, timer: decision.page.timer && {current: decision.page.timer.current, total: decision.page.timer.total}, glyph: snapshot.glyph, controlToggle: snapshot.controlToggle, cachedDuration: controller.state.videoDuration, timeReadable: controller.state.timeReadable, clockOCR: (snapshot.playerControls ?? []).map(l => l.text), controlOcrError: snapshot.controlOcrError, completed: controller.state.completed, keepAwake: controller.state.keepAwake}) + '\n');
}
async function preserveStopEvidence() {
  if (!lastSnapshot) return;
  await writeFile(path.join(dir, 'stop-snapshot.json'), JSON.stringify({snapshot: lastSnapshot, reason: lastDecision?.reason}, null, 2));
  await copyFile(lastSnapshot.image, path.join(dir, 'stop.png'));
}
async function delay(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && !(await stopped())) await new Promise(r => setTimeout(r, Math.min(350, until - Date.now())));
}
async function pauseIfPlaying() {
  try {
    let s = await bridge.snapshot(), p = analyze(s);
    if (p.kind !== 'player') return;
    if (!p.toggle || p.glyph === 'unknown') {await bridge.input(s, 'hover', p.hover); s = await bridge.snapshot(); p = analyze(s);}
    if (p.kind === 'player' && p.glyph === 'playing' && p.toggle) {
      await bridge.input(s, 'click', p.toggle);
      controller.state.stopAction = '已点击暂停';
    } else if (p.kind === 'player' && (p.glyph === 'paused' || p.bigPlay)) {
      controller.state.stopAction = '视频已暂停';
    } else if (p.kind === 'player') {
      await bridge.input(s, 'click', {x: Math.round(s.renderer.width*.035), y: Math.round(s.renderer.width*.034)});
      controller.state.stopAction = '已返回课程概览停止播放';
    }
  } catch (e) {await appendFile(path.join(dir, 'events.jsonl'), JSON.stringify({time: Date.now(), message: `停止时未能确认暂停：${e.message}`}) + '\n');}
}
try {
  power = await keepAwake(dir);
  controller.state.keepAwake = true;
  await publish('已开启运行期间防熄屏和防自动睡眠');
  await publish('正在定位微信课程窗口');
  while (!(await stopped())) {
    power.assertActive();
    const snapshot = await bridge.snapshot();
    if (await stopped()) break;
    const decision = controller.decide(snapshot);
    await diagnose(snapshot, decision);
    await publish(decision.reason);
    if (decision.type === 'stop') {
      status = controller.state.completed >= config.maxCycles ? 'completed' : 'stopped';
      await preserveStopEvidence();
      await pauseIfPlaying();
      await publish(decision.reason);
      process.exitCode = 0;
      break;
    }
    if (decision.type !== 'wait') {
      if (await stopped()) break;
      await bridge.input(snapshot, decision.type, decision.point, decision.delta ? {delta: decision.delta} : {});
    }
    await delay(decision.delay ?? 2000);
  }
  if (stopRequested) {await pauseIfPlaying(); status = 'stopped'; await publish(`已停止；${controller.state.stopAction ?? '完成记录已保存'}。`);}
} catch (error) {
  status = 'error';
  try {await preserveStopEvidence();} catch {}
  await pauseIfPlaying();
  await publish(error.message);
  process.exitCode = 1;
} finally {
  if (power) await power.release();
  controller.state.keepAwake = false;
  await publish(lastMessage);
}
