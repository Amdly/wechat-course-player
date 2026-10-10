import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyze} from '../recognize.mjs';
import {Controller} from '../controller.mjs';
const fixture=async name=>JSON.parse((await readFile(new URL(`./${name}.json`,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
test('recognizes saved real WeChat course overview with Windows Chinese OCR',async()=>{
  const p=analyze(await fixture('overview'));assert.equal(p.kind,'overview');assert.equal(p.title,'玻璃何以改变世界');assert.equal(p.progress,10);
});
test('recognizes real two-column catalog without selecting people counts or subject labels',async()=>{
  const p=analyze(await fixture('catalog'));assert.equal(p.kind,'catalog');assert.ok(p.cards.length>=4);assert.match(p.cards[0].title,/功和内能/);assert.match(p.cards[1].title,/历史上的疫病/);assert.ok(p.cards.every(c=>!/人已学习|高中历史|高中物理/.test(c.title)));
});
test('recognizes real learning-record page and its course cards',async()=>{
  const p=analyze(await fixture('records'));assert.equal(p.kind,'records');assert.ok(p.cards.some(c=>c.title==='玻璃何以改变世界'));
});
test('isolated clock OCR recovers the timer missed on the actual failing slide',async()=>{
  const s=await fixture('player-clock');
  assert.equal(analyze({...s,playerControls:[]}).timer,null);
  const page=analyze(s);
  assert.equal(page.kind,'player');assert.equal(page.timer.current,98);assert.equal(page.timer.total,2551);
  assert.ok(page.toggle.y>0&&page.toggle.y<s.renderer.height);
});
test('advancing isolated clock keeps the loop running past the former 90-second failure',async()=>{
  const s=await fixture('player-clock'),now=Date.now();
  const c=new Controller({maxCycles:12,maxMinutes:720});
  c.state.current={title:'全球联系的初步建立与世界格局的演变',started:true,playObserved:true};
  for(let elapsed=0;elapsed<=140;elapsed+=10){
    const seconds=98+elapsed;
    const next={...s,playerControls:[{...s.playerControls[0],text:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} / 42:31`}]};
    assert.equal(c.decide(next,now+elapsed*1000).type,'wait');
    assert.equal(c.state.videoTime,seconds);assert.equal(c.state.completed,0);
  }
});
