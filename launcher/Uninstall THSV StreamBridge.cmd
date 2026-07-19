@echo off
setlocal
set "THSV_UNINSTALL_TEMP=%TEMP%\thsv-streambridge-uninstall-%RANDOM%%RANDOM%"
mkdir "%THSV_UNINSTALL_TEMP%" >nul 2>&1
copy /y "%~dp0runtime\node.exe" "%THSV_UNINSTALL_TEMP%\node.exe" >nul
copy /y "%~dp0launcher\uninstall.mjs" "%THSV_UNINSTALL_TEMP%\uninstall.mjs" >nul
"%THSV_UNINSTALL_TEMP%\node.exe" "%THSV_UNINSTALL_TEMP%\uninstall.mjs" --install-root "%~dp0"
set "THSV_UNINSTALL_EXIT=%ERRORLEVEL%"
rmdir /s /q "%THSV_UNINSTALL_TEMP%" >nul 2>&1
if not "%THSV_UNINSTALL_EXIT%"=="0" pause
exit /b %THSV_UNINSTALL_EXIT%
