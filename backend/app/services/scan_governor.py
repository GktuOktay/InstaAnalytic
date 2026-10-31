"""
Tarama bütçesi / risk yöneticisi.

Instagram'ın bot eşiklerini bilmiyoruz; bu yüzden muhafazakâr davranırız:
  * kayan pencerelerde (1 sa / 24 sa) istek sayısı üst sınırı
  * istekler arası rastgele bekleme + periyodik uzun mola
  * risk sinyali (429/401/403/challenge) -> kademeli cooldown, otomatik devam YOK
  * aynı session için tek tarama (kilit)
  * kaldığı yerden devam (cursor) ve "görülenler" kümesi
Zaman/uyku/rastgelelik enjekte edilebilir (test için).
"""
from __future__ import annotations

import random
import time
import uuid
from dataclasses import dataclass


class ScanPaused(Exception):
    """Tarama bilinçli olarak durduruldu. resume_at: epoch sn ya da None (elle devam)."""

    def __init__(self, reason: str, resume_at: float | None, auto_resume: bool):
        super().__init__(reason)
        self.reason = reason
        self.resume_at = resume_at
        self.auto_resume = auto_resume

from app.services import human_timing as ht


@dataclass
class GovernorConfig:
    pages_per_hour: int = 30
    pages_per_day: int = 150
    delay_min: float = 4.0
    delay_max: float = 9.0
    long_break_every: int = 10
    long_break_min: float = 60.0
    long_break_max: float = 120.0
    cooldown_tiers: tuple[int, ...] = (1800, 7200, 43200, 86400)


HOUR, DAY = 3600, 86400
STATE_TTL = 2 * DAY          # cursor / seen: 48 sa içinde devam edilmezse eskir
RISK_STATUSES = {400, 401, 403, 429}


class ScanGovernor:
    def __init__(self, r, session_id: str, cfg: GovernorConfig,
                 now=time.time, sleep=time.sleep, rng: random.Random | None = None):
        self.r, self.sid, self.cfg = r, str(session_id), cfg
        self.now, self.sleep, self.rng = now, sleep, rng or random.Random()
        self._run_requests = 0
        self._until_break = ht.random_cadence(self.rng, cfg.long_break_every)   # mola sıklığı da rastgele
        self._lock_token: str | None = None

    # ── anahtarlar ──────────────────────────────────────────────────────────
    def _k(self, name: str, kind: str | None = None) -> str:
        return f"scan:{self.sid}:{kind}:{name}" if kind else f"scan:{self.sid}:{name}"

    # ── kilit ───────────────────────────────────────────────────────────────
    def acquire_lock(self, ttl: int = 3 * HOUR) -> bool:
        token = uuid.uuid4().hex
        if self.r.set(self._k("lock"), token, nx=True, ex=ttl):
            self._lock_token = token
            return True
        return False

    def release_lock(self) -> None:
        if self._lock_token and self.r.get(self._k("lock")) in (self._lock_token, self._lock_token.encode()):
            self.r.delete(self._k("lock"))
        self._lock_token = None

    # ── pencere sayaçları ───────────────────────────────────────────────────
    def _window(self) -> list[float]:
        now = self.now()
        self.r.zremrangebyscore(self._k("reqs"), 0, now - DAY)
        return [float(s) for _, s in self.r.zrange(self._k("reqs"), 0, -1, withscores=True)]

    def _counts(self) -> tuple[list[float], list[float]]:
        day = self._window()
        hour = [t for t in day if t > self.now() - HOUR]
        return hour, day

    def cooldown_until(self) -> float | None:
        v = self.r.get(self._k("cooldown_until"))
        if v is None:
            return None
        v = float(v)
        return v if v > self.now() else None

    def check(self) -> None:
        """Bütçe/cooldown uygunsa sessizce döner, değilse ScanPaused fırlatır."""
        cd = self.cooldown_until()
        if cd:
            raise ScanPaused("Instagram risk sinyali verdi; cooldown bitene kadar tarama yapılmaz.", cd, False)
        hour, day = self._counts()
        if len(day) >= self.cfg.pages_per_day:
            raise ScanPaused("Günlük tarama bütçesi doldu.", min(day) + DAY, True)
        if len(hour) >= self.cfg.pages_per_hour:
            raise ScanPaused("Saatlik tarama bütçesi doldu.", min(hour) + HOUR, True)

    # ── istek öncesi/sonrası ────────────────────────────────────────────────
    def before_request(self) -> None:
        self.check()
        if self._run_requests:     # ilk istek bekletilmez
            self.sleep(ht.between(self.rng, self.cfg.delay_min, self.cfg.delay_max))
            self._until_break -= 1
            if self._until_break <= 0:
                self.sleep(ht.between(self.rng, self.cfg.long_break_min, self.cfg.long_break_max))
                self._until_break = ht.random_cadence(self.rng, self.cfg.long_break_every)
        now = self.now()
        self.r.zadd(self._k("reqs"), {f"{now}:{uuid.uuid4().hex[:6]}": now})
        self.r.expire(self._k("reqs"), DAY + HOUR)
        self._run_requests += 1

    def report_failure(self, status: int, detail: str = "") -> ScanPaused:
        """Risk sinyali: strike artır, kademeli cooldown kur ve ScanPaused döndür."""
        strikes = int(self.r.incr(self._k("strikes")))
        self.r.expire(self._k("strikes"), 7 * DAY)
        tiers = self.cfg.cooldown_tiers
        wait = tiers[min(strikes - 1, len(tiers) - 1)]
        until = self.now() + wait
        self.r.set(self._k("cooldown_until"), until, ex=wait + 60)
        return ScanPaused(f"HTTP {status} {detail}".strip() + f" — {wait // 60} dk cooldown", until, False)

    def report_clean_finish(self) -> None:
        self.r.delete(self._k("strikes"))

    # ── devam / görülenler ──────────────────────────────────────────────────
    def get_cursor(self, kind: str) -> str | None:
        v = self.r.get(self._k("cursor", kind))
        return v.decode() if isinstance(v, bytes) else v

    def set_cursor(self, kind: str, cursor: str) -> None:
        self.r.set(self._k("cursor", kind), cursor, ex=STATE_TTL)

    def add_seen(self, kind: str, ids: list[int]) -> None:
        if ids:
            self.r.sadd(self._k("seen", kind), *ids)
            self.r.expire(self._k("seen", kind), STATE_TTL)

    def seen(self, kind: str) -> set[int]:
        return {int(x) for x in self.r.smembers(self._k("seen", kind))}

    # ── bekleyen iş kuyruğu (ör. etkileşimi çekilecek gönderiler) ─────────────
    def set_pending(self, kind: str, ids: list[int]) -> None:
        self.r.delete(self._k("pending", kind))
        if ids:
            self.r.rpush(self._k("pending", kind), *ids)
            self.r.expire(self._k("pending", kind), STATE_TTL)

    def pending(self, kind: str) -> list[int]:
        return [int(x) for x in self.r.lrange(self._k("pending", kind), 0, -1)]

    def pop_pending(self, kind: str, expected: int | None = None) -> None:
        """Baştaki işi tamamlandı say. expected verilirse yalnızca baştaki öğe oysa siler."""
        head = self.r.lindex(self._k("pending", kind), 0)
        if head is not None and (expected is None or int(head) == int(expected)):
            self.r.lpop(self._k("pending", kind))

    def clear_scan(self, kind: str) -> None:
        self.r.delete(self._k("cursor", kind), self._k("seen", kind), self._k("pending", kind))

    # ── durum ───────────────────────────────────────────────────────────────
    def status(self) -> dict:
        hour, day = self._counts()
        cd = self.cooldown_until()
        next_at = None
        if cd:
            next_at = cd
        elif len(day) >= self.cfg.pages_per_day:
            next_at = min(day) + DAY
        elif len(hour) >= self.cfg.pages_per_hour:
            next_at = min(hour) + HOUR
        return {
            "used_hour": len(hour), "limit_hour": self.cfg.pages_per_hour,
            "used_day": len(day), "limit_day": self.cfg.pages_per_day,
            "cooldown_until": cd, "strikes": int(self.r.get(self._k("strikes")) or 0),
            "can_scan": next_at is None, "next_available_at": next_at,
            "running": bool(self.r.exists(self._k("lock"))),
            "paused": {k: bool(self.get_cursor(k)) for k in ("followers", "following")},
        }
