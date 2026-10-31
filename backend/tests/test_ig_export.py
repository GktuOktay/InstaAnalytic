import io
import json
import zipfile

import pytest

from app.services.ig_export import ExportError, parse_export_zip


def _zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, content in files.items():
            z.writestr(name, json.dumps(content) if not isinstance(content, (bytes, str)) else content)
    return buf.getvalue()


FOLLOWERS = [{"title": "", "media_list_data": [], "string_list_data": [
    {"href": "https://www.instagram.com/alice", "value": "alice", "timestamp": 1700000000}]}]
FOLLOWING = {"relationships_following": [{"title": "bob", "string_list_data": [
    {"href": "https://www.instagram.com/_u/bob", "timestamp": 1700000001}]}]}


def test_parses_both_files_and_nested_paths():
    data = parse_export_zip(_zip({
        "connections/followers_and_following/followers_1.json": FOLLOWERS,
        "connections/followers_and_following/following.json": FOLLOWING,
    }))
    assert [e.username for e in data.followers] == ["alice"]
    assert data.followers[0].timestamp == 1700000000
    assert [e.username for e in data.following] == ["bob"]
    assert data.has_followers and data.has_following


def test_username_falls_back_to_href_and_dedupes_across_parts():
    part = [{"string_list_data": [{"href": "https://www.instagram.com/_u/carol"}]}]
    data = parse_export_zip(_zip({"followers_1.json": part, "followers_2.json": part}))
    assert [e.username for e in data.followers] == ["carol"]
    assert not data.has_following


def test_only_one_file_is_ok():
    data = parse_export_zip(_zip({"following.json": FOLLOWING}))
    assert data.has_following and not data.has_followers


def test_rejects_non_zip_html_and_missing():
    with pytest.raises(ExportError):
        parse_export_zip(b"not a zip")
    with pytest.raises(ExportError):
        parse_export_zip(_zip({"readme.txt": "x"}))
    with pytest.raises(ExportError):
        parse_export_zip(_zip({"followers_1.json": "<html></html>"}))


def test_ignores_invalid_usernames():
    bad = [{"string_list_data": [{"value": "../etc/passwd"}, {"value": "ok_name"}]}]
    data = parse_export_zip(_zip({"followers_1.json": bad}))
    assert [e.username for e in data.followers] == ["ok_name"]


def test_reads_from_disk_skips_media_and_reports_progress(tmp_path):
    path = tmp_path / "big.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
        z.writestr("connections/followers_and_following/followers_1.json", json.dumps(FOLLOWERS))
        for i in range(300):
            z.writestr(f"media/posts/p{i}.jpg", b"\0" * 4096)      # medya okunmamalı
    ticks: list[tuple] = []
    data = parse_export_zip(str(path), progress=lambda *a: ticks.append(a))
    assert [e.username for e in data.followers] == ["alice"]
    assert ticks and ticks[-1][:2] == (301, 301) and ticks[-1][2] == 1       # son adım: tümü tarandı, 1 takipçi
    scanned = [t[0] for t in ticks]
    assert scanned == sorted(scanned)


def test_member_size_is_enforced_on_real_bytes(monkeypatch):
    from app.services import ig_export
    monkeypatch.setattr(ig_export, "MAX_MEMBER_BYTES", 100)
    with pytest.raises(ExportError):
        parse_export_zip(_zip({"followers_1.json": json.dumps(FOLLOWERS * 5)}))


def test_threads_lists_are_not_mixed_into_instagram(tmp_path):
    data = parse_export_zip(_zip({
        "connections/followers_and_following/following.json": FOLLOWING,
        "your_instagram_activity/threads/following.json": {"text_post_app_text_post_app_following": [
            {"string_list_data": [{"value": "threads_only", "timestamp": 1}]}]},
    }))
    assert [e.username for e in data.following] == ["bob"]


def test_mixed_inputs_zip_parts_and_loose_json(tmp_path):
    from app.services.ig_export import parse_export_inputs
    z = tmp_path / "part1.zip"
    z.write_bytes(_zip({"connections/followers_and_following/followers_1.json": FOLLOWERS}))
    f = tmp_path / "x"
    f.write_text(json.dumps(FOLLOWING))
    data = parse_export_inputs([("part1.zip", str(z)), ("following.json", str(f))])
    assert [e.username for e in data.followers] == ["alice"] and [e.username for e in data.following] == ["bob"]
    bad = tmp_path / "y"
    bad.write_text("[]")
    with pytest.raises(ExportError):
        parse_export_inputs([("messages.json", str(bad))])
