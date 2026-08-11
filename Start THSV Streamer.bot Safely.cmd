@echo off
setlocal
title Start THSV Streamer.bot Safely
color 0B
cls
echo ============================================================
echo             Start THSV Streamer.bot Safely
echo ============================================================
echo.
echo Checking that Streamer.bot has fully released its WebSocket
echo port before starting or repairing the local session.
echo.
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0launcher\start-streamerbot.mjs" --install-root "%~dp0"
) else (
  node.exe "%~dp0tools\start-streamerbot-safely.mjs"
)
set "THSV_SAFE_START_EXIT=%ERRORLEVEL%"
if "%THSV_SAFE_START_EXIT%"=="0" (
  color 0A
  echo.
  echo [SUCCESS] Streamer.bot is ready for StreamBridge.
) else (
  color 0C
  echo.
  echo [FAILED] Streamer.bot was not changed unsafely.
  echo Review the specific port or process message above.
)
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_SAFE_START_EXIT%
