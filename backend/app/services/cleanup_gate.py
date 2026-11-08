"""Kaydedilenleri temizleme ek iş kapısı, bütçesi ve tahmini (SPEC-001 §6.2, §6.4; AC-C10..C13, C24..C26, C42, C43, L9).

- `cleanup_gate(...)`: profil satırı kilidi (FOR UPDATE) altında ilk tutan sebebi döner:
  off > paused > quiet_hours > limit. Kapı ya da yükleyici istisna atarsa sonuç "limit"tir (izin yok, AC-L9).
- Etkin değerler her çağrıda sert tavanlara yeniden kırpılır (`min(değer, HARD_CAP)`, gecikme alt sınırları dahil);
  NaN, inf, bool ve sayı olmayanlar `ValueError` verir (kapıda "limit").
- Sayım `cleanup_write_grants` üzerindendir (R7 M5): sonucu ne olursa olsun verilen her izin pencerede sayılır.
  Hesap toplamı ek olarak `bridge_actions`'taki takip `done` kayıtlarını salt okur; bu dosya `bridge_actions.py`,
  `risk_profiles.py` ve `gate()`'e dokunmaz. Takip kuyruğu bu tavanlara uymaz.
- Pencereler kayandır ve yarı açıktır: bir olay `t - pencere < ts <= t` aralığında sayılır (`ts + pencere` anında düşer).
- Saat enjekte edilir (`now` parametresi); bu dosyada gerçek saat okunmaz.
"""
from __future__ import annotations

import heapq
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Iterable, Mapping
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bridge_action import BridgeAction
from app.models.cleanup import CleanupWriteGrant
from app.models.session import Session
from app.services.cleanup_limits import PROFILES, get_limits, hard_cap
from app.services.risk_profiles import DEFAULT_PROFILE, QUIET_HOURS, QUIET_TZ, in_quiet_hours

log = logging.getLogger("cleanup_gate")

KIND = "saved"
HOUR = timedelta(hours=1)
DAY = timedelta(hours=24)
ACTIVE_HOURS_PER_DAY = 17            # sessiz saat dışındaki saatler (tahmin, §6.4)
DELAY_MIN_FLOOR = 10                 # sn; S-15, I-9
DELAY_GAP = 5
DELAY_MAX_CEIL = 900
FOLLOW_PAUSE_REASON = "follow_blocked"
BRIDGE_PREFIX = "Köprü:"
_EPS = 1e-9                          # floor(daily × oran) kayan nokta gürültüsüne karşı
_MAX_SCAN = 5000


# ── Etkin değerler (sert tavana yeniden kırpma) ─────────────────────────────────
@dataclass(frozen=True)
class Effective:
    fraction: float
    hourly_eff: int
    daily_eff: int
    hourly_cap: int          # min(hourly_eff, account.hourly)
    daily_cap: int           # min(daily_eff, account.daily)
    account_hourly: int
    account_daily: int
    delay_min: int
    delay_max: int


def _num(values: Mapping, key: str):
    """Sayıyı sert aralığa kırpar. NaN, inf, bool ve sayı olmayan -> ValueError. Büyük int float'a çevrilmez."""
    v = values[key]
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"limit value not numeric: {key}")
    if isinstance(v, float) and not math.isfinite(v):
        raise ValueError(f"limit value not finite: {key}")
    lo, hi = hard_cap(key)
    return min(max(v, lo), hi)


def _int(values: Mapping, key: str) -> int:
    return int(math.floor(_num(values, key)))


def ramp_fraction(values: Mapping, age_hours: float) -> float:
    """Isınma oranı: yaş < first_hours -> first_fraction; < second_hours -> second_fraction; sonra 1 (AC-C11)."""
    enabled = values["ramp.enabled"]
    if type(enabled) is not bool:
        raise ValueError("ramp.enabled not bool")
    if not enabled:
        return 1.0
    first_h, second_h = _num(values, "ramp.first_hours"), _num(values, "ramp.second_hours")
    first_f, second_f = float(_num(values, "ramp.first_fraction")), float(_num(values, "ramp.second_fraction"))
    if age_hours < first_h:
        return first_f
    if age_hours < second_h:
        return second_f
    return 1.0


def ramp_change_times(values: Mapping, age_hours: float, now: datetime) -> list[datetime]:
    """Isınmanın bundan sonra oran değiştireceği anlar (next_allowed_at adayları)."""
    if values.get("ramp.enabled") is not True:
        return []
    out = []
    for key in ("ramp.first_hours", "ramp.second_hours"):
        h = _num(values, key)
        if h > age_hours:
            out.append(now + timedelta(hours=float(h) - age_hours))
    return out


def compute_effective(values: Mapping, profile: str, age_hours: float) -> Effective:
    """Etkin kapasiteler (§6.4). `values` ham ya da yüklenmiş olabilir; her değer burada yeniden kırpılır."""
    name = profile if profile in PROFILES else DEFAULT_PROFILE
    p = f"profiles.{name}.unsave."
    f = ramp_fraction(values, age_hours)
    hourly, daily = _int(values, p + "hourly"), _int(values, p + "daily")
    acc_h, acc_d = _int(values, "account.hourly"), _int(values, "account.daily")
    daily_eff = max(1, int(math.floor(daily * f + _EPS)))
    hourly_eff = min(hourly, daily_eff)
    dmin = max(_int(values, p + "delay_min"), DELAY_MIN_FLOOR)
    dmax = min(DELAY_MAX_CEIL, max(_int(values, p + "delay_max"), dmin + DELAY_GAP))
    return Effective(f, hourly_eff, daily_eff, min(hourly_eff, acc_h), min(daily_eff, acc_d), acc_h, acc_d, dmin, dmax)


def ramp_age_hours(session: Session, now: datetime) -> float:
    """Ek iş açıldığından bu yana saat. Açılış zamanı yoksa en kısıtlayıcı aşama (0) varsayılır."""
    t = session.unsave_enabled_at
    return 0.0 if t is None else max(0.0, (now - t).total_seconds() / 3600)


# ── Hazır kuralı (saf) ──────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Events:
    grants: tuple[datetime, ...]     # cleanup_write_grants.granted_at (son 24 sa)
    follows: tuple[datetime, ...]    # bridge_actions done_at (takip + takipten çıkma, son 24 sa)


@dataclass(frozen=True)
class Readiness:
    ready: bool
    next_allowed_at: datetime | None
    hourly_room: int
    daily_room: int
    need: int
    daily_need: int
    eff: Effective


def _count(ts: Iterable[datetime], t: datetime, window: timedelta) -> int:
    lo = t - window
    return sum(1 for x in ts if x > lo)


def _quiet_end(t: datetime) -> datetime:
    return t.astimezone(ZoneInfo(QUIET_TZ)).replace(hour=QUIET_HOURS[1], minute=0, second=0, microsecond=0)


def _state(eff: Effective, ev: Events, remaining: int, t: datetime, pause_until: datetime | None):
    g1, g24 = _count(ev.grants, t, HOUR), _count(ev.grants, t, DAY)
    f1, f24 = _count(ev.follows, t, HOUR), _count(ev.follows, t, DAY)
    hourly_room = min(eff.hourly_eff - g1, eff.account_hourly - (g1 + f1))
    daily_room = min(eff.daily_eff - g24, eff.account_daily - (g24 + f24))
    need = max(1, min(eff.hourly_cap, remaining, eff.account_hourly - f1))
    r = eff.daily_cap % eff.hourly_cap
    daily_need = min(need, eff.account_daily - f24) if r == 0 else min(need, r, eff.account_daily - f24)
    daily_need = max(1, daily_need)
    quiet = in_quiet_hours(t)
    paused = pause_until is not None and pause_until > t
    ok = hourly_room >= need and daily_room >= daily_need and not quiet and not paused
    return ok, hourly_room, daily_room, need, daily_need, quiet


def evaluate_ready(eff_at: Callable[[datetime], Effective], ev: Events, remaining: int, now: datetime,
                   pause_until: datetime | None, extra_times: Iterable[datetime] = ()) -> Readiness:
    """"Hazır" kuralı (AC-C42) ve `next_allowed_at`: dört koşulun (saatlik boş yer >= need, günlük boş yer >=
    daily_need, sessiz saat dışı, duraklatma yok) ilk birlikte sağlandığı an. Adaylar: pencereden düşen olaylar,
    duraklatma sonu, sessiz saat sonu ve ısınma geçişleri."""
    eff0 = eff_at(now)
    ok, hr, dr, need, dneed, quiet = _state(eff0, ev, remaining, now, pause_until)
    if ok:
        return Readiness(True, None, hr, dr, need, dneed, eff0)
    cand: list[datetime] = []
    for ts in (*ev.grants, *ev.follows):
        cand += [ts + HOUR, ts + DAY]
    if pause_until is not None:
        cand.append(pause_until)
    cand += list(extra_times)
    if quiet:
        cand.append(_quiet_end(now))
    heap = [c for c in cand if c > now]
    heapq.heapify(heap)
    seen: set[datetime] = set()
    last = None
    for _ in range(_MAX_SCAN):
        if not heap:
            break
        t = heapq.heappop(heap)
        if t in seen:
            continue
        seen.add(t)
        last = t
        ok, _hr, _dr, _n, _dn, q = _state(eff_at(t), ev, remaining, t, pause_until)
        if ok:
            return Readiness(False, t, hr, dr, need, dneed, eff0)
        if q:
            heapq.heappush(heap, _quiet_end(t))
    return Readiness(False, last, hr, dr, need, dneed, eff0)


# ── Tahmin (saf) ────────────────────────────────────────────────────────────────
def estimate(item_count: int, values: Mapping, profile: str, age_hours: float) -> dict:
    """AC-C43: {hourly, daily, days, starts}. Isınma gün gün uygulanır (gün d, yaş + 24·d sa)."""
    e0 = compute_effective(values, profile, age_hours)
    days = starts = 0
    left = max(0, int(item_count))
    while left > 0 and days < 3650:
        e = compute_effective(values, profile, age_hours + 24 * days)
        thr = min(e.hourly_cap, int(math.floor(3600 / ((e.delay_min + e.delay_max) / 2 + 5))))
        per_day = max(1, min(e.daily_cap, thr * ACTIVE_HOURS_PER_DAY))
        todo = min(per_day, left)
        starts += math.ceil(todo / e.hourly_cap)
        left -= todo
        days += 1
    return {"hourly": e0.hourly_cap, "daily": e0.daily_cap, "days": days, "starts": starts}


# ── Veritabanı ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class BudgetState:
    ready: bool
    next_allowed_at: datetime | None
    hourly_room: int
    daily_room: int
    need: int
    daily_need: int
    eff: Effective


async def lock_session(db: AsyncSession, session: Session) -> None:
    """Profil satırı kilidi (AC-C47): `SELECT … FOR UPDATE` on sessions; nesne taze değerlerle yenilenir."""
    await db.execute(select(Session.id).where(Session.id == session.id).with_for_update())
    await db.refresh(session)


async def load_events(db: AsyncSession, session_id: uuid.UUID, now: datetime) -> Events:
    since = now - DAY
    grants = (await db.execute(select(CleanupWriteGrant.granted_at).where(
        CleanupWriteGrant.session_id == session_id, CleanupWriteGrant.granted_at > since,
        CleanupWriteGrant.granted_at <= now))).scalars().all()
    follows = (await db.execute(select(BridgeAction.done_at).where(
        BridgeAction.session_id == session_id, BridgeAction.status == "done",
        BridgeAction.action.in_(("follow", "unfollow")), BridgeAction.done_at > since,
        BridgeAction.done_at <= now))).scalars().all()
    return Events(tuple(grants), tuple(follows))


def pause_until(session: Session) -> datetime | None:
    """§6.2 adım 2: max(cleanup_paused_until, paused_until)."""
    vals = [v for v in (session.cleanup_paused_until, session.paused_until) if v is not None]
    return max(vals) if vals else None


async def _mirror_follow_pause(db: AsyncSession, session: Session, now: datetime) -> None:
    """AC-C24: takip yolunun gelecekteki duraklatması `cleanup_paused_until`'a kopyalanır; 'Köprü:' önekliler kopyalanmaz."""
    pu = session.paused_until
    if pu is None or pu <= now or (session.paused_reason or "").startswith(BRIDGE_PREFIX):
        return
    if session.cleanup_paused_until is None or pu > session.cleanup_paused_until:
        session.cleanup_paused_until = pu
        session.cleanup_paused_reason = FOLLOW_PAUSE_REASON
        await db.flush()


async def budget_state(db: AsyncSession, session: Session, now: datetime, remaining: int = 500, *,
                       limits=None) -> BudgetState:
    """Boş yerler, `need` ve "hazır" kuralı (AC-C42); `run_state='ready'` ve `next_allowed_at` buradan türetilir.
    İstisnaları yutmaz; çağıran kapı değilse hatayı görmelidir."""
    lim = limits if limits is not None else get_limits()
    values, profile = lim.values, session.risk_profile
    age = ramp_age_hours(session, now)
    ev = await load_events(db, session.id, now)

    def eff_at(t: datetime) -> Effective:
        return compute_effective(values, profile, age + (t - now).total_seconds() / 3600)

    r = evaluate_ready(eff_at, ev, max(0, int(remaining)), now, pause_until(session),
                       ramp_change_times(values, age, now))
    return BudgetState(r.ready, r.next_allowed_at, r.hourly_room, r.daily_room, r.need, r.daily_need, r.eff)


async def cleanup_gate(db: AsyncSession, session: Session, kind: str, now: datetime, *, limits=None,
                       lock: bool = True) -> str | None:
    """None: ek iş yapılabilir. Aksi halde ilk tutan sebep: off | paused | quiet_hours | limit.
    Herhangi bir istisna (yükleyici, bozuk değer, veritabanı) 'limit' döner: yazma yapılmaz (AC-L9)."""
    try:
        if kind != KIND:
            raise ValueError("kind")
        if lock:
            await lock_session(db, session)
        if not session.allow_unsave:
            return "off"
        await _mirror_follow_pause(db, session, now)
        pu = pause_until(session)
        if pu is not None and pu > now:
            return "paused"
        if in_quiet_hours(now):
            return "quiet_hours"
        lim = limits if limits is not None else get_limits()
        age = ramp_age_hours(session, now)
        eff = compute_effective(lim.values, session.risk_profile, age)
        ev = await load_events(db, session.id, now)
        g1, g24 = _count(ev.grants, now, HOUR), _count(ev.grants, now, DAY)
        f1, f24 = _count(ev.follows, now, HOUR), _count(ev.follows, now, DAY)
        if (min(eff.hourly_eff - g1, eff.account_hourly - (g1 + f1)) < 1
                or min(eff.daily_eff - g24, eff.account_daily - (g24 + f24)) < 1):
            return "limit"
        return None
    except Exception as e:                      # noqa: BLE001  (AC-L9: her hata izin yok)
        log.warning("cleanup_gate failed closed: %s", type(e).__name__)
        return "limit"


async def record_grant(db: AsyncSession, session: Session, item_id: int, now: datetime) -> None:
    """R7 M5: her `precheck allow` aynı işlemde bir izin satırı yazar; sayım buradan yapılır."""
    db.add(CleanupWriteGrant(session_id=session.id, item_id=item_id, granted_at=now))
    await db.flush()
