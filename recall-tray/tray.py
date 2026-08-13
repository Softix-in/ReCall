#!/usr/bin/env python3
"""Recall system tray for macOS and Linux. Windows uses windows-tray.ps1."""

from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

API_BASE = "http://127.0.0.1:7878"
ROOT = Path(__file__).resolve().parent.parent
LOGS_DIR = Path.home() / ".recall" / "logs"
SEARCH_PAGE = ROOT / "recall-extension" / "search" / "search.html"

paused = False
pause_item = None


def get_status():
    try:
        with urllib.request.urlopen(f"{API_BASE}/status", timeout=3) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def post_queue_action(action: str) -> bool:
    request = urllib.request.Request(
        f"{API_BASE}/queue/{action}",
        method="POST",
        data=b"",
    )
    try:
        with urllib.request.urlopen(request, timeout=3):
            return True
    except urllib.error.URLError:
        return False


def update_tooltip(icon) -> None:
    status = get_status()
    if not status:
        icon.title = "Recall — offline"
        return

    last_saved = status.get("lastSaved") or {}
    title = last_saved.get("title") or "No saves yet"
    queue_length = status.get("queueLength", 0)
    icon.title = f"Recall — queue: {queue_length} | {title}"


def open_search(_icon, _item) -> None:
    if SEARCH_PAGE.exists():
        webbrowser.open(SEARCH_PAGE.resolve().as_uri())
    else:
        webbrowser.open("chrome://extensions/")


def toggle_pause(_icon, item) -> None:
    global paused

    action = "resume" if paused else "pause"
    if not post_queue_action(action):
        return

    paused = not paused
    item.text = "Resume processing" if paused else "Pause processing"


def open_logs(_icon, _item) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(LOGS_DIR)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        subprocess.Popen(["xdg-open", str(LOGS_DIR)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def poll_status(icon) -> None:
    while getattr(icon, "visible", True):
        update_tooltip(icon)
        time.sleep(5)


def create_icon_image():
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (64, 64), color=(66, 133, 244))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([14, 14, 50, 50], radius=8, fill=(255, 255, 255))
    return image


def main() -> None:
    import pystray

    global pause_item

    pause_item = pystray.MenuItem("Pause processing", toggle_pause)
    menu = pystray.Menu(
        pystray.MenuItem("Open Recall Search", open_search),
        pause_item,
        pystray.MenuItem("Open logs", open_logs),
        pystray.MenuItem("Exit", lambda icon, _item: icon.stop()),
    )

    icon = pystray.Icon("recall", create_icon_image(), "Recall", menu)
    icon.visible = True

    thread = threading.Thread(target=poll_status, args=(icon,), daemon=True)
    thread.start()
    icon.run()


if __name__ == "__main__":
    main()
