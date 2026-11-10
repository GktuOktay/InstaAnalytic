"""SPEC-001 §7.8 istek gövdeleri (`extra='forbid'`, sıkı tipler). İç doğrulama ve sıralama servis katmanındadır;
buradaki modeller yalnız şekli ve tipi denetler. Hata gövdesi girdi yansıtmaz (main.py işleyicisi)."""
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

_VERSION = r"^\d{1,4}(\.\d{1,4}){0,3}$"
_ID = r"^\d{1,25}$"
_STRICT = ConfigDict(extra="forbid", strict=True)
BIGINT = 2**63 - 1


class SettingsPut(BaseModel):
    model_config = _STRICT
    saved_enabled: bool
    ack_irreversible: bool | None = None
    dm_enabled: Any = None          # AC-C1: verilirse 422 not_available (router)
    rules: Any = None


class ScanStartIn(BaseModel):
    model_config = _STRICT
    viewer_id: str = Field(pattern=_ID)
    ext_version: str | None = Field(default=None, pattern=_VERSION)     # eksik -> 409 extension_outdated (AC-C37)


class ScanPageIn(BaseModel):
    model_config = _STRICT
    viewer_id: str = Field(pattern=_ID)
    page_no: int
    items: list[Any]


class ScanCollectionsIn(BaseModel):
    """`viewer_id` dışındaki alanlar servise ham gider (doğrulama sırası: kapalı/hak 409, sonra 422)."""
    model_config = _STRICT
    viewer_id: str = Field(pattern=_ID)
    available: Any = None
    collections: Any = None
    note_code: Any = None


class ScanFinishIn(BaseModel):
    model_config = _STRICT
    viewer_id: str = Field(pattern=_ID)
    outcome: Literal["ok", "partial", "failed", "blocked"]
    note_code: str | None = Field(default=None, pattern=r"^[a-z_]{1,30}$")
    http_status: int | None = Field(default=None, ge=100, le=599)
    fields: list[str] | None = Field(default=None, max_length=10)


class ConfirmIn(BaseModel):
    model_config = _STRICT
    confirm_count: int


class StartIn(BaseModel):
    model_config = _STRICT
    ext_version: str | None = Field(default=None, pattern=_VERSION)


class EmptyIn(BaseModel):
    model_config = _STRICT


class NextIn(BaseModel):
    model_config = _STRICT
    batch_id: int = Field(ge=1, le=BIGINT)
    run_seq: int
    viewer_id: str = Field(pattern=_ID)
    ext_version: str | None = Field(default=None, pattern=_VERSION)
    limit: int = 10


class PrecheckIn(BaseModel):
    model_config = _STRICT
    viewer_id: str = Field(pattern=_ID)
    ext_version: str | None = Field(default=None, pattern=_VERSION)
    run_seq: int
    collection_ids: list[str]


class ResultIn(BaseModel):
    model_config = _STRICT
    viewer_id: str = Field(pattern=_ID)
    run_seq: int
    outcome: str
    note_code: str | None = None
    http_status: int | None = None
    fields: list[str] | None = None


class CollectionProtectIn(BaseModel):
    model_config = _STRICT
    protected: bool
    ack_shared_risk: bool | None = None
