param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$request=Get-Content -LiteralPath $RequestFile -Raw -Encoding UTF8 | ConvertFrom-Json
function Stop-Native([string]$Code,[string]$Message){
    [pscustomobject]@{error=@{code=$Code;message=$Message}} | ConvertTo-Json -Compress
    exit 2
}
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CourseDesktop {
 public delegate bool Callback(IntPtr h,IntPtr p);
 public struct Rect {public int Left,Top,Right,Bottom;}
 public class Window {public long handle;public uint pid;public string kind;public int x,y,width,height;public bool visible,minimized;}
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h,Callback cb,IntPtr p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,int data,UIntPtr extra);
 public static Window Get(IntPtr h){uint pid;GetWindowThreadProcessId(h,out pid);Rect r;GetWindowRect(h,out r);var b=new StringBuilder(256);GetClassName(h,b,b.Capacity);return new Window{handle=h.ToInt64(),pid=pid,kind=b.ToString(),x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,visible=IsWindowVisible(h),minimized=IsIconic(h)};}
 public static Window[] List(long parent,bool includeHidden=false){var windows=new List<Window>();Callback cb=(h,p)=>{if(includeHidden||IsWindowVisible(h))windows.Add(Get(h));return true;};if(parent==0)EnumWindows(cb,IntPtr.Zero);else EnumChildWindows(new IntPtr(parent),cb,IntPtr.Zero);return windows.ToArray();}
 public static void Send(long handle,uint message,long w,int x,int y){long point=((long)(ushort)y<<16)+(ushort)x;if(!PostMessage(new IntPtr(handle),message,new IntPtr(w),new IntPtr(point)))throw new Exception("Window message failed.");}
 public static int[] FindPlay(string file,int cx,int cy,int radius,double scale){
  using(var b=new System.Drawing.Bitmap(file)){
   int left=Math.Max(0,cx-radius),top=Math.Max(0,cy-radius),w=Math.Min(radius*2,b.Width-left),h=Math.Min(radius*2,b.Height-top);
   var mask=new bool[w*h];var seen=new bool[w*h];
   for(int y=0;y<h;y++)for(int x=0;x<w;x++){var c=b.GetPixel(left+x,top+y);mask[y*w+x]=c.R>=246&&c.G>=246&&c.B>=246;}
   for(int i=0;i<mask.Length;i++)if(mask[i]&&!seen[i]){
    var queue=new Queue<int>();var component=new List<int>();queue.Enqueue(i);seen[i]=true;
    int xmin=w,xmax=0,ymin=h,ymax=0;
    while(queue.Count>0){int p=queue.Dequeue(),x=p%w,y=p/w;component.Add(p);xmin=Math.Min(xmin,x);xmax=Math.Max(xmax,x);ymin=Math.Min(ymin,y);ymax=Math.Max(ymax,y);
     foreach(int n in new[]{x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1})if(n>=0&&!seen[n]&&mask[n]){seen[n]=true;queue.Enqueue(n);}}
    int cw=xmax-xmin+1,ch=ymax-ymin+1;
    if(cw<18*scale||cw>65*scale||ch<25*scale||ch>75*scale||xmin==0||ymin==0||xmax==w-1||ymax==h-1)continue;
    double fill=(double)component.Count/(cw*ch);if(fill<.34||fill>.72)continue;
    int mid=0,upper=0,lower=0;
    foreach(int p in component){int y=p/w-ymin;if(y==ch/2)mid++;if(y==ch/4)upper++;if(y==ch*3/4)lower++;}
    if(mid>cw*.75&&upper<mid*.88&&lower<mid*.88&&upper>mid*.25&&lower>mid*.25)return new[]{left+(xmin+xmax)/2,top+(ymin+ymax)/2};
   }
  }return new int[0];
 }
}
'@
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot 'window-guard.cs')
[void][CourseDesktop]::SetProcessDpiAwarenessContext([IntPtr](-4))
$wxPids=@(Get-Process -Name Weixin,WeChat -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$webPids=@(Get-Process -Name WeChatAppEx -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$windowAction='ready'
# Restore the previously verified root before enumerating its rendering children.
if($request.root){
    $knownRoot=[CourseDesktop]::Get([IntPtr]$request.root)
    if($knownRoot.pid -eq $request.rootPid -and ($knownRoot.pid -in $wxPids -or $knownRoot.pid -in $webPids)){
        $windowAction=[WindowGuard]::Prepare($request.root)
        if($windowAction -eq 'unavailable'){Stop-Native 'WINDOW_UNAVAILABLE' 'The course window cannot currently be restored or activated.'}
    }
}
$roots=@([CourseDesktop]::List(0) | Where-Object {$_.pid -in $wxPids -or $_.pid -in $webPids})
$candidates=New-Object System.Collections.Generic.List[object]
foreach($root in $roots){
    $children=@([CourseDesktop]::List($root.handle,$root.minimized))
    $browsers=@($children | Where-Object {$_.kind -eq 'Chrome_WidgetWin_0' -and $_.pid -in $webPids -and ($root.minimized -or ($_.width -ge 450 -and $_.height -ge 450))})
    if($root.kind -eq 'Chrome_WidgetWin_0' -and $root.pid -in $webPids){$browsers+=@($root)}
    foreach($browser in $browsers){
        $renderers=@([CourseDesktop]::List($browser.handle,$root.minimized) | Where-Object {$_.kind -eq 'Chrome_RenderWidgetHostHWND' -and ($root.minimized -or ($_.width -ge 450 -and $_.height -ge 450))})
        foreach($renderer in $renderers){$candidates.Add([pscustomobject]@{browser=$browser;renderer=$renderer;root=$root.handle})}
    }
}
$candidates=@($candidates | Sort-Object {$_.renderer.handle} -Unique)
if($request.browser){$candidates=@($candidates | Where-Object {$_.browser.handle -eq $request.browser})}
if($request.renderer){
    $matching=@($candidates | Where-Object {$_.renderer.handle -eq $request.renderer})
    # A renderer may be recreated during navigation; only rebind within the same browser on a fresh screenshot.
    if($matching.Count -gt 0 -or $request.action -ne 'snapshot' -or -not $request.browser){$candidates=$matching}
}
if($candidates.Count -eq 0){Stop-Native 'WINDOW_UNAVAILABLE' 'No accessible WeChat course window was found.'}
if($candidates.Count -ne 1){Stop-Native 'WINDOW_AMBIGUOUS' 'More than one WeChat webpage matches. Keep only the course page open.'}
$target=$candidates[0]
$prepared=[WindowGuard]::Prepare($target.root)
if($prepared -eq 'unavailable'){Stop-Native 'WINDOW_UNAVAILABLE' 'Could not restore or activate the course window.'}
if($prepared -ne 'ready'){$windowAction=$prepared}
$target.browser=[CourseDesktop]::Get([IntPtr]$target.browser.handle)
$target.renderer=[CourseDesktop]::Get([IntPtr]$target.renderer.handle)
if($target.renderer.width -lt 450 -or $target.renderer.height -lt 450){Stop-Native 'WINDOW_UNAVAILABLE' 'The restored webpage has not finished laying out.'}
$fingerprint="$($target.browser.handle):$($target.renderer.handle):$($target.browser.x):$($target.browser.y):$($target.browser.width):$($target.browser.height):$($target.renderer.x):$($target.renderer.y):$($target.renderer.width):$($target.renderer.height)"
if($request.action -ne 'snapshot'){
    if($request.fingerprint -ne $fingerprint){throw 'Window geometry changed since recognition; input cancelled.'}
    $age=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[double]$request.capturedAt
    if($age -lt 0 -or $age -gt 15000){throw 'Recognition is stale; input cancelled.'}
    $x=[int]$request.x; $y=[int]$request.y
    if($x -lt 2 -or $y -lt 2 -or $x -ge $target.renderer.width-2 -or $y -ge $target.renderer.height-2){throw 'Input point is outside the webpage.'}
    $rootHandle=[CourseDesktop]::GetAncestor([IntPtr]$target.renderer.handle,2)
    if([CourseDesktop]::GetForegroundWindow() -ne $rootHandle){
        [void][CourseDesktop]::SetForegroundWindow($rootHandle)
        if([CourseDesktop]::GetForegroundWindow() -ne $rootHandle){
            [CourseDesktop]::keybd_event(0x12,0,0,[UIntPtr]::Zero)
            try {[void][CourseDesktop]::SetForegroundWindow($rootHandle)}
            finally {[CourseDesktop]::keybd_event(0x12,0,2,[UIntPtr]::Zero)}
        }
        Start-Sleep -Milliseconds 200
    }
    if([CourseDesktop]::GetForegroundWindow() -ne $rootHandle){throw 'Could not activate WeChat. Click its window and restart; no mouse input was sent.'}
    if($request.action -eq 'hover'){
        # Repeated hovering at identical coordinates must still trigger mousemove.
        [void][CourseDesktop]::SetCursorPos(([Math]::Min($x+5,$target.renderer.width-3)+$target.renderer.x),($y+$target.renderer.y))
        Start-Sleep -Milliseconds 60
    }
    [void][CourseDesktop]::SetCursorPos(($x+$target.renderer.x),($y+$target.renderer.y))
    Start-Sleep -Milliseconds 100
    switch($request.action){
        'click' {
            [CourseDesktop]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
            [CourseDesktop]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        }
        'hover' {}
        'scroll' {
            $delta=[int]$request.delta
            if([Math]::Abs($delta) -gt 720){throw 'Scroll step exceeds limit.'}
            [CourseDesktop]::mouse_event(0x800,0,0,$delta,[UIntPtr]::Zero)
        }
        default {throw 'Unknown input action.'}
    }
    [pscustomobject]@{ok=$true;action=$request.action} | ConvertTo-Json -Compress
    exit
}
$bitmap=New-Object System.Drawing.Bitmap $target.browser.width,$target.browser.height
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$dc=$graphics.GetHdc()
try {$success=[CourseDesktop]::PrintWindow([IntPtr]$target.browser.handle,$dc,2)}finally{$graphics.ReleaseHdc($dc)}
try {
    $blank=[WindowGuard]::IsBlank($bitmap)
    if(-not $success -or $blank){
        $bitmap.Save((Join-Path ([IO.Path]::GetDirectoryName($request.image)) 'capture-failure.png'),[System.Drawing.Imaging.ImageFormat]::Png)
    }else{
    $bitmap.Save($request.image,[System.Drawing.Imaging.ImageFormat]::Png)
    }
}finally{$graphics.Dispose();$bitmap.Dispose()}
if(-not $success -or $blank){Stop-Native 'CAPTURE_BLANK' 'The window returned an empty or black capture; no page input was sent.'}
$ocr=& (Join-Path $PSScriptRoot 'ocr.ps1') -Image $request.image | ConvertFrom-Json
$offsetX=$target.renderer.x-$target.browser.x
$offsetY=$target.renderer.y-$target.browser.y
$lines=@($ocr.lines | Where-Object {$_.y -ge $offsetY -and $_.y -lt $offsetY+$target.renderer.height})
# Recognize the control independently of the clock OCR.
$glyph='unknown'
$controlToggle=$null
$bigPlay=$null
$playerControls=@()
$controlOcrError=$null
$teacherLine=$lines | Where-Object {($_.text -replace '\s','') -eq ([string][char]0x6559+[char]0x5e08+[char]0x7b80+[char]0x4ecb)} | Select-Object -First 1
if($teacherLine){
    $titleLine=$lines | Where-Object {$_.y -lt $teacherLine.y -and $_.y -gt $teacherLine.y-$ocr.width*.25 -and $_.height -gt $ocr.width*.02} | Select-Object -Last 1
    if($titleLine){
        $control=& (Join-Path $PSScriptRoot 'player-glyph.ps1') -Image $request.image -TitleY $titleLine.y | ConvertFrom-Json
        $glyph=$control.glyph
        if($glyph -ne 'unknown'){$controlToggle=@{x=[int]($control.x-$offsetX);y=[int]($control.y-$offsetY)}}
        try {
            $controls=& (Join-Path $PSScriptRoot 'player-controls.ps1') -Image $request.image -TitleY $titleLine.y | ConvertFrom-Json
            $playerControls=@($controls.lines)
        }catch{$controlOcrError=$_.Exception.Message}
        $videoCenterY=[int](($titleLine.y-$ocr.width*.05+$offsetY+$ocr.width*.062)/2)
        $triangle=[CourseDesktop]::FindPlay($request.image,[int]($ocr.width/2),$videoCenterY,[int]($ocr.width*.075),$ocr.width/1450.0)
        if($triangle.Length -eq 2){$bigPlay=@{x=$triangle[0]-$offsetX;y=$triangle[1]-$offsetY}}
    }
}
[pscustomobject]@{capturedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();fingerprint=$fingerprint;browser=$target.browser;renderer=$target.renderer;root=$target.root;rootPid=([CourseDesktop]::Get([IntPtr]$target.root)).pid;windowAction=$windowAction;offsetX=$offsetX;offsetY=$offsetY;width=$ocr.width;height=$ocr.height;lines=$lines;playerControls=$playerControls;controlOcrError=$controlOcrError;glyph=$glyph;controlToggle=$controlToggle;bigPlay=$bigPlay;image=$request.image} | ConvertTo-Json -Depth 8 -Compress
