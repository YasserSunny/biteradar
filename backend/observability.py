"""Request correlation and provider-call telemetry without content logging."""
import json
import time
from contextvars import ContextVar
from contextlib import contextmanager
from typing import Optional

from logger import get_logger

_request_id: ContextVar[str] = ContextVar("request_id", default="-")
logger = get_logger("provider")


def set_request_id(value: str):
    return _request_id.set(value)


def reset_request_id(token) -> None:
    _request_id.reset(token)


def get_request_id() -> str:
    return _request_id.get()


def status_category(status: Optional[int], error: Optional[BaseException] = None) -> str:
    if error:
        is_timeout = (
            isinstance(error, TimeoutError)
            or "timeout" in type(error).__name__.lower()
            or "timed out" in str(error).lower()
        )
        return "timeout" if is_timeout else "error"
    if status is None:
        return "ok"
    if status == 429:
        return "quota"
    if status in (401, 403):
        return "auth"
    if status >= 500:
        return "provider_error"
    if status >= 400:
        return "request_error"
    return "ok"


def provider_event(
    provider: str,
    operation: str,
    started_at: float,
    *,
    status: Optional[int] = None,
    error: Optional[BaseException] = None,
) -> None:
    event = {
        "event": "provider_call",
        "provider": provider,
        "operation": operation,
        "duration_ms": round((time.perf_counter() - started_at) * 1000, 1),
        "status": status,
        "category": status_category(status, error),
        "timeout": bool(error and (
            "timeout" in type(error).__name__.lower()
            or "timed out" in str(error).lower()
        )),
        "quota_response": status == 429,
        "request_id": get_request_id(),
    }
    logger.info(json.dumps(event, separators=(",", ":"), sort_keys=True))


@contextmanager
def provider_call(provider: str, operation: str):
    started_at = time.perf_counter()
    try:
        yield
    except Exception as error:
        provider_event(provider, operation, started_at, error=error)
        raise
    else:
        provider_event(provider, operation, started_at)


def timed_http_call(provider: str, operation: str, request_method, *args, **kwargs):
    """Run an HTTP call and emit metadata only; response bodies are never logged."""
    started_at = time.perf_counter()
    try:
        response = request_method(*args, **kwargs)
    except Exception as error:
        provider_event(provider, operation, started_at, error=error)
        raise
    provider_event(provider, operation, started_at, status=response.status_code)
    return response
