import pytest

from app.routers.privacy import _csv_response, _safe


@pytest.mark.parametrize("raw,expected", [
    ("=cmd|' /C calc'!A0", "'=cmd|' /C calc'!A0"),
    ("+1+1", "'+1+1"),
    ("-2", "'-2"),
    ("@SUM(A1)", "'@SUM(A1)"),
    ("normal_user", "normal_user"),
    (None, ""),
    (5, "5"),
])
def test_formula_injection_is_neutralised(raw, expected):
    assert _safe(raw) == expected


def test_csv_has_bom_for_excel_and_escapes_cells():
    r = _csv_response("x.csv", ["a"], [["=evil"]])
    assert r.body.startswith(b"\xef\xbb\xbf")
    assert b"'=evil" in r.body
