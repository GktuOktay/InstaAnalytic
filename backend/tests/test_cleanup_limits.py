"""SPEC-001 T-2b: ek iş sınırları yükleyicisi (cleanup_limits). DB gerektirmez, gerçek bekleme yoktur (sahte saat)."""
import hashlib
import importlib.util
import logging
import math
import os
import tomllib
from pathlib import Path

import pytest

from app.services import cleanup_limits as cl
from app.services import risk_profiles as rp

BACKEND = Path(__file__).resolve().parents[1]
EXAMPLE = BACKEND / "config" / "limits.example.toml"
REPO = Path(os.environ.get("IA_REPO_ROOT") or BACKEND.parent)  # konteynerde repo kökü yok -> ilgili testler atlanır


class Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


def toml_text(overrides=None, version=1, extra=""):
    """DEFAULTS üzerine overrides (düz anahtar -> değer) uygulayıp TOML üretir. Değer TOML'a ham yazılır."""
    flat = {k: repr(v).lower() if isinstance(v, bool) else repr(v) for k, v in cl.DEFAULTS.items()}
    for k, v in (overrides or {}).items():
        flat[k] = v if k == "version" else _lit(v)
    tree = {}
    for k, v in flat.items():
        parts = k.split(".")
        d = tree
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = v
    lines = [] if version is None else [f"version = {version}"]

    def emit(prefix, node):
        leaves = {k: v for k, v in node.items() if not isinstance(v, dict)}
        if prefix and leaves:
            lines.append(f"[{'.'.join(prefix)}]")
        for k, v in leaves.items():
            lines.append(f"{k} = {v}")
        for k, v in node.items():
            if isinstance(v, dict):
                emit(prefix + [k], v)

    emit([], tree)
    return "\n".join(lines) + "\n" + extra


def _lit(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        if math.isnan(v):
            return "nan"
        if math.isinf(v):
            return "inf" if v > 0 else "-inf"
    if isinstance(v, str):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return repr(v)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def lim_file(tmp_path):
    return tmp_path / "limits.toml"


def make(path, clock):
    return cl.LimitsLoader(path, clock=clock)


def load(lim_file, clock, text):
    lim_file.write_text(text, encoding="utf-8")
    return make(lim_file, clock).get()


def w(lim, key):
    return [x for x in lim.warnings if x.key == key]


# ── L1 ────────────────────────────────────────────────────────────────────────
def test_file_values_used_and_reload_within_30s(lim_file, clock):
    lim_file.write_text(toml_text({"profiles.safe.unsave.hourly": 30}))
    loader = make(lim_file, clock)
    first = loader.get()
    assert first.source == "file" and first.values["profiles.safe.unsave.hourly"] == 30
    lim_file.write_text(toml_text({"profiles.safe.unsave.hourly": 25}))
    clock.t += 29
    assert loader.get() is first                      # 30 sn dolmadan okumaz
    clock.t += 1
    assert loader.get().values["profiles.safe.unsave.hourly"] == 25
    assert cl.DEFAULTS["profiles.safe.unsave.hourly"] == 40


# ── L2 ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("key,given,used", [
    ("profiles.safe.unsave.hourly", 120, 80),
    ("batch.max_items", 900, 500),
    ("profiles.safe.unsave.delay_min", 3, 10),
    ("profiles.safe.unsave.hourly", 0, 1),
    ("profiles.safe.unsave.hourly", -5, 1),
])
def test_clamp_above_and_below_caps_logs_warning(lim_file, clock, caplog, key, given, used):
    with caplog.at_level(logging.INFO, logger="cleanup_limits"):
        lim = load(lim_file, clock, toml_text({key: given}))
    assert lim.values[key] == used
    ws = w(lim, key)
    assert [x.code for x in ws] == ["clamped"] and ws[0].value == given and ws[0].used == used
    assert any(r.levelno == logging.WARNING and key in r.getMessage() and "clamped" in r.getMessage()
               for r in caplog.records)


def test_reads_cap_clamped_to_240(lim_file, clock):
    assert load(lim_file, clock, toml_text({"reads.status_per_hour": 10 ** 6})).values["reads.status_per_hour"] == 240


# ── L3 ────────────────────────────────────────────────────────────────────────
def test_invalid_unknown_missing_keys(lim_file, clock):
    text = toml_text({
        "profiles.safe.unsave.hourly": "40",             # string
        "profiles.balanced.unsave.hourly": True,         # bool tamsayı sayılmaz
        "profiles.aggressive.unsave.hourly": 40.5,       # tamsayı anahtara kesir
        "batch.max_items": float("nan"),
        "scan.max_per_hour": float("inf"),
        "ramp.first_fraction": True,
    }, extra="[mystery]\nfoo = 1\n")
    lim = load(lim_file, clock, text)
    for k in ("profiles.safe.unsave.hourly", "profiles.balanced.unsave.hourly", "profiles.aggressive.unsave.hourly",
              "batch.max_items", "scan.max_per_hour", "ramp.first_fraction"):
        assert [x.code for x in w(lim, k)] == ["invalid"], k
        assert lim.values[k] == cl.DEFAULTS[k], k
    assert [x.code for x in w(lim, "mystery.foo")] == ["unknown"]
    assert "mystery.foo" not in lim.values

    # eksik anahtar: varsayılan + 'missing'
    lim2 = load(lim_file, clock, "version = 1\n[account]\nhourly = 50\n")
    assert lim2.values["account.hourly"] == 50
    assert lim2.values["account.daily"] == cl.DEFAULTS["account.daily"]
    assert [x.code for x in w(lim2, "account.daily")] == ["missing"]
    assert lim2.source == "file"


# ── L4 ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("kind,code", [
    ("missing", "file_missing"), ("broken", "file_invalid"), ("noversion", "version_unsupported"),
    ("v2", "version_unsupported"), ("vbool", "version_unsupported"), ("unreadable", "file_unreadable"),
])
def test_missing_broken_version_unreadable_use_defaults(lim_file, clock, kind, code):
    if kind == "broken":
        lim_file.write_text("version = 1\n[account\nhourly = ")
    elif kind == "noversion":
        lim_file.write_text(toml_text({"account.hourly": 10}, version=None))
    elif kind == "v2":
        lim_file.write_text(toml_text({"account.hourly": 10}, version=2))
    elif kind == "vbool":
        lim_file.write_text(toml_text({"account.hourly": 10}, version="true"))
    elif kind == "unreadable":
        lim_file.mkdir()                                  # okunamayan yol (kök kullanıcıda chmod işe yaramaz)
    lim = make(lim_file, clock).get()
    assert lim.source == "defaults" and lim.code == code
    assert dict(lim.values) == dict(cl.DEFAULTS)


def test_recovers_after_fix(lim_file, clock):
    loader = make(lim_file, clock)
    assert loader.get().source == "defaults"
    lim_file.write_text(toml_text({"account.hourly": 10}))
    clock.t += 30
    lim = loader.get()
    assert lim.source == "file" and lim.code is None and lim.values["account.hourly"] == 10


def test_loader_internal_exception_falls_back_to_defaults(lim_file, clock, monkeypatch):
    lim_file.write_text(toml_text())

    def boom(*a, **k):
        raise RuntimeError("boom")
    monkeypatch.setattr(cl, "_evaluate", boom)
    lim = make(lim_file, clock).get()
    assert lim.source == "defaults" and lim.code == "file_invalid"
    assert dict(lim.values) == dict(cl.DEFAULTS)


# ── L7 ────────────────────────────────────────────────────────────────────────
def test_example_file_equals_defaults(clock):
    tree = tomllib.loads(EXAMPLE.read_text(encoding="utf-8"))
    assert tree == {"version": 1, **cl.defaults_tree()}
    lim = make(EXAMPLE, clock).get()
    assert lim.source == "file" and lim.warnings == () and dict(lim.values) == dict(cl.DEFAULTS)


def test_gitignore_has_limits_toml():
    gi = REPO / ".gitignore"
    if not gi.exists():
        pytest.skip("repo kökü bu ortamda yok (konteyner)")
    lines = [ln.strip() for ln in gi.read_text().splitlines()]
    assert "backend/config/limits.toml" in lines
    assert "backend/config/limits.example.toml" not in lines


def test_init_env_copies_example_only_when_absent(tmp_path):
    script = REPO / "scripts" / "init_env.py"
    if not script.exists():
        pytest.skip("repo kökü bu ortamda yok (konteyner)")
    spec = importlib.util.spec_from_file_location("init_env_under_test", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    (tmp_path / "limits.example.toml").write_text("version = 1\n# örnek\n")
    assert mod.ensure_limits_file(tmp_path) is True
    assert (tmp_path / "limits.toml").read_text() == "version = 1\n# örnek\n"
    (tmp_path / "limits.toml").write_text("version = 1\n# kullanıcı\n")
    assert mod.ensure_limits_file(tmp_path) is False   # varsa dokunmaz
    assert (tmp_path / "limits.toml").read_text() == "version = 1\n# kullanıcı\n"
    assert mod.ensure_limits_file(tmp_path / "yok") is False


# ── L8 ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("over,expect", [
    # unsave hourly/daily (spec örneği): hourly=60,daily=30 -> daily 30, hourly 30
    ({"profiles.safe.unsave.hourly": 60, "profiles.safe.unsave.daily": 30},
     {"profiles.safe.unsave.daily": 30, "profiles.safe.unsave.hourly": 30}),
    # delay (spec örneği): 50/20 -> 50/55
    ({"profiles.safe.unsave.delay_min": 50, "profiles.safe.unsave.delay_max": 20},
     {"profiles.safe.unsave.delay_min": 50, "profiles.safe.unsave.delay_max": 55}),
    # delay_min varsayılandan küçük: min=max(12,20)=20, max=max(14,45,25)=45
    ({"profiles.safe.unsave.delay_min": 12, "profiles.safe.unsave.delay_max": 14},
     {"profiles.safe.unsave.delay_min": 20, "profiles.safe.unsave.delay_max": 45}),
    # account hourly > daily
    ({"account.hourly": 70, "account.daily": 50}, {"account.daily": 50, "account.hourly": 50}),
    # ramp fraction (spec örneği)
    ({"ramp.first_fraction": 0.9, "ramp.second_fraction": 0.5},
     {"ramp.first_fraction": 0.333, "ramp.second_fraction": 0.5}),
    # ramp hours: first=max(100,72)=100, second=min(720,max(50,168,100))=168
    ({"ramp.first_hours": 100, "ramp.second_hours": 50}, {"ramp.first_hours": 100, "ramp.second_hours": 168}),
    # scan delay: min=max(10,3)=10, max=min(120,max(5,6,11))=11
    ({"scan.page_delay_min": 10, "scan.page_delay_max": 5}, {"scan.page_delay_min": 10, "scan.page_delay_max": 11}),
])
def test_validation_order_and_relational_never_loosens(lim_file, clock, over, expect):
    lim = load(lim_file, clock, toml_text(over))
    for k, v in expect.items():
        assert lim.values[k] == pytest.approx(v), k
        assert "relational" in [x.code for x in w(lim, k)], k
    # hiçbir anahtar hem dosyadan hem varsayılandan gevşek olamaz (kısıtlayıcı yön)
    for k, v in lim.values.items():
        if k in over and isinstance(over[k], (int, float)) and k.endswith(("hourly", "daily", "fraction", "max_items")):
            assert v <= max(over[k], cl.DEFAULTS[k]) + 1e-9


def test_validation_order_clamp_before_relational(lim_file, clock):
    # hourly=500 önce 80'e kırpılır, sonra daily(30) ile çift çözümü: hourly=min(80,40,30)=30
    lim = load(lim_file, clock, toml_text({"profiles.safe.unsave.hourly": 500, "profiles.safe.unsave.daily": 30}))
    assert lim.values["profiles.safe.unsave.hourly"] == 30 and lim.values["profiles.safe.unsave.daily"] == 30
    # tip önce: geçersiz (string) hourly varsayılana düşer, sonra çift kuralı varsayılanla çalışır
    lim = load(lim_file, clock, toml_text({"profiles.safe.unsave.hourly": "x", "profiles.safe.unsave.daily": 20}))
    assert lim.values["profiles.safe.unsave.hourly"] == 20


# ── L9 (yükleyici kısmı) ───────────────────────────────────────────────────────
HOSTILE = [float("nan"), float("inf"), float("-inf"), True, False, 10 ** 18, -(10 ** 18), -5, 0, 10 ** 400, "9", 1e308]


def _numeric_cap_keys():
    return [k for k in cl.DEFAULTS if k != "ramp.enabled"]


@pytest.mark.parametrize("bad", HOSTILE, ids=lambda v: repr(v)[:20])
def test_nan_inf_bool_huge_negative_never_exceed_caps(lim_file, clock, bad):
    for key in _numeric_cap_keys():
        lim = load(lim_file, clock, toml_text({key: bad}))
        lo, hi = cl.hard_cap(key)
        v = lim.values[key]
        assert not isinstance(v, bool) and math.isfinite(v), key
        assert lo <= v <= hi, (key, bad, v)
    lim = load(lim_file, clock, toml_text(dict.fromkeys(_numeric_cap_keys(), bad)))
    for key in _numeric_cap_keys():
        lo, hi = cl.hard_cap(key)
        assert lo <= lim.values[key] <= hi, (key, bad)


def test_hard_caps_are_code_constants_not_file_keys(lim_file, clock):
    assert cl.HARD_CAPS["profiles.*.unsave.hourly"] == (1, 80)
    assert cl.HARD_CAPS["scan.page_delay_max"] == (3, 120)
    lim = load(lim_file, clock, toml_text(extra="[hard_caps]\nbatch = 9999\n"))
    assert [x.code for x in w(lim, "hard_caps.batch")] == ["unknown"]
    assert lim.values["batch.max_items"] == 500


# ── L10 ───────────────────────────────────────────────────────────────────────
def test_unknown_key_with_newline_not_logged_raw(lim_file, clock, caplog):
    text = toml_text().replace("[account]\n", '[account]\n"evil\\nINJECTED fake log line" = 1\ngood_name = 2\n"UPPER" = 3\n', 1)
    with caplog.at_level(logging.DEBUG, logger="cleanup_limits"):
        lim = load(lim_file, clock, text)
    keys = sorted(x.key for x in lim.warnings if x.code == "unknown")
    assert keys == ["<invalid>", "<invalid>", "account.good_name"]
    blob = "\n".join(r.getMessage() for r in caplog.records) + repr(lim.warnings)
    assert "INJECTED" not in blob and "evil" not in blob and "UPPER" not in blob
    assert all("\n" not in r.getMessage() for r in caplog.records)


def test_string_values_never_logged_or_reported(lim_file, clock, caplog):
    with caplog.at_level(logging.DEBUG, logger="cleanup_limits"):
        lim = load(lim_file, clock, toml_text({"account.hourly": "TOP-SECRET-STRING"}))
    blob = "\n".join(r.getMessage() for r in caplog.records) + repr(lim.warnings)
    assert "TOP-SECRET-STRING" not in blob
    assert w(lim, "account.hourly")[0].value is None      # sonlu sayı değilse değer taşınmaz


# ── L11 ───────────────────────────────────────────────────────────────────────
def test_reload_logs_hash_and_changed_keys(lim_file, clock, caplog):
    lim_file.write_text(toml_text())
    loader = make(lim_file, clock)
    with caplog.at_level(logging.INFO, logger="cleanup_limits"):
        a = loader.get()
        caplog.clear()
        body = toml_text({"profiles.safe.unsave.hourly": 30, "account.daily": 300})
        lim_file.write_text(body)
        clock.t += 30
        b = loader.get()
    sha = hashlib.sha256(body.encode()).hexdigest()
    assert b.sha256 == sha and a.sha256 != sha
    msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    assert any(f"cleanup_limits reloaded sha256={sha[:12]} changed=[account.daily,profiles.safe.unsave.hourly]" in m
               for m in msgs), msgs
    # değişmeyen içerik: log yok, changed_at sabit, loaded_at ilerler
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="cleanup_limits"):
        clock.t += 30
        c = loader.get()
    assert not [r for r in caplog.records if "reloaded" in r.getMessage()]
    assert c.changed_at == b.changed_at and c.loaded_at == clock.t and b.loaded_at == clock.t - 30
    assert c.sha256 == b.sha256


def test_same_size_same_mtime_change_detected(lim_file, clock):
    lim_file.write_text(toml_text({"account.hourly": 41}))
    st = lim_file.stat()
    loader = make(lim_file, clock)
    assert loader.get().values["account.hourly"] == 41
    lim_file.write_text(toml_text({"account.hourly": 42}))     # aynı boyut
    os.utime(lim_file, ns=(st.st_atime_ns, st.st_mtime_ns))    # aynı mtime
    assert lim_file.stat().st_size == st.st_size and lim_file.stat().st_mtime_ns == st.st_mtime_ns
    clock.t += 30
    assert loader.get().values["account.hourly"] == 42


def test_changed_lists_only_known_keys(lim_file, clock, caplog):
    lim_file.write_text(toml_text())
    loader = make(lim_file, clock)
    loader.get()
    caplog.clear()
    text = toml_text({"account.hourly": 70}).replace("[account]\n", '[account]\n"bad\\nkey" = 1\nzz = 2\n', 1)
    lim_file.write_text(text)
    clock.t += 30
    loader.get()                                            # account.hourly değişti (bilinen anahtar)
    lim_file.write_text(text.replace("zz = 2", "zz = 3"))  # yalnız bilinmeyen anahtarın değeri değişti
    clock.t += 30
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="cleanup_limits"):
        loader.get()
    reloaded = [r.getMessage() for r in caplog.records if "reloaded" in r.getMessage()]
    assert len(reloaded) == 1
    assert "changed=[]" in reloaded[0] and "unknown=2" in reloaded[0]
    assert "zz" not in reloaded[0] and "bad" not in reloaded[0]


def test_cache_is_immutable_and_replaced_atomically(lim_file, clock):
    lim_file.write_text(toml_text())
    loader = make(lim_file, clock)
    a = loader.get()
    with pytest.raises(TypeError):
        a.values["account.hourly"] = 1000
    with pytest.raises(Exception):
        a.source = "x"
    lim_file.write_text(toml_text({"account.hourly": 10}))
    clock.t += 30
    b = loader.get()
    assert b is not a and a.values["account.hourly"] == 80 and b.values["account.hourly"] == 10


# ── L12 ───────────────────────────────────────────────────────────────────────
def test_path_resolution_and_loaded_at(tmp_path, clock):
    root = tmp_path / "app"
    (root / "config").mkdir(parents=True)
    abs_file = tmp_path / "elsewhere.toml"
    assert cl.resolve_path(str(abs_file), backend_root=root) == abs_file
    assert cl.resolve_path("config/x.toml", backend_root=root) == root / "config" / "x.toml"
    assert cl.resolve_path("", backend_root=root) == root / "config" / "limits.toml"
    # varsayılan: <backend kökü>/config/limits.toml (modül kökü = backend)
    assert cl.resolve_path("", backend_root=None) == BACKEND / "config" / "limits.toml"
    # göreli, mutlak yol API'ye çıkmaz (I-4)
    assert cl.display_path(root / "config" / "limits.toml", backend_root=root) == "config/limits.toml"
    assert not Path(cl.display_path(abs_file, backend_root=root)).is_absolute()
    # loaded_at: son okuma denemesi (dosya yoksa da)
    loader = cl.LimitsLoader(root / "config" / "limits.toml", clock=clock)
    a = loader.get()
    assert a.source == "defaults" and a.loaded_at == clock.t
    clock.t += 31
    assert loader.get().loaded_at == clock.t


def test_env_var_name_is_cleanup_limits_file():
    from app.core.config import Settings
    assert "cleanup_limits_file" in Settings.model_fields


# ── L13 ───────────────────────────────────────────────────────────────────────
def test_profile_names_from_risk_profiles(lim_file, clock, monkeypatch):
    assert cl.QUIET_HOURS is rp.QUIET_HOURS and cl.in_quiet_hours is rp.in_quiet_hours
    assert {k.split(".")[1] for k in cl.DEFAULTS if k.startswith("profiles.")} == set(rp.PROFILES)
    # bölümü olmayan profil varsayılanları alır
    lim = load(lim_file, clock, "version = 1\n[profiles.safe.unsave]\nhourly = 30\n")
    assert lim.values["profiles.safe.unsave.hourly"] == 30
    assert lim.values["profiles.balanced.unsave.hourly"] == cl.DEFAULTS["profiles.balanced.unsave.hourly"]
    # bilinmeyen profil -> unknown
    lim = load(lim_file, clock, toml_text(extra="[profiles.ghost.unsave]\nhourly = 1\n"))
    assert [x.code for x in w(lim, "profiles.ghost")] == ["unknown"]
    assert not any(k.startswith("profiles.ghost") for k in lim.values)
    # PROFILES'a yeni ad eklenirse tanınır (adlar koda gömülü değil)
    monkeypatch.setitem(rp.PROFILES, "custom", rp.PROFILES["safe"])
    lim = load(lim_file, clock, "version = 1\n[profiles.custom.unsave]\nhourly = 7\n")
    assert lim.values["profiles.custom.unsave.hourly"] == 7 and not w(lim, "profiles.custom")


def test_ramp_disabled_is_accepted_with_warning(lim_file, clock):
    lim = load(lim_file, clock, toml_text({"ramp.enabled": False}))
    assert lim.values["ramp.enabled"] is False and lim.source == "file"
    assert "ramp_disabled" in [x.code for x in lim.warnings]
