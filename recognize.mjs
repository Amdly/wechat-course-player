export const clean = text => String(text ?? '').normalize('NFKC').replace(/\s+/g, '');
const center = line => ({x: line.x + line.width / 2, y: line.y + line.height / 2});
export function point(snapshot, line) {
  const p = center(line);
  return {x: Math.round(p.x - snapshot.offsetX), y: Math.round(p.y - snapshot.offsetY)};
}
export function analyze(s) {
  const lines = (s.lines ?? []).map(l => ({...l, text: clean(l.text)})).sort((a,b)=>a.y-b.y||a.x-b.x);
  const find = text => lines.find(l => l.text.includes(text));
  const exact = text => lines.find(l => l.text === text);
  const text = lines.map(l => l.text).join('\n');
  const top = lines.filter(l => l.y < s.offsetY + s.renderer.height * .11).map(l => l.text).join('');
  const learning = top.includes('开始学习');
  const base = {kind: 'unknown', lines, text, title: '', progress: null};
  const central = l => l && l.x + l.width / 2 > s.width * .2 && l.x + l.width / 2 < s.width * .8;
  const button = label => lines.find(l => l.text === label && central(l));
  if (/登录已失效|登录过期|重新登录|请先登录|请在微信|支付|购买课程|验证码|人脸识别/.test(text)) return {...base, kind: 'blocked', reason: '页面要求登录、验证或付款，请手动处理。'};
  if (learning && find('请点击下方确认按钮继续观看') && button('确认')) return {...base, kind: 'continue', button: button('确认')};
  if (learning && find('最后一个视频播完') && button('确定')) return {...base, kind: 'last', button: button('确定')};
  if (learning && find('视频播完') && button('下一集')) return {...base, kind: 'next', button: button('下一集')};
  if (/本学年已获得12学时|不计算有效时长|不算学时/.test(text)) return {...base, kind: 'blocked', reason: '平台提示已达到本学年有效学时上限。'};
  if (find('正在加载中')) return {...base, kind: 'loading'};
  const refresh = find('刷新学习进度');
  const progressRows = lines.filter(l => l.text.startsWith('学习进度'));
  // The pale progress label can disappear from OCR. A right-aligned percentage
  // directly above its refresh button is still readable evidence of progress.
  if (refresh) for (const percent of lines.filter(l => /^(100|\d{1,2})%$/.test(l.text) && l.x > s.width * .7)) {
    const nearbyRefresh = lines.some(l => l.text.includes('刷新学习进度') && l.y > percent.y && l.y - percent.y < s.width * .13);
    if (nearbyRefresh && !progressRows.some(l => Math.abs(l.y - percent.y) < Math.max(40, l.height * 1.7))) progressRows.push(percent);
  }
  progressRows.sort((a,b)=>a.y-b.y);
  if (refresh && progressRows.length && (learning || find('主讲:'))) {
    const entries=[];
    for(const progressLine of progressRows){
      const percent=lines.filter(l=>Math.abs(l.y-progressLine.y)<Math.max(40,progressLine.height*1.7)).map(l=>l.text.match(/(?:^|[^\d])(100|\d{1,2})%/)).find(Boolean);
      const lecturer=lines.filter(l=>l.text.includes('主讲:')&&l.y<progressLine.y&&l.y>progressLine.y-s.width*.13).at(-1);
      const titleLine=lecturer?lines.filter(l=>l.y<lecturer.y&&l.y>lecturer.y-s.width*.15&&l.height>s.width*.015).at(-1):null;
      if(titleLine&&percent)entries.push({title:titleLine.text,titleLine,progress:Number(percent[1]),open:{x:Math.round(s.width/2-s.offsetX),y:Math.round(titleLine.y-s.width*.21-s.offsetY)}});
    }
    const chosen=entries.find(e=>e.progress<100)??entries[0];
    return {...base,kind:'overview',entries,title:entries[0]?.title??'',titleLine:chosen?.titleLine,refresh,progress:chosen?.progress??null,open:chosen?.open??null};
  }
  const teacher = find('教师简介');
  if (learning && teacher) {
    const titleLine = lines.filter(l => l.y < teacher.y && l.y > teacher.y - s.width * .25 && l.height > s.width * .02).at(-1);
    let timer = null, duration = null;
    // Prefer the isolated clock OCR: slide captions can merge with the full-page clock.
    const clockLines = [...lines, ...(s.playerControls ?? []).map(l => ({...l, text: clean(l.text)}))];
    for (const l of clockLines) {
      if (titleLine && (l.y < titleLine.y - s.width*.14 || l.y > titleLine.y - s.width*.03)) continue;
      const totalOnly=l.text.match(/[/／]((?:\d{1,2}:)?\d{1,3}:\d{2})$/);
      if (totalOnly && totalOnly[1].split(':').slice(1).every(v=>Number(v)<60)) {
        const seconds=totalOnly[1].split(':').reduce((sum,v)=>sum*60+Number(v),0);
        if(seconds>=60)duration=seconds;
      }
      const m = l.text.match(/((?:\d{1,2}:)?\d{1,3}:\d{2})[/／]((?:\d{1,2}:)?\d{1,3}:\d{2})/);
      if (!m || (titleLine && l.y > titleLine.y)) continue;
      if ([m[1], m[2]].some(t => t.split(':').slice(1).some(v => Number(v) >= 60))) continue;
      const seconds = t => t.split(':').reduce((sum, v) => sum * 60 + Number(v), 0);
      const current = seconds(m[1]), total = seconds(m[2]);
      if (total >= 60 && current <= total) timer = {current, total, line: l};
    }
    return {...base, kind: 'player', title: titleLine?.text ?? '', titleLine, timer, duration: timer?.total ?? duration, glyph: s.glyph, bigPlay: s.bigPlay,
      restore: find('恢复播放'),
      hover: {x: Math.round(s.width * .5 - s.offsetX), y: Math.round((titleLine?.y ?? s.height * .6) - s.width * .09 - s.offsetY)},
      toggle: s.controlToggle ?? (timer ? {x: Math.round(s.width * .034 - s.offsetX), y: Math.round(timer.line.y + timer.line.height / 2 - s.offsetY)} : null)};
  }
  if (top.includes('全部课程') || top.includes('学习记录')) {
    const cards = [];
    const counts = lines.filter(l => /人已学习/.test(l.text) || (/\d+人$/.test(l.text) && lines.some(other => other.text === '已学习' && Math.abs(other.y-l.y) < l.height && other.x > l.x && other.x-l.x < s.width*.2)));
    for (const count of counts) {
      const candidates = lines.filter(l => l.y < count.y && l.y > count.y - s.width * .14 &&
        Math.abs(l.x - count.x) < s.width * .15 && l.height >= s.width * .015 &&
        !/^(其他|学段学科|全部|首页)$/.test(l.text));
      const title = candidates.sort((a,b) => a.y-b.y).at(-1);
      if (!title) continue;
      cards.push({title: title.text, key: title.text, line: title});
    }
    cards.sort((a,b) => a.line.y-b.line.y || a.line.x-b.line.x);
    return {...base, kind: top.includes('全部课程') ? 'catalog' : 'records', cards,
      exhausted: !!find('已加载所有数据') && !find('正在加载'), catalogButton: exact('全部课程')};
  }
  if (top.includes('课程详情') && exact('开始学习')) return {...base, kind: 'detail', button: exact('开始学习')};
  return base;
}

// A course is counted only after an observed unfinished -> 100% transition.
export function recordCompletion(state, progress) {
  const c = state.current;
  if (!c || progress !== 100) return false;
  state.seen[c.key] = 'completed';
  if (c.initialProgress !== null && c.initialProgress < 100 && c.started && !c.counted) {
    c.counted = true;
    state.completed += 1;
    state.completedTitles.push(c.title);
    return true;
  }
  return false;
}
