param([Parameter(Mandatory=$true)][string]$Image,[Parameter(Mandatory=$true)][double]$TitleY)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$source=[System.Drawing.Bitmap]::FromFile($Image)
$cropFile=Join-Path ([IO.Path]::GetDirectoryName($Image)) 'player-controls.png'
try {
    # Isolate the clock from nearby slide text before running OCR.
    $left=[int][Math]::Floor($source.Width*.148)
    $top=[int][Math]::Floor($TitleY-$source.Width*.09)
    $right=[int][Math]::Ceiling($source.Width*.38)
    $bottom=[int][Math]::Ceiling($TitleY-$source.Width*.052)
    $top=[Math]::Max(0,$top);$bottom=[Math]::Min($source.Height,$bottom)
    if($bottom -le $top){throw 'Player controls are outside the image.'}
    $rect=New-Object System.Drawing.Rectangle $left,$top,($right-$left),($bottom-$top)
    $scale=2;$pad=24
    $crop=New-Object System.Drawing.Bitmap (($right-$left)*$scale+$pad*2),(($bottom-$top)*$scale+$pad*2)
    $graphics=[System.Drawing.Graphics]::FromImage($crop)
    try {
        $graphics.Clear([System.Drawing.Color]::Black)
        $dest=New-Object System.Drawing.Rectangle $pad,$pad,(($right-$left)*$scale),(($bottom-$top)*$scale)
        $graphics.DrawImage($source,$dest,$rect,[System.Drawing.GraphicsUnit]::Pixel)
        $crop.Save($cropFile,[System.Drawing.Imaging.ImageFormat]::Png)
    }finally{$graphics.Dispose();$crop.Dispose()}
}finally{$source.Dispose()}
$result=& (Join-Path $PSScriptRoot 'ocr.ps1') -Image $cropFile | ConvertFrom-Json
foreach($line in $result.lines){
    $line.x=($line.x-$pad)/$scale+$left;$line.y=($line.y-$pad)/$scale+$top
    $line.width/=$scale;$line.height/=$scale
    foreach($word in $line.words){$word.x=($word.x-$pad)/$scale+$left;$word.y=($word.y-$pad)/$scale+$top;$word.width/=$scale;$word.height/=$scale}
}
[pscustomobject]@{lines=@($result.lines);image=$cropFile;left=$left;top=$top} | ConvertTo-Json -Depth 8 -Compress
