from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, sessions, analysis, tasks, actions, posts, users, graph, proxy, report

app = FastAPI(title="Instapp API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(actions.router, prefix="/api")
app.include_router(posts.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(proxy.router, prefix="/api")
app.include_router(report.router, prefix="/api")
