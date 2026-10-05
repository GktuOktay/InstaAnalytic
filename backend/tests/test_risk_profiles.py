from app.services.risk_profiles import DEFAULT_PROFILE, PROFILES, get_profile


def test_default_and_unknown_fall_back_to_balanced():
    assert get_profile(None).key == DEFAULT_PROFILE == "balanced"
    assert get_profile("nope").key == "balanced"


def test_profiles_are_ordered_by_aggressiveness():
    s, b, a = (PROFILES[k] for k in ("safe", "balanced", "aggressive"))
    assert s.scan.pages_per_hour < b.scan.pages_per_hour < a.scan.pages_per_hour
    assert s.scan.pages_per_day < b.scan.pages_per_day < a.scan.pages_per_day
    assert s.action_daily < b.action_daily < a.action_daily
    assert s.action_delay_min > b.action_delay_min > a.action_delay_min
    assert s.scan.cooldown_tiers[0] > b.scan.cooldown_tiers[0] > a.scan.cooldown_tiers[0]


def test_public_view_has_no_secrets_and_is_serializable():
    import json
    for p in PROFILES.values():
        d = p.public()
        json.dumps(d)
        assert d["key"] == p.key and d["scan_delay"][0] < d["scan_delay"][1]
