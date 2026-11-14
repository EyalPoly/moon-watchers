from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.models import ErrorCode, Problem


class ApiError(Exception):
    def __init__(self, status: int, code: ErrorCode, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.code: ErrorCode = code
        self.detail = detail


def problem_response(status: int, title: str, code: ErrorCode, detail: str | None) -> JSONResponse:
    problem = Problem(type="about:blank", title=title, status=status, code=code, detail=detail)
    return JSONResponse(
        problem.model_dump(), status_code=status, media_type="application/problem+json"
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return problem_response(exc.status, exc.code, exc.code, exc.detail)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return problem_response(exc.status_code, "Request failed", "INVALID_PARAM", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return problem_response(422, "Invalid parameter", "INVALID_PARAM", str(exc.errors()))
