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
