$ErrorActionPreference='Stop'
Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot '..\window-guard.cs')
$results=@{}
foreach($kind in @('black','white','page')){
    $bitmap=New-Object System.Drawing.Bitmap 1450,1752
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $color=if($kind -eq 'white'){[System.Drawing.Color]::White}else{[System.Drawing.Color]::Black}
        $graphics.Clear($color)
        if($kind -eq 'page'){$graphics.FillRectangle([System.Drawing.Brushes]::White,0,180,1450,1572)}
        $results[$kind]=[WindowGuard]::IsBlank($bitmap)
    }finally{$graphics.Dispose();$bitmap.Dispose()}
}
$results | ConvertTo-Json -Compress
