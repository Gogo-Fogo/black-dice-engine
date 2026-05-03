@echo off
setlocal EnableDelayedExpansion

echo =========================================
echo  SDXL Lightning Model Downloader
echo =========================================
echo.
echo This will download sdxl_lightning_4step.safetensors (~6.9 GB)
echo to your ComfyUI checkpoints folder.
echo.
echo Source: HuggingFace - ByteDance/SDXL-Lightning
echo Target: G:\AI_Tools\ComfyUI_windows_portable\models\checkpoints\
echo.

set "TARGET_DIR=G:\AI_Tools\ComfyUI_windows_portable\ComfyUI\models\checkpoints"
set "TARGET_FILE=%TARGET_DIR%\sdxl_lightning_4step.safetensors"
set "URL=https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_4step.safetensors"

if not exist "%TARGET_DIR%" (
    echo ERROR: ComfyUI checkpoints folder not found.
    echo Expected: %TARGET_DIR%
    echo.
    echo Please update this script with your correct ComfyUI path.
    pause
    exit /b 1
)

if exist "%TARGET_FILE%" (
    echo Model already exists: %TARGET_FILE%
    echo Skipping download.
    echo.
    pause
    exit /b 0
)

echo Downloading SDXL Lightning 4-step model...
echo This may take 10-30 minutes depending on your connection.
echo.

curl -L -o "%TARGET_FILE%" "%URL%"

if errorlevel 1 (
    echo.
    echo ERROR: Download failed.
    echo You can manually download from:
    echo %URL%
    echo And place it in:
    echo %TARGET_DIR%
    pause
    exit /b 1
)

echo.
echo Download complete!
echo File: %TARGET_FILE%
echo.
echo You can now use image generation in Black Dice Engine.
pause
