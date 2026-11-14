import re

from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.auth import EarlyTokenGate, require_api_token
from app.routers import health, sessions, analysis, tasks, actions, posts, users, graph, proxy, report, imports, privacy, insights, ghosts, bridge, notifications, cleanup
from app.services.cleanup_scan import CleanupError

app = FastAPI(title="InstaAnalytic API", version="1.0.0")

_CLEANUP_PATH = re.compile(r"^/api/(sessions/[^/]+/)?cleanup(/|$)")
_FIELD = re.compile(r"^[a-z_][a-z0-9_]{0,39}$")


@app.exception_handler(CleanupError)
async def _cleanup_error(request: Request, exc: CleanupError):
    """§7.9.1: {"detail": {"code", "fields"?, "reason"?, "next_allowed_at"?, "retry_after"?}}; girdi yansımaz."""
    headers = {"Retry-After": str(int(exc.extra["retry_after"]))} if exc.status == 429 and "retry_after" in exc.extra else None
    return JSONResponse({"detail": {"code": exc.code, **exc.extra}}, status_code=exc.status, headers=headers)


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError):
    """AC-C41: yalnız /cleanup yollarında `code='invalid'` + `fields` (yalnız bilinen alan adları, değer yok);
    diğer router'ların biçimi değişmez."""
    if not _CLEANUP_PATH.match(request.url.path):
        return await request_validation_exception_handler(request, exc)
    names: list[str] = []
    for e in exc.errors():
        if e.get("type") == "extra_forbidden":
            continue                                     # bilinmeyen alan adı istemci girdisidir; yansıtılmaz
        strs = [p for p in e.get("loc", ()) if isinstance(p, str)]
        n = strs[-1] if strs else "body"
        if _FIELD.match(n) or n == "body":
            if n not in names:
                names.append(n)
    return JSONResponse({"detail": {"code": "invalid", "fields": (names or ["body"])[:10]}}, status_code=422)


app.add_middleware(EarlyTokenGate)   # önce eklenen içte kalır; CORS dışta (401'e de CORS başlığı, OPTIONS ön uçuş)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://127.0.0.1:3002"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-API-Token"],
)

app.include_router(health.router, prefix="/api")
app.include_router(sessions.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(analysis.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(tasks.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(actions.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(posts.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(users.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(graph.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(proxy.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(report.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(imports.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(privacy.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(insights.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(ghosts.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(bridge.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(notifications.router, prefix="/api", dependencies=[Depends(require_api_token)])
app.include_router(cleanup.router, prefix="/api", dependencies=[Depends(require_api_token)])
