param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot '..\player-vision.cs')
$results=@()
foreach($kind in @('playing','paused','hidden','solid')){
    $bitmap=New-Object System.Drawing.Bitmap 1450,1752
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    $image=Join-Path $Directory ($kind+'.png')
    try {
        $graphics.Clear([System.Drawing.Color]::Black)
        # Dense shapes where the clock would be: recognition must ignore this area.
        foreach($x in 210..550){if($x%9 -lt 5){$graphics.FillRectangle([System.Drawing.Brushes]::White,$x,910,4,66)}}
        switch($kind){
            'playing' {$graphics.FillRectangle([System.Drawing.Brushes]::White,32,926,12,37);$graphics.FillRectangle([System.Drawing.Brushes]::White,53,926,12,37)}
            'paused' {$graphics.FillPolygon([System.Drawing.Brushes]::White,[System.Drawing.Point[]]@([System.Drawing.Point]::new(32,926),[System.Drawing.Point]::new(60,944),[System.Drawing.Point]::new(32,962)))}
            'solid' {$graphics.FillRectangle([System.Drawing.Brushes]::White,32,926,33,37)}
        }
        $bitmap.Save($image,[System.Drawing.Imaging.ImageFormat]::Png)
    }finally{$graphics.Dispose();$bitmap.Dispose()}
    $results+=@{sample=$kind;control=[PlayerVision]::Read($image,1065)}
}
$results | ConvertTo-Json -Depth 4 -Compress
