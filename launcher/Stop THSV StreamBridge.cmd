@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0launcher\stop.mjs"
if errorlevel 1 pause
