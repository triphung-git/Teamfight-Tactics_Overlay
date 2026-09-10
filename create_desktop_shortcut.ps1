# create_desktop_shortcut.ps1
# Tạo shortcut mở ứng dụng trực tiếp ngoài màn hình Desktop của Windows

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "TFT Post-Match Studio.lnk"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$pythonExe = "D:\dev\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
}

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $pythonExe
$Shortcut.Arguments = "desktop\app.py"
$Shortcut.WorkingDirectory = $projectDir
$Shortcut.Description = "TFT Post-Match Studio - Figma Esports Edition"
$Shortcut.Save()

Write-Host "✅ Đã tạo thành công lối tắt ngoài Desktop: $ShortcutPath" -ForegroundColor Green
Write-Host "Bạn có thể nhấn đúp vào biểu tượng 'TFT Post-Match Studio' trên màn hình chính để mở app!" -ForegroundColor Yellow
