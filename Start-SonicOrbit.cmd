@echo off
cd /d "%~dp0"
if exist "SonicOrbit.exe" (
  start "SonicOrbit" "SonicOrbit.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer, or download the portable Windows release.
  pause
  exit /b 1
)
node server.mjs --open
pause
