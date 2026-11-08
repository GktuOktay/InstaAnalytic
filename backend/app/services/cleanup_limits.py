"""Kaydedilenleri temizleme ek iş sınırları: `limits.toml` yükleyicisi (SPEC-001 §6.5, AC-L1..L13).

- `DEFAULTS` güvenli varsayılanlar, `HARD_CAPS` kodda sabit sert sınırlar (dosyadan okunmaz).
- Doğrulama sırası: tip -> kırp -> çift tutarlılığı (daha kısıtlayıcı çözüm). Hiçbir girdi sert sınırı aşamaz.
- Dosya her 30 sn'de koşulsuz okunur (mtime/boyut kısayolu yok), içerik sha256 ile karşılaştırılır.
- Önbellek değişmez (`Limits`) ve atomik olarak yer değiştirir.
- Log ve uyarılar yalnız bilinen anahtar adlarını ve sonlu sayıları taşır; dosyadaki string'ler asla yazılmaz.
- Takip kuyruğu sınırları (`risk_profiles.py`) buradan yönetilmez. Yükleyici henüz hiçbir yere bağlı değildir (T-2 kapıyla bağlar).
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
import threading
import time
import tomllib
from dataclasses import dataclass, replace
from pathlib import Path
from types import MappingProxyType
from typing import Any, Callable, Mapping

from app.services.risk_profiles import PROFILES, QUIET_HOURS, in_quiet_hours  # noqa: F401  (yeniden dışa aktarım, kopya yok)

log = logging.getLogger("cleanup_limits")

RELOAD_INTERVAL_S = 30
MAX_FILE_BYTES = 64 * 1024
MAX_REPORTED_UNKNOWN = 50
_SAFE_NAME = re.compile(r"^[a-z_][a-z0-9_.]{0,63}$")

# ── Sert sınırlar ve varsayılanlar ──────────────────────────────────────────────
# (alt, üst); "profiles.*" her risk profili için geçerlidir.
HARD_CAPS: dict[str, tuple[float, float]] = {
    "profiles.*.unsave.hourly": (1, 80),
    "profiles.*.unsave.daily": (1, 400),
    "profiles.*.unsave.delay_min": (10, 600),
    "profiles.*.unsave.delay_max": (15, 900),
    "account.hourly": (1, 80),
    "account.daily": (1, 400),
    "batch.max_items": (1, 500),
    "ramp.first_fraction": (0.1, 1.0),
    "ramp.second_fraction": (0.1, 1.0),
    "ramp.first_hours": (0, 720),
    "ramp.second_hours": (0, 720),
    "scan.page_delay_min": (2, 60),
    "scan.page_delay_max": (3, 120),
    "scan.saved_max_pages": (1, 200),
    "scan.max_per_hour": (1, 4),
    "reads.status_per_hour": (1, 240),
}

_PROFILE_DEFAULTS: dict[str, dict[str, int]] = {
    "safe": {"hourly": 40, "daily": 200, "delay_min": 20, "delay_max": 45},
    "balanced": {"hourly": 60, "daily": 300, "delay_min": 15, "delay_max": 35},
    "aggressive": {"hourly": 80, "daily": 400, "delay_min": 10, "delay_max": 25},
}

_GLOBAL_DEFAULTS: dict[str, Any] = {
    "account.hourly": 80, "account.daily": 400,
    "batch.max_items": 500,
    "ramp.enabled": True, "ramp.first_hours": 72, "ramp.first_fraction": 0.333,
    "ramp.second_hours": 168, "ramp.second_fraction": 0.667,
    "scan.page_delay_min": 3, "scan.page_delay_max": 6, "scan.saved_max_pages": 100, "scan.max_per_hour": 2,
    "reads.status_per_hour": 120,
}


def hard_cap(key: str) -> tuple[float, float]:
    """Anahtar için (alt, üst) sert sınır; `profiles.<ad>.unsave.x` -> `profiles.*.unsave.x`."""
    parts = key.split(".")
    if len(parts) == 4 and parts[0] == "profiles":
        parts[1] = "*"
    return HARD_CAPS[".".join(parts)]


def _defaults(profiles) -> dict[str, Any]:
    out = dict(_GLOBAL_DEFAULTS)
    for name in profiles:
        for field, v in _PROFILE_DEFAULTS.get(name, _PROFILE_DEFAULTS["safe"]).items():
            out[f"profiles.{name}.unsave.{field}"] = v
    return out


DEFAULTS: Mapping[str, Any] = MappingProxyType(_defaults(PROFILES))


def defaults_tree(values: Mapping[str, Any] | None = None) -> dict:
    """Düz anahtarlı değerleri TOML ağacına çevirir (örnek dosya karşılaştırması ve API için)."""
    tree: dict = {}
    for k, v in (DEFAULTS if values is None else values).items():
        d = tree
        parts = k.split(".")
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = v
    return tree


def _spec(profiles) -> dict[str, tuple[str, Any, Any, Any]]:
    """anahtar -> (tür, alt, üst, varsayılan). Tür: int | float | bool."""
    dflt = _defaults(profiles)
    spec: dict[str, tuple[str, Any, Any, Any]] = {}
    for k, d in dflt.items():
        if k == "ramp.enabled":
            spec[k] = ("bool", None, None, d)
        else:
            lo, hi = hard_cap(k)
            spec[k] = ("float" if isinstance(d, float) else "int", lo, hi, d)
    return spec


# ── Sonuç nesneleri ─────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class LimitWarning:
    key: str                       # yalnız bilinen anahtar adı ya da "<invalid>"
    code: str                      # clamped | invalid | unknown | missing | relational | ramp_disabled
    value: int | float | None = None   # yalnız sonlu sayı
    used: int | float | bool | None = None


@dataclass(frozen=True)
class Limits:
    values: Mapping[str, Any]
    warnings: tuple[LimitWarning, ...]
    source: str                    # file | defaults
    code: str | None               # file_missing | file_invalid | version_unsupported | file_unreadable
    sha256: str | None
    changed_at: float
    loaded_at: float
    path: str                      # her zaman göreli (config/limits.toml)
    unknown_count: int = 0

    def profile(self, name: str) -> dict[str, Any]:
        return {f: self.values[f"profiles.{name}.unsave.{f}"] for f in ("hourly", "daily", "delay_min", "delay_max")}

    def nested(self) -> dict:
        return defaults_tree(self.values)


# ── Doğrulama ───────────────────────────────────────────────────────────────────
def _num_for_report(v) -> int | float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float) and math.isfinite(v):
        return v
    return None


def _safe_name(dotted: str) -> str:
    return dotted if _SAFE_NAME.match(dotted) else "<invalid>"


def _lookup(tree: Any, key: str):
    node = tree
    for p in key.split("."):
        if not isinstance(node, dict) or p not in node:
            return False, None
        node = node[p]
    return True, node


def _check_type(kind: str, v) -> bool:
    if kind == "bool":
        return type(v) is bool
    if kind == "int":
        return type(v) is int
    return type(v) in (int, float) and math.isfinite(v)


def _flatten(node: Any, prefix: tuple[str, ...]):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _flatten(v, prefix + (k,))
    else:
        yield prefix


def _evaluate(tree: dict, profiles) -> tuple[dict[str, Any], list[LimitWarning], int]:
    spec = _spec(profiles)
    values: dict[str, Any] = {}
    fvals: dict[str, Any] = {}      # tip+kırpma sonrası dosya değeri (çift kuralı için)
    warns: list[LimitWarning] = []

    # 1-2. tip, kırpma
    for key, (kind, lo, hi, dflt) in spec.items():
        found, raw = _lookup(tree, key)
        if not found:
            values[key] = fvals[key] = dflt
            warns.append(LimitWarning(key, "missing", None, dflt))
            continue
        if not _check_type(kind, raw):
            values[key] = fvals[key] = dflt
            warns.append(LimitWarning(key, "invalid", _num_for_report(raw), dflt))
            continue
        if kind == "bool":
            v = raw
        else:
            v = min(max(raw, lo), hi)          # kırpma float'a çevirmeden önce (10**400 taşmasın)
            if kind == "float":
                v = float(v)
            if v != raw:
                warns.append(LimitWarning(key, "clamped", _num_for_report(raw), v))
        values[key] = fvals[key] = v

    # 3. çift tutarlılığı (daha kısıtlayıcı çözüm)
    def rel(*keys):
        for k in keys:
            warns.append(LimitWarning(k, "relational", _num_for_report(fvals[k]), values[k]))

    def hourly_daily(h: str, d: str):
        if fvals[h] > fvals[d]:
            values[d] = min(fvals[d], spec[d][3])
            values[h] = min(fvals[h], spec[h][3], values[d])
            rel(h, d)

    for name in profiles:
        hourly_daily(f"profiles.{name}.unsave.hourly", f"profiles.{name}.unsave.daily")
        mn, mx = f"profiles.{name}.unsave.delay_min", f"profiles.{name}.unsave.delay_max"
        if fvals[mx] < fvals[mn] + 5:
            values[mn] = max(fvals[mn], spec[mn][3])
            values[mx] = min(900, max(fvals[mx], spec[mx][3], values[mn] + 5))
            rel(mn, mx)
    hourly_daily("account.hourly", "account.daily")
    if fvals["ramp.second_fraction"] < fvals["ramp.first_fraction"]:
        first = min(fvals["ramp.first_fraction"], spec["ramp.first_fraction"][3])
        values["ramp.first_fraction"] = first
        values["ramp.second_fraction"] = max(first, min(fvals["ramp.second_fraction"], spec["ramp.second_fraction"][3]))
        rel("ramp.first_fraction", "ramp.second_fraction")
    if fvals["ramp.second_hours"] < fvals["ramp.first_hours"]:
        first = max(fvals["ramp.first_hours"], spec["ramp.first_hours"][3])
        values["ramp.first_hours"] = first
        values["ramp.second_hours"] = min(720, max(fvals["ramp.second_hours"], spec["ramp.second_hours"][3], first))
        rel("ramp.first_hours", "ramp.second_hours")
    if fvals["scan.page_delay_max"] < fvals["scan.page_delay_min"] + 1:
        values["scan.page_delay_min"] = max(fvals["scan.page_delay_min"], spec["scan.page_delay_min"][3])
        values["scan.page_delay_max"] = min(120, max(fvals["scan.page_delay_max"], spec["scan.page_delay_max"][3],
                                                     values["scan.page_delay_min"] + 1))
        rel("scan.page_delay_min", "scan.page_delay_max")

    if values["ramp.enabled"] is False:
        warns.append(LimitWarning("ramp.enabled", "ramp_disabled", None, False))

    # Bilinmeyen anahtarlar (yalnız ad; değer yok)
    known = {tuple(k.split(".")) for k in spec}
    unknown_names: list[str] = []
    seen_profiles: set[str] = set()
    unknown_count = 0
    for path in _flatten({k: v for k, v in tree.items() if k != "version"}, ()):
        if path in known:
            continue
        if len(path) >= 2 and path[0] == "profiles" and path[1] not in profiles:
            if path[1] in seen_profiles:
                continue
            seen_profiles.add(path[1])
            name = _safe_name(".".join(path[:2]))
        else:
            name = _safe_name(".".join(path))
        unknown_count += 1
        if len(unknown_names) < MAX_REPORTED_UNKNOWN:
            unknown_names.append(name)
    warns.extend(LimitWarning(n, "unknown") for n in unknown_names)
    return values, warns, unknown_count


# ── Yol çözümü ──────────────────────────────────────────────────────────────────
BACKEND_ROOT = Path(__file__).resolve().parents[2]      # konteynerde /app


def resolve_path(configured: str | None = None, backend_root: Path | None = None) -> Path:
    """AC-L12: mutlak yol olduğu gibi, göreli backend köküne göre, boşsa <kök>/config/limits.toml."""
    root = backend_root or BACKEND_ROOT
    if configured is None:
        from app.core.config import settings
        configured = settings.cleanup_limits_file
    configured = (configured or "").strip()
    if not configured:
        return root / "config" / "limits.toml"
    p = Path(configured)
    return p if p.is_absolute() else root / p


def display_path(path: Path, backend_root: Path | None = None) -> str:
    """API'ye çıkan yol her zaman göreli (I-4)."""
    root = backend_root or BACKEND_ROOT
    try:
        return Path(path).relative_to(root).as_posix()
    except ValueError:
        return f"config/{Path(path).name}"


# ── Yükleyici ───────────────────────────────────────────────────────────────────
class LimitsLoader:
    def __init__(self, path: Path | str | None = None, clock: Callable[[], float] = time.time,
                 interval: float = RELOAD_INTERVAL_S):
        self.path = Path(path) if path is not None else resolve_path()
        self._clock = clock
        self._interval = interval
        self._lock = threading.Lock()
        self._cache: Limits | None = None

    def get(self) -> Limits:
        cur = self._cache
        now = self._clock()
        if cur is not None and 0 <= now - cur.loaded_at < self._interval:
            return cur
        with self._lock:
            cur = self._cache
            now = self._clock()
            if cur is not None and 0 <= now - cur.loaded_at < self._interval:
                return cur
            new = self._load(now, cur)
            self._cache = new            # tek atama: atomik yer değiştirme
            return new

    def _read(self) -> tuple[bytes | None, str | None]:
        try:
            with open(self.path, "rb") as f:
                data = f.read(MAX_FILE_BYTES + 1)
        except (FileNotFoundError, NotADirectoryError):
            return None, "file_missing"
        except OSError:
            return None, "file_unreadable"
        if len(data) > MAX_FILE_BYTES:
            return data[:0], "file_invalid"
        return data, None

    def _load(self, now: float, prev: Limits | None) -> Limits:
        profiles = tuple(PROFILES)
        dflt = _defaults(profiles)
        shown = display_path(self.path)
        data, code = self._read()
        sha = hashlib.sha256(data).hexdigest() if data else None
        values, warns, unknown = dict(dflt), [], 0
        source = "defaults"
        if code is None:
            try:
                tree = tomllib.loads(data.decode("utf-8"))
                version = tree.get("version")
                if type(version) is not int or version != 1:
                    code = "version_unsupported"
                else:
                    values, warns, unknown = _evaluate(tree, profiles)
                    source = "file"
            except Exception:           # bozuk TOML/UTF-8 ya da yükleyici hatası: güvenli varsayılan
                code, values, warns, unknown = "file_invalid", dict(dflt), [], 0
        if source == "defaults":
            values, warns, unknown = dict(dflt), [], 0

        state = (source, code, sha)
        prev_state = (prev.source, prev.code, prev.sha256) if prev else None
        changed_at = prev.changed_at if prev else now
        if state != prev_state:
            changed_at = now
            self._log_change(prev, source, code, sha, values, warns, unknown, dflt)
        elif prev is not None:
            warns, unknown = list(prev.warnings), prev.unknown_count
        return Limits(MappingProxyType(values), tuple(warns), source, code, sha, changed_at, now, shown, unknown)

    @staticmethod
    def _log_change(prev, source, code, sha, values, warns, unknown, dflt):
        if source == "file":
            before = prev.values if prev is not None else dflt
            changed = sorted(k for k, v in values.items() if before.get(k) != v)
            extra = f" unknown={unknown}" if unknown else ""
            log.info("cleanup_limits reloaded sha256=%s changed=[%s]%s", sha[:12], ",".join(changed), extra)
        else:
            log.warning("cleanup_limits using safe defaults code=%s sha256=%s", code, sha[:12] if sha else "none")
        for x in warns:
            if x.code == "missing":
                log.debug("cleanup_limits missing key=%s", x.key)
                continue
            log.warning("cleanup_limits %s key=%s value=%s used=%s", x.code, x.key, x.value, x.used)


_default_loader: LimitsLoader | None = None
_default_lock = threading.Lock()


def get_limits() -> Limits:
    """Süreç çapında yükleyici (30 sn önbellek). Çağıran, istisnada 'izin yok' sonucunu kendisi üretir (AC-L9)."""
    global _default_loader
    if _default_loader is None:
        with _default_lock:
            if _default_loader is None:
                _default_loader = LimitsLoader()
    return _default_loader.get()
