# build_exe.ps1
# Script PowerShell tự động đóng gói TFT Post-Match Studio thành .exe và Setup

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "    ⚔️ TFT POST-MATCH STUDIO - TIẾN TRÌNH ĐÓNG GÓI .EXE & SETUP ⚔️" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Xác định đường dẫn Python
$pythonExe = "D:\dev\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}

# 2. Tạo Icon Logo NEC .ico
Write-Host "`n[1/5] Kiểm tra và tạo Icon Logo NEC (assets\app_icon.ico)..." -ForegroundColor Cyan
& $pythonExe -c "
from PIL import Image
from pathlib import Path
logo = Path('assets/Logo NEC.png')
ico = Path('assets/app_icon.ico')
if logo.exists():
    img = Image.open(logo).convert('RGBA')
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(ico, format='ICO', sizes=sizes)
    print('    -> Da tao icon Logo NEC thanh cong.')
"

# 3. Biên dịch React
Write-Host "`n[2/5] Biên dịch Web Overlay React (Figma Edition)..." -ForegroundColor Cyan
Push-Location "Web Overlay"
& npm.cmd run build
Pop-Location

# 4. Đóng gói PyInstaller
Write-Host "`n[3/5] Đang đóng gói file thực thi .EXE bằng PyInstaller..." -ForegroundColor Cyan
& $pythonExe -m PyInstaller --clean -y studio.spec

# 5. Sao chép cấu hình
Write-Host "`n[4/5] Sao chép file cấu hình và thư mục output..." -ForegroundColor Cyan
Copy-Item "overlay_config.json" "dist\TFT_PostMatch_Studio\" -Force
Copy-Item ".env.example" "dist\TFT_PostMatch_Studio\.env" -Force
if (Test-Path ".env") {
    Copy-Item ".env" "dist\TFT_PostMatch_Studio\.env" -Force
}
New-Item -ItemType Directory -Force -Path "dist\TFT_PostMatch_Studio\output" | Out-Null

# 6. Kiểm tra Inno Setup
Write-Host "`n[5/5] Kiểm tra trình biên dịch Inno Setup..." -ForegroundColor Cyan
$isccCandidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
)

$isccPath = $null
foreach ($cand in $isccCandidates) {
    if (Test-Path $cand) {
        $isccPath = $cand
        break
    }
}

if ($isccPath) {
    Write-Host "    -> Tìm thấy Inno Setup! Đang tạo TFT_Studio_Setup.exe..." -ForegroundColor Green
    & $isccPath "installer.iss"
    Write-Host "`n======================================================================" -ForegroundColor Green
    Write-Host "    🎉 HOÀN TẤT! BỘ CÀI ĐẶT SETUP TẠI: dist_setup\TFT_Studio_Setup.exe" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "    -> Không tìm thấy Inno Setup (Cài đặt tùy chọn: https://jrsoftware.org/isdl.php)" -ForegroundColor Yellow
    Write-Host "`n======================================================================" -ForegroundColor Green
    Write-Host "    🎉 HOÀN TẤT! GÓI PORTABLE TẠI: dist\TFT_PostMatch_Studio" -ForegroundColor Green
    Write-Host "    Bạn có thể mở thư mục và chạy file TFT_PostMatch_Studio.exe ngay!" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
}
