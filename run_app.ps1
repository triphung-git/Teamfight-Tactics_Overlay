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

# Kiem tra neu Web Overlay chua build dist thi build
if (-not (Test-Path "Web Overlay\dist\index.html")) {
    Write-Host "[1/2] Dang bien dich Web Overlay..." -ForegroundColor Cyan
    Push-Location "Web Overlay"
    & npm.cmd run build
    Pop-Location
}

Write-Host "`n[2/2] Đang mở ứng dụng Desktop Windows (WebView2 SingleFile Mode)..." -ForegroundColor Green
& $pythonExe desktop\app.py
