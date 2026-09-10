; Inno Setup Script cho TFT Post-Match Studio
; Đóng gói bộ cài đặt Setup.exe chuyên nghiệp chuẩn Windows

#define MyAppName "TFT Post-Match Studio"
#define MyAppVersion "2.4"
#define MyAppPublisher "TFT Post-Match Studio"
#define MyAppExeName "TFT_PostMatch_Studio.exe"
#define MyAppIcon "assets\app_icon.ico"

[Setup]
AppId={{9C561E8D-B27A-4FD2-A0E1-889B9D8B1C33}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\TFT_PostMatch_Studio
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist_setup
OutputBaseFilename=TFT_Studio_Setup
SetupIconFile={#MyAppIcon}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Thư mục ứng dụng đã được PyInstaller đóng gói
Source: "dist\TFT_PostMatch_Studio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Thư mục assets chứa Logo NEC, OEG, VNGGames, app_icon, background (1.9 MB)
Source: "assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; Dữ liệu game TFT DataDragon (Tướng, Trang bị, Lõi, Tộc hệ, Coins, Linh thú)
Source: "TFT_DDragon\data\*"; DestDir: "{app}\TFT_DDragon\data"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "TFT_DDragon\img\champion\*"; DestDir: "{app}\TFT_DDragon\img\champion"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "TFT_DDragon\img\item\*"; DestDir: "{app}\TFT_DDragon\img\item"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "TFT_DDragon\img\augment\*"; DestDir: "{app}\TFT_DDragon\img\augment"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "TFT_DDragon\img\region-portal\*"; DestDir: "{app}\TFT_DDragon\img\region-portal"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "TFT_DDragon\img\trait\*"; DestDir: "{app}\TFT_DDragon\img\trait"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "TFT_DDragon\img\tactician\*"; DestDir: "{app}\TFT_DDragon\img\tactician"; Flags: ignoreversion recursesubdirs createallsubdirs

; Các file dữ liệu mẫu cho Overlay
Source: "output\overlay.html"; DestDir: "{app}\output"; Flags: ignoreversion onlyifdoesntexist
Source: "output\overlay.css"; DestDir: "{app}\output"; Flags: ignoreversion onlyifdoesntexist
Source: "output\clean_matches_latest.json"; DestDir: "{app}\output"; Flags: ignoreversion onlyifdoesntexist

; Cấu hình mẫu và file .env (không ghi đè nếu người dùng đã có file cấu hình cũ)
Source: "overlay_config.json"; DestDir: "{app}"; Flags: onlyifdoesntexist
Source: ".env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app_icon.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
