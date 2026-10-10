import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../controller.mjs';
import {analyze, recordCompletion, point} from '../recognize.mjs';
const line=(text,x,y,width=180,height=32)=>({text,x,y,width,height,words:[]});
const snapshot=(lines,extra={})=>({width:1450,height:1752,offsetX:0,offsetY:176,renderer:{handle:9,width:1450,height:1576},glyph:'unknown',lines,...extra});
const overview=(progress,title='玻璃何以改变世界')=>snapshot([
  line('开 始 学 习',680,210),line(title,500,330,450,50),line(title,90,1140,450,45),line('主讲：程晓波',90,1220),line('学习进度',90,1300),line(`${progress}％`,1310,1300,90),line('刷新学习进度',610,1400,280),line('全部课程',680,1720,90,20)
]);
const player=(time='1:50 / 30:37',glyph='playing')=>snapshot([
  line('开始学习',680,210),line(time,230,930,200,30),line('玻璃何以改变世界',40,1060,450,48),line('教师简介',40,1250,200,45)
],{glyph});
const ctrl=(maxCycles=3)=>new Controller({maxCycles,maxMinutes:480});
test('reads real-sized overview progress and converts browser pixels to webpage coordinates',()=>{
  const p=analyze(overview(10));assert.equal(p.kind,'overview');assert.equal(p.progress,10);assert.equal(p.title,'玻璃何以改变世界');
  assert.deepEqual(point(overview(10),p.refresh),{x:750,y:1240});assert.ok(p.open.y>176&&p.open.y<900);
});
const faintOverview = (progress=13) => snapshot([
  line('全球联系的初步建立与世界格局的演变（邹瑜）',151,176,1115,58),
  line('全球联系的初步建立与世界格局的演变',97,989,830,47),
  line('主 讲 ： 邹 瑜',97,1078,186,36),line(`${progress} ％`,1315,1151,76,31),
  line('0 刷 新 学 习 进 度',611,1249,266,35),line('课程简介',112,1507,136,33),
  line('全部课程',685,1718,80,20),line('学习记录',1169,1719,79,18)
]);
test('restored overview remains usable when OCR misses the pale progress label and page header',()=>{
  const s=faintOverview(),p=analyze(s),c=ctrl();
  assert.equal(p.kind,'overview');assert.equal(p.progress,13);
  assert.equal(p.title,'全球联系的初步建立与世界格局的演变');assert.equal(p.entries.length,1);
  assert.match(c.decide(s).reason,/核对/);assert.match(c.decide(s).reason,/播放/);
  assert.equal(c.state.current.initialProgress,13);assert.equal(c.state.completed,0);
  const completed=ctrl();completed.decide(faintOverview(100));completed.decide(faintOverview(100));
  assert.match(completed.decide(faintOverview(100)).reason,/跳过/);assert.equal(completed.state.completed,0);
});
test('an unrelated percentage on the video cannot replace missing course progress',()=>{
  const s=faintOverview();s.lines=s.lines.filter(l=>!l.text.includes('％'));
  s.lines.push(line('100%',1315,700,76,31));
  assert.equal(analyze(s).kind,'unknown');assert.equal(ctrl().decide(s).type,'wait');
});
test('a previously completed course is skipped and consumes zero cycles',()=>{
  const c=ctrl();c.decide(overview(100));c.decide(overview(100));const d=c.decide(overview(100));assert.equal(c.state.completed,0);assert.equal(c.state.skipped,1);assert.equal(d.type,'click');assert.match(d.reason,/跳过/);
});
test('a partial course counts exactly once after playback and verified 100%',()=>{
  const c=ctrl(1);c.decide(overview(10));c.decide(overview(10));assert.equal(c.state.current.started,true);
  c.decide(overview(100));c.decide(overview(100));const d=c.decide(overview(100));assert.equal(c.state.completed,1);assert.equal(d.type,'stop');
  c.decide(overview(100));assert.equal(c.state.completed,1);
});
test('a last-video dialog never counts as completed until overview confirms it',()=>{
  const c=ctrl();c.decide(overview(20));c.decide(overview(20));
  const dialog=player();dialog.lines.push(line('最后一个视频播完啦~',480,740,450),line('确定',550,950,100));
  const d=c.decide(dialog);assert.equal(d.type,'click');assert.equal(c.state.completed,0);assert.equal(c.state.current.endSeen,true);
  const syncing=c.decide(overview(98));assert.equal(c.state.completed,0);assert.match(syncing.reason,/核验|刷新/);
});
test('100% without previously starting an unfinished course cannot consume a cycle',()=>{
  const state={completed:0,completedTitles:[],seen:{},current:{key:'x',title:'x',initialProgress:20,started:false}};
  assert.equal(recordCompletion(state,100),false);assert.equal(state.completed,0);
});
test('a slide mentioning continue is insufficient without course header and dialog button',()=>{
  assert.equal(analyze(snapshot([line('请点击下方确认按钮继续观看！',400,650),line('确认',650,800)])).kind,'unknown');
  const p=player();p.lines.push(line('请点击下方确认按钮继续观看！',430,700,550),line('确认',650,850,100));assert.equal(analyze(p).kind,'continue');
});
test('playing and advancing never toggles pause, a stable pause can resume',()=>{
  const c=ctrl(),now=Date.now();c.decide(overview(10),now);c.decide(overview(10),now+1000);
  assert.equal(c.decide(player('1:50/30:37'),now+2000).type,'wait');
  assert.equal(c.decide(player('2:00/30:37'),now+12000).type,'wait');
  assert.equal(c.decide(player('2:00/30:37','paused'),now+26000).type,'click');
});
test('course switches are stopped before progress can be assigned to another course',()=>{
  const c=ctrl();c.decide(overview(10));assert.equal(c.decide(overview(100,'另外一门课')).type,'stop');assert.equal(c.state.completed,0);
});
test('catalog recognizes title next to enrollment count and ignores completed entries',()=>{
  const s=snapshot([line('全部课程',680,210),line('已完成课',40,650,300),line('1234人已学习',50,700,280),line('新课程',750,650,280),line('12人已学习',750,700,260)]);
  const c=ctrl();c.state.seen['已完成课']='completed';const d=c.decide(s);assert.match(d.reason,/新课程/);assert.equal(c.state.completed,0);
});
test('stale unrelated pages are never clicked and eventually stop',()=>{
  const c=ctrl(),now=Date.now(),s=snapshot([line('微信聊天',10,100)]);
  assert.equal(c.decide(s,now).type,'wait');assert.equal(c.decide(s,now+91000).type,'stop');
});
test('starting on a player goes back to verify completion before playing',()=>{assert.match(ctrl().decide(player()).reason,/核对/);});
test('a completed first video cannot hide an unfinished later video',()=>{
  const c=ctrl();assert.equal(c.decide(overview(100)).type,'scroll');
  const later=overview(35,'第二集');const d=c.decide(later);assert.equal(d.type,'click');assert.match(d.reason,/第二集/);assert.equal(c.state.completed,0);assert.equal(c.state.skipped,0);assert.equal(c.state.current.initialProgress,35);
});
test('a triangle recorded inside an advancing lecture is not clicked as a play button',()=>{
  const c=ctrl(),now=Date.now();c.decide(overview(10),now);c.decide(overview(10),now+1000);c.decide(player('1:50/30:37'),now+2000);
  const p=player('2:00/30:37');p.bigPlay={x:700,y:400};assert.equal(c.decide(p,now+12000).type,'wait');
});
const blindPlayer=(glyph='playing')=>({...player('',glyph),controlToggle:glyph==='unknown'?null:{x:49,y:770}});
const started=(now=Date.now(),settings={maxCycles:3,maxMinutes:480})=>{
  const c=new Controller(settings);c.decide(overview(10),now);c.decide(overview(10),now+1000);c.decide(player(),now+2000);return c;
};
test('visible playing control permits missing clock for the whole video without counting completion',()=>{
  const now=Date.now(),c=started(now);
  for(let elapsed=10000;elapsed<=2400000;elapsed+=10000){
    const d=c.decide(blindPlayer(),now+elapsed);assert.equal(d.type,'wait');assert.match(d.reason,/播放状态/);
  }
  assert.equal(c.state.videoDuration,1837);assert.equal(c.state.videoTime,110);assert.equal(c.state.timeReadable,false);assert.equal(c.state.completed,0);
});
test('missing clock with hidden controls can recover, but losing both signals for 90 seconds stops',()=>{
  const now=Date.now(),c=started(now);
  assert.equal(c.decide(blindPlayer('unknown'),now+15000).type,'hover');
  assert.equal(c.decide(blindPlayer(),now+80000).type,'wait');
  assert.equal(c.decide(blindPlayer('unknown'),now+160000).type,'hover');
  assert.equal(c.decide(blindPlayer('unknown'),now+171000).type,'stop');
});
test('paused control can resume without reading the clock and retries are bounded',()=>{
  const now=Date.now(),c=started(now),p=blindPlayer('paused');
  for(const elapsed of [15000,30000,45000])assert.equal(c.decide(p,now+elapsed).type,'click');
  assert.equal(c.decide(p,now+60000).type,'stop');assert.equal(c.state.completed,0);
});
test('continue and final dialogs still take precedence while the clock is unreadable',()=>{
  const now=Date.now(),c=started(now);
  c.decide(blindPlayer(),now+100000);
  const resume=blindPlayer();resume.lines.push(line('请点击下方确认按钮继续观看！',430,700,550),line('确认',650,850,100));
  assert.match(c.decide(resume,now+120000).reason,/确认继续/);
  const end=blindPlayer();end.lines.push(line('最后一个视频播完啦~',480,740,450),line('确定',550,950,100));
  assert.match(c.decide(end,now+2000000).reason,/核验/);assert.equal(c.state.completed,0);assert.equal(c.state.current.endSeen,true);
});
test('a new episode clears the previous time and cached duration',()=>{
  const now=Date.now(),c=started(now),next=blindPlayer();
  next.lines.push(line('本视频播完啦~',480,740,450),line('下一集',550,950,100));
  assert.match(c.decide(next,now+100000).reason,/下一集/);
  assert.equal(c.state.videoDuration,null);assert.equal(c.state.videoTime,null);
});
test('an actually readable clock that stops advancing is still detected',()=>{
  const now=Date.now(),c=started(now);
  assert.equal(c.decide(player(),now+183000).type,'stop');
});
test('playback-state fallback still respects the run time limit',()=>{
  const now=Date.now(),c=started(now,{maxCycles:3,maxMinutes:2});
  assert.match(c.decide(blindPlayer(),now+121000).reason,/时长上限/);
});
test('total duration alone is usable when current time OCR is unreadable',()=>{
  const p=blindPlayer();p.playerControls=[line('??? / 42:31',230,930,200,30)];
  const a=analyze(p);assert.equal(a.timer,null);assert.equal(a.duration,2551);assert.deepEqual(a.toggle,{x:49,y:770});
});
