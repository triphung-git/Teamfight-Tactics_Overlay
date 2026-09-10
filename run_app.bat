@echo off
cd /d "%~dp0"
chcp 65001 > nul
title TFT Post-Match Studio - Figma Esports Edition
color 0b

echo ======================================================================
echo       ⚔️ TFT POST-MATCH STUDIO - FIGMA LANDING PAGE EDITION ⚔️
echo ======================================================================
echo.

set PYTHON_EXE=D:\dev\python.exe
if not exist "%PYTHON_EXE%" (
    set PYTHON_EXE=python
)

:: Kiem tra neu Web Overlay (Figma Landing Page) chua build dist thi tu dong build
if not exist "Web Overlay\dist\index.html" (
    echo [1/2] Dang bien dich Web Overlay (Figma Landing Page)...
    cd "Web Overlay"
    call npm.cmd run build
    cd ..
)

echo.
echo [2/2] Khoi dong Ung dung Desktop Windows (WebView2 SingleFile Mode)...
"%PYTHON_EXE%" desktop\app.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [CANH BAO] Ung dung dung voi ma loi: %ERRORLEVEL%
    pause
)
