@echo off
setlocal
title Start THSV Streaming Tools
color 0B
cls
echo ============================================================
echo               Start THSV Streaming Tools
echo ============================================================
echo.
echo Starting Streamer.bot, Speaker.bot, StreamBridge, enabled broadcast apps, and TikFinity.
echo Healthy sessions will not be restarted.
echo Missing apps produce warnings. Other installed apps will still be attempted.
echo.
if not exist "%~dp0runtime\node.exe" (
  echo [FAILED] Bundled Node runtime is missing. Launcher cannot run.
  echo Summary: streaming tools were not attempted.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0launcher\start-streaming-tools.mjs"
set "THSV_TOOLS_EXIT=%ERRORLEVEL%"
if "%THSV_TOOLS_EXIT%"=="0" (
  color 0A
  echo.
  echo [SUCCESS] Your THSV streaming tools are ready.
  echo Optional apps that were skipped are listed in the per-app summary above.
  "%~dp0runtime\node.exe" -e "setTimeout(function(){},2000)"
  exit /b 0
) else (
  color 0C
  echo.
  echo [FAILED] One or more streaming tools are not ready. Other apps were still attempted.
  echo Review the per-app summary above or open the StreamBridge wizard.
)
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_TOOLS_EXIT%
