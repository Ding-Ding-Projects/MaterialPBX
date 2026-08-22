@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SILENT_FLAG="
if /I "%~1"=="/s" set "SILENT_FLAG=-Silent"
if /I "%~1"=="--silent" set "SILENT_FLAG=-Silent"
if "%SILENT%"=="1" set "SILENT_FLAG=-Silent"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build.ps1" %SILENT_FLAG%
exit /b %ERRORLEVEL%

