@echo off
setlocal
title Stop THSV StreamBridge
color 0B
cls
echo ============================================================
echo                   Stop THSV StreamBridge
echo ============================================================
echo.
echo Stopping the local bridge. Creator configuration and data
echo will remain unchanged.
echo.
"%~dp0runtime\node.exe" "%~dp0launcher\stop.mjs"
set "THSV_LAUNCH_EXIT=%ERRORLEVEL%"
if "%THSV_LAUNCH_EXIT%"=="0" (
  color 0A
  echo.
  echo [SUCCESS] THSV StreamBridge is stopped.
) else (
  color 0C
  echo.
  echo [FAILED] THSV StreamBridge could not be stopped cleanly.
  echo Review the error above. No creator data was deleted.
)
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_LAUNCH_EXIT%
