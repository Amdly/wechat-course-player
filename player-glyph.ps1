param([Parameter(Mandatory=$true)][string]$Image,[Parameter(Mandatory=$true)][double]$TitleY)
$ErrorActionPreference='Stop'
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot 'player-vision.cs')
[PlayerVision]::Read($Image,$TitleY) | ConvertTo-Json -Compress
