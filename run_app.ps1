# run_app.ps1
# Script khởi chạy ứng dụng TFT Post-Match Studio bằng PowerShell

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "              TFT POST-MATCH STUDIO" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

# Dung Python trong PATH
$pythonExe = "python"

# 1. Kiem tra va tao file .env neu chua co
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Write-Host "[INFO] Chưa có file .env -> Tự động sao chép từ .env.example..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env"
}

# 2. Kiem tra neu Web Overlay chua build dist thi build
if (-not (Test-Path "Web Overlay\dist\index.html")) {
    Write-Host "[1/2] Phát hiện Web Overlay chưa build. Đang chuẩn bị..." -ForegroundColor Cyan
    Push-Location "Web Overlay"
    if (-not (Test-Path "node_modules")) {
        Write-Host "Đang cài đặt dependencies cho Web Overlay (npm install)..." -ForegroundColor Yellow
        & npm.cmd install
    }
    Write-Host "Đang biên dịch giao diện (npm run build)..." -ForegroundColor Yellow
    & npm.cmd run build
    Pop-Location
}

Write-Host "`n[2/2] Đang mở ứng dụng Desktop Windows (WebView2 SingleFile Mode)..." -ForegroundColor Green
& $pythonExe desktop\app.py
