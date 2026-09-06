#!/usr/bin/env python3
"""
Instapp Host Agent — Tek seferlik başlatılır, arka planda çalışır.
Backend Docker container'ına tarayıcı cookie'lerine erişim sağlar.

Kurulum (bir kez):
    pip3 install -r scripts/requirements.txt

Başlatma (arka planda):
    python3 scripts/host_agent.py &

Veya LaunchAgent ile otomatik başlatma:
    python3 scripts/host_agent.py --install-launchagent
"""

import argparse
import json
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8002
HOST = "127.0.0.1"
CORS_ORIGIN = "http://localhost:3002"

EXTRA_COOKIE_KEYS = ["csrftoken", "ds_user_id", "mid", "ig_did", "rur"]

try:
    import browser_cookie3
    BROWSERS = [
        ("Chrome",  browser_cookie3.chrome),
        ("Firefox", browser_cookie3.firefox),
        ("Safari",  browser_cookie3.safari),
    ]
except ImportError:
    print("HATA: browser-cookie3 yüklü değil.")
    print("  pip3 install -r scripts/requirements.txt")
    sys.exit(1)


def parse_user_id_from_sessionid(sessionid: str) -> str | None:
    try:
        decoded = urllib.parse.unquote(sessionid)
        parts = decoded.split(":")
        if parts and parts[0].isdigit():
            return parts[0]
    except Exception:
        pass
    return None


def scan_cookies() -> list[dict]:
    """Tüm tarayıcılarda Instagram session'larını tara."""
    found = []
    seen = set()
    for browser_name, loader in BROWSERS:
        try:
            jar = loader(domain_name="instagram.com")
            cookies = {c.name: c.value for c in jar}
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
        except Exception as e:
            print(f"  {browser_name}: {e}")
    return found


def resolve_username(session_id_cookie: str, extra_cookies: dict, user_id: str) -> str | None:
    """Host makineden (Docker NAT olmadan) Instagram username'i çek."""
    import urllib.request, re
    cookies = {"sessionid": session_id_cookie, **extra_cookies}
    cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    # 1. Ana sayfa HTML'inden username parse et
    try:
        req = urllib.request.Request("https://www.instagram.com/", headers={
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9",
            "Cookie": cookie_header,
        })
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        m = re.search(r'"username":"([^"]{3,30})"', html)
        if m:
            return m.group(1)
    except Exception as e:
        print(f"  resolve_username homepage: {e}")

    # 2. API v1 current_user (bazı hesaplarda çalışır)
    try:
        req2 = urllib.request.Request(
            "https://www.instagram.com/api/v1/accounts/current_user/?edit=true",
            headers={
                "User-Agent": ua,
                "X-IG-App-ID": "936619743392459",
                "X-Requested-With": "XMLHttpRequest",
                "Cookie": cookie_header,
            }
        )
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            data = json.loads(resp2.read())
        if data.get("user", {}).get("username"):
            return data["user"]["username"]
    except Exception as e:
        print(f"  resolve_username api: {e}")

    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[host_agent] {fmt % args}")

    def _headers(self, status: int, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/health":
            self._headers(200)
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self._headers(404)
            self.wfile.write(b'{"error":"not found"}')

    def do_POST(self):
        if self.path == "/scan":
            sessions = scan_cookies()
            # Her session için username'i de çek
            for s in sessions:
                if not s.get("username"):
                    uname = resolve_username(
                        s["session_id_cookie"],
                        s.get("extra_cookies", {}),
                        s.get("user_id", ""),
                    )
                    s["username"] = uname
            self._headers(200)
            self.wfile.write(json.dumps({"sessions": sessions}).encode())
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


def install_launchagent():
    """macOS LaunchAgent oluştur — login'de otomatik başlat."""
    label = "com.instapp.host-agent"
    plist_path = os.path.expanduser(f"~/Library/LaunchAgents/{label}.plist")
    script_path = os.path.abspath(__file__)
    python_path = sys.executable

    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python_path}</string>
        <string>{script_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/instapp-host-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/instapp-host-agent.log</string>
</dict>
</plist>"""

    os.makedirs(os.path.dirname(plist_path), exist_ok=True)
    with open(plist_path, "w") as f:
        f.write(plist)
    os.system(f"launchctl load '{plist_path}'")
    print(f"✓ LaunchAgent kuruldu: {plist_path}")
    print(f"  Host agent şimdi arka planda çalışıyor (port {PORT}).")
    print(f"  Loglar: /tmp/instapp-host-agent.log")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--install-launchagent", action="store_true",
                        help="macOS LaunchAgent oluştur ve başlat")
    args = parser.parse_args()

    if args.install_launchagent:
        install_launchagent()
        return

    server = HTTPServer((HOST, PORT), Handler)
    print(f"Instapp Host Agent — http://{HOST}:{PORT}")
    print("Durdurmak için Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDurduruluyor...")


if __name__ == "__main__":
    main()
