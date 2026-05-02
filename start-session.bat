@echo off
echo ==========================================
echo Black Dice Engine - Session Startup
echo ==========================================
echo.

cd /d "G:\Workspace\MyTools\Black Dice Engine"

echo [1/4] Starting ComfyUI... (wait for it to load)
start "ComfyUI" cmd /c "cd /d G:\AI_Tools\ComfyUI_windows_portable && run_nvidia_gpu.bat"

echo [2/4] Starting Game Server...
start "Game Server" cmd /c "npm run dev:server"

echo [3/4] Starting Audio Service...
start "Audio Service" cmd /c "npm run dev:audio"

echo [4/4] Starting GM Dashboard...
start "GM Dashboard" cmd /c "npm run dev:gm"

echo.
echo ==========================================
echo All services starting in separate windows.
echo.
echo Wait 30 seconds for ComfyUI to fully load.
echo Then open: http://localhost:5173
echo ==========================================
pause
