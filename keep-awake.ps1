param([Parameter(Mandatory=$true)][int]$OwnerId,[Parameter(Mandatory=$true)][string]$StopFile)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
public static class CoursePower {
 [DllImport("kernel32.dll")] private static extern uint SetThreadExecutionState(uint flags);
 public static void Hold(int ownerId,string stopFile){
  // Keep request and release on the same native thread. No power plan is changed.
  using(var owner=Process.GetProcessById(ownerId)){
   if(SetThreadExecutionState(0x80000003)==0)throw new Exception("Could not keep display and system awake.");
   try {
    Console.WriteLine("READY");Console.Out.Flush();
    while(!owner.HasExited&&!File.Exists(stopFile))Thread.Sleep(500);
   } finally {SetThreadExecutionState(0x80000000);}
  }
 }
}
'@
[CoursePower]::Hold($OwnerId,$StopFile)
