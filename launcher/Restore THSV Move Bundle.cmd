@echo off
setlocal
title Restore THSV Move Bundle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\recovery-bundle.ps1" -Mode MoveRestore -InstallRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo Move-computer restore did not complete.
  pause
  exit /b 1
)
echo.
echo Move-computer restore completed. Re-enter credentials in the Setup Wizard.
pause
