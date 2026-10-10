import {analyze, clean, point, recordCompletion} from './recognize.mjs';

export class Controller {
  constructor(settings, saved = null) {
    this.settings = settings;
    this.state = saved ?? {completed: 0, skipped: 0, inspected: 0, completedTitles: [], seen: {}, current: null};
    this.startedAt = Date.now();
    this.lastChange = Date.now();
    this.lastSignature = '';
    this.pending = null;
    this.scrollSignature = '';
    this.scrollStalls = 0;
    this.unknownSince = null;
    this.timerSeenAt = null;
    this.lastTime = null;
    this.lastAdvanced = null;
    this.hoverCount = 0;
    this.lastActionAt = 0;
    this.lastSignalAt = null;
    this.lastResumeAt = 0;
  }
  resetPlayback(now) {
    this.lastTime = null; this.lastAdvanced = now; this.timerSeenAt = now;
    this.lastSignalAt = now; this.lastResumeAt = 0;
    Object.assign(this.state, {videoTime: null, videoDuration: null, timeReadable: false, timeObservedAt: null, playbackState: 'unknown'});
    if (this.state.current) this.state.current.resumeAttempts = 0;
  }
  decide(snapshot, now = Date.now()) {
    const page = analyze(snapshot);
    const s = this.state;
    s.page = page.kind;
    s.updatedAt = now;
    const wait = (reason, delay = 3000) => ({type: 'wait', reason, delay, page});
    const stop = reason => ({type: 'stop', reason, page});
    const click = (line, reason) => ({type: 'click', point: point(snapshot, line), reason, delay: 1500, page});
    const goBack = reason => ({type: 'click', point: {x: Math.round(snapshot.renderer.width * .035), y: Math.round(snapshot.renderer.width * .034)}, reason, delay: 1300, page});
    const footer = text => page.lines.find(l => l.text === text && l.y > snapshot.height * .88);
    const catalog = reason => {
      const nav = footer('全部课程');
      if (!nav) return stop('没有识别到“全部课程”入口，请返回课程页面后重试。');
      s.current = null; this.pending = null; this.resetPlayback(now);
      this.scrollStalls = 0; this.scrollSignature = '';
      return click(nav, reason);
    };
    if (s.completed >= this.settings.maxCycles) return stop(`已新完成 ${s.completed} 门课程，达到最大循环次数。`);
    if (now - this.startedAt >= this.settings.maxMinutes * 60000) return stop('达到本次运行时长上限。');
    if (page.kind === 'blocked') return stop(page.reason);
    const scanCourse = () => {
      const c=s.current;
      for(const entry of page.entries??[])c.videos[entry.title]=entry.progress;
      const unfinished=(page.entries??[]).find(e=>e.progress<100&&e.open.y>20&&e.open.y<snapshot.renderer.height-100);
      if(unfinished){
        c.initialProgress=Math.min(c.initialProgress,unfinished.progress);c.progress=unfinished.progress;
        c.scanning=false;c.endSeen=false;c.started=true;c.playObserved=false;c.restored=false;
        this.resetPlayback(now);
        return {type:'click',point:unfinished.open,reason:`继续本课程未完成视频“${unfinished.title}”`,delay:800,page};
      }
      const signature=page.lines.map(l=>l.text).join('|');
      c.scanStalls=signature===c.scanSignature?(c.scanStalls??0)+1:0;c.scanSignature=signature;
      c.scanSteps=(c.scanSteps??0)+1;
      if(c.scanStalls>=2){
        if(Object.values(c.videos).some(progress=>progress<100))return stop('已记录的视频中仍有未完成项，本课程未计入完成次数。');
        const counted=recordCompletion(s,100);s.seen[c.title]='completed';
        if(counted&&s.completed>=this.settings.maxCycles)return stop(`已新完成 ${s.completed} 门课程，达到最大循环次数。`);
        if(!counted)s.skipped++;
        return catalog(counted?`“${c.title}”的所有视频均已完成，继续下一门`:`“${c.title}”已完成，跳过且不计入循环次数`);
      }
      if(c.scanSteps>30)return stop('课程内容超过本轮核验范围，未计入完成次数。');
      return {type:'scroll',point:{x:Math.round(snapshot.renderer.width*.85),y:Math.round(snapshot.renderer.height*.65)},delta:-480,reason:'核对本课程其余视频，避免把部分完成计为整课完成',delay:1200,page};
    };
    if(s.current?.scanning){
      if(['catalog','records','player','detail'].includes(page.kind))return stop('课程完成核验期间页面发生切换，已停止。');
      if(page.kind==='overview'||(page.kind==='unknown'&&footer('全部课程')&&footer('学习记录')))return scanCourse();
    }
    if (page.kind === 'unknown' || page.kind === 'loading') {
      this.unknownSince ??= now;
      if (now - this.unknownSince > 90000) return stop('页面连续 90 秒无法识别或加载未完成，已停止操作。');
      return wait(page.kind === 'loading' ? '等待课程页面加载' : '等待可识别的课程页面', 4000);
    }
    this.unknownSince = null;
    if (page.kind === 'overview') {
      if (!page.title || page.progress === null) {
        this.unreadableOverview ??= now;
        if (now - this.unreadableOverview > 45000) return stop('无法可靠读取课程名称或进度。');
        return click(page.refresh, '重新读取课程进度');
      }
      this.unreadableOverview = null;
      if (!s.current) {
        const key = this.pending?.key ?? page.title;
        s.current = {key, title: page.title, initialProgress: page.progress, progress: page.progress, started: false, counted: false, endSeen: false, refreshes: 0, replays: 0,videos:{}};
        this.resetPlayback(now);
        s.inspected++;
      } else if (clean(s.current.title) !== page.title && !Object.hasOwn(s.current.videos??{},page.title)) {
        return stop('当前课程与运行记录不一致，可能发生了手动切换；已停止。');
      }
      const c = s.current;
      c.videos??={};for(const entry of page.entries??[])c.videos[entry.title]=entry.progress;
      c.progress = page.progress;
      if (page.progress === 100) {
        c.scanning=true;c.scanSteps=0;c.scanStalls=0;c.scanSignature='';
        return scanCourse();
      }
      if (c.endSeen) {
        c.syncStarted ??= now;
        if (now - c.syncStarted < 90000) {
          if (!c.lastRefresh || now - c.lastRefresh > 15000) {
            c.lastRefresh = now;
            return click(page.refresh, `视频已结束，刷新并核验进度（${page.progress}%）`);
          }
          return wait(`等待进度同步（当前 ${page.progress}%）`, 5000);
        }
        if (c.replays >= 1) return stop(`“${c.title}”播放结束后仍为 ${page.progress}%，未计入完成次数，请核对平台记录。`);
        c.replays++; c.endSeen = false; c.syncStarted = null;
        c.playObserved = false; c.restored = false;
        this.resetPlayback(now);
      }
      if (!c.refreshed) {c.refreshed = true; return click(page.refresh, `核对“${c.title}”的当前进度`);}
      if (!page.open || page.open.y <= 0) return stop('无法定位课程视频入口。');
      c.started = true;
      c.awaitingPlayerSince ??= now;
      if (now - c.awaitingPlayerSince > 45000) return stop('课程视频入口点击后没有进入播放器。');
      this.lastTime = null; this.lastAdvanced = now; this.timerSeenAt = now;
      return {type: 'click', point: page.open, reason: `播放“${c.title}”（${page.progress}%）`, delay: 800, page};
    }
    if (page.kind === 'player') {
      if (!s.current) return goBack('先返回课程概览核对是否已完成');
      const c = s.current;
      c.awaitingPlayerSince = null;
      if (c.endSeen) return goBack('返回课程概览核验完成进度');
      s.timeReadable = !!page.timer;
      s.playbackState = page.glyph ?? 'unknown';
      if (page.duration) s.videoDuration = page.duration;
      if (page.timer) {
        s.videoTime = page.timer.current; s.videoDuration = page.timer.total; s.timeObservedAt = now;
      }
      if (page.bigPlay && !c.playObserved) {
        c.startAttempts = (c.startAttempts ?? 0) + 1;
        if (c.startAttempts > 3) return stop('初始播放按钮多次点击后仍未起播。');
        this.lastAdvanced = now; this.timerSeenAt = now;
        return {type: 'click', point: page.bigPlay, reason: '点击视频初始播放按钮', delay: 700, page};
      }
      if (page.restore && !c.restored && c.replays === 0) {
        const words = page.restore.words ?? [];
        const start = words.findIndex(w => clean(w.text).startsWith('恢'));
        c.restored = true;
        if (start >= 0) {
          const selected = words.slice(start);
          return click({x: selected[0].x, y: page.restore.y, width: selected.at(-1).x + selected.at(-1).width - selected[0].x, height: page.restore.height}, '从上次观看位置继续');
        }
      }
      if (!page.timer) {
        this.lastSignalAt ??= now;
        if (page.glyph === 'playing') {
          this.lastSignalAt = now; c.playObserved = true; c.resumeAttempts = 0;
          return wait('视频处于播放状态（时间暂不可读），继续检查观看提示和结束提示', 7000);
        }
        if (page.glyph === 'paused' && page.toggle) {
          this.lastSignalAt = now;
          if (s.videoDuration && s.videoTime >= s.videoDuration - 2) {
            if (now - this.lastAdvanced > 180000) return stop('视频停在结尾但未出现结束提示，请核对平台页面。');
            return wait('等待视频结束提示，完成后核验课程进度');
          }
          if (now - Math.max(this.lastAdvanced ?? now, this.lastResumeAt) >= 12000) {
            if ((c.resumeAttempts ?? 0) >= 3) return stop('已尝试恢复播放 3 次，视频仍处于暂停状态。');
            c.resumeAttempts = (c.resumeAttempts ?? 0) + 1; this.lastResumeAt = now;
            return {type: 'click', point: page.toggle, reason: '时间暂不可读，根据播放按钮恢复暂停的视频', delay: 1500, page};
          }
          return wait('已识别暂停状态，等待确认后恢复播放', 3000);
        }
        if (now - this.lastSignalAt > 90000) return stop('连续 90 秒既无法读取时间，也无法确认播放状态，已停止操作。');
        const hover = {...page.hover, x: page.hover.x + (++this.hoverCount % 2 ? 3 : -3)};
        return {type: 'hover', point: hover, reason: '显示播放器控件，读取时间或播放状态', delay: 500, page};
      }
      this.timerSeenAt = now;
      this.lastSignalAt = now;
      if (this.lastTime === null || page.timer.current > this.lastTime || page.timer.current < this.lastTime - 5) {
        this.lastTime = page.timer.current; this.lastAdvanced = now; c.resumeAttempts = 0;
        if (page.timer.current > 0) s.playbackState = 'playing';
        if (page.timer.current > 0) {c.startAttempts = 0; c.playObserved = true;}
      }
      if (page.glyph === 'paused' && now - Math.max(this.lastAdvanced, this.lastResumeAt) >= 12000 && page.timer.current < page.timer.total - 2) {
        if ((c.resumeAttempts ?? 0) >= 3) return stop('已尝试恢复播放 3 次，视频仍未推进。');
        c.resumeAttempts = (c.resumeAttempts ?? 0) + 1;
        this.lastResumeAt = now;
        return {type: 'click', point: page.toggle, reason: '恢复暂停的视频', delay: 1500, page};
      }
      if (now - this.lastAdvanced > 180000) return stop('视频连续 3 分钟没有推进，请检查网络或平台提示。');
      return wait(`正在播放“${c.title}”`, 7000);
    }
    if (['continue', 'next', 'last'].includes(page.kind)) {
      if (!s.current?.started) return stop('检测到播放提示，但没有已核对的课程记录，请返回课程概览。');
      this.lastTime = null; this.lastAdvanced = now; this.timerSeenAt = now;
      this.lastSignalAt = now;
      if (page.kind === 'last') s.current.endSeen = true;
      if (page.kind === 'next') {s.current.restored = false; s.current.playObserved = false; this.resetPlayback(now);}
      return click(page.button, {continue: '确认继续观看', next: '播放本课程下一集', last: '视频结束，准备核验课程进度'}[page.kind]);
    }
    if (page.kind === 'detail') return click(page.button, '进入所选课程');
    if (page.kind === 'records') return catalog('进入全部课程，查找尚未完成的课程');
    if (page.kind === 'catalog') {
      if (s.inspected >= 500) return stop('本次已检查 500 门课程，达到扫描上限。');
      const card = page.cards.find(c => !s.seen[c.key]);
      if (card) {
        this.pending = card; s.current = null;
        return click(card.line, `检查课程“${card.title}”`);
      }
      if (page.exhausted && page.cards.length) return stop('课程列表已扫描完，没有更多未完成课程。');
      const signature = page.cards.map(c => c.key).join('|');
      this.scrollStalls = signature === this.scrollSignature ? this.scrollStalls + 1 : 0;
      this.scrollSignature = signature;
      if (this.scrollStalls >= 5) return stop('课程列表滚动后没有新内容，本轮扫描结束。');
      return {type: 'scroll', point: {x: Math.round(snapshot.renderer.width * .8), y: Math.round(snapshot.renderer.height * .7)}, delta: -480, reason: '查找下一页课程，已完成项不计次数', delay: 1600, page};
    }
    return wait('等待课程页面');
  }
}
