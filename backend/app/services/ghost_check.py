"""
Hayalet hesap (silinmiş / dondurulmuş / kapatılmış) tespiti.

Profil sayfası OTURUMSUZ, temiz bir tarayıcı bağlamında (gizli sekme gibi: çerez yok, giriş yok) açılır.
Hiçbir Instagram oturumu kullanılmaz, bu yüzden kullanıcının hesabı bu isteklerden etkilenmez; yalnızca
bilgisayarın IP adresi görünür. Bu yüzden hız adaptiftir: temiz gittikçe hızlanır, takılma sinyalinde yavaşlar ve bekler.

Düz HTTP işe yaramaz: oturumsuz sayfa var olan ve olmayan hesap için aynı boş kabuğu döndürür.
Ayrım ancak sayfa çalıştıktan sonra başlıkta görünür:
  var      -> "Ad (@kullanici) • Instagram ..."
  yok      -> "Profile mevcut değil • Instagram" / "Profile isn't available • Instagram"
"""
from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from typing import Callable, Protocol

OK, UNREACHABLE, UNKNOWN, BLOCKED = "ok", "unreachable", "unknown", "blocked"

_PROFILE_TITLE = re.compile(r"\(@[A-Za-z0-9._]{1,30}\)")
_NOT_FOUND = re.compile(r"isn.t available|not available|page not found|not found|mevcut değil|bulunamad", re.I)
_WALL_PATH = re.compile(r"^/(accounts/(login|suspended)|challenge)", re.I)
_USERNAME = re.compile(r"^[A-Za-z0-9._]{1,30}$")


def valid_username(name: str) -> bool:
    return bool(_USERNAME.match(name or ""))


def classify(title: str, path: str) -> str:
    """Sayfa başlığından ve son yoldan hesabın durumunu çıkarır. Emin değilse UNKNOWN (tahmin etmez)."""
    if _WALL_PATH.match(path or ""):
        return BLOCKED
    title = (title or "").strip()
    if _PROFILE_TITLE.search(title):
        return OK
    if _NOT_FOUND.search(title):
        return UNREACHABLE
    return UNKNOWN          # boş kabuk ("Instagram"), giriş duvarı ya da yüklenmeyen sayfa


# ── Adaptif hız ayarlayıcı ───────────────────────────────────────────────────

class Pacer:
    """
    İstekler arası bekleme süresi. Başlangıç ~120 istek/saat; her 15 temiz sonuçta %15 hızlanır (en fazla ~360/saat).
    Takılma sinyali (BLOCKED ya da 3 ardışık UNKNOWN): bekleme iki katına çıkar, 15 dk x 2^n kadar (en çok 6 saat) durur.
    Üst üste MAX_STRIKES kez takılırsa iş durdurulur ve kullanıcıya bildirilir.
    """
    START_S, FLOOR_S, CEIL_S = 30.0, 10.0, 180.0
    SPEEDUP_EVERY, SPEEDUP_FACTOR = 15, 0.85
    UNKNOWN_RUN_LIMIT = 3
    COOLDOWN_BASE_S, COOLDOWN_MAX_S = 15 * 60, 6 * 3600
    MAX_STRIKES = 4
    FORGIVE_AFTER_CLEAN = 50
    DAILY_CAP = 2000
    KEY = "ghost:pace"

    def __init__(self, r, now: Callable[[], float] = time.time):
        self.r, self.now = r, now

    def _get(self) -> dict:
        h = {k.decode() if isinstance(k, bytes) else k: (v.decode() if isinstance(v, bytes) else v)
             for k, v in self.r.hgetall(self.KEY).items()}
        day = time.strftime("%Y-%m-%d", time.gmtime(self.now()))
        if h.get("day") != day:
            h["day"], h["day_count"] = day, "0"
        return {
            "interval": float(h.get("interval", self.START_S)), "streak": int(h.get("streak", 0)),
            "unknown_run": int(h.get("unknown_run", 0)), "strikes": int(h.get("strikes", 0)),
            "clean_since_strike": int(h.get("clean_since_strike", 0)),
            "cooldown_until": float(h.get("cooldown_until", 0)),
            "day": day, "day_count": int(h.get("day_count", 0)),
        }

    def _put(self, s: dict) -> None:
        self.r.hset(self.KEY, mapping={k: str(v) for k, v in s.items()})
        self.r.expire(self.KEY, 7 * 24 * 3600)

    def snapshot(self) -> dict:
        s = self._get()
        return {"interval_s": round(s["interval"], 1), "per_hour": int(3600 / s["interval"]),
                "strikes": s["strikes"], "cooldown_until": s["cooldown_until"] or None,
                "day_count": s["day_count"], "day_cap": self.DAILY_CAP}

    def wait_reason(self) -> tuple[str, float] | None:
        """Şimdi çalışılabilir mi? Değilse (neden, devam zamanı)."""
        s = self._get()
        if s["cooldown_until"] > self.now():
            return "cooldown", s["cooldown_until"]
        if s["day_count"] >= self.DAILY_CAP:
            tomorrow = (int(self.now()) // 86400 + 1) * 86400
            return "daily_cap", float(tomorrow)
        return None

    def delay(self) -> float:
        return self._get()["interval"] * random.uniform(0.6, 1.4)

    def record(self, outcome: str) -> str:
        """'continue' | 'cooldown' | 'stop'"""
        s = self._get()
        s["day_count"] += 1
        throttled = False
        if outcome == BLOCKED:
            throttled = True
        elif outcome == UNKNOWN:
            s["unknown_run"] += 1
            s["streak"] = 0
            throttled = s["unknown_run"] >= self.UNKNOWN_RUN_LIMIT
        else:
            s["unknown_run"] = 0
            s["streak"] += 1
            s["clean_since_strike"] += 1
            if s["streak"] >= self.SPEEDUP_EVERY:
                s["interval"] = max(self.FLOOR_S, s["interval"] * self.SPEEDUP_FACTOR)
                s["streak"] = 0
            if s["strikes"] and s["clean_since_strike"] >= self.FORGIVE_AFTER_CLEAN:
                s["strikes"] -= 1
                s["clean_since_strike"] = 0

        action = "continue"
        if throttled:
            s["strikes"] += 1
            s["interval"] = min(self.CEIL_S, s["interval"] * 2)
            s["streak"] = s["unknown_run"] = s["clean_since_strike"] = 0
            if s["strikes"] > self.MAX_STRIKES:
                action = "stop"
            else:
                wait = min(self.COOLDOWN_MAX_S, self.COOLDOWN_BASE_S * 2 ** (s["strikes"] - 1))
                s["cooldown_until"] = self.now() + wait
                action = "cooldown"
        self._put(s)
        return action


# ── Tarayıcı yoklayıcısı ─────────────────────────────────────────────────────

class Prober(Protocol):
    def probe(self, username: str) -> tuple[str, str]: ...      # (başlık, son yol)
    def close(self) -> None: ...


class BrowserProber:
    """Temiz (çerezsiz) Chromium bağlamı; her ROTATE_EVERY yoklamada yenilenir. Görsel/medya/yazı tipi yüklenmez."""
    ROTATE_EVERY = 40
    UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
          "Chrome/130.0.0.0 Safari/537.36")

    def __init__(self):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        self._ctx = None
        self._n = 0
        self._new_ctx()

    def _new_ctx(self) -> None:
        if self._ctx:
            self._ctx.close()
        self._ctx = self._browser.new_context(user_agent=self.UA, locale="en-US", viewport={"width": 1280, "height": 800},
                                              bypass_csp=True)      # başlık beklemesi için; Instagram CSP'si string eval'i engelliyor
        self._ctx.route("**/*", lambda route: route.abort()
                        if route.request.resource_type in ("image", "media", "font") else route.continue_())
        self._n = 0

    def probe(self, username: str) -> tuple[str, str]:
        from playwright.sync_api import TimeoutError as PWTimeout
        if self._n >= self.ROTATE_EVERY:
            self._new_ctx()
        self._n += 1
        page = self._ctx.new_page()
        try:
            page.goto(f"https://www.instagram.com/{username}/", wait_until="domcontentloaded", timeout=20000)
            try:
                page.wait_for_function(
                    "() => document.title !== 'Instagram' || /^\\/(accounts\\/(login|suspended)|challenge)/.test(location.pathname)",
                    timeout=9000)
            except PWTimeout:
                pass                                      # başlık değişmedi: classify UNKNOWN der
            path = "/" + page.url.split("instagram.com/", 1)[-1].split("?")[0]
            return page.title(), path
        finally:
            page.close()

    def close(self) -> None:
        try:
            self._browser.close()
        finally:
            self._pw.stop()


@dataclass
class SliceResult:
    probed: int
    stopped_reason: str | None      # None: dilim bitti | 'stop' | 'cooldown' | 'daily_cap' | 'blocked' | 'empty'
    resume_at: float | None = None
