@echo off
setlocal
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
  set "THSV_UNINSTALL_SELF=%~f0"
  start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 750; Remove-Item -LiteralPath $env:THSV_UNINSTALL_SELF -Force"
  exit /b 0
)
pause
exit /b %THSV_UNINSTALL_EXIT%
