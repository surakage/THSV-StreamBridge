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
  rem The trailing dot prevents Windows argv parsing from treating the root's final
  rem backslash as an escape for the closing quote.
  "%~dp0runtime\node.exe" "%~dp0launcher\start-streamerbot.mjs" --install-root "%~dp0."
) else (
  rem Source checkout: prefer the cached project runtime, then node.exe on PATH.
  set "THSV_NODE="
  for /d %%D in ("%~dp0.cache\node-runtime\node-v*-win-x64") do if exist "%%~fD\node.exe" set "THSV_NODE=%%~fD\node.exe"
  if not defined THSV_NODE for %%N in (node.exe) do if not "%%~$PATH:N"=="" set "THSV_NODE=%%~$PATH:N"
  if not defined THSV_NODE (
    echo [FAILED] No Node.js runtime was found in .cache\node-runtime or on PATH.
    cmd /c exit /b 1
  ) else (
    call "%%THSV_NODE%%" "%~dp0tools\start-streamerbot-safely.mjs"
  )
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
