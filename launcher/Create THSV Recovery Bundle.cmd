@echo off
setlocal
title Create THSV Recovery Bundle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\recovery-bundle.ps1" -Mode Export -InstallRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo Recovery bundle creation did not complete.
  pause
  exit /b 1
)
echo.
echo Recovery bundle creation completed.
pause
