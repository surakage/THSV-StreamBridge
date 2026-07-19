@echo off
setlocal
title THSV StreamBridge Installer
"%~dp0runtime\node.exe" "%~dp0installer\install.mjs" %*
if errorlevel 1 (
  echo.
  echo Installation failed. Review the message above; no creator data was deleted.
  pause
)
