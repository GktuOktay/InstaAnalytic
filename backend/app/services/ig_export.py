"""
Instagram "Download your information" ZIP'inden takipçi / takip listesini okur.

Hiçbir ağ isteği yapmaz; ZIP bellekte okunur, diske çıkarılmaz.
Desteklenen düzen (JSON):
  followers_and_following/followers_1.json   -> [ {string_list_data:[{href,value,timestamp}]} ]
  followers_and_following/following.json     -> {"relationships_following": [ {title, string_list_data:[{href,timestamp}]} ]}
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from urllib.parse import urlparse

MAX_MEMBER_BYTES = 50 * 1024 * 1024      # tek JSON dosyası (açılmış) üst sınırı
MAX_TOTAL_BYTES = 150 * 1024 * 1024      # okunan toplam açılmış boyut
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


def parse_export_zip(blob: bytes) -> ExportData:
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile:
        raise ExportError("Geçerli bir ZIP dosyası değil")

    result = ExportData()
    total = 0
    with zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            is_followers = bool(_FOLLOWERS_RE.search(name))
            is_following = bool(_FOLLOWING_RE.search(name))
            if not (is_followers or is_following) or info.is_dir():
                continue
            if info.file_size > MAX_MEMBER_BYTES:
                raise ExportError(f"{name} çok büyük")
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise ExportError("ZIP içeriği çok büyük")
            raw = zf.read(info)
            try:
                if is_followers:
                    result.followers += _entries(_load_list(raw, "relationships_followers"))
                    result.has_followers = True
                else:
                    result.following += _entries(_load_list(raw, "relationships_following"))
                    result.has_following = True
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise ExportError(f"{name} JSON olarak okunamadı (HTML değil JSON formatı seçilmeli)")

    if not (result.has_followers or result.has_following):
        raise ExportError(
            "ZIP içinde followers_*.json / following.json bulunamadı. "
            "İndirirken format olarak JSON seçtiğinden emin ol."
        )
    # Parçalı followers_N.json dosyaları aynı kullanıcıyı tekrarlamaz ama savunmacı ol
    for attr in ("followers", "following"):
        seen: dict[str, ExportEntry] = {}
        for e in getattr(result, attr):
            seen.setdefault(e.username.lower(), e)
        setattr(result, attr, list(seen.values()))
    return result
