@echo off
setlocal
title THSV StreamBridge Installer
color 0B
cls
echo ============================================================
echo                 THSV StreamBridge Installer
echo ============================================================
echo.
echo This installer verifies every packaged file before changing
echo the installation. It does not require administrator access or
echo ask for Twitch, YouTube, Kick, or TikTok passwords.
echo.
echo Package folder:
echo   %~dp0
echo.
echo The window will stay open so you can review the final result.
echo.
echo [1/1] Verifying and installing THSV StreamBridge...
echo.
"%~dp0runtime\node.exe" "%~dp0installer\install.mjs" %*
set "THSV_INSTALL_EXIT=%ERRORLEVEL%"
echo.
if not "%THSV_INSTALL_EXIT%"=="0" (
  color 0C
  echo ============================================================
  echo [FAILED] THSV StreamBridge was not installed successfully.
  echo.
  echo Review the error above. Existing creator data was not deleted.
) else (
  color 0A
  echo ============================================================
  echo [SUCCESS] THSV StreamBridge installation completed.
  echo.
  echo The setup wizard should now be open in your browser.
  echo Default installation: %LOCALAPPDATA%\THSV StreamBridge
  echo Existing creator configuration and state were preserved.
)
echo ============================================================
echo.
echo Press any key to close this installer window.
pause >nul
exit /b %THSV_INSTALL_EXIT%
