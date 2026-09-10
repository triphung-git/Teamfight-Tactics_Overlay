"""
desktop/app.py
--------------
Entrypoint chính khởi động Ứng Dụng Hybrid Desktop TFT Post-Match Studio trên Windows.
Sử dụng thiết kế giao diện Figma Landing Page (Web Overlay) và nhân WebView2 siêu mượt.

Quản lý 2 cửa sổ:
    1. Cửa sổ Controller: Bảng điều khiển Transform, Crop, Position, Rotation, Zoom & Render.
    2. Cửa sổ Overlay: Chiếu hình ảnh Overlay chuẩn 1920x1080 trực tiếp lên Windows Desktop / OBS.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from pathlib import Path

# Đảm bảo Windows terminal in UTF-8 và kích hoạt Per-Monitor DPI Awareness
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            import ctypes
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

# Thêm thư mục gốc vào PYTHONPATH
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import webview

from backend.match_service import MatchService
from backend.overlay_generator import generate_overlay_html, load_overlay_config as load_generator_config
from desktop.bridge import StudioBridge

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("desktop_app")

OUTPUT_DIR = BASE_DIR / "output"
WEB_OVERLAY_DIST = BASE_DIR / "Web Overlay" / "dist" / "index.html"


def ensure_prerequisites() -> None:
    """Đảm bảo các file HTML và dữ liệu mẫu sẵn sàng trước khi nạp cửa sổ."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Kiểm tra build giao diện Figma Landing Page
    if not WEB_OVERLAY_DIST.exists():
        logger.info("Building UI bundle: Web Overlay")
        web_overlay_dir = BASE_DIR / "Web Overlay"
        try:
            subprocess.run(["npm.cmd", "run", "build"], cwd=web_overlay_dir, check=True)
            logger.info("UI bundle built successfully")
        except Exception as e:
            logger.error("Failed to build UI bundle: %s", e)

    # 2. Kiểm tra file output/overlay.html
    overlay_html = OUTPUT_DIR / "overlay.html"
    if not overlay_html.exists():
        candidates = [
            OUTPUT_DIR / "clean_matches_latest.json",
            OUTPUT_DIR / "clean_matches_bí_ẹo_0602.json",
        ]
        for cand in candidates:
            if cand.exists():
                try:
                    with open(cand, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if data:
                            cfg = load_generator_config(BASE_DIR / "overlay_config.json")
                            generate_overlay_html(data[0], cfg, overlay_html)
                            break
                except Exception as e:
                    logger.warning("Failed to initialize template: %s", e)


def main() -> None:
    print("TFT POST-MATCH STUDIO", flush=True)
    print(f"UI: {WEB_OVERLAY_DIST.resolve()}", flush=True)
    print(f"Overlay: {(OUTPUT_DIR / 'overlay.html').resolve()}", flush=True)
    print("Runtime: Microsoft Edge WebView2\n", flush=True)

    ensure_prerequisites()

    # 1. Khởi tạo Backend Services & IPC Bridge
    match_service = MatchService()
    bridge = StudioBridge(match_service=match_service)

    # 2. Tạo Cửa Sổ 1: Figma Control Panel (520x800)
    controller_url = WEB_OVERLAY_DIST.resolve().as_uri()

    controller_win = webview.create_window(
        title="OVERLAY POSTMATCH TFT - Studio Controller",
        url=controller_url,
        width=520,
        height=800,
        min_size=(460, 680),
        resizable=True,
        js_api=bridge,
        background_color="#09090b",
    )

    # 3. Tạo Cửa Sổ 2: Broadcast Overlay chuẩn 16:9 trên Windows Desktop
    overlay_html = OUTPUT_DIR / "overlay.html"
    overlay_url = overlay_html.resolve().as_uri()

    # Tính kích thước cửa sổ 16:9 vừa vặn với kích thước màn hình làm việc
    try:
        import ctypes
        user32 = ctypes.windll.user32
        screen_w = user32.GetSystemMetrics(0)
        overlay_w = max(1280, min(1920, int(screen_w * 0.85)))
        overlay_h = int(overlay_w * 9 / 16)
    except Exception:
        overlay_w, overlay_h = 1600, 900

    overlay_win = webview.create_window(
        title="TFT Broadcast Overlay (1920x1080 Responsive)",
        url=overlay_url,
        width=overlay_w,
        height=overlay_h,
        resizable=True,
        hidden=True,  # Ẩn mặc định, tự động hiện khi nhấn Render hoặc nút Show
        background_color="#043933",
    )

    # Liên kết cửa sổ với bridge
    bridge.set_windows(dashboard=controller_win, overlay=overlay_win)

    # Xử lý đóng ứng dụng sạch sẽ khi đóng bảng điều khiển
    def on_closed():
        logger.info("Terminating runtime processes")
        try:
            overlay_win.destroy()
        except Exception:
            pass

    controller_win.events.closed += on_closed

    # 4. Khởi động PyWebView với nhân Edge Chromium (WebView2) không cần local HTTP server
    try:
        webview.start(
            debug=False,
            gui="edgechromium",
            http_server=False,
        )
    except Exception as e:
        logger.warning("Fallback to default GUI engine: %s", e)
        webview.start(debug=False, http_server=False)


if __name__ == "__main__":
    main()
