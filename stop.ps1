$ErrorActionPreference='Stop'
$lastFile=Join-Path $PSScriptRoot 'runtime\last-run.json'
if(Test-Path -LiteralPath $lastFile){
    $last=Get-Content -LiteralPath $lastFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $runsRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime\runs'))+[IO.Path]::DirectorySeparatorChar
    $runPath=[IO.Path]::GetFullPath($last.runDir)
    if(-not $runPath.StartsWith($runsRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected run directory.'}
    [IO.File]::WriteAllText((Join-Path $runPath 'stop'),'stop')
}
