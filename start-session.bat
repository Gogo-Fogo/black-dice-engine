@echo off
setlocal
node "%~dp0scripts\session-launch.mjs" %*
set "sessionExitCode=%errorlevel%"
if not "%sessionExitCode%"=="0" echo Session startup failed. Read the error above; no existing server was stopped.
exit /b %sessionExitCode%
