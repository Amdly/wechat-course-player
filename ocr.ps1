param([Parameter(Mandatory=$true)][string]$Image)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]
$script:AsTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1)
function Wait-Operation($Operation,[Type]$ResultType) {
    $task=$script:AsTask.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
    if(-not $task.Wait(15000)) { throw 'OCR operation timed out.' }
    return $task.Result
}
$file=Wait-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync([IO.Path]::GetFullPath($Image))) ([Windows.Storage.StorageFile])
$stream=Wait-Operation ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
try {
    $decoder=Wait-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap=Wait-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
        $language=[Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object { $_.LanguageTag -like 'zh-Hans*' } | Select-Object -First 1
        if(-not $language) { throw 'Chinese (Simplified) Windows OCR language is required.' }
        $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
        $result=Wait-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $lines=@(foreach($line in $result.Lines) {
            $words=@(foreach($word in $line.Words) {
                $r=$word.BoundingRect
                [pscustomobject]@{text=$word.Text;x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}
            })
            $left=($words | Measure-Object x -Minimum).Minimum
            $top=($words | Measure-Object y -Minimum).Minimum
            $right=($words | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum
            $bottom=($words | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum
            [pscustomobject]@{text=$line.Text;x=$left;y=$top;width=$right-$left;height=$bottom-$top;words=$words}
        })
        [pscustomobject]@{width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;language=$language.LanguageTag;lines=$lines} | ConvertTo-Json -Depth 6 -Compress
    } finally { if($bitmap){$bitmap.Dispose()} }
} finally {$stream.Dispose()}
