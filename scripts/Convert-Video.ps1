param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $InputPath).Path
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'Choose a video file.' }
if (-not $OutputPath) {
    $sourceDirectory = [IO.Path]::GetDirectoryName($sourcePath)
    $sourceStem = [IO.Path]::GetFileNameWithoutExtension($sourcePath)
    $OutputPath = Join-Path $sourceDirectory ($sourceStem + '_360-compatible.mp4')
}
$destinationPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $destinationPath) { throw 'The output already exists. Choose a different output path.' }
if ($sourcePath -eq $destinationPath) { throw 'The output must be a new file.' }
& ffmpeg -n -i $sourcePath -map 0:v:0 -map '0:a:0?' -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 256k -ac 2 -movflags +faststart $destinationPath
if ($LASTEXITCODE -ne 0) { throw 'Conversion failed. The original file was not modified.' }
Write-Output "Compatible copy: $destinationPath"
