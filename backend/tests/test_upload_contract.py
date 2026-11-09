"""SPEC-002 PB-4: yükleme sözleşmesi (POST /api/sessions/{id}/import/zip) karakterizasyonu.

Redis iş durumu fakeredis'tir (gerçek Redis'e dokunmaz); veritabanı izole instaanalytic_pytest.
"""
import asyncio
import glob
import io
import json
import os
import tempfile
import zipfile

import fakeredis
import pytest

from app.routers import imports
from app.services import import_jobs

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _fake_job_redis(monkeypatch):
    server = fakeredis.FakeServer()
    monkeypatch.setattr(import_jobs, "_r", lambda: fakeredis.FakeRedis(server=server, decode_responses=True))


def _followers(names):
    return json.dumps([{"string_list_data": [{"value": n, "timestamp": 1700000000}]} for n in names])


def _following(names):
    return json.dumps({"relationships_following": [
        {"title": n, "string_list_data": [{"href": f"https://www.instagram.com/{n}", "timestamp": 1700000000}]} for n in names]})


def _zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, body in files.items():
            z.writestr(name, body)
    return buf.getvalue()


def _tmp_files():
    return set(glob.glob(os.path.join(tempfile.gettempdir(), "igimp_*")))


async def _wait(client, sid, job_id):
    job = None
    for _ in range(100):
        job = (await client.get(f"/api/sessions/{sid}/import/jobs/{job_id}")).json()
        if job["stage"] in ("done", "error"):
            break
        await asyncio.sleep(0.1)
    return job


async def test_pb4a_zip_plus_two_json_in_one_request(client, make_session):
    s = await make_session()
    z = _zip({"connections/followers_and_following/followers_1.json": _followers(["zip_a", "zip_b"])})
    files = [
        ("files", ("export.zip", z, "application/zip")),
        ("files", ("followers_2.json", _followers(["loose_c"]).encode(), "application/json")),
        ("files", ("following.json", _following(["zip_a", "other_d"]).encode(), "application/json")),
    ]
    r = await client.post(f"/api/sessions/{s.id}/import/zip", files=files)
    assert r.status_code == 202
    job = await _wait(client, s.id, r.json()["job_id"])
    assert job["stage"] == "done", job
    assert job["followers_found"] == 3 and job["following_found"] == 2
    assert job["scanned"] == job["total"] == 3


async def test_pb4b_no_files_is_422(client, make_session):
    s = await make_session()
    assert (await client.post(f"/api/sessions/{s.id}/import/zip")).status_code == 422


async def test_pb4c_51_files_is_422(client, make_session):
    s = await make_session()
    files = [("files", (f"followers_{i}.json", b"[]", "application/json")) for i in range(51)]
    assert (await client.post(f"/api/sessions/{s.id}/import/zip", files=files)).status_code == 422


async def test_pb4d_over_limit_is_413_and_temp_files_removed(client, make_session, monkeypatch):
    s = await make_session()
    monkeypatch.setattr(imports, "MAX_UPLOAD_BYTES", 100)
    before = _tmp_files()
    files = [("files", ("followers_1.json", b"x" * 60, "application/json")),
             ("files", ("followers_2.json", b"y" * 60, "application/json"))]
    r = await client.post(f"/api/sessions/{s.id}/import/zip", files=files)
    assert r.status_code == 413
    assert _tmp_files() <= before          # bu istekten kalan igimp_* dosyası yok
    assert (await client.get(f"/api/sessions/{s.id}/import/active")).json() == {"job_id": None}


async def test_pb4e_path_traversal_filename_is_reduced_to_basename(client, make_session, monkeypatch):
    s = await make_session()
    seen = []

    def fake_start(session_id, job_id, inputs):
        seen.extend(inputs)
        for _, p in inputs:
            os.unlink(p)

    monkeypatch.setattr(import_jobs, "start", fake_start)
    r = await client.post(f"/api/sessions/{s.id}/import/zip",
                          files=[("files", ("../../x.json", b"[]", "application/json"))])
    assert r.status_code == 202
    assert [name for name, _ in seen] == ["x.json"]


async def test_pb4f_unauthenticated_upload_is_401(client, make_session):
    s = await make_session()
    r = await client.post(f"/api/sessions/{s.id}/import/zip", headers={"X-API-Token": ""},
                          files=[("files", ("followers_1.json", b"[]", "application/json"))])
    assert r.status_code == 401
