@echo off
setlocal
title Move THSV StreamBridge to Another Computer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\recovery-bundle.ps1" -Mode MoveExport -InstallRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo Move-computer bundle creation did not complete.
  pause
  exit /b 1
)
echo.
echo Move-computer bundle created. Credentials were excluded on purpose.
pause
