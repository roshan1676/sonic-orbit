@echo off
cd /d "%~dp0"
if not exist ".venv-audio" py -3.11 -m venv .venv-audio
if errorlevel 1 goto :failed
where ffmpeg >nul 2>nul
if errorlevel 1 goto :prerequisites
".venv-audio\Scripts\python.exe" -m pip install "demucs==4.1.0" scipy
if errorlevel 1 goto :failed
echo AI environment ready. Restart SonicOrbit to enable separation.
pause
exit /b 0
:prerequisites
echo Install FFmpeg and add it to PATH, then run this helper again.
echo Guide: https://github.com/roshan1676/sonic-orbit/blob/main/docs/getting-started.md
pause
exit /b 1
:failed
echo Install Python 3.11 from python.org, then try again.
pause
exit /b 1
