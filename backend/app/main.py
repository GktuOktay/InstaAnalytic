from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.auth import require_api_token
from app.routers import health, sessions, analysis, tasks, actions, posts, users, graph, proxy, report, imports, privacy, insights, ghosts

app = FastAPI(title="InstaAnalytic API", version="1.0.0")

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
