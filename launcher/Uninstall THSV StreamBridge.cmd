@echo off
setlocal
title THSV StreamBridge Uninstaller
color 0B
cls
echo ============================================================
echo                THSV StreamBridge Uninstaller
echo ============================================================
echo.
echo This removes the installed application, bundled runtime, and
echo launchers. Your configuration, secrets, add-ons, state, logs,
echo uploads, and backups are preserved for a future reinstall.
echo.
echo Installation folder:
echo   %~dp0
echo.
echo The window will stay open so you can review the final result.
echo.
echo [1/1] Stopping and removing THSV StreamBridge...
echo.
set "THSV_INSTALL_ROOT=%~dp0"
if "%THSV_INSTALL_ROOT:~-1%"=="\" set "THSV_INSTALL_ROOT=%THSV_INSTALL_ROOT:~0,-1%"
set "THSV_UNINSTALL_TEMP=%TEMP%\thsv-streambridge-uninstall-%RANDOM%%RANDOM%"
mkdir "%THSV_UNINSTALL_TEMP%" >nul 2>&1
copy /y "%~dp0runtime\node.exe" "%THSV_UNINSTALL_TEMP%\node.exe" >nul
copy /y "%~dp0launcher\uninstall.mjs" "%THSV_UNINSTALL_TEMP%\uninstall.mjs" >nul
"%THSV_UNINSTALL_TEMP%\node.exe" "%THSV_UNINSTALL_TEMP%\uninstall.mjs" --install-root "%THSV_INSTALL_ROOT%"
set "THSV_UNINSTALL_EXIT=%ERRORLEVEL%"
rmdir /s /q "%THSV_UNINSTALL_TEMP%" >nul 2>&1
if "%THSV_UNINSTALL_EXIT%"=="0" (
  color 0A
  echo.
  echo ============================================================
  echo [SUCCESS] THSV StreamBridge was removed successfully.
  echo.
  echo Creator data was preserved in:
  echo   %THSV_INSTALL_ROOT%\data
  echo   %THSV_INSTALL_ROOT%\addons
  echo.
  echo Reinstalling later will reuse this preserved configuration.
  echo ============================================================
  echo.
  echo Press any key to close this window.
  pause >nul
  set "THSV_UNINSTALL_SELF=%~f0"
  set "THSV_UNINSTALL_ROOT=%THSV_INSTALL_ROOT%"
  start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1000; $paths = @((Join-Path $env:THSV_UNINSTALL_ROOT 'app'), (Join-Path $env:THSV_UNINSTALL_ROOT 'runtime'), (Join-Path $env:THSV_UNINSTALL_ROOT 'launcher'), (Join-Path $env:THSV_UNINSTALL_ROOT 'Install THSV StreamBridge.cmd'), (Join-Path $env:THSV_UNINSTALL_ROOT 'Start THSV StreamBridge.cmd'), (Join-Path $env:THSV_UNINSTALL_ROOT 'Stop THSV StreamBridge.cmd'), (Join-Path $env:THSV_UNINSTALL_ROOT 'Open THSV Setup Wizard.cmd'), $env:THSV_UNINSTALL_SELF); for ($attempt = 0; $attempt -lt 20; $attempt++) { $remaining = $false; foreach ($path in $paths) { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue; if (Test-Path -LiteralPath $path) { $remaining = $true } }; if (-not $remaining) { break }; Start-Sleep -Milliseconds 250 }"
  exit /b 0
)
color 0C
echo.
echo ============================================================
echo [FAILED] THSV StreamBridge could not be removed completely.
echo.
echo Review the error above. Creator data was not intentionally deleted.
echo ============================================================
echo.
echo Press any key to close this window.
pause >nul
exit /b %THSV_UNINSTALL_EXIT%
