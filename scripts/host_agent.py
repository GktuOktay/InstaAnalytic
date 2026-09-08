#!/usr/bin/env python3
"""
InstaAnalytic Host Agent — Tek seferlik başlatılır, arka planda çalışır.
Backend Docker container'ına tarayıcı cookie'lerine erişim sağlar.

macOS/Linux:  python3 scripts/host_agent.py &
Windows:      start.ps1 otomatik yönetir
"""

import argparse
import json
import os
import platform
import secrets
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 8002
HOST = "127.0.0.1"

# Secret token — ilk çalıştırmada üretilir, .host_agent_secret dosyasına kaydedilir
_SECRET_FILE = Path(os.path.expanduser("~/.instaanalytic_agent_secret"))


def _load_or_create_secret() -> str:
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    token = secrets.token_hex(32)
    _SECRET_FILE.write_text(token)
    _SECRET_FILE.chmod(0o600)
    return token


AGENT_SECRET = _load_or_create_secret()

EXTRA_COOKIE_KEYS = ["csrftoken", "ds_user_id", "mid", "ig_did", "rur"]

_SYSTEM = platform.system()   # "Darwin" | "Linux" | "Windows"

try:
    import browser_cookie3
except ImportError:
    print("HATA: browser-cookie3 yüklü değil.")
    print("  pip install browser-cookie3 pycryptodome" + (" pywin32" if _SYSTEM == "Windows" else ""))
    sys.exit(1)

# Tarayıcı listesi — (görünen ad, browser_cookie3 fn adı, sadece bu OS | None=hepsi)
_ALL_BROWSERS = [
    ("Chrome",    "chrome",    None),
    ("Brave",     "brave",     None),
    ("Edge",      "edge",      None),
    ("Firefox",   "firefox",   None),
    ("Opera",     "opera",     None),
    ("Opera GX",  "opera_gx",  None),
    ("Chromium",  "chromium",  None),
    ("Vivaldi",   "vivaldi",   None),
    ("LibreWolf", "librewolf", None),
    ("Arc",       "arc",       "Darwin"),    # macOS/Linux
    ("Safari",    "safari",    "Darwin"),    # macOS only
]

BROWSERS = []
for _name, _fn_name, _only_on in _ALL_BROWSERS:
    if _only_on and _SYSTEM != _only_on:
        continue
    _fn = getattr(browser_cookie3, _fn_name, None)
    if _fn:
        BROWSERS.append((_name, _fn))

# Platform'a göre User-Agent
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    if _SYSTEM == "Windows" else
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def parse_user_id_from_sessionid(sessionid: str) -> str | None:
    try:
        decoded = urllib.parse.unquote(sessionid)
        parts = decoded.split(":")
        if parts and parts[0].isdigit():
            return parts[0]
    except Exception:
        pass
    return None


def scan_cookies() -> tuple[list[dict], list[str]]:
    """Tüm tarayıcılarda Instagram session'larını tara. (sessions, errors) döner."""
    found = []
    seen = set()
    errors = []

    for browser_name, loader in BROWSERS:
        try:
            jar = loader(domain_name="instagram.com")
            cookies = {c.name: c.value for c in jar}
            cookies = {k: v for k, v in cookies.items() if v}
            if "sessionid" not in cookies:
                continue
            sid = cookies["sessionid"]
            uid = cookies.get("ds_user_id") or parse_user_id_from_sessionid(sid)
            if not uid or uid in seen:
                continue
            seen.add(uid)
            extra = {k: cookies[k] for k in EXTRA_COOKIE_KEYS if k in cookies}
            found.append({
                "session_id_cookie": sid,
                "extra_cookies": extra,
                "browser": browser_name,
                "user_id": uid,
            })
            print(f"  ✓ {browser_name}: uid={uid}")
        except Exception as e:
            err_str = str(e)
            print(f"  {browser_name}: {err_str}")
            low = err_str.lower()

            is_permission = any(k in low for k in (
                "keychain", "password", "decrypt", "permission",
                "denied", "locked", "dpapi", "access", "erişim",
            ))
            is_not_installed = any(k in low for k in (
                "no such file", "not found", "cannot find", "does not exist",
                "filenotfound", "no module",
            ))

            if is_permission:
                if _SYSTEM == "Darwin":
                    errors.append(
                        f"{browser_name}: Keychain erişimi reddedildi.\n"
                        "→ Çözüm: Sistem Ayarları → Gizlilik ve Güvenlik → "
                        "Tam Disk Erişimi → InstaAnalytic'i ekle\n"
                        "→ Alternatif: Tarayıcıyı tamamen kapatıp tekrar deneyin."
                    )
                elif _SYSTEM == "Windows":
                    errors.append(
                        f"{browser_name}: Cookie şifresi çözülemiyor (DPAPI hatası).\n"
                        "→ Çözüm: Uygulamayı oturum açtığınız Windows kullanıcısıyla çalıştırın.\n"
                        "→ Alternatif: Uygulamayı 'Yönetici olarak çalıştır' seçeneğiyle açmayın."
                    )
                else:
                    errors.append(f"{browser_name}: Cookie erişimi reddedildi: {err_str}")
            elif is_not_installed:
                # Tarayıcı kurulu değil — sessizce atla, hata sayma
                print(f"  {browser_name}: kurulu değil, atlanıyor.")
            else:
                # Beklenmedik hata — kısa bilgi ver, stack trace gösterme
                errors.append(f"{browser_name}: Beklenmedik hata — {err_str[:120]}")
    return found, errors


def resolve_username(session_id_cookie: str, extra_cookies: dict, user_id: str) -> str | None:
    """Host makineden (Docker NAT olmadan) Instagram username'i çek."""
    import urllib.request
    import re
    import ssl

    cookies = {"sessionid": session_id_cookie, **extra_cookies}
    cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())

    # Windows: sistem sertifika mağazasını kullan, yoksa certifi'ye düş
    ctx = ssl.create_default_context()
    if _SYSTEM == "Windows":
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            # certifi yoksa sistem mağazasını dene; başarısız olursa doğrulamayı kapat
            try:
                ctx = ssl.create_default_context()
            except Exception:
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE

    def _get(url: str) -> bytes | None:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _UA,
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
                "Cookie": cookie_header,
                "X-IG-App-ID": "936619743392459",
                "X-Requested-With": "XMLHttpRequest",
            })
            with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                return resp.read()
        except Exception as e:
            print(f"  resolve {url}: {e}")
            return None

    # 1. Ana sayfa HTML'inden parse
    html = _get("https://www.instagram.com/")
    if html:
        m = re.search(rb'"username":"([^"]{3,30})"', html)
        if m:
            return m.group(1).decode()

    # 2. API endpoint
    data_raw = _get("https://www.instagram.com/api/v1/accounts/current_user/?edit=true")
    if data_raw:
        try:
            data = json.loads(data_raw)
            if data.get("user", {}).get("username"):
                return data["user"]["username"]
        except Exception:
            pass

    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[host_agent] {fmt % args}")

    def _headers(self, status: int, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        # Yalnızca localhost'tan gelen isteklere izin ver
        origin = self.headers.get("Origin", "")
        if origin in ("http://localhost:8002", "http://127.0.0.1:8002", ""):
            self.send_header("Access-Control-Allow-Origin", origin or "http://127.0.0.1:8002")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Agent-Secret")
        self.end_headers()

    def _is_authorized(self) -> bool:
        token = self.headers.get("X-Agent-Secret", "")
        return secrets.compare_digest(token, AGENT_SECRET)

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/health":
            # Health endpoint: token gerektirmez (backend bağlantı kontrolü için)
            self._headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "platform": _SYSTEM,
                "secret_file": str(_SECRET_FILE),
            }).encode())
        else:
            self._headers(404)
            self.wfile.write(b'{"error":"not found"}')

    def do_POST(self):
        if not self._is_authorized():
            self._headers(401)
            self.wfile.write(b'{"error":"unauthorized"}')
            return

        if self.path == "/scan":
            sessions, errors = [], []
            try:
                sessions, errors = scan_cookies()
            except Exception as e:
                errors.append(str(e))

            for s in sessions:
                if not s.get("username"):
                    s["username"] = resolve_username(
                        s["session_id_cookie"],
                        s.get("extra_cookies", {}),
                        s.get("user_id", ""),
                    )

            self._headers(200)
            self.wfile.write(json.dumps({
                "sessions": sessions,
                "errors": errors,
                "scanned_browsers": [name for name, _ in BROWSERS],
                "platform": _SYSTEM,
            }).encode())

        elif self.path == "/resolve-username":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            username = resolve_username(
                body.get("session_id_cookie", ""),
                body.get("extra_cookies", {}),
                body.get("user_id", ""),
            )
            self._headers(200)
            self.wfile.write(json.dumps({"username": username}).encode())

        else:
            self._headers(404)
            self.wfile.write(b'{"error":"not found"}')


def _install_autostart():
    """Platform'a göre otomatik başlatma kur."""
    if _SYSTEM == "Darwin":
        label = "com.instaanalytic.host-agent"
        plist_path = os.path.expanduser(f"~/Library/LaunchAgents/{label}.plist")
        bin_path = os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__)
        args = [bin_path] if getattr(sys, "frozen", False) else [sys.executable, bin_path]
        plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>{label}</string>
    <key>ProgramArguments</key>
    <array>{"".join(f"<string>{a}</string>" for a in args)}</array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>{os.path.expanduser("~/Library/Logs/InstaAnalytic/host-agent.log")}</string>
    <key>StandardErrorPath</key><string>{os.path.expanduser("~/Library/Logs/InstaAnalytic/host-agent.log")}</string>
</dict></plist>"""
        os.makedirs(os.path.dirname(plist_path), exist_ok=True)
        os.makedirs(os.path.expanduser("~/Library/Logs/InstaAnalytic"), exist_ok=True)
        with open(plist_path, "w") as f:
            f.write(plist)
        os.system(f"launchctl unload '{plist_path}' 2>/dev/null; launchctl load '{plist_path}'")
        print(f"✓ LaunchAgent kuruldu: {plist_path}")

    elif _SYSTEM == "Linux":
        service_dir = os.path.expanduser("~/.config/systemd/user")
        os.makedirs(service_dir, exist_ok=True)
        bin_path = os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__)
        exec_line = bin_path if getattr(sys, "frozen", False) else f"{sys.executable} {bin_path}"
        log_dir = os.path.expanduser("~/.local/share/instaanalytic/logs")
        os.makedirs(log_dir, exist_ok=True)
        service = f"""[Unit]
Description=InstaAnalytic Host Agent
After=network.target

[Service]
ExecStart={exec_line}
Restart=always
RestartSec=5
StandardOutput=append:{log_dir}/host-agent.log
StandardError=append:{log_dir}/host-agent.log

[Install]
WantedBy=default.target
"""
        svc_path = os.path.join(service_dir, "instaanalytic-host-agent.service")
        with open(svc_path, "w") as f:
            f.write(service)
        os.system("systemctl --user daemon-reload")
        os.system("systemctl --user enable instaanalytic-host-agent.service")
        os.system("systemctl --user start  instaanalytic-host-agent.service")
        print(f"✓ systemd service kuruldu: {svc_path}")

    elif _SYSTEM == "Windows":
        import subprocess
        bin_path = os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__)
        task_name = "InstaAnalytic\\HostAgent"
        subprocess.run([
            "schtasks", "/create", "/f",
            "/tn", task_name,
            "/tr", bin_path,
            "/sc", "ONLOGON",
            "/rl", "HIGHEST",
        ], check=False)
        subprocess.run(["schtasks", "/run", "/tn", task_name], check=False)
        print(f"✓ Task Scheduler kuruldu: {task_name}")


def main():
    parser = argparse.ArgumentParser(description="InstaAnalytic Host Agent")
    parser.add_argument("--install-autostart", action="store_true",
                        help="Otomatik başlatmayı kur (LaunchAgent/systemd/Task Scheduler)")
    args = parser.parse_args()

    if args.install_autostart:
        _install_autostart()
        return

    server = HTTPServer((HOST, PORT), Handler)
    print(f"InstaAnalytic Host Agent [{_SYSTEM}] — http://{HOST}:{PORT}")
    print("Durdurmak için Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDurduruluyor...")


if __name__ == "__main__":
    main()
