@echo off
echo ==========================================
echo Black Dice Engine - Session Startup
echo ==========================================
echo.
echo IMPORTANT: Close any existing Black Dice Engine
echo windows before running this script.
echo.
echo Press any key to continue...
pause > nul

cd /d "G:\Workspace\MyTools\Black Dice Engine"

echo [1/6] Building player companion...
npm run build --workspace apps/player-companion > nul 2>&1

echo [2/6] Starting ComfyUI... (takes ~30 seconds)
start "ComfyUI" cmd /c "cd /d G:\AI_Tools\ComfyUI_windows_portable && run_nvidia_gpu.bat"

echo [3/5] Starting Comfy Router...
start "Comfy Router" cmd /c "npm run dev:comfy"

echo [4/5] Starting Game Server...
start "Game Server" cmd /c "npm run dev:server"

echo [5/5] Starting Audio Service...
start "Audio Service" cmd /c "npm run dev:audio"

echo [6/6] Starting GM Dashboard...
start "GM Dashboard" cmd /c "npm run dev:gm"

echo.
echo ==========================================
echo All services are starting in separate windows.
echo.
echo 1. Wait 30 seconds for ComfyUI to fully load.
echo 2. Open the GM dashboard:
echo    http://localhost:5173
echo.
echo Players should join via the QR code shown
echo in the GM dashboard, or visit:
echo    http://YOUR_PC_IP:4310/player/
echo ==========================================
pause
