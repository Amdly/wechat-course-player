using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;

public static class WindowGuard {
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr h, int command);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    public static string Prepare(long handle) {
        var h = new IntPtr(handle);
        if (!IsWindow(h)) return "unavailable";
        bool minimized = IsIconic(h);
        if (minimized) {
            ShowWindowAsync(h, 9); // SW_RESTORE: request restoration, then wait for it.
            for (int i = 0; i < 15 && IsIconic(h); i++) Thread.Sleep(100);
        }
        if (!IsWindowVisible(h) || IsIconic(h)) return "unavailable";
        bool alreadyForeground = GetForegroundWindow() == h;
        if (!alreadyForeground) {
            SetForegroundWindow(h);
            if (GetForegroundWindow() != h) {
                keybd_event(0x12, 0, 0, UIntPtr.Zero);
                try { SetForegroundWindow(h); }
                finally { keybd_event(0x12, 0, 2, UIntPtr.Zero); }
            }
            Thread.Sleep(250);
        }
        if (GetForegroundWindow() != h) return "unavailable";
        if (minimized) { Thread.Sleep(350); return "restored"; }
        return alreadyForeground ? "ready" : "activated";
    }

    // A completely black/flat frame is not a course page, even if PrintWindow succeeded.
    public static bool IsBlank(Bitmap image) {
        int rMin=255, gMin=255, bMin=255, rMax=0, gMax=0, bMax=0;
        for (int y=0; y<image.Height; y+=Math.Max(1,image.Height/60)) {
            for (int x=0; x<image.Width; x+=Math.Max(1,image.Width/60)) {
                var p=image.GetPixel(x,y);
                rMin=Math.Min(rMin,p.R);gMin=Math.Min(gMin,p.G);bMin=Math.Min(bMin,p.B);
                rMax=Math.Max(rMax,p.R);gMax=Math.Max(gMax,p.G);bMax=Math.Max(bMax,p.B);
            }
        }
        return rMax-rMin<=5 && gMax-gMin<=5 && bMax-bMin<=5;
    }
}
