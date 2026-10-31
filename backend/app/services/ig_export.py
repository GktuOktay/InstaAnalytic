"""
Instagram "Download your information" ZIP'inden takipçi / takip listesini okur.

Hiçbir ağ isteği yapmaz. ZIP diskten (ya da bellekten) açılmadan okunur; yalnızca followers/following
JSON üyeleri okunur, medya dosyalarına (fotoğraf/video) dokunulmaz — yüzlerce MB'lık paketler sorun olmaz.
Desteklenen düzen (JSON):
  followers_and_following/followers_1.json   -> [ {string_list_data:[{href,value,timestamp}]} ]
  followers_and_following/following.json     -> {"relationships_following": [ {title, string_list_data:[{href,timestamp}]} ]}
"""
from __future__ import annotations

import io
import json
import os
import re
import time
import zipfile
from dataclasses import dataclass, field
from typing import BinaryIO, Callable
from urllib.parse import urlparse

MAX_MEMBER_BYTES = 300 * 1024 * 1024     # tek JSON dosyası (açılmış) üst sınırı
MAX_TOTAL_BYTES = 800 * 1024 * 1024      # okunan toplam açılmış JSON boyutu (medya sayılmaz)
_PROGRESS_EVERY_S = 0.25

# progress(scanned_files, total_files, followers_found, following_found)
ProgressFn = Callable[[int, int, int, int], None]
_FOLLOWERS_RE = re.compile(r"(^|/)followers_\d+\.json$", re.I)
_FOLLOWING_RE = re.compile(r"(^|/)following\.json$", re.I)
_USERNAME_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")


class ExportError(ValueError):
    """Kullanıcıya gösterilebilir ayrıştırma hatası."""


@dataclass
class ExportEntry:
    username: str
    timestamp: int | None = None


@dataclass
class ExportData:
    followers: list[ExportEntry] = field(default_factory=list)
    following: list[ExportEntry] = field(default_factory=list)
    has_followers: bool = False
    has_following: bool = False


def _username_from(item: dict, entry: dict) -> str | None:
    cand = entry.get("value") or item.get("title")
    if not cand:
        href = entry.get("href") or ""
        path = [p for p in urlparse(href).path.split("/") if p]
        if path:
            cand = path[-1]
    if not cand:
        return None
    cand = str(cand).strip().lstrip("@")
    return cand if _USERNAME_RE.match(cand) else None


def _entries(items: list) -> list[ExportEntry]:
    out: dict[str, ExportEntry] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        for entry in item.get("string_list_data") or [{}]:
            if not isinstance(entry, dict):
                continue
            name = _username_from(item, entry)
            if not name:
                continue
            ts = entry.get("timestamp")
            out.setdefault(name.lower(), ExportEntry(name, int(ts) if isinstance(ts, (int, float)) else None))
    return list(out.values())


def _load_list(raw: bytes, key: str) -> list:
    data = json.loads(raw.decode("utf-8"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if key in data and isinstance(data[key], list):
            return data[key]
        for v in data.values():          # dil/sürüm farkı: tek liste değerli ilk anahtar
            if isinstance(v, list):
                return v
    raise ExportError("Beklenmeyen JSON yapısı")


def _is_threads(name: str) -> bool:
    """Threads uygulamasının takip listeleri (…/threads/following.json) Instagram'ınkiyle karışmasın."""
    return "/threads/" in "/" + name.lower()


def _classify(name: str) -> str | None:
    name = name.replace("\\", "/")
    if _is_threads(name):
        return None
    if _FOLLOWERS_RE.search(name):
        return "followers"
    if _FOLLOWING_RE.search(name):
        return "following"
    return None


def _add_json(result: ExportData, kind: str, name: str, raw: bytes) -> None:
    try:
        if kind == "followers":
            result.followers += _entries(_load_list(raw, "relationships_followers"))
            result.has_followers = True
        else:
            result.following += _entries(_load_list(raw, "relationships_following"))
            result.has_following = True
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ExportError(f"{name} JSON olarak okunamadı (HTML değil JSON formatı seçilmeli)")


def _collect_zip(source, result: ExportData, progress: ProgressFn | None, base: tuple[int, int] = (0, 0)) -> None:
    try:
        zf = zipfile.ZipFile(io.BytesIO(source) if isinstance(source, (bytes, bytearray)) else source)
    except zipfile.BadZipFile:
        raise ExportError("Geçerli bir ZIP dosyası değil")
    total = 0
    last_tick = 0.0
    with zf:
        infos = zf.infolist()
        n = len(infos)
        for i, info in enumerate(infos, 1):
            if progress and (time.monotonic() - last_tick >= _PROGRESS_EVERY_S or i == n):
                last_tick = time.monotonic()
                progress(base[0] + i, base[1] + n, len(result.followers), len(result.following))
            name = info.filename.replace("\\", "/")
            kind = None if info.is_dir() else _classify(name)
            if not kind:
                continue
            if info.file_size > MAX_MEMBER_BYTES:
                raise ExportError(f"{name} çok büyük")
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise ExportError("ZIP içeriği çok büyük")
            with zf.open(info) as fh:
                raw = fh.read(MAX_MEMBER_BYTES + 1)      # başlıktaki boyut yalan söyleyebilir
            if len(raw) > MAX_MEMBER_BYTES:
                raise ExportError(f"{name} çok büyük")
            _add_json(result, kind, name, raw)


def _finalize(result: ExportData) -> ExportData:
    if not (result.has_followers or result.has_following):
        raise ExportError(
            "followers_*.json / following.json bulunamadı. "
            "İndirirken format olarak JSON seçtiğinden ve “Takipçiler ve takip edilenler”i işaretlediğinden emin ol."
        )
    # Parçalı followers_N.json dosyaları aynı kullanıcıyı tekrarlamaz ama savunmacı ol
    for attr in ("followers", "following"):
        seen: dict[str, ExportEntry] = {}
        for e in getattr(result, attr):
            seen.setdefault(e.username.lower(), e)
        setattr(result, attr, list(seen.values()))
    return result


def parse_export_zip(source: "bytes | str | BinaryIO", progress: ProgressFn | None = None) -> ExportData:
    """source: ZIP baytları, dosya yolu ya da seekable dosya nesnesi."""
    result = ExportData()
    _collect_zip(source, result, progress)
    return _finalize(result)


def parse_export_inputs(inputs: "list[tuple[str, str]]", progress: ProgressFn | None = None) -> ExportData:
    """inputs: (özgün dosya adı, disk yolu). ZIP'ler (parçalı paketler dahil) ve tek tek JSON dosyaları karışık olabilir."""
    result = ExportData()
    done = 0
    for name, path in inputs:
        if name.lower().endswith(".json"):
            kind = _classify(name)
            if not kind:
                raise ExportError(
                    f"{os.path.basename(name)} tanınmadı. Beklenen adlar: followers_1.json, following.json "
                    "(Threads klasöründekiler sayılmaz)."
                )
            if os.path.getsize(path) > MAX_MEMBER_BYTES:
                raise ExportError(f"{name} çok büyük")
            with open(path, "rb") as fh:
                _add_json(result, kind, name, fh.read())
            done += 1
            if progress:
                progress(done, len(inputs), len(result.followers), len(result.following))
        else:
            _collect_zip(path, result, progress)
            done += 1
    return _finalize(result)
