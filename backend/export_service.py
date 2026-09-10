"""
backend/export_service.py
-------------------------
Dịch vụ xuất ảnh Overlay chuẩn 1920x1080 và quản lý OBS HTTP Server cục bộ.
"""

from __future__ import annotations

import http.server
import logging
import os
import shutil
import socketserver
import subprocess
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger("export_service")

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "output"


def find_browser_executable() -> Optional[str]:
    """Tìm đường dẫn trình duyệt Chrome hoặc Edge có sẵn trên Windows."""
    for name in ("chrome.exe", "msedge.exe", "chromium.exe"):
        found = shutil.which(name)
        if found:
            return found

    default_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in default_paths:
        if os.path.isfile(p):
            return p

    return None


def export_html_to_png(
    html_file: Path,
    output_png: Path,
    width: int = 1920,
    height: int = 1080,
) -> bool:
    """Sử dụng Headless Chromium kết xuất ảnh chuẩn xác."""
    browser_exe = find_browser_executable()
    if not browser_exe:
        logger.error("Không tìm thấy Chrome hoặc Edge trên hệ thống.")
        return False

    output_png.parent.mkdir(parents=True, exist_ok=True)
    html_uri = html_file.resolve().as_uri()

    cmd = [
        browser_exe,
        "--headless",
        f"--screenshot={output_png.resolve()}",
        f"--window-size={width},{height}",
        "--hide-scrollbars",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        html_uri,
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if output_png.exists() and output_png.stat().st_size > 10000:
            logger.info("PNG exported: %s (%d bytes)", output_png.name, output_png.stat().st_size)
            return True
        logger.error("Render failed: %s", res.stderr)
        return False
    except Exception as exc:
        logger.error("Render error: %s", exc)
        return False


class OBSServerManager:
    """Quản lý vòng đời máy chủ HTTP phục vụ OBS Browser Source."""

    def __init__(self, port: int = 8080) -> None:
        self.port = port
        self._server: Optional[socketserver.TCPServer] = None
        self._thread: Optional[threading.Thread] = None
        self._is_running = False

    def start(self, port: Optional[int] = None) -> bool:
        if self._is_running:
            return True

        if port:
            self.port = port

        class OBSHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(BASE_DIR), **kwargs)

            def end_headers(self) -> None:
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Access-Control-Allow-Origin", "*")
                super().end_headers()

            def do_GET(self) -> None:
                clean_path = self.path.split("?")[0].rstrip("/")
                if clean_path in ("", "/overlay"):
                    self.path = "/output/overlay.html"
                super().do_GET()

            def log_message(self, format: str, *args) -> None:
                pass  # Tắt log thừa

        class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
            daemon_threads = True

        try:
            self._server = ThreadedServer(("", self.port), OBSHandler)
            self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            self._thread.start()
            self._is_running = True
            logger.info("OBS HTTP server listening at http://localhost:%d/", self.port)
            return True
        except Exception as exc:
            logger.error("OBS HTTP server start failed on port %d: %s", self.port, exc)
            return False

    def stop(self) -> bool:
        if not self._is_running or not self._server:
            return False
        try:
            self._server.shutdown()
            self._server.server_close()
            self._is_running = False
            logger.info("OBS HTTP server stopped")
            return True
        except Exception as exc:
            logger.error("OBS HTTP server stop failed: %s", exc)
            return False

    def is_running(self) -> bool:
        return self._is_running
