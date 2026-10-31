@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  set "APPWHERE_NODE=node"
) else (
  set "APPWHERE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
start "" http://127.0.0.1:4173
"%APPWHERE_NODE%" scripts\serve.mjs
pause
