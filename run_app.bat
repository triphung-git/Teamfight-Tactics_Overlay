@echo off
cd /d "%~dp0"
chcp 65001 > nul
title TFT Post-Match Studio
color 0b

echo ======================================================================
echo              TFT POST-MATCH STUDIO
echo ======================================================================
echo.

set PYTHON_EXE=python

:: 1. Kiem tra va tao file .env neu chua co
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Phat hien chua co file .env -> Tu dong tao tu .env.example...
        copy /y ".env.example" ".env" > nul
    )
)

:: 2. Kiem tra neu Web Overlay chua build dist thi tu dong build
if not exist "Web Overlay\dist\index.html" (
    echo [1/2] Phat hien Web Overlay chua build. Dang chuan bi...
    cd "Web Overlay"
    if not exist "node_modules" (
        echo Dang cai dat dependencies cho Web Overlay (npm install)...
        call npm.cmd install
    )
    echo Dang bien dich giao dien (npm run build)...
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
