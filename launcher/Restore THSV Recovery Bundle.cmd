@echo off
setlocal
title Restore THSV Recovery Bundle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\recovery-bundle.ps1" -Mode Restore -InstallRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo Recovery bundle restore did not complete.
  pause
  exit /b 1
)
echo.
echo Recovery bundle restore completed.
pause
