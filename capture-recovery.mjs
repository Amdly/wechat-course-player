export class CaptureRecovery {
  constructor(limit=120000) {this.limit=limit;this.since=null;}
  failed(error,now=Date.now()) {
    if(!['WINDOW_UNAVAILABLE','CAPTURE_BLANK'].includes(error.code))throw error;
    this.since??=now;
    if(now-this.since>=this.limit)return {type:'stop',reason:'等待课程窗口或画面恢复超过 2 分钟，已保存记录并停止。请恢复课程窗口后重新开始。'};
    return {type:'wait',reason:`${error.message} 恢复后自动继续，最多等待 2 分钟。`,delay:2500};
  }
  recovered() {const pending=this.since!==null;this.since=null;return pending;}
}
