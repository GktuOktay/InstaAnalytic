#!/usr/bin/env python3
"""
Instapp — Tarayıcı Session Tarayıcı (Otonom)
Host makinede çalışır. Chrome/Firefox/Safari'den Instagram session'ını okur,
backend'e kaydeder. Sıfır kullanıcı girişi gerektirir.

Kurulum (bir kez):
    pip3 install -r scripts/requirements.txt

Çalıştırma:
    python3 scripts/scan_session.py
"""

import sys
import time
import urllib.parse
import requests

API_URL = "http://localhost:8001/api"
MAX_BACKEND_WAIT = 60   # saniye — backend ayağa kalkana kadar bekle
RETRY_INTERVAL = 3


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
    print("Çalıştır: pip3 install -r scripts/requirements.txt")
    sys.exit(1)


# ── Yardımcı ──────────────────────────────────────────────────────────────────

def wait_for_backend():
    """Backend hazır olana kadar bekle."""
    deadline = time.time() + MAX_BACKEND_WAIT
    while time.time() < deadline:
        try:
            r = requests.get(f"{API_URL}/health", timeout=5)
            if r.status_code == 200:
                return True
        except requests.ConnectionError:
            pass
        print(f"  Backend bekleniyor… ({int(deadline - time.time())}s kaldı)")
        time.sleep(RETRY_INTERVAL)
    return False


def parse_user_id_from_sessionid(sessionid: str) -> str | None:
    """sessionid = '{user_id}%3A{token}' → user_id çıkar."""
    try:
        decoded = urllib.parse.unquote(sessionid)
        parts = decoded.split(":")
        if parts and parts[0].isdigit():
            return parts[0]
    except Exception:
        pass
    return None


def find_instagram_sessions() -> list[tuple[str, dict, str]]:
    """Tüm tarayıcılarda Instagram session ara. Birden fazla döner."""
    found = []
    seen_ids = set()
    for browser_name, loader in BROWSERS:
        try:
            jar = loader(domain_name="instagram.com")
            cookies = {c.name: c.value for c in jar}
            if "sessionid" not in cookies:
                continue
            sid = cookies["sessionid"]
            uid = cookies.get("ds_user_id") or parse_user_id_from_sessionid(sid)
            if uid in seen_ids:
                continue
            seen_ids.add(uid)
            extra = {k: cookies[k] for k in EXTRA_COOKIE_KEYS if k in cookies}
            found.append((sid, extra, browser_name))
            print(f"✓ {browser_name}'da Instagram session bulundu (uid={uid})")
        except Exception as e:
            print(f"  {browser_name}: erişilemedi ({e})")
    return found


def preview_session(sessionid: str, extra_cookies: dict) -> dict | None:
    """Backend üzerinden session önizle — kullanıcı adı + id döndür."""
    try:
        r = requests.post(
            f"{API_URL}/sessions/preview",
            json={"session_id_cookie": sessionid, "extra_cookies": extra_cookies},
            timeout=30,
        )
        if r.status_code == 200:
            return r.json()
        print(f"  Preview yanıt: {r.status_code} {r.text[:120]}")
    except Exception as e:
        print(f"  Preview hatası: {e}")
    return None


def register_session(ig_username: str, sessionid: str, extra_cookies: dict) -> bool:
    try:
        r = requests.post(
            f"{API_URL}/sessions",
            json={
                "ig_username": ig_username,
                "session_id_cookie": sessionid,
                "extra_cookies": extra_cookies,
            },
            timeout=30,
        )
        if r.status_code == 201:
            data = r.json()
            print(f"✓ Session kaydedildi: @{data['ig_username']} (ID: {str(data['id'])[:8]}…)")
            return True
        if r.status_code == 400 and "zaten kayıtlı" in r.text:
            print(f"✓ Session zaten kayıtlı.")
            return True
        print(f"✗ Backend hatası: {r.status_code} — {r.text[:200]}")
        return False
    except requests.ConnectionError:
        print("✗ Backend'e bağlanılamadı.")
        return False


# ── Ana akış ──────────────────────────────────────────────────────────────────

def main():
    print("=" * 52)
    print("  Instapp — Tarayıcı Session Tarayıcı")
    print("=" * 52)
    print()

    # 1. Backend bekle
    print("Backend kontrol ediliyor…")
    if not wait_for_backend():
        print("✗ Backend yanıt vermiyor. Docker Compose çalışıyor mu?")
        print("  docker compose up -d")
        sys.exit(1)
    print("✓ Backend hazır.\n")

    # 2. Tarayıcı session'larını tara
    print("Tarayıcılarda Instagram session aranıyor…")
    sessions = find_instagram_sessions()

    if not sessions:
        print()
        print("✗ Hiçbir tarayıcıda aktif Instagram session bulunamadı.")
        print("  Çözüm: Chrome/Firefox/Safari'de instagram.com'a giriş yap.")
        sys.exit(1)

    print()

    # 3. Her session için kayıt dene
    success_count = 0
    for sessionid, extra_cookies, browser_name in sessions:
        uid = extra_cookies.get("ds_user_id") or parse_user_id_from_sessionid(sessionid) or "?"
        print(f"[uid={uid}] İşleniyor…")

        # Preview → username al
        preview = preview_session(sessionid, extra_cookies)
        if not preview:
            print(f"  ✗ Session geçersiz (uid={uid}), atlanıyor.\n")
            continue

        ig_username = preview.get("ig_username", "")
        if not ig_username or ig_username.startswith("user_") and ig_username[5:].isdigit():
            # Placeholder geldi — yine de kaydet; kullanıcı sonradan düzeltebilir
            print(f"  ⚠ Username otomatik çekilemedi, placeholder kullanılıyor: {ig_username}")

        # Kaydet
        ok = register_session(ig_username, sessionid, extra_cookies)
        if ok:
            success_count += 1
        print()

    # 4. Sonuç
    if success_count:
        print(f"✓ {success_count} session başarıyla kaydedildi.")
        print("  Instapp: http://localhost:3002")
    else:
        print("✗ Hiçbir session kaydedilemedi.")
        sys.exit(1)


if __name__ == "__main__":
    main()
