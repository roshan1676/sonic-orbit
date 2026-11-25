$ErrorActionPreference = 'Stop'
$audioRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $audioRoot
if (!(Get-Command py -ErrorAction SilentlyContinue)) { throw 'Install Python 3.11 from python.org, then run Setup-AI.cmd again.' }
if (!(Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'Install FFmpeg and add it to PATH, then run Setup-AI.cmd again. See docs/getting-started.md.' }
& py -3.11 -m venv .venv-audio
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required for this setup helper.' }
$audioPython = Join-Path $audioRoot '.venv-audio\Scripts\python.exe'
& $audioPython -m pip install 'demucs==4.1.0' scipy
if ($LASTEXITCODE -ne 0) { throw 'Local AI dependency installation did not finish.' }
Write-Output 'AI environment ready. Restart SonicOrbit before preparing music tracks. The first separation downloads model weights; your media stays local.'
