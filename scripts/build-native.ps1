param([switch]$SkipInstaller)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$modelHome=Join-Path $projectRoot '.cache\spleeter'
$modelManifest=Join-Path $modelHome 'manifest.json'
if(!(Test-Path -LiteralPath $modelManifest)){throw 'Export the pinned Spleeter model first; see docs/native-windows.md. The player never installs Python.'}
$manifest=Get-Content -LiteralPath $modelManifest -Raw | ConvertFrom-Json
$modelFile=Join-Path $modelHome 'spleeter-4stems.onnx'
if((Get-FileHash -LiteralPath $modelFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256){throw 'AI model checksum mismatch.'}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$visualStudio=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if(!$visualStudio){throw 'Install the MSVC x64 C++ build tools.'}
$nativeBuild=Join-Path $projectRoot '.cache\native-build'
$buildCommand=Join-Path $projectRoot '.cache\compile-native.cmd'
@"
@echo off
call "$visualStudio\VC\Auxiliary\Build\vcvars64.bat"
cmake -S "$projectRoot\native" -B "$nativeBuild" -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1
cmake --build "$nativeBuild"
if errorlevel 1 exit /b 1
ctest --test-dir "$nativeBuild" --output-on-failure
"@ | Set-Content -LiteralPath $buildCommand -Encoding ascii
& cmd.exe /c "`"$buildCommand`""
if($LASTEXITCODE -ne 0){throw 'Native C++ build/tests failed.'}
& dotnet build tests/native/SonicOrbit.Native.Tests.csproj -c Release
if($LASTEXITCODE -ne 0){throw 'Native integration test build failed.'}
$testDirectory=Join-Path $projectRoot 'tests\native\bin\Release\net10.0-windows'
Copy-Item -LiteralPath (Join-Path $nativeBuild 'sonicorbit_dsp.dll') -Destination $testDirectory
& dotnet (Join-Path $testDirectory 'SonicOrbit.Native.Tests.dll') $projectRoot
if($LASTEXITCODE -ne 0){throw 'Native model, tracking or playback regression tests failed.'}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$publish=Join-Path $projectRoot ".cache\native-publish\$stamp"
& dotnet publish desktop/native/SonicOrbit.Native.csproj -c Release -r win-x64 --self-contained true -p:RuntimeFrameworkVersion=10.0.15 -p:PublishSingleFile=false -p:PublishReadyToRun=true -o $publish
if($LASTEXITCODE -ne 0){throw 'Native app publishing failed.'}
# A new output directory avoids stale files from earlier package versions.
$payload=Join-Path $projectRoot ".cache\native-payload\$stamp\SonicOrbit-Native"
New-Item -ItemType Directory -Path $payload -Force | Out-Null
Get-ChildItem -LiteralPath $publish | Where-Object {$_.Name -notin @('libvlc','runtimes') -and $_.Extension -notin @('.pdb','.xml')} | Copy-Item -Destination $payload -Recurse
New-Item -ItemType Directory -Path (Join-Path $payload 'libvlc') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $publish 'libvlc\win-x64') -Destination (Join-Path $payload 'libvlc\win-x64') -Recurse
if(Test-Path -LiteralPath (Join-Path $publish 'runtimes\win-x64')){New-Item -ItemType Directory -Path (Join-Path $payload 'runtimes') -Force | Out-Null;Copy-Item -LiteralPath (Join-Path $publish 'runtimes\win-x64') -Destination (Join-Path $payload 'runtimes\win-x64') -Recurse}
Copy-Item -LiteralPath (Join-Path $nativeBuild 'sonicorbit_dsp.dll') -Destination $payload
$crtRoot=Get-ChildItem -LiteralPath (Join-Path $visualStudio 'VC\Redist\MSVC') -Directory | Where-Object Name -Match '^\d+\.' | Sort-Object Name -Descending | Select-Object -First 1
$crt=Join-Path $crtRoot.FullName 'x64\Microsoft.VC145.CRT'
if(!(Test-Path -LiteralPath (Join-Path $crt 'vcruntime140_1.dll'))){throw 'The app-local Microsoft x64 redistributable CRT files are missing.'}
Get-ChildItem -LiteralPath $crt -Filter '*.dll' -File | Copy-Item -Destination $payload
$modelTarget=Join-Path $payload 'assets\models';New-Item -ItemType Directory -Path $modelTarget -Force | Out-Null
foreach($name in @('spleeter-4stems.onnx','manifest.json','LICENSE-SPLEETER.txt')){Copy-Item -LiteralPath (Join-Path $modelHome $name) -Destination $modelTarget}
Copy-Item -LiteralPath (Join-Path $projectRoot 'public\brand\sonic-orbit.ico') -Destination (Join-Path $payload 'SonicOrbit.ico')
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $payload
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\native-windows.md') -Destination (Join-Path $payload 'README.md')
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\native\THIRD-PARTY.txt') -Destination $payload
$licenses=Join-Path $payload 'licenses';New-Item -ItemType Directory -Path $licenses -Force | Out-Null
$nuget=Join-Path $env:USERPROFILE '.nuget\packages'
New-Item -ItemType Directory -Path (Join-Path $licenses 'onnxruntime') -Force | Out-Null
foreach($name in @('LICENSE','ThirdPartyNotices.txt')){Copy-Item -LiteralPath (Join-Path $nuget "microsoft.ml.onnxruntime\1.23.2\$name") -Destination (Join-Path $licenses 'onnxruntime')}
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\native\licenses\LGPL-2.1.txt') -Destination $licenses
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\native\licenses\NAudio-MIT.txt') -Destination $licenses
foreach($package in @('microsoft.netcore.app.runtime.win-x64','microsoft.windowsdesktop.app.runtime.win-x64')){
  $source=Join-Path $nuget "$package\10.0.15";$target=Join-Path $licenses $package;New-Item -ItemType Directory -Path $target -Force | Out-Null
  Get-ChildItem -LiteralPath $source -File | Where-Object Name -Match 'LICENSE|ThirdPartyNotices' | Copy-Item -Destination $target
}
$dotnetHome=Split-Path (Get-Command dotnet).Source
$dotnetNotices=Join-Path $licenses 'dotnet-host';New-Item -ItemType Directory -Path $dotnetNotices -Force | Out-Null
foreach($name in @('LICENSE.txt','ThirdPartyNotices.txt')){Copy-Item -LiteralPath (Join-Path $dotnetHome $name) -Destination $dotnetNotices}
New-Item -ItemType Directory -Path (Join-Path $payload 'source') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'native') -Destination (Join-Path $payload 'source\native') -Recurse
$appSource=Join-Path $payload 'source\desktop\native';New-Item -ItemType Directory -Path $appSource -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'desktop\native') -File | Copy-Item -Destination $appSource
$release=Join-Path $projectRoot 'dist\native-release';New-Item -ItemType Directory -Path $release -Force | Out-Null
$zip=Join-Path $release 'SonicOrbit-0.2.0-alpha.1-windows-x64-portable.zip'
Compress-Archive -LiteralPath $payload -DestinationPath $zip -Force
if(!$SkipInstaller){
  $compiler=Join-Path $projectRoot '.cache\inno\ISCC.exe'
  if(!(Test-Path -LiteralPath $compiler)){$compiler=(Get-Command ISCC.exe -ErrorAction Stop).Source}
  & $compiler /Qp ("/DPayload=$payload") ("/DOutput=$release") (Join-Path $projectRoot 'desktop\native\installer.iss')
  if($LASTEXITCODE -ne 0){throw 'Installer compilation failed.'}
}
Get-ChildItem -LiteralPath $release -File | Where-Object {$_.Extension -in @('.zip','.exe')} | ForEach-Object {('{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(),$_.Name)} | Set-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt') -Encoding ascii
@{payload=$payload;publish=$publish;version='0.2.0-alpha.1'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot '.cache\native-build-result.json') -Encoding utf8
Write-Output "Native offline package ready: $release"
