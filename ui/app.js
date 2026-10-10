const $ = id => document.getElementById(id);
const labels = {idle: '准备就绪', running: '运行中', completed: '已达到次数', stopped: '已停止', error: '需要处理'};
const pageLabels = {overview: '课程概览', player: '视频播放页', catalog: '全部课程', records: '学习记录', loading: '页面加载中', unknown: '暂未识别到课程页', blocked: '需要手动处理', detail: '课程详情'};
let active = false, busy = false, preview = false;
async function api(url, data) {
  const response = await fetch(url, data === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '请求失败'); return result;
}
function controls() {for (const id of ['cycles', 'minutes', 'start', 'inspect']) $(id).disabled = active || busy; $('stop').disabled = !active;}
const clock = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
async function update() {
  try {
    const state = await api('/api/status'); active = state.active; controls();
    if (active && state.settings) {$('cycles').value=state.settings.maxCycles; $('minutes').value=state.settings.maxMinutes;}
    $('badge').textContent = labels[active ? 'running' : state.status] ?? state.status;
    $('badge').className = `badge ${active ? 'running' : state.status}`;
    $('completed').replaceChildren(document.createTextNode(String(state.completed ?? 0)));
    const small = document.createElement('small'); small.textContent = ` / ${state.settings?.maxCycles ?? $('cycles').value}`; $('completed').append(small);
    $('skipped').textContent = state.skipped ?? 0; $('inspected').textContent = state.inspected ?? 0;
    $('course').textContent = state.current?.title || (state.completed ? '本轮运行结束' : '等待开始');
    $('message').textContent = state.message;
    $('power').textContent = active && state.keepAwake ? '已启用防熄屏和防自动睡眠，停止后自动释放。请保持电脑解锁。' : '运行期间自动保持屏幕和系统唤醒，停止后恢复正常。';
    const progress = state.current?.progress;
    $('percent').textContent = Number.isFinite(progress) ? `${progress}%` : '—'; $('progress').value = progress ?? 0;
    $('playtime').textContent = active && state.page === 'player'
      ? `${state.timeReadable ? '视频时间' : '上次读到的时间'}：${clock(state.videoTime)} / ${clock(state.videoDuration)} · ${({playing:'播放中',paused:'已暂停',unknown:'正在确认状态'})[state.playbackState] ?? '正在确认状态'}${state.timeReadable ? '' : ' · 时间暂不可读，仍监测播放状态与提示'}`
      : '完成次数以课程页面确认达到 100% 为准。';
    const events = await api('/api/events');
    if (events.length) {$('events').replaceChildren(...events.slice().reverse().map(event => {const li = document.createElement('li'); const time = document.createElement('time');time.textContent = new Date(event.time).toLocaleTimeString('zh-CN', {hour12:false}); const message = document.createElement('span'); message.textContent = event.message; li.append(time, message);return li;}));}
  } catch (e) {$('message').textContent = `连接本机服务失败：${e.message}`;}
}
for (const id of ['cycles', 'minutes']) {const saved = localStorage.getItem(id); if (saved) $(id).value = saved; $(id).addEventListener('change', () => localStorage.setItem(id, $(id).value));}
$('start').addEventListener('click', async () => {
  busy = true; controls(); preview = false;
  try {await api('/api/start', {maxCycles: Number($('cycles').value), maxMinutes: Number($('minutes').value)}); await update();} catch(e) {$('inspection').textContent=e.message;} finally {busy=false;controls();}
});
$('stop').addEventListener('click', async () => {try {$('stop').disabled=true; await api('/api/stop', {}); $('message').textContent='正在停止并保存记录…';} catch(e) {$('message').textContent=e.message;}});
$('inspect').addEventListener('click', async () => {
  busy=true; controls(); $('inspection').textContent='正在读取微信课程页面…';
  try {const result=await api('/api/inspect', {}); preview=true; $('inspection').textContent=[pageLabels[result.kind] ?? result.kind, result.title, result.progress===null||result.progress===undefined?'':`${result.progress}%`, result.reason].filter(Boolean).join(' · '); $('screenshot').src=`/api/screenshot?preview=1&t=${Date.now()}`;} catch(e) {$('inspection').textContent=e.message;} finally {busy=false;controls();}
});
document.querySelector('details').addEventListener('toggle', event => {if(event.target.open) $('screenshot').src=`/api/screenshot?${preview?'preview=1&':''}t=${Date.now()}`;});
setInterval(update, 2000); update();
