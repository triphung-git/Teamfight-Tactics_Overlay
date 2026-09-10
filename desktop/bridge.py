"""
desktop/bridge.py
-----------------
Cầu nối IPC 2 chiều giữa Giao diện React (Figma Landing Page) và Logic Python.
Cung cấp các hàm API được gọi trực tiếp từ `window.pywebview.api`.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
from pathlib import Path
from typing import Any, Optional

import webview

from backend.config import AppConfig, load_overlay_config, save_overlay_config
from backend.export_service import export_html_to_png
from backend.match_service import MatchService
from backend.overlay_generator import generate_overlay_html, load_overlay_config as load_generator_config

logger = logging.getLogger("bridge")

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "output"
ASSETS_DIR = BASE_DIR / "assets"
AVATARS_DIR = ASSETS_DIR / "avatars"

DEFAULT_TRANSFORM = {
    "posX": 0,
    "posY": 0,
    "rotX": 0,
    "rotY": 0,
    "rotZ": 0,
    "zoomX": 100,
    "zoomY": 100,
    "cropTop": 0,
    "cropBottom": 0,
    "cropLeft": 0,
    "cropRight": 0,
}


class StudioBridge:
    """API Object được truyền vào pywebview."""

    def __init__(self, match_service: MatchService) -> None:
        self._match_service = match_service
        self._dashboard_window: Optional[webview.Window] = None
        self._overlay_window: Optional[webview.Window] = None
        self._is_overlay_visible: bool = False

        # Khởi tạo thư mục avatars nếu chưa có
        AVATARS_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Cấu hình callback Auto-polling đẩy dữ liệu về Frontend
        self._setup_polling_callback()

    def set_windows(
        self, dashboard: webview.Window, overlay: Optional[webview.Window] = None
    ) -> None:
        self._dashboard_window = dashboard
        self._overlay_window = overlay

    def _setup_polling_callback(self) -> None:
        def on_new_match(match: dict[str, Any]) -> None:
            logger.info("New match detected: %s", match.get("match_id"))
            self.notify_frontend(
                "onAppStateUpdate",
                {
                    "active_match": match,
                    "cached_matches": self._match_service.cached_matches,
                },
            )

        self._on_new_match_cb = on_new_match

    def notify_frontend(self, func_name: str, data: Any) -> None:
        """Đẩy sự kiện từ Python vào Frontend Javascript an toàn (tránh deadlock cửa sổ ẩn)."""
        js_data = json.dumps(data, ensure_ascii=False)
        script = f"if (window.{func_name}) {{ window.{func_name}({js_data}); }}"

        for win in (self._dashboard_window, self._overlay_window):
            if win:
                # Tuyệt đối không gọi evaluate_js lên cửa sổ overlay khi đang ẩn để tránh Deadlock Semaphore
                if win == self._overlay_window and not self._is_overlay_visible:
                    continue
                try:
                    win.evaluate_js(script)
                except Exception as e:
                    logger.debug("Không thể evaluate JS trên window: %s", e)

    # ----------------------------------------------------------------- #
    # Các hàm API chuyên dụng cho Figma Control Panel (SourceTransformPanel)
    # ----------------------------------------------------------------- #
    def get_transform(self) -> dict[str, Any]:
        """Lấy cấu hình transform hiện tại để nạp vào giao diện điều khiển."""
        cfg = load_overlay_config()
        saved = cfg.get("overlay_transform", {})
        merged = dict(DEFAULT_TRANSFORM)
        if isinstance(saved, dict):
            merged.update(saved)
        return merged

    def render_overlay(self, transform: dict[str, Any]) -> dict[str, Any]:
        """
        Xử lý khi người dùng nhấn nút 'Render' trên giao diện:
        Ưu tiên Cách C:
          1. Thử lấy trận đấu mới nhất qua Live Riot API bằng key trong .env.
          2. Nếu lỗi kết nối/hết hạn key/offline, tự động fallback sang file JSON có sẵn
             (clean_matches_bí_ẹo_0602.json hoặc clean_matches_latest.json).
          3. Cập nhật tỉ lệ, vị trí và crop vào overlay_config.json.
          4. Sinh file output/overlay.html chuẩn 1920x1080.
          5. Xuất ảnh output/overlay_latest.png chuẩn phát sóng (1920x1080).
          6. Hiển thị / Nạp lại trực tiếp lên Cửa Sổ Overlay trên Desktop Windows.
        """
        logger.info("Starting overlay render")

        # 1. Lưu cấu hình transform mới
        current_cfg = load_overlay_config()
        current_cfg["overlay_transform"] = transform
        save_overlay_config(current_cfg)

        match_data = None
        match_id = "N/A"
        mode = "Riot Live API"

        # 2. ƯU TIÊN CÁCH C: Thử Live Riot API trước
        cfg = AppConfig.load()
        if cfg.api_key and cfg.api_key.strip():
            try:
                logger.info("Fetching account %s#%s", cfg.game_name, cfg.tag_line)
                matches = self._match_service.fetch_recent_matches(
                    game_name=cfg.game_name,
                    tag_line=cfg.tag_line,
                    region=cfg.region,
                    count=1,
                )
                if matches:
                    match_data = matches[0]
                    match_id = match_data.get("match_id", "LIVE_MATCH")
            except Exception as exc:
                logger.warning("Riot API unavailable: %s (falling back to offline cache)", exc)
                match_data = None

        # 3. Fallback Offline: Đọc dữ liệu từ file JSON có sẵn nếu API thất bại
        if not match_data:
            mode = "Fallback Offline"
            candidates = [
                OUTPUT_DIR / "clean_matches_latest.json",
                OUTPUT_DIR / "clean_matches_bí_ẹo_0602.json",
            ]
            for cand in candidates:
                if cand.exists():
                    try:
                        with open(cand, "r", encoding="utf-8") as f:
                            cand_list = json.load(f)
                            if cand_list:
                                # Ưu tiên trận có Top 1
                                for m in cand_list:
                                    t1 = next(
                                        (p for p in m.get("lobby", []) if p.get("placement") == 1),
                                        None,
                                    )
                                    if t1:
                                        match_data = m
                                        break
                                if not match_data:
                                    match_data = cand_list[0]

                                match_id = match_data.get("match_id", cand.stem)
                                logger.info("Match loaded from cache: %s (%s)", match_id, cand.name)
                                break
                    except Exception as e:
                        logger.warning("Failed to read cache file %s: %s", cand.name, e)

        if not match_data:
            logger.error("No match data available to render")
            return {
                "success": False,
                "error": "Không thể lấy dữ liệu trận từ Riot API và không tìm thấy file offline.",
            }

        # 4. Sinh file HTML Overlay chuẩn
        output_html = OUTPUT_DIR / "overlay.html"
        gen_cfg = load_generator_config(BASE_DIR / "overlay_config.json")
        gen_cfg["overlay_transform"] = transform
        generate_overlay_html(match_data, gen_cfg, output_html)

        # 5. Xuất ảnh PNG 1920x1080 ngầm bằng luồng riêng (Background Daemon Thread)
        # giúp Cửa Sổ Overlay xuất hiện tức thì mà không bị khựng chờ Chrome headless
        output_png = OUTPUT_DIR / "overlay_latest.png"
        threading.Thread(
            target=export_html_to_png,
            args=(output_html, output_png, 1920, 1080),
            daemon=True,
        ).start()

        # 6. Hiển thị / Nạp lại Cửa Sổ Overlay trên Desktop Windows
        if self._overlay_window:
            try:
                self._overlay_window.load_url(output_html.resolve().as_uri())
                self._overlay_window.show()
                self._is_overlay_visible = True
                logger.info("Overlay updated")
            except Exception as e:
                logger.warning("Failed to update overlay window: %s", e)

        return {
            "success": True,
            "match_id": match_id,
            "mode": mode,
            "png_path": str(output_png.resolve()),
        }

    def toggle_overlay_visibility(self, visible: bool) -> bool:
        """Bật/tắt hiển thị Cửa sổ Overlay từ nút Hide/Show."""
        if self._overlay_window:
            if visible:
                self._overlay_window.show()
                self._is_overlay_visible = True
            else:
                self._overlay_window.hide()
                self._is_overlay_visible = False
            return self._is_overlay_visible
        return False

    def close_panel(self) -> None:
        """Đóng ứng dụng điều khiển."""
        logger.info("Closing studio controller")
        if self._dashboard_window:
            self._dashboard_window.destroy()

    # ----------------------------------------------------------------- #
    # Các hàm API bổ trợ mở rộng
    # ----------------------------------------------------------------- #
    def get_app_state(self) -> dict[str, Any]:
        """Trả về toàn bộ trạng thái hiện tại của ứng dụng."""
        cfg = AppConfig.load()
        overlay_cfg = load_overlay_config()

        cached = self._match_service.cached_matches
        if not cached:
            latest_cache = OUTPUT_DIR / "clean_matches_latest.json"
            if not latest_cache.exists():
                fallback_files = list(OUTPUT_DIR.glob("clean_matches_*.json"))
                if fallback_files:
                    latest_cache = fallback_files[0]

            if latest_cache.exists():
                try:
                    with open(latest_cache, "r", encoding="utf-8") as f:
                        cached = json.load(f)
                        self._match_service.cached_matches = cached
                        if cached and not self._match_service.active_match:
                            self._match_service.active_match = cached[0]
                except Exception as e:
                    logger.warning("Không thể đọc cache: %s", e)

        return {
            "config": cfg.to_dict(),
            "overlay_config": overlay_cfg,
            "cached_matches": cached,
            "active_match": self._match_service.active_match,
            "is_polling": self._match_service.is_polling_active(),
            "is_overlay_visible": self._is_overlay_visible,
        }

    def save_app_config(self, config_data: dict[str, Any]) -> dict[str, Any]:
        """Lưu cấu hình Riot API vào file .env."""
        try:
            AppConfig.save_env_values(config_data)
            new_cfg = AppConfig.load()
            self._match_service.config = new_cfg
            return {"success": True, "config": new_cfg.to_dict()}
        except Exception as e:
            logger.error("Failed to save config: %s", e)
            return {"success": False, "error": str(e)}

    def save_overlay_config(self, overlay_data: dict[str, Any]) -> dict[str, Any]:
        """Lưu cấu hình hiển thị giải đấu."""
        try:
            updated = save_overlay_config(overlay_data)
            self.notify_frontend("onAppStateUpdate", {"overlay_config": updated})
            return {"success": True, "overlay_config": updated}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_overlay_transform(self, transform_data: dict[str, Any]) -> dict[str, Any]:
        """Cập nhật tỉ lệ, vị trí và crop cho Overlay."""
        current = load_overlay_config()
        current["overlay_transform"] = transform_data
        save_overlay_config(current)
        self.notify_frontend("onAppStateUpdate", {"overlay_config": current})
        return {"success": True}

    def fetch_matches(self, count: int = 5) -> list[dict[str, Any]]:
        """Lấy danh sách các trận gần nhất từ Riot API và báo cáo tiến trình."""
        cfg = AppConfig.load()

        def on_progress(pct: int, status_text: str) -> None:
            self.notify_frontend("onProgressUpdate", {"pct": pct, "status": status_text})

        try:
            matches = self._match_service.fetch_recent_matches(
                game_name=cfg.game_name,
                tag_line=cfg.tag_line,
                region=cfg.region,
                count=count,
                progress_callback=on_progress,
            )
            self.notify_frontend(
                "onAppStateUpdate",
                {
                    "cached_matches": matches,
                    "active_match": self._match_service.active_match,
                },
            )
            return matches
        except Exception as exc:
            logger.error("Failed to fetch matches: %s", exc)
            raise exc

    def set_active_match(self, match_id: str) -> Optional[dict[str, Any]]:
        """Chọn trận đấu muốn hiển thị trên Overlay."""
        active = self._match_service.set_active_match_by_id(match_id)
        if active:
            self.notify_frontend("onAppStateUpdate", {"active_match": active})
        return active

    def toggle_overlay(self) -> bool:
        """Bật/tắt ẩn hiện cửa sổ Overlay Window."""
        if not self._overlay_window:
            return False

        if self._is_overlay_visible:
            self._overlay_window.hide()
            self._is_overlay_visible = False
        else:
            self._overlay_window.show()
            self._is_overlay_visible = True

        self.notify_frontend(
            "onAppStateUpdate", {"is_overlay_visible": self._is_overlay_visible}
        )
        return self._is_overlay_visible

    def show_overlay(self) -> None:
        if self._overlay_window:
            self._overlay_window.show()
            self._is_overlay_visible = True
            self.notify_frontend("onAppStateUpdate", {"is_overlay_visible": True})

    def hide_overlay(self) -> None:
        if self._overlay_window:
            self._overlay_window.hide()
            self._is_overlay_visible = False
            self.notify_frontend("onAppStateUpdate", {"is_overlay_visible": False})

    def export_png(self) -> dict[str, Any]:
        """Xuất ảnh PNG 1920x1080 chuẩn chất lượng phát sóng."""
        output_png = OUTPUT_DIR / "overlay_latest.png"
        html_file = OUTPUT_DIR / "overlay.html"

        if not html_file.exists():
            cfg = load_generator_config(BASE_DIR / "overlay_config.json")
            m = self._match_service.active_match
            if not m and self._match_service.cached_matches:
                m = self._match_service.cached_matches[0]
            if m:
                generate_overlay_html(m, cfg, html_file)

        ok = export_html_to_png(html_file, output_png, width=1920, height=1080)
        if ok:
            return {"success": True, "path": str(output_png.resolve())}
        else:
            return {"success": False, "error": "Không thể kết xuất ảnh PNG."}

    def set_auto_polling(self, enabled: bool, interval: int = 60) -> bool:
        """Bật/Tắt luồng quét ngầm phát hiện trận đấu mới."""
        if enabled:
            ok = self._match_service.start_auto_polling(
                interval_seconds=interval, on_new_match_callback=self._on_new_match_cb
            )
        else:
            ok = self._match_service.stop_auto_polling()

        is_p = self._match_service.is_polling_active()
        self.notify_frontend("onAppStateUpdate", {"is_polling": is_p})
        return is_p

    def pick_avatar_file(self, player_name: str) -> dict[str, Any]:
        """Mở hộp thoại chọn file ảnh trên Windows và gán cho tuyển thủ."""
        if not self._dashboard_window:
            return {"success": False, "error": "Cửa sổ chưa khởi tạo"}

        file_types = ("Image Files (*.png;*.jpg;*.jpeg;*.webp)", "All files (*.*)")
        result = self._dashboard_window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types
        )

        if result and len(result) > 0:
            chosen_path = Path(result[0])
            if chosen_path.exists():
                clean_name = "".join(c if c.isalnum() else "_" for c in player_name).lower()
                dest_file = AVATARS_DIR / f"{clean_name}{chosen_path.suffix}"
                shutil.copy2(chosen_path, dest_file)

                rel_path = f"assets/avatars/{dest_file.name}"
                cfg = load_overlay_config()
                if "player_avatars" not in cfg:
                    cfg["player_avatars"] = {}
                cfg["player_avatars"][player_name] = rel_path
                save_overlay_config(cfg)

                self.notify_frontend("onAppStateUpdate", {"overlay_config": cfg})
                return {"success": True, "path": rel_path}

        return {"success": False, "canceled": True}
