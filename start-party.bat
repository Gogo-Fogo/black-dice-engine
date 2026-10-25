@echo off
setlocal
node "%~dp0scripts\party-launch.mjs" %*
set "partyExitCode=%errorlevel%"
if not "%partyExitCode%"=="0" echo Party startup failed. Read the error above; no existing server was stopped.
exit /b %partyExitCode%
