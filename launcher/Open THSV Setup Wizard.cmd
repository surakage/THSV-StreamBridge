@echo off
setlocal
title Open THSV Setup Wizard
color 0B
cls
echo ============================================================
echo                 Open THSV Setup Wizard
echo ============================================================
echo.
echo Ensuring the local bridge is running, then opening the setup
echo wizard in your default browser.
echo.
"%~dp0runtime\node.exe" "%~dp0launcher\start.mjs" --open-wizard
set "THSV_LAUNCH_EXIT=%ERRORLEVEL%"
if "%THSV_LAUNCH_EXIT%"=="0" (
  color 0A
  echo.
  echo [SUCCESS] The setup wizard was opened.
) else (
  color 0C
  echo.
  echo [FAILED] The setup wizard could not be opened.
  echo Review the error above. No creator data was deleted.
)
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_LAUNCH_EXIT%
