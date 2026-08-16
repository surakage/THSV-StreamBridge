@echo off
setlocal
title Start THSV Streaming Tools
color 0B
cls
echo ============================================================
echo               Start THSV Streaming Tools
echo ============================================================
echo.
echo Starting in safe order: Streamer.bot, Speaker.bot, StreamBridge, then enabled broadcast apps.
echo Healthy sessions will not be restarted.
echo Optional OBS, Meld, Streamlabs, or Speaker.bot issues are warnings and will not block the bridge.
echo.
"%~dp0runtime\node.exe" "%~dp0launcher\start-streaming-tools.mjs"
set "THSV_TOOLS_EXIT=%ERRORLEVEL%"
if "%THSV_TOOLS_EXIT%"=="0" (
  color 0A
  echo.
  echo [SUCCESS] Your THSV streaming tools are ready.
  echo Closing automatically in 2 seconds.
  "%~dp0runtime\node.exe" -e "setTimeout(function(){},2000)"
  exit /b 0
)
color 0C
echo.
echo [FAILED] One or more streaming tools are not ready.
echo Review the message above or open the StreamBridge wizard.
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_TOOLS_EXIT%
