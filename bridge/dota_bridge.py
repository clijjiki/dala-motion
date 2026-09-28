"""
DALA Motion — мост «браузер → Windows» для управления Dota 2 жестами.

Браузер распознаёт руку через веб-камеру и шлёт сюда короткие команды
(«курсор сюда», «правый клик», «нажми Q», «камера влево»),
а этот скрипт превращает их в настоящие движения мыши и нажатия клавиш.

Запуск:   python bridge/dota_bridge.py   (сам откроет сайт на http://127.0.0.1:8765)
Нужно:    Windows + Python 3.8+. Никаких сторонних библиотек.

Помощник ещё и раздаёт сам сайт: так страница и мост живут на одном адресе,
и браузер не блокирует запросы к локальной сети (с https-сайта он бы их заблокировал).
Стоп:     F8 — пауза/продолжить, Ctrl+C в консоли — выход.

Слушает только 127.0.0.1 — с других компьютеров к нему подключиться нельзя.
"""
import ctypes
import json
import sys
import threading
import time
import webbrowser
from ctypes import wintypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST, PORT = "127.0.0.1", 8765
SITE_DIR = Path(__file__).resolve().parent.parent  # корень проекта с index.html

if sys.platform != "win32":
    sys.exit("Мост работает только на Windows.")

user32 = ctypes.WinDLL("user32", use_last_error=True)
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # реальные пиксели при масштабе 125%/150%
except Exception:
    user32.SetProcessDPIAware()

# ---------- SendInput ----------
ULONG_PTR = ctypes.c_size_t
INPUT_MOUSE, INPUT_KEYBOARD = 0, 1
MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP = 0x0002, 0x0004
MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP = 0x0008, 0x0010
KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE = 0x0001, 0x0002, 0x0008


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]


class _U(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", wintypes.DWORD), ("u", _U)]


def _send(*inputs):
    arr = (INPUT * len(inputs))(*inputs)
    user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT))


def mouse_button(down_flag, up_flag):
    _send(INPUT(type=INPUT_MOUSE, mi=MOUSEINPUT(dwFlags=down_flag)))
    time.sleep(0.012)
    _send(INPUT(type=INPUT_MOUSE, mi=MOUSEINPUT(dwFlags=up_flag)))


# Скан-коды: игры (и Dota 2) надёжнее принимают их, чем виртуальные коды.
EXTENDED = {"up": 0x48, "down": 0x50, "left": 0x4B, "right": 0x4D}
SPECIAL = {"space": 0x39, "tab": 0x0F, "esc": 0x01, "alt": 0x38, "ctrl": 0x1D, "shift": 0x2A}


def scan_of(key):
    key = key.lower()
    if key in EXTENDED:
        return EXTENDED[key], True
    if key in SPECIAL:
        return SPECIAL[key], False
    if len(key) == 1:
        vk = user32.VkKeyScanW(ord(key)) & 0xFF
        return user32.MapVirtualKeyW(vk, 0), False
    raise ValueError(f"неизвестная клавиша: {key}")


def key_event(key, up):
    sc, ext = scan_of(key)
    flags = KEYEVENTF_SCANCODE | (KEYEVENTF_EXTENDEDKEY if ext else 0) | (KEYEVENTF_KEYUP if up else 0)
    _send(INPUT(type=INPUT_KEYBOARD, ki=KEYBDINPUT(wScan=sc, dwFlags=flags)))


def key_tap(key):
    key_event(key, False)
    time.sleep(0.015)
    key_event(key, True)


# ---------- состояние ----------
SCREEN_W = user32.GetSystemMetrics(0)
SCREEN_H = user32.GetSystemMetrics(1)
lock = threading.Lock()
held = set()          # зажатые стрелки камеры
paused = False
last_cmd = time.time()
stats = {"commands": 0}


def set_cursor(x, y):
    px = int(max(0.0, min(1.0, x)) * (SCREEN_W - 1))
    py = int(max(0.0, min(1.0, y)) * (SCREEN_H - 1))
    user32.SetCursorPos(px, py)


def set_pan(x, y, thr=0.25):
    want = set()
    if x < -thr: want.add("left")
    if x > thr: want.add("right")
    if y < -thr: want.add("up")
    if y > thr: want.add("down")
    for k in held - want:
        key_event(k, True)
    for k in want - held:
        key_event(k, False)
    held.clear()
    held.update(want)


def release_all():
    set_pan(0, 0)


def handle(cmd):
    t = cmd.get("t")
    if t == "move":
        set_cursor(cmd["x"], cmd["y"])
    elif t == "rclick":
        if "x" in cmd:
            set_cursor(cmd["x"], cmd["y"])
        mouse_button(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP)
    elif t == "lclick":
        if "x" in cmd:
            set_cursor(cmd["x"], cmd["y"])
        mouse_button(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP)
    elif t == "key":
        key_tap(cmd["k"])
    elif t == "pan":
        set_pan(float(cmd.get("x", 0)), float(cmd.get("y", 0)))
    elif t == "release":
        release_all()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript"}

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/status"):
            self._json(200, {"ok": True, "paused": paused, "screen": [SCREEN_W, SCREEN_H], **stats})
        else:
            super().do_GET()  # файлы сайта

    def do_POST(self):
        global last_cmd
        if not self.path.startswith("/cmd"):
            return self._json(404, {"ok": False})
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"[]")
            cmds = data if isinstance(data, list) else [data]
            with lock:
                last_cmd = time.time()
                if not paused:
                    for c in cmds:
                        handle(c)
                        stats["commands"] += 1
            self._json(200, {"ok": True, "paused": paused})
        except Exception as e:  # noqa: BLE001 — отвечаем браузеру текстом ошибки
            self._json(400, {"ok": False, "error": str(e)})

    def log_message(self, *args):
        pass


def watchdog():
    """Если браузер замолчал (вкладку закрыли, рука пропала) — отпускаем все клавиши."""
    while True:
        time.sleep(0.2)
        with lock:
            if held and time.time() - last_cmd > 0.6:
                release_all()


def hotkeys():
    """F8 — пауза/продолжить. Работает, даже когда активно окно Доты."""
    global paused
    VK_F8 = 0x77
    was = False
    while True:
        time.sleep(0.05)
        down = bool(user32.GetAsyncKeyState(VK_F8) & 0x8000)
        if down and not was:
            with lock:
                paused = not paused
                release_all()
            print("⏸  ПАУЗА — жесты не управляют компьютером" if paused else "▶  Управление жестами включено")
        was = down


def main():
    threading.Thread(target=watchdog, daemon=True).start()
    threading.Thread(target=hotkeys, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), partial(Handler, directory=str(SITE_DIR)))
    print("=" * 60)
    print(" DALA Motion — мост к Dota 2 запущен")
    print(f" Адрес: http://{HOST}:{PORT}   Экран: {SCREEN_W}x{SCREEN_H}")
    print(f" Сайт: http://{HOST}:{PORT}/  — открываю в браузере, там «Режим Dota 2».")
    print(" F8 — пауза/продолжить.  Ctrl+C — выход.")
    print(" Совет: в Доте включи режим «Окно без рамки» (Borderless window).")
    print("=" * 60)
    if (SITE_DIR / "index.html").exists() and "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://{HOST}:{PORT}/")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        release_all()
        print("Мост остановлен.")


if __name__ == "__main__":
    main()
