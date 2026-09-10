# ⚔️ TFT Post-Match Studio

> **Phần mềm tạo Overlay hậu trận đấu Teamfight Tactics (TFT) cho Esports Broadcast.**
> Kết nối Riot API → Render Overlay HTML đẹp → Phát trực tiếp lên OBS Studio trong vài giây.
> Mã nguồn mở — MIT License.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue)](https://github.com)

---

## 📑 Mục Lục

- [✨ Tính năng](#-tính-năng)
- [🏗️ Kiến trúc](#️-kiến-trúc)
- [⚡ Cài đặt nhanh](#-cài-đặt-nhanh)
- [⚙️ Cấu hình](#️-cấu-hình)
- [📺 Tích hợp OBS Studio](#-tích-hợp-obs-studio)
- [📦 Build thành .exe](#-build-thành-exe)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [🤝 Đóng góp](#-đóng-góp)

---

## ✨ Tính năng

- **Riot API tích hợp** — Tự động lấy kết quả trận đấu TFT gần nhất qua API chính thức
- **Render Overlay HTML** — Xuất overlay đồ họa chuẩn 1920×1080 phục vụ OBS Browser Source
- **Cập nhật Real-time** — OBS tự cập nhật overlay mượt mà (không reload, không nhấp nháy) khi nhấn Render
- **Control Panel Desktop** — Điều chỉnh Position / Rotation / Zoom / Crop trực tiếp
- **File Watcher** — Tự động re-render khi bạn lưu `overlay_config.json` hoặc thêm ảnh avatar
- **Xuất PNG** — Kết xuất ảnh overlay 1920×1080 qua Headless Chrome
- **Standalone** — Chạy hoàn toàn cục bộ, không cần server ngoài, không cần tài khoản

---

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────────┐
│              TFT POST-MATCH STUDIO                  │
│              (Chạy trên máy của bạn)                │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │  Control Panel   │    │   Local HTTP Server   │  │
│  │  (PyWebView UI)  │◄──►│   FastAPI :8080       │  │
│  │  - Transform     │    │   WS: /ws             │  │
│  │  - Render button │    │   GET: /overlay       │  │
│  └──────────────────┘    └───────────────────────┘  │
│           │                        ▲                │
│           ▼                        │ DOM-swap        │
│  ┌──────────────────┐              │ (no reload)     │
│  │  StudioBridge    │    ┌─────────┴───────┐        │
│  │  (Python logic)  │    │  OBS Browser    │        │
│  │  - Riot API      │    │  Source         │        │
│  │  - Overlay gen   │    │  localhost:8080 │        │
│  └──────────────────┘    └─────────────────┘        │
└─────────────────────────────────────────────────────┘
```

**Luồng hoạt động:**
1. Nhấn **Render** → Backend gọi Riot API → Sinh `output/overlay.html`
2. Server gửi tín hiệu WS tới OBS Browser Source
3. OBS tự fetch nội dung mới từ `/api/overlay-html` → swap DOM mượt mà (không reload trang)

---

## ⚡ Cài đặt nhanh

### Yêu cầu
- **Python 3.10+** — [python.org](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/) (để build UI lần đầu)
- **OBS Studio** — [obsproject.com](https://obsproject.com/)
- **Google Chrome hoặc Microsoft Edge** (để xuất ảnh PNG)

### Bước 1 — Clone & cài dependencies

```bash
git clone https://github.com/your-username/tft-postmatch-studio.git
cd tft-postmatch-studio

# Tạo virtualenv và cài Python packages
python -m venv .venv

.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

### Bước 2 — Cấu hình Riot API

```bash
# Sao chép file mẫu
copy .env.example .env
```

Mở file `.env` và điền thông tin:

```env
RIOT_API_KEY=RGAPI-xxxx-xxxx-...    # Lấy tại developer.riotgames.com
RIOT_ID=TênIngame#TAG               # Ví dụ: Faker#KR1
REGION=VN                           # VN, KR, NA, EUW, ...
MATCH_COUNT=5
LANGUAGE=vi_VN
```

> **Lưu ý:** Development API Key hết hạn sau **24 giờ**. Vào [developer.riotgames.com](https://developer.riotgames.com) để tạo key mới khi cần.

### Bước 3 — Build UI (chỉ cần làm 1 lần)

```bash
cd "Web Overlay"
npm install
npm run build
cd ..
```

### Bước 4 — Khởi động

```bash
# Kích hoạt venv nếu chưa kích hoạt
.venv\Scripts\activate

# Chạy app
python -m desktop.app
```

Hoặc dùng script có sẵn:

```bash
run_app.bat        # Windows (cmd)
# hoặc
.\run_app.ps1      # Windows (PowerShell)
```

---

## ⚙️ Cấu hình

### `.env` — Riot API

| Biến | Mô tả | Ví dụ |
|------|-------|-------|
| `RIOT_API_KEY` | API Key từ Riot Developer Portal | `RGAPI-xxxx-...` |
| `RIOT_ID` | Riot ID dạng `Tên#TAG` | `Faker#KR1` |
| `REGION` | Khu vực server | `VN`, `KR`, `NA`, `EUW` |
| `MATCH_COUNT` | Số trận gần nhất cần lấy (1–20) | `5` |
| `LANGUAGE` | Ngôn ngữ hiển thị | `vi_VN` hoặc `en_US` |

### `overlay_config.json` — Hiển thị Overlay

```json
{
  "tournament_title": "Tên giải đấu của bạn",
  "stage_title": "Vòng Loại / Stage",
  "game_title": "TEAMFIGHT TACTICS",
  "server_port": 8080,
  "background_image": "assets/background.png",
  "font_family": "League Spartan",
  "player_avatars": {
    "TênNgườiChơi": "assets/avatars/ten.png"
  },
  "overlay_transform": {
    "posX": 0, "posY": 0,
    "zoomX": 100, "zoomY": 100,
    "cropTop": 0, "cropBottom": 0, "cropLeft": 0, "cropRight": 0
  }
}
```

**File Watcher:** Bạn có thể chỉnh sửa và lưu `overlay_config.json` trong lúc app đang chạy — overlay sẽ tự cập nhật sau 0.5 giây mà không cần khởi động lại.

---

## 📺 Tích hợp OBS Studio

1. Mở **OBS Studio**
2. **Sources** → **+** → **Browser**
3. Điền cấu hình:
   - **URL**: `http://localhost:8080/overlay`
   - **Width**: `1920`
   - **Height**: `1080`
   - ✅ **Refresh browser when scene becomes active**
4. Nhấn **OK**

> Mỗi khi bạn nhấn **Render** trong Control Panel, OBS tự động cập nhật nội dung overlay mà không bị nhấp nháy.

---

## 📦 Build thành .exe

Để phân phối ứng dụng không cần cài Python:

```bash
# Đảm bảo đã build UI trước
cd "Web Overlay" && npm run build && cd ..

# Build executable
pyinstaller studio.spec
```

Output sẽ nằm tại `dist/TFT_PostMatch_Studio/TFT_PostMatch_Studio.exe`.

---

## 🛠️ Troubleshooting

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Không lấy được trận từ Riot API | API Key hết hạn (24h) | Vào [developer.riotgames.com](https://developer.riotgames.com) tạo key mới, cập nhật `.env` |
| Overlay không hiện trong OBS | Chưa Render hoặc server chưa chạy | Nhấn Render trong Control Panel, kiểm tra `http://localhost:8080/overlay` trên trình duyệt |
| Font chữ hiển thị sai | Thiếu font League Spartan | Font đã đóng gói trong `assets/League_Spartan/` — kiểm tra thư mục này |
| Xuất PNG thất bại | Không tìm thấy Chrome/Edge | Cài Google Chrome hoặc Microsoft Edge |
| PyWebView không mở được | Thiếu WebView2 Runtime | Tải [Microsoft WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

---

## 🗂️ Cấu trúc thư mục

```
tft-postmatch-studio/
├── backend/                # Python logic
│   ├── config.py           # Đọc .env và overlay_config.json
│   ├── riot_client.py      # Giao tiếp Riot API (rate limiter tích hợp)
│   ├── match_service.py    # Điều phối fetch + parse trận đấu
│   ├── data_parser.py      # Bóc tách JSON trận → clean data
│   ├── overlay_generator.py# Sinh overlay.html từ template
│   ├── export_service.py   # Xuất PNG qua Headless Chrome
│   ├── network_hub.py      # FastAPI server cục bộ + WebSocket
│   ├── file_watcher.py     # Theo dõi thay đổi file config
│   └── paths.py            # Quản lý đường dẫn (dev + .exe)
├── desktop/
│   ├── app.py              # Entrypoint PyWebView
│   └── bridge.py           # IPC Python ↔ JavaScript
├── Web Overlay/            # React Control Panel UI
│   └── src/
│       └── components/
│           └── SourceTransformPanel.tsx
├── templates/              # HTML/CSS template overlay
├── assets/                 # Background, fonts, avatars
├── TFT_DDragon/            # Tài nguyên game (tướng, trang bị, trait)
├── .env.example            # Mẫu cấu hình (sao chép thành .env)
├── overlay_config.json     # Cấu hình hiển thị giải đấu
├── requirements.txt        # Python dependencies
├── studio.spec             # PyInstaller build config
└── LICENSE                 # MIT License
```

---

## 🤝 Đóng góp

Pull requests và issues đều được hoan nghênh!

1. Fork repository
2. Tạo branch mới: `git checkout -b feature/ten-tinh-nang`
3. Commit thay đổi: `git commit -m "feat: mô tả ngắn"`
4. Push và tạo Pull Request

---

*TFT Post-Match Studio — MIT License*
