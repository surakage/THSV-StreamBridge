@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0launcher\start.mjs" --open-wizard
if errorlevel 1 pause
