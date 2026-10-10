$ErrorActionPreference='Stop'
$runtime=Join-Path $PSScriptRoot 'runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$serverFile=Join-Path $runtime 'server.json'
$running=$false
if(Test-Path -LiteralPath $serverFile){
    try {$server=Get-Content -LiteralPath $serverFile -Raw -Encoding UTF8 | ConvertFrom-Json; $health=Invoke-RestMethod -Uri ($server.url+'/api/health') -TimeoutSec 2; $running=$health.app -eq 'wechat-course-player'}catch{}
}
if(-not $running){
    $node=Get-Command node.exe -ErrorAction Stop
    $serverScript=Join-Path $PSScriptRoot 'server.mjs'
    Start-Process -FilePath $node.Source -ArgumentList ('"'+$serverScript+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'server.stdout.log') -RedirectStandardError (Join-Path $runtime 'server.stderr.log')
    for($attempt=0;$attempt -lt 30;$attempt++){
        Start-Sleep -Milliseconds 300
        try {$server=Get-Content -LiteralPath $serverFile -Raw -Encoding UTF8 | ConvertFrom-Json;$health=Invoke-RestMethod -Uri ($server.url+'/api/health') -TimeoutSec 1;if($health.app -eq 'wechat-course-player'){$running=$true;break}}catch{}
    }
}
if(-not $running){throw 'Could not start local service. See runtime/server.stderr.log.'}
Start-Process $server.url
