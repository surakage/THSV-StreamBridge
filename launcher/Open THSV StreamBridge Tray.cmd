@echo off
setlocal
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launcher\tray.ps1" -InstallRoot "%~dp0"
exit /b %ERRORLEVEL%
