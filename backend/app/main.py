import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import admin, public
from app.core.config import settings
from app.core.exceptions import register_exception_handlers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("app.request")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Saffron & Smoke — Restaurant Ordering API",
        version="1.0.0",
        description="REST API for the restaurant ordering and management system.",
        openapi_url="/api/v1/openapi.json",
        docs_url="/docs",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        start = time.perf_counter()
        response = await call_next(request)
        duration = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        if not request.url.path.startswith("/media"):
            logger.info(
                "rid=%s %s %s -> %s (%.1f ms)",
                request_id,
                request.method,
                request.url.path,
                response.status_code,
                duration,
            )
        return response

    register_exception_handlers(app)
    app.include_router(public.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")

    media = Path(settings.MEDIA_DIR)
    media.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media), name="media")
    return app


app = create_app()
