from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.api.v1.router import api_router
from app.core.clock import clinic_now
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="UT Scheduler API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    def root() -> str:
        return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>UT Scheduler API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; color: #0f172a; }
    h1 { font-size: 1.35rem; margin-bottom: 0.35rem; }
    p { color: #64748b; margin-top: 0; }
    ul { line-height: 1.8; padding-left: 1.2rem; }
    a { color: #0f4c81; }
  </style>
</head>
<body>
  <h1>UT Scheduler API</h1>
  <p>Backend is running. Useful links:</p>
  <ul>
    <li><a href="/health">/health</a> — liveness check</li>
    <li><a href="/docs">/docs</a> — interactive OpenAPI docs</li>
    <li><a href="/redoc">/redoc</a> — ReDoc reference</li>
    <li><code>/api/v1/…</code> — application routes</li>
  </ul>
</body>
</html>"""

    @app.get("/health")
    def health() -> dict[str, str]:
        # Clinic vs UTC is reported so a host-timezone mismatch is visible
        # without redeploying a probe.
        return {
            "status": "ok",
            "clinic_timezone": settings.clinic_timezone,
            "clinic_time": clinic_now().isoformat(),
            "utc_time": datetime.now(UTC).isoformat(),
        }

    return app


app = create_app()
