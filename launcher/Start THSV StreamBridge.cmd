@echo off
setlocal
title Start THSV StreamBridge
color 0B
cls
echo ============================================================
echo                  Start THSV StreamBridge
echo ============================================================
echo.
echo Starting the local bridge and opening its setup wizard.
echo Installation folder:
echo   %~dp0
echo.
"%~dp0runtime\node.exe" "%~dp0launcher\start.mjs" --open-wizard
set "THSV_LAUNCH_EXIT=%ERRORLEVEL%"
if "%THSV_LAUNCH_EXIT%"=="0" (
  color 0A
  echo.
  echo [SUCCESS] THSV StreamBridge is running.
) else (
  color 0C
  echo.
  echo [FAILED] THSV StreamBridge could not be started.
  echo Review the error above. No creator data was deleted.
)
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_LAUNCH_EXIT%
