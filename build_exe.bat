@echo off
chcp 65001 > nul
title TFT Post-Match Studio - Build Packaging
color 0b

echo ======================================================================
echo    TFT POST-MATCH STUDIO - TIEN TRINH DONG GOI .EXE
echo ======================================================================
echo.

set BASE_DIR=%~dp0
cd /d "%BASE_DIR%"

set PYTHON_EXE=python

:: 1. Chuyển đổi Icon Logo NEC sang .ico
echo [1/5] Kiểm tra và tạo Icon Logo NEC (assets\app_icon.ico)...
"%PYTHON_EXE%" -c "
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

:: 2. Build giao diện React
echo.
echo [2/5] Biên dịch giao diện Web Overlay React (Figma Edition)...
cd "Web Overlay"
call npm.cmd run build
cd ..
if %ERRORLEVEL% neq 0 (
    echo [LOI] Bien dich React that bai. Dung tien trinh.
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Đóng gói PyInstaller
echo.
echo [3/5] Đang đóng gói file thực thi .EXE bằng PyInstaller...
"%PYTHON_EXE%" -m PyInstaller --clean -y studio.spec
if %ERRORLEVEL% neq 0 (
    echo [LOI] PyInstaller dong goi that bai.
    pause
    exit /b %ERRORLEVEL%
)

:: 4. Chuẩn bị file cấu hình và tài nguyên đi kèm
echo.
echo [4/5] Sao chép file cấu hình, thư mục assets và tài nguyên mẫu...
copy /y "overlay_config.json" "dist\TFT_PostMatch_Studio\" > nul
copy /y ".env.example" "dist\TFT_PostMatch_Studio\.env" > nul

:: Sao chép thư mục assets (chứa Logo NEC, OEG, VNGGames, icon app)
if not exist "dist\TFT_PostMatch_Studio\assets" mkdir "dist\TFT_PostMatch_Studio\assets"
xcopy /E /I /Y "assets" "dist\TFT_PostMatch_Studio\assets" > nul

:: Liên kết thư mục dữ liệu game TFT_DDragon vào dist
if not exist "dist\TFT_PostMatch_Studio\TFT_DDragon" (
    mklink /J "dist\TFT_PostMatch_Studio\TFT_DDragon" "TFT_DDragon" > nul
)

:: Tao thu muc output va sao chep mau overlay (chi neu file ton tai)
if not exist "dist\TFT_PostMatch_Studio\output" mkdir "dist\TFT_PostMatch_Studio\output"
if exist "output\overlay.html" copy /y "output\overlay.html" "dist\TFT_PostMatch_Studio\output\" > nul
if exist "output\overlay.css" copy /y "output\overlay.css" "dist\TFT_PostMatch_Studio\output\" > nul
if exist "output\clean_matches_latest.json" copy /y "output\clean_matches_latest.json" "dist\TFT_PostMatch_Studio\output\" > nul

:: Sao chep .env.example vao dist duoi ten .env (an toan - khong lo API key)
:: Neu nguoi dung muon giu .env cu, ho co the tu copy
copy /y ".env.example" "dist\TFT_PostMatch_Studio\.env" > nul

:: 5. Biên dịch Inno Setup (nếu đã cài đặt Inno Setup)
echo.
echo [5/5] Kiểm tra trình biên dịch Inno Setup (ISCC.exe)...
set ISCC_EXE="C:\Users\Admin\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
if not exist %ISCC_EXE% set ISCC_EXE="%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist %ISCC_EXE% set ISCC_EXE="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %ISCC_EXE% set ISCC_EXE="C:\Program Files\Inno Setup 6\ISCC.exe"

if exist %ISCC_EXE% (
    echo    -> Tim thay Inno Setup! Dang tao bo cai dat TFT_Studio_Setup.exe...
    %ISCC_EXE% "installer.iss"
    echo.
    echo ======================================================================
    echo    🎉 HOÀN TẤT! BỘ CÀI ĐẶT SETUP ĐƯỢC TẠO TẠI: dist_setup\TFT_Studio_Setup.exe
    echo ======================================================================
) else (
    echo    -> Khong tim thay Inno Setup tren he thong.
    echo    -> Ban co the tai mien phi Inno Setup tai: https://jrsoftware.org/isdl.php
    echo.
    echo ======================================================================
    echo    🎉 HOÀN TẤT! GOI ỨNG DỤNG PORTABLE TẠI: dist\TFT_PostMatch_Studio
    echo    Ban co the mo thu muc va chay file TFT_PostMatch_Studio.exe ngay!
    echo ======================================================================
)

echo.
pause
