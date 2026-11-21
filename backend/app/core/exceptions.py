import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app")


class DomainError(Exception):
    """Base class for business-rule errors. Services raise these; handlers turn them into the error envelope."""

    status_code = 400
    code = "BAD_REQUEST"
    default_message = "The request could not be processed."

    def __init__(self, message: str | None = None, *, code: str | None = None, details: dict | None = None):
        self.message = message or self.default_message
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(self.message)


class BadRequest(DomainError):
    status_code = 400


class Unauthorized(DomainError):
    status_code = 401
    code = "NOT_AUTHENTICATED"
    default_message = "Authentication is required."


class Forbidden(DomainError):
    status_code = 403
    code = "FORBIDDEN"
    default_message = "You do not have permission to perform this action."


class NotFound(DomainError):
    status_code = 404
    code = "NOT_FOUND"
    default_message = "The requested resource was not found."


class Conflict(DomainError):
    status_code = 409
    code = "CONFLICT"


class Unprocessable(DomainError):
    status_code = 422
    code = "VALIDATION_ERROR"


def error_body(code: str, message: str, details: dict | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header")]
    return ".".join(parts) or "request"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError):
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = []
        for err in exc.errors():
            msg = err.get("msg", "Invalid value")
            if msg.startswith("Value error, "):
                msg = msg[len("Value error, ") :]
            fields.append({"field": _field_name(tuple(err.get("loc", ()))), "message": msg})
        is_quantity = any(f["field"].endswith("quantity") for f in fields)
        code = "INVALID_QUANTITY" if is_quantity else "VALIDATION_ERROR"
        message = fields[0]["message"] if len(fields) == 1 else "Some fields are invalid."
        return JSONResponse(status_code=422, content=error_body(code, message, {"fields": fields}))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {401: "NOT_AUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(
            exc.status_code, "HTTP_ERROR"
        )
        return JSONResponse(status_code=exc.status_code, content=error_body(code, str(exc.detail)))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500, content=error_body("INTERNAL_ERROR", "An unexpected error occurred. Please try again.")
        )
